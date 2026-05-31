#!/usr/bin/env npx tsx
// Reads Foundry's broadcast artifact for DeployMockTokens and writes deployed
// addresses back into tokens.json.
// Run after: forge script script/DeployMockTokens.s.sol --broadcast

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CHAIN_ID = 5003; // Mantle Sepolia
const scriptDir = join(import.meta.dirname, '.');
const tokensPath = join(scriptDir, 'tokens.json');
const artifactPath = join(
  scriptDir,
  `../broadcast/DeployMockTokens.s.sol/${CHAIN_ID}/run-latest.json`,
);

type TokenEntry = {
  addr: string;
  decimals: number;
  mintAmount: string;
  name: string;
  symbol: string;
};

type BroadcastTx = {
  transactionType: string;
  contractAddress: string;
  arguments: string[];
};

const tokens: TokenEntry[] = JSON.parse(readFileSync(tokensPath, 'utf8'));
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

const deploys: BroadcastTx[] = artifact.transactions.filter(
  (tx: BroadcastTx) => tx.transactionType === 'CREATE',
);

let updated = 0;
for (const tx of deploys) {
  if (!tx.arguments || tx.arguments.length < 2) {
    console.warn('Skipping CREATE tx with unexpected arguments:', tx);
    continue;
  }
  // Constructor args order: name, symbol, decimals
  const deployedSymbol = tx.arguments[1];
  const token = tokens.find((t) => t.symbol === deployedSymbol);
  if (!token) continue;
  token.addr = tx.contractAddress;
  updated++;
  console.log(`${deployedSymbol} → ${tx.contractAddress}`);
}

writeFileSync(tokensPath, JSON.stringify(tokens, null, 2) + '\n');
console.log(`\nUpdated ${updated} token(s) in tokens.json`);
