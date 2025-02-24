import type { GraphQlQueryResponseData } from "@octokit/graphql";
import { single } from "itertools-ts";
import { DateTime } from "luxon";
import { type Result, err, ok } from "neverthrow";
import type { ParamsObject } from "sql.js";
import { convertStringToURL } from "./utils";

export namespace GitHubGraphQl {
    export interface PageInfo {
        endCursor?: string;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        startCursor: string;
    }

    export interface Owner {
        __typename: string;
        login: string;
        url: string;
    }

    export interface Release {
        name?: string;
        publishedAt?: string;
        url: string;
    }

    export interface License {
        name: string;
        nickname?: string;
        spdxId?: string;
        url?: string;
    }

    export interface Language {
        id: string;
        name: string;
    }

    export interface LanguageEdge {
        node: Language;
    }

    export interface LanguageConnection {
        edges?: LanguageEdge[];
    }

    export interface Topic {
        name: string;
        stargazerCount: number;
    }

    export interface RepositoryTopic {
        topic: Topic;
    }

    export interface RepositoryTopicConnection {
        nodes?: RepositoryTopic[];
    }

    export interface FundingLink {
        url: string;
        platform: string;
    }

    export interface Repository {
        id: string;
        name: string;
        owner: Owner;
        description: string;
        url: string;
        homepageUrl?: string;
        isArchived: boolean;
        isFork: boolean;
        isTemplate: boolean;
        latestRelease?: Release;
        licenseInfo?: License;
        stargazerCount: number;
        forkCount: number;
        isPrivate: boolean;
        createdAt: string;
        pushedAt?: string;
        updatedAt: string;
        languages?: LanguageConnection;
        repositoryTopics: RepositoryTopicConnection;
        fundingLinks: FundingLink[];
    }

    export interface StarredRepositoryEdge {
        starredAt: string;
        node: Repository;
    }

    export interface StarredRepositoryConnection {
        totalCount: number;
        pageInfo: PageInfo;
        edges: StarredRepositoryEdge[];
    }

    export interface AuthenticatedUserResponse {
        starredRepositories: StarredRepositoryConnection;
    }

    export interface StarredRepositoriesResponse {
        viewer: AuthenticatedUserResponse;
    }
}

export namespace GitHub {
    export type LicenseInfo = {
        name?: string;
        nickname?: string;
        spdxId?: string;
        url?: URL;
    };

    export type Release = {
        name?: string;
        publishedAt?: DateTime;
        url: URL;
    };

    export type Owner = {
        login: string;
        url: URL;
        isOrganization: boolean;
    };

    export type Topic = {
        name: string;
        stargazerCount: number;
    };

    export enum FundingPlatform {
        GITHUB = "GitHub",
        PATREON = "Patreon",
        OPEN_COLLECTIVE = "Open Collective Foundation",
        KO_FI = "Ko-fi",
        TIDELIFT = "Tidelift",
        COMMUNITY_BRIDGE = "Community Bridge",
        LIBERAPAY = "Liberapay",
        ISSUEHUNT = "IssueHunt",
        LFX_CROWDFUNDING = "LFX Crowdfunding",
        POLAR = "Polar",
        BUY_ME_A_COFFEE = "Buy Me a Coffee",
        THANKS_DEV = "thanks.dev",
        CUSTOM = "Custom",
    }

    export type FundingLink = {
        url: URL;
        platform: FundingPlatform;
    };

    export class Repository {
        public id!: string;
        public name!: string;
        public description?: string;
        public url!: URL;
        public homepageUrl?: URL;
        public owner!: Owner;
        public isArchived = false;
        public isFork = false;
        public isPrivate = false;
        public isTemplate = false;
        public latestRelease?: Release;
        public licenseInfo?: LicenseInfo;
        public stargazerCount = 0;
        public forkCount = 0;
        public createdAt?: DateTime;
        public importedAt?: DateTime;
        public pushedAt?: DateTime;
        public starredAt?: DateTime;
        public unstarredAt?: DateTime = undefined;
        public updatedAt?: DateTime;
        public languages: string[] = [];
        public repositoryTopics: Topic[] = [];
        public fundingLinks: FundingLink[] = [];

        constructor(data: Partial<Repository>) {
            Object.assign(this, data);
        }

        public get mainLanguage() {
            return this.languages[0] ? this.languages[0] : "Other";
        }

        public get latestReleaseName() {
            return this.latestRelease?.name
                ? this.latestRelease?.name
                : this.latestRelease?.url.pathname.split("/").slice(-1)[0];
        }

