#!/usr/bin/env node
/**
 * coverage-gate.mjs
 *
 * Reads Jest coverage report (coverage/coverage-summary.json) and fails
 * if any file in SENSITIVE_ZONES drops below 100% line coverage.
 *
 * Per project AGENTS.md:
 *   "Never modify `matching/` or `treasury/` without 100% coverage and review"
 *
 * Usage:
 *   node scripts/coverage-gate.mjs
 *   node scripts/coverage-gate.mjs --threshold 90
 *
 * Exit code: 0 if all sensitive zones >= 100%, 1 otherwise.
 *
 * Standards from ECC 2.2.0 skill `production-audit`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const thresholdArg = args.find((a) => a.startsWith('--threshold='));
const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1], 10) : 100;

const SENSITIVE_ZONES = [
  'src/modules/auth',
  'src/modules/treasury',
  'src/modules/wallets',
  'src/modules/blockchain',
  'src/modules/matching',
  'src/modules/orders',
  'src/common/errors',
  'src/common/filters',
  'src/common/guards',
];

// Files exempt from full coverage (e.g. error transformers, fallback handlers)
// Listed here to avoid CI red-flags for unreachable code paths.
const EXEMPT_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.d\.ts$/,
  /index\.ts$/,
];

function main() {
  const summaryPath = join(projectRoot, 'coverage/coverage-summary.json');
  if (!existsSync(summaryPath)) {
    console.error(`ERROR: ${summaryPath} not found.`);
    console.error('Run `npm test -- --coverage` first.');
    process.exit(2);
  }

  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const violations = [];
  const totalFiles = Object.keys(summary).length;

  for (const [filePath, metrics] of Object.entries(summary)) {
    if (filePath === 'total') continue;
    const rel = relative(projectRoot, filePath).replace(/\\/g, '/');
    const inSensitive = SENSITIVE_ZONES.some((zone) => rel.startsWith(zone));
    if (!inSensitive) continue;
    const isExempt = EXEMPT_PATTERNS.some((p) => p.test(rel));
    if (isExempt) continue;

    const pct = metrics.lines?.pct ?? 0;
    const branches = metrics.branches?.pct ?? 0;
    if (pct < threshold) {
      violations.push({ file: rel, lines: pct, branches });
    }
  }

  console.log('\n=== Coverage Gate ===\n');
  console.log(`Threshold:    ${threshold}%`);
  console.log(`Total files:  ${totalFiles}`);
  console.log(`Sensitive zones checked: ${SENSITIVE_ZONES.join(', ')}`);
  console.log(`Violations:   ${violations.length}`);

  if (violations.length > 0) {
    console.log('\n--- Files below threshold ---');
    for (const v of violations) {
      console.log(`  ${v.lines.toFixed(1).padStart(5)}% lines  ${v.branches.toFixed(1).padStart(5)}% branches  ${v.file}`);
    }
    console.log('\n❌ Coverage gate FAILED. Add tests for files above.');
    process.exit(1);
  }

  console.log('\n✓ Coverage gate PASSED.');
  process.exit(0);
}

main();
