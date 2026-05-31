---
status: pending
priority: p1
issue_id: "005"
tags: [code-review, webhook, error-handling]
---

# BigInt() throws on invalid amount strings — webhook crash with no structured error

## Problem Statement

`rawToDecimalString()` calls `BigInt(rawValue)` with no validation. If Goldsky sends a hex string, scientific notation, empty string, or negative value for `amount`, this throws a `SyntaxError` that propagates out of the webhook handler, returning an unstructured 500 and causing Goldsky to retry indefinitely.

## Findings

File: `backend/src/server/routes/webhooks/goldsky.ts:23`

```ts
function rawToDecimalString(rawValue: string, decimals: number): string {
  const raw = BigInt(rawValue); // ❌ throws SyntaxError on "0x123", "-1", "1e18", ""
```

File: `backend/src/server/routes/webhooks/goldsky.ts:36`

```ts
amount: z.string(), // ❌ no format constraint
```

## Fix

**Step 1** — Add Zod validation to constrain `amount` to decimal-only uint256:

```ts
amount: z.string().regex(/^\d{1,78}$/, 'must be a non-negative uint256 decimal string'),
```

**Step 2** — Add a guard in `rawToDecimalString` as defence-in-depth:

```ts
function rawToDecimalString(rawValue: string, decimals: number): string {
  if (!/^\d+$/.test(rawValue)) throw new Error(`Invalid amount: ${rawValue}`);
  const raw = BigInt(rawValue);
  // ...
}
```

## Acceptance Criteria

- [ ] Zod rejects non-decimal `amount` strings with a 400 (not a 500)
- [ ] `rawToDecimalString('0x1234', 18)` returns a 400, not a crash

## Work Log

- 2026-05-31: Identified by architecture + security review agents
