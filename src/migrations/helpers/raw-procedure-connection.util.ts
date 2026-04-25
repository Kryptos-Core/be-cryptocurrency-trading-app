import type { QueryRunner } from 'typeorm';

type QueryCapable = {
  query: (sql: string) => Promise<unknown>;
};

type ConnectionLike = {
  driver?: {
    options?: {
      type?: unknown;
    };
  };
  master?: unknown;
  queryRunner?: {
    connection?: unknown;
  };
  connection?: unknown;
};

type QueryRunnerWithConnection = QueryRunner & {
  connection: ConnectionLike;
};

function hasQuery(value: unknown): value is QueryCapable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'query' in value &&
    typeof (value as { query?: unknown }).query === 'function'
  );
}

function unwrapConnection(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const candidate = value as {
    queryRunner?: { connection?: unknown };
    connection?: unknown;
  };

  return candidate.queryRunner?.connection ?? candidate.connection ?? value;
}

export async function runProcedureSql(queryRunner: QueryRunner, sql: string): Promise<void> {
  const connection = (queryRunner as QueryRunnerWithConnection).connection;
  const rawConnection =
    connection.driver?.options?.type === 'mariadb'
      ? unwrapConnection(connection.master)
      : unwrapConnection(connection);

  if (hasQuery(rawConnection)) {
    await rawConnection.query(sql);
    return;
  }

  await queryRunner.query(sql);
}
