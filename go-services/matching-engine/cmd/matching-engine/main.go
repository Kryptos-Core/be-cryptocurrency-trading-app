package main

import (
    "context"
    "log"

    "github.com/kryptos/go-services/matching-engine/internal/app"
)

func main() {
    cfg := app.LoadConfig("matching-engine", "8081")
    if err := app.New(cfg).Run(context.Background()); err != nil {
        log.Fatal(err)
    }
}
