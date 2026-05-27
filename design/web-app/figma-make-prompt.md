# Figma Make prompt — Tali (v2, art-directed)

Direction: **Monai-warm + trust layer.** Warm and approachable for an overwhelmed crypto beginner, with a calm trust spine that gives wallet tiers and agent actions gravitas.

## How to use this (important)
Don't paste all four screens at once — that's what made v1 generic (the tool averages a long spec toward safe defaults). Paste in this order:
1. The **ART DIRECTION** + **TRUST SPINE** + **SCREEN 1** blocks. Get the look right.
2. Then add one screen at a time, reusing the same design system.
3. Screenshot each result back to Claude for a critique + refinement prompt.

---

```
ART DIRECTION — read this first, apply it to everything below.
Build a responsive web + mobile prototype for "Tali", a calm personal-money app. The user is an Indonesian crypto holder who is OVERWHELMED, not ignorant — she already holds crypto across several wallets but can't see it all in one calm place. The feeling we want: "finally, my money makes sense, and I trust what this app is doing."

Aesthetic: warm, friendly, and premium — like Monai or Revolut, NOT like a crypto/trading dashboard. Approachable for a beginner, but trustworthy enough that she's comfortable letting an agent move real money.

- Background: warm paper, not cold white — #FAF8F3. Cards/surfaces: soft white #FFFFFF that gently lifts off the paper with diffuse, low shadows. NO hard 1px borders, NO flat gray-on-gray.
- Generous whitespace and FEW elements per screen. "No bloat." Let things breathe. One clear hero per screen.
- Corners soft and rounded (16–20px). Friendly, rounded line icons — never default/stock glyphs.
- Typography: use Plus Jakarta Sans for all UI text AND money numbers (warm, humanist, Indonesian-designed — fits the audience). Numbers are friendly semibold sans with tabular figures, NOT monospace — money should feel human, not technical. Reserve a monospace font (Geist Mono / JetBrains Mono), small and muted, ONLY for 0x addresses and transaction hashes — this makes the "technical truth" visually distinct from friendly money.
- Language is plain, warm, second-person: "Your money, all in one place", "You approve each move", "Your agent saved 50 USDT for you". Use Indonesian number shorthand for secondary figures (jt = juta, M = miliar); full "Rp 1.284.730.000" only for the hero net-worth number.
- Motion is slow and gentle. Calm over flashy: no panic-red, no confetti, no bouncing.
- Two themes with a toggle. Dark theme: warm charcoal #1A1714 background, soft cream text — keep the same warmth, never cold black.
- Hierarchy by weight, not just size: one elevated hero element, lighter supporting rows, quiet tertiary detail. Do NOT make every card the same flat rectangle of equal weight (this is the #1 thing to avoid).

THE TRUST SPINE — the most important system; it appears on EVERY screen.
Tali's core honesty is "what can the app see vs sign vs auto-act on." Make this a consistent visual badge system — same color + icon + plain label everywhere a wallet or action appears:
- 🔒 Watched · read-only — calm slate-blue (#7C8AA6). Onchain wallets/exchanges Tali can see but not touch. "Tali can see this, can't touch it."
- ✎ Logged · manual — warm neutral gray (#9B9389, NOT an accent). Offchain accounts you log yourself (bank, e-wallet, cash) — no automatic feed. Use for ALL offchain accounts. Never give offchain entries a "verify on Mantle" link (they're not on-chain).
- ✓ You sign — leaf green (#2E9E6B). "You approve each move."
- 🤖 Agent · auto — soft violet (#8B7DE8). "Your agent acts on your rule."
Use honey amber (#E0A33E) ONLY for gentle attention (forgotten-balance nudges, reconcile prompts) — never red, never alarming.
These (slate, green, violet, honey) are the ENTIRE accent palette; Logged-gray is a neutral. Everything else is warm neutrals. Use color with discipline — a badge dot, a thin left-edge on a card, a small icon. Never flood a card with color.

RESPONSIVE
Desktop: a slim warm sidebar (Overview, Activity, Rules, Agent) + theme toggle at the bottom. Mobile: the same four as a bottom tab bar. Show desktop and mobile frames for each screen.

SAMPLE DATA (use exactly — the rows MUST sum to the subtotals, and onchain+offchain MUST equal the hero total; the headline number has to reconcile with the holdings)
Total net worth Rp 183.072.000, up Rp 5,85jt (+3,3%) this month. Onchain Rp 146,9jt, Offchain Rp 36,2jt.
Onchain wallets: MetaMask 0xABC…9F2 — 3.500 USDT + 0,8 mETH = Rp 94.400.000 (Watched); Indodax read-only API — 847 USDT = Rp 13.552.000 (Watched); Phantom — 0,42 SOL = Rp 1.008.000 (Watched); Tali Wallet 0xDEF…71C — 1.240 USDT + 450 USDY = Rp 27.040.000 (You sign); AutonomousRule.sol 0xGHI…04A — 680 USDY = Rp 10.880.000 (Agent).
Offchain (all "Logged · manual"): BCA Rp 35.380.000; GoPay Rp 312.000; Cash Rp 500.000.
Rates used: $1 = Rp 16.000, mETH = $3.000, SOL = $150. To show a bigger hero number, multiply EVERY holding by the same factor so the totals still reconcile.
```

