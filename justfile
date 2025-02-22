default:
    just --list

[private]
biome:
    bun biome check --write ./src ./scripts

[private]
stylelint:
    bun stylelint --fix "src/**/*.scss"

tsc:
    bun tsc --noEmit

check: tsc biome stylelint

[private]
build: check
    bun ./scripts/build.ts

dev: check
    bun ./scripts/build.ts --dev

debug: check
    bun ./scripts/build.ts --dev --no-minify
