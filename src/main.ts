import Handlebars from "handlebars";
import { Stream, set, single } from "itertools-ts";
import { DateTime } from "luxon";
import {
    type Result,
    ResultAsync,
    err,
    errAsync,
    ok,
    okAsync,
} from "neverthrow";
import {
    type App,
    type DataWriteOptions,
    Notice,
    Plugin,
    type PluginManifest,
    type TFile,
    normalizePath,
} from "obsidian";
import {
    PluginDatabase,
    type PluginDatabaseError,
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
    selectRepositoriesQuery,
    selectRepositoryTopicsQuery,
} from "./db";
import { PluginLock } from "./lock";
import {
    GithubRepositoriesService,
    type GithubRepositoriesServiceError,
} from "./services";
import { SettingsTab } from "./settings";
import { StatusBar, StatusBarAction } from "./statusBar";
import {
    emptyPage,
    indexPageByDaysTemplate,
    indexPageByLanguagesTemplate,
    indexPageByOwnersTemplate,
    repoPageTemplate,
} from "./templates";
import { GitHub, type Stats } from "./types";

interface PluginSettings {
    pageSize: number;
    accessToken: string;
    destinationFolder: string;
    indexPageByOwnersFileName: string;
    indexPageByDaysFileName: string;
    indexPageByLanguagesFileName: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
    pageSize: 100,
    accessToken: "unknown",
    destinationFolder: normalizePath("GitHub"),
    indexPageByOwnersFileName: "Stars by owners.md",
    indexPageByDaysFileName: "Stars by days.md",
    indexPageByLanguagesFileName: "Stars by languages.md",
};

// TODO: Humanize description
enum PluginError {
    ImportFailed = "ImportFailed",
    CreateFolderFailed = "CreateFolderFailed",
    CreateFileFailed = "CreateFileFailed",
    ProcessingFailed = "ProcessingFailed",
    RemoveUnstarredRepositoriesFailed = "RemoveUnstarredRepositoriesFailed",
    FileCanNotBeRemoved = "FileCanNotBeRemoved",
    FileNotFound = "FileNotFound",
}

type ImportResult = Result<
    void,
    GithubRepositoriesServiceError | PluginError | PluginDatabaseError
>;

