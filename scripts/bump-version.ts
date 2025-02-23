import { $ } from "bun";
import { ResultAsync, err, okAsync } from "neverthrow";
import type { IPackageJson } from "package-json-type";
import { VersionError } from "./errors";
import { readJsonFile, writeFile } from "./helpers";

export function bumpPackageVersion() {
    const packageFilePath = "package.json";
    const nextVersion = ResultAsync.fromPromise(
        $`git cliff --bumped-version --unreleased`.text(),
        (error) => {
            console.error(`ERROR ${error}`);
            return VersionError.UnableToGetNextPackageVersion;
        },
    );
    return nextVersion
        .andThen((newVersion) =>
            ResultAsync.combine([
                okAsync(newVersion.trim()),
                readJsonFile<IPackageJson>(packageFilePath),
            ]),
        )
        .andThen(([newVersion, metadata]) => {
            console.log(`Bump package version to ${newVersion}`);
            if (newVersion === metadata.version) {
                console.log(
                    "New version is the same as package version. Nothing to do.",
                );
                return okAsync(undefined);
            }
            console.log(
                `Current version is ${metadata.version}.\n`,
                `Write new version ${newVersion} to ${packageFilePath}`,
            );
            // @ts-expect-error
            metadata.version = newVersion;
            return writeFile(
                packageFilePath,
                JSON.stringify(metadata, null, 4),
            );
        })
        .andTee(() => console.log("Done!"))
        .orElse((error) => {
            console.error(`ERROR. ${error}`);
            return err(VersionError.UnableToBumpPackageVersion);
        });
}

await bumpPackageVersion();
