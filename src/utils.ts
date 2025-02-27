import { VaultError } from "@/errors";
import {
    Err,
    Ok,
    type Result,
    ResultAsync,
    err,
    errAsync,
    okAsync,
} from "neverthrow";
import normalizeUrl from "normalize-url";
import type { DataWriteOptions, TAbstractFile, TFolder, Vault } from "obsidian";

export function convertStringToURL(url: string): URL {
    return new URL(normalizeUrl(url, { defaultProtocol: "https" }));
}

export function getOrCreateFolder(vault: Vault, path: string) {
    const folder = vault.getFolderByPath(path);
    if (folder) {
        return okAsync(folder);
    }

    return ResultAsync.fromPromise(
        vault.createFolder(path),
        () => VaultError.CreateFolderFailed,
    );
}

export function getOrCreateFile(
    vault: Vault,
    path: string,
    content: string,
    options?: DataWriteOptions,
) {
    const file = vault.getFileByPath(path);
    if (file) {
        return okAsync({
            file,
            isCreated: false,
        });
    }

    return ResultAsync.fromPromise(
        vault.create(path, content, options),
        () => VaultError.CreateFileFailed,
    ).map((file) => {
        return {
            file,
            isCreated: true,
        };
    });
}

export function removeFile(vault: Vault, path: string) {
    const file = vault.getFileByPath(path);
    if (!file) {
        return errAsync(VaultError.FileNotFound);
    }
    return ResultAsync.fromPromise(
        vault.delete(file),
        () => VaultError.FileCanNotBeRemoved,
    );
}

export function renameFolder(vault: Vault, folder: TFolder, newPath: string) {
    return ResultAsync.fromThrowable(
        (f: TAbstractFile, p: string) => vault.rename(f, p),
        (error) => {
            console.error(`ERROR. ${error}`);
            return VaultError.UnableToRenameDestinationFolder;
        },
    )(folder, newPath);
}

export enum PluginLockError {
    Locked = "Plugin is locked",
    Execution = "Lock execution error",
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

    public async run<T, E>(
        fn: () => Result<T, E> | ResultAsync<T, E> | Promise<T>,
        timeoutMs?: number,
    ): Promise<Result<T, E | PluginLockError>> {
        using lock = this.acquire(timeoutMs);
        if (!lock) return err(PluginLockError.Locked); // Lock already acquired

        try {
            const result = fn();

            if (result instanceof ResultAsync) {
                return await result.mapErr((e) => e as E | PluginLockError);
            }
            if (result instanceof Ok || result instanceof Err) {
                return result.mapErr((e) => e as E | PluginLockError);
            }
            // If `fn` returns a Promise<T>, wrap it in ResultAsync
            return await ResultAsync.fromPromise(
                result,
                () => PluginLockError.Execution,
            );
        } catch (error) {
            console.error("Lock execution error:", error);
            return err(PluginLockError.Execution);
        }
    }
}
