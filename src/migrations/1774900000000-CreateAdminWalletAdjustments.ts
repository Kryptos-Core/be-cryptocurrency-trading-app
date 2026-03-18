import { MigrationInterface, QueryRunner } from 'typeorm';

async function runProcedureSql(queryRunner: QueryRunner, sql: string): Promise<void> {
  const conn = queryRunner.connection.driver.options.type === 'mariadb'
    ? (queryRunner as any).connection.master
    : (queryRunner as any).connection;
  const raw = conn?.queryRunner?.connection ?? conn?.connection ?? conn;
  if (raw?.query) {
    await raw.query(sql);
    return;
  }
  await queryRunner.query(sql);
}

/**
 * Migration: Create Admin Wallet Adjustments
 *
 * Creates:
 * - admin_wallet_adjustments table (audit trail for manual balance adjustments)
 * - sp_admin_wallet_adjustment_create: insert audit record and return it
 * - sp_admin_wallet_adjustment_find_by_target: paginated list by target user
 */
export class CreateAdminWalletAdjustments1774900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── admin_wallet_adjustments ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_wallet_adjustments (
        adjustment_id   CHAR(36)       NOT NULL,
        actor_user_id   CHAR(36)       NOT NULL,
        target_user_id  CHAR(36)       NOT NULL,
        currency_id     CHAR(36)       NOT NULL,
        amount          DECIMAL(36,18) NOT NULL,
        type            ENUM('DEPOSIT','WITHDRAW') NOT NULL,
        note            VARCHAR(500)   NULL,
        created_at      DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (adjustment_id),
        INDEX idx_adj_actor  (actor_user_id),
        INDEX idx_adj_target (target_user_id),
        INDEX idx_adj_created (created_at),
        CONSTRAINT fk_adj_actor    FOREIGN KEY (actor_user_id)  REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_adj_target   FOREIGN KEY (target_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_adj_currency FOREIGN KEY (currency_id)    REFERENCES currencies(currency_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── sp_admin_wallet_adjustment_create ────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_admin_wallet_adjustment_create');
    await runProcedureSql(queryRunner, `
      CREATE PROCEDURE sp_admin_wallet_adjustment_create(
        IN p_adjustment_id  CHAR(36),
        IN p_actor_user_id  CHAR(36),
        IN p_target_user_id CHAR(36),
        IN p_currency_id    CHAR(36),
        IN p_amount         DECIMAL(36,18),
        IN p_type           VARCHAR(10),
        IN p_note           VARCHAR(500)
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO admin_wallet_adjustments
          (adjustment_id, actor_user_id, target_user_id, currency_id, amount, type, note)
        VALUES
          (p_adjustment_id, p_actor_user_id, p_target_user_id, p_currency_id, p_amount, p_type, p_note);

        SELECT
          a.adjustment_id,
          a.actor_user_id,
          a.target_user_id,
          a.currency_id,
          a.amount,
          a.type,
          a.note,
          a.created_at,
          u_actor.email  AS actor_email,
          u_target.email AS target_email,
          c.symbol       AS currency_symbol
        FROM admin_wallet_adjustments a
        INNER JOIN users      u_actor  ON u_actor.user_id   = a.actor_user_id
        INNER JOIN users      u_target ON u_target.user_id  = a.target_user_id
        INNER JOIN currencies c        ON c.currency_id     = a.currency_id
        WHERE a.adjustment_id = p_adjustment_id
        LIMIT 1;
      END
    `);

    // ── sp_admin_wallet_adjustment_find_by_target ────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_admin_wallet_adjustment_find_by_target');
    await runProcedureSql(queryRunner, `
      CREATE PROCEDURE sp_admin_wallet_adjustment_find_by_target(
        IN p_target_user_id CHAR(36),
        IN p_limit          INT,
        IN p_offset         INT
      )
      READS SQL DATA
      BEGIN
        SELECT
          a.adjustment_id,
          a.actor_user_id,
          a.target_user_id,
          a.currency_id,
          a.amount,
          a.type,
          a.note,
          a.created_at,
          u_actor.email  AS actor_email,
          u_target.email AS target_email,
          c.symbol       AS currency_symbol
        FROM admin_wallet_adjustments a
        INNER JOIN users      u_actor  ON u_actor.user_id  = a.actor_user_id
        INNER JOIN users      u_target ON u_target.user_id = a.target_user_id
        INNER JOIN currencies c        ON c.currency_id    = a.currency_id
        WHERE a.target_user_id = p_target_user_id
        ORDER BY a.created_at DESC
        LIMIT p_limit OFFSET p_offset;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_admin_wallet_adjustment_find_by_target');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_admin_wallet_adjustment_create');
    await queryRunner.query('DROP TABLE IF EXISTS admin_wallet_adjustments');
  }
}
