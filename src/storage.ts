import { single } from "itertools-ts";
import { DateTime } from "luxon";
import { type Result, err, ok } from "neverthrow";
import {
    type GithubRepositoriesServiceError,
    PluginStorageError,
    type SqliteDatabaseError,
} from "./errors";
import {
    getStatsQuery,
    insertLicensesQuery,
    insertOwnersQuery,
    insertRepositoriesQuery,
    insertRepositoriesTopicsQuery,
    insertTopicsQuery,
    removeOrphanedLicensesQuery,
    removeOrphanedOwnersQuery,
    removeOrphanedTopicsQuery,
    removeRepositoriesTopicsQuery,
    removeUnstarredRepositoriesQuery,
    schemaQuery,
    selectRepositoriesQuery,
    selectRepositoryTopicsQuery,
} from "./queries";
import type { SqliteDatabase } from "./sqlite";
import { GitHub } from "./types";

export type Stats = {
    starredCount: number;
    unstarredCount: number;
    lastRepoId?: string;
    lastStarDate?: DateTime;
    lastImportDate?: DateTime;
};

export class PluginStorage {
    private db: SqliteDatabase;

    constructor(db: SqliteDatabase) {
        this.db = db;
    }

    public async init(dbFolder: string, dbFile: string) {
        return this.db
            .init(dbFolder, dbFile)
            .andThen((db) => {
                try {
                    db.run(schemaQuery);
                    return ok(db);
                } catch (e) {
                    console.error(`Database error: ${e}`);
                    return err(PluginStorageError.SchemaCreationFailed);
                }
            })
            .andThrough(() => this.db.save())
            .andThen(() => ok(this))
            .orElse((error) => {
                console.error(`ERROR. ${error}`);
                this.close();
                return err(PluginStorageError.InitializationFailed);
            });
    }

    public close() {
        return this.db.close();
    }

    public async import(
        repositoriesGen: AsyncGenerator<
            Result<GitHub.Repository[], GithubRepositoriesServiceError>,
            void,
            unknown
        >,
        progressCallback: (count: number) => void,
    ): Promise<
        Result<
            void,
            | PluginStorageError
            | GithubRepositoriesServiceError
            | SqliteDatabaseError
        >
    > {
        if (this.db.instance.isErr()) {
            return err(this.db.instance.error);
        }

        const now = DateTime.utc();
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

        const importedReposIds: Set<string> = new Set();

        let result: Result<
            void,
            PluginStorageError | GithubRepositoriesServiceError
        > = ok();
        try {
            db.run("BEGIN TRANSACTION;");
            for await (const partResult of repositoriesGen) {
                if (partResult.isErr()) {
                    result = err(partResult.error);
                    break;
                }
                for (const repo of partResult.value) {
                    progressCallback(importedReposIds.size);
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
            }

            if (result.isOk()) {
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

                db.run("COMMIT;");
            } else {
                db.run("ROLLBACK;");
            }
        } catch (error) {
            db.run("ROLLBACK;");
            console.error("Import transaction failed: ", error);
            result = err(PluginStorageError.ImportFailed);
        } finally {
            licensesStmt.free();
            ownersStmt.free();
            topicsStmt.free();
            repositoriesStmt.free();
            removeRepositoriesTopicsStmt.free();
            upsertRepositoriesTopicsStmt.free();

            // TODO: Handle possible error here
            await this.db.save();
        }
        return result;
    }

    public getStats(): Result<Stats, SqliteDatabaseError> {
        let result: Stats = {
            starredCount: 0,
            unstarredCount: 0,
            lastRepoId: undefined,
            lastStarDate: undefined,
            lastImportDate: undefined,
        };

        return this.db.instance.map((db) => {
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
                    lastStarDate: statsResult.lastStarDate
                        ? DateTime.fromISO(
                              statsResult.lastStarDate as string,
                          ).toUTC()
                        : undefined,
                    lastImportDate: statsResult.lastImportDate
                        ? DateTime.fromISO(
                              statsResult.lastImportDate as string,
                          ).toUTC()
                        : undefined,
                };
            }
            getStatsStmt.free();
            return result;
        });
    }

    public getRepositories(): Result<
        GitHub.Repository[],
        SqliteDatabaseError | unknown
    > {
        if (this.db.instance.isErr()) {
            return err(this.db.instance.error);
        }

        const db = this.db.instance.value;
        const selectRepositoriesStmt = db.prepare(selectRepositoriesQuery);
        const selectRepositoryTopicsStmt = db.prepare(
            selectRepositoryTopicsQuery,
        );
        const repos: GitHub.Repository[] = [];

        while (selectRepositoriesStmt.step()) {
            const row = selectRepositoriesStmt.getAsObject();
            const deserializeResult = GitHub.Repository.fromDbObject(row);

            if (deserializeResult.isErr()) {
                selectRepositoriesStmt.free();
                selectRepositoryTopicsStmt.free();
                return err(deserializeResult.error);
            }

            const repo = deserializeResult.value;
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

        return ok(repos);
    }

    public async removeUnstarredRepositores() {
        if (this.db.instance.isErr()) {
            return err(this.db.instance.error);
        }

        const db = this.db.instance.value;
        const removeUnstarredRepositoriesStmt = db.prepare(
            removeUnstarredRepositoriesQuery,
        );
        const removedRepositories: { owner: string; name: string }[] = [];
        let result: Result<
            typeof removedRepositories,
            SqliteDatabaseError | PluginStorageError
        > = ok(removedRepositories);
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
                    "Removed orhaned owners: ",
                    removeOrphanedOwnersResult,
                );
            }
            const removeOrphanedLicensesResult = db.exec(
                removeOrphanedLicensesQuery,
            );
            if (removeOrphanedLicensesResult.length) {
                console.debug(
                    "Removed orhaned licenses: ",
                    removeOrphanedLicensesResult,
                );
            }
            const removeOrphanedTopicsResult = db.exec(
                removeOrphanedTopicsQuery,
            );
            if (removeOrphanedTopicsResult.length) {
                console.debug(
                    "Removed orhaned topics: ",
                    removeOrphanedTopicsResult,
                );
            }
            db.run("COMMIT;");
            result = ok(removedRepositories);
        } catch (error) {
            db.run("ROLLBACK;");
            result = err(PluginStorageError.RemoveUnstarredRepositoriesFailed);
        } finally {
            removeUnstarredRepositoriesStmt.free();
            // TODO: Handle possible error here
            await this.db.save();
        }
        return result;
    }
}
