---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, deployment, goldsky]
---

# pipeline.yaml webhook URL is a placeholder — pipeline not deployable

## Problem Statement

`backend/goldsky/pipeline.yaml` line 31 contains `https://<YOUR_TUNNEL_URL>/webhooks/goldsky`. The pipeline cannot be deployed to Goldsky as committed. This is a demo blocker.

## Findings

File: `backend/goldsky/pipeline.yaml:31`

```yaml
url: https://<YOUR_TUNNEL_URL>/webhooks/goldsky
```

Goldsky `pipeline apply` will fail or point at a non-existent server.

## Proposed Solutions

**Option A (recommended):** Replace with the actual deployed URL (Railway/Fly/Render) or document the substitution clearly with a `# replace with: ...` comment and a local dev instruction using ngrok.

**Option B:** Parameterise via a `.env`-style substitution if Goldsky CLI supports it.

## Acceptance Criteria

- [ ] `goldsky pipeline apply --path backend/goldsky/pipeline.yaml` succeeds without manual editing
- [ ] README or pipeline.yaml has clear instructions for local dev (ngrok URL) vs production URL

## Work Log

- 2026-05-31: Identified by architecture review agent
