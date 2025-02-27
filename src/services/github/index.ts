import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";
import { type Result, ResultAsync } from "neverthrow";
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

export type StarredRepositoriesGenerator = AsyncGenerator<
    Result<
        GitHubGraphQl.StarredRepositoryEdge[],
        GithubRepositoriesServiceError
    >,
    void,
    unknown
>;

export interface IGithubRepositoriesService {
    accessToken: string;
    client: Octokit;

    getUserStarredRepositories(pageSize: number): StarredRepositoriesGenerator;

    getTotalStarredRepositoriesCount(): ResultAsync<
        number,
        GithubRepositoriesServiceError
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

    private getOnePageOfStarredRepos(
        after: string,
        pageSize: number,
    ): ResultAsync<
        StarredRepositoriesQueryResult,
        GithubRepositoriesServiceError
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

        return makeRequest.map((response) => {
            return {
                repositories: response.viewer.starredRepositories.edges,
                totalCount: response.viewer.starredRepositories.totalCount,
                hasNextPage:
                    response.viewer.starredRepositories.pageInfo.hasNextPage,
                endCursor:
                    response.viewer.starredRepositories.pageInfo.endCursor,
            };
        });
    }

    public async *getUserStarredRepositories(
        pageSize: number,
    ): StarredRepositoriesGenerator {
        let after = "";
        let hasNextPage = false;
        let totalFetched = 0;
        do {
            const requestResult = await this.getOnePageOfStarredRepos(
                after,
                pageSize,
            );
            const result = requestResult.map((data) => {
                hasNextPage = data.hasNextPage;
                after = data.endCursor ? data.endCursor : "";
                totalFetched += data.repositories.length;
                return data.repositories;
            });
            yield result;
        } while (hasNextPage);
    }

    public getTotalStarredRepositoriesCount(): ResultAsync<
        number,
        GithubRepositoriesServiceError
    > {
        return ResultAsync.fromPromise(
            this.client.graphql<GitHubGraphQl.StarredRepositoriesResponse>(
                totalStarredRepositoriesCountQuery,
            ),
            () => GithubRepositoriesServiceError.RequestFailed,
        ).map((response) => response.viewer.starredRepositories.totalCount);
    }
}
