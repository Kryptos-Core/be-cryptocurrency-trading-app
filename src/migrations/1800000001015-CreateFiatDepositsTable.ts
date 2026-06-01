import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateFiatDepositsTable1800000001015 implements MigrationInterface {
  name = 'CreateFiatDepositsTable1800000001015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fiat_deposits (
        deposit_id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        amount NUMERIC(36,18) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        order_code BIGINT NOT NULL UNIQUE,
        checkout_url VARCHAR(512),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_fiat_deposits_status
          CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
        CONSTRAINT fk_fiat_deposits_user
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_fiat_deposits_user
      ON fiat_deposits (user_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fiat_deposits_order_code
      ON fiat_deposits (order_code)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fiat_deposits_order_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_fiat_deposits_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS fiat_deposits`);
  }
}
