import { translateSql } from "pbsql/bundler";
import type { TreeQLiteConfig } from "./main.js";
import { tqlAll, tqlExec, tqlQuery } from "./main.js";

export { TreeQLiteError } from "./main.js";
export type { ExecResult, TreeQLiteConfig, QueryResult } from "./main.js";

function tqlAllBundler(
  config: TreeQLiteConfig,
  query: string,
  params?: readonly unknown[],
) {
  return tqlAll(translateSql, config, query, params);
}
export { tqlAllBundler as tqlAll };

function tqlExecBundler(
  config: TreeQLiteConfig,
  query: string,
  params?: readonly unknown[],
) {
  return tqlExec(translateSql, config, query, params);
}
export { tqlExecBundler as tqlExec };

function tqlQueryBundler(
  config: TreeQLiteConfig,
  query: string,
  params?: readonly unknown[],
) {
  return tqlQuery(translateSql, config, query, params);
}
export { tqlQueryBundler as tqlQuery };
