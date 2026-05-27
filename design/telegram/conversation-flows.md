# Telegram conversation flows

What Tali looks like as actual chat on Telegram (RealClaw's surface, or the grammY
fallback bot). These are the target interactions for the conversational surface —
plain chat bubbles, sometimes with inline buttons. The web-app counterpart lives
in `../web-app/`.

Design register: **clarity, calm, control.** Plain sentences work; commands are
optional shortcuts. Tali asks before money moves (except inside a pre-authorized
rule). Every on-chain action links to Mantle Explorer.

Each flow maps to a locked must-have in `../../../context/13_project_locked.md`.

---

## 1. Net-worth check — must-have #1 ("one screen, all money")

```
You ▸  /networth

Tali ▸  💰 Total: Rp 184,200,000

       ⛓️  On-chain          Rp 121,400,000
         • Tali wallet        2,140 USDT
         • MetaMask (watched) 0.8 ETH + 410 USDT
         • Indodax            1,200 USDT

       🏦  Off-chain          Rp 62,800,000
         • BCA                Rp 48,000,000
         • GoPay              Rp 2,800,000
         • Cash               Rp 12,000,000

       Updated just now · [📊 Open dashboard]
```

The dashboard button deep-links to the web app — how the two surfaces connect.

---

## 2. Log a P2P trade by just typing it — must-have #2 (the core magic)

```
You ▸  sold 2000 USDT, got 35,380,000 IDR in BCA

Tali ▸  Got it. Logged as one event:
        ➖ 2,000 USDT out
        ➕ Rp 35,380,000 → BCA
        Rate: Rp 17,690 / USDT

        I saw 2,000 USDT leave your MetaMask
        3 min ago — same trade?
        [✅ Yes, link it]   [No, separate]
```

The whole pitch in one exchange: one sentence → **one event with two sides**, with
the on-chain leg auto-detected. No forms.

---

## 3. Forgotten-balance nudge — must-have #3 (agent-initiated)

```
Tali ▸  👋 Weekly check-in:

        • 847 USDT on Indodax — untouched 67 days
        • Rp 312,000 in GoPay — untouched 21 days

        Want me to bring these forward in your
        net-worth view, or leave them?
        [Surface them]   [Ignore for now]
```

Tali messages first, unprompted — the "agent autonomy" judges score.

---

## 4. Set an autonomous rule — the agentic core

```
You ▸  every time USDT comes in, save 10% as USDY

Tali ▸  New rule:
        When USDT arrives in your Tali wallet →
        swap 10% to USDY (savings) on Mantle.

        One-time setup signature needed (this
        pre-authorizes me to act within this rule
        only — you can revoke anytime).
        [🔐 Sign & activate]
```

The one-time signature is Option B (pre-authorized rule contract) from the locked spec.

---

## 5. The rule fires on its own — the 30-second live-stream moment

```
        ⚡ (later — client pays you 500 USDT)

Tali ▸  Client payment detected: +500 USDT 💵

Tali ▸  ✅ By your rule, 50 USDT auto-saved as USDY.
        Tx: 0xab12…9f  ·  gas Rp 320
        Attested under your agent NFT #1.
        [View on Mantle Explorer]
```

No tap. The agent watched (Goldsky webhook), decided, signed (Privy), executed
(AutonomousRule.sol → Agni), attested (ERC-8004), and reported back.

---

## 6. Monthly statement import — polish #7 (reduces logging fatigue)

```
You ▸  [uploads BCA-statement-may.pdf 📎]

Tali ▸  Parsed 23 entries from your BCA statement.
        • 19 matched existing events ✅
        • 3 auto-linked to P2P sales 🔗
        • 1 orphan — Rp 5,000,000 deposit May 12,
          no matching event. What was this?
        [Salary]  [P2P sale]  [Other…]
```

---

## What "good" looks like (the bar to strive for)

The bar isn't "a fancy bot." It's: **every interaction feels like texting a
competent assistant who already knows your money.**

- **No commands required for the core flow.** Plain sentences ("sold 2000 USDT…")
  do the right thing; `/networth` is just a shortcut.
- **Two-sided events, not two log entries.** The reconciliation linking (flows 2 & 6)
  is the thing nobody else does — lean into it.
- **Tali speaks first sometimes.** Nudges and rule-fire notifications (flows 3 & 5)
  make it an *agent*, not a *form*.
- **Inline buttons for confirmations, free text for everything else.** The user is
  always asked before money moves, except inside a pre-authorized rule.

See `../../docs/intents.md` for the natural-language intents TaliSkill must parse.
