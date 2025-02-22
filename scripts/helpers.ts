/// <reference types="bun-types" />

import path from "node:path";
import builtins from "builtin-modules";
import { $, type BunFile, type BunPlugin, type S3File } from "bun";
import { ResultAsync, err, ok, okAsync } from "neverthrow";
import { resolveTsPaths } from "resolve-tspaths";

enum BuildError {
    UnableToReadPackageMetadata = "Unable to read package metadata",
    UnableToReadJsonFile = "Unable to read JSON file",
    UnableToReadTextFile = "Unable to read text file",
    UnableToWriteFile = "Unable to write file",
    WasmPackBuildFailed = "WASM pack build is failed",
    FileSystemError = "File system error",
    UnableToCreatePluginPath = "Unable to create plugin path",
    UnableToBuildStylesFiles = "Unable to build styles files",
    UnableToBuildJavaScriptFiles = "Unable to build JavaScript files",
    UnableToBuildTypesDeclarations = "Unable to build TypeScript declarations files",
    UnableToResolveTypeScriptPaths = "Unable to resolve TypeScript paths",
}

function readJsonFile(path: string | URL) {
    return ResultAsync.fromPromise(Bun.file(path).json(), (error) => {
        console.error(`ERROR. ${error}`);
        return BuildError.UnableToReadJsonFile;
    });
}

function readTextFile(path: string | URL) {
    return ResultAsync.fromPromise(Bun.file(path).text(), (error) => {
        console.error(`ERROR. ${error}`);
        return BuildError.UnableToReadTextFile;
    });
}

function writeFile(
    destination: BunFile | S3File | Bun.PathLike,
    data: Blob | NodeJS.TypedArray | ArrayBufferLike | string | Bun.BlobPart[],
) {
    return ResultAsync.fromPromise(Bun.write(destination, data), (error) => {
        console.error(`ERROR. ${error}`);
        return BuildError.UnableToWriteFile;
    });
}

function createFileIfNotExists(path: string, content: string) {
    return ResultAsync.fromPromise(
        Bun.file(path).exists(),
        () => BuildError.FileSystemError,
    ).andThen((isExists) => {
        if (!isExists) {
            console.log(`Creating ${path}`);
            return writeFile(path, content);
        }
        return ok(undefined);
    });
}

function removeFiles(paths: string[]) {
    return ResultAsync.fromPromise($`rm -f ${paths.join(" ")}`, (error) => {
        console.error(`ERROR. ${error}`);
        return BuildError.FileSystemError;
    });
}

export function getPackageMetadata() {
    console.log("Reading package.json");
    return readJsonFile("package.json").andThen((pkg) => {
        try {
            return ok({
                targetVersion: pkg.version as string,
                minAppVersion: pkg.obsidianMinAppVersion as string,
                // TODO: Use SemVer parsing here
                isBeta: pkg.version.includes("-") as boolean,
            });
        } catch (error) {
            console.error(`ERROR. ${error}`);
            return err(BuildError.UnableToReadPackageMetadata);
        }
    });
}

export function updateManifests(
    targetVersion: string,
    minAppVersion: string,
    outDir = ".",
) {
    console.log("Reading manifests");
    const readManifest = readJsonFile("manifest.json");
    const readManifestBeta = readJsonFile("manifest-beta.json");
    let manifestUpdateResult: ResultAsync<number | undefined, BuildError> =
        okAsync(undefined);

    // check if it is release version
    const isBeta = targetVersion.includes("-");
    if (!isBeta) {
        const manifestOutPath = `${outDir}/manifest.json`;
        manifestUpdateResult = readManifest
            .andThen((data) => {
                console.log(`Updating ${manifestOutPath}`);
                data.version = targetVersion;
                data.minAppVersion = minAppVersion;
                return ok(data);
            })
            .andThen((data) =>
                writeFile(manifestOutPath, JSON.stringify(data, null, 2)),
            );
    } else {
        console.log("Skipping manifest.json update for beta version");
    }

    // bump version of manifest-beta.json to target version
    const betaOutPath = `${outDir}/manifest-beta.json`;
    const betaManifestUpdateResult = readManifestBeta
        .andThen((data) => {
            console.log(`Updating ${betaOutPath}`);
            data.version = targetVersion;
            data.minAppVersion = minAppVersion;
            return ok(data);
        })
        .andThen((data) =>
            writeFile(betaOutPath, JSON.stringify(data, null, 2)),
        );

    return ResultAsync.combine([
        manifestUpdateResult,
        betaManifestUpdateResult,
    ]).andThen(() => ok({ targetVersion, minAppVersion }));
}

