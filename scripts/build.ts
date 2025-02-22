import { parseArgs } from "node:util";
import { okAsync } from "neverthrow";
import { build, setupTestVault } from "./helpers";

const { values: args } = parseArgs({
    args: Bun.argv,
    options: {
        dev: {
            type: "boolean",
            default: false,
        },
        "no-minify": {
            type: "boolean",
            default: false,
        },
    },
    strict: true,
    allowPositionals: true,
    allowNegative: true,
});

const outputFolder = "dist";

await build({
    sourceFolder: "src",
    entrypoints: { main: "main.ts", styles: "styles/index.scss" },
    outputFolder,
    format: "cjs",
    drop: args.dev ? [] : ["console"],
    generateTypes: false,
    wasm: true,
    minify: !args["no-minify"],
    sourcemap: args.dev ?? false,
}).andThrough(() => {
    if (args.dev) {
        return setupTestVault(
            outputFolder,
            "obsidian-github-stars",
            "./test-vault",
        );
    }
    return okAsync();
});
