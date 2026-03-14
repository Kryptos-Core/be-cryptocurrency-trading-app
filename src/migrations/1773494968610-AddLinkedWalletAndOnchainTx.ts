import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkedWalletAndOnchainTx1773494968610 implements MigrationInterface {
    name = 'AddLinkedWalletAndOnchainTx1773494968610'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`linked_wallets\` (\`link_id\` char(36) NOT NULL, \`user_id\` char(36) NOT NULL, \`chain\` enum ('TRON_NILE', 'TRON_SHASTA', 'SOLANA_DEVNET', 'ETH_SEPOLIA') NOT NULL, \`address\` varchar(255) NOT NULL, \`label\` varchar(100) NULL, \`status\` enum ('PENDING', 'VERIFIED', 'REVOKED') NOT NULL DEFAULT 'PENDING', \`linked_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_linked_wallet_user\` (\`user_id\`, \`status\`), UNIQUE INDEX \`uk_linked_wallet_user_chain_addr\` (\`user_id\`, \`chain\`, \`address\`), PRIMARY KEY (\`link_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onchain_transactions\` (\`tx_id\` char(36) NOT NULL, \`user_id\` char(36) NOT NULL, \`linked_wallet_id\` char(36) NULL, \`chain\` enum ('TRON_NILE', 'TRON_SHASTA', 'SOLANA_DEVNET', 'ETH_SEPOLIA') NOT NULL, \`type\` enum ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER') NOT NULL, \`tx_hash\` varchar(255) NULL, \`from_address\` varchar(255) NOT NULL, \`to_address\` varchar(255) NOT NULL, \`amount\` decimal(36,18) NOT NULL, \`confirmations\` int NOT NULL DEFAULT '0', \`status\` enum ('PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`confirmed_at\` datetime NULL, INDEX \`idx_onchain_tx_created\` (\`user_id\`, \`created_at\`), INDEX \`idx_onchain_tx_user\` (\`user_id\`, \`type\`, \`status\`), UNIQUE INDEX \`uk_onchain_tx_hash\` (\`chain\`, \`tx_hash\`), PRIMARY KEY (\`tx_id\`)) ENGINE=InnoDB`);
        
        await queryRunner.query(`ALTER TABLE \`linked_wallets\` ADD CONSTRAINT \`FK_linked_wallet_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`onchain_transactions\` ADD CONSTRAINT \`FK_onchain_tx_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`onchain_transactions\` ADD CONSTRAINT \`FK_onchain_tx_linked_wallet\` FOREIGN KEY (\`linked_wallet_id\`) REFERENCES \`linked_wallets\`(\`link_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`onchain_transactions\` DROP FOREIGN KEY \`FK_onchain_tx_linked_wallet\``);
        await queryRunner.query(`ALTER TABLE \`onchain_transactions\` DROP FOREIGN KEY \`FK_onchain_tx_user\``);
        await queryRunner.query(`ALTER TABLE \`linked_wallets\` DROP FOREIGN KEY \`FK_linked_wallet_user\``);
        await queryRunner.query(`DROP INDEX \`uk_onchain_tx_hash\` ON \`onchain_transactions\``);
        await queryRunner.query(`DROP INDEX \`idx_onchain_tx_user\` ON \`onchain_transactions\``);
        await queryRunner.query(`DROP INDEX \`idx_onchain_tx_created\` ON \`onchain_transactions\``);
        await queryRunner.query(`DROP TABLE \`onchain_transactions\``);
        await queryRunner.query(`DROP INDEX \`uk_linked_wallet_user_chain_addr\` ON \`linked_wallets\``);
        await queryRunner.query(`DROP INDEX \`idx_linked_wallet_user\` ON \`linked_wallets\``);
        await queryRunner.query(`DROP TABLE \`linked_wallets\``);
    }
}
