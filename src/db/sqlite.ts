import sqlWasm from "!/sql.js/dist/sql-wasm.wasm";
import { SqliteDatabaseError } from "@/db/errors";
import { isUndefined } from "@/helpers";
import {
    type Result,
    ResultAsync,
    err,
    errAsync,
    ok,
    okAsync,
} from "neverthrow";
import type { DataAdapter } from "obsidian";
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

    public get instance(): Result<Database, SqliteDatabaseError> {
        if (!this.isInitialized) {
            return err(SqliteDatabaseError.DatabaseIsNotInitialized);
        }

        return ok(this.db as Database);
    }

    private initSqlModule() {
        if (isUndefined(this.SQL)) {
            return ResultAsync.fromPromise(
                initSqlJs({ wasmBinary: sqlWasm.buffer as ArrayBuffer }),
                () => SqliteDatabaseError.ModuleInitializationFailed,
            ).map((SQL) => {
                this.SQL = SQL;
                return SQL;
            });
        }
        return okAsync(this.SQL);
    }

    private getOrCreateDbInstance() {
        const readDbFile = ResultAsync.fromPromise(
            this.adapter.readBinary(this.dbFilePath),
            () => SqliteDatabaseError.FileIsNotExists,
        );
        return this.initSqlModule().andThen((SQL) =>
            readDbFile
                .map((data) => new SQL.Database(Buffer.from(data)))
                .orElse(() => ok(new SQL.Database())),
        );
    }

    public init(
        dbFolder: string,
        dbFile: string,
    ): ResultAsync<Database, SqliteDatabaseError> {
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

    public save(): ResultAsync<void, SqliteDatabaseError> {
        if (!this.isInitialized) {
            return errAsync(SqliteDatabaseError.DatabaseIsNotInitialized);
        }

        return this.instance
            .map((db) => db.export().buffer as ArrayBuffer)
            .asyncAndThen((data) =>
                ResultAsync.fromPromise(
                    this.adapter.writeBinary(this.dbFilePath, data),
                    () => SqliteDatabaseError.DatabaseSaveFailed,
                ),
            );
    }

    public migrate() {
        if (!this.isInitialized) {
            return errAsync(SqliteDatabaseError.DatabaseIsNotInitialized);
        }

        // TODO Migrations
    }

    public close(): ResultAsync<void, SqliteDatabaseError> {
        return this.instance.asyncMap(async (db) => {
            db.close();
            this.db = undefined;
        });
    }
}
