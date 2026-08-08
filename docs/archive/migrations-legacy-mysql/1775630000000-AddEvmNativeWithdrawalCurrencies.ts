import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures DB currency rows exist for native EVM symbols used by auto-withdraw / treasury mapping (POL, AVAX, XDAI, FTM).
 * Idempotent: INSERT IGNORE on unique symbol.
 */
const ROWS: Array<{
  currency_id: string;
  symbol: string;
  name: string;
}> = [
  {
    currency_id: '0193a563-0001-7000-8000-000000000001',
    symbol: 'POL',
    name: 'Polygon',
  },
  {
    currency_id: '0193a563-0001-7000-8000-000000000002',
    symbol: 'AVAX',
    name: 'Avalanche',
  },
  {
    currency_id: '0193a563-0001-7000-8000-000000000003',
    symbol: 'XDAI',
    name: 'Gnosis xDAI',
  },
  {
    currency_id: '0193a563-0001-7000-8000-000000000004',
    symbol: 'FTM',
    name: 'Fantom',
  },
];

export class AddEvmNativeWithdrawalCurrencies1775630000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    for (const r of ROWS) {
      await queryRunner.query(
        `INSERT IGNORE INTO \`currencies\` (\`currency_id\`, \`symbol\`, \`name\`, \`precision_scale\`, \`min_withdraw\`, \`is_tradable\`, \`is_active\`)
         VALUES (?, ?, ?, 18, 0, 0, 1)`,
        [r.currency_id, r.symbol, r.name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    const ids = ROWS.map((r) => r.currency_id);
    const placeholders = ids.map(() => '?').join(', ');
    await queryRunner.query(
      `DELETE FROM \`currencies\` WHERE \`currency_id\` IN (${placeholders})`,
      ids,
    );
  }
}
