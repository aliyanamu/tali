---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, database, safety]
---

# reset.ts uses DROP SCHEMA CASCADE with no production guard

## Problem Statement

`reset.ts` drops the entire `public` schema with `CASCADE`. On managed Postgres (Supabase, Neon, Railway), this destroys provider-installed extensions and platform functions that are not recreated by `CREATE SCHEMA public`. There is also no guard preventing accidental execution in production.

## Findings

File: `backend/src/db/reset.ts:8-11`

```ts
await client`DROP SCHEMA IF EXISTS public CASCADE`;
await client`CREATE SCHEMA public`;
await client`GRANT ALL ON SCHEMA public TO PUBLIC`;
```

No `NODE_ENV` guard.

## Fix

Add a production guard at the top of `main()`:

```ts
if (env.NODE_ENV === 'production') {
  logger.error('reset.ts must not run in production');
  process.exit(1);
}
```

## Acceptance Criteria

- [ ] `NODE_ENV=production pnpm db:reset` exits with code 1 and a clear error message
- [ ] Local dev reset continues to work as before

## Work Log

- 2026-05-31: Identified by data-integrity review agent
