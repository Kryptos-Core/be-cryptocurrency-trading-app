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
