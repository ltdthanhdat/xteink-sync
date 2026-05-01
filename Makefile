BUN ?= bun

.PHONY: run build test

run:
	$(BUN) run src/index.tsx

build:
	$(BUN) run build

test:
	$(BUN) test src
