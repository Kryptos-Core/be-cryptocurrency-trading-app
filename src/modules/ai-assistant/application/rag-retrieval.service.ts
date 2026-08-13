import { Injectable, Logger } from '@nestjs/common';
import { VilaoEmbeddingClient } from '../infrastructure/llm/vilao-embedding.client';
import { DOC_CHUNK_REPOSITORY, type AiDocChunkRepository } from '../domain/ports';
import { Inject } from '@nestjs/common';
import type { AiDocChunk } from '../domain/entities/conversation';

export interface RetrievedChunk {
  chunk_id: string;
  source: string;
  source_id: string;
  title: string;
  chunk_text: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

const DEFAULT_TOP_K = 5;

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);
  private cache: Array<{ id: string; embedding: number[] }> = [];

  constructor(
    private readonly embeddingClient: VilaoEmbeddingClient,
    @Inject(DOC_CHUNK_REPOSITORY)
    private readonly repo: AiDocChunkRepository,
  ) {}

  async retrieve(query: string, topK: number = DEFAULT_TOP_K): Promise<RetrievedChunk[]> {
    if (!this.embeddingClient.isConfigured || query.trim().length === 0) return [];
    const total = await this.repo.countAll();
    if (total === 0) return [];
    const embedding = await this.embeddingClient.embed(query);
    const candidates = await this.loadCache();
    const scored = candidates.map((c) => ({
      id: c.id,
      score: cosineSimilarity(embedding.embedding, c.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK);
    const all = await this.repo.listAll();
    const byId = new Map(all.map((c) => [c.chunk_id, c] as const));
    const result: RetrievedChunk[] = [];
    for (const t of top) {
      const chunk = byId.get(t.id);
      if (!chunk) continue;
      result.push({
        chunk_id: chunk.chunk_id,
        source: chunk.source,
        source_id: chunk.source_id,
        title: chunk.title,
        chunk_text: chunk.chunk_text,
        score: t.score,
        metadata: chunk.metadata,
      });
    }
    return result;
  }

  invalidateCache(): void {
    this.cache = [];
  }

  private async loadCache(): Promise<Array<{ id: string; embedding: number[] }>> {
    if (this.cache.length > 0) return this.cache;
    const all = await this.repo.listAll();
    this.cache = all.map((c) => ({ id: c.chunk_id, embedding: c.embedding }));
    return this.cache;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}
