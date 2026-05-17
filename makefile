.DEFAULT_GOAL := help

.PHONY: help build build-clean up down restart logs dev dev-detach dev-down dev-logs dev-update

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

build: ## Build the Docker image
	docker compose build

build-clean: ## Build with no cache
	docker compose build --no-cache --pull

up: ## Start the container
	docker compose up -d

down: ## Stop the container
	docker compose down

restart: ## Restart the container
	docker compose restart

logs: ## Tail container logs
	docker compose logs -f

dev: ## Clone/pull repo and start Vite dev server
	docker compose -f compose.yml -f compose.dev.yml up

dev-detach: ## Clone/pull repo and start Vite dev server in background
	docker compose -f compose.yml -f compose.dev.yml up -d

dev-down: ## Stop the Vite dev server
	docker compose -f compose.yml -f compose.dev.yml down

dev-logs: ## Tail dev server logs
	docker compose -f compose.yml -f compose.dev.yml logs -f

dev-update: ## Force re-pull latest code and restart
	docker compose -f compose.yml -f compose.dev.yml restart
