# ⚠️ LEGACY MySQL Migrations — DO NOT EXECUTE AGAINST POSTGRES

This directory holds **historical MySQL migrations** from the project's pre-Postgres era (target ID range `1768xxx – 1776xxx`).

They are **NOT loaded by the active Postgres DataSource** (`src/config/typeorm-entity-glob-paths.ts` deliberately only reads `src/migrations/`), so they will not run on the current `core_db` Postgres instance.

## Why they remain on disk

- Useful as a historical reference when reading old commits / debugging legacy behavior.
- Required by the MySQL rollback playbook (see `docs/INFRASTRUCTURE.md` for branch/rollback procedures).
- Some files may still be referenced by `.spec.ts` tests that compare old/new behavior.

## Rules

1. **Do NOT add new Postgres-compatible logic to files in this folder.** The DataSource will not execute them, so any change here has zero effect on the running app.
2. **Do NOT point a tool, seed script, or CI job at this folder.** Only `src/migrations/` is authoritative.
3. **For any new schema work**, create a migration under `src/migrations/` (timestamp prefix `1800xxxxxxxxxx` or later).
4. **If you need to delete this folder**, do it in a dedicated PR with sign-off from a maintainer, after confirming no rollback path depends on these files.

## When you see a file from this folder referenced in a bug

Check first whether the entity it was supposed to create is also defined under `src/entities/`. If yes, the schema already lives on Postgres — find or create the matching `src/migrations/` entry.
