package persistence

import "errors"

var (
	ErrOrderNotFound       = errors.New("order not found")
	ErrWalletNotFound      = errors.New("wallet not found")
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrNegativeBalance     = errors.New("balance would go negative")
	ErrDuplicateTrade      = errors.New("duplicate trade")
	ErrLockTimeout         = errors.New("could not acquire lock")
)
