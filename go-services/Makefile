# Makefile for Go Services
# Usage: make <target> SERVICE=<service-name>
# Example: make test SERVICE=matching-engine

.PHONY: help build test lint vet fmt clean docker-build docker-push docker-lint-diff docker-up docker-down docker-logs

SERVICES := market-aggregator matching-engine public-ws-gateway

# All services
all: build

# Build all services
build:
	@for svc in $(SERVICES); do \
		echo "Building $$svc..."; \
		cd $$svc && go build -trimpath -ldflags="-s -w" ./cmd/$$svc && cd ..; \
	done

# Build a specific service (SERVICE=...)
build-one:
	@echo "Building $(SERVICE)..."
	@cd $(SERVICE) && go build -trimpath -ldflags="-s -w" ./cmd/$(SERVICE)

# Run tests for all services
test:
	@for svc in $(SERVICES); do \
		echo "Testing $$svc..."; \
		$(MAKE) test-one SERVICE=$$svc || exit 1; \
	done

# Test a specific service
test-one:
	@echo "Testing $(SERVICE)..."
	@cd $(SERVICE) && go test -v -count=1 ./...

# Test with coverage
test-cover:
	@echo "Testing $(SERVICE) with coverage..."
	@cd $(SERVICE) && go test -v -count=1 -coverprofile=coverage.out ./... && \
		go tool cover -func=coverage.out && \
		go tool cover -html=coverage.out -o coverage.html

# Test with race detector
test-race:
	@cd $(SERVICE) && go test -race -v -count=1 ./...

# Run vet on all services
vet:
	@for svc in $(SERVICES); do \
		echo "Vetting $$svc..."; \
		cd $$svc && go vet ./... && cd ..; \
	done

# Format code
fmt:
	@for svc in $(SERVICES); do \
		echo "Formatting $$svc..."; \
		cd $$svc && go fmt ./... && cd ..; \
	done

# Tidy dependencies
tidy:
	@for svc in $(SERVICES); do \
		echo "Tidying $$svc..."; \
		cd $$svc && go mod tidy && cd ..; \
	done

# Run goimports (install first: go install golang.org/x/tools/cmd/goimports@latest)
imports:
	@for svc in $(SERVICES); do \
		find $$svc -name '*.go' -not -path '*/vendor/*' | xargs goimports -w; \
	done

# Lint with staticcheck (install first: go install honnef.co/tools/cmd/staticcheck@latest)
staticcheck:
	@for svc in $(SERVICES); do \
		echo "Static checking $$svc..."; \
		cd $$svc && staticcheck ./... && cd ..; \
	done

# Run golangci-lint (install first: curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin)
golangci-lint:
	@for svc in $(SERVICES); do \
		echo "Linting $$svc..."; \
		golangci-lint run ./... && cd ..; \
	done

# Docker build all services
docker-build:
	@for svc in $(SERVICES); do \
		echo "Docker building $$svc..."; \
		docker build -t crypto-trading-$$svc:latest ./$$svc; \
	done

# Docker build specific service
docker-build-one:
	docker build -t crypto-trading-$(SERVICE):latest ./$(SERVICE)

# Docker push (requires docker login)
docker-push:
	@for svc in $(SERVICES); do \
		docker push crypto-trading-$$svc:latest; \
	done

# Run all services locally (for development)
run-dev:
	@echo "Starting all Go services in dev mode..."
	@for svc in $(SERVICES); do \
		port=8080; \
		if [ "$$svc" = "matching-engine" ]; then port=8081; fi; \
		if [ "$$svc" = "public-ws-gateway" ]; then port=8082; fi; \
		(cd $$svc && go run ./cmd/$$svc &); \
		(echo "Started $$svc on :$$port"); \
	done

# Run a specific service locally
run-one:
	@port=8080; \
	if [ "$(SERVICE)" = "matching-engine" ]; then port=8081; fi; \
	if [ "$(SERVICE)" = "public-ws-gateway" ]; then port=8082; fi; \
	(echo "Running $(SERVICE) on :$$port..."); \
	cd $(SERVICE) && HTTP_ADDR=:$$port go run ./cmd/$(SERVICE)

