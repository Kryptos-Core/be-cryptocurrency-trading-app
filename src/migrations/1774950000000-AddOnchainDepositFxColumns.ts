import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Thêm 3 cột tracking quy đổi tỷ giá vào onchain_transactions
 *
 * Mục đích: Khi user nạp tiền on-chain (TRX/ETH), hệ thống quy đổi sang
 * platform cash currency (USDT) và credit vào ví tiền ảo. 3 cột mới lưu
 * lại thông tin quy đổi để audit trail và hiển thị trên FE.
 *
 * - credited_currency_id: ID của currency được credit (USDT)
 * - credited_amount: Số USDT thực tế được cộng vào ví
 * - conversion_rate: Tỷ giá 1 native coin = X USDT tại thời điểm giao dịch
 */
export class AddOnchainDepositFxColumns1774950000000 implements MigrationInterface {
  name = 'AddOnchainDepositFxColumns1774950000000';

  private async addColumnIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnDefinitionSql: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) return;
    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [schema, tableName, columnName],
    );
    if (rows.length === 0) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinitionSql}`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'onchain_transactions';
    await this.addColumnIfNotExists(
      queryRunner,
      table,
      'credited_currency_id',
      `\`credited_currency_id\` char(36) NULL COMMENT 'ID của currency được credit vào ví (thường là USDT)'`,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      table,
      'credited_amount',
      `\`credited_amount\` decimal(36,18) NULL COMMENT 'Số lượng cash currency (USDT) thực tế được credit'`,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      table,
      'conversion_rate',
      `\`conversion_rate\` decimal(36,18) NULL COMMENT 'Tỷ giá quy đổi: 1 native coin = X USDT tại thời điểm giao dịch'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`onchain_transactions\`
       DROP COLUMN \`conversion_rate\`,
       DROP COLUMN \`credited_amount\`,
       DROP COLUMN \`credited_currency_id\``,
    );
  }
}
