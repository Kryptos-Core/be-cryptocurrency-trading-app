import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2: Add broadcast_idempotency_key + TX_BROADCAST status + updated_at to treasury_operations.
 *
 * - broadcast_idempotency_key: set BEFORE the RPC broadcast call; if set but tx_hash is NULL
 *   the worker knows a broadcast was attempted and can decide to re-broadcast or skip.
 * - TX_BROADCAST: intermediate status between PROCESSING and COMPLETED, so the confirm job
 *   can track that the tx was sent and just needs on-chain confirmation.
 * - updated_at: allows reconciliation job to detect stale TX_BROADCAST rows efficiently.
 */
export class AddTreasuryBroadcastIdempotencyAndTxBroadcastStatus1776540000000
  implements MigrationInterface
{
  name = 'AddTreasuryBroadcastIdempotencyAndTxBroadcastStatus1776540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add broadcast_idempotency_key column
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        ADD COLUMN \`broadcast_idempotency_key\` varchar(255) NULL DEFAULT NULL
    `);

    // Add updated_at for reconciliation queries
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        ADD COLUMN \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
    `);

    // Add TX_BROADCAST to status enum — must re-specify all enum values for MySQL.
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        MODIFY COLUMN \`status\` enum('PENDING','PROCESSING','TX_BROADCAST','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    // Index for confirm-job reconciliation: fast lookup of stale TX_BROADCAST operations.
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        ADD INDEX \`idx_treasury_op_tx_broadcast_stale\` (\`status\`, \`updated_at\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        DROP INDEX \`idx_treasury_op_tx_broadcast_stale\`
    `);

    // Revert status enum — rows with TX_BROADCAST would need manual cleanup first in prod.
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        MODIFY COLUMN \`status\` enum('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        DROP COLUMN \`broadcast_idempotency_key\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        DROP COLUMN \`updated_at\`
    `);
  }
}
