import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@/common/exceptions';

/**
 * Client gọi BankHub / Cas.so (Open API).
 * Sandbox: https://sandbox.bankhub.dev — Production: base URL từ Console.
 * @see https://cas.so/general/api/grant/create — grant/token, grant/exchange
 * @see https://cas.so/general/api/webhook — webhook Console (endpoint BE: POST .../fiat-withdrawals/webhooks/cas)
 */
@Injectable()
export class CasBankHubService {
  private readonly logger = new Logger(CasBankHubService.name);

  constructor(private readonly configService: ConfigService) {}

  private timeoutMs(): number {
    return this.configService.get<number>('CAS_BANKHUB_TIMEOUT_MS') ?? 8000;
  }

  private baseUrl(): string {
    const u = this.configService.get<string>('CAS_BANKHUB_BASE_URL')?.trim();
    if (!u) {
      throw new BadRequestException('Thiếu CAS_BANKHUB_BASE_URL.', 'CAS_CONFIG_MISSING');
    }
    return u.replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    const apiVer =
      this.configService.get<string>('CAS_BANKHUB_API_VERSION')?.trim() ?? '2023-01-01';
    const clientId = this.configService.get<string>('CAS_CLIENT_ID')?.trim();
    const secret = this.configService.get<string>('CAS_SECRET_KEY')?.trim();
    if (!clientId || !secret) {
      throw new BadRequestException('Thiếu CAS_CLIENT_ID hoặc CAS_SECRET_KEY.', 'CAS_CONFIG_MISSING');
    }
    return {
      'Content-Type': 'application/json',
      'X-BankHub-Api-Version': apiVer,
      'x-client-id': clientId,
      'x-secret-key': secret,
    };
  }

  redirectUri(): string {
    const uri = this.configService.get<string>('CAS_BALANCE_HOOK_REDIRECT_URI')?.trim();
    if (!uri) {
      throw new BadRequestException('Thiếu CAS_BALANCE_HOOK_REDIRECT_URI.', 'CAS_CONFIG_MISSING');
    }
    return uri;
  }

  defaultScopes(): string {
    return this.configService.get<string>('CAS_BALANCE_HOOK_SCOPES')?.trim() ?? 'qrpay';
  }

