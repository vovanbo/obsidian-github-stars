# GitHub stars in Obsidian

This plugin for [Obsidian][Obsidian] imports your GitHub stars into your vault as separate documents. So, when import is done you will be able to:
- Create [internal links](https://help.obsidian.md/Editing+and+formatting/Basic+formatting+syntax#Internal%20links) to your starred repositories in your vault
- See a history of your stars on GitHub
- Have a index of your starred repositories grouped by programming languages
- Have a index grouped by owners of your starred repos

## Demo

TODO

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

- Install this plugin from community plugin list in Obsidian
- [Create a fine grained access token](https://github.blog/security/application-security/introducing-fine-grained-personal-access-tokens-for-github/#creating-personal-access-tokens) on your GitHub account developer settings page
- ..

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
