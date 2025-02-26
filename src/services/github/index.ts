import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";
import { type Result, ResultAsync, ok } from "neverthrow";
import { GithubRepositoriesServiceError } from "./errors";
import starredRepositoriesQuery from "./queries/starredRepositories.gql";
import totalStarredRepositoriesCountQuery from "./queries/totalStarredRepositoriesCount.gql";
import type { GitHubGraphQl } from "./types";

export interface StarredRepositoriesQueryResult {
    repositories: GitHubGraphQl.StarredRepositoryEdge[];
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
        Result<
            GitHubGraphQl.StarredRepositoryEdge[],
            GithubRepositoriesServiceError
        >,
        void,
        unknown
    >;

    getTotalStarredRepositoriesCount(): Promise<
        ResultAsync<number, GithubRepositoriesServiceError>
    >;
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
            return ok({
                repositories: response.viewer.starredRepositories.edges,
                totalCount: response.viewer.starredRepositories.totalCount,
                hasNextPage:
                    response.viewer.starredRepositories.pageInfo.hasNextPage,
                endCursor:
                    response.viewer.starredRepositories.pageInfo.endCursor,
            });
        });
    }

    public async *getUserStarredRepositories(
        pageSize: number,
    ): AsyncGenerator<
        Result<
            GitHubGraphQl.StarredRepositoryEdge[],
            GithubRepositoriesServiceError
        >,
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
            this.client.graphql<GitHubGraphQl.StarredRepositoriesResponse>(
                totalStarredRepositoriesCountQuery,
            ),
            () => GithubRepositoriesServiceError.RequestFailed,
        ).map((response) => response.viewer.starredRepositories.totalCount);
    }
}
