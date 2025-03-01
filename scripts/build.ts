import { parseArgs } from "node:util";
import builtins from "builtin-modules";
import {
    $,
    type BuildConfig,
    type BuildOutput,
    type BunFile,
    type BunPlugin,
} from "bun";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import type { IPackageJson } from "package-json-type";
import { resolveTsPaths } from "resolve-tspaths";
import { targetStylesFile } from "./common";
import { Code, ScriptError } from "./errors";
import {
    createFolder,
    isUndefined,
    readJsonFile,
    readTextFile,
    setupTestVault,
    writeFile,
} from "./helpers";
import { InlineGraphQlBunPlugin } from "./plugins/graphql";
import { CompiledHandlebarsTemplateBunPlugin } from "./plugins/handlebars";
import { InlineSqlBunPlugin } from "./plugins/sql";
import { InlineWasmBunPlugin } from "./plugins/wasm";

const { values: args } = parseArgs({
    args: Bun.argv,
    options: {
        dev: {
            type: "boolean",
            default: false,
        },
        "source-maps": {
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

export interface WasmBuildConfig {
    target: "bundler" | "nodejs" | "web" | "no-modules" | "deno";
    path: string;
}

export function buildWasm(
    config: WasmBuildConfig = {
        target: "web",
        path: "./pkg",
    },
): ResultAsync<number, ScriptError<Code.Build | Code.FileSystem>> {
    console.log("Building Rust WASM");
    const wasmPackBuild = ResultAsync.fromThrowable(
        (target: string) => $`wasm-pack build --target ${target}`,
        () => new ScriptError(Code.Build.WasmPackBuildFailed),
    );
    return (
        wasmPackBuild(config.target)
            .andThen(() =>
                readJsonFile<IPackageJson>(`${config.path}/package.json`),
            )
            .andThen(({ main: mainFileName }) => {
                const path = `${config.path}/${mainFileName}`;
                return ResultAsync.combine([okAsync(path), readTextFile(path)]);
            })
            // import.meta.url is not supported and not needed, beacuse we inline the wasm.
            // Thus remove all import.meta.url occurrences from the wasm-pack output.
            .andThen(([path, fileContent]) => {
                console.log("Applying patches and save");
                return writeFile(
                    path,
                    fileContent.replace(/import\.meta\.url/g, ""),
                );
            })
    );
}

export interface PluginBuildConfig {
    sourceFolder: string;
    entrypoints: {
        main: string;
        styles: string;
    };
    outputFolder: string;
    format: "cjs" | "esm";
    drop: string[];
    generateTypes: boolean;
    useWasm: boolean;
    wasmBuildConfig?: WasmBuildConfig;
    minify: boolean;
    sourcemap: boolean;
}

const defaultBunPlugins = [
    InlineSqlBunPlugin,
    InlineGraphQlBunPlugin,
    CompiledHandlebarsTemplateBunPlugin,
];

export function buildStyles(
    source: BunFile,
    destination: BunFile,
): ResultAsync<string, ScriptError<Code.Build>> {
    console.log("Building styles");
    return ResultAsync.fromThrowable(
        (s: BunFile, d: BunFile) => $`grass ${s} --style compressed > ${d}`,
        () => new ScriptError(Code.Build.UnableToBuildStylesFiles),
    )(source, destination).map((shellOutput) => shellOutput.text());
}

export function buildJavaScript(
    config: Partial<PluginBuildConfig>,
): ResultAsync<BuildOutput, ScriptError<Code.Build>> {
    if (isUndefined(config.entrypoints)) {
        return errAsync(
            new ScriptError(Code.Build.UnableToBuildJavaScriptFiles),
        );
    }

    console.log(
        `Building JavaScript: ${config.sourceFolder}/${config.entrypoints.main} (output: ${config.outputFolder})`,
    );

    const buildConfig: BuildConfig = {
        entrypoints: [`${config.sourceFolder}/${config.entrypoints.main}`],
        outdir: config.outputFolder,
        minify: config.minify,
        target: "browser",
        format: config.format,
        plugins: config.useWasm
            ? [InlineWasmBunPlugin, ...defaultBunPlugins]
            : defaultBunPlugins,
        drop: config.drop,
        sourcemap: config.sourcemap ? "inline" : "none",
        external: [
            "obsidian",
            "electron",
            "@electron/remote",
            "@codemirror/autocomplete",
            "@codemirror/collab",
            "@codemirror/commands",
            "@codemirror/language",
            "@codemirror/lint",
            "@codemirror/search",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/common",
            "@lezer/highlight",
            "@lezer/lr",
            ...builtins,
        ],
    };

    return ResultAsync.fromThrowable(
        (c: BuildConfig) => Bun.build(c),
        (error) => new ScriptError(Code.Build.UnableToBuildJavaScriptFiles),
    )(buildConfig);
}

export function buildTypeScriptDeclarations(
    sourceFolder: string,
    outputFolder: string,
): ResultAsync<string, ScriptError<Code.Build>> {
    console.log("Building types");
    const buildDeclarations = ResultAsync.fromThrowable(
        (folder: string) =>
            $`bun tsc --noEmit false --emitDeclarationOnly --declaration --outDir ${folder}/types`,
        () => new ScriptError(Code.Build.UnableToBuildTypesDeclarations),
    );
    const resolvePaths = ResultAsync.fromThrowable(
        (src: string, out: string) =>
            resolveTsPaths({
                src,
                out: `${out}/types`,
            }),
        (error) => new ScriptError(Code.Build.UnableToResolveTypeScriptPaths),
    );
    return buildDeclarations(outputFolder)
        .andThrough(() => resolvePaths(sourceFolder, outputFolder))
        .map((shellOutput) => shellOutput.text());
}

export function build(config: PluginBuildConfig) {
    return createFolder(config.outputFolder)
        .andThrough(() => {
            if (config.wasmBuildConfig) {
                return buildWasm(config.wasmBuildConfig);
            }
            return okAsync();
        })
        .andThrough(() =>
            buildStyles(
                Bun.file(`${config.sourceFolder}/${config.entrypoints.styles}`),
                Bun.file(`${config.outputFolder}/${targetStylesFile}`),
            ),
        )
        .andThen(() => buildJavaScript(config))
        .andThrough(() => {
            if (config.generateTypes) {
                // Build typescript declaration files
                return buildTypeScriptDeclarations(
                    config.sourceFolder,
                    config.outputFolder,
                );
            }
            return okAsync();
        });
}

await build({
    sourceFolder: "src",
    entrypoints: { main: "main.ts", styles: "styles/index.scss" },
    outputFolder,
    format: "cjs",
    // drop: args.dev ? [] : ["console"],
    drop: [],
    generateTypes: false,
    useWasm: true,
    minify: !args["no-minify"],
    sourcemap: args["source-maps"] ?? false,
})
    .andThrough(() => {
        if (args.dev) {
            return setupTestVault(
                outputFolder,
                "obsidian-github-stars",
                "./test-vault",
            );
        }
        return okAsync();
    })
    .andTee(() => console.log("Done!"))
    .orElse((error) => {
        error.log();
        process.exit(1);
    });
