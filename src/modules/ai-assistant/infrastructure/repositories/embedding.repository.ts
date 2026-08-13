import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AiConversationDocChunk } from '@/entities/ai-conversation-doc-chunk.entity';
import type { AiDocChunk } from '../../domain/entities/conversation';
import type { AiDocChunkRepository } from '../../domain/ports';

@Injectable()
export class TypeOrmAiDocChunkRepository implements AiDocChunkRepository {
  constructor(
    @InjectRepository(AiConversationDocChunk)
    private readonly repo: Repository<AiConversationDocChunk>,
  ) {}

  async upsertMany(chunks: Array<Omit<AiDocChunk, 'created_at'>>): Promise<number> {
    if (chunks.length === 0) return 0;
    // Delete existing rows that share the same (source, source_id) — primary key
    // for RAG content is the doc source + chunk index, not a UUID.
    const keys = chunks.map((c) => c.source_id);
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('source_id IN (:...keys)', { keys })
      .execute();

    const entities = chunks.map((c) =>
      this.repo.create({
        chunk_id: c.chunk_id ?? uuidv7(),
        source: c.source,
        source_id: c.source_id,
        title: c.title,
        chunk_text: c.chunk_text,
        embedding: c.embedding,
        token_count: c.token_count,
        metadata: c.metadata ?? null,
      }),
    );
    await this.repo.save(entities);
    return entities.length;
  }

  async listAll(): Promise<AiDocChunk[]> {
    const rows = await this.repo.find({ order: { created_at: 'ASC' } });
    return rows.map((r) => ({
      chunk_id: r.chunk_id,
      source: r.source,
      source_id: r.source_id,
      title: r.title,
      chunk_text: r.chunk_text,
      embedding: r.embedding,
      token_count: r.token_count,
      metadata: r.metadata,
      created_at: r.created_at,
    }));
  }

  async countAll(): Promise<number> {
    return this.repo.count();
  }

  async deleteAll(): Promise<void> {
    await this.repo.createQueryBuilder().delete().execute();
  }
}
