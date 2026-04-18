import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Treasury Fund/Sweep already waits for on-chain success before persisting the
 * `onchain_transactions` row, but the row was saved as PENDING — leaving the
 * user activity feed stuck. Align with completed `treasury_operations`.
 */
export class CompleteTreasuryFundSweepOnchainWhenOpCompleted1776530000000
  implements MigrationInterface
{
  name = 'CompleteTreasuryFundSweepOnchainWhenOpCompleted1776530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`onchain_transactions\` ot
      INNER JOIN \`treasury_operations\` op ON ot.\`treasury_operation_id\` = op.\`operation_id\`
      SET
        ot.\`status\` = 'COMPLETED',
        ot.\`confirmations\` = GREATEST(ot.\`confirmations\`, 1),
        ot.\`confirmed_at\` = COALESCE(ot.\`confirmed_at\`, op.\`completed_at\`, NOW(6))
      WHERE ot.\`type\` IN ('FUND', 'SWEEP')
        AND ot.\`status\` = 'PENDING'
        AND op.\`status\` = 'COMPLETED'
        AND op.\`completed_at\` IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    // Intentionally empty: reversing would mis-label legitimately pending rows.
  }
}
