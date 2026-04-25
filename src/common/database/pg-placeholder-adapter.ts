import { DataSource, EntityManager, type QueryRunner } from 'typeorm';

let patched = false;

type QueryParameters = unknown[] | undefined;
type DataSourceQueryMethod = (
  this: DataSource,
  query: string,
  parameters?: QueryParameters,
  queryRunner?: QueryRunner,
) => Promise<unknown>;
type EntityManagerQueryMethod = (
  this: EntityManager,
  query: string,
  parameters?: QueryParameters,
) => Promise<unknown>;

function toPostgresPlaceholders(sql: string, maxParams: number): string {
  let paramIndex = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = '';

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (ch === "'" && !inDoubleQuote) {
      if (inSingleQuote && next === "'") {
        result += "''";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      result += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      result += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === '?' && next !== '|' && next !== '&') {
      let lookahead = i + 1;
      while (lookahead < sql.length && /\s/.test(sql[lookahead])) {
        lookahead += 1;
      }
      const nextNonWhitespace = lookahead < sql.length ? sql[lookahead] : '';
      const isJsonbExistenceOperator = nextNonWhitespace === "'" || nextNonWhitespace === '"';
      if (isJsonbExistenceOperator || paramIndex >= maxParams) {
        result += ch;
        continue;
      }

      paramIndex += 1;
      result += `$${paramIndex}`;
      continue;
    }

    result += ch;
  }

  return result;
}

function shouldTransform(contextType: unknown, query: unknown, parameters: unknown): parameters is unknown[] {
  return (
    contextType === 'postgres' &&
    typeof query === 'string' &&
    Array.isArray(parameters) &&
    parameters.length > 0 &&
    query.includes('?')
  );
}

export function enablePostgresQuestionMarkAdapter(): void {
  if (patched) {
    return;
  }
  patched = true;

  const dataSourceProto = DataSource.prototype as unknown as { query: DataSourceQueryMethod };
  const originalDataSourceQuery = dataSourceProto.query;
  dataSourceProto.query = function patchedDataSourceQuery(
    this: DataSource,
    query: string,
    parameters?: QueryParameters,
    queryRunner?: QueryRunner,
  ): Promise<unknown> {
    const shouldPatch = shouldTransform(this.options?.type, query, parameters);
    const effectiveQuery = shouldPatch ? toPostgresPlaceholders(query, parameters.length) : query;
    return originalDataSourceQuery.call(this, effectiveQuery, parameters, queryRunner);
  };

  const entityManagerProto = EntityManager.prototype as unknown as { query: EntityManagerQueryMethod };
  const originalEntityManagerQuery = entityManagerProto.query;
  entityManagerProto.query = function patchedEntityManagerQuery(
    this: EntityManager,
    query: string,
    parameters?: QueryParameters,
  ): Promise<unknown> {
    const shouldPatch = shouldTransform(this.connection?.options?.type, query, parameters);
    const effectiveQuery = shouldPatch ? toPostgresPlaceholders(query, parameters.length) : query;
    return originalEntityManagerQuery.call(this, effectiveQuery, parameters);
  };
}
