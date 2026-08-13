/**
 * Tight PII filter for AI Assistant user input.
 *
 * Returns true if the message contains patterns that look like credentials,
 * seed phrases, or other high-risk secrets. The chat pipeline should deny
 * the request with a friendly message rather than forward the input to the LLM.
 */
const SENSITIVE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'private_key', regex: /0x[a-fA-F0-9]{64}\b/ },
  { label: 'mnemonic_12', regex: /\b([a-zA-Z]{3,}\s){11,}[a-zA-Z]{3,}\b/ },
  { label: 'mnemonic_24', regex: /\b([a-zA-Z]{3,}\s){23,}[a-zA-Z]{3,}\b/ },
  { label: 'jwt', regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/ },
  { label: 'binance_key', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { label: 'otp_code', regex: /\b(otp|mã otp|verification code|2fa code)\s*[:\-]?\s*\d{4,8}\b/i },
  { label: 'password_phrase', regex: /\b(password|mật khẩu|passwd|pwd)\s*[:=]\s*\S+/i },
  { label: 'seed_phrase_question', regex: /\b(seed phrase|recovery phrase|mnemonic|private key|secret key)\b/i },
];

export interface PiiDetectionResult {
  containsPii: boolean;
  reasons: string[];
}

export function detectPii(input: string): PiiDetectionResult {
  const reasons: string[] = [];
  for (const { label, regex } of SENSITIVE_PATTERNS) {
    if (regex.test(input)) {
      reasons.push(label);
    }
  }
  return { containsPii: reasons.length > 0, reasons };
}

export const PII_REFUSAL_MESSAGE_VI =
  'Tin nhắn có chứa thông tin nhạy cảm (mật khẩu, mã OTP, private key, seed phrase…). Vui lòng không dán những thông tin này vào chat. Tôi sẽ từ chối trả lời để bảo vệ bạn.';
