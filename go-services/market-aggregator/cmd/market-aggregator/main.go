package main

import (
    "context"
    "log"

    "github.com/kryptos/go-services/market-aggregator/internal/app"
)

func main() {
    cfg := app.LoadConfig("market-aggregator", "8080")
    if err := app.New(cfg).Run(context.Background()); err != nil {
        log.Fatal(err)
    }
}
