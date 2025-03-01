import path from "node:path";
import type { BunPlugin } from "bun";

export const CompiledHandlebarsTemplateBunPlugin: BunPlugin = {
    name: "compile-handlebars",
    setup(builder) {
        builder.onResolve({ filter: /\.hbs$/ }, async (args) => {
            const resolvedPath = Bun.resolveSync(
                args.path,
                path.dirname(args.importer),
            );
            return { path: resolvedPath, namespace: "handlebars" };
        });

        builder.onLoad(
            { filter: /\.hbs$/, namespace: "handlebars" },
            async (args) => {
                const handlebarsFileContent = await Bun.file(args.path).text();
                const contents = `import Handlebars from "handlebars";
const graphQlQuery = Handlebars.compile(\`${handlebarsFileContent}\`, { strict: true });
export default graphQlQuery;`;
                return { contents, loader: "js" };
            },
        );
    },
};
