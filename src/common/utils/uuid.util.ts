import { uuidv7 } from 'uuidv7';

/** UUID v7: time-ordered, sortable, RFC 9562. Use for all primary/foreign keys. */
export function newUuid(): string {
  return uuidv7();
}

/** Validate UUID format (v4 or v7, 36 chars with hyphens). */
export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? ''));
}
