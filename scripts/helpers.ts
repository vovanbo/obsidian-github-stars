import { $, type BunFile, type S3File } from "bun";
import { ResultAsync, err, ok } from "neverthrow";
import type { PluginManifest } from "obsidian";
import type { IPackageJson } from "package-json-type";
import {
    manifestFile,
    packageFile,
    targetJavaScriptFile,
    targetStylesFile,
    versionsFile,
} from "./common";
import { FileSystemError } from "./errors";

export function readJsonFile<T>(
    path: string | URL,
): ResultAsync<T, FileSystemError> {
    return ResultAsync.fromPromise(Bun.file(path).json(), (error) => {
        console.error(`ERROR. ${error}`);
        return FileSystemError.UnableToReadJsonFile;
    });
}

export function readTextFile(path: string | URL) {
    return ResultAsync.fromPromise(Bun.file(path).text(), (error) => {
        console.error(`ERROR. ${error}`);
        return FileSystemError.UnableToReadTextFile;
    });
}

export function writeFile(
    destination: BunFile | S3File | Bun.PathLike,
    data: Blob | NodeJS.TypedArray | ArrayBufferLike | string | Bun.BlobPart[],
) {
    return ResultAsync.fromPromise(Bun.write(destination, data), (error) => {
        console.error(`ERROR. ${error}`);
        return FileSystemError.UnableToWriteFile;
    });
}

export function createFileIfNotExists(path: string, content: string) {
    return ResultAsync.fromPromise(
        Bun.file(path).exists(),
        () => FileSystemError.FileSystemError,
    ).andThen((isExists) => {
        if (!isExists) {
            console.log(`Creating ${path}`);
            return writeFile(path, content);
        }
        return ok(undefined);
    });
}

export function removeFiles(paths: string[]) {
    return ResultAsync.fromPromise(
        $`rm -f ${{ raw: paths.join(" ") }}`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return FileSystemError.FileSystemError;
        },
    );
}

export function getVersionsFromPackageMetadata() {
    console.log(`Reading ${packageFile}`);
    return readJsonFile<IPackageJson>(packageFile).andThen((pkg) => {
        try {
            return ok({
                targetVersion: pkg.version,
                minAppVersion: pkg.obsidianMinAppVersion as string,
            });
        } catch (error) {
            console.error(`ERROR. ${error}`);
            return err(FileSystemError.UnableToReadPackageMetadata);
        }
    });
}

export function updateManifestFile(
    targetVersion: string,
    minAppVersion: string,
    destinationFolder = ".",
) {
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
        .orElse((error) => {
            console.error(`ERROR. ${error}`);
            return err(FileSystemError.UnableToUpdateManifestFile);
        });
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
        .orElse((error) => {
            console.error(`ERROR. ${error}`);
            return err(FileSystemError.UnableToUpdateVersionsFile);
        });
}

export function setupTestVault(
    distFolderPath: string,
    pluginName: string,
    testVaultFolder = "./test-vault",
) {
    const obsidianFolderPath = `${testVaultFolder}/.obsidian`;
    const pluginFolderPath = `${obsidianFolderPath}/plugins/${pluginName}`;

    console.log("Creating test vault");
    const makePluginFolder = ResultAsync.fromPromise(
        $`mkdir -p ${pluginFolderPath}`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return FileSystemError.UnableToCreatePluginPath;
        },
    );

    return makePluginFolder
        .andThen(() =>
            createFileIfNotExists(
                `${obsidianFolderPath}/community-plugins.json`,
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
                `${pluginFolderPath}/${targetJavaScriptFile}`,
                `${pluginFolderPath}/${targetStylesFile}`,
                `${pluginFolderPath}/${manifestFile}`,
            ]),
        )
        .andThen(() => {
            console.log("Copying plugin dist files");
            return ResultAsync.fromPromise(
                $`cp -r ${distFolderPath}/* ${pluginFolderPath}/`,
                (error) => {
                    console.error(`ERROR. ${error}`);
                    return FileSystemError.FileSystemError;
                },
            );
        })
        .andThen(() => getVersionsFromPackageMetadata())
        .andThrough(({ targetVersion, minAppVersion }) =>
            updateManifestFile(
                targetVersion as string,
                minAppVersion,
                pluginFolderPath,
            ),
        )
        .orElse((error) => {
            console.error(`Test vault setup is failed. Reason: ${error}`);
            return err(error);
        });
}
