import path from "node:path";
import type { BunPlugin } from "bun";

export const InlineGraphQlBunPlugin: BunPlugin = {
    name: "inline-graphql",
    setup(builder) {
        // Hook into the "resolve" phase to intercept .gql imports
        builder.onResolve({ filter: /\.gql$/ }, async (args) => {
            // Resolve the .gql file path relative to the directory of the importing file
            const resolvedPath = Bun.resolveSync(
                args.path,
                path.dirname(args.importer),
            );
            return { path: resolvedPath, namespace: "graphql" };
        });

        // Handle the .gql file loading
        builder.onLoad(
            { filter: /\.gql$/, namespace: "graphql" },
            async (args) => {
                const graphQlQueryFileContent = await Bun.file(
                    args.path,
                ).text();
                const contents = `const graphQlQuery = \`${graphQlQueryFileContent}\`;
            export default graphQlQuery;`;
                return { contents, loader: "js" };
            },
        );
    },
};
