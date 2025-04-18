import getRepositoriesQuery from "@/db/queries/getRepositories.sql";
import getRepositoryTopicsQuery from "@/db/queries/getRepositoriesTopics.sql";
import getStatsQuery from "@/db/queries/getStats.sql";
import insertLicensesQuery from "@/db/queries/insertLicenses.sql";
import insertOwnersQuery from "@/db/queries/insertOwners.sql";
import insertRepositoriesQuery from "@/db/queries/insertRepositories.sql";
import insertRepositoriesTopicsQuery from "@/db/queries/insertRepositoriesTopics.sql";
import insertTopicsQuery from "@/db/queries/insertTopics.sql";
import removeOrphanedLicensesQuery from "@/db/queries/removeOrphanedLicenses.sql";
import removeOrphanedOwnersQuery from "@/db/queries/removeOrphanedOwners.sql";
import removeOrphanedTopicsQuery from "@/db/queries/removeOrphanedTopics.sql";
import removeRepositoriesTopicsQuery from "@/db/queries/removeRepositoriesTopics.sql";
import removeUnstarredRepositoriesQuery from "@/db/queries/removeUnstarredRepositories.sql";
import schemaQuery from "@/db/queries/schema.sql";
import type { SqliteDatabase } from "@/db/sqlite";
import { Code, PluginError } from "@/errors";
import type { StarredRepositoriesGenerator } from "@/services/github";
import { DEFAULT_STATS } from "@/settings";
import type { GitHub } from "@/types";
import { single } from "itertools-ts";
import { DateTime } from "luxon";
import {
    type Result,
    type ResultAsync,
    err,
    errAsync,
    ok,
    okAsync,
} from "neverthrow";
import { fromDbObject, fromGraphQlData } from "./serialization";

export type Stats = {
    starredCount: number;
    unstarredCount: number;
    lastRepoId?: string;
};

export type RemovedRepository = {
    owner: string;
    name: string;
};

export type ImportConfig = {
    fullSync: boolean;
    removeUnstarred: boolean;
    lastRepoId?: string;
};

export class PluginStorage {
    private db: SqliteDatabase;

    constructor(db: SqliteDatabase) {
        this.db = db;
    }

    public init(
        dbFolder: string,
        dbFile: string,
    ): ResultAsync<this, PluginError<Code.Storage>> {
        return this.db
            .init(dbFolder, dbFile)
            .andThen((db) => {
                try {
                    db.run("BEGIN TRANSACTION;");
                    db.run(schemaQuery);
                    db.run("COMMIT;");
                    return okAsync(db);
                } catch (e) {
                    db.run("ROLLBACK;");
                    console.error(`Database error: ${e}`);
                    return errAsync(
                        new PluginError(Code.Storage.SchemaCreationFailed),
                    );
                }
            })
            .andThrough(() => this.db.save())
            .andThen(() => ok(this))
            .orElse((error) => {
                console.error(`ERROR. ${error}`);
                this.close();
                return errAsync(
                    new PluginError(Code.Storage.InitializationFailed),
                );
            });
    }

    public close(): ResultAsync<void, PluginError<Code.Sqlite>> {
        return this.db.close();
    }

