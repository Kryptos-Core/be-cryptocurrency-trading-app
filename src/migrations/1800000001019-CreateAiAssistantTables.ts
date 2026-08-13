import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Create tables for AI Assistant (Vilao LLM integration):
 *  - ai_conversations: per-user chat session
 *  - ai_messages: per-turn messages (system/user/assistant/tool)
 *  - ai_conversation_doc_chunks: RAG index chunks for help/docs
 */
export class CreateAiAssistantTables1800000001019 implements MigrationInterface {
  name = 'CreateAiAssistantTables1800000001019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."ai_conversations_intent_enum"
      AS ENUM ('guide', 'market', 'trading', 'rag', 'general')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        conversation_id   CHAR(36)                                         NOT NULL,
        user_id           CHAR(36)                                         NOT NULL,
        title             VARCHAR(255)                                     NOT NULL,
        intent            "public"."ai_conversations_intent_enum"          NOT NULL DEFAULT 'general',
        last_message_at   TIMESTAMP(3)                                     NULL,
        message_count     INTEGER                                          NOT NULL DEFAULT 0,
        total_tokens_in   INTEGER                                          NOT NULL DEFAULT 0,
        total_tokens_out  INTEGER                                          NOT NULL DEFAULT 0,
        deleted_at        TIMESTAMP(3)                                     NULL,
        created_at        TIMESTAMP(3)                                     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at        TIMESTAMP(3)                                     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT pk_ai_conversations PRIMARY KEY (conversation_id),
        CONSTRAINT fk_ai_conv_user FOREIGN KEY (user_id)
          REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_conv_user
        ON ai_conversations (user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_conv_last_msg
        ON ai_conversations (last_message_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_conv_user_last_msg
        ON ai_conversations (user_id, last_message_at DESC)
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."ai_messages_role_enum"
      AS ENUM ('system', 'user', 'assistant', 'tool')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        message_id        CHAR(36)                                         NOT NULL,
        conversation_id   CHAR(36)                                         NOT NULL,
        role              "public"."ai_messages_role_enum"                 NOT NULL,
        content           TEXT                                             NOT NULL,
        model             VARCHAR(100)                                     NULL,
        tokens_in         INTEGER                                          NOT NULL DEFAULT 0,
        tokens_out        INTEGER                                          NOT NULL DEFAULT 0,
        tool_calls        JSONB                                            NULL,
        context_refs      JSONB                                            NULL,
        parent_message_id CHAR(36)                                         NULL,
        created_at        TIMESTAMP(3)                                     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT pk_ai_messages PRIMARY KEY (message_id),
        CONSTRAINT fk_ai_msg_conv FOREIGN KEY (conversation_id)
          REFERENCES ai_conversations(conversation_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_msg_conv
        ON ai_messages (conversation_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_msg_created
        ON ai_messages (created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_msg_conv_created
        ON ai_messages (conversation_id, created_at)
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."ai_conversation_doc_chunks_source_enum"
      AS ENUM ('help_center', 'faq', 'docs', 'manual')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_conversation_doc_chunks (
        chunk_id       CHAR(36)                                                     NOT NULL,
        source         "public"."ai_conversation_doc_chunks_source_enum"            NOT NULL,
        source_id      VARCHAR(255)                                                 NOT NULL,
        title          VARCHAR(500)                                                 NOT NULL,
        chunk_text     TEXT                                                         NOT NULL,
        embedding      JSONB                                                        NOT NULL,
        token_count    INTEGER                                                      NOT NULL DEFAULT 0,
        metadata       JSONB                                                        NULL,
        created_at     TIMESTAMP(3)                                                 NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT pk_ai_doc_chunks PRIMARY KEY (chunk_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_doc_source
        ON ai_conversation_doc_chunks (source)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_doc_source_id
        ON ai_conversation_doc_chunks (source, source_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_doc_source_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_doc_source`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_conversation_doc_chunks`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ai_conversation_doc_chunks_source_enum"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_msg_conv_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_msg_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_msg_conv`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_messages`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ai_messages_role_enum"`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_conv_user_last_msg`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_conv_last_msg`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ai_conv_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_conversations`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ai_conversations_intent_enum"`,
    );
  }
}