        static fromGraphQlData(
            edge: GitHubGraphQl.StarredRepositoryEdge,
        ): Result<Repository, unknown> {
            try {
                const node = edge.node;
                const repo = new Repository({
                    id: node.id,
                    name: node.name,
                    description: node.description,
                    url: new URL(node.url),
                    homepageUrl: node.homepageUrl
                        ? convertStringToURL(node.homepageUrl)
                        : undefined,
                    owner: {
                        login: node.owner.login,
                        url: new URL(node.owner.url),
                        isOrganization:
                            node.owner.__typename === "Organization",
                    },
                    latestRelease: node.latestRelease
                        ? {
                              name: node.latestRelease.name,
                              publishedAt: node.latestRelease.publishedAt
                                  ? DateTime.fromISO(
                                        node.latestRelease.publishedAt,
                                    ).toUTC()
                                  : undefined,
                              url: new URL(node.latestRelease.url),
                          }
                        : undefined,
                    licenseInfo: node.licenseInfo
                        ? {
                              name: node.licenseInfo.name,
                              nickname: node.licenseInfo.nickname,
                              spdxId: node.licenseInfo.spdxId,
                              url: node.licenseInfo.url
                                  ? new URL(node.licenseInfo.url)
                                  : undefined,
                          }
                        : undefined,
                    languages: node.languages?.edges?.map(
                        (e: GraphQlQueryResponseData) => e.node.name,
                    ),
                    isArchived: node.isArchived,
                    isFork: node.isFork,
                    isPrivate: node.isPrivate,
                    isTemplate: node.isTemplate,
                    stargazerCount: node.stargazerCount,
                    forkCount: node.forkCount,
                    createdAt: DateTime.fromISO(node.createdAt).toUTC(),
                    pushedAt: node.pushedAt
                        ? DateTime.fromISO(node.pushedAt).toUTC()
                        : undefined,
                    starredAt: DateTime.fromISO(edge.starredAt).toUTC(),
                    updatedAt: DateTime.fromISO(node.updatedAt).toUTC(),
                });

                if (node.repositoryTopics.nodes) {
                    const sortedTopics: Iterable<GraphQlQueryResponseData> =
                        single.sort(
                            node.repositoryTopics.nodes,
                            (lhs, rhs) =>
                                rhs.topic.stargazerCount -
                                lhs.topic.stargazerCount,
                        );

                    for (const topicNode of sortedTopics) {
                        repo.repositoryTopics.push({
                            name: topicNode.topic.name,
                            stargazerCount: topicNode.topic.stargazerCount,
                        });
                    }
                }

                for (const link of node.fundingLinks) {
                    repo.fundingLinks.push({
                        url: convertStringToURL(link.url),
                        platform:
                            FundingPlatform[
                                link.platform as keyof typeof FundingPlatform
                            ],
                    });
                }

                return ok(repo);
            } catch (error) {
                return err(error);
            }
        }

        static fromDbObject(row: ParamsObject): Result<Repository, unknown> {
            try {
                const parsedLatestRelease = row.latestRelease
                    ? JSON.parse(row.latestRelease as string)
                    : undefined;
                const parsedFundingLinks = row.fundingLinks
                    ? JSON.parse(row.fundingLinks as string)
                    : undefined;
                const repo = new Repository({
                    id: row.id as string,
                    name: row.name as string,
                    description: row.description
                        ? (row.description as string).trim()
                        : undefined,
                    url: new URL(row.url as string),
                    homepageUrl: row.homepageUrl
                        ? new URL(row.homepageUrl as string)
                        : undefined,
                    owner: {
                        login: row.ownerLogin as string,
                        url: new URL(row.ownerUrl as string),
                        isOrganization: !!(row.ownerIsOrganization as number),
                    },
                    isArchived: !!(row.isArchived as number),
                    isFork: !!(row.isFork as number),
                    isPrivate: !!(row.isPrivate as number),
                    isTemplate: !!(row.isTemplate as number),
                    latestRelease: parsedLatestRelease
                        ? {
                              name: parsedLatestRelease.name as string,
                              publishedAt: DateTime.fromISO(
                                  parsedLatestRelease.publishedAt as string,
                              ).toUTC(),
                              url: new URL(parsedLatestRelease.url as string),
                          }
                        : undefined,
                    licenseInfo: row.license
                        ? {
                              spdxId: row.license
                                  ? (row.license as string)
                                  : undefined,
                              name: row.licenseName
                                  ? (row.licenseName as string)
                                  : undefined,
                              nickname: row.licenseNickname
                                  ? (row.licenseNickname as string)
                                  : undefined,
                              url: row.licenseUrl
                                  ? new URL(row.licenseUrl as string)
                                  : undefined,
                          }
                        : undefined,
                    stargazerCount: row.stargazerCount as number,
                    forkCount: row.forkCount as number,
                    createdAt: DateTime.fromISO(
                        row.createdAt as string,
                    ).toUTC(),
                    pushedAt: DateTime.fromISO(row.pushedAt as string).toUTC(),
                    starredAt: DateTime.fromISO(
                        row.starredAt as string,
                    ).toUTC(),
                    unstarredAt: row.unstarredAt
                        ? DateTime.fromISO(row.unstarredAt as string).toUTC()
                        : undefined,
                    updatedAt: DateTime.fromISO(
                        row.updatedAt as string,
                    ).toUTC(),
                    importedAt: DateTime.fromISO(
                        row.importedAt as string,
                    ).toUTC(),
                    languages: row.languages
                        ? JSON.parse(row.languages as string)
                        : [],
                });

                for (const link of parsedFundingLinks) {
                    repo.fundingLinks.push({
                        url: convertStringToURL(link.url),
                        platform: link.platform,
                    });
                }
                return ok(repo);
            } catch (error) {
                return err(error);
            }
        }
    }
}
