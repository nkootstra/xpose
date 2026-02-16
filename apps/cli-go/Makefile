.PHONY: build test lint run clean

VERSION ?= dev
COMMIT  ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
DATE    ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS  = -s -w \
  -X github.com/nkootstra/xpose/internal/version.Version=$(VERSION) \
  -X github.com/nkootstra/xpose/internal/version.Commit=$(COMMIT) \
  -X github.com/nkootstra/xpose/internal/version.Date=$(DATE)

build:
	go build -ldflags "$(LDFLAGS)" -o bin/xpose .

test:
	go test -v -race ./...

lint:
	golangci-lint run

run: build
	./bin/xpose $(ARGS)

clean:
	rm -rf bin/