export function setupTestVault(
    distDir: string,
    pluginName: string,
    testVaultPath = "./test-vault",
) {
    const obsidianConfigPath = `${testVaultPath}/.obsidian`;
    const pluginPath = `${obsidianConfigPath}/plugins/${pluginName}`;

    console.log("Creating test vault");
    const makePluginPathDir = ResultAsync.fromPromise(
        $`mkdir -p ${pluginPath}`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return BuildError.UnableToCreatePluginPath;
        },
    );

    return makePluginPathDir
        .andThen(() =>
            createFileIfNotExists(
                `${obsidianConfigPath}/community-plugins.json`,
                `["${pluginName}"]`,
            ),
        )
        .andTee((result) => {
            if (typeof result === "undefined") {
                console.log(
                    "Community plugins already configured in test vault",
                );
            }
        })
        .andThen(() =>
            removeFiles([
                `${pluginPath}/main.js`,
                `${pluginPath}/styles.css`,
                `${pluginPath}/manifest.json`,
            ]),
        )
        .andThen(() => {
            console.log("Copying plugin dist files");
            return ResultAsync.fromPromise(
                $`cp -r ${distDir}/* ${pluginPath}/`,
                (error) => {
                    console.error(`ERROR. ${error}`);
                    return BuildError.FileSystemError;
                },
            );
        })
        .andThen(() => getPackageMetadata())
        .andThrough(({ targetVersion, minAppVersion }) =>
            updateManifests(targetVersion, minAppVersion, pluginPath),
        )
        .andThen(({ isBeta }) => {
            console.log("Selecting manifest");
            if (isBeta) {
                return ResultAsync.fromPromise(
                    $`mv ${pluginPath}/manifest-beta.json ${pluginPath}/manifest.json`,
                    (error) => {
                        console.error(`ERROR. ${error}`);
                        return BuildError.FileSystemError;
                    },
                );
            }
            return ResultAsync.fromPromise(
                $`rm ${pluginPath}/manifest-beta.json`,
                (error) => {
                    console.error(`ERROR. ${error}`);
                    return BuildError.FileSystemError;
                },
            );
        })
        .orElse((error) => {
            console.error(`Test vault setup is failed. Reason: ${error}`);
            return err(error);
        });
}

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

export function buildWasm() {
    console.log("Building Rust WASM");
    const wasmPackBuild = ResultAsync.fromPromise(
        $`wasm-pack build --target web`,
        () => BuildError.WasmPackBuildFailed,
    );
    return (
        wasmPackBuild
            .andThen(() => readJsonFile("./pkg/package.json"))
            .andThen(({ main: mainFileName }) => {
                const path = `./pkg/${mainFileName}`;
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
    wasm: { build: boolean } | boolean;
    minify: boolean;
    sourcemap: boolean;
}

export function build(config: BuildConfig) {
    const createOutputFolder = ResultAsync.fromPromise(
        $`mkdir -p ${config.outputFolder}`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return BuildError.FileSystemError;
        },
    );

    return createOutputFolder
        .andThrough(() => {
            if (typeof config.wasm === "object" && config.wasm.build) {
                return buildWasm();
            }
            return okAsync();
        })
        .andThrough(() => {
            console.log("Building styles");
            return ResultAsync.fromPromise(
                $`grass ${Bun.file(`${config.sourceFolder}/${config.entrypoints.styles}`)} --style compressed > ${Bun.file(`${config.outputFolder}/styles.css`)}`,
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
                    plugins: config.wasm ? [InlineWasmBunPlugin] : [],
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
