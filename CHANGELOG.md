# Changelog

---
## [0.4.0](https://github.com/vovanbo/obsidian-github-stars/compare/0.3.0..0.4.0) - 2025-03-02

### Features

- Add partial update of starred repositories - ([90d2fe9](https://github.com/vovanbo/obsidian-github-stars/commit/90d2fe9125954517db9d03a6ce6c9626bc68926f)) - Vladimir Bolshakov
- Use SQLite database only when command is running - ([731c619](https://github.com/vovanbo/obsidian-github-stars/commit/731c619346eaa2bf96ec4b8252f28c40552d74f2)) - Vladimir Bolshakov
- Use more strict error handling in plugin API - ([210d58d](https://github.com/vovanbo/obsidian-github-stars/commit/210d58d8a374ce6d9d61b0b9cc4ccbbd87b00808)) - Vladimir Bolshakov
- Use more strict error handling in utils module - ([20ecaee](https://github.com/vovanbo/obsidian-github-stars/commit/20ecaee7503c241188fee39ad3527e9eb6f5bbc0)) - Vladimir Bolshakov
- Use more strict error handling in Storage - ([08db62c](https://github.com/vovanbo/obsidian-github-stars/commit/08db62cc6adfd3c97af95ecca6d2876a405807e4)) - Vladimir Bolshakov
- Use more strict error handling in GitHub service - ([b96c1dc](https://github.com/vovanbo/obsidian-github-stars/commit/b96c1dc35ff62480f67f6f631a8f7a54a705aba3)) - Vladimir Bolshakov
- Use more strict error handling in SQLite DB - ([dad7150](https://github.com/vovanbo/obsidian-github-stars/commit/dad71505f8b400fef8bca3f269e45c02cc8a5b42)) - Vladimir Bolshakov
- Implement unified error handling - ([ab83a1e](https://github.com/vovanbo/obsidian-github-stars/commit/ab83a1e4d3cd782a3cc9e2d02148c4c14b9348cf)) - Vladimir Bolshakov

### Refactoring

- Move settings validation into PluginSettings class - ([3e4e2f9](https://github.com/vovanbo/obsidian-github-stars/commit/3e4e2f95c74089eeeb10cbc5131ba8ad1c84373e)) - Vladimir Bolshakov

### Build

- Implement unified error handling in build/bump/release scripts - ([c28c213](https://github.com/vovanbo/obsidian-github-stars/commit/c28c213d1289d08458d7f920c2c3cb6863a66443)) - Vladimir Bolshakov

---
## [0.3.0](https://github.com/vovanbo/obsidian-github-stars/compare/0.2.0..0.3.0) - 2025-02-27

### Bug Fixes

- Fix serialization bug in storage - ([451d5cb](https://github.com/vovanbo/obsidian-github-stars/commit/451d5cbcfdb4aec07104046f67dd56f152c1c3e1)) - Vladimir Bolshakov

### Features

- Add support for change destination folder in settings - ([66dae04](https://github.com/vovanbo/obsidian-github-stars/commit/66dae04747ccf71b1bae60c87430db74b2cd0a23)) - Vladimir Bolshakov
- Add helpers to check types and values - ([483f3e6](https://github.com/vovanbo/obsidian-github-stars/commit/483f3e69592735e686c0000f5e2ddcafaaaf67ac)) - Vladimir Bolshakov
- Add neverthrow support in plugin lock function - ([614a58b](https://github.com/vovanbo/obsidian-github-stars/commit/614a58b9e3b8693aca2542161d235868436271a2)) - Vladimir Bolshakov

### Miscellaneous

- Use isUndefined helpers in build - ([73f02cb](https://github.com/vovanbo/obsidian-github-stars/commit/73f02cb595a8079208d54311b38ad230a6dc2c4e)) - Vladimir Bolshakov
- Use setTooltip in settings - ([ac59bc1](https://github.com/vovanbo/obsidian-github-stars/commit/ac59bc14e247e030951109b31af2f4a901bf51b7)) - Vladimir Bolshakov
- Add TypeScript module declarations for *.gql and *.hbs - ([d531997](https://github.com/vovanbo/obsidian-github-stars/commit/d53199734873ea3da94acad49d003e0588aa5808)) - Vladimir Bolshakov

### Refactoring

- Use helpers in SQLite database module - ([10ad7c2](https://github.com/vovanbo/obsidian-github-stars/commit/10ad7c2c3c769ff167fa51bdd58ca95d213fb0a3)) - Vladimir Bolshakov
- Use ResultAsync in storage methods - ([8d73ff6](https://github.com/vovanbo/obsidian-github-stars/commit/8d73ff65338f8b62617089f4c43eb9b30168be0f)) - Vladimir Bolshakov
- Use neverthrow in GitHub service - ([4618c74](https://github.com/vovanbo/obsidian-github-stars/commit/4618c742ba77694bc35592a1497c74de80fdc725)) - Vladimir Bolshakov
- Use helpers in API methods - ([75bfc4f](https://github.com/vovanbo/obsidian-github-stars/commit/75bfc4fa4cf169d76a144bea60afd2891302caee)) - Vladimir Bolshakov
- Use new project structure in plugin module - ([eece182](https://github.com/vovanbo/obsidian-github-stars/commit/eece1823e4d18901794db1084c92bb445ef21002)) - Vladimir Bolshakov
- Move stuff related to settings - ([8ff7bf1](https://github.com/vovanbo/obsidian-github-stars/commit/8ff7bf13048f043896ff475a2e06f59624ff6a3a)) - Vladimir Bolshakov
- Introduce plugin API module - ([3613ef7](https://github.com/vovanbo/obsidian-github-stars/commit/3613ef754fe2864240ab9de252728e1495116826)) - Vladimir Bolshakov
- Move storage to submodule - ([9816d02](https://github.com/vovanbo/obsidian-github-stars/commit/9816d020c438c8e9675024eb261c98f2d023e6af)) - Vladimir Bolshakov
- Move GitHub service into submodule - ([db8fd8c](https://github.com/vovanbo/obsidian-github-stars/commit/db8fd8c189abe6c7bf7acc49153da7a14a89dfa2)) - Vladimir Bolshakov
- Add vault related helpers to utils - ([3006714](https://github.com/vovanbo/obsidian-github-stars/commit/3006714099cb198bedc1edfb3b0d455ef1e4342e)) - Vladimir Bolshakov
- Move SQLite DB to submodule - ([b4af38b](https://github.com/vovanbo/obsidian-github-stars/commit/b4af38b811ae19bb0b41819fffb4b7b57d990aab)) - Vladimir Bolshakov
- Move templates to Handlebars files - ([d6f64e3](https://github.com/vovanbo/obsidian-github-stars/commit/d6f64e35be9e40f672e90f0c0b90e7908d2f1796)) - Vladimir Bolshakov
- Move SQL queries from module to separate files - ([9022fb3](https://github.com/vovanbo/obsidian-github-stars/commit/9022fb38bb06eaefeb7290e520be12dd870409f4)) - Vladimir Bolshakov

### Style

- Fix misprint - ([b413c6c](https://github.com/vovanbo/obsidian-github-stars/commit/b413c6c6cde59f20a2af0c56793180b6c34b486d)) - Vladimir Bolshakov
- Reformat create schema query - ([46660c1](https://github.com/vovanbo/obsidian-github-stars/commit/46660c1ff86f1663a762cc195985b873636354d5)) - Vladimir Bolshakov
- Setup GraphQL formatting - ([dab3acc](https://github.com/vovanbo/obsidian-github-stars/commit/dab3acc6c097a4687f45832c424f773f0cdfd5ac)) - Vladimir Bolshakov

### Build

- Update Bun to 1.2.4 - ([efd254c](https://github.com/vovanbo/obsidian-github-stars/commit/efd254c170104fdddca0b528de176e245347536f)) - Vladimir Bolshakov
- Add build plugins to handle imports of GraphQL queries and Handlebars templates - ([54120e4](https://github.com/vovanbo/obsidian-github-stars/commit/54120e4ce681598756b12f20f1900fe3d5b37166)) - Vladimir Bolshakov
- Fix bug with resolving paths in Bun build plugins - ([3c940a2](https://github.com/vovanbo/obsidian-github-stars/commit/3c940a29216847070dad7c761dae828ac771ba0a)) - Vladimir Bolshakov
- Write source maps in build only in debug mode - ([f21edc4](https://github.com/vovanbo/obsidian-github-stars/commit/f21edc493e261429bb4c25df939ddd918c062176)) - Vladimir Bolshakov
- Exit with error when bump version or release failed - ([b479001](https://github.com/vovanbo/obsidian-github-stars/commit/b4790011326d08fad6cc9fd8479b39052c25c47d)) - Vladimir Bolshakov
- Add support to import SQL files - ([fa9e478](https://github.com/vovanbo/obsidian-github-stars/commit/fa9e4781923714614283dd036ff00df3f6771204)) - Vladimir Bolshakov

---
## [0.2.0](https://github.com/vovanbo/obsidian-github-stars/compare/0.1.2..0.2.0) - 2025-02-24

### Features

- Move SQLite DB file inside vault folder - ([089c8db](https://github.com/vovanbo/obsidian-github-stars/commit/089c8db179069dcb0d162743cd84662b645c3ab8)) - Vladimir Bolshakov

### Refactoring

- Move DB queries to separate file - ([3785091](https://github.com/vovanbo/obsidian-github-stars/commit/3785091777f61415a8c71db5fba5a426b08b70fd)) - Vladimir Bolshakov
- Move GraphQL GitHub namespace to types - ([26756f6](https://github.com/vovanbo/obsidian-github-stars/commit/26756f6b383f43f40ebb6361482aaec5c9db6f55)) - Vladimir Bolshakov
- Move errors to separate file - ([f03c526](https://github.com/vovanbo/obsidian-github-stars/commit/f03c526f4e8f0c269fcf3a0c7e14255a63272c37)) - Vladimir Bolshakov
- Move PluginLock to utils - ([a9ed261](https://github.com/vovanbo/obsidian-github-stars/commit/a9ed2614ffdc8b5849abe78599dd719c802e7868)) - Vladimir Bolshakov

### Build

- Improve logging in build - ([3e865cf](https://github.com/vovanbo/obsidian-github-stars/commit/3e865cf0f4764c714c261daa59ef01cfd7877faf)) - Vladimir Bolshakov

---
## [0.1.2](https://github.com/vovanbo/obsidian-github-stars/compare/0.1.1..0.1.2) - 2025-02-23

### Miscellaneous

- Fix permissions in GitHub workflow - ([abe5c44](https://github.com/vovanbo/obsidian-github-stars/commit/abe5c44b9460268b291777262121f577ca22693e)) - Vladimir Bolshakov

---
## [0.1.1](https://github.com/vovanbo/obsidian-github-stars/compare/0.1.0..0.1.1) - 2025-02-23

### Miscellaneous

- Try to fix CI workflow - ([6d7e0c2](https://github.com/vovanbo/obsidian-github-stars/commit/6d7e0c2a8a88b5b6d4681e9d336365befaec7e77)) - Vladimir Bolshakov

---
## [0.1.0] - 2025-02-23

### Bug Fixes

- Fix links to owners on index pages - ([cea6c62](https://github.com/vovanbo/obsidian-github-stars/commit/cea6c624a7ed675e62249c76b51f331820a926eb)) - Vladimir Bolshakov

### Documentation

- Add README - ([1203bc1](https://github.com/vovanbo/obsidian-github-stars/commit/1203bc129c38371fc9209c84fb158c7885a0913a)) - Vladimir Bolshakov

### Features

- Slow animation in status bar - ([d09c557](https://github.com/vovanbo/obsidian-github-stars/commit/d09c5571b0cf046e57468f2ef8739140b236f064)) - Vladimir Bolshakov
- :tada: Add implementation of base use cases - ([517696f](https://github.com/vovanbo/obsidian-github-stars/commit/517696fb26f3eac1ff25cd855b1ca2a1b54e884b)) - Vladimir Bolshakov
- Add CSS styles - ([acd232d](https://github.com/vovanbo/obsidian-github-stars/commit/acd232d18be3b2a6dec3de5634743c66165899b1)) - Vladimir Bolshakov
- Add service and types to work with GitHub API - ([6a82854](https://github.com/vovanbo/obsidian-github-stars/commit/6a82854e5a6d7f55996660b93e2cdd71df6d16b9)) - Vladimir Bolshakov
- Add SQLite and queries module - ([052addd](https://github.com/vovanbo/obsidian-github-stars/commit/052adddbea557efee12ace323af8ccfdb3b0bf17)) - Vladimir Bolshakov
- Add templates of pages - ([200da06](https://github.com/vovanbo/obsidian-github-stars/commit/200da06f6f7417eb21d04c65f16f264173e1a023)) - Vladimir Bolshakov
- Obsidian status bar action - ([4d605e0](https://github.com/vovanbo/obsidian-github-stars/commit/4d605e0950dd30c1852a3fdef385da3d4d7879c1)) - Vladimir Bolshakov
- Lock implementation to avoid parallel runs of Obsidian commands - ([041e6f3](https://github.com/vovanbo/obsidian-github-stars/commit/041e6f3f6cdc459346be0f99cd0054ef57f26a4d)) - Vladimir Bolshakov
- Utils module with helper to URL normalization - ([2e49115](https://github.com/vovanbo/obsidian-github-stars/commit/2e4911525ed569d21812774719894da3fcdafa5e)) - Vladimir Bolshakov
- Initial setup - ([e35cf77](https://github.com/vovanbo/obsidian-github-stars/commit/e35cf7702b8094c7636789aacdbd51532415e52c)) - Vladimir Bolshakov

### Miscellaneous

- Fix escaping of arguments in build scripts - ([e459c79](https://github.com/vovanbo/obsidian-github-stars/commit/e459c79be67d2aa3361a0f6bfd3ad2da6cd0d3fc)) - Vladimir Bolshakov
- Improve logs in release script - ([57e747b](https://github.com/vovanbo/obsidian-github-stars/commit/57e747bd24f68aa627997e93863379e5c60dbd54)) - Vladimir Bolshakov
- Add GitHub actions workflow - ([247f632](https://github.com/vovanbo/obsidian-github-stars/commit/247f63212fe2d05e8906540de247ce2c1b26b23c)) - Vladimir Bolshakov
- Setup git-cliff - ([af24c48](https://github.com/vovanbo/obsidian-github-stars/commit/af24c48cf555d7884895af05a737777e2134a204)) - Vladimir Bolshakov
- Handle WASM imports - ([a269544](https://github.com/vovanbo/obsidian-github-stars/commit/a269544048f18ad5190b3b4dfeb7d33e1949eed7)) - Vladimir Bolshakov
- Update repository URL in git-cliff configuration - ([a75da7c](https://github.com/vovanbo/obsidian-github-stars/commit/a75da7c3b2bc06c37ff158065ec912cddb6255e5)) - Vladimir Bolshakov

### Build

- Improve build system for release - ([1eb6615](https://github.com/vovanbo/obsidian-github-stars/commit/1eb6615625f21f92289bc173474c964aa255888c)) - Vladimir Bolshakov
- Add build scripts suite and justfile - ([689491e](https://github.com/vovanbo/obsidian-github-stars/commit/689491e1ab7d487332da79bc329cf597ea385354)) - Vladimir Bolshakov


