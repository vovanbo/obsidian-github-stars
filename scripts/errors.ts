export namespace Code {
    export enum Build {
        WasmPackBuildFailed = "WASM pack build is failed",
        UnableToBuildStylesFiles = "Unable to build styles files",
        UnableToBuildJavaScriptFiles = "Unable to build JavaScript files",
        UnableToBuildTypesDeclarations = "Unable to build TypeScript declarations files",
        UnableToResolveTypeScriptPaths = "Unable to resolve TypeScript paths",
    }

    export enum FileSystem {
        UnableToReadJsonFile = "Unable to read JSON file",
        UnableToReadTextFile = "Unable to read text file",
        UnableToWriteFile = "Unable to write file",
        UnableToReadPackageMetadata = "Unable to read package metadata",
        FileSystemError = "File system error",
        UnableToUpdateVersionsFile = "Unable to update versions file",
        UnableToUpdateManifestFile = "Unable to update plugin manifest file",
        UnableToCreatePluginPath = "Unable to create plugin path",
    }

    export enum Release {
        UnableToCheckVersion = "Unable to check published version",
        VersionIsAlreadyPublished = "Version is already published",
        UnableToAddFileContentsToGitIndex = "Unable to add file contents to Git index",
        GitCommitFailed = "Git commit is failed",
        UnableToCreateTag = "Unable to create Git tag for new version",
        UnableToGenerateChangeLogFile = "Unable to generate changelog file",
    }

    export enum Version {
        UnableToGetNextPackageVersion = "Unable to get next package version",
        UnableToBumpPackageVersion = "Unable to bump package version",
    }

    export type Any = Build | FileSystem | Release | Version;
}
export class ScriptError<T extends Code.Any> extends Error {
    code: T;

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    constructor(code: T, ...params: any) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ScriptError);
        }

        this.code = code;
    }

    public log() {
        console.error(`Error. Reason: ${this.code}`);
        console.trace(this.stack);
        return this;
    }
}