    public async import(
        repositoriesGen: StarredRepositoriesGenerator,
        config: ImportConfig,
        progressCallback: (count: number) => void,
    ): Promise<Result<void, PluginError<Code.Any>>> {
        if (this.db.instance.isErr()) {
            return err(this.db.instance.error);
        }

        const db = this.db.instance.value;

        const licensesStmt = db.prepare(insertLicensesQuery);
        const ownersStmt = db.prepare(insertOwnersQuery);
        const topicsStmt = db.prepare(insertTopicsQuery);
        const repositoriesStmt = db.prepare(insertRepositoriesQuery);
        const removeRepositoriesTopicsStmt = db.prepare(
            removeRepositoriesTopicsQuery,
        );
        const upsertRepositoriesTopicsStmt = db.prepare(
            insertRepositoriesTopicsQuery,
        );

        const now = DateTime.utc();
        const importedReposIds: Set<string> = new Set();

        let result: Result<void, PluginError<Code.Any>> = ok();
        let stopImport = false;
        try {
            db.run("BEGIN TRANSACTION;");
            for await (const partResult of repositoriesGen) {
                if (partResult.isErr()) {
                    result = err(partResult.error);
                    break;
                }
                for (const edge of partResult.value) {
                    const deserializationResult = fromGraphQlData(edge);
                    if (deserializationResult.isErr()) {
                        result = err(deserializationResult.error);
                        break;
                    }

                    progressCallback(importedReposIds.size);

                    const repo = deserializationResult.value;

                    if (
                        !config.fullSync &&
                        config.lastRepoId &&
                        repo.id === config.lastRepoId
                    ) {
                        stopImport = true;
                        break;
                    }

                    if (repo.licenseInfo?.spdxId) {
                        licensesStmt.bind({
                            $spdxId: repo.licenseInfo.spdxId,
                            $name: repo.licenseInfo.name
                                ? repo.licenseInfo.name
                                : null,
                            $nickname: repo.licenseInfo.nickname
                                ? repo.licenseInfo.nickname
                                : null,
                            $url: repo.licenseInfo.url
                                ? repo.licenseInfo.url.toString()
                                : null,
                        });
                        licensesStmt.step();
                    }

                    ownersStmt.bind({
                        $login: repo.owner.login,
                        $url: repo.owner.url.toString(),
                        $isOrganization: repo.owner.isOrganization ? 1 : 0,
                    });
                    ownersStmt.step();

                    repositoriesStmt.bind({
                        $id: repo.id,
                        $name: repo.name,
                        $description: repo.description
                            ? repo.description
                            : null,
                        $url: repo.url.toString(),
                        $homepageUrl: repo.homepageUrl
                            ? repo.homepageUrl.toString()
                            : null,
                        $owner: repo.owner.login,
                        $isArchived: repo.isArchived ? 1 : 0,
                        $isFork: repo.isFork ? 1 : 0,
                        $isPrivate: repo.isPrivate ? 1 : 0,
                        $isTemplate: repo.isTemplate ? 1 : 0,
                        $latestRelease: repo.latestRelease
                            ? JSON.stringify(repo.latestRelease)
                            : null,
                        $license: repo.licenseInfo?.spdxId
                            ? repo.licenseInfo.spdxId
                            : null,
                        $stargazerCount: repo.stargazerCount,
                        $forkCount: repo.forkCount,
                        $createdAt: repo.createdAt
                            ? repo.createdAt.toUTC().toISO()
                            : null,
                        $pushedAt: repo.pushedAt
                            ? repo.pushedAt.toUTC().toISO()
                            : null,
                        $starredAt: repo.starredAt
                            ? repo.starredAt.toUTC().toISO()
                            : null,
                        $updatedAt: repo.updatedAt
                            ? repo.updatedAt.toUTC().toISO()
                            : null,
                        $importedAt: now.toISO(),
                        $languages: repo.languages
                            ? JSON.stringify(repo.languages)
                            : null,
                        $fundingLinks: repo.fundingLinks
                            ? JSON.stringify(repo.fundingLinks)
                            : null,
                    });
                    repositoriesStmt.step();

                    if (repo.repositoryTopics) {
                        removeRepositoriesTopicsStmt.bind({
                            $repoPk: repo.id,
                        });
                        removeRepositoriesTopicsStmt.step();

                        for (const topic of repo.repositoryTopics) {
                            topicsStmt.bind({
                                $name: topic.name,
                                $stargazerCount: topic.stargazerCount,
                            });
                            topicsStmt.step();

                            upsertRepositoriesTopicsStmt.bind({
                                $repoPk: repo.id,
                                $topicPk: topic.name,
                            });
                            upsertRepositoriesTopicsStmt.step();
                        }
                    }

                    importedReposIds.add(repo.id);
                }
                if (stopImport || result.isErr()) {
                    break;
                }
            }

            if (result.isOk()) {
                if (config.fullSync) {
                    // Update unstarred repositories
                    const allReposIds = new Set(
                        single.flatten(
                            db.exec("SELECT id FROM repositories")[0].values,
                        ),
                    );
                    const unstarredReposIds = allReposIds.difference(
                        importedReposIds,
                    ) as Set<string>;

                    if (unstarredReposIds.size) {
                        db.run(
                            `UPDATE repositories SET unstarredAt = ? WHERE id IN ( ${[...unstarredReposIds].fill("?").join(",")} )`,
                            [now.toISO(), ...unstarredReposIds],
                        );
                    }
                }

                db.run("COMMIT;");
            } else {
                db.run("ROLLBACK;");
            }
        } catch (error) {
            db.run("ROLLBACK;");
            console.error("Import transaction failed: ", error);
            result = err(new PluginError(Code.Storage.ImportFailed));
        } finally {
            licensesStmt.free();
            ownersStmt.free();
            topicsStmt.free();
            repositoriesStmt.free();
            removeRepositoriesTopicsStmt.free();
            upsertRepositoriesTopicsStmt.free();
        }
        return result.asyncAndThen(() => this.db.save());
    }

