import { $ } from "bun";
import { ResultAsync, err, ok } from "neverthrow";
import type { IPackageJson } from "package-json-type";
import {
    changeLogFile,
    manifestFile,
    packageFile,
    versionsFile,
} from "./common";
import { ReleaseError } from "./errors";
import {
    readJsonFile,
    updateManifestFile,
    updateVersionsFile,
} from "./helpers";

function checkVersionIsNotPublished(version: string) {
    console.log(`Check is version ${version} exists…`);

    return ResultAsync.fromPromise(
        $`git tag -l "${version}"`.text(),
        (error) => {
            console.error(`ERROR. ${error}`);
            return ReleaseError.UnableToCheckVersion;
        },
    ).andThen((output) => {
        if (output.trim() === version) {
            return err(ReleaseError.VersionIsAlreadyPublished);
        }
        return ok(version);
    });
}

function generateChangeLog(version: string) {
    console.log(`Generate ${changeLogFile}`);

    return ResultAsync.fromPromise(
        $`git cliff --tag ${version} -o "${changeLogFile}"`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return ReleaseError.UnableToGenerateChangeLogFile;
        },
    );
}

function addFiles(...files: string[]) {
    console.log(`Add files to index: ${files.join(" ")}`);

    return ResultAsync.fromPromise(
        $`git add ${{ raw: files.join(" ") }}`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return ReleaseError.UnableToAddFileContentsToGitIndex;
        },
    );
}

function makeCommit(version: string) {
    console.log("Make commit");

    return ResultAsync.fromPromise(
        $`git commit -m "Release ${version}"`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return ReleaseError.GitCommitFailed;
        },
    );
}

function createGitTagOfNewVersion(version: string) {
    console.log(`Create a tag ${version}`);

    return ResultAsync.fromPromise(
        $`git tag -a "${version}" -m "${version}"`,
        (error) => {
            console.error(`ERROR. ${error}`);
            return ReleaseError.UnableToCreateTag;
        },
    );
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
        console.error(`Unable to make release. Reason: ${error}`);
        process.exit(1);
    });
