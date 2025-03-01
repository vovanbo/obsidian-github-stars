import { $ } from "bun";
import { ResultAsync, err, okAsync } from "neverthrow";
import type { IPackageJson } from "package-json-type";
import { Code, ScriptError } from "./errors";
import { readJsonFile, writeFile } from "./helpers";

export function bumpPackageVersion() {
    const packageFilePath = "package.json";
    const nextVersion = ResultAsync.fromThrowable(
        () => $`git cliff --bumped-version --unreleased`,
        () => new ScriptError(Code.Version.UnableToGetNextPackageVersion),
    );
    return nextVersion()
        .map((shellOutput) => shellOutput.text().trim())
        .andThen((newVersion) =>
            ResultAsync.combine([
                okAsync(newVersion),
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
                JSON.stringify(metadata, null, 4) as string,
            );
        })
        .andTee(() => console.log("Done!"));
}

await bumpPackageVersion().orElse((error) => {
    error.log();
    process.exit(1);
});
