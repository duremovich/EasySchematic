# Automatic hostname detection
DETECTED_HOST := $(shell hostname)
HOST ?= $(DETECTED_HOST)
USERNAME := $(USER)

# Shell
SHELL := /bin/bash

# Enable better error handling
.ONESHELL:
.SHELLFLAGS := -e -u -o pipefail -c

# Default target
.DEFAULT_GOAL := help

.PHONY: help install dev build lint test test-watch build-docker build-docker-clean

help: ## Show this help message
	@echo "Available targets:"
	@fgrep -h "##" $(MAKEFILE_LIST) | grep -v fgrep | sed -e 's/\([^:]*\):[^#]*##\(.*\)/  \1|\2/' | column -t -s '|'

install: ## Install dependencies
	npm install
dev: ## Start the development server
	npm run dev
build: ## Build the project
	npm run build
lint: ## Run linting
	npm run lint
test: ## Run tests
	npm run test
test-watch: ## Run tests in watch mode
	npm run test:watch
build-docker: ## Build the Docker image
	docker compose build
build-docker-clean:
	docker compose build --no-cache --pull
up: ## Start the Docker container
	docker compose up -d
down: ## Stop the Docker container
	docker compose down
restart: ## Restart the Docker container
	docker compose restart
logs: ## Show the logs of the Docker container
	docker compose logs -f
logs-tail: ## Show the logs of the Docker container in tail mode
	docker compose logs -f