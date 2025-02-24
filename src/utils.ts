import normalizeUrl from "normalize-url";

export function convertStringToURL(url: string): URL {
    return new URL(normalizeUrl(url, { defaultProtocol: "https" }));
}

export class PluginLock {
    private locked = false;
    private timeoutHandle: Timer | null = null;

    acquire(
        timeoutMs?: number,
    ): { release: () => void; [Symbol.dispose]: () => void } | null {
        if (this.locked) return null; // Prevent re-entry

        this.locked = true;

        // Auto-release lock after timeout (if provided)
        if (timeoutMs) {
            this.timeoutHandle = setTimeout(() => this.release(), timeoutMs);
        }

        return {
            release: () => this.release(),
            [Symbol.dispose]: () => this.release(), // Enables `using`
        };
    }

    private release() {
        if (!this.locked) return; // Avoid double release

        this.locked = false;

        // Clear timeout if it was set
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
    }

    async run<T>(
        fn: () => Promise<T>,
        timeoutMs?: number,
    ): Promise<T | undefined> {
        using lock = this.acquire(timeoutMs);
        if (!lock) return; // Lock already acquired

        try {
            return await fn();
        } catch (error) {
            console.error("Lock execution error:", error);
            throw error; // Rethrow the error so it propagates properly
        }
    }
}
