# Idea Bank

Future implementation ideas surfaced during the build but **not** in the locked MVP scope. This is where ideas wait so they don't get lost and don't trigger scope creep mid-hackathon.

Read order for scope decisions stays: `../docs/objectives.md` (what ships) is the source of truth for the hackathon. Nothing here is committed scope until it's moved into `objectives.md`.

## How it works

- **One idea = one markdown file**, named in kebab-case.
- Files live in a category folder by **when** they could realistically be built.
- When a timeline shifts (an idea gets closer or further away), **move the file** to the matching folder and update the index below.

## Categories

| Folder | Meaning | In hackathon scope? |
|---|---|---|
| `next-week/` | Could be implemented within the next week — still inside the build window if before 2026-06-15. | Possibly (stretch) — promote into `objectives.md` if pulled in. |
| `next-month/` | Larger features for ~post-deadline. Beyond MVP. | No |
| `later/` | Long-arc / project-level pivots and reframes, reviewed well after the hackathon. | No |

Anything in `next-month/` or `later/` is **out of hackathon scope** by definition (strict rule #2: no features beyond MVP).

## Index

### next-week
_(empty)_

### next-month
- [Reminders & Notification Center](next-month/reminders-and-notification-center.md) — user-set bill/date reminders + a categorized notification center with Personal / System tabs.

### later
- [Cheap, AI-aware Mantle data infrastructure](later/mantle-ai-data-infra.md) — affordable open-source indexing + monitoring layer for Mantle with an AI query/anomaly surface. _(Project-level pivot.)_

## Pivot ideas (strict rule #1)

Project-level pivots and major reframes land in `later/`, not in active scope — no re-lock discussions until after 2026-06-15. Feature ideas go in `next-week/` or `next-month/`.
