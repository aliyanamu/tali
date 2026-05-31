---
status: pending
priority: p1
issue_id: "006"
tags: [code-review, cli, error-handling]
---

# No try/catch in networth CLI action — unhandled rejections give zero user feedback

## Problem Statement

The entire `networth` CLI action is an async callback with no top-level error handling. If the RPC call, CoinGecko request, or DB queries fail, Commander may swallow the rejection with exit code 0, giving the user no error message.

## Findings

File: `backend/src/cli/commands/networth.ts:9`

```ts
.action(async (opts) => {
  // ... ~50 lines of async code with no try/catch
});
```

Compare with `wallet.ts` which wraps all DB and integration calls in try/catch blocks.

## Fix

Wrap the entire action body:

```ts
.action(async (opts) => {
  try {
    // ... existing logic ...
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
});
```

## Acceptance Criteria

- [ ] When RPC is unreachable, `tali-cli networth` prints a clear error message and exits with code 1
- [ ] When DB is unavailable, same behaviour

## Work Log

- 2026-05-31: Identified by TypeScript review agent
