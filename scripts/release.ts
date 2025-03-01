import { $ } from "bun";
import { ResultAsync, err, ok } from "neverthrow";
import type { IPackageJson } from "package-json-type";
import {
    changeLogFile,
    manifestFile,
    packageFile,
    versionsFile,
} from "./common";
import { Code, ScriptError } from "./errors";
import {
    readJsonFile,
    updateManifestFile,
    updateVersionsFile,
} from "./helpers";

function checkVersionIsNotPublished(
    version: string,
): ResultAsync<string, ScriptError<Code.Release>> {
    console.log(`Check is version ${version} exists…`);

    return ResultAsync.fromThrowable(
        (tag: string) => $`git tag -l "${tag}"`,
        (error) => new ScriptError(Code.Release.UnableToCheckVersion),
    )(version)
        .map((shellOutput) => shellOutput.text().trim())
        .andThen((output) => {
            if (output === version) {
                return err(
                    new ScriptError(Code.Release.VersionIsAlreadyPublished),
                );
            }
            return ok(version);
        });
}

function generateChangeLog(
    version: string,
): ResultAsync<string, ScriptError<Code.Release>> {
    console.log(`Generate ${changeLogFile}`);

    return ResultAsync.fromThrowable(
        (tag: string, output: string) =>
            $`git cliff --tag ${tag} -o "${output}"`,
        () => new ScriptError(Code.Release.UnableToGenerateChangeLogFile),
    )(version, changeLogFile).map((shellOutput) => shellOutput.text());
}

function addFiles(
    ...files: string[]
): ResultAsync<string, ScriptError<Code.Release>> {
    console.log(`Add files to index: ${files.join(" ")}`);

    return ResultAsync.fromThrowable(
        (...f: typeof files) => $`git add ${{ raw: f.join(" ") }}`,
        (error) =>
            new ScriptError(Code.Release.UnableToAddFileContentsToGitIndex),
    )(...files).map((shellOutput) => shellOutput.text());
}

function makeCommit(
    version: string,
): ResultAsync<string, ScriptError<Code.Release>> {
    console.log("Make commit");

    return ResultAsync.fromThrowable(
        (v: string) => $`git commit -m "Release ${v}"`,
        (error) => new ScriptError(Code.Release.GitCommitFailed),
    )(version).map((shellOutput) => shellOutput.text());
}

function createGitTagOfNewVersion(
    version: string,
): ResultAsync<string, ScriptError<Code.Release>> {
    console.log(`Create a tag ${version}`);

    return ResultAsync.fromThrowable(
        (v: string) => $`git tag -a "${v}" -m "${v}"`,
        (error) => new ScriptError(Code.Release.UnableToCreateTag),
    )(version).map((shellOutput) => shellOutput.text());
}

await readJsonFile<IPackageJson>(packageFile)
    .andTee((metadata) =>
        console.log(`Make release of version ${metadata.version}`),
    )
    .andThrough((metadata) =>
        checkVersionIsNotPublished(metadata.version as string),
    )
    .andThrough((metadata) =>
        updateManifestFile(
            metadata.version as string,
            metadata.obsidianMinAppVersion,
        ),
    )
    .andThrough((metadata) =>
        updateVersionsFile(
            metadata.version as string,
            metadata.obsidianMinAppVersion,
        ),
    )
    .andThrough((metadata) => generateChangeLog(metadata.version as string))
    .andThrough(() =>
        addFiles(packageFile, manifestFile, versionsFile, changeLogFile),
    )
    .andThrough((metadata) => makeCommit(metadata.version as string))
    .andThen((metadata) => createGitTagOfNewVersion(metadata.version as string))
    .andTee(() => console.log("Release is ready. Run `git push --follow-tags`"))
    .orElse((error) => {
        error.log();
        process.exit(1);
    });