    public getStats(): ResultAsync<Stats, PluginError<Code.Sqlite>> {
        let result = structuredClone(DEFAULT_STATS);

        return this.db.instance.asyncMap(async (db) => {
            const getStatsStmt = db.prepare(getStatsQuery);
            getStatsStmt.step();

            const statsResult = getStatsStmt.getAsObject();
            if (statsResult) {
                result = {
                    starredCount: statsResult.starredCount
                        ? (statsResult.starredCount as number)
                        : 0,
                    unstarredCount: statsResult.unstarredCount
                        ? (statsResult.unstarredCount as number)
                        : 0,
                    lastRepoId: statsResult.lastRepoId
                        ? (statsResult.lastRepoId as string)
                        : undefined,
                };
            }
            getStatsStmt.free();
            return result;
        });
    }

    public getRepositories(): ResultAsync<
        GitHub.Repository[],
        PluginError<Code.Any>
    > {
        if (this.db.instance.isErr()) {
            return errAsync(this.db.instance.error);
        }

        const db = this.db.instance.value;
        const selectRepositoriesStmt = db.prepare(getRepositoriesQuery);
        const selectRepositoryTopicsStmt = db.prepare(getRepositoryTopicsQuery);
        const repos: GitHub.Repository[] = [];

        while (selectRepositoriesStmt.step()) {
            const row = selectRepositoriesStmt.getAsObject();
            const deserializationResult = fromDbObject(row);

            if (deserializationResult.isErr()) {
                selectRepositoriesStmt.free();
                selectRepositoryTopicsStmt.free();
                return errAsync(deserializationResult.error);
            }

            const repo = deserializationResult.value;
            selectRepositoryTopicsStmt.bind({ $repoPk: repo.id });
            while (selectRepositoryTopicsStmt.step()) {
                const topicRow = selectRepositoryTopicsStmt.getAsObject();
                repo.repositoryTopics.push({
                    name: topicRow.name as string,
                    stargazerCount: topicRow.stargazerCount as number,
                });
            }
            repos.push(repo);
        }

        selectRepositoriesStmt.free();
        selectRepositoryTopicsStmt.free();

        return okAsync(repos);
    }

    public removeUnstarredRepositores(): ResultAsync<
        RemovedRepository[],
        PluginError<Code.Any>
    > {
        if (this.db.instance.isErr()) {
            return errAsync(this.db.instance.error);
        }

        const db = this.db.instance.value;
        const removeUnstarredRepositoriesStmt = db.prepare(
            removeUnstarredRepositoriesQuery,
        );
        const removedRepositories: RemovedRepository[] = [];
        let result: ResultAsync<
            RemovedRepository[],
            PluginError<Code.Any>
        > = okAsync(removedRepositories);
        try {
            db.run("BEGIN TRANSACTION;");
            while (removeUnstarredRepositoriesStmt.step()) {
                const row = removeUnstarredRepositoriesStmt.getAsObject();
                removedRepositories.push({
                    owner: row.owner as string,
                    name: row.name as string,
                });
            }
            if (removedRepositories.length) {
                console.debug(removedRepositories);
            }
            const removeOrphanedOwnersResult = db.exec(
                removeOrphanedOwnersQuery,
            );
            if (removeOrphanedOwnersResult.length) {
                console.debug(
                    "Removed orphaned owners: ",
                    removeOrphanedOwnersResult,
                );
            }
            const removeOrphanedLicensesResult = db.exec(
                removeOrphanedLicensesQuery,
            );
            if (removeOrphanedLicensesResult.length) {
                console.debug(
                    "Removed orphaned licenses: ",
                    removeOrphanedLicensesResult,
                );
            }
            const removeOrphanedTopicsResult = db.exec(
                removeOrphanedTopicsQuery,
            );
            if (removeOrphanedTopicsResult.length) {
                console.debug(
                    "Removed orphaned topics: ",
                    removeOrphanedTopicsResult,
                );
            }
            db.run("COMMIT;");
            result = okAsync(removedRepositories);
        } catch (error) {
            db.run("ROLLBACK;");
            result = errAsync(
                new PluginError(Code.Storage.RemoveUnstarredRepositoriesFailed),
            );
        } finally {
            removeUnstarredRepositoriesStmt.free();
        }
        return result.andThrough(() => this.db.save());
    }
}
