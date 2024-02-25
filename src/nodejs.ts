import { translateSql } from "pbsql/nodejs";
import type { TreeQLiteConfig } from "./main.js";
import { tqlAll, tqlExec, tqlQuery } from "./main.js";

export { TreeQLiteError } from "./main.js";
export type { ExecResult, TreeQLiteConfig, QueryResult } from "./main.js";

function tqlAllNodejs(
  config: TreeQLiteConfig,
  query: string,
  params?: readonly unknown[],
) {
  return tqlAll(translateSql, config, query, params);
}
export { tqlAllNodejs as tqlAll };

function tqlExecNodejs(
  config: TreeQLiteConfig,
  query: string,
  params?: readonly unknown[],
) {
  return tqlExec(translateSql, config, query, params);
}
export { tqlExecNodejs as tqlExec };

function tqlQueryNodejs(
  config: TreeQLiteConfig,
  query: string,
  params?: readonly unknown[],
) {
  return tqlQuery(translateSql, config, query, params);
}
export { tqlQueryNodejs as tqlQuery };
