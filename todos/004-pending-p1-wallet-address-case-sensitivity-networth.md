---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, cli, correctness]
---

# walletNormalized computed but unused in networth CLI — case-sensitivity bug

## Problem Statement

`networth.ts` computes `walletNormalized = opts.wallet.toLowerCase()` but then queries the DB with `opts.wallet` (original case). The seed stores the wallet as mixed-case (`0x8a5B7b...`). MetaMask and most wallets return checksummed (mixed-case) addresses, so this happens to work. But any caller passing the address in lowercase (which is the EVM standard) will get `user = undefined`, fall back to `currencyCode = 'IDR'`, and the `void walletNormalized` suppression makes the bug invisible.

## Findings

File: `backend/src/cli/commands/networth.ts:26-27`

```ts
const walletNormalized = opts.wallet.toLowerCase();  // computed...
const user = await db.query.users.findFirst({
  where: eq(schema.users.walletAddress, opts.wallet), // ...but opts.wallet used here ❌
});
```

Line 63: `void walletNormalized;` — suppresses unused-variable warning, hiding the bug.

Also: `fetchNetworth` is called with `opts.wallet as Address` — same case inconsistency.

## Fix

```ts
const walletNormalized = opts.wallet.toLowerCase();
const user = await db.query.users.findFirst({
  where: eq(schema.users.walletAddress, walletNormalized), // ✓
});
// ...
const result = await fetchNetworth(walletNormalized as Address, rpcUrl, vsCurrency, coingeckoKey, chainId);
// Remove line 63 (void walletNormalized)
```

Also update seed.ts to store the address in lowercase so it matches consistently.

## Acceptance Criteria

- [ ] `tali-cli networth --wallet 0x8a5b7bbaba...` (lowercase) returns same result as mixed-case
- [ ] `void walletNormalized` suppression line removed

## Work Log

- 2026-05-31: Identified by TypeScript + architecture review agents
