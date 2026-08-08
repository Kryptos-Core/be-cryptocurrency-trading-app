# Legacy MySQL Migrations (archived)

These files were moved out of `src/` to keep the Postgres source tree clean. The
contents are kept for historical reference and rollback scenarios only.

## Location

- Was: `be-cryptocurrency-trading-app/src/migrations_legacy_mysql/`
- Now: `be-cryptocurrency-trading-app/docs/archive/migrations-legacy-mysql/`

## Status

- NOT loaded by the active Postgres DataSource (`src/config/typeorm-entity-glob-paths.ts`
  deliberately only reads `src/migrations/`).
- Safe to remove entirely once no rollback playbook references them (see
  `docs/INFRASTRUCTURE.md` and the original `README.md` next to the files).

## Reference

- Authoritative Postgres migrations live under `src/migrations/` (latest prefix
  `1800xxxxxxxxxx`).
- For any new schema work, create a migration under `src/migrations/`.