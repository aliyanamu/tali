# Reminders & Notification Center

- **Logged:** 2026-05-26
- **Category:** next-month (post-2026-06-15, out of hackathon MVP scope)
- **Status:** idea — not scoped, not started

## One-liner

User-set reminders for recurring financial dates (credit card due, utilities, rent) **plus** a notification center where every action type is categorized and the user picks what to be notified about — split across **Personal** and **System** tabs.

## Why

Mufidah's money spans onchain + offchain. Bills and due dates (credit card, utilities, rent, subscriptions) live entirely off-chain and are easy to forget. Tali aims to be the tool she opens daily — reminders close the loop between *seeing* her money and *acting on time*. Without this, Tali shows state but doesn't help her avoid a missed payment.

## What it is

1. **Self-set reminders** — the user creates reminders for important dates: pay credit card, pay utilities, rent, subscription renewal, P2P settlement follow-up, etc. One-off or recurring (weekly/monthly). Each reminder is categorized.
2. **Notification preferences** — every Tali action/event type is categorized, and the user toggles which ones notify them and through which channel (Telegram message, reminder alarm, dashboard badge). Spectrum: bot/agent actions → reminder alarms → informational updates.
3. **Two-tab notification center:**
   - **Personal** — reminders the user set themselves + their own logged activity ("bill due tomorrow", reminder alarm, "you logged a P2P trade").
   - **System** — Tali/agent-generated: rule fired, forgotten-balance nudge, reconciliation suggestion, webhook-detected inflow, contract action.

## Naming options (decide later)

- **Reminders & Notification Center** (descriptive, current working name)
- **Nudges & Reminders** — reuses existing "nudge" language, but the product already uses *nudge* for the forgotten-balance card; may collide.
- **Signals** — calm, single word
- **Tali Reminders**

> Open naming question: unify "nudge" terminology with this feature, or keep reminder/nudge distinct?

## Fit with the existing product

- **Calm register:** notifications must never panic — design principle #2 ("no notifications that panic"). Reminders should be gentle, matching the forgotten-balance nudge tone.
- **System tab maps onto surfaces we're already building:** rule firings (`AutonomousRule.sol`), the forgotten-balance detector, reconciliation suggestions, Goldsky webhook inflows.
- **Personal tab is new:** user-authored reminders need a small store + a time-based scheduler.

## Rough shape (not scoped)

- A `reminders` table: recurrence rule, category, next-fire timestamp, channel prefs.
- A scheduler to fire reminders (cron / job runner). Note: onchain events are **push** via Goldsky Mirror; reminders are **time-based** — a different trigger mechanism than the rest of the system.
- A notification-preference model keyed by event category + channel.
- UI: notification center with Personal/System tabs (dashboard + Telegram); a reminder compose flow.
- Bilingual respect: all reminder + notification copy in the user's chosen language (design principle #3).

## Why next-month (out of hackathon scope)

- Beyond the locked MVP — `../../docs/objectives.md` weeks 1–3 do not include reminders or notification preferences. Strict rule #2: no features beyond MVP.
- Adds a scheduler + preference model — meaningful new surface area during the ship weeks.
- A lightweight slice (one hardcoded "pay credit card" reminder) was considered as a week-2 stretch, but parking the whole idea is cleaner. Revisit after 2026-06-15.

## Open questions

- Unify "nudge" terminology, or keep reminder/nudge distinct?
- Does the Personal/System split match how Mufidah actually thinks, or is one unified feed simpler? (dogfood question)
- Reminder scheduling: in-skill cron vs. external scheduler?

## Related

- `../../docs/architecture.md` — existing event surfaces the System tab would draw from
- `../../docs/objectives.md` — "Out of scope" section
- `../../design/README.md` — design principle #2 (calm notifications), #3 (bilingual)
