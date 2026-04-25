export type MatchingEngineMode = 'ts' | 'go_shadow' | 'go_canary' | 'go' | string;

function normalizeMode(mode: string | null | undefined): MatchingEngineMode {
  return (mode ?? 'ts').trim().toLowerCase();
}

function parseCanaryPairs(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean),
  );
}

export class MatchingEngineRoutingPolicy {
  readonly mode: MatchingEngineMode;
  readonly canaryPairs: Set<string>;

  constructor(mode: string | null | undefined, canaryPairsRaw: string | null | undefined) {
    this.mode = normalizeMode(mode);
    this.canaryPairs = parseCanaryPairs(canaryPairsRaw);
  }

  shouldEnqueueShadow(pairId: string): boolean {
    if (this.mode === 'go_shadow') {
      return true;
    }

    if (this.mode === 'go_canary') {
      return this.canaryPairs.has((pairId ?? '').trim());
    }

    return false;
  }
}
