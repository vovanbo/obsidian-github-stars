import { $, type BunFile, type S3File } from "bun";
import { ResultAsync, err, ok, okAsync } from "neverthrow";
import type { PluginManifest } from "obsidian";
import type { IPackageJson } from "package-json-type";
import {
    manifestFile,
    packageFile,
    targetJavaScriptFile,
    targetStylesFile,
    versionsFile,
} from "./common";
import { Code, ScriptError } from "./errors";

export const isUndefined = (val: unknown): val is undefined =>
    val === undefined;

export function readJsonFile<T>(
    path: string | URL,
): ResultAsync<T, ScriptError<Code.FileSystem>> {
    return ResultAsync.fromThrowable(
        (p: typeof path) => Bun.file(p).json(),
        (error) => new ScriptError(Code.FileSystem.UnableToReadJsonFile),
    )(path);
}

export function readTextFile(
    path: string | URL,
): ResultAsync<string, ScriptError<Code.FileSystem>> {
    return ResultAsync.fromThrowable(
        (p: typeof path) => Bun.file(p).text(),
        (error) => new ScriptError(Code.FileSystem.UnableToReadTextFile),
    )(path);
}

export function writeFile(
    destination: BunFile | S3File | Bun.PathLike,
    data: Blob | NodeJS.TypedArray | ArrayBufferLike | string | Bun.BlobPart[],
): ResultAsync<number, ScriptError<Code.FileSystem>> {
    return ResultAsync.fromThrowable(
        (p: typeof destination, d: typeof data) => Bun.write(p, d),
        (error) => new ScriptError(Code.FileSystem.UnableToWriteFile),
    )(destination, data);
}

export function createFolder(
    path: string,
): ResultAsync<string, ScriptError<Code.FileSystem>> {
    console.log(`Create folder ${path}`);
    return ResultAsync.fromThrowable(
        (path: string) => $`mkdir -p ${path}`,
        () => new ScriptError(Code.FileSystem.FileSystemError),
    )(path).map((shellOutput) => shellOutput.text());
}

export function createFileIfNotExists(path: string | URL, content: string) {
    return ResultAsync.fromThrowable(
        (p: typeof path) => Bun.file(p).exists(),
        () => new ScriptError(Code.FileSystem.FileSystemError),
    )(path).andThen((isExists) => {
        if (isExists) {
            return okAsync();
        }
        console.log(`Creating ${path}`);
        return writeFile(path, content);
    });
}

export function removeFiles(
    paths: string[],
): ResultAsync<string, ScriptError<Code.FileSystem>> {
    return ResultAsync.fromThrowable(
        (pths: typeof paths) => $`rm -f ${{ raw: pths.join(" ") }}`,
        (error) => new ScriptError(Code.FileSystem.FileSystemError),
    )(paths).map((shellOutput) => shellOutput.text());
}

export function getVersionsFromPackageMetadata(): ResultAsync<
    { targetVersion: string | undefined; minAppVersion: string },
    ScriptError<Code.FileSystem>
> {
    console.log(`Reading ${packageFile}`);
    return readJsonFile<IPackageJson>(packageFile).andThen((pkg) => {
        try {
            return ok({
                targetVersion: pkg.version,
                minAppVersion: pkg.obsidianMinAppVersion as string,
            });
        } catch (error) {
            return err(
                new ScriptError(Code.FileSystem.UnableToReadPackageMetadata),
            );
        }
    });
}

export function updateManifestFile(
    targetVersion: string,
    minAppVersion: string,
    destinationFolder = ".",
): ResultAsync<
    { targetVersion: string; minAppVersion: string },
    ScriptError<Code.FileSystem>
> {
    console.log("Reading manifest");
    const readManifest = readJsonFile<PluginManifest>(manifestFile);
    const manifestDestinationPath = `${destinationFolder}/${manifestFile}`;
    return readManifest
        .andThen((manifest) => {
            console.log(`Updating ${manifestDestinationPath}`);
            manifest.version = targetVersion;
            manifest.minAppVersion = minAppVersion;
            return writeFile(
                manifestDestinationPath,
                JSON.stringify(manifest, null, "\t"),
            );
        })
        .andThen(() => ok({ targetVersion, minAppVersion }))
        .orElse((error) =>
            err(new ScriptError(Code.FileSystem.UnableToUpdateManifestFile)),
        );
}

export function updateVersionsFile(
    targetVersion: string,
    minAppVersion: string,
) {
    console.log("Update versions file");
    return createFileIfNotExists(versionsFile, "{}")
        .andThen(() =>
            readJsonFile<{ [version: string]: string }>(versionsFile),
        )
        .andThen((versions) => {
            versions[targetVersion] = minAppVersion;
            return writeFile(
                versionsFile,
                JSON.stringify(versions, null, "\t"),
            );
        })
        .andThen(() => ok({ targetVersion, minAppVersion }))
        .orElse((error) =>
            err(new ScriptError(Code.FileSystem.UnableToUpdateVersionsFile)),
        );
}

export function setupTestVault(
    distFolderPath: string,
    pluginName: string,
    testVaultFolder = "./test-vault",
) {
    const obsidianFolderPath = `${testVaultFolder}/.obsidian`;
    const pluginFolderPath = `${obsidianFolderPath}/plugins/${pluginName}`;

    console.log("Creating test vault");
    return createFolder(pluginFolderPath)
        .andThen(() =>
            createFileIfNotExists(
                `${obsidianFolderPath}/community-plugins.json`,
                `["${pluginName}"]`,
            ),
        )
        .andTee((result) => {
            if (isUndefined(result)) {
                console.log(
                    "Community plugins already configured in test vault",
                );
            }
        })
        .andThen(() =>
            removeFiles([
                `${pluginFolderPath}/${targetJavaScriptFile}`,
                `${pluginFolderPath}/${targetStylesFile}`,
                `${pluginFolderPath}/${manifestFile}`,
            ]),
        )
        .andThen(() => {
            console.log("Copying plugin dist files");
            return ResultAsync.fromThrowable(
                (src: string, dst: string) => $`cp -r ${src}/* ${dst}/`,
                (error) => new ScriptError(Code.FileSystem.FileSystemError),
            )(distFolderPath, pluginFolderPath);
        })
        .andThen(() => getVersionsFromPackageMetadata())
        .andThrough(({ targetVersion, minAppVersion }) =>
            updateManifestFile(
                targetVersion as string,
                minAppVersion,
                pluginFolderPath,
            ),
        );
}
