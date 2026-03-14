SHELL := /usr/bin/env bash

PNPM ?= pnpm
DIST_TARGETS ?= linux-x64 macos-x64

.DEFAULT_GOAL := help

.PHONY: help install test clean clean-cache dist

help:
	@printf '%s\n' \
	  'Targets:' \
	  '  make install    Install project dependencies with pnpm' \
	  '  make test       Run the Vitest suite' \
	  '  make clean      Remove generated release artifacts' \
	  '  make clean-cache Remove cached Node dist artifacts' \
	  '  make dist       Build standalone executables in releases/' \
	  '' \
	  'Variables:' \
	  '  DIST_TARGETS    Space- or comma-separated targets (default: linux-x64 macos-x64)' \
	  '                  Supported values: linux-x64 macos-x64 macos-arm64' \
	  '  DIST_CACHE_DIR  Override the persistent download cache directory'

install:
	CI=true $(PNPM) install --frozen-lockfile

test:
	$(PNPM) test

clean:
	find releases -mindepth 1 ! -name '.gitignore' -delete
	rm -rf dist

clean-cache:
	@cache_dir="$${DIST_CACHE_DIR:-$${XDG_CACHE_HOME:-$$HOME/.cache}/cflmd/dist}"; \
	rm -rf "$$cache_dir"

dist: install
	DIST_TARGETS='$(DIST_TARGETS)' node scripts/build-dist.mjs
