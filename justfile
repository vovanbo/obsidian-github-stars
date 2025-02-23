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

build:
    bun ./scripts/build.ts

ci version name="obsidian-github-stars": build
    cp manifest.json dist/manifest.json
    zip -r -j dist/{{name}}-{{version}}.zip dist/* CHANGELOG.md

dev: check
    bun ./scripts/build.ts --dev

debug: check
    bun ./scripts/build.ts --dev --no-minify

bump-version:
    bun ./scripts/bump-version.ts

release: bump-version
    bun ./scripts/release.ts


# Local

set shell := ["sh", "-c"]

sys-deps := if shell("uname -s") == 'Darwin' {
    'install-deps-mac'
} else {
    'install-deps-failed'
}

install-deps:
    just {{sys-deps}}

[private]
install-deps-failed:
    echo "Unable to install project dependencies on this platform"

[private]
install-deps-mac:
    brew install bun wasm-pack git-cliff
    cargo install grass
    bun install
