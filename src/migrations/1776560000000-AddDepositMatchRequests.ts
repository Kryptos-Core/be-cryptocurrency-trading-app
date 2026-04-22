import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 follow-up: Dual-approval deposit match-user workflow.
 *
 * deposit_match_requests table tracks two-step admin approval before associating
 * an UNMATCHED on-chain deposit with a user account.
 * - Step 1 (RISK_OFFICER proposes): creates row with status=PENDING
 * - Step 2 (FINANCE_MANAGER approves): sets user_id on onchain_transactions,
 *   triggers settlement, records resolver in this table
 * - audit_log JSONB stores immutable history of every state transition.
 */
export class AddDepositMatchRequests1776560000000 implements MigrationInterface {
  name = 'AddDepositMatchRequests1776560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`deposit_match_requests\` (
        \`match_id\`          char(36)      NOT NULL,
        \`tx_id\`             char(36)      NOT NULL,
        \`requested_user_id\` char(36)      NOT NULL,
        \`proposer_id\`       char(36)      NOT NULL,
        \`proposer_role\`     varchar(50)   NOT NULL,
        \`approver_id\`       char(36)      NULL,
        \`approver_role\`     varchar(50)   NULL,
        \`status\`            enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        \`idempotency_key\`   varchar(64)   NOT NULL,
        \`proposed_at\`       datetime(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`resolved_at\`       datetime(3)   NULL,
        \`audit_log\`         json          NOT NULL DEFAULT (JSON_ARRAY()),
        PRIMARY KEY (\`match_id\`),
        UNIQUE KEY \`uk_deposit_match_idempotency\` (\`idempotency_key\`),
        UNIQUE KEY \`uk_deposit_match_tx\` (\`tx_id\`),
        INDEX \`idx_deposit_match_proposer_date\` (\`proposer_id\`, \`proposed_at\`),
        INDEX \`idx_deposit_match_approver_date\` (\`approver_id\`, \`resolved_at\`),
        CONSTRAINT \`fk_deposit_match_tx\`
          FOREIGN KEY (\`tx_id\`) REFERENCES \`onchain_transactions\` (\`tx_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`deposit_match_requests\``);
  }
}
