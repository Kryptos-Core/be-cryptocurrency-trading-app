export function spFirstRow<T>(result: unknown): T | null {
  return (result as any)?.[0]?.[0] ?? null;
}

export function spFirstValue<T>(result: unknown, key: string): T | null {
  const row = spFirstRow<Record<string, T>>(result);
  return row?.[key] ?? null;
}