package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "syscall"

    "github.com/kryptos/go-services/market-aggregator/internal/application"
    "github.com/kryptos/go-services/market-aggregator/internal/infrastructure/config"
)

func main() {
    cfg := config.Load()
    app := application.New(cfg)

    ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer cancel()

    if err := app.Run(ctx); err != nil {
        log.Fatalf("market-aggregator exited with error: %v", err)
    }

    <-ctx.Done()
    os.Exit(0)
}
