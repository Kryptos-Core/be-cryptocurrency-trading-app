import type { ChatTool } from '../infrastructure/llm/vilao-llm.client';

/**
 * OpenAI-style function-calling tool definitions for the AI Assistant.
 * Each tool is implemented by a strategy in `infrastructure/tools/`.
 *
 * IMPORTANT: read-only tools only. No write/mutation tools are exposed —
 * the AI must never place orders or move funds on behalf of the user.
 */
export const AI_TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_ticker',
      description:
        'Lấy ticker hiện tại của một cặp giao dịch (last price, % thay đổi 24h, volume 24h). Symbol dạng "BTC/USDT".',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Cặp giao dịch, ví dụ "BTC/USDT".',
          },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ohlcv',
      description:
        'Lấy dữ liệu OHLCV (nến) gần đây của một cặp giao dịch. Interval: 1m | 5m | 15m | 1h | 4h | 1d.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Cặp giao dịch, ví dụ "BTC/USDT".' },
          interval: {
            type: 'string',
            enum: ['1m', '5m', '15m', '1h', '4h', '1d'],
            description: 'Khung thời gian mỗi nến.',
          },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        },
        required: ['symbol', 'interval'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_wallets',
      description: 'Lấy số dư ví (available, frozen, total) của user hiện tại, TUYỆT ĐỐI không lộ private key/seed.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_open_orders',
      description: 'Lấy danh sách lệnh đang mở (chưa khớp hết) của user hiện tại.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_recent_orders',
      description: 'Lấy N lệnh gần nhất (mặc định 10) của user hiện tại.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
      },
    },
  },
];

export const AI_TOOL_NAMES = AI_TOOLS.map((t) => t.function.name);