# Clean build artifacts
clean:
	@for svc in $(SERVICES); do \
		echo "Cleaning $$svc..."; \
		cd $$svc && rm -f coverage.out coverage.html && go clean && cd ..; \
	done

# Docker Compose targets (works on Windows, Linux, macOS)
# NOTE: Run from go-services/ directory

docker-up:
	@echo "Starting infrastructure + services with Docker Compose..."
	@cd .. && docker compose -f docker-compose.yml up -d --profile services

docker-up-infra:
	@echo "Starting infrastructure only..."
	@cd .. && docker compose -f docker-compose.infrastructure.yml up -d

docker-up-one:
	@echo "Starting $(SERVICE) with Docker Compose..."
	@cd .. && docker compose -f docker-compose.yml up -d --profile services $(SERVICE)

docker-down:
	@echo "Stopping all services..."
	@cd .. && docker compose -f docker-compose.yml down

docker-logs:
	@cd .. && docker compose -f docker-compose.yml logs -f $(SERVICE)

docker-logs-all:
	@cd .. && docker compose -f docker-compose.yml logs -f

docker-restart:
	@echo "Restarting $(SERVICE)..."
	@cd .. && docker compose -f docker-compose.yml restart $(SERVICE)

docker-rebuild:
	@echo "Rebuilding $(SERVICE)..."
	@cd .. && docker compose -f docker-compose.yml up -d --build $(SERVICE)

# Docker cleanup
docker-clean:
	@docker rmi $$(docker images 'crypto-trading-*' -q) 2>/dev/null || true

# Dependency check
deps-check:
	@for svc in $(SERVICES); do \
		echo "Checking deps for $$svc..."; \
		cd $$svc && go mod verify && cd ..; \
	done

# All: tidy, vet, test
ci: tidy vet test

# Help
help:
	@echo "Go Services Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  build              - Build all services"
	@echo "  build-one         - Build specific service (SERVICE=<name>)"
	@echo "  test              - Test all services"
	@echo "  test-one          - Test specific service (SERVICE=<name>)"
	@echo "  test-cover        - Test with coverage (SERVICE=<name>)"
	@echo "  test-race         - Test with race detector (SERVICE=<name>)"
	@echo "  vet               - Run go vet on all services"
	@echo "  fmt               - Format code with go fmt"
	@echo "  tidy              - Tidy dependencies for all services"
	@echo "  lint              - Run all linters (needs staticcheck, golangci-lint installed)"
	@echo "  docker-build      - Build all Docker images"
	@echo "  docker-build-one  - Build specific Docker image (SERVICE=<name>)"
	@echo "  docker-up         - Docker Compose: Start infra + services (RECOMMENDED)"
	@echo "  docker-up-infra   - Docker Compose: Start infrastructure only"
	@echo "  docker-up-one     - Docker Compose: Start specific service (SERVICE=<name>)"
	@echo "  docker-down       - Docker Compose: Stop all services"
	@echo "  docker-logs       - Docker Compose: View logs (SERVICE=<name>)"
	@echo "  docker-logs-all   - Docker Compose: View all logs"
	@echo "  docker-restart    - Docker Compose: Restart service (SERVICE=<name>)"
	@echo "  docker-rebuild    - Docker Compose: Rebuild service (SERVICE=<name>)"
	@echo "  clean             - Clean build artifacts"
	@echo "  ci                - CI pipeline (tidy + vet + test)"
	@echo ""
	@echo "Examples:"
	@echo "  make build-one SERVICE=matching-engine"
	@echo "  make test-one SERVICE=matching-engine"
	@echo "  make docker-build-one SERVICE=market-aggregator"
	@echo "  make docker-up           # Start everything with Docker"
	@echo "  make docker-logs SERVICE=market-aggregator  # View logs"
