/**
 * Name utility functions used for user profile normalization.
 */
export function capitalizeWords(name: string): string {
  if (!name) {
    return '';
  }

  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function sanitizeName(name: string): string {
  if (!name) {
    return '';
  }

  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-ZÀ-ỹ\s]/g, '');
}

export function formatName(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  const sanitized = sanitizeName(name);
  return sanitized ? capitalizeWords(sanitized) : undefined;
}
