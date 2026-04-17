/**
 * crypto-account.worker — CPU-bound account generation off the main thread.
 *
 * Runs in a Piscina worker thread — keeps the Node.js event loop free during
 * heavy cryptographic key generation (ECDSA/secp256k1 for EVM, Ed25519 for Solana).
 *
 * Usage:
 * WorkerPoolModule.forRoot({
 * workerFile: 'src/modules/treasury/workers/crypto-account.worker.js',
 * })
 *
 * Phase 5.1 — Worker Pool infrastructure
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { ethers } from 'ethers';

export type ChainType = 'evm' | 'solana';

export interface GenerateAccountInput {
  type: ChainType;
}

/** EVM wallet result from ethers.Wallet.createRandom(). */
export interface EvmAccountResult {
  address: string;
  privateKey: string;
}

/** Solana keypair — address (base58) + secret key (base64 for thread-safe transfer). */
export interface SolanaAccountResult {
  address: string;
  privateKey: string;
}

export type AccountWorkerResult = EvmAccountResult | SolanaAccountResult;

/**
 * Default export — called by Piscina.run(input).
 * For Tron, keep account generation in the main thread (async HTTP call is not ideal for workers).
 */
export default function generateAccountWorker(input: GenerateAccountInput): AccountWorkerResult {
  if (input.type === 'evm') {
    const wallet = ethers.Wallet.createRandom();
    return { address: wallet.address, privateKey: wallet.privateKey };
  }

  if (input.type === 'solana') {
    const keypair = Keypair.generate();
    // Use bs58 encoding — matches the canonical format expected by Solana SDK and
    // the decoding in TransactionWalletService.resolveMainWalletPrivateKey().
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
    };
  }

  throw new Error(`Unsupported account type: ${input.type}`);
}
