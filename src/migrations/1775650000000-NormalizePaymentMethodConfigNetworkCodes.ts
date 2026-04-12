import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align payment_method_configs.network with chain-registry codes (same as GET /payment-configs/options).
 * Legacy rows used short segments: MAINNET, SEPOLIA, DEVNET, NILE, SHASTA.
 */
export class NormalizePaymentMethodConfigNetworkCodes1775650000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'SOLANA_MAINNET' WHERE type = 'SOL' AND network = 'MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'SOLANA_DEVNET' WHERE type = 'SOL' AND network = 'DEVNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'ETH_MAINNET' WHERE type = 'ETH' AND network = 'MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'ETH_SEPOLIA' WHERE type = 'ETH' AND network = 'SEPOLIA'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'TRON_MAINNET' WHERE type = 'TRON' AND network = 'MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'TRON_NILE' WHERE type = 'TRON' AND network = 'NILE'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'TRON_SHASTA' WHERE type = 'TRON' AND network = 'SHASTA'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'BSC_MAINNET' WHERE type = 'BSC' AND network = 'MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'BSC_CHAPEL' WHERE type = 'BSC' AND network IN ('CHAPEL','TESTNET')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'MAINNET' WHERE type = 'SOL' AND network = 'SOLANA_MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'DEVNET' WHERE type = 'SOL' AND network = 'SOLANA_DEVNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'MAINNET' WHERE type = 'ETH' AND network = 'ETH_MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'SEPOLIA' WHERE type = 'ETH' AND network = 'ETH_SEPOLIA'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'MAINNET' WHERE type = 'TRON' AND network = 'TRON_MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'NILE' WHERE type = 'TRON' AND network = 'TRON_NILE'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'SHASTA' WHERE type = 'TRON' AND network = 'TRON_SHASTA'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'MAINNET' WHERE type = 'BSC' AND network = 'BSC_MAINNET'
    `);
    await queryRunner.query(`
      UPDATE payment_method_configs SET network = 'CHAPEL' WHERE type = 'BSC' AND network = 'BSC_CHAPEL'
    `);
  }
}
