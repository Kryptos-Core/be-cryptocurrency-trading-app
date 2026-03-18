import { MigrationInterface, QueryRunner } from 'typeorm';

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

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`onchain_transactions\`
       ADD COLUMN \`credited_currency_id\` char(36) NULL COMMENT 'ID của currency được credit vào ví (thường là USDT)',
       ADD COLUMN \`credited_amount\` decimal(36,18) NULL COMMENT 'Số lượng cash currency (USDT) thực tế được credit',
       ADD COLUMN \`conversion_rate\` decimal(36,18) NULL COMMENT 'Tỷ giá quy đổi: 1 native coin = X USDT tại thời điểm giao dịch'`,
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
