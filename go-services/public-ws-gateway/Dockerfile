# syntax=docker/dockerfile:1

FROM golang:1.23-alpine AS builder

WORKDIR /src

RUN apk add --no-cache ca-certificates git tzdata

COPY metrics/go.mod ../metrics/go.mod
COPY public-ws-gateway/go.mod ./
RUN go mod download

COPY metrics ../metrics
COPY public-ws-gateway .
RUN go mod tidy -e

ARG SERVICE_NAME=public-ws-gateway
ARG BUILD_VERSION=dev
ARG BUILD_COMMIT=unknown

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -trimpath \
    -ldflags="-s -w -X main.buildVersion=${BUILD_VERSION} -X main.buildCommit=${BUILD_COMMIT}" \
    -o /out/public-ws-gateway \
    ./cmd/public-ws-gateway

FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=builder /out/public-ws-gateway /app/public-ws-gateway
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

USER nonroot:nonroot

EXPOSE 8080

ENTRYPOINT ["/app/public-ws-gateway"]
