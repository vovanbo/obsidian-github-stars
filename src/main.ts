import { GithubStarsPluginApi } from "@/api";
import { SqliteDatabase } from "@/db/sqlite";
import { Code, PluginError } from "@/errors";
import { isEmpty, isMatch, isNull, isUndefined } from "@/helpers";
import { confirm } from "@/modals";
import { GithubRepositoriesService } from "@/services/github";
import { DEFAULT_SETTINGS, type PluginSettings, SettingsTab } from "@/settings";
import { StatusBar, StatusBarAction } from "@/statusBar";
import {
    type ImportConfig,
    PluginStorage,
    type RemovedRepository,
} from "@/storage";
import type { GitHub } from "@/types";
import {
    PluginLock,
    getOrCreateFolder,
    removeFile,
    renameFolder,
} from "@/utils";
import Handlebars from "handlebars";
import { DateTime } from "luxon";
import {
    type Result,
    ResultAsync,
    err,
    errAsync,
    ok,
    okAsync,
} from "neverthrow";
import { type App, Notice, Plugin, type PluginManifest } from "obsidian";

export default class GithubStarsPlugin extends Plugin {
    storage: PluginStorage;
    settings: PluginSettings = DEFAULT_SETTINGS;
    api: GithubStarsPluginApi;
    private lock = new PluginLock();
    private statusBar?: StatusBar;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.storage = new PluginStorage(
            new SqliteDatabase(this.app.vault.adapter),
        );
        this.api = new GithubStarsPluginApi(
            this.app.vault,
            this.app.fileManager,
        );
    }

    private get dbFolder() {
        return `${this.settings.destinationFolder}/db`;
    }

    private get repostioriesFolder() {
        return `${this.settings.destinationFolder}/repositories`;
    }

    override async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new SettingsTab(this.app, this));
        this.registerHandlebarsHelpers();
        this.statusBar = new StatusBar(this.addStatusBarItem());
        this.statusBar.updateStats(
            this.settings.stats.starredCount,
            this.settings.stats.unstarredCount,
        );

        this.addCommand({
            id: "sync",
            name: "Synchronize your starred repositories",
            callback: async () => {
                const config: ImportConfig = {
                    fullSync: true,
                    removeUnstarred: true,
                    lastRepoId: this.settings.stats.lastRepoId,
                };

                const isFirstSync = isUndefined(this.settings.stats.lastRepoId);
                // First sync will be always full
                if (!isFirstSync) {
                    config.fullSync = await confirm({
                        app: this.app,
                        title: "Do you want to make a full synchronization?",
                        message:
                            "Full sync will update all the data related to your starred repositories, but may take more significant time.",
                        okButtonText: "Yes",
                        cancelButtonText: "No",
                    });

                    if (config.fullSync) {
                        config.removeUnstarred = await confirm({
                            app: this.app,
                            title: "Do you want to remove unstarred repositories?",
                            message:
                                'If you want to leave files related to unstarred repositories after import say "No". You can remove them later manually.',
                            okButtonText: "Yes",
                            cancelButtonText: "No",
                        });
                    }
                }

                const result = await this.lock.run(() => {
                    const doImportDataToStorage = ResultAsync.fromPromise(
                        this.importDataToStorage(config),
                        () => new PluginError(Code.Api.ImportFailed),
                    ).andThen((result) => {
                        if (result.isErr()) {
                            return err(result.error);
                        }
                        return ok(result.value);
                    });

                    return this.prepareStorage()
                        .andThen(() => doImportDataToStorage)
                        .andThrough(() => {
                            if (!config.removeUnstarred) {
                                return okAsync();
                            }
                            return this.removeUnstarredRepositories();
                        })
                        .andThen(() => this.storage.getRepositories())
                        .andThen((repos) => this.createOrUpdatePages(repos))
                        .andTee(() => this.updateStats())
                        .andThrough(() => this.storage.close())
                        .orTee((error) => error.log().notice());
                });
                return result.orTee((error) => error.log().notice());
            },
        });

        this.addCommand({
            id: "update-pages",
            name: "Update or create pages without sync",
            callback: async () => {
                const result = await this.lock.run(() => {
                    return this.prepareStorage()
                        .andThen((storage) => storage.getRepositories())
                        .andThen((repos) => this.createOrUpdatePages(repos))
                        .andTee(() => this.updateStats())
                        .andThrough(() => this.storage.close())
                        .orTee((error) => error.log().notice());
                });
                return result.orTee((error) => error.log().notice());
            },
        });

        this.addCommand({
            id: "remove-unstarred",
            name: "Remove unstarred repositories",
            callback: async () => {
                const result = await this.lock.run(() => {
                    return this.prepareStorage()
                        .andThen(() => this.removeUnstarredRepositories())
                        .andTee(() => this.updateStats())
                        .andThen(() => this.storage.getRepositories())
                        .andThen((repos) => this.createOrUpdatePages(repos))
                        .andThrough(() => this.storage.close())
                        .orTee((error) => error.log().notice());
                });
                return result.orTee((error) => error.log().notice());
            },
        });
    }

    override async onunload(): Promise<void> {
        this.unregisterHandlebarsHelpers();
        this.storage.close();
    }

    public async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    public saveSettings(
        newSettings?: Partial<PluginSettings>,
    ): ResultAsync<void, PluginError<Code.Vault>> {
        if (!isUndefined(newSettings)) {
            if (isEmpty(newSettings) || isMatch(this.settings, newSettings)) {
                console.debug("Nothing to save");
                return okAsync();
            }

            this.settings = { ...this.settings, ...newSettings };
        }

        return ResultAsync.fromThrowable(
            (settings) => this.saveData(settings),
            () => new PluginError(Code.Vault.UnableToSaveSettings),
        )(this.settings);
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

    private prepareStorage(): ResultAsync<
        PluginStorage,
        PluginError<Code.Vault> | PluginError<Code.Storage>
    > {
        return getOrCreateFolder(this.app.vault, this.dbFolder).andThen(
            (dbFolder) =>
                this.storage.init(dbFolder.path, this.settings.dbFileName),
        );
    }

    private async importDataToStorage(
        config: ImportConfig,
    ): Promise<Result<void, PluginError<Code.Any>>> {
        const service = new GithubRepositoriesService(
            this.settings.accessToken,
        );
        const totalCountResult =
            await service.getTotalStarredRepositoriesCount();

        if (totalCountResult.isErr()) {
            return err(totalCountResult.error);
        }

        const totalCount = totalCountResult.value;
        new Notice(
            `Start import of ${totalCount} GitHub stars (page size is ${this.settings.pageSize} items)…`,
        );

        const statusBarAction = new StatusBarAction(
            this.statusBar as StatusBar,
            "download",
            config.fullSync ? "0%" : "",
        );
        statusBarAction.start();
        const repositoriesGen = service.getUserStarredRepositories(
            this.settings.pageSize,
        );
        const result = await this.storage.import(
            repositoriesGen,
            config,
            (count: number) => {
                if (config.fullSync) {
                    statusBarAction.updateState(
                        `${Math.floor((count / totalCount) * 100)}%`,
                    );
                }
            },
        );

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
        return this.storage
            .getStats()
            .map((stats) => {
                this.settings.stats = stats;
                this.statusBar?.updateStats(
                    stats.starredCount,
                    stats.unstarredCount,
                );
            })
            .andThen(() => this.saveSettings())
            .orElse((error) => {
                console.error(error);
                return err(error);
            });
    }

    private createOrUpdatePages(repos: GitHub.Repository[]) {
        new Notice("Creation of pages for your GitHub stars was started…");

        const total = repos.length;
        const statusBarActions: Record<string, StatusBarAction> = {
            indexByDays: new StatusBarAction(
                this.statusBar as StatusBar,
                "calendar-days",
                "",
            ),
            indexByLanguages: new StatusBarAction(
                this.statusBar as StatusBar,
                "book-a",
                "",
            ),
            indexByOwners: new StatusBarAction(
                this.statusBar as StatusBar,
                "users",
                "",
            ),
            reposPages: new StatusBarAction(
                this.statusBar as StatusBar,
                "folder-sync",
                "0%",
            ),
        };
        for (const statusBarAction of Object.values(statusBarActions)) {
            statusBarAction.start();
        }

        const pagesOfRepositories = this.api.createOrUpdateRepositoriesPages(
            repos,
            this.repostioriesFolder,
            (createdPages, updatedPages) => {
                statusBarActions.reposPages.updateState(
                    `${Math.floor(((createdPages + updatedPages) / total) * 100)}%`,
                );
            },
        );
        const indexPageByDays = this.api.createOrUpdateIndexPageByDays(
            repos,
            this.settings.destinationFolder,
            this.repostioriesFolder,
            this.settings.indexPageByDaysFileName,
        );
        const indexPageByLanguages =
            this.api.createOrUpdateIndexPageByLanguages(
                repos,
                this.settings.destinationFolder,
                this.repostioriesFolder,
                this.settings.indexPageByLanguagesFileName,
            );
        const indexPageByOwners = this.api.createOrUpdateIndexPageByOwners(
            repos,
            this.settings.destinationFolder,
            this.repostioriesFolder,
            this.settings.indexPageByOwnersFileName,
        );

        return ResultAsync.combine([
            pagesOfRepositories
                .andThen(({ createdPages, updatedPages }) => {
                    new Notice(
                        `Pages creation was finished! Created ${createdPages}, updated ${updatedPages}`,
                        10000,
                    );
                    statusBarActions.reposPages.stop().done();
                    return ok();
                })
                .orTee(() => statusBarActions.reposPages.stop().failed()),
            indexPageByDays
                .andThen(() => {
                    new Notice("Index page by dates created!");
                    statusBarActions.indexByDays.stop().done();
                    return ok();
                })
                .orTee(() => statusBarActions.indexByDays.stop().failed()),
            indexPageByLanguages
                .andThen(() => {
                    new Notice("Index page by languages created!");
                    statusBarActions.indexByLanguages.stop().done();
                    return ok();
                })
                .orTee(() => statusBarActions.indexByLanguages.stop().failed()),
            indexPageByOwners
                .andThen(() => {
                    new Notice("Index page by owners created!");
                    statusBarActions.indexByOwners.stop().done();
                    return ok();
                })
                .orTee(() => statusBarActions.indexByOwners.stop().failed()),
        ])
            .andThen(() => ok())
            .orTee((error) => error.log().notice());
    }

    private removeUnstarredRepositories(
        withFiles = true,
    ): ResultAsync<RemovedRepository[], PluginError<Code.Any>> {
        const storageRemoveResult = ResultAsync.fromPromise(
            this.storage.removeUnstarredRepositores(),
            () => new PluginError(Code.Api.ProcessingFailed),
        ).andThen((result) => {
            if (result.isErr()) {
                return err(result.error);
            }
            return ok(result.value);
        });

        return storageRemoveResult.andThrough((removedRepos) => {
            if (!withFiles) {
                return okAsync();
            }
            return ResultAsync.combine(
                removedRepos.map((repo) => {
                    const unstarredRepoFilePath = `${this.repostioriesFolder}/${repo.owner}/${repo.name}.md`;
                    return removeFile(
                        this.app.vault,
                        this.app.fileManager,
                        unstarredRepoFilePath,
                    );
                }),
            );
        });
    }

    private renameDestinationFolder(
        oldPath: string,
        newPath: string,
    ): ResultAsync<string, PluginError<Code.Vault>> {
        const isNewDestinationFolderExists = !isNull(
            this.app.vault.getFolderByPath(newPath),
        );
        if (isNewDestinationFolderExists) {
            return errAsync(
                new PluginError(Code.Vault.NewDestinationFolderIsExists),
            );
        }
        const currentDestinationFolder =
            this.app.vault.getFolderByPath(oldPath);
        if (isNull(currentDestinationFolder)) {
            return errAsync(
                new PluginError(Code.Vault.UnableToRenameDestinationFolder),
            );
        }

        return renameFolder(
            this.app.vault,
            currentDestinationFolder,
            newPath,
        ).map(() => newPath);
    }

    public async updateSettings(settings: Partial<PluginSettings>) {
        const oldSettings = structuredClone(this.settings);
        const result = await this.lock.run(() => {
            return this.saveSettings(settings).andThrough(() => {
                if (isUndefined(settings.destinationFolder)) {
                    return okAsync();
                }
                return this.renameDestinationFolder(
                    oldSettings.destinationFolder,
                    settings.destinationFolder,
                );
            });
        });
        return result.orTee((error) => error.log().notice());
    }
}
