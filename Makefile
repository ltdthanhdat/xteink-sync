BUN ?= bun
BUN_FALLBACK := $(HOME)/.bun/bin/bun
BUN_CMD := $(shell if command -v $(BUN) >/dev/null 2>&1; then command -v $(BUN); elif [ -x "$(BUN_FALLBACK)" ]; then printf '%s\n' "$(BUN_FALLBACK)"; else printf '%s\n' "$(BUN)"; fi)

.PHONY: help check-bun run build test

help:
	@printf '%s\n' \
		'make build  - compile TypeScript with Bun' \
		'make run    - start the TUI with Bun' \
		'make test   - run tests with Bun'

check-bun:
	@[ -x "$(BUN_CMD)" ] || command -v "$(BUN_CMD)" >/dev/null 2>&1 || { \
		printf '%s\n' 'Bun is required for this project but was not found.'; \
		printf '%s\n' 'Expected `bun` in PATH or at ~/.bun/bin/bun.'; \
		exit 127; \
	}

run: check-bun
	$(BUN_CMD) run src/index.tsx

build: check-bun
	$(BUN_CMD) run build

test: check-bun
	$(BUN_CMD) test src
