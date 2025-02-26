import path from "node:path";
import { parseArgs } from "node:util";
import builtins from "builtin-modules";
import { $, type BunPlugin } from "bun";
import { ResultAsync, okAsync } from "neverthrow";
import type { IPackageJson } from "package-json-type";
import { resolveTsPaths } from "resolve-tspaths";
import { targetStylesFile } from "./common";
import { BuildError, FileSystemError } from "./errors";
import {
    readJsonFile,
    readTextFile,
    setupTestVault,
    writeFile,
} from "./helpers";

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

export const InlineWasmBunPlugin: BunPlugin = {
    name: "inline-wasm",
    setup(builder) {
        // Hook into the "resolve" phase to intercept .wasm imports
        builder.onResolve({ filter: /\.wasm$/ }, async (args) => {
            // Resolve the .wasm file path relative to the directory of the importing file
            const resolvedPath = path.resolve(
                path.dirname(args.importer),
                args.path,
            );
            return { path: resolvedPath, namespace: "wasm" };
        });

        // Handle the .wasm file loading
        builder.onLoad(
            { filter: /\.wasm$/, namespace: "wasm" },
            async (args) => {
                const wasmFile = await Bun.file(args.path).bytes();
                const wasm = Buffer.from(wasmFile).toString("base64");

                // Create the inline WebAssembly module
                const contents = `
          const wasmBinary = Uint8Array.from(atob("${wasm}"), c => c.charCodeAt(0));
          export default wasmBinary;
        `;
                return { contents, loader: "js" };
            },
        );
    },
};

export const InlineSqlBunPlugin: BunPlugin = {
    name: "inline-sql",
    setup(builder) {
        // Hook into the "resolve" phase to intercept .sql imports
        builder.onResolve({ filter: /\.sql$/ }, async (args) => {
            // Resolve the .sql file path relative to the directory of the importing file
            const resolvedPath = path.resolve(
                path.dirname(args.importer),
                args.path,
            );
            return { path: resolvedPath, namespace: "sql" };
        });

        // Handle the .sql file loading
        builder.onLoad({ filter: /\.sql$/, namespace: "sql" }, async (args) => {
            const sqlFileContent = await Bun.file(args.path).text();
            const contents = `const sqlQuery = \`${sqlFileContent}\`;
            export default sqlQuery;`;
            return { contents, loader: "js" };
        });
    },
};

export interface WasmBuildConfig {
    target: "bundler" | "nodejs" | "web" | "no-modules" | "deno";
    path: string;
}

export function buildWasm(
    config: WasmBuildConfig = {
        target: "web",
        path: "./pkg",
    },
) {
    console.log("Building Rust WASM");
    const wasmPackBuild = ResultAsync.fromPromise(
        $`wasm-pack build --target ${config.target}`,
        () => BuildError.WasmPackBuildFailed,
    );
    return (
        wasmPackBuild
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

export interface BuildConfig {
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

export function build(config: BuildConfig) {
    const createOutputFolder = ResultAsync.fromPromise(
        $`mkdir -p ${config.outputFolder}`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return FileSystemError.FileSystemError;
        },
    );

    return createOutputFolder
        .andThrough(() => {
            if (config.wasmBuildConfig) {
                return buildWasm(config.wasmBuildConfig);
            }
            return okAsync();
        })
        .andThrough(() => {
            console.log("Building styles");
            return ResultAsync.fromPromise(
                $`grass ${Bun.file(`${config.sourceFolder}/${config.entrypoints.styles}`)} --style compressed > ${Bun.file(`${config.outputFolder}/${targetStylesFile}`)}`,
                (error) => {
                    console.error(`ERROR. ${error}`);
                    return BuildError.UnableToBuildStylesFiles;
                },
            );
        })
        .andThen(() => {
            console.log(
                `Building main: ${config.sourceFolder}/${config.entrypoints.main} (output: ${config.outputFolder})`,
            );
            return ResultAsync.fromPromise(
                Bun.build({
                    entrypoints: [
                        `${config.sourceFolder}/${config.entrypoints.main}`,
                    ],
                    outdir: config.outputFolder,
                    minify: config.minify,
                    target: "browser",
                    format: config.format,
                    plugins: config.useWasm
                        ? [InlineWasmBunPlugin, InlineSqlBunPlugin]
                        : [InlineSqlBunPlugin],
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
                }),
                (error) => {
                    console.error(`ERROR. ${error}`);
                    return BuildError.UnableToBuildJavaScriptFiles;
                },
            );
        })
        .andThrough(() => {
            if (config.generateTypes) {
                // Build typescript declaration files
                console.log("Building types");
                return ResultAsync.fromPromise(
                    $`bun tsc --noEmit false --emitDeclarationOnly --declaration --outDir ${config.outputFolder}/types`,
                    (error) => {
                        console.error(`ERROR. ${error}`);
                        return BuildError.UnableToBuildTypesDeclarations;
                    },
                ).andThrough(() =>
                    ResultAsync.fromPromise(
                        resolveTsPaths({
                            src: config.sourceFolder,
                            out: `${config.outputFolder}/types`,
                        }),
                        (error) => {
                            console.error(`ERROR. ${error}`);
                            return BuildError.UnableToResolveTypeScriptPaths;
                        },
                    ),
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
    drop: args.dev ? [] : ["console"],
    generateTypes: false,
    useWasm: true,
    minify: !args["no-minify"],
    sourcemap: args.dev ?? false,
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
        console.error(`Build failed. Reason: ${error}`);
        process.exit(1);
    });
