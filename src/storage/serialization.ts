import { isObject } from "@/helpers";
import type { GitHubGraphQl } from "@/services/github/types";
import { GitHub } from "@/types";
import { convertStringToURL } from "@/utils";
import { single } from "itertools-ts";
import { DateTime } from "luxon";
import { type Result, err, ok } from "neverthrow";
import type { ParamsObject } from "sql.js";

export function fromGraphQlData(
    edge: GitHubGraphQl.StarredRepositoryEdge,
): Result<GitHub.Repository, unknown> {
    try {
        const node = edge.node;
        const repo = new GitHub.Repository({
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
                isOrganization: node.owner.__typename === "Organization",
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
            languages: node.languages?.edges?.map((e) => e.node.name),
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
            const sortedTopics = single.sort(
                node.repositoryTopics.nodes,
                (lhs, rhs) =>
                    rhs.topic.stargazerCount - lhs.topic.stargazerCount,
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
                    GitHub.FundingPlatform[
                        link.platform as keyof typeof GitHub.FundingPlatform
                    ],
            });
        }

        return ok(repo);
    } catch (error) {
        return err(error);
    }
}

type ParsedFundingLink = {
    url: string;
    platform: string;
};

export function fromDbObject(
    row: ParamsObject,
): Result<GitHub.Repository, unknown> {
    try {
        const parsedLatestRelease = row.latestRelease
            ? JSON.parse(row.latestRelease as string)
            : undefined;

        const parsedFundingLinks: ParsedFundingLink[] = row.fundingLinks
            ? (JSON.parse(row.fundingLinks as string) as ParsedFundingLink[])
            : [];
        const repo = new GitHub.Repository({
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
            latestRelease: isObject(parsedLatestRelease)
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
                      spdxId: row.license ? (row.license as string) : undefined,
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
            createdAt: DateTime.fromISO(row.createdAt as string).toUTC(),
            pushedAt: DateTime.fromISO(row.pushedAt as string).toUTC(),
            starredAt: DateTime.fromISO(row.starredAt as string).toUTC(),
            unstarredAt: row.unstarredAt
                ? DateTime.fromISO(row.unstarredAt as string).toUTC()
                : undefined,
            updatedAt: DateTime.fromISO(row.updatedAt as string).toUTC(),
            importedAt: DateTime.fromISO(row.importedAt as string).toUTC(),
            languages: row.languages
                ? (JSON.parse(row.languages as string) as string[])
                : [],
        });

        if (parsedFundingLinks && Array.isArray(parsedFundingLinks)) {
            for (const link of parsedFundingLinks) {
                repo.fundingLinks.push({
                    url: convertStringToURL(link.url),
                    platform:
                        GitHub.FundingPlatform[
                            link.platform as keyof typeof GitHub.FundingPlatform
                        ],
                });
            }
        }
        return ok(repo);
    } catch (error) {
        return err(error);
    }
}
