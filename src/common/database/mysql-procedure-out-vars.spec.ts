import { DataSource } from 'typeorm';
import { selectMysqlUserVars } from './mysql-procedure-out-vars';

describe('selectMysqlUserVars', () => {
  it('builds SELECT from varAliases and returns first row', async () => {
    const query = jest.fn().mockResolvedValue([
      { trade_id: 't1', error_code: null, error_message: null },
    ]);
    const dataSource = { query } as unknown as DataSource;

    const row = await selectMysqlUserVars(dataSource, {
      trade_id: 'p_trade_id',
      error_code: 'p_error_code',
      error_message: 'p_error_message',
    });

    expect(query).toHaveBeenCalledWith(
      'SELECT @p_trade_id AS `trade_id`, @p_error_code AS `error_code`, @p_error_message AS `error_message`',
    );
    expect(row.trade_id).toBe('t1');
    expect(row.error_code).toBeNull();
  });

  it('returns empty object when no aliases', async () => {
    const query = jest.fn();
    const dataSource = { query } as unknown as DataSource;
    const row = await selectMysqlUserVars(dataSource, {});
    expect(row).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});
