import { type Result, ResultAsync, err, ok, okAsync } from "neverthrow";
import type { DataAdapter } from "obsidian";
import type { Database } from "sql.js";
import initSqlJs from "sql.js";
import sql_wasm from "../node_modules/sql.js/dist/sql-wasm.wasm";

export const schemaQuery = `
CREATE TABLE IF NOT EXISTS licenses
(
    spdxId   TEXT PRIMARY KEY UNIQUE NOT NULL,
    name     TEXT                    NULL,
    nickname TEXT                    NULL,
    url      TEXT                    NULL
)
;

CREATE TABLE IF NOT EXISTS owners
(
    login           TEXT PRIMARY KEY UNIQUE NOT NULL,
    url             TEXT                    NOT NULL,
    isOrganization  boolean DEFAULT FALSE
)
;

CREATE TABLE IF NOT EXISTS topics
(
    name            TEXT PRIMARY KEY UNIQUE NOT NULL,
    stargazerCount  INTEGER
)
;

CREATE TABLE IF NOT EXISTS repositories
(
    id              TEXT PRIMARY KEY UNIQUE NOT NULL,
    name            TEXT                    NOT NULL,
    description     TEXT                    NULL,
    url             TEXT                    NOT NULL,
    homepageUrl     TEXT                    NULL,
    owner REFERENCES owners (login) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
    isArchived      boolean                 NOT NULL,
    isFork          boolean                 NOT NULL,
    isPrivate       boolean                 NOT NULL,
    isTemplate      boolean                 NOT NULL,
    latestRelease   TEXT                    NULL,
    license REFERENCES licenses (spdxId) ON DELETE SET NULL ON UPDATE CASCADE NULL,
    stargazerCount  INTEGER                 NOT NULL,
    forkCount       INTEGER                 NOT NULL,
    createdAt       datetime                NOT NULL,
    pushedAt        datetime                NOT NULL,
    starredAt       datetime                NOT NULL,
    updatedAt       datetime                NOT NULL,
    importedAt      datetime                NOT NULL,
    unstarredAt     datetime                NULL,
    languages       TEXT                    NULL,
    fundingLinks    TEXT                    NULL
)
;

CREATE INDEX IF NOT EXISTS idx__repositoriesNames ON repositories (name);
CREATE INDEX IF NOT EXISTS idx__repositoriesOwners ON repositories (owner);
CREATE INDEX IF NOT EXISTS idx__repositoriesLicenses ON repositories (license);
CREATE INDEX IF NOT EXISTS idx__repositoriesStarredAt ON repositories (starredAt);
CREATE INDEX IF NOT EXISTS idx__repositoriesImportedAt ON repositories (importedAt);

CREATE TABLE IF NOT EXISTS repositories_topics
(
    repoPk REFERENCES repositories (id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
    topicPk REFERENCES topics (name) ON DELETE CASCADE ON UPDATE CASCADE    NOT NULL
)
;

CREATE UNIQUE INDEX IF NOT EXISTS uidx__repositories_topics ON repositories_topics (repoPk, topicPk)
;`;

export const insertLicensesQuery = `
INSERT INTO licenses (spdxId, name, nickname, url) VALUES ($spdxId, $name, $nickname, $url)
ON CONFLICT (spdxId) DO NOTHING
;`;

export const insertOwnersQuery = `
INSERT INTO owners (login, url, isOrganization) VALUES ($login, $url, $isOrganization)
ON CONFLICT (login) DO NOTHING
;`;

export const insertTopicsQuery = `
INSERT INTO topics (name, stargazerCount) VALUES ($name, $stargazerCount)
ON CONFLICT (name) DO UPDATE SET stargazerCount = excluded.stargazerCount
;`;

export const insertRepositoriesQuery = `
INSERT INTO repositories (
    id
    , name
    , description
    , url
    , homepageUrl
    , owner
    , isArchived
    , isFork
    , isPrivate
    , isTemplate
    , latestRelease
    , license
    , stargazerCount
    , forkCount
    , createdAt
    , pushedAt
    , starredAt
    , updatedAt
    , importedAt
    , languages
    , fundingLinks
)
VALUES (
    $id
    , $name
    , $description
    , $url
    , $homepageUrl
    , $owner
    , $isArchived
    , $isFork
    , $isPrivate
    , $isTemplate
    , $latestRelease
    , $license
    , $stargazerCount
    , $forkCount
    , $createdAt
    , $pushedAt
    , $starredAt
    , $updatedAt
    , $importedAt
    , $languages
    , $fundingLinks
)
ON CONFLICT (id) DO UPDATE SET
    description = excluded.description
    , homepageUrl = excluded.homepageUrl
    , isArchived = excluded.isArchived
    , isFork = excluded.isFork
    , isPrivate = excluded.isPrivate
    , isTemplate = excluded.isTemplate
    , latestRelease = excluded.latestRelease
    , license = excluded.license
    , stargazerCount = excluded.stargazerCount
    , forkCount = excluded.forkCount
    , createdAt = excluded.createdAt
    , pushedAt = excluded.pushedAt
    , starredAt = excluded.starredAt
    , updatedAt = excluded.updatedAt
    , unstarredAt = NULL
    , languages = excluded.languages
    , fundingLinks = excluded.fundingLinks
;`;

