---
status: pending
priority: p3
issue_id: "013"
tags: [code-review, quality, cleanup]
---

# Minor hardening and cleanup items (batch)

## Problem Statement

Several small improvements identified across the review. Grouped here to avoid review noise.

## Findings

### 1. `timingSafeEqual` length-branch timing leak — `goldsky.ts:13`
Early `return false` on length mismatch is slightly faster than the constant-time path. Fix: pad both buffers to fixed 64 bytes before comparing.

### 2. Zod schema missing `.strict()` on `GoldskyTransferSchema` — `goldsky.ts:32`
Extra unknown fields pass silently. Adding `.strict()` makes the schema a precise contract and surfaces Goldsky API changes early.

### 3. `block_number: z.number()` should add `.int()` — `goldsky.ts:39`
Guards against Goldsky sending a float for block number.

### 4. Dead variable `void walletNormalized` — `networth.ts:63`
Remove after fixing todo 004 (use `walletNormalized` in the query).

### 5. Remove unreachable catch in `verifyGoldskySecret` — `goldsky.ts:15-17`
The `try/catch` wrapping `timingSafeEqual` is unreachable: the length guard already prevents the only condition that would throw. Remove the try/catch.

### 6. Prune unused type exports from `schema.ts:190-203`
All 12 `New*` insert types are exported but imported nowhere. Delete or keep only the ones needed within the week.

### 7. `Number(env.MANTLE_CHAIN_ID)` on every request — `goldsky.ts:68`
Move to module-level constant or ensure `env.ts` uses `z.coerce.number()`.

### 8. Import ordering in `networth.ts:1-5`
`type { Address }` from viem should be with external imports at the top.

### 9. Helius RPC example has `?api-key=` with no placeholder — `.env.example:9`
Change to `?api-key=YOUR_HELIUS_API_KEY_HERE` to prevent silent anonymous requests.

### 10. `pipeline.yaml` `secret_name` vs `GOLDSKY_WEBHOOK_SECRET` — add clarifying comment
Explain that `secret_name` is the Goldsky CLI key name, not the env var name.

### 11. `start_at: latest` in `pipeline.yaml` — add comment
Note that pre-deployment transfer history is not ingested; networth CLI covers historical balances via RPC.

## Acceptance Criteria

- [ ] Items 4-8 cleaned up before final PR
- [ ] Items 1-3, 9-11 addressed where practical given hackathon timeline

## Work Log

- 2026-05-31: Identified across security, TypeScript, simplicity, architecture review agents
