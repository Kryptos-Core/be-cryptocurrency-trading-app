import { DataSource } from 'typeorm';

/**
 * Runs a MySQL CALL that writes to user session variables, then reads them in one SELECT.
 * Keeps OUT-param handling in one place (hybrid SP plan — thin wrapper).
 */
export async function selectMysqlUserVars(
  dataSource: DataSource,
  varAliases: Record<string, string>,
): Promise<Record<string, unknown>> {
  const entries = Object.entries(varAliases);
  if (entries.length === 0) {
    return {};
  }
  const selectList = entries.map(([alias, varName]) => `@${varName} AS \`${alias}\``).join(', ');
  const [row] = await dataSource.query(`SELECT ${selectList}`);
  return (row ?? {}) as Record<string, unknown>;
}
