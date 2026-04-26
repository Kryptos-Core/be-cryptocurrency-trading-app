export interface TreasuryE2EConnectionTestStep {
  step: string;
  ok: boolean;
  detail: string;
  data?: Record<string, unknown>;
}

export interface TreasuryE2EConnectionTestResult {
  ok: boolean;
  steps: TreasuryE2EConnectionTestStep[];
}
