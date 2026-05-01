BUN ?= bun

.PHONY: run build test install uninstall

run:
	$(BUN) run src/index.tsx

build:
	$(BUN) run build

test:
	$(BUN) test src

install:
	sh ./scripts/install-local.sh

uninstall:
	sh ./scripts/uninstall-local.sh
