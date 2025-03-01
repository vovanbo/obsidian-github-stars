import path from "node:path";
import type { BunPlugin } from "bun";

export const InlineWasmBunPlugin: BunPlugin = {
    name: "inline-wasm",
    setup(builder) {
        // Hook into the "resolve" phase to intercept .wasm imports
        builder.onResolve({ filter: /\.wasm$/ }, async (args) => {
            // Resolve the .wasm file path relative to the directory of the importing file
            const resolvedPath = Bun.resolveSync(
                args.path,
                path.dirname(args.importer),
            );
            return { path: resolvedPath, namespace: "wasm" };
        });

        // Handle the .wasm file loading
        builder.onLoad(
            { filter: /\.wasm$/, namespace: "wasm" },
            async (args) => {
                const wasmFile = await Bun.file(args.path).bytes();
                const wasm = Buffer.from(wasmFile).toString("base64");

                // Create the inline WebAssembly module
                const contents = `
          const wasmBinary = Uint8Array.from(atob("${wasm}"), c => c.charCodeAt(0));
          export default wasmBinary;
        `;
                return { contents, loader: "js" };
            },
        );
    },
};
