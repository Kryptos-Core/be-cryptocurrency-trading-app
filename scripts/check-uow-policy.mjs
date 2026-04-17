#!/usr/bin/env node
/**
 * Flags direct `this.dataSource.transaction(` usage outside approved paths.
 * Goal: route new writes through `UnitOfWork` (see src/common/unit-of-work).
 *
 * Run: node scripts/check-uow-policy.mjs
 *
 * Allowlist: scripts/uow-policy-allowlist.txt (paths relative to src/, one per line).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');
const allowlistPath = path.join(__dirname, 'uow-policy-allowlist.txt');

const allowlist = new Set(
  fs.existsSync(allowlistPath)
    ? fs
        .readFileSync(allowlistPath, 'utf8')
        .split('\n')
        .map((l) => l.trim().replaceAll('\\', '/'))
        .filter((l) => l && !l.startsWith('#'))
    : [],
);

const violations = [];
const re = /\bthis\.dataSource\.transaction\s*\(/g;

function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full);
    else if (name.isFile() && name.name.endsWith('.ts') && !name.name.endsWith('.d.ts')) {
      const rel = path.relative(srcRoot, full).replaceAll('\\', '/');
      if (rel.endsWith('.spec.ts')) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      let ok = false;
      for (const raw of allowlist) {
        const prefix = raw.replace(/\/+$/, '');
        if (rel === prefix || rel.startsWith(`${prefix}/`)) {
          ok = true;
          break;
        }
      }
      if (!ok) violations.push(`${rel}: uses this.dataSource.transaction(`);
    }
  }
}

if (fs.existsSync(srcRoot)) {
  walk(srcRoot);
}

if (violations.length) {
  console.error('UoW policy violations:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('UoW policy check OK');
