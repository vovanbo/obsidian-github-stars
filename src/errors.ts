export enum GithubRepositoriesServiceError {
    RequestFailed = "GitHub GraphQL request is failed",
    DeserializationFailed = "Deserialization of GraphQL response is failed",
}

export enum PluginError {
    ImportFailed = "Import failed",
    CreateFolderFailed = "Create folder failed",
    CreateFileFailed = "Create file failed",
    ProcessingFailed = "Processing failed",
    FileCanNotBeRemoved = "File can not be removed",
    FileNotFound = "File not found",
}

export enum PluginStorageError {
    ImportFailed = "Import to storage failed",
    RemoveUnstarredRepositoriesFailed = "Remove unstarred repositories failed",
    SchemaCreationFailed = "Database schema creation was failed",
    InitializationFailed = "Storage initialization failed",
}

export enum SqliteDatabaseError {
    ModuleInitializationFailed = "Database module initialization failed",
    DatabaseIsNotInitialized = "Database is not initialized",
    FileIsNotExists = "Database file is not exists",
    DatabaseSaveFailed = "Unable to save database file",
}
