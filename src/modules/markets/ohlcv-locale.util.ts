/**
 * Resolve BCP 47-ish locale for OHLCV responses / client hints.
 * Query `locale` wins over `Accept-Language` first segment.
 */
export function resolveOhlcvLocale(
  localeQuery?: string,
  acceptLanguageHeader?: string,
): string {
  const q = localeQuery?.trim();
  if (q) {
    const normalized = q.replace(/_/g, '-');
    if (/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/.test(normalized)) {
      return normalized;
    }
  }
  const al = acceptLanguageHeader?.split(',')[0]?.split(';')[0]?.trim();
  if (al && al.length > 0) return al.replace(/_/g, '-');
  return 'en';
}
