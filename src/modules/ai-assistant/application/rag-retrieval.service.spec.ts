import { RagRetrievalService } from './rag-retrieval.service';
import { VilaoEmbeddingClient } from '../infrastructure/llm/vilao-embedding.client';
import { DOC_CHUNK_REPOSITORY, type AiDocChunkRepository } from '../domain/ports';
import type { AiDocChunk } from '../domain/entities/conversation';

const chunk = (overrides: Partial<AiDocChunk> = {}): AiDocChunk => ({
  chunk_id: 'c1',
  source: 'docs',
  source_id: 's1',
  title: 't',
  chunk_text: 'hello',
  embedding: [1, 0, 0],
  token_count: 1,
  metadata: null,
  created_at: new Date(),
  ...overrides,
});

describe('RagRetrievalService', () => {
  const buildRepo = (overrides: Partial<AiDocChunkRepository> = {}): AiDocChunkRepository => ({
    upsertMany: jest.fn().mockResolvedValue(0),
    listAll: jest.fn().mockResolvedValue([]),
    countAll: jest.fn().mockResolvedValue(0),
    deleteAll: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const buildEmbedding = (overrides: Partial<VilaoEmbeddingClient> = {}): VilaoEmbeddingClient => ({
    isConfigured: true,
    getDefaultModel: () => 'openai/gpt-4o-mini',
    embed: jest.fn().mockResolvedValue({ embedding: [1, 0, 0], model: 'm', tokens: 1 }),
    embedBatch: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as VilaoEmbeddingClient);

  it('returns empty when embedding client not configured', async () => {
    const svc = new RagRetrievalService(
      buildEmbedding({ isConfigured: false }),
      buildRepo(),
    );
    await expect(svc.retrieve('hi')).resolves.toEqual([]);
  });

  it('returns empty when no chunks stored', async () => {
    const svc = new RagRetrievalService(
      buildEmbedding(),
      buildRepo({ countAll: jest.fn().mockResolvedValue(0) }),
    );
    await expect(svc.retrieve('hi')).resolves.toEqual([]);
  });

  it('returns top-k chunks sorted by cosine similarity', async () => {
    const chunks = [
      chunk({ chunk_id: 'a', embedding: [1, 0, 0] }),
      chunk({ chunk_id: 'b', embedding: [0, 1, 0] }),
      chunk({ chunk_id: 'c', embedding: [0.9, 0.1, 0] }),
    ];
    const repo = buildRepo({
      countAll: jest.fn().mockResolvedValue(3),
      listAll: jest.fn().mockResolvedValue(chunks),
    });
    const embed = buildEmbedding({
      embed: jest.fn().mockResolvedValue({ embedding: [1, 0, 0], model: 'm', tokens: 1 }),
    });
    const svc = new RagRetrievalService(embed, repo);
    const result = await svc.retrieve('hi', 2);
    expect(result.map((r) => r.chunk_id)).toEqual(['a', 'c']);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('invalidateCache clears in-memory cache', async () => {
    const repo = buildRepo({
      countAll: jest.fn().mockResolvedValue(1),
      listAll: jest.fn().mockResolvedValue([chunk()]),
    });
    const svc = new RagRetrievalService(buildEmbedding(), repo);
    await svc.retrieve('hi');
    svc.invalidateCache();
    await svc.retrieve('hi');
    expect(repo.listAll).toHaveBeenCalled();
  });
});
