# Design

Visual mockups, UI explorations, and design references for Tali.

## How we work on visual design

For **rough wireframes and flow diagrams in markdown**: handled here in this repo via Mermaid + ASCII (see `../workflow.md` and `../architecture.md` for examples).

For **polished UI mockups**: use **Claude Design** (Anthropic's design tool, research preview). Generate mockups there, export the artifacts (PNG / SVG / Figma link), and drop them in this folder with a short markdown note explaining what each shows.

Suggested folder organization once mockups exist:
- `01-onboarding-screens.md` (or `.png`)
- `02-net-worth-dashboard.md`
- `03-rule-setup-flow.md`
- `04-activity-feed.md`
- `05-bank-import-flow.md`

## Design references (north stars)

- **[Kubera Wealth Tracker](https://www.kubera.com/wealth-tracker)** — emotional register: "clarity, calm, control." Source of much of Tali's visual language tone.
- **[Monai](https://get-monai.app/)** — clean expense tracker UX, two-mode logging pattern that inspired Tali's onchain + offchain split.
- **[Privy](https://privy.io)** — for non-custodial onboarding UX (passkey / OAuth / email magic link).
- **MetaMask Portfolio** — for multi-wallet visibility patterns (what to keep, what to discard).

## Design principles for Tali

1. **One screen, one number.** Net worth lands above the fold. Don't bury it in tabs.
2. **Calm > flashy.** No animations that distract; no notifications that panic.
3. **Bilingual respect.** If a user opts into Bahasa, the entire UI surface is Bahasa — no English fallback text.
4. **Show the agent's reasoning.** Every autonomous action is explained in plain language, in-context, with the rule it matched.
5. **Trust through transparency.** Every onchain action links to Mantle Explorer. Every offchain entry shows source + timestamp.
6. **Wallet tiers visible.** Users always know which wallet they're looking at and what authority Tali has over it.

## Color + typography (placeholder until Claude Design output)

- Primary text: high-contrast neutral (off-black on near-white in light mode)
- Accent: a single muted color, used sparingly (think Kubera's restraint, not crypto-launchpad neon)
- Numbers: tabular figures, monospaced
- Font candidates: Inter (UI), JetBrains Mono (numbers + addresses)

To be replaced once design exploration begins.
