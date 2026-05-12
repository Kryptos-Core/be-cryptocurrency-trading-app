#!/usr/bin/env node
/**
 * Run a script from dev-scripts.json without adding it to package.json.
 * Usage: node scripts/run-dev-script.mjs <key>
 *   e.g. node scripts/run-dev-script.mjs db:clean
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptKey = process.argv[2];

if (!scriptKey) {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, "..", "dev-scripts.json"), "utf8"),
  );
  console.log("Available scripts in dev-scripts.json:\n");
  Object.entries(pkg.scripts).forEach(([key, cmd]) => {
    console.log(`  ${key}`);
  });
  console.log("\nUsage: node scripts/run-dev-script.mjs <key>");
  process.exit(1);
}

const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "dev-scripts.json"), "utf8"),
);
const cmd = pkg.scripts[scriptKey];

if (!cmd) {
  console.error(`Script "${scriptKey}" not found in dev-scripts.json`);
  process.exit(1);
}

const [program, ...args] = cmd.split(" ");
const child = spawn(program, args, {
  cwd: join(__dirname, ".."),
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
