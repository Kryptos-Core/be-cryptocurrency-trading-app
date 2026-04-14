#!/usr/bin/env node
const { readStdin } = require('./adapter');
readStdin().then(raw => {
  try {
    const input = JSON.parse(raw);
    const prompt = input.prompt || input.content || input.message || '';
    const secretPatterns = [
      { re: /sk-[a-zA-Z0-9]{20,}/, label: 'OpenAI API key' },
      { re: /ghp_[a-zA-Z0-9]{36,}/, label: 'GitHub token' },
      { re: /AKIA[A-Z0-9]{16}/, label: 'AWS access key' },
      { re: /xox[bpsa]-[a-zA-Z0-9-]+/, label: 'Slack token' },
      { re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, label: 'Private key' },
      // Crypto/blockchain patterns
      { re: /[0-9a-fA-F]{64}/, label: 'Possible raw private key (64-char hex)' },
      { re: /seed[\s_-]?phrase/i, label: 'Seed phrase reference' },
      { re: /mnemonic/i, label: 'Mnemonic reference' },
      { re: /eyJ[a-zA-Z0-9_-]{50,}\.eyJ[a-zA-Z0-9_-]{20,}/, label: 'JWT token' },
      // Backend-specific
      { re: /DB_PASSWORD\s*=\s*\S+/, label: 'Database password' },
      { re: /REDIS_PASSWORD\s*=\s*\S+/, label: 'Redis password' },
      { re: /JWT_SECRET\s*=\s*\S+/, label: 'JWT secret' },
      { re: /[a-zA-Z0-9]{32,}-[a-zA-Z0-9]{4,}/, label: 'Possible exchange API key' },
    ];
    const found = [];
    for (const { re, label } of secretPatterns) {
      if (re.test(prompt)) found.push(label);
    }
    if (found.length > 0) {
      console.error('[VIBE-CODE] ⚠ Potential secret/sensitive data detected in prompt:');
      found.forEach(l => console.error(`  - ${l}`));
      console.error('[VIBE-CODE] Remove before submitting. Use <placeholder> or env var names only.');
    }

    // Sensitive zone warning
    const sensitiveZones = ['matching/', 'orders/', 'wallets/', 'treasury/', 'blockchain/'];
    const hasSensitiveRef = sensitiveZones.some(zone => prompt.includes(zone));
    if (hasSensitiveRef) {
      console.error('[VIBE-CODE] ℹ Prompt references a SENSITIVE module.');
      console.error('[VIBE-CODE] Reminder: changes to matching/, orders/, wallets/, treasury/, blockchain/ require:');
      console.error('[VIBE-CODE]   1. Risk assessment in docs/risk-<feature>.md');
      console.error('[VIBE-CODE]   2. 100% coverage for business logic paths');
      console.error('[VIBE-CODE]   3. 2 reviewers (Tech Lead + Senior)');
    }
  } catch {}
  process.stdout.write(raw);
}).catch(() => process.exit(0));
