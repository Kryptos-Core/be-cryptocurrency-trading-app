# syntax=docker/dockerfile:1

FROM golang:1.23-alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates git tzdata

COPY metrics/go.mod ../metrics/go.mod
COPY matching-engine/go.mod ./
RUN go mod download

COPY metrics ../metrics
COPY matching-engine .
RUN go mod tidy -e

ARG SERVICE_NAME=matching-engine
ARG BUILD_VERSION=dev
ARG BUILD_COMMIT=unknown

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -trimpath \
    -ldflags="-s -w -X main.buildVersion=${BUILD_VERSION} -X main.buildCommit=${BUILD_COMMIT}" \
    -o /out/matching-engine \
    ./cmd/matching-engine

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=builder /out/matching-engine /app/matching-engine
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

USER nonroot:nonroot

EXPOSE 8080

ENTRYPOINT ["/app/matching-engine"]
