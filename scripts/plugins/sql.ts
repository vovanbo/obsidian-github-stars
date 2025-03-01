import path from "node:path";
import type { BunPlugin } from "bun";

export const InlineSqlBunPlugin: BunPlugin = {
    name: "inline-sql",
    setup(builder) {
        // Hook into the "resolve" phase to intercept .sql imports
        builder.onResolve({ filter: /\.sql$/ }, async (args) => {
            // Resolve the .sql file path relative to the directory of the importing file
            const resolvedPath = Bun.resolveSync(
                args.path,
                path.dirname(args.importer),
            );
            return { path: resolvedPath, namespace: "sql" };
        });

        // Handle the .sql file loading
        builder.onLoad({ filter: /\.sql$/, namespace: "sql" }, async (args) => {
            const sqlFileContent = await Bun.file(args.path).text();
            const contents = `const sqlQuery = \`${sqlFileContent}\`;
            export default sqlQuery;`;
            return { contents, loader: "js" };
        });
    },
};
