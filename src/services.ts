import { Octokit } from "@octokit/core";
import type { GraphQlQueryResponseData } from "@octokit/graphql";
import { retry } from "@octokit/plugin-retry";
import { Result, ResultAsync, err, ok } from "neverthrow";
import { GitHub } from "./types";

const totalStarredRepositoriesCountQuery = `
query () {
    viewer {
        starredRepositories(first: 1) {
            totalCount
        }
    }
}
`;

const starredRepositoriesQuery = `
query ($after: String, $pageSize: Int) {
    viewer {
        starredRepositories(first: $pageSize, after: $after, orderBy: {direction: DESC, field: STARRED_AT}) {
            totalCount
            pageInfo {
                endCursor
                hasNextPage
            }

            edges {
                starredAt
                node {
                    id
                    name
                    owner {
                        __typename
                        login
                        url
                    }
                    description
                    url
                    homepageUrl
                    isArchived
                    isFork
                    isTemplate
                    latestRelease {
                        name
                        publishedAt
                        url
                    }
                    licenseInfo {
                        name
                        nickname
                        spdxId
                        url
                    }
                    stargazerCount
                    forkCount
                    isPrivate
                    createdAt
                    pushedAt
                    updatedAt
                    languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                    edges {
                        node {
                            id
                            name
                        }
                    }
                    }
                    repositoryTopics(first: 100) {
                    nodes {
                        topic {
                            name
                            stargazerCount
                        }
                    }
                    }
                    fundingLinks {
                        url
                        platform
                    }
                }
            }
        }
    }
}
`;

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

export interface StarredRepositoriesQueryResult {
    repositories: GitHub.Repository[];
    totalCount: number;
    hasNextPage: boolean;
    endCursor?: string;
}

export interface IGithubRepositoriesService {
    accessToken: string;
    client: Octokit;

    getUserStarredRepositories(
        pageSize: number,
    ): AsyncGenerator<
        Result<GitHub.Repository[], GithubRepositoriesServiceError>,
        void,
        unknown
    >;

    getTotalStarredRepositoriesCount(): Promise<
        ResultAsync<number, GithubRepositoriesServiceError>
    >;
}

export enum GithubRepositoriesServiceError {
    RequestFailed = "RequestFailed",
    DeserializationFailed = "DeserializationFailed",
}

export class GithubRepositoriesService implements IGithubRepositoriesService {
    accessToken: string;
    client: Octokit;

    constructor(accessToken: string) {
        this.accessToken = accessToken;
        const OctokitWithRetries = Octokit.plugin(retry);
        this.client = new OctokitWithRetries({
            auth: this.accessToken,
            request: { retries: 1, retryAfter: 1 },
        });
    }

    private async getOnePageOfStarredRepos(
        after: string,
        pageSize: number,
    ): Promise<
        ResultAsync<
            StarredRepositoriesQueryResult,
            GithubRepositoriesServiceError
        >
    > {
        // console.debug(
        //     `Start starredRepositoriesQuery (after: ${after}, pageSize: ${pageSize})`,
        // );

        const makeRequest = ResultAsync.fromPromise(
            this.client.graphql<GitHubGraphQl.StarredRepositoriesResponse>(
                starredRepositoriesQuery,
                {
                    after,
                    pageSize,
                },
            ),
            () => GithubRepositoriesServiceError.RequestFailed,
        );

        return makeRequest.andThen((response) => {
            const repositories: Result<GitHub.Repository[], unknown> =
                Result.combine(
                    response.viewer.starredRepositories.edges.map((edge) =>
                        GitHub.Repository.fromGraphQlData(edge),
                    ) as Result<GitHub.Repository, unknown>[],
                );

            if (repositories.isErr()) {
                console.error(`${repositories.error}`);
                return err(
                    GithubRepositoriesServiceError.DeserializationFailed,
                );
            }

            const totalCount = response.viewer.starredRepositories.totalCount;
            const hasNextPage =
                response.viewer.starredRepositories.pageInfo.hasNextPage;
            const endCursor =
                response.viewer.starredRepositories.pageInfo.endCursor;

            return ok({
                repositories: repositories.value,
                totalCount,
                hasNextPage,
                endCursor,
            });
        });
    }

    public async *getUserStarredRepositories(
        pageSize: number,
    ): AsyncGenerator<
        Result<GitHub.Repository[], GithubRepositoriesServiceError>,
        void,
        unknown
    > {
        let after = "";
        let hasNextPage = false;
        let totalFetched = 0;
        do {
            const requestResult = await this.getOnePageOfStarredRepos(
                after,
                pageSize,
            );
            const result = requestResult.andThen((data) => {
                hasNextPage = data.hasNextPage;
                after = data.endCursor ? data.endCursor : "";
                totalFetched += data.repositories.length;
                return ok(data.repositories);
            });
            yield result;
        } while (hasNextPage);
    }

    public async getTotalStarredRepositoriesCount(): Promise<
        ResultAsync<number, GithubRepositoriesServiceError>
    > {
        return ResultAsync.fromPromise(
            this.client.graphql(
                totalStarredRepositoriesCountQuery,
            ) as Promise<GraphQlQueryResponseData>,
            () => GithubRepositoriesServiceError.RequestFailed,
        ).map(
            (response) =>
                response.viewer.starredRepositories.totalCount as number,
        );
    }
}