```
SCREEN 1 — OVERVIEW (the hero screen). Apply the ART DIRECTION + TRUST SPINE above.
Top: a small warm label "Your money, all in one place", then the net worth as the single biggest thing on screen — Rp 1.284.730.000 in friendly semibold sans. Below it, in leaf green: "↑ up Rp 41,2jt this month". 
Below that, a LIVING 30-day chart: a gentle rounded area chart with a soft leaf-green gradient fill fading to transparent, a small dot marking today. Quiet text tabs for 1M / 3M / 1Y. (Do not make it a flat pale line.)
Then ONE soft container titled "Where it lives", with two labeled groups inside it — "Onchain" (subtotal Rp 1,21 M, right-aligned) and "Offchain" (Rp 79,7jt). Each wallet is a LIGHT row separated by hairline dividers inside the container — NOT its own floating card. Each row: rounded icon, wallet name, a muted sublabel (0x address in small mono, or "read-only API"), and its trust badge from the spine; on the right, the IDR value in semibold with the token amount muted beneath it.
At the bottom, one honey-amber-tinted nudge card, warm and gentle: "A couple of balances have been sitting still" → "847 USDT on Indodax · 67 days" and "Rp 312.000 in GoPay · 21 days", each with quiet "Bring forward" / "Ignore" text actions.
```

```
SCREEN 2 — ACTIVITY. Reuse the design system. A warm intro "Everything that moved, threaded together." A feed grouped by day inside soft containers.
HERO ITEM — the P2P trade as ONE event, plainly titled "You sold USDT for rupiah · today" with a small "linked" pill. Two sides connected by a clear vertical thread/bracket so they read as a single unit (shade the area behind both sides subtly):
  ↗ −2.000 USDT — MetaMask · auto-detected · 🔒 Watched · tiny mono "verify on Mantle" link
  ↘ +Rp 35.380.000 — BCA · you logged · offchain
AGENT ITEM — "Your agent saved 50 USDT for you · 2 min ago", soft violet left-edge + 🤖 Agent badge, plain reasoning line "Your rule matched: 500 USDT arrived, saved 10%", small "verify on Mantle" link.
Plus: a "Client payment +500 USDT" item tagged "client payment", and a "GoPay top-up −Rp 200.000". 
At the bottom, a honey-amber reconcile card, conversational: "These two might be the same trade — link them?" with "Yes, link them" / "Not the same".
```

```
SCREEN 3 — RULES. Reuse the design system. Make it feel like a conversation, not a settings form.
Warm heading "Set a rule. Your agent handles the rest." A friendly compose box (like a chat input, not a sterile textarea) pre-filled: "Whenever USDT comes into my wallet, save 10% as USDY." 
Below it, show how Tali understood it as a warm human sentence with the key parts as soft highlighted chips: "When USDT arrives → save 10% as USDY → on Mantle → from your Tali Wallet", with the 🤖 Agent badge. A leaf-green "Activate rule" button, confident but not oversized.
Below, an ACTIVE rule that feels alive: "Idle USDT → USDY savings", green "Active" dot, "last acted today", and the most recent action inline with the 🤖 Agent badge and plain reasoning "Saved 50 USDT for you — 500 USDT arrived, kept 10% aside · attested on-chain".
```

```
SCREEN 4 — AGENT. Reuse the design system. This is a trustworthy track-record page, warm not cold.
Header: a friendly custom avatar (a warm rounded character, NOT a default robot icon), the name "Mufidah's Tali", a leaf-green "Verified on Mantle" badge, and below in small muted mono: ERC-8004 Identity NFT #8.472 · Controller 0xDEF…71C · Created March 2026.
Instead of four cold equal stat boxes, lead with ONE warm plain-language summary: "Your agent has acted 11 times and saved 1.150 USDT for you — getting it right 92% of the time." Supporting figures smaller beneath.
Then "Activity log" — a grouped list, each entry plain-language with a green confirmed check, relative time, and a small mono tx-hash link: "Saved 50 USDT as USDY · 2 min ago · 0xdef…", "Linked a P2P trade · 1 hour ago · 0xabc…", "Flagged a forgotten balance · 2 hours ago · 0x123…". A quiet footer line: "Every action is signed on-chain — tap any to verify."
```
