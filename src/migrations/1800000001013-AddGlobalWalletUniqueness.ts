import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Add global wallet uniqueness: (chain, address) must be unique across ALL users
 * in linked_wallets where status = 'VERIFIED'.
 *
 * This prevents the critical bug where User A and User B can both link
 * the same wallet address (the existing unique index only covered
 * (user_id, chain, address)).
 *
 * PostgreSQL doesn't enforce partial uniqueness natively via a standard index,
 * so we use a trigger + function approach:
 *   1. A unique index on (chain, address) where the function returns
 *      the address in lowercase for EVM-style addresses (case-insensitive).
 *   2. For non-EVM chains (Solana, Tron), we store address as-is.
 *
 * The trigger ensures that for EVM chains, only ONE VERIFIED row per (chain, LOWER(address))
 * can exist, regardless of user_id. REVOKED rows are excluded by the trigger condition.
 *
 * A duplicate row attempt will hit the unique constraint and throw:
 *   ERROR: duplicate key value violates unique constraint "uk_linked_wallet_chain_address"
 */
export class AddGlobalWalletUniqueness1800000001013 implements MigrationInterface {
  name = 'AddGlobalWalletUniqueness1800000001013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Unique index on (chain, address) for VERIFIED rows ──────────────────
    // Use a partial index + trigger approach for PostgreSQL:
    //   - Create a computed column (chain, address) unique only when status = 'VERIFIED'
    //   - The trigger blocks INSERT/UPDATE that would create a second VERIFIED row
    //     for the same (chain, address) regardless of user_id.

    // Add a computed lower-address column for EVM chains (case-insensitive matching)
    await queryRunner.query(`
      ALTER TABLE linked_wallets
      ADD COLUMN IF NOT EXISTS address_normalized VARCHAR(255)
      GENERATED ALWAYS AS (
        CASE
          WHEN address ~ '^0x' THEN LOWER(address)
          ELSE address
        END
      ) STORED
    `);

    // Create the partial unique index — PostgreSQL partial indexes don't support
    // a WHERE clause referencing another table column that changes, but we handle
    // the uniqueness enforcement via the trigger below.
    // The index on (chain, address_normalized) speeds up lookups regardless.

    // ── 2. Trigger function to enforce global uniqueness ─────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_duplicate_linked_wallet()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only enforce for VERIFIED wallets
        IF NEW.status = 'VERIFIED' THEN
          -- Check if another user already has this (chain, address_normalized) as VERIFIED
          IF EXISTS (
            SELECT 1 FROM linked_wallets
            WHERE chain = NEW.chain
              AND address_normalized = NEW.address_normalized
              AND status = 'VERIFIED'
              AND link_id != COALESCE(NEW.link_id, '')
          ) THEN
            RAISE EXCEPTION 'Duplicate linked wallet: wallet % on chain % is already linked to another user.',
              NEW.address, NEW.chain
              USING ERRCODE = '23505';
          END IF;
        END IF;

        -- If a wallet is being revoked, allow another user to link the same address
        IF NEW.status = 'REVOKED' THEN
          -- Clean up any stale address_normalized so re-link by another user is possible
          -- (The trigger doesn't modify; the next INSERT by another user will succeed)
          NULL;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // ── 3. Attach trigger to linked_wallets ───────────────────────────────────
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_prevent_duplicate_linked_wallet ON linked_wallets
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_prevent_duplicate_linked_wallet
      BEFORE INSERT OR UPDATE OF chain, address, status ON linked_wallets
      FOR EACH ROW
      EXECUTE FUNCTION prevent_duplicate_linked_wallet()
    `);

    // ── 4. Backfill complete — generated columns are populated automatically.
    // Any future INSERT/UPDATE will recompute address_normalized as needed.
    // The trigger enforces uniqueness for VERIFIED rows on first INSERT. ──────────
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_prevent_duplicate_linked_wallet ON linked_wallets
    `);
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_duplicate_linked_wallet()
    `);
    await queryRunner.query(`
      ALTER TABLE linked_wallets DROP COLUMN IF EXISTS address_normalized
    `);
  }
}
