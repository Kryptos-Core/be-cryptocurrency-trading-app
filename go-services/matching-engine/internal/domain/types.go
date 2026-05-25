package domain

import (
	"math/big"
	"time"
)

const (
	PricePrecision  = 18
	AmountPrecision = 18
)

type Side string

const (
	SideBuy  Side = "BUY"
	SideSell Side = "SELL"
)

func (s Side) IsValid() bool {
	return s == SideBuy || s == SideSell
}

type OrderType string

const (
	OrderTypeLimit  OrderType = "LIMIT"
	OrderTypeMarket OrderType = "MARKET"
)

func (ot OrderType) IsValid() bool {
	return ot == OrderTypeLimit || ot == OrderTypeMarket
}

type Status string

const (
	StatusOpen     Status = "OPEN"
	StatusPartial  Status = "PARTIAL"
	StatusFilled   Status = "FILLED"
	StatusCancelled Status = "CANCELLED"
	StatusRejected  Status = "REJECTED"
)

type TIF string

const (
	TIFGTC TIF = "GTC"
	TIFIOC TIF = "IOC"
	TIFFOK TIF = "FOK"
)

func (t TIF) IsValid() bool {
	return t == TIFGTC || t == TIFIOC || t == TIFFOK
}

type Order struct {
	OrderID           string
	PairID            string
	UserID            string
	Side              Side
	Type              OrderType
	Price             *big.Int
	Amount            big.Int
	FilledAmount      big.Int
	Remaining         big.Int
	Status            Status
	TIF               TIF
	CreatedAt         time.Time
	SlippageTolerance *big.Int
}

func NewOrder(
	orderID, pairID, userID string,
	side Side,
	orderType OrderType,
	price *big.Int,
	amount big.Int,
	tif TIF,
) *Order {
	remaining := new(big.Int).Set(&amount)
	return &Order{
		OrderID:      orderID,
		PairID:       pairID,
		UserID:       userID,
		Side:         side,
		Type:         orderType,
		Price:        price,
		Amount:       amount,
		FilledAmount: *big.NewInt(0),
		Remaining:    *remaining,
		Status:       StatusOpen,
		TIF:          tif,
		CreatedAt:    time.Now().UTC(),
	}
}

func (o *Order) Fill(quantity *big.Int) {
	o.FilledAmount.Add(&o.FilledAmount, quantity)
	o.Remaining.Sub(&o.Amount, &o.FilledAmount)

	if o.Remaining.Sign() == 0 {
		o.Status = StatusFilled
	} else {
		o.Status = StatusPartial
	}
}

func (o *Order) IsFilled() bool {
	return o.Status == StatusFilled
}

func (o *Order) IsMarket() bool {
	return o.Type == OrderTypeMarket
}

func (o *Order) IsBuy() bool {
	return o.Side == SideBuy
}

func (o *Order) GetPrice() *big.Int {
	if o.Price == nil {
		return nil
	}
	return new(big.Int).Set(o.Price)
}

type Trade struct {
	TradeID   string
	PairID    string
	MakerID   string
	TakerID   string
	MakerOID  string
	TakerOID  string
	Price     big.Int
	Amount    big.Int
	MakerFee  big.Int
	TakerFee  big.Int
	CreatedAt time.Time
}

func NewTrade(
	tradeID, pairID string,
	makerID, takerID string,
	makerOID, takerOID string,
	price, amount *big.Int,
	makerFee, takerFee *big.Int,
) *Trade {
	return &Trade{
		TradeID:   tradeID,
		PairID:    pairID,
		MakerID:   makerID,
		TakerID:   takerID,
		MakerOID:  makerOID,
		TakerOID:  takerOID,
		Price:     *new(big.Int).Set(price),
		Amount:    *new(big.Int).Set(amount),
		MakerFee:  *new(big.Int).Set(makerFee),
		TakerFee:  *new(big.Int).Set(takerFee),
		CreatedAt: time.Now().UTC(),
	}
}

type PriceLevel struct {
	Price  *big.Int
	Amount *big.Int
	Count  int
}

func NewPriceLevel(price, amount *big.Int, count int) PriceLevel {
	return PriceLevel{
		Price:  new(big.Int).Set(price),
		Amount: new(big.Int).Set(amount),
		Count:  count,
	}
}
