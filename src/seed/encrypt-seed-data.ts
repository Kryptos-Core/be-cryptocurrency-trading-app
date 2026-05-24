/**
 * CLI tool to encrypt/decrypt seed users data.
 *
 * Usage:
 *   npm run seed:encrypt        Encrypt users.json → users.json.enc, overwrite users.json with dummy []
 *   npm run seed:decrypt        Decrypt users.json.enc → print to stdout
 *   npm run seed:encrypt:dry    Encrypt and print ciphertext to stdout (no files written)
 *
 * Environment:
 *   SEED_DATA_ENCRYPTION_KEY   64-char hex key (32 bytes). Falls back to WALLET_ENCRYPTION_KEY.
 *   SEED_USERS_JSON            Optional: path to users.json (default: src/seed/data/users.json)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SeedEncryptionService } from './seed-encryption.service';

const SEED_DATA_DIR = path.join(process.cwd(), 'src', 'seed', 'data');
const USERS_JSON_PATH = path.join(SEED_DATA_DIR, 'users.json');
const USERS_JSON_ENC_PATH = path.join(SEED_DATA_DIR, 'users.json.enc');
const DUMMY_CONTENT = '[]';

function resolveKey(): string {
  const key = process.env.SEED_DATA_ENCRYPTION_KEY ?? process.env.WALLET_ENCRYPTION_KEY;
  if (!key) {
    console.error(
      'ERROR: SEED_DATA_ENCRYPTION_KEY env var is required.\n' +
        'Generate one with: openssl rand -hex 32\n' +
        'Add it to your .env.development or .env file.',
    );
    process.exit(1);
  }
  return key;
}

function resolveUsersJsonPath(): string {
  if (process.env.SEED_USERS_JSON) {
    const resolved = path.isAbsolute(process.env.SEED_USERS_JSON)
      ? process.env.SEED_USERS_JSON
      : path.join(process.cwd(), process.env.SEED_USERS_JSON);
    if (!fs.existsSync(resolved)) {
      console.error(`ERROR: SEED_USERS_JSON points to non-existent file: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }
  return USERS_JSON_PATH;
}

async function cmdEncrypt(key: string, dryRun: boolean): Promise<void> {
  const usersJsonPath = resolveUsersJsonPath();

  if (!fs.existsSync(usersJsonPath)) {
    console.error(`ERROR: ${usersJsonPath} not found. Nothing to encrypt.`);
    process.exit(1);
  }

  const plaintext = fs.readFileSync(usersJsonPath, 'utf8').trim();

  if (!plaintext || plaintext === '[]') {
    console.error(
      `ERROR: ${usersJsonPath} is empty or already dummy. ` +
        'Nothing to encrypt. Edit the file first with real data.',
    );
    process.exit(1);
  }

  const encryptionService = new SeedEncryptionService(key);
  const ciphertext = encryptionService.encrypt(plaintext);

  if (dryRun) {
    console.log('=== Dry run: encrypted output ===');
    console.log(ciphertext);
    console.log('=== (no files written) ===');
    return;
  }

  // Write encrypted file
  fs.writeFileSync(USERS_JSON_ENC_PATH, ciphertext, 'utf8');
  console.log(`✅ Encrypted: ${usersJsonPath} → ${USERS_JSON_ENC_PATH}`);

  // Overwrite plaintext with dummy content
  fs.writeFileSync(usersJsonPath, DUMMY_CONTENT, 'utf8');
  console.log(`✅ Overwritten: ${usersJsonPath} (dummy content — edit this file to add users)`);
  console.log(
    '\nℹ️  To restore plaintext, decrypt with: npm run seed:decrypt',
  );
}

async function cmdDecrypt(key: string): Promise<void> {
  if (!fs.existsSync(USERS_JSON_ENC_PATH)) {
    console.error(`ERROR: ${USERS_JSON_ENC_PATH} not found. Run npm run seed:encrypt first.`);
    process.exit(1);
  }

  const ciphertext = fs.readFileSync(USERS_JSON_ENC_PATH, 'utf8').trim();
  if (!ciphertext) {
    console.error(`ERROR: ${USERS_JSON_ENC_PATH} is empty.`);
    process.exit(1);
  }

  const encryptionService = new SeedEncryptionService(key);
  const plaintext = encryptionService.decrypt(ciphertext);

  console.log('=== Decrypted seed users data ===');
  console.log(plaintext);
  console.log('===============================');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] ?? 'encrypt';

  if (mode === '--help' || mode === '-h' || mode === 'help') {
    console.log(`
Seed Data Encryption CLI

Usage:
  npm run seed:encrypt        Encrypt users.json → users.json.enc, overwrite users.json
  npm run seed:decrypt        Decrypt users.json.enc → print to stdout
  npm run seed:encrypt:dry    Encrypt and print to stdout (no files written)

Environment:
  SEED_DATA_ENCRYPTION_KEY   64-char hex key (32 bytes, required)
  SEED_USERS_JSON            Optional path to users.json

Examples:
  # Encrypt seed data
  SEED_DATA_ENCRYPTION_KEY=$(openssl rand -hex 32) npm run seed:encrypt

  # Decrypt and view
  SEED_DATA_ENCRYPTION_KEY=your-key npm run seed:decrypt
`);
    return;
  }

  const key = resolveKey();

  switch (mode) {
    case '--encrypt':
    case 'encrypt':
      await cmdEncrypt(key, false);
      break;
    case '--decrypt':
    case 'decrypt':
      await cmdDecrypt(key);
      break;
    case '--dry-run':
    case 'dry-run':
    case 'dry':
      await cmdEncrypt(key, true);
      break;
    default:
      console.error(`Unknown mode: ${mode}`);
      console.error('Use: npm run seed:encrypt | npm run seed:decrypt | npm run seed:encrypt:dry');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
