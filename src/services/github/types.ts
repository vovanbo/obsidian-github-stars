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
