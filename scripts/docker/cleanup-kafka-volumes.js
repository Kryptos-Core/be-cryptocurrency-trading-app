#!/usr/bin/env node
/**
 * cleanup-kafka-volumes.js
 * Cross-platform wrapper: detects OS and runs the appropriate cleanup script.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptDir = path.resolve(__dirname);
const isWindows = process.platform === 'win32';
const ext = isWindows ? '.ps1' : '.sh';
const scriptName = `cleanup-kafka-volumes${ext}`;
const scriptPath = path.join(scriptDir, scriptName);

if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
}

let child;
if (isWindows) {
    child = spawn('powershell', [
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        ...process.argv.slice(2),
    ], { stdio: 'inherit' });
} else {
    child = spawn('bash', [scriptPath, ...process.argv.slice(2)], {
        stdio: 'inherit',
    });
}

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
