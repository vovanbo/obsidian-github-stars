# GitHub stars in Obsidian

This plugin for [Obsidian][Obsidian] imports your GitHub stars into your vault as separate documents. So, when import is done you will be able to:
- Create [internal links](https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax#Internal%20links) to your starred repositories in your vault
- See a history of your stars on GitHub
- Have a index of your starred repositories grouped by programming languages
- Have a index grouped by owners of your starred repos

## Table of contents

- [Demo](#demo)
- [Use cases](#use-cases)
- [Features](#features)
- [How to use](#how-to-use)
- [Roadmap to 1.0](#roadmap-to-10)
- [Implementation details](#implementation-details)
- [Inspiration sources](#inspiration-sources)

## Demo

[demo.webm](https://github.com/user-attachments/assets/da3bf715-c202-4e91-9457-4c1db8749f90)

## Use cases

- You have many unorganized stars on GitHub
- You want to make your own notes about your starred repositories
- You want to use links to your favorite projects in some researches (e.g. dependencies of new programming project)
- You want to have better than GitHub navigation in your favorites repositories

## Features

- Create document for each starred repository
- Each repository document's FrontMatter has properties:
  - URL
  - Homepage URL
  - Count of stars
  - Count of forks
  - Topics
  - Dates of:
    - Repository creation on GitHub
    - Last push
    - Repository was starred
    - Repository has been updated
    - Import to your vault
- Create index pages of all starred repositories sorted by:
  - Date
  - Owners
  - Main programming languages
- Use fine grained GitHub token with limited access to your stars

## How to use

### Prepare

To work with this plugin, you need to have a GitHub account and a fine grained access token.
To generate a fine grained access token, follow these steps:

1. Go to your GitHub account's [personal access tokens page](https://github.com/settings/personal-access-tokens).
2. Click on "Generate new token".
3. Confirm access if you have two-factor authentication enabled.
4. Give your token a name.
5. Setup expiration date (and optionally description).
6. Select read-only access to "Starring" (see "Account permissions" settings).
7. Click on "Generate token".
8. Copy generated token value and paste it into the plugin settings after plugin will be installed.

![New Fine-grained Personal Access Token 2025-03-03 16-53-57](https://github.com/user-attachments/assets/21ed3b6b-f509-4416-ba8d-96c9ca3eb095)
![New Fine-grained Personal Access Token 2025-03-03 16-54-57](https://github.com/user-attachments/assets/fb058389-07fd-48a8-8011-8b1dfd39f235)
![New Fine-grained Personal Access Token 2025-03-03 16-55-19](https://github.com/user-attachments/assets/a3d09d1d-770c-45fe-9976-ec1d8e2e8660)
![Fine-grained Personal Access Tokens 2025-03-03 16-55-51](https://github.com/user-attachments/assets/05a5b8d2-9795-4b4d-9371-31039fd12d7e)

### Installation

You have two options to install this plugin:
1. Install this plugin from community plugin list in Obsidian.
2. Use [BRAT][BRAT] plugin to use this plugin version directly from [GitHub](https://github.com/vovanbo/obsidian-github-stars/releases).

### Usage

#### First synchronization

1. Open the plugin settings.
2. Enter your GitHub token in "GitHub API access token" field (see a demo video above).
3. Wait a second, and plugin will save your token to settings.
4. Press `Cmd + P` (Mac) or `Ctrl + P` (Windows/Linux) to open the Obsidian command palette.
5. Type "GitHub stars" and select plugin command `GitHub stars: Synchronize your starred repositories`.
6. If API token is valid, plugin will start synchronization process. In dependence of count of your starred repositories it will take some time.
For example, if you have around 2500 starred repositories, it will take about 5 minutes with page size set to `50`
(about 5 seconds to request/response).
The reason of this is that GitHub GraphQL API uses pagination to fetch data, which means that the plugin needs to make multiple requests to the API to retrieve all the data.
By default page size is set to 50, but you can change it in the plugin settings.
7. After synchronization is complete you will have a new folder with your starred repositories in your vault.
Name of the folder is set to "GitHub" by default, but you can change it in the plugin settings too.
8. Inside of this folder will be:
    - `GitHub/db` subfolder. This is the place where plugin stores SQLite database with information about your starred repositories.
    - `GitHub/repositories` subfolder. This is the place where plugin stores markdown files with information about your starred repositories.
    Each repository will be placed in subfolder with its owner name. For example, star of this repository will be placed in file `GitHub/repositories/vovanbo/obsidian-github-stars.md`.
    - Three index files:
      - `Stars by days.md`. This file contains a list of all your starred repositories grouped by the day they were starred.
      - `Stars by owners.md`. This file contains a list of all your starred repositories grouped by the owner of the repository.
      - `Stars by languages.md`. This file contains a list of all your starred repositories grouped by the main programming language used in the repository.

#### Structure of Markdown repository file

##### Content

Each repository file created from the empty file template that have the following structure:

```
<!-- GITHUB-STARS-START -->

<!-- GITHUB-STARS-END -->

---
```

Between the `<!-- GITHUB-STARS-START -->` and `<!-- GITHUB-STARS-END -->` tags will be placed generated content.
So, don't edit content inside these tags manually.
It will be overwritten on each update.
Don't worry, these HTML comments are the valid Markdown syntax.

Any of your notes related to this repository should be placed after horizontal rule line (`---`).
They will be never touched by this plugin.

That exactly will be placed inside tags you can see in the demo video above. In short:

- Name of repository
- URL to repository
- Description of repository (if available)
- Homepage URL
- URL to repository owner page on GitHub
- Information about latest release if available
- List of programming languages used in the repository
- Funding links (if available)

##### Frontmatter

Each repository Markdown page will have the following frontmatter:

```
---
url: <repository URL>
homepageUrl: <homepage URL>
isArchived: <boolean>
isFork: <boolean>
isPrivate: <boolean>
isTemplate: <boolean>
stargazerCount: <number>
forkCount: <number>
createdAt: <date>
importedAt: <date>
pushedAt: <date>
starredAt: <date>
updatedAt: <date>
topics: <list of topics>
---
```

#### Incremental update

Documentation will be updated soon.

#### Remove unstarred repositories

Documentation will be updated soon.

## Roadmap to 1.0

- [x] Automatically remove files related to removed stars
- [x] Incremental update
- [ ] Use Obsidian views to:
    - [ ] Make a full text search
    - [ ] Show statistics
    - [ ] Show ratings
- [ ] i18n / l10n
- [ ] Fetch README file content on a starred repository page
- [ ] Global changes log
- [ ] Highlight archived, deprecated and unmaintained repositories
- [ ] Customizable templates of pages
- [ ] Test suite

## Implementation details

### Dependencies

- [Bun][Bun] (TypeScript, build, WASM binary import)
- [SQL.js][SQL.js] (SQLite in browser via WASM)
- [octokit.js][octokit.js] (API client for GitHub)
- [Handlebars][Handlebars] (Templates for pages)
- [neverthrow][neverthrow] (unified error handling and result types)
- [luxon][luxon] (date and time library)
- [Biome][Biome] (lint, format, etc)
- [git-cliff][git-cliff] (bump versions and change log generation)

## Inspiration sources

- [starred](https://github.com/maguowei/starred) — creating your own Awesome List by GitHub stars!
- [starred_repos_organizer](https://github.com/uwla/starred_repos_organizer) —  Organize your starred repositories
- [bun-obsidian-plugin-build-scripts](https://github.com/davisriedel/bun-obsidian-plugin-build-scripts) — Scripts to build Obsidian plugins with Bun, SCSS with Grass, and Rust to WASM


[Obsidian]: https://obsidian.md/
[Bun]: https://bun.sh/
[Biome]: https://biomejs.dev/
[SQL.js]: https://sql.js.org
[octokit.js]: https://github.com/octokit/octokit.js
[neverthrow]: https://github.com/softprops/neverthrow
[luxon]: https://moment.github.io/luxon/
[Handlebars]: https://handlebarsjs.com
[git-cliff]: https://git-cliff.org/
[BRAT]: https://github.com/TfTHacker/obsidian42-brat
