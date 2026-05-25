package main

import (
    "context"
    "log"

    "github.com/kryptos/go-services/public-ws-gateway/internal/app"
)

func main() {
    cfg := app.LoadConfig("public-ws-gateway", "8082")
    if err := app.New(cfg).Run(context.Background()); err != nil {
        log.Fatal(err)
    }
}
