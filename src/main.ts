import { GithubStarsPluginApi } from "@/api";
import { SqliteDatabase } from "@/db/sqlite";
import { VaultError } from "@/errors";
import { isEmpty, isMatch, isNull, isUndefined } from "@/helpers";
import { confirm } from "@/modals";
import { GithubRepositoriesService } from "@/services/github";
import { DEFAULT_SETTINGS, type PluginSettings, SettingsTab } from "@/settings";
import { StatusBar, StatusBarAction } from "@/statusBar";
import { PluginStorage } from "@/storage";
import type { GitHub } from "@/types";
import {
    PluginLock,
    getOrCreateFolder,
    removeFile,
    renameFolder,
} from "@/utils";
import Handlebars from "handlebars";
import { DateTime } from "luxon";
import { ResultAsync, err, errAsync, ok, okAsync } from "neverthrow";
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

        // TODO Move it to command callbacks (probably via decorator)
        await getOrCreateFolder(this.app.vault, this.dbFolder);
        const openStorageResult = await this.storage.init(
            this.dbFolder,
            this.settings.dbFileName,
        );
        if (openStorageResult.isErr()) {
            console.error(openStorageResult.error);
            new Notice(`ERROR. ${openStorageResult.error}`);
            return;
        }

        this.statusBar = new StatusBar(this.addStatusBarItem());
        this.updateStats();

        this.addCommand({
            id: "full-sync",
            name: "Synchronize your starred repositories",
            callback: async () => {
                const result = await this.lock.run(async () =>
                    (await this.importDataToStorage())
                        .asyncAndThen(() => this.storage.getRepositories())
                        .andThen((repos) => this.createOrUpdatePages(repos))
                        .andTee(() => this.updateStats())
                        .orElse((error) => {
                            console.error(error);
                            new Notice(`ERROR. ${error}`, 0);
                            return err(error);
                        }),
                );
                return result.match(
                    () => {
                        new Notice(
                            "Done! GitHub stars was imported successfully.",
                        );
                    },
                    (error) => {
                        new Notice(`ERROR. ${error}`, 0);
                    },
                );
            },
        });

        this.addCommand({
            id: "create-pages",
            name: "Create pages",
            callback: async () => {
                const result = await this.lock.run(async () => {
                    return await this.storage
                        .getRepositories()
                        .andThen((repos) => this.createOrUpdatePages(repos))
                        .orElse((error) => {
                            console.error(error);
                            new Notice(`ERROR. ${error}`, 0);
                            return err(error);
                        });
                });
                return result.match(
                    () => {
                        new Notice("Done! Pages was created successfully.");
                    },
                    (error) => {
                        new Notice(`ERROR. ${error}`, 0);
                    },
                );
            },
        });

        this.addCommand({
            id: "remove-unstarred",
            name: "Remove unstarred repositories",
            callback: async () => {
                const result = await this.lock.run(async () => {
                    const removeResult = await (
                        await this.storage.removeUnstarredRepositores()
                    )
                        .asyncAndThen((removedRepos) => {
                            // TODO: Add setting to handle removal of unstarred files
                            return ResultAsync.combine(
                                removedRepos.map((repoName) => {
                                    const unstarredRepoFilePath = `${this.repostioriesFolder}/${repoName.owner}/${repoName.name}.md`;
                                    return removeFile(
                                        this.app.vault,
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
                            new Notice(`ERROR. ${error}`, 0);
                            return err(error);
                        });
                    if (removeResult.isOk() && removeResult.value.length) {
                        return await this.storage
                            .getRepositories()
                            .andThen((repos) => this.createOrUpdatePages(repos))
                            .orElse((error) => {
                                console.error(error);
                                new Notice(`ERROR. ${error}`, 0);
                                return err(error);
                            });
                    }
                    return removeResult;
                });
                return result.match(
                    () => {
                        new Notice(
                            "Done! Unstarred repositories was removed successfully.",
                        );
                    },
                    (error) => {
                        new Notice(`ERROR. ${error}`, 0);
                    },
                );
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

    public saveSettings() {
        return ResultAsync.fromThrowable(
            (settings) => this.saveData(settings),
            (error) => {
                console.error(`ERROR. ${error}`);
                return VaultError.UnableToSaveSettings;
            },
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

    private async importDataToStorage() {
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
            "0%",
        );
        statusBarAction.start();
        const repositoriesGen = service.getUserStarredRepositories(
            this.settings.pageSize,
        );
        const result = await this.storage.import(
            repositoriesGen,
            (count: number) => {
                statusBarAction.updateState(
                    `${Math.floor((count / totalCount) * 100)}%`,
                );
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
                .orElse((error) => {
                    new Notice(`ERROR. ${error}`, 0);
                    statusBarActions.reposPages.stop().failed();
                    return err(error);
                }),
            indexPageByDays
                .andThen(() => {
                    new Notice("Index page by dates created!");
                    statusBarActions.indexByDays.stop().done();
                    return ok();
                })
                .orElse((error) => {
                    new Notice(`ERROR. ${error}`, 0);
                    statusBarActions.indexByDays.stop().failed();
                    return err(error);
                }),
            indexPageByLanguages
                .andThen(() => {
                    new Notice("Index page by languages created!");
                    statusBarActions.indexByLanguages.stop().done();
                    return ok();
                })
                .orElse((error) => {
                    new Notice(`ERROR. ${error}`, 0);
                    statusBarActions.indexByLanguages.stop().failed();
                    return err(error);
                }),
            indexPageByOwners
                .andThen(() => {
                    new Notice("Index page by owners created!");
                    statusBarActions.indexByOwners.stop().done();
                    return ok();
                })
                .orElse((error) => {
                    new Notice(`ERROR. ${error}`, 0);
                    statusBarActions.indexByOwners.stop().failed();
                    return err(error);
                }),
        ])
            .andThen(() => ok())
            .orElse((error) => {
                console.error(error);
                return err(error);
            });
    }

    public async updateSettings(settings: Partial<PluginSettings>) {
        const result = await this.lock.run(async () => {
            const newSettings: Partial<PluginSettings> = {};
            if (
                !isUndefined(settings.accessToken) &&
                this.settings.accessToken !== settings.accessToken
            ) {
                newSettings.accessToken = settings.accessToken;
            }

            if (
                !isUndefined(settings.pageSize) &&
                this.settings.pageSize !== settings.pageSize
            ) {
                newSettings.pageSize = settings.pageSize;
                if (newSettings.pageSize < 1) {
                    newSettings.pageSize = 1;
                }
                if (newSettings.pageSize > 100) {
                    newSettings.pageSize = 100;
                }
            }

            if (
                !isUndefined(settings.destinationFolder) &&
                this.settings.destinationFolder !== settings.destinationFolder
            ) {
                const isRenameConfirmed = await confirm({
                    app: this.app,
                    title: "Rename destination folder?",
                    message: `Destination folder will be renamed from <pre>${this.settings.destinationFolder}</pre> to <pre>${settings.destinationFolder}</pre>`,
                    okButtonText: "Yes",
                    cancelButtonText: "No",
                });
                if (isRenameConfirmed) {
                    newSettings.destinationFolder = settings.destinationFolder;
                }
            }

            if (isEmpty(newSettings) || isMatch(this.settings, newSettings)) {
                console.debug("Nothing to save");
                return okAsync();
            }

            const saveSettings = () => {
                this.settings = { ...this.settings, ...newSettings };
                return this.saveSettings();
            };

            if (!isUndefined(newSettings.destinationFolder)) {
                const isNewDestinationFolderExists = !isNull(
                    this.app.vault.getFolderByPath(
                        newSettings.destinationFolder,
                    ),
                );
                if (isNewDestinationFolderExists) {
                    return errAsync(VaultError.NewDestinationFolderIsExists);
                }
                const currentDestinationFolder = this.app.vault.getFolderByPath(
                    this.settings.destinationFolder,
                );
                if (isNull(currentDestinationFolder)) {
                    return errAsync(VaultError.UnableToRenameDestinationFolder);
                }

                return saveSettings()
                    .andThen(() => this.storage.close())
                    .andThen(() =>
                        renameFolder(
                            this.app.vault,
                            currentDestinationFolder,
                            newSettings.destinationFolder as string,
                        ),
                    )
                    .andThen(() =>
                        this.storage.init(
                            this.dbFolder,
                            this.settings.dbFileName,
                        ),
                    )
                    .andThen(() => this.updateStats());
            }

            return saveSettings();
        });
        return result.match(
            (lockedResult) => {
                return lockedResult.orElse((error) => {
                    new Notice(`ERROR. ${error}`, 0);
                    return err(error);
                });
            },
            (lockError) => {
                new Notice(`ERROR. ${lockError}`, 0);
                return err(lockError);
            },
        );
    }
}
