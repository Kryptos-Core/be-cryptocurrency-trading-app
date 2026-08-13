import { Injectable, Logger } from '@nestjs/common';
import { VilaoEmbeddingClient } from '../../infrastructure/llm/vilao-embedding.client';
import { RagRetrievalService } from '../rag-retrieval.service';
import {
  type AiDocChunkRepository,
  DOC_CHUNK_REPOSITORY,
} from '../../domain/ports';
import { Inject } from '@nestjs/common';

interface IngestDoc {
  source: 'help_center' | 'faq' | 'docs' | 'manual';
  source_id: string;
  title: string;
  text: string;
  metadata?: Record<string, unknown>;
}

const MAX_CHUNK_CHARS = 2400;
const OVERLAP_CHARS = 200;

const SEED_DOCS: IngestDoc[] = [
  {
    source: 'docs',
    source_id: 'onboarding:ai-assistant',
    title: 'AI Assistant (Kryptos)',
    text: 'Kryptos AI là trợ lý ảo hỗ trợ khách hàng sử dụng sàn. AI có thể hướng dẫn đặt lệnh, nạp/rút, kết nối ví, phân tích thị trường. Không phải lời khuyên tài chính; crypto rủi ro cao.',
  },
  {
    source: 'docs',
    source_id: 'trading:place-order',
    title: 'Cách đặt lệnh mua/bán',
    text: 'Vào tab Markets, chọn cặp giao dịch (vd BTC/USDT), nhấn Buy/Sell, chọn loại lệnh (Limit/Market), nhập giá và số lượng, xác nhận. Lệnh Limit chỉ khớp khi giá chạm mức mong muốn; lệnh Market khớp ngay theo giá thị trường.',
  },
  {
    source: 'docs',
    source_id: 'wallet:deposit-fiat',
    title: 'Nạp tiền fiat (VND) qua PayOS',
    text: 'Vào Wallets → Deposit → PayOS, nhập số tiền VND, hệ thống tạo QR SePay. Quét QR bằng app ngân hàng, xác nhận chuyển khoản. Số dư USDT được cộng sau khi webhook xác nhận (thường 1-3 phút).',
  },
  {
    source: 'docs',
    source_id: 'wallet:deposit-crypto',
    title: 'Nạp crypto on-chain',
    text: 'Vào Wallets → Deposit → chọn chain (ETH/BSC/SOL/TRON) → copy địa chỉ ví hoặc quét QR. Gửi token đúng mạng; gửi sai mạng sẽ mất tiền. Hệ thống ghi nhận sau khi giao dịch có đủ confirmations.',
  },
  {
    source: 'docs',
    source_id: 'wallet:withdraw',
    title: 'Rút tiền crypto on-chain',
    text: 'Vào Wallets → Withdraw, chọn chain, nhập địa chỉ nhận và số lượng. Vượt quá hạn mức tự động cần duyệt thủ công. Lệnh rút có thể bị governance/Risk Officer giữ lại nếu phát hiện rủi ro.',
  },
  {
    source: 'docs',
    source_id: 'auth:2fa',
    title: 'Bật 2FA (email OTP)',
    text: 'Vào Settings → Security → Enable 2FA. Mỗi lần đăng nhập, đổi mật khẩu, thêm ví, rút tiền lớn đều cần OTP qua email. Admin có thể tắt yêu cầu 2FA qua System Configs.',
  },
  {
    source: 'docs',
    source_id: 'wallets:connect',
    title: 'Kết nối ví ngoài (WalletConnect)',
    text: 'Vào Profile → Connect Wallet → chọn chain. QR Reown AppKit hiện ra; ví mobile scan và ký. Backend xác minh chữ ký rồi liên kết ví với tài khoản.',
  },
  {
    source: 'faq',
    source_id: 'faq:order-not-match',
    title: 'Lệnh không khớp',
    text: 'Lệnh Limit chỉ khớp khi giá thị trường chạm giá đặt. Kiểm tra order book, spread, fee. Nếu lệnh vẫn pending khi giá đã chạm, có thể do slippage hoặc liquidity thấp. Cân nhắc cancel và đặt lại.',
  },
  {
    source: 'faq',
    source_id: 'faq:deposit-stuck',
    title: 'Nạp tiền bị treo',
    text: 'Fiat: webhook từ SePay mất 1-3 phút; nếu > 10 phút chưa thấy, liên hệ support kèm nội dung chuyển khoản. Crypto: kiểm tra transaction hash trên block explorer; nếu đủ confirmations mà chưa cộng, kiểm tra đúng mạng/đúng token.',
  },
  {
    source: 'manual',
    source_id: 'manual:nav',
    title: 'Điều hướng app',
    text: 'Bottom nav: Dashboard (tổng quan), Markets (khớp lệnh), Wallets (ví), Profile (cá nhân). Nhấn nút AI (hình tròn floating) để mở trợ lý ảo.',
  },
];

/**
 * Ingest help/FAQ/manual docs into the RAG index.
 * Run via: `npm run db:seed:ai-docs`.
 */
@Injectable()
export class SeedAiHelpDocsUseCase {
  private readonly logger = new Logger(SeedAiHelpDocsUseCase.name);

  constructor(
    private readonly embeddingClient: VilaoEmbeddingClient,
    private readonly rag: RagRetrievalService,
    @Inject(DOC_CHUNK_REPOSITORY)
    private readonly repo: AiDocChunkRepository,
  ) {}

  async execute(force: boolean = false): Promise<{ indexed: number; skipped: number }> {
    if (!this.embeddingClient.isConfigured) {
      this.logger.warn('Skip seed: VILAO_API_KEY not configured');
      return { indexed: 0, skipped: SEED_DOCS.length };
    }

    if (force) {
      await this.repo.deleteAll();
      this.rag.invalidateCache();
    }

    const existing = await this.repo.countAll();
    if (existing > 0) {
      this.logger.log(`RAG index already has ${existing} chunks; pass force=true to rebuild`);
      return { indexed: 0, skipped: SEED_DOCS.length };
    }

    let indexed = 0;
    for (const doc of SEED_DOCS) {
      const chunks = chunkText(doc.text);
      const embeddings = await this.embeddingClient.embedBatch(chunks);
      await this.repo.upsertMany(
        chunks.map((text, i) => ({
          chunk_id: `${doc.source_id}:${i}`,
          source: doc.source,
          source_id: `${doc.source_id}#${i}`,
          title: doc.title,
          chunk_text: text,
          embedding: embeddings[i].embedding,
          token_count: Math.ceil(text.length / 4),
          metadata: { ...doc.metadata, parentId: doc.source_id },
        })),
      );
      indexed += chunks.length;
    }
    this.rag.invalidateCache();
    this.logger.log(`Indexed ${indexed} chunks from ${SEED_DOCS.length} docs`);
    return { indexed, skipped: 0 };
  }
}

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAX_CHUNK_CHARS, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - OVERLAP_CHARS;
  }
  return chunks;
}
