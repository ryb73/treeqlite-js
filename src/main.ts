import { mkdirSync } from "fs";
import { parse as parsePath, resolve as resolvePathPosix } from "path/posix";
import { assert } from "@ryb73/super-duper-parakeet/lib/src/assert.js";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks.js";
import BetterSqlite3, { SqliteError } from "better-sqlite3";
import debugModule from "debug";
import type { Either } from "fp-ts/lib/Either.js";
import { left as eLeft, right as eRight, isLeft } from "fp-ts/lib/Either.js";
import { invert, mapValues } from "lodash-es";
import type { RustResult, TranslatedQuery } from "pbsql/nodejs";

const debug = debugModule(`treeqlite-js`);

type Config = {
  rootPath: string;
};
export type { Config as TreeQLiteConfig };

function rustResultToEither<Ok, Err>(
  rustResult: RustResult<Ok, Err>,
): Either<Err, Ok> {
  if (`Ok` in rustResult) {
    return eRight(rustResult.Ok);
  }
  return eLeft(rustResult.Err);
}

function resolveDbPath({ rootPath }: Config, path: string): string {
  return resolvePathPosix(rootPath, path.replace(/^~\//u, `./`));
}

function initializeSqliteUsingPath(mainPath: string) {
  if (mainPath === `:memory:`) {
    return new BetterSqlite3(`:memory:`);
  }

  const parsedMainPath = parsePath(mainPath);

  // Make sure the directory exists
  // TODO: add mode
  mkdirSync(parsedMainPath.dir, { recursive: true });

  // TODO: is simply appending `.sqlite3` safe here? Might we end up with e.g. `~/foo/.sqlite3`?
  return new BetterSqlite3(`${mainPath}.sqlite3`);
}

const valuesTableName = `table_contents`;

function translateErrorInPlace(
  dbReferencesByPathEntries: [string, string][],
  error: InstanceType<SqliteError>,
) {
  dbReferencesByPathEntries.forEach(([dbPath, reference]) => {
    error.message = error.message.replaceAll(
      `${reference}.${valuesTableName}`,
      dbPath,
    );
  });
}

export class TreeQLiteError extends Error {
  // eslint-disable-next-line @typescript-eslint/quotes
  public name = "TreeQLiteError";

  public constructor(
    dbReferencesByPathEntries: [string, string][],
    error: InstanceType<SqliteError>,
    query: string,
  ) {
    translateErrorInPlace(dbReferencesByPathEntries, error);
    super(`Error running query: ${query}`, { cause: error });
  }
}

function executeQuery<T>(
  translateSql: (query: string) => RustResult<TranslatedQuery, string>,
  config: Config,
  runSqliteQuery: (
    sqliteDb: BetterSqlite3.Database,
    query: string,
    params: readonly unknown[],
  ) => T,
  query: string,
  params: readonly unknown[] = [],
) {
  const translateRustResult = translateSql(query);
  const translateResult = rustResultToEither(translateRustResult);
  if (isLeft(translateResult)) {
    throw new Error(`Error translating query:${translateResult.left}`);
  }

  const { databases, query: translatedQueries } = translateResult.right;

  debug(`databases:`, databases);
  debug(`translatedQueries:`, translatedQueries);

  // TODO: at this point, paths haven't been validated. I guess resolveDbPath should do that?
  //       Eventually access permissions will have to be validated, so I guess maybe that's a
  //       separate thing from path resolution.

  // A "reference" is the alias assigned to the database when attached, e.g. in:
  //  ATTACH DATABASE 'foo.sqlite3' AS foo
  // "foo" is the reference. I don't know if there's a more correct term for this.
  // What does Copilot have to say?
  // Copilot: "reference" is the correct term
  // Cool 😎. But are you sure?
  // Copilot: "yes"
  const dbReferencesByPath = Object.fromEntries(databases.entries());
  const dbPathsByReference = invert(dbReferencesByPath);
  const resolvedDbPathsByReference = mapValues(dbPathsByReference, (v) =>
    resolveDbPath(config, v),
  );

  const mainPath = resolvedDbPathsByReference[`main`] ?? `:memory:`;

  const sqliteDb = initializeSqliteUsingPath(mainPath);

  try {
    sqliteDb.pragma(`journal_mode = WAL`);

    Object.entries(resolvedDbPathsByReference).forEach(
      ([reference, dbPath]) => {
        if (reference === `main`) return;

        const parsedPath = parsePath(dbPath);

        // Make sure the directory exists
        // TODO: add mode
        mkdirSync(parsedPath.dir, { recursive: true });

        // TODO: make sure injection isn't possible here
        sqliteDb.exec(`ATTACH DATABASE '${dbPath}.sqlite3' AS ${reference}`);
      },
    );

    assert(translatedQueries.length === 1, `Expected exactly one query`);

    return runSqliteQuery(sqliteDb, defined(translatedQueries[0]), params);
  } catch (error) {
    debug(`Error running query:`, error);

    if (error instanceof SqliteError) {
      throw new TreeQLiteError(
        Object.entries(dbReferencesByPath),
        error,
        query,
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(
      `Non-Error thrown in treeqlite-js::executeQuery: ${String(error)}`,
      { cause: error },
    );
  } finally {
    // TODO: it would probably be best to clean up any files/folders that were created if this fails
    sqliteDb.close();
  }
}

function doBs3Run(
  sqliteDb: BetterSqlite3.Database,
  query: string,
  params: readonly unknown[] = [],
) {
  return sqliteDb.prepare(query).run(params);
}

function doBs3All(
  sqliteDb: BetterSqlite3.Database,
  query: string,
  params: readonly unknown[] = [],
) {
  return sqliteDb.prepare(query).all(params);
}

export type QueryResult = {
  changes: number;
  lastInsertRowid: bigint | number;
};

export function tqlQuery(
  translateSql: (query: string) => RustResult<TranslatedQuery, string>,
  config: Config,
  query: string,
  params?: readonly unknown[],
): QueryResult {
  return executeQuery(translateSql, config, doBs3Run, query, params);
}

type AllResult = readonly unknown[];

export function tqlAll(
  translateSql: (query: string) => RustResult<TranslatedQuery, string>,
  config: Config,
  query: string,
  params?: readonly unknown[],
): AllResult {
  return executeQuery(translateSql, config, doBs3All, query, params);
}

export type ExecResult =
  | {
      type: "noData";
      result: QueryResult;
    }
  | {
      type: "returnedData";
      data: AllResult;
    };

function doBs3Exec(
  sqliteDb: BetterSqlite3.Database,
  query: string,
  params: readonly unknown[] = [],
): ExecResult {
  const statement = sqliteDb.prepare(query);
  if (statement.reader) {
    const data = statement.all(params);
    return { type: `returnedData`, data };
  }

  const result = statement.run(params);
  return { type: `noData`, result };
}

export function tqlExec(
  translateSql: (query: string) => RustResult<TranslatedQuery, string>,
  config: Config,
  query: string,
  params?: readonly unknown[],
): ExecResult {
  return executeQuery(translateSql, config, doBs3Exec, query, params);
}
