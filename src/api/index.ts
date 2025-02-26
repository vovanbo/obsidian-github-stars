import type { VaultError } from "@/errors";
import indexPageByDaysTemplate from "@/templates/indexPageByDays.hbs";
import indexPageByLanguagesTemplate from "@/templates/indexPageByLanguages.hbs";
import indexPageByOwnersTemplate from "@/templates/indexPageByOwners.hbs";
import repoPageTemplate from "@/templates/repoPage.hbs";
import type { GitHub } from "@/types";
import { getOrCreateFile, getOrCreateFolder } from "@/utils";
import { Stream, set } from "itertools-ts";
import { DateTime } from "luxon";
import { ResultAsync, ok } from "neverthrow";
import type { DataWriteOptions, FileManager, TFile, Vault } from "obsidian";
import { PluginApiError } from "./errors";

export const emptyPage = `<!-- GITHUB-STARS-START -->

<!-- GITHUB-STARS-END -->

---
`;

export class GithubStarsPluginApi {
    private vault: Vault;
    private fileManager: FileManager;
    private placeHolderRegex =
        /(<!-- GITHUB-STARS-START -->\s)([\s\S]*?)(\s<!-- GITHUB-STARS-END -->)/gm;

    constructor(vault: Vault, fileManager: FileManager) {
        this.vault = vault;
        this.fileManager = fileManager;
    }

    private processContentAndFrontMatter(
        file: TFile,
        contentFn: (data: string) => string,
        frontMatterFn: (frontmatter: unknown) => void,
        options?: DataWriteOptions,
    ) {
        const processContent = ResultAsync.fromPromise(
            this.vault.process(file, contentFn, options),
            () => PluginApiError.ProcessingFailed,
        );
        const processFrontMatter = ResultAsync.fromPromise(
            this.fileManager.processFrontMatter(file, frontMatterFn, options),
            () => PluginApiError.ProcessingFailed,
        );
        return ResultAsync.combine([
            processContent,
            processFrontMatter,
        ]).andThen(([result]) => ok(result));
    }

    private updateDataWithNewContent(data: string, newContent: string): string {
        return data.replace(
            this.placeHolderRegex,
            (_match, p1, _p2, p3) => `${p1}${newContent}${p3}`,
        );
    }

    public createOrUpdateIndexPageByDays(
        repos: GitHub.Repository[],
        destinationFolder: string,
        repostioriesFolder: string,
        filename: string,
    ): ResultAsync<string, PluginApiError | VaultError> {
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
                    repostioriesFolder,
                }),
            );
        // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on index page
        const processFrontMatter = (frontmatter: any) => {
            frontmatter.updatedAt = DateTime.utc().toISODate();
            frontmatter.total = repos.length;
            frontmatter.starredCount = starredCount;
            frontmatter.unstarredCount = unstarredCount;
        };

        return getOrCreateFolder(this.vault, destinationFolder)
            .andThen((folder) =>
                getOrCreateFile(
                    this.vault,
                    `${folder.path}/${filename}`,
                    emptyPage,
                ),
            )
            .andThen(({ file }) =>
                this.processContentAndFrontMatter(
                    file,
                    processContent,
                    processFrontMatter,
                ),
            );
    }

    public createOrUpdateIndexPageByLanguages(
        repos: GitHub.Repository[],
        destinationFolder: string,
        repostioriesFolder: string,
        filename: string,
    ): ResultAsync<string, PluginApiError | VaultError> {
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
                    repostioriesFolder,
                }),
            );
        // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on index page
        const processFrontMatter = (frontmatter: any) => {
            frontmatter.updatedAt = DateTime.utc().toISODate();
            frontmatter.total = repos.length;
            frontmatter.starredCount = starredCount;
            frontmatter.unstarredCount = unstarredCount;
        };

        return getOrCreateFolder(this.vault, destinationFolder)
            .andThen((folder) =>
                getOrCreateFile(
                    this.vault,
                    `${folder.path}/${filename}`,
                    emptyPage,
                ),
            )
            .andThen(({ file }) =>
                this.processContentAndFrontMatter(
                    file,
                    processContent,
                    processFrontMatter,
                ),
            );
    }

    public createOrUpdateIndexPageByOwners(
        repos: GitHub.Repository[],
        destinationFolder: string,
        repostioriesFolder: string,
        filename: string,
    ): ResultAsync<string, PluginApiError | VaultError> {
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
                    repostioriesFolder,
                }),
            );
        // biome-ignore lint/suspicious/noExplicitAny: TODO type of FrontMatter on index page
        const processFrontMatter = (frontmatter: any) => {
            frontmatter.updatedAt = DateTime.utc().toISODate();
            frontmatter.total = repos.length;
            frontmatter.starredCount = starredCount;
            frontmatter.unstarredCount = unstarredCount;
        };

        return getOrCreateFolder(this.vault, destinationFolder)
            .andThen((folder) =>
                getOrCreateFile(
                    this.vault,
                    `${folder.path}/${filename}`,
                    emptyPage,
                ),
            )
            .andThen(({ file }) =>
                this.processContentAndFrontMatter(
                    file,
                    processContent,
                    processFrontMatter,
                ),
            );
    }

    public createOrUpdateRepositoriesPages(
        repos: GitHub.Repository[],
        repostioriesFolder: string,
        progressCallback: (createdPages: number, updatedPages: number) => void,
    ): ResultAsync<
        { createdPages: number; updatedPages: number },
        PluginApiError | VaultError
    > {
        let createdPages = 0;
        let updatedPages = 0;
        const results: ResultAsync<string, PluginApiError | VaultError>[] = [];

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

            const result = getOrCreateFolder(
                this.vault,
                `${repostioriesFolder}/${repo.owner.login}`,
            )
                .andThen((folder) =>
                    getOrCreateFile(
                        this.vault,
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
                    progressCallback(createdPages, updatedPages);
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

        return ResultAsync.combine(results).andThen(() =>
            ok({ createdPages, updatedPages }),
        );
    }
}
