import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runInSpan } from '@/common/telemetry';

export interface BinanceRestRawResponse {
  ok: boolean;
  status: number;
  body: string;
}

interface BinanceRequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

@Injectable()
export class BinanceRestClient {
  private readonly defaultPublicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultPublicBaseUrl =
      this.configService.get<string>('app.trading.binance.publicBaseUrl') ||
      'https://api.binance.com';
  }

  async getPublicJson<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: BinanceRequestOptions,
  ): Promise<T> {
    return runInSpan(
      'BinanceRest.getPublicJson',
      async () => {
        const response = await this.requestRaw('GET', endpoint, params, options);
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status} ${response.body}`);
        }
        return JSON.parse(response.body || '{}') as T;
      },
      { module: 'binance-rest', endpoint },
    );
  }

  async getPublicText(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: BinanceRequestOptions,
  ): Promise<BinanceRestRawResponse> {
    return this.requestRaw('GET', endpoint, params, options);
  }

  async getServerTime(baseUrl: string): Promise<number> {
    const data = await this.getPublicJson<{ serverTime?: number }>('/api/v3/time', undefined, {
      baseUrl,
    });
    return Number(data.serverTime ?? 0);
  }

  async signedRequest<T>(args: {
    baseUrl: string;
    endpoint: string;
    method: 'GET' | 'POST' | 'DELETE';
    apiKey: string;
    apiSecret: string;
    params?: Record<string, string | number | boolean | undefined>;
    timestamp: number;
    recvWindow?: number;
    timeoutMs?: number;
  }): Promise<T> {
    const query = this.toQueryString({
      ...(args.params || {}),
      timestamp: args.timestamp,
      recvWindow: args.recvWindow ?? 60000,
    });
    const signature = createHmac('sha256', args.apiSecret).update(query).digest('hex');
    const endpointWithSig = `${args.endpoint}?${query}&signature=${signature}`;

    const response = await this.requestRaw(args.method, endpointWithSig, undefined, {
      baseUrl: args.baseUrl,
      timeoutMs: args.timeoutMs,
      headers: {
        'X-MBX-APIKEY': args.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.body}`);
    }

    return JSON.parse(response.body || '{}') as T;
  }

  async ping(endpoint: string, baseUrl?: string): Promise<boolean> {
    const response = await this.requestRaw('GET', endpoint, undefined, { baseUrl });
    return response.ok;
  }

  private async requestRaw(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: BinanceRequestOptions,
  ): Promise<BinanceRestRawResponse> {
    const baseUrl = options?.baseUrl || this.defaultPublicBaseUrl;
    const url = this.buildUrl(baseUrl, endpoint, params);

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 10000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: options?.headers,
        signal: controller.signal,
      });
      const body = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        body,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(
    baseUrl: string,
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    if (!params || Object.keys(params).length === 0) {
      return `${baseUrl}${endpoint}`;
    }
    const query = this.toQueryString(params);
    const joiner = endpoint.includes('?') ? '&' : '?';
    return `${baseUrl}${endpoint}${joiner}${query}`;
  }

  private toQueryString(params: Record<string, string | number | boolean | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      search.append(key, String(value));
    }
    return search.toString();
  }
}
