export const isEmpty = (obj: unknown): boolean => {
    if (obj == null) return true; // Handles null and undefined
    if (typeof obj === "string" || Array.isArray(obj)) return obj.length === 0;
    if (obj instanceof Map || obj instanceof Set) return obj.size === 0;
    if (typeof obj !== "object") return true;

    return Object.keys(obj).length === 0;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
    value instanceof Object;

export const isString = (value: unknown): value is string =>
    typeof value === "string";

export const isNull = (value: unknown): value is null => value === null;

export const isUndefined = (value: unknown): value is undefined =>
    value === undefined;

export const isMatch = <T extends Record<string, unknown>>(
    object: T,
    source: Partial<T>,
): boolean => {
    for (const key in source) {
        if (!(key in object)) return false;

        const sourceValue = source[key];
        const objectValue = object[key];

        // For arrays, check if every element in `source` exists in `object`
        if (Array.isArray(sourceValue) && Array.isArray(objectValue)) {
            if (!sourceValue.every((v) => objectValue.includes(v)))
                return false;
            continue;
        }

        // For objects, perform a deep comparison recursively
        if (
            typeof sourceValue === "object" &&
            sourceValue !== null &&
            typeof objectValue === "object" &&
            objectValue !== null
        ) {
            if (
                !isMatch(
                    objectValue as Record<string, unknown>,
                    sourceValue as Record<string, unknown>,
                )
            ) {
                return false;
            }
            continue;
        }

        // Check for direct value equality
        if (objectValue !== sourceValue) return false;
    }

    return true;
};
