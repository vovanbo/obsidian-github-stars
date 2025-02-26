/**
 * @filename: lint-staged.config.mjs
 * @type {import('lint-staged').Configuration}
 */
export default {
    "*.{js,jsx,ts,tsx}": [
        "bunx @biomejs/biome check --write",
        () => "bun tsc --noEmit",
    ],
    "*.{json,gql}": "bunx @biomejs/biome check --write",
    "*.scss": "bunx stylelint --fix",
};
