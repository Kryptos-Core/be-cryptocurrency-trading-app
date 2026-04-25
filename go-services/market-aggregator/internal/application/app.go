package application

import (
    "context"
    "log"

    "github.com/kryptos/go-services/market-aggregator/internal/infrastructure/config"
)

type App struct {
    cfg config.Config
}

func New(cfg config.Config) *App {
    return &App{cfg: cfg}
}

func (a *App) Run(ctx context.Context) error {
    log.Printf("market-aggregator booted: mode=%s kafka=%v", a.cfg.Mode, a.cfg.KafkaBrokers)
    <-ctx.Done()
    return nil
}
