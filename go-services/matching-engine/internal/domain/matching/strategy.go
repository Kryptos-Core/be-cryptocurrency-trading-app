package matching

import (
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/kryptos/go-services/matching-engine/internal/domain"
	"github.com/kryptos/go-services/matching-engine/internal/domain/orderbook"
)

var (
	ErrInsufficientLiquidity = errors.New("insufficient liquidity")
	ErrSelfTrade            = errors.New("self-trade prevention")
	ErrPriceDeviation       = errors.New("price deviation exceeds tolerance")
	ErrFOKNotFillable       = errors.New("FOK order could not be fully filled")
	ErrNilTaker              = errors.New("taker order is nil")
	ErrNilBook                = errors.New("order book is nil")
)

type fill struct {
	maker      *domain.Order
	price      *big.Int
	amount     *big.Int
	makerFee   *big.Int
	takerFee   *big.Int
	makerIndex int
}

type MatchingStrategy struct {
	slippageTolerance *big.Int
}

func NewMatchingStrategy(tolerancePercent float64) *MatchingStrategy {
	if tolerancePercent <= 0 {
		return &MatchingStrategy{
			slippageTolerance: nil,
		}
	}

	toleranceBasisPoints := int64(tolerancePercent * 10000)
	slippageTolerance := new(big.Int).SetInt64(toleranceBasisPoints)

	return &MatchingStrategy{
		slippageTolerance: slippageTolerance,
	}
}

func (s *MatchingStrategy) Match(taker *domain.Order, book *orderbook.OrderBook) ([]domain.Trade, *big.Int, error) {
	if taker == nil {
		return nil, nil, ErrNilTaker
	}
	if book == nil {
		return nil, nil, ErrNilBook
	}

	takerRemaining := new(big.Int).Set(&taker.Remaining)

	if takerRemaining.Sign() <= 0 {
		return nil, takerRemaining, nil
	}

	takerRemaining = new(big.Int).Set(&taker.Remaining)

	switch taker.TIF {
	case domain.TIFFOK:
		return s.matchFOK(taker, takerRemaining, book)
	case domain.TIFIOC:
		return s.matchIOC(taker, takerRemaining, book)
	case domain.TIFGTC:
		fallthrough
	default:
		return s.matchGTC(taker, takerRemaining, book)
	}
}

func (s *MatchingStrategy) matchGTC(taker *domain.Order, takerRemaining *big.Int, book *orderbook.OrderBook) ([]domain.Trade, *big.Int, error) {
	var fills []*fill
	var trades []domain.Trade

	var firstFillPrice *big.Int
	isMarketTaker := taker.IsMarket()

	for {
		var opposingOrders []*domain.Order

		if taker.IsBuy() {
			opposingOrders = book.GetSellOrders()
		} else {
			opposingOrders = book.GetBuyOrders()
		}

		matched := false

		for _, maker := range opposingOrders {
			if takerRemaining.Sign() <= 0 {
				break
			}

			if maker.UserID == taker.UserID {
				continue
			}

			if maker.IsFilled() || maker.Status == domain.StatusCancelled {
				continue
			}

			fillAmount := new(big.Int)
			if takerRemaining.Cmp(&maker.Remaining) < 0 {
				fillAmount.Set(takerRemaining)
			} else {
				fillAmount.Set(&maker.Remaining)
			}

			if fillAmount.Sign() <= 0 {
				continue
			}

			if isMarketTaker && s.slippageTolerance != nil {
				if firstFillPrice == nil {
					firstFillPrice = new(big.Int).Set(maker.Price)
				} else {
					priceDeviation := new(big.Int).Abs(new(big.Int).Sub(maker.Price, firstFillPrice))
					maxDeviation := new(big.Int).Mul(firstFillPrice, s.slippageTolerance)
					if priceDeviation.Cmp(maxDeviation) > 0 {
						return nil, nil, fmt.Errorf("%w: price deviated from %s to %s", ErrPriceDeviation, firstFillPrice.String(), maker.Price.String())
					}
				}
			}

			f := &fill{
				maker:      maker,
				price:      new(big.Int).Set(maker.Price),
				amount:     fillAmount,
				makerFee:   big.NewInt(0),
				takerFee:   big.NewInt(0),
				makerIndex: -1,
			}
			fills = append(fills, f)

			takerRemaining.Sub(takerRemaining, fillAmount)
			matched = true
		}

		if !matched {
			break
		}
	}

	for _, f := range fills {
		trade := domain.NewTrade(
			generateTradeID(),
			taker.PairID,
			f.maker.UserID,
			taker.UserID,
			f.maker.OrderID,
			taker.OrderID,
			f.price,
			f.amount,
			f.makerFee,
			f.takerFee,
		)
		trades = append(trades, *trade)

		f.maker.Fill(f.amount)
	}

	return trades, takerRemaining, nil
}

func (s *MatchingStrategy) matchIOC(taker *domain.Order, takerRemaining *big.Int, book *orderbook.OrderBook) ([]domain.Trade, *big.Int, error) {
	trades, _, err := s.matchGTC(taker, takerRemaining, book)
	return trades, big.NewInt(0), err
}

func (s *MatchingStrategy) matchFOK(taker *domain.Order, takerRemaining *big.Int, book *orderbook.OrderBook) ([]domain.Trade, *big.Int, error) {
	var opposingOrders []*domain.Order

	if taker.IsBuy() {
		opposingOrders = book.GetSellOrders()
	} else {
		opposingOrders = book.GetBuyOrders()
	}

	totalFillable := new(big.Int)

	for _, maker := range opposingOrders {
		if taker.UserID == maker.UserID {
			continue
		}

		if maker.IsFilled() || maker.Status == domain.StatusCancelled {
			continue
		}

		totalFillable.Add(totalFillable, &maker.Remaining)

		if totalFillable.Cmp(takerRemaining) >= 0 {
			trades, _, err := s.matchGTC(taker, takerRemaining, book)
			return trades, big.NewInt(0), err
		}
	}

	return nil, takerRemaining, ErrFOKNotFillable
}

func (s *MatchingStrategy) canFullyFill(fills []*fill, takerRemaining *big.Int) bool {
	if len(fills) == 0 {
		return false
	}

	totalFilled := new(big.Int)
	for _, f := range fills {
		totalFilled.Add(totalFilled, f.amount)
	}

	return takerRemaining.Cmp(totalFilled) == 0 || takerRemaining.Sign() == 0
}

func generateTradeID() string {
	return time.Now().UTC().Format("20060102150405.000000")
}