  private async postJson(path: string, body: Record<string, unknown>): Promise<any> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new BadRequestException(
          `BankHub trả về không phải JSON (HTTP ${res.status}).`,
          'CAS_INVALID_RESPONSE',
        );
      }
      if (!res.ok) {
        const msg =
          json?.message ||
          json?.error?.message ||
          json?.desc ||
          `BankHub HTTP ${res.status}`;
        throw new BadRequestException(String(msg), 'CAS_HTTP_ERROR');
      }
      return json;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(`Cas BankHub POST ${path} failed`, e as Error);
      throw new BadRequestException(
        'Không kết nối được BankHub/Cas.so.',
        'CAS_UNAVAILABLE',
      );
    } finally {
      clearTimeout(t);
    }
  }

  private async getJson(path: string, authHeader: string): Promise<any> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.headers(),
          Authorization: authHeader,
        },
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new BadRequestException(
          `BankHub identity không phải JSON (HTTP ${res.status}).`,
          'CAS_INVALID_RESPONSE',
        );
      }
      if (!res.ok) {
        const msg = json?.message || json?.desc || `BankHub HTTP ${res.status}`;
        throw new BadRequestException(String(msg), 'CAS_HTTP_ERROR');
      }
      return json;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.error(`Cas BankHub GET ${path} failed`, e as Error);
      throw new BadRequestException('Không lấy được identity từ BankHub.', 'CAS_UNAVAILABLE');
    } finally {
      clearTimeout(t);
    }
  }

  /** Bước 1: tạo grant — FE mở link (hoặc Cas Link) theo payload trả về. */
  async createGrantToken(params: { scopes: string; language: string; redirectUri: string }): Promise<any> {
    return this.postJson('/grant/token', {
      scopes: params.scopes,
      language: params.language,
      redirectUri: params.redirectUri,
    });
  }

  /** Bước 2: đổi publicToken → accessToken. */
  async exchangePublicToken(publicToken: string): Promise<any> {
    const token = publicToken.trim();
    if (!token) {
      throw new BadRequestException('publicToken không hợp lệ.', 'CAS_INVALID_PUBLIC_TOKEN');
    }
    return this.postJson('/grant/exchange', { publicToken: token });
  }

  /** Bước 3: lấy thông tin định danh tài khoản đã cấp quyền. */
  async fetchIdentity(accessToken: string): Promise<any> {
    const at = accessToken.trim();
    if (!at) {
      throw new BadRequestException('accessToken không hợp lệ.', 'CAS_INVALID_ACCESS_TOKEN');
    }
    return this.getJson('/identity', at);
  }

  unwrapData(payload: any): any {
    if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
      return payload.data;
    }
    return payload;
  }

  extractAccessToken(payload: any): string | null {
    const d = this.unwrapData(payload);
    const raw =
      d?.accessToken ??
      d?.access_token ??
      d?.token ??
      d?.accessTokenValue ??
      '';
    const s = String(raw).trim();
    return s || null;
  }

  /** URL mở trình duyệt / WebView để user liên kết (nếu API trả về). */
  extractLinkUrl(payload: any): string | null {
    const d = this.unwrapData(payload);
    const candidates = [
      d?.link,
      d?.url,
      d?.casLink,
      d?.redirectUrl,
      d?.redirect_uri,
      d?.linkUrl,
    ];
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s.startsWith('http://') || s.startsWith('https://')) return s;
    }
    return null;
  }

  /**
   * Parse identity — field names có thể khác theo phiên bản API; giữ tolerant.
   */
  parseIdentity(payload: any): {
    accountNumber: string;
    accountHolderName: string;
    bankCode: string | null;
    bankName: string | null;
  } {
    const d = this.unwrapData(payload);
    const accountNumber = String(
      d?.accountNumber ?? d?.account_number ?? d?.number ?? d?.acctNo ?? '',
    )
      .replace(/\s/g, '')
      .trim();
    const accountHolderName = String(
      d?.accountName ??
        d?.accountHolderName ??
        d?.account_holder_name ??
        d?.holderName ??
        d?.name ??
        '',
    )
      .replace(/\s+/g, ' ')
      .trim();
    const bankCodeRaw = String(d?.bankCode ?? d?.bank_code ?? d?.shortName ?? '').trim();
    const bankCode = bankCodeRaw ? bankCodeRaw.toUpperCase() : null;
    const bankName = String(d?.bankName ?? d?.bank_name ?? d?.bank ?? '').trim() || null;

    if (!/^\d{6,19}$/.test(accountNumber)) {
      throw new BadRequestException(
        'BankHub identity không có số tài khoản hợp lệ.',
        'CAS_IDENTITY_INVALID_ACCOUNT',
      );
    }
    if (!accountHolderName || accountHolderName.length < 2) {
      throw new BadRequestException(
        'BankHub identity không có tên chủ tài khoản.',
        'CAS_IDENTITY_INVALID_NAME',
      );
    }

    return { accountNumber, accountHolderName, bankCode, bankName };
  }

  /** Ping nhẹ: POST /grant/token với body rỗng — kỳ vọng 4xx nếu API còn sống (không dùng quota grant thật nếu API reject). */
  async healthPing(): Promise<{ ok: boolean; httpStatus: number; latencyMs: number; error?: string }> {
    const started = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const res = await fetch(`${this.baseUrl()}/grant/token`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      return { ok: res.status < 500, httpStatus: res.status, latencyMs };
    } catch (e) {
      const latencyMs = Date.now() - started;
      return {
        ok: false,
        httpStatus: 0,
        latencyMs,
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      clearTimeout(t);
    }
  }
}