export const removeRepositoriesTopicsQuery = `
DELETE FROM repositories_topics WHERE repoPk = $repoPk
;`;

export const insertRepositoriesTopicsQuery = `
INSERT INTO repositories_topics (repoPk, topicPk) VALUES ($repoPk, $topicPk)
ON CONFLICT (repoPk, topicPk) DO NOTHING;
`;

export const getStatsQuery = `
SELECT COUNT(id) FILTER ( WHERE unstarredAt IS NULL )     AS starredCount
     , COUNT(id) FILTER ( WHERE unstarredAt IS NOT NULL ) AS unstarredCount
     , id                                                 AS lastRepoId
     , starredAt                                          AS lastStarDate
     , importedAt                                         AS lastImportDate
FROM repositories
ORDER BY starredAt DESC
LIMIT 1
;`;

export const selectRepositoriesQuery = `
SELECT r.*
     , l.name                                               licenseName
     , l.nickname                                           licenseNickname
     , l.url                                                licenseUrl
     , o.login                                              ownerLogin
     , o.url                                                ownerUrl
     , o.isOrganization                                     ownerIsOrganization
FROM repositories AS r
         LEFT JOIN licenses l ON l.spdxId = r.license
         JOIN owners o ON o.login = r.owner
ORDER BY r.starredAt DESC
;`;

export const selectRepositoryTopicsQuery = `
SELECT t.name
     , t.stargazerCount
FROM repositories_topics rt
         JOIN topics t ON t.name = rt.topicPk
WHERE rt.repoPk = $repoPk
ORDER BY t.stargazerCount DESC
;`;

export const getMainLanguagesQuery = `
SELECT DISTINCT COALESCE(JSON_EXTRACT(r.languages, '$[0]'), 'Other') mainLanguage
FROM repositories r
ORDER BY mainLanguage
;`;

export const removeUnstarredRepositoriesQuery = `
DELETE FROM repositories
WHERE unstarredAt IS NOT NULL
RETURNING name, owner
;`;

export const removeOrphanedOwnersQuery = `
DELETE FROM owners
WHERE login NOT IN (SELECT DISTINCT owner FROM repositories)
RETURNING login
`;

export const removeOrphanedLicensesQuery = `
DELETE FROM licenses
WHERE spdxId NOT IN (SELECT DISTINCT license FROM repositories)
RETURNING spdxId
`;

export const removeOrphanedTopicsQuery = `
DELETE FROM topics
WHERE name NOT IN (SELECT DISTINCT topicPk FROM repositories_topics)
RETURNING name
`;

export enum PluginDatabaseError {
    DatabaseIsNotInitialized = "DatabaseIsNotInitialized",
    InitializationFailed = "InitializationFailed",
    FileIsNotExists = "FileIsNotExists",
    SchemaCreationFailed = "SchemaCreationFailed",
    DatabaseSaveFailed = "DatabaseSaveFailed",
}

export class PluginDatabase {
    private db?: Database;
    private dbFile: string;
    private adapter: DataAdapter;

    constructor(dbFile: string, adapter: DataAdapter) {
        this.dbFile = dbFile;
        this.adapter = adapter;
    }

    public save(): ResultAsync<void, PluginDatabaseError> {
        return this.instance
            .map((db) => db.export().buffer as ArrayBuffer)
            .asyncAndThen((data) => {
                return ResultAsync.fromPromise(
                    this.adapter.writeBinary(this.dbFile, data),
                    () => PluginDatabaseError.DatabaseSaveFailed,
                );
            });
    }

    public async init(): Promise<ResultAsync<Database, PluginDatabaseError>> {
        if (typeof this.db !== "undefined") {
            return okAsync(this.db);
        }

        const initSQLiteModule = ResultAsync.fromPromise(
            initSqlJs({ wasmBinary: sql_wasm.buffer as ArrayBuffer }),
            () => PluginDatabaseError.InitializationFailed,
        );
        const readDbFile = ResultAsync.fromPromise(
            this.adapter.readBinary(this.dbFile),
            () => PluginDatabaseError.FileIsNotExists,
        );
        const createNewDb = initSQLiteModule.andThen((SQL) =>
            readDbFile
                .map((data) => new SQL.Database(Buffer.from(data)))
                .orElse(() => ok(new SQL.Database())),
        );
        const migrateDb = createNewDb.andThen((db) => {
            try {
                db.run(schemaQuery);
                this.db = db;
                return ok(db);
            } catch (e) {
                console.error(`Database error: ${e}`);
                return err(PluginDatabaseError.SchemaCreationFailed);
            }
        });
        return migrateDb
            .andThrough(() => this.save())
            .match(
                (db) => ok(db),
                (error) => {
                    this.db = undefined;
                    return err(error);
                },
            );
    }

    public close(): Result<void, PluginDatabaseError> {
        return this.instance.map((db) => {
            db.close();
            this.db = undefined;
        });
    }

    public get instance(): Result<Database, PluginDatabaseError> {
        if (typeof this.db === "undefined") {
            return err(PluginDatabaseError.DatabaseIsNotInitialized);
        }

        return ok(this.db);
    }
}
