import { Code, PluginError } from "@/errors";
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
import type {
    DataWriteOptions,
    TAbstractFile,
    TFile,
    TFolder,
    Vault,
} from "obsidian";

export function convertStringToURL(url: string): URL {
    return new URL(normalizeUrl(url, { defaultProtocol: "https" }));
}

export function getOrCreateFolder(
    vault: Vault,
    path: string,
): ResultAsync<TFolder, PluginError<Code.Vault>> {
    const folder = vault.getFolderByPath(path);
    if (folder) {
        return okAsync(folder);
    }

    return ResultAsync.fromThrowable(
        (p: string) => vault.createFolder(p),
        () => new PluginError(Code.Vault.CreateFolderFailed),
    )(path);
}

export function getOrCreateFile(
    vault: Vault,
    path: string,
    content: string,
    options?: DataWriteOptions,
): ResultAsync<{ file: TFile; isCreated: boolean }, PluginError<Code.Vault>> {
    const file = vault.getFileByPath(path);
    if (file) {
        return okAsync({
            file,
            isCreated: false,
        });
    }

    const createFile = ResultAsync.fromThrowable(
        (p: string, d: string, o?: DataWriteOptions) => vault.create(p, d, o),
        () => new PluginError(Code.Vault.CreateFileFailed),
    );

    return createFile(path, content, options).map((file) => {
        return {
            file,
            isCreated: true,
        };
    });
}

export function removeFile(
    vault: Vault,
    path: string,
    force?: boolean,
): ResultAsync<void, PluginError<Code.Vault>> {
    const file = vault.getFileByPath(path);
    if (!file) {
        return errAsync(new PluginError(Code.Vault.FileNotFound));
    }

    return ResultAsync.fromThrowable(
        (f: TAbstractFile, force?: boolean) => vault.delete(f, force),
        () => new PluginError(Code.Vault.FileCanNotBeRemoved),
    )(file, force);
}

export function renameFolder(
    vault: Vault,
    folder: TFolder,
    newPath: string,
): ResultAsync<void, PluginError<Code.Vault>> {
    return ResultAsync.fromThrowable(
        (f: TAbstractFile, p: string) => vault.rename(f, p),
        () => new PluginError(Code.Vault.UnableToRenameDestinationFolder),
    )(folder, newPath);
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
    ): Promise<Result<T, E | PluginError<Code.Lock>>> {
        using lock = this.acquire(timeoutMs);
        if (!lock) return err(new PluginError(Code.Lock.Locked)); // Lock already acquired

        const result = fn();

        if (result instanceof ResultAsync) {
            return await result;
        }
        if (result instanceof Ok || result instanceof Err) {
            return result;
        }
        // If `fn` returns a Promise<T>, wrap it in ResultAsync
        return await ResultAsync.fromThrowable(
            () => result,
            () => new PluginError(Code.Lock.Execution),
        )();
    }
}