export default class GithubStarsPlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    pluginFolder: string;
    private lock = new PluginLock();
    private db: PluginDatabase;
    private placeHolderRegex =
        /(<!-- GITHUB-STARS-START -->\s)([\s\S]*?)(\s<!-- GITHUB-STARS-END -->)/gm;
    private statusBar?: StatusBar;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.pluginFolder = normalizePath(
            `${this.app.vault.configDir}/plugins/${this.manifest.id}`,
        );
        this.db = new PluginDatabase(
            `${this.pluginFolder}/stars.db`,
            this.app.vault.adapter,
        );
    }

    private get repostioriesFolder() {
        return `${this.settings.destinationFolder}/repositories`;
    }

    override async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new SettingsTab(this.app, this));
        this.registerHandlebarsHelpers();

        const dbInitResult = await this.db.init();
        if (dbInitResult.isErr()) {
            console.error(dbInitResult.error);
            new Notice("ERROR. Database initialization is failed!");
            return;
        }

        this.statusBar = new StatusBar(this.addStatusBarItem());
        this.updateStats();

        this.addCommand({
            id: "full-sync",
            name: "Synchronize your starred repositories",
            callback: async () => {
                return this.lock.run(async () => {
                    return await (await this.importDataToDb())
                        .andThen(() => this.getRepositoriesFromDb())
                        .asyncAndThen((repos) => this.createPages(repos))
                        .andTee(() => this.updateStats())
                        .orElse((error) => {
                            console.error(error);
                            return err(error);
                        });
                });
            },
        });

        this.addCommand({
            id: "create-pages",
            name: "Create pages",
            callback: async () => {
                return this.lock.run(async () => {
                    return await this.getRepositoriesFromDb()
                        .asyncAndThen((repos) => this.createPages(repos))
                        .orElse((error) => {
                            console.error(error);
                            return err(error);
                        });
                });
            },
        });

        this.addCommand({
            id: "remove-unstarred",
            name: "Remove unstarred repositories",
            callback: async () => {
                return this.lock.run(async () => {
                    const removeResult = await (
                        await this.removeUnstarredRepositoresFromDb()
                    )
                        .asyncAndThen((removedRepos) => {
                            // TODO: Add setting to handle removal of unstarred files
                            return ResultAsync.combine(
                                removedRepos.map((repoName) => {
                                    const unstarredRepoFilePath = `${this.repostioriesFolder}/${repoName.owner}/${repoName.name}.md`;
                                    return this.removeFile(
                                        unstarredRepoFilePath,
                                    );
                                }),
                            );
                        })
                        .andTee(() => this.updateStats())
                        .orElse((error) => {
                            console.error(
                                `Remove unstarred files error: ${error}`,
                            );
                            return err(error);
                        });
                    if (removeResult.isOk() && removeResult.value.length) {
                        return await this.getRepositoriesFromDb()
                            .asyncAndThen((repos) => this.createPages(repos))
                            .orElse((error) => {
                                console.error(error);
                                return err(error);
                            });
                    }
                    return removeResult;
                });
            },
        });
    }

    override async onunload(): Promise<void> {
        this.unregisterHandlebarsHelpers();
        this.db.close();
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private registerHandlebarsHelpers() {
        Handlebars.registerHelper(
            "dateFormat",
            (date: DateTime, format: string) => {
                return date.toFormat(format);
            },
        );
        Handlebars.registerHelper(
            "dateFormatFromMillis",
            (millis: number, format: string) => {
                return DateTime.fromMillis(millis).toFormat(format);
            },
        );
        Handlebars.registerHelper(
            "searchLanguageUrl",
            (repoUrl: URL, language: string) => {
                const searchUrl = new URL(repoUrl);
                searchUrl.pathname += "/search";
                searchUrl.searchParams.append(
                    "l",
                    language.toLowerCase().replaceAll(" ", "-"),
                );
                return searchUrl.toString();
            },
        );
    }

    private unregisterHandlebarsHelpers() {
        Handlebars.unregisterHelper("dateFormat");
        Handlebars.unregisterHelper("dateFormatFromMillis");
        Handlebars.unregisterHelper("searchLanguageUrl");
    }

    private getOrCreateFolder(path: string) {
        const folder = this.app.vault.getFolderByPath(path);
        if (folder) {
            return okAsync(folder);
        }

        return ResultAsync.fromPromise(
            this.app.vault.createFolder(path),
            () => PluginError.CreateFolderFailed,
        );
    }

    private getOrCreateFile(
        path: string,
        content: string,
        options?: DataWriteOptions,
    ) {
        const file = this.app.vault.getFileByPath(path);
        if (file) {
            return okAsync({
                file,
                isCreated: false,
            });
        }

        return ResultAsync.fromPromise(
            this.app.vault.create(path, content, options),
            () => PluginError.CreateFileFailed,
        ).map((file) => {
            return {
                file,
                isCreated: true,
            };
        });
    }

    private removeFile(path: string) {
        const file = this.app.vault.getFileByPath(path);
        if (!file) {
            return errAsync(PluginError.FileNotFound);
        }
        return ResultAsync.fromPromise(
            this.app.vault.delete(file),
            () => PluginError.FileCanNotBeRemoved,
        );
    }

    private processContentAndFrontMatter(
        file: TFile,
        contentFn: (data: string) => string,
        frontMatterFn: (frontmatter: unknown) => void,
        options?: DataWriteOptions,
    ) {
        const processContent = ResultAsync.fromPromise(
            this.app.vault.process(file, contentFn, options),
            () => PluginError.ProcessingFailed,
        );
        const processFrontMatter = ResultAsync.fromPromise(
            this.app.fileManager.processFrontMatter(
                file,
                frontMatterFn,
                options,
            ),
            () => PluginError.ProcessingFailed,
        );
        return ResultAsync.combine([
            processContent,
            processFrontMatter,
        ]).andThen(([result]) => ok(result));
    }

    private getStatsFromDb(): Result<Stats, PluginDatabaseError> {
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

    private getRepositoriesFromDb(): Result<
        GitHub.Repository[],
        PluginDatabaseError | unknown
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

    private async removeUnstarredRepositoresFromDb() {
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
            PluginDatabaseError | PluginError
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
            result = err(PluginError.RemoveUnstarredRepositoriesFailed);
        } finally {
            removeUnstarredRepositoriesStmt.free();
            // TODO: Handle possible error here
            await this.db.save();
        }
        return result;
    }

    private updateDataWithNewContent(data: string, newContent: string): string {
        return data.replace(
            this.placeHolderRegex,
            (_match, p1, _p2, p3) => `${p1}${newContent}${p3}`,
        );
    }

    private updateOrCreateIndexPageByDays(
        repos: GitHub.Repository[],
    ): ResultAsync<void, PluginError> {
        const statusBarAction = new StatusBarAction(
            this.statusBar as StatusBar,
            "calendar-days",
            "",
        );
        statusBarAction.start();

        const reposByDates = new Map<
            number,
            Map<number, Map<number, GitHub.Repository[]>>
        >();

        for (const repo of repos) {
            const yearKey = repo.starredAt
                ?.startOf("year")
                .toMillis() as number;
            const monthKey = repo.starredAt
                ?.startOf("month")
                .toMillis() as number;
            const dayKey = repo.starredAt?.startOf("day").toMillis() as number;

            let yearGroup = reposByDates.get(yearKey);
            if (!yearGroup) {
                yearGroup = new Map();
                reposByDates.set(yearKey, yearGroup);
            }

            let monthGroup = yearGroup.get(monthKey);
            if (!monthGroup) {
                monthGroup = new Map();
                yearGroup.set(monthKey, monthGroup);
            }

            let dayGroup = monthGroup.get(dayKey);
            if (!dayGroup) {
                dayGroup = [];
                monthGroup.set(dayKey, dayGroup);
            }

            dayGroup.push(repo);
        }

        const starredCount = Stream.of(repos)
            .filter((r) => typeof r.unstarredAt === "undefined")
            .toCount();
        const unstarredCount = Stream.of(repos)
            .filter((r) => !!r.unstarredAt)
            .toCount();

        const processContent = (data: string) =>
            this.updateDataWithNewContent(
                data,
                indexPageByDaysTemplate({
                    reposByDates,
                    repostioriesFolder: this.repostioriesFolder,
                }),
            );
        // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on index page
        const processFrontMatter = (frontmatter: any) => {
            frontmatter.updatedAt = DateTime.utc().toISODate();
            frontmatter.total = repos.length;
            frontmatter.starredCount = starredCount;
            frontmatter.unstarredCount = unstarredCount;
        };

        return this.getOrCreateFolder(this.settings.destinationFolder)
            .andThen((folder) =>
                this.getOrCreateFile(
                    `${folder.path}/${this.settings.indexPageByDaysFileName}`,
                    emptyPage,
                ),
            )
            .andThen(({ file }) =>
                this.processContentAndFrontMatter(
                    file,
                    processContent,
                    processFrontMatter,
                ),
            )
            .andThen(() => {
                new Notice("Index page by dates created!");
                statusBarAction.stop().done();
                return ok();
            })
            .orElse((error) => {
                new Notice(`ERROR. ${error}`, 0);
                statusBarAction.stop().failed();
                return err(error);
            });
    }

    private updateOrCreateIndexPageByLanguages(
        repos: GitHub.Repository[],
    ): ResultAsync<void, PluginError> {
        const statusBarAction = new StatusBarAction(
            this.statusBar as StatusBar,
            "book-a",
            "",
        );
        statusBarAction.start();

        const sortedMainLanguages = set.distinct(
            repos.map((r) => r.mainLanguage).sort(),
        );
        const reposPerLanguage = Stream.of(repos)
            .groupBy((r) => r.mainLanguage)
            .sort();
        const starredCount = Stream.of(repos)
            .filter((r) => typeof r.unstarredAt === "undefined")
            .toCount();
        const unstarredCount = Stream.of(repos)
            .filter((r) => !!r.unstarredAt)
            .toCount();

        const processContent = (data: string) =>
            this.updateDataWithNewContent(
                data,
                indexPageByLanguagesTemplate({
                    reposPerLanguage,
                    languages: sortedMainLanguages,
                    repostioriesFolder: this.repostioriesFolder,
                }),
            );
        // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on index page
        const processFrontMatter = (frontmatter: any) => {
            frontmatter.updatedAt = DateTime.utc().toISODate();
            frontmatter.total = repos.length;
            frontmatter.starredCount = starredCount;
            frontmatter.unstarredCount = unstarredCount;
        };

        return this.getOrCreateFolder(this.settings.destinationFolder)
            .andThen((folder) =>
                this.getOrCreateFile(
                    `${folder.path}/${this.settings.indexPageByLanguagesFileName}`,
                    emptyPage,
                ),
            )
            .andThen(({ file }) =>
                this.processContentAndFrontMatter(
                    file,
                    processContent,
                    processFrontMatter,
                ),
            )
            .andThen(() => {
                new Notice("Index page by languages created!");
                statusBarAction.stop().done();
                return ok();
            })
            .orElse((error) => {
                new Notice(`ERROR. ${error}`, 0);
                statusBarAction.stop().failed();
                return err(error);
            });
    }

    private updateOrCreateIndexPageByOwners(
        repos: GitHub.Repository[],
    ): ResultAsync<void, PluginError> {
        const statusBarAction = new StatusBarAction(
            this.statusBar as StatusBar,
            "users",
            "",
        );
        statusBarAction.start();

        const owners = repos.map((r) => r.owner);
        const alphaSort = (a: string, b: string) =>
            a.toLowerCase().localeCompare(b.toLowerCase());

        const sortedOrgs = set.distinct(
            owners
                .filter((r) => r.isOrganization)
                .map((o) => o.login)
                .sort(alphaSort),
        );
        const sortedUsers = set.distinct(
            owners
                .filter((r) => !r.isOrganization)
                .map((o) => o.login)
                .sort(alphaSort),
        );
        const reposOfOrgs = Stream.of(repos)
            .filter((r) => r.owner.isOrganization)
            .groupBy((r) => r.owner.login)
            .sort();
        const reposOfUsers = Stream.of(repos)
            .filter((r) => !r.owner.isOrganization)
            .groupBy((r) => r.owner.login)
            .sort();
        const starredCount = Stream.of(repos)
            .filter((r) => typeof r.unstarredAt === "undefined")
            .toCount();
        const unstarredCount = Stream.of(repos)
            .filter((r) => !!r.unstarredAt)
            .toCount();

        const processContent = (data: string) =>
            this.updateDataWithNewContent(
                data,
                indexPageByOwnersTemplate({
                    sortedOrgs,
                    sortedUsers,
                    reposOfOrgs,
                    reposOfUsers,
                    repostioriesFolder: this.repostioriesFolder,
                }),
            );
        // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on index page
        const processFrontMatter = (frontmatter: any) => {
            frontmatter.updatedAt = DateTime.utc().toISODate();
            frontmatter.total = repos.length;
            frontmatter.starredCount = starredCount;
            frontmatter.unstarredCount = unstarredCount;
        };

        return this.getOrCreateFolder(this.settings.destinationFolder)
            .andThen((folder) =>
                this.getOrCreateFile(
                    `${folder.path}/${this.settings.indexPageByOwnersFileName}`,
                    emptyPage,
                ),
            )
            .andThen(({ file }) =>
                this.processContentAndFrontMatter(
                    file,
                    processContent,
                    processFrontMatter,
                ),
            )
            .andThen(() => {
                new Notice("Index page by owners created!");
                statusBarAction.stop().done();
                return ok();
            })
            .orElse((error) => {
                new Notice(`ERROR. ${error}`, 0);
                statusBarAction.stop().failed();
                return err(error);
            });
    }

    private updateOrCreateRepositoriesPages(
        repos: GitHub.Repository[],
    ): ResultAsync<void, PluginError> {
        const statusBarAction = new StatusBarAction(
            this.statusBar as StatusBar,
            "folder-sync",
            "0%",
        );
        statusBarAction.start();

        let createdPages = 0;
        let updatedPages = 0;
        const total = repos.length;
        const results: ResultAsync<string, PluginError>[] = [];

        for (const repo of repos) {
            const processContent = (data: string) =>
                this.updateDataWithNewContent(
                    data,
                    repoPageTemplate(
                        {
                            repo,
                        },
                        {
                            allowedProtoProperties: {
                                latestReleaseName: true,
                            },
                        },
                    ),
                );
            // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on repository page
            const processFrontMatter = (frontmatter: any) => {
                frontmatter.url = repo.url.toString();
                if (repo.homepageUrl) {
                    frontmatter.homepageUrl = repo.homepageUrl;
                } else {
                    // biome-ignore lint/performance/noDelete: FrontMatter mutation
                    delete frontmatter.homepageUrl;
                }
                frontmatter.isArchived = repo.isArchived;
                frontmatter.isFork = repo.isFork;
                frontmatter.isPrivate = repo.isPrivate;
                frontmatter.isTemplate = repo.isTemplate;
                frontmatter.stargazerCount = repo.stargazerCount;
                frontmatter.forkCount = repo.forkCount;
                frontmatter.createdAt = repo.createdAt?.toISODate();
                frontmatter.importedAt = repo.importedAt?.toISODate();
                frontmatter.pushedAt = repo.pushedAt?.toISODate();
                frontmatter.starredAt = repo.starredAt?.toISODate();
                frontmatter.updatedAt = repo.updatedAt?.toISODate();
                if (repo.unstarredAt) {
                    frontmatter.unstarredAt = repo.unstarredAt.toISODate();
                } else {
                    // biome-ignore lint/performance/noDelete: FrontMatter mutation
                    delete frontmatter.unstarredAt;
                }
                if (repo.repositoryTopics.length) {
                    frontmatter.topics = repo.repositoryTopics.map(
                        (t) => t.name,
                    );
                } else {
                    // biome-ignore lint/performance/noDelete: FrontMatter mutation
                    delete frontmatter.topics;
                }
            };

            const result = this.getOrCreateFolder(
                `${this.repostioriesFolder}/${repo.owner.login}`,
            )
                .andThen((folder) =>
                    this.getOrCreateFile(
                        `${folder.path}/${repo.name}.md`,
                        emptyPage,
                    ),
                )
                .andTee(({ isCreated }) => {
                    if (isCreated) {
                        createdPages++;
                    } else {
                        updatedPages++;
                    }
                    statusBarAction.updateState(
                        `${Math.floor(((createdPages + updatedPages) / total) * 100)}%`,
                    );
                })
                .andThen(({ file }) =>
                    this.processContentAndFrontMatter(
                        file,
                        processContent,
                        processFrontMatter,
                    ),
                );
            results.push(result);
        }

        return ResultAsync.combine(results)
            .andThen(() => {
                new Notice(
                    `Pages creation was finished! Created ${createdPages}, updated ${updatedPages}`,
                    10000,
                );
                statusBarAction.stop().done();
                return ok();
            })
            .orElse((error) => {
                new Notice(`ERROR. ${error}`, 0);
                statusBarAction.stop().failed();
                return err(error);
            });
    }

    // TODO: Refactor this method
    private async importDataToDb(): Promise<ImportResult> {
        const service = new GithubRepositoriesService(
            this.settings.accessToken,
        );
        const totalCountResult =
            await service.getTotalStarredRepositoriesCount();

        if (totalCountResult.isErr()) {
            return err(totalCountResult.error);
        }

        if (this.db.instance.isErr()) {
            return err(this.db.instance.error);
        }

        const totalCount = totalCountResult.value;
        new Notice(
            `Start import of ${totalCount} GitHub stars (page size is ${this.settings.pageSize} items)…`,
        );

        const now = DateTime.utc();
        const statusBarAction = new StatusBarAction(
            this.statusBar as StatusBar,
            "download",
            "0%",
        );
        statusBarAction.start();

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
        const importedOwners: Set<string> = new Set();
        const importedTopics: Set<string> = new Set();
        const importedLicenses: Set<string> = new Set();

        let result: Result<void, PluginError | GithubRepositoriesServiceError> =
            ok();
        const repositoriesGen = service.getUserStarredRepositories(
            this.settings.pageSize,
        );

        try {
            db.run("BEGIN TRANSACTION;");
            for await (const partResult of repositoriesGen) {
                if (partResult.isErr()) {
                    result = err(partResult.error);
                    break;
                }
                for (const repo of partResult.value) {
                    statusBarAction.updateState(
                        `${Math.floor((importedReposIds.size / totalCount) * 100)}%`,
                    );
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
                    importedOwners.add(repo.owner.login);
                    repo.repositoryTopics.map((t) =>
                        importedTopics.add(t.name),
                    );
                    if (repo.licenseInfo?.spdxId) {
                        importedLicenses.add(repo.licenseInfo.spdxId);
                    }
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
            result = err(PluginError.ImportFailed);
        } finally {
            licensesStmt.free();
            ownersStmt.free();
            topicsStmt.free();
            repositoriesStmt.free();
            removeRepositoriesTopicsStmt.free();
            upsertRepositoriesTopicsStmt.free();

            // TODO: Handle possible error here
            await this.db.save();
            statusBarAction.stop();
        }

        if (result.isOk()) {
            new Notice("Import of your GitHub stars was successful!");
            statusBarAction.done();
        } else {
            new Notice(
                "ERROR. Import of your GitHub starred repositories was failed!",
                0,
            );
            statusBarAction.failed();
        }
        return result;
    }

    private updateStats() {
        return this.getStatsFromDb()
            .map((stats) =>
                this.statusBar?.updateStats(
                    stats.starredCount,
                    stats.unstarredCount,
                ),
            )
            .andThen(() => ok())
            .orElse((error) => {
                console.error(error);
                return err(error);
            });
    }

    private createPages(repos: GitHub.Repository[]) {
        new Notice("Creation of pages for your GitHub stars was started…");
        return ResultAsync.combine([
            this.updateOrCreateRepositoriesPages(repos),
            this.updateOrCreateIndexPageByDays(repos),
            this.updateOrCreateIndexPageByLanguages(repos),
            this.updateOrCreateIndexPageByOwners(repos),
        ])
            .andThen(() => ok())
            .orElse((error) => {
                console.error(error);
                return err(error);
            });
    }
}
