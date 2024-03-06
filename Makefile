DEFAULT_GOAL := up
VERSION := $(shell git describe --tags --always --long |sed -e "s/^v//")
GO_LINT_VERSION := v1.53.3

.PHONY: generate internal/statics proto

init: submodules clean proto

install: ## Install the web dependencies
	yarn install

dev: ## Run the local dev server
	yarn dev

build-dist: ## Build dist version
	yarn build

proto:
	buf generate

clean:
	rm -rf dist
	rm -rf src/api/proto-http/*

submodules:
	git submodule update --init --recursive