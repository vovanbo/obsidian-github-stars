import { Notice } from "obsidian";

export namespace Code {
    export enum Api {
        ImportFailed = "Import failed",
        ProcessingFailed = "Processing failed",
    }

    export enum GithubService {
        RequestFailed = "GitHub GraphQL request is failed",
        DeserializationFailed = "Deserialization of GraphQL response is failed",
    }

    export enum Lock {
        Locked = "Plugin is locked",
        Execution = "Lock execution error",
    }

    export enum Serialization {
        GraphQL = "Deserialization from GraphQL failed",
        Database = "Deserialization from database failed",
    }

    export enum Sqlite {
        ModuleInitializationFailed = "Database module initialization failed",
        DatabaseIsNotInitialized = "Database is not initialized",
        FileIsNotExists = "Database file is not exists",
        DatabaseSaveFailed = "Unable to save database file",
    }

    export enum Storage {
        ImportFailed = "Import to storage failed",
        RemoveUnstarredRepositoriesFailed = "Remove unstarred repositories failed",
        SchemaCreationFailed = "Database schema creation was failed",
        InitializationFailed = "Storage initialization failed",
    }

    export enum Vault {
        CreateFolderFailed = "Create folder failed",
        CreateFileFailed = "Create file failed",
        FileCanNotBeRemoved = "File can not be removed",
        FileNotFound = "File not found",
        UnableToSaveSettings = "Unable to save plugin settings",
        UnableToRenameDestinationFolder = "Unable to rename destination folder",
        NewDestinationFolderIsExists = "New destination folder is exists",
    }

    export type Any =
        | Api
        | GithubService
        | Lock
        | Serialization
        | Sqlite
        | Storage
        | Vault;
}

export class PluginError<T extends Code.Any> extends Error {
    code: T;

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    constructor(code: T, ...params: any) {
        super(...params);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, PluginError);
        }

        this.code = code;
    }

    public log() {
        console.error(`Plugin error. Reason: ${this.code}`);
        return this;
    }

    public notice(prefix = "Error!", duration = 0) {
        new Notice(`${prefix} ${this.code}`, duration);
        return this;
    }
}
