import Handlebars from "handlebars";

export const emptyPage = `<!-- GITHUB-STARS-START -->

<!-- GITHUB-STARS-END -->

---
`;

export const indexPageByDaysTemplate = Handlebars.compile(
    `# GitHub stars sorted by days

> [!example]- Table of contents
{{#each reposByDates}}
> > [!example]- [[#{{dateFormatFromMillis this.[0] "y"}}]]
{{#each this.[1]}}
> > - [[#{{dateFormatFromMillis this.[0] "y"}}#{{dateFormatFromMillis this.[0] "LLLL"}}]]
{{/each}}
>
{{/each}}

{{#each reposByDates}}
## {{dateFormatFromMillis this.[0] "y"}}
{{#each this.[1]}}
### {{dateFormatFromMillis this.[0] "LLLL"}}
{{#each this.[1]}}
#### {{dateFormatFromMillis this.[0] "DDD"}}
{{#each this.[1]}}
- {{#if this.unstarredAt}}~~{{/if}}[[{{@root.repostioriesFolder}}/{{this.owner.login}}/{{this.name}}|{{this.name}}]] by [[{{this.owner.login}}]]{{#if this.description}}. {{this.description}}{{/if}}{{#if this.unstarredAt}}~~ *(unstarred at {{dateFormat this.unstarredAt "ff"}})*{{/if}}
{{/each}}
{{/each}}
{{/each}}
{{/each}}
`,
    { strict: true },
);

export const indexPageByLanguagesTemplate = Handlebars.compile(
    `# GitHub stars sorted by programming languages

> [!example]+ Table of contents
{{#each languages}}
> - [[#{{this}}]]
{{/each}}

{{#each reposPerLanguage}}
## {{this.[0]}}
{{#each this.[1]}}
- {{#if this.unstarredAt}}~~{{/if}}[[{{@root.repostioriesFolder}}/{{this.owner.login}}/{{this.name}}|{{this.name}}]] by [[{{this.owner.login}}]]{{#if this.description}}. {{this.description}}{{/if}}{{#if this.unstarredAt}}~~ *(unstarred at {{dateFormat this.unstarredAt "ff"}})*{{/if}}
{{/each}}
{{/each}}
`,
    { strict: true },
);

export const indexPageByOwnersTemplate = Handlebars.compile(
    `# GitHub stars sorted by owners

> [!example]+ Table of contents
> > [!abstract]- Organizations
{{#each sortedOrgs}}
> > - [[#{{this}}]]
{{/each}}
>
> > [!abstract]- Users
{{#each sortedUsers}}
> > - [[#{{this}}]]
{{/each}}

## Organizations
{{#each reposOfOrgs}}
### {{this.[0]}}
{{#each this.[1]}}
- {{#if this.unstarredAt}}~~{{/if}}[[{{@root.repostioriesFolder}}/{{this.owner.login}}/{{this.name}}|{{this.name}}]]{{#if this.description}}. {{this.description}}{{/if}}{{#if this.unstarredAt}}~~ *(unstarred at {{dateFormat this.unstarredAt "ff"}})*{{/if}}
{{/each}}
{{/each}}

## Users
{{#each reposOfUsers}}
### {{this.[0]}}
{{#each this.[1]}}
- {{#if this.unstarredAt}}~~{{/if}}[[{{@root.repostioriesFolder}}/{{this.owner.login}}/{{this.name}}|{{this.name}}]]{{#if this.description}}. {{this.description}}{{/if}}{{#if this.unstarredAt}}~~ *(unstarred at {{dateFormat this.unstarredAt "ff"}})*{{/if}}
{{/each}}
{{/each}}
`,
    { strict: true },
);

export const repoPageTemplate = Handlebars.compile(
    `{{#with repo}}
# [{{name}}]({{url}}){{#if unstarredAt}} *(unstarred)*{{/if}}
{{#if description}}

**{{description}}**

{{/if}}
> [!info]+
{{#if homepageUrl}}
> - Homepage: [{{homepageUrl}}]({{homepageUrl}})
{{/if}}
> - Owner: [{{owner.login}}]({{owner.url}})
{{#if latestRelease}}
> - Latest release: [{{latestReleaseName}}]({{latestRelease.url}}) published at {{dateFormat latestRelease.publishedAt "ff"}}
{{/if}}
{{#if licenseInfo}}
> - License: [{{licenseInfo.name}}]({{licenseInfo.url}})
{{/if}}
{{#if languages}}
> - Languages:
{{#each languages}}
>     - [{{this}}]({{searchLanguageUrl ../url this}})
{{/each}}
{{/if}}
{{#if fundingLinks}}
> - Funding links:
{{#each fundingLinks}}
>     - [{{#if this.platform}}{{this.platform}}{{else}}{{this.url}}{{/if}}]({{this.url}})
{{/each}}
{{/if}}
{{/with}}
`,
    { strict: true },
);
