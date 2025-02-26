declare module "*.wasm" {
    const content: Uint8Array;
    export default content;
}

declare module "*.sql" {
    const content: string;
    export default content;
}
