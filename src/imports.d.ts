declare module "*.wasm" {
    const content: Uint8Array;
    export default content;
}

declare module "*.sql" {
    const content: string;
    export default content;
}

declare module "*.gql" {
    const content: string;
    export default content;
}

declare module "*.hbs" {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const content: HandlebarsTemplateDelegate<any>;
    export default content;
}
