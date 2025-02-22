import normalizeUrl from "normalize-url";

export function convertStringToURL(url: string): URL {
    return new URL(normalizeUrl(url, { defaultProtocol: "https" }));
}
