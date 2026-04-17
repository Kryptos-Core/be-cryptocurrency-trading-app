#!/usr/bin/env node
/**
 * Lightweight boundary check: forbid direct imports of another module's
 * `application/` tree from a different `modules/<name>/`.
 *
 * Run: node scripts/check-module-boundaries.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src', 'modules');
const allowlistPath = path.join(__dirname, 'boundaries-allowlist.txt');

const allowlist = new Set(
  fs.existsSync(allowlistPath)
    ? fs
        .readFileSync(allowlistPath, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    : [],
);

const violations = [];

function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full);
    else if (name.isFile() && (name.name.endsWith('.ts') || name.name.endsWith('.tsx'))) {
      const rel = path.relative(srcRoot, full).replaceAll('\\', '/');
      const fromCtx = rel.split('/')[0];
      const text = fs.readFileSync(full, 'utf8');
      const re = /from ['"]@\/modules\/([^/'"]+)\/application\//g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const toCtx = m[1];
        if (toCtx !== fromCtx && !allowlist.has(rel)) {
          violations.push(`${rel}: cross-context import of modules/${toCtx}/application/...`);
        }
      }
    }
  }
}

if (fs.existsSync(srcRoot)) {
  walk(srcRoot);
}

if (violations.length) {
  console.error('Module boundary violations:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('Module boundary check OK');
