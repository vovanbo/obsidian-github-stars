import sqlWasm from "!/sql.js/dist/sql-wasm.wasm";
import { Code, PluginError } from "@/errors";
import { isUndefined } from "@/helpers";
import {
    type Result,
    ResultAsync,
    err,
    errAsync,
    ok,
    okAsync,
} from "neverthrow";
import type { DataAdapter, DataWriteOptions } from "obsidian";
import type { Database } from "sql.js";
import initSqlJs from "sql.js";

export class SqliteDatabase {
    private adapter: DataAdapter;
    private db?: Database;
    private dbFolder?: string;
    private dbFile?: string;
    private SQL?: initSqlJs.SqlJsStatic;

    constructor(adapter: DataAdapter) {
        this.adapter = adapter;
    }

    public get dbFilePath() {
        return `${this.dbFolder}/${this.dbFile}`;
    }

    public get isInitialized() {
        return (
            !isUndefined(this.SQL) &&
            !isUndefined(this.db) &&
            !isUndefined(this.dbFolder) &&
            !isUndefined(this.dbFile)
        );
    }

    public get instance(): Result<Database, PluginError<Code.Sqlite>> {
        if (!this.isInitialized) {
            return err(new PluginError(Code.Sqlite.DatabaseIsNotInitialized));
        }

        return ok(this.db as Database);
    }

    private initSqlModule() {
        if (isUndefined(this.SQL)) {
            const initModule = ResultAsync.fromThrowable(
                initSqlJs,
                () => new PluginError(Code.Sqlite.ModuleInitializationFailed),
            );
            return initModule({
                wasmBinary: sqlWasm.buffer as ArrayBuffer,
            }).map((SQL) => {
                this.SQL = SQL;
                return SQL;
            });
        }
        return okAsync(this.SQL);
    }

    private getOrCreateDbInstance() {
        const readDbFile = ResultAsync.fromThrowable(
            (normalizedPath: string) => this.adapter.readBinary(normalizedPath),
            () => new PluginError(Code.Sqlite.FileIsNotExists),
        );
        return this.initSqlModule().andThen((SQL) =>
            readDbFile(this.dbFilePath)
                .map((data) => new SQL.Database(Buffer.from(data)))
                .orElse(() => ok(new SQL.Database())),
        );
    }

    public init(
        dbFolder: string,
        dbFile: string,
    ): ResultAsync<Database, PluginError<Code.Sqlite>> {
        if (this.isInitialized) {
            return okAsync(this.db as Database);
        }

        this.dbFolder = dbFolder;
        this.dbFile = dbFile;
        return this.getOrCreateDbInstance()
            .andThen((db) => {
                this.db = db;
                return ok(db);
            })
            .andThrough(() => this.save())
            .orElse((error) => {
                this.db = undefined;
                return err(error);
            });
    }

    public save(): ResultAsync<void, PluginError<Code.Sqlite>> {
        if (!this.isInitialized) {
            return errAsync(
                new PluginError(Code.Sqlite.DatabaseIsNotInitialized),
            );
        }

        const saveDbData = ResultAsync.fromThrowable(
            (
                normalizedPath: string,
                data: ArrayBuffer,
                options?: DataWriteOptions,
            ) => this.adapter.writeBinary(normalizedPath, data, options),
            () => new PluginError(Code.Sqlite.DatabaseSaveFailed),
        );

        return this.instance
            .map((db) => db.export().buffer as ArrayBuffer)
            .asyncAndThen((data) => saveDbData(this.dbFilePath, data));
    }

    public migrate() {
        if (!this.isInitialized) {
            return errAsync(
                new PluginError(Code.Sqlite.DatabaseIsNotInitialized),
            );
        }

        // TODO Migrations
    }

    public close(): ResultAsync<void, PluginError<Code.Sqlite>> {
        if (!this.isInitialized) {
            return okAsync();
        }
        return this.instance.asyncMap(async (db) => {
            db.close();
            this.db = undefined;
        });
    }
}
