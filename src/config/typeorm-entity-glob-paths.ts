import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Glob paths for TypeORM `entities` in CLI DataSources (migrations, seeds, db:clean).
 * Nest runtime uses explicit entity classes in `typeorm.config.ts`; when a new
 * `@Entity` lives outside `src/entities/`, add its path here and to `ALL_ENTITIES`.
 */
export function typeormEntityGlobPaths(callerDirname: string): string[] {
  return [
    path.join(callerDirname, '../entities/*.entity{.ts,.js}'),
    path.join(callerDirname, '../modules/blockchain/entities/*.entity{.ts,.js}'),
  ];
}

/**
 * Explicit migration file paths for TypeORM CLI/DataSource usage.
 * Filters out `*.spec.ts` / `*.spec.js` so test files never get loaded as migrations.
 */
export function typeormMigrationFilePaths(callerDirname: string): string[] {
  const migrationsDir = path.resolve(callerDirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((fileName) => /\.(ts|js)$/.test(fileName))
    .filter((fileName) => !fileName.endsWith('.spec.ts') && !fileName.endsWith('.spec.js'))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => path.join(migrationsDir, fileName));
}
