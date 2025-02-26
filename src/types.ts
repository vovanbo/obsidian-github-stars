import type { DateTime } from "luxon";

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
    }
}
