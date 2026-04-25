package config

import "os"

type Config struct {
    Mode         string
    KafkaBrokers []string
}

func Load() Config {
    mode := os.Getenv("TICKER_SOURCE")
    if mode == "" {
        mode = "nestjs"
    }

    return Config{
        Mode:         mode,
        KafkaBrokers: splitCSV(os.Getenv("KAFKA_BROKERS")),
    }
}

func splitCSV(v string) []string {
    if v == "" {
        return nil
    }

    parts := []string{}
    current := ""
    for _, c := range v {
        if c == ',' {
            if current != "" {
                parts = append(parts, current)
            }
            current = ""
            continue
        }
        current += string(c)
    }
    if current != "" {
        parts = append(parts, current)
    }
    return parts
}
