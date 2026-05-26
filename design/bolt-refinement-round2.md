# Bolt refinement — Round 2 (Profile, Add/Import, nudge clarity)

Context: Round 1 fixed correctness (reconciling numbers + Logged vs Watched badges). This round adds the **missing surfaces**: a Profile page (so the app isn't just 4 read-only screens), a clear **Add / Import** action (the "log onto Activity" path that currently has no entry point), and clearer copy on the forgotten-balance nudge.

Keep the current Monai-warm look + trust spine. These edit in place. Paste one block at a time and screenshot back for critique.

---

## 1) PROFILE PAGE — replaces the standalone "theme/dark mode" tab

**Why:** A theme toggle doesn't deserve its own navigation slot, and the app currently has nowhere to *manage* the accounts it shows — you can see balances on Overview but you can't add/remove a watched wallet or a logged account. Profile becomes the "manage the containers" home. Theme lives inside it.

**Placement:**
- **Desktop:** bottom of the left sidebar — a small avatar + name row that opens Profile. The four nav items (Overview, Activity, Rules, Agent) stay; theme toggle moves *off* the sidebar and *into* Profile.
- **Mobile:** Profile replaces the dark-mode tab in the bottom bar → tabs become **Overview · Activity · Rules · Agent · Profile** (Profile as a small avatar, rightmost).

**What Profile must contain (MVP — keep it calm, grouped, few elements):**

1. **You** — Privy identity. Avatar, name ("Mufidah"), the login method in small muted text ("Signed in with email · mufidah@…" or wallet), and a quiet "Sign out". This is the "basic auth" surface.
2. **Accounts** — the heart of this page. Two grouped lists reusing the trust spine:
   - **Watched (onchain, read-only)** — MetaMask, Indodax, Phantom. Each row: icon, name, badge `🔒 Watched`, and a quiet remove. A `+ Watch a wallet` action that takes a pasted address (read-only — never a signing path).
   - **Logged (offchain, manual)** — BCA, GoPay, Cash. Each row: icon, name, badge `✎ Logged`, current balance, edit/remove. A `+ Add account` action and an `Import statement` action (see §2).
   - **Your Tali wallet + Agent** shown read-only for transparency: Tali Wallet `0xDEF…71C` (`✓ You sign`) and AutonomousRule.sol `0xGHI…04A` (`🤖 Agent`), with the ERC-8004 identity number. These aren't editable — they're the trust disclosure.
3. **Preferences** — grouped, low-key:
   - **Theme**: Light / Dark toggle (moved here).
   - **Language**: English / Bahasa Indonesia (the bilingual copy variant lives here).
   - **Base currency**: IDR (display only for MVP).
4. **Nudges** (optional, can stub): "Tell me when a balance sits still for [60] days" — the threshold behind the forgotten-balance card in §3.

> Out of MVP, note only: notification channels, FX-rate source, multi-user. Don't build now.

### Bolt paste block — Profile
```
Add a new PROFILE screen and make it reachable:
- Desktop: at the BOTTOM of the left sidebar, add a small avatar + "Mufidah" row that opens Profile. REMOVE the theme toggle from the sidebar — it moves into Profile.
- Mobile: REPLACE the dark-mode tab in the bottom bar with a Profile tab (small avatar, rightmost). Tabs are now Overview, Activity, Rules, Agent, Profile.

PROFILE screen, reuse the warm look + trust spine, grouped into soft containers with generous whitespace:
1) "You": avatar, name "Mufidah", muted line "Signed in with email · mufidah@…", a quiet "Sign out".
2) "Accounts":
   - "Watched · read-only" group: MetaMask 0xABC…9F2, Indodax (read-only API), Phantom — each with its icon, the slate-blue 🔒 Watched badge, and a quiet remove. Plus a "+ Watch a wallet" action (pastes a read-only address — NO signing).
   - "Logged · manual" group: BCA, GoPay, Cash — each with icon, warm-gray ✎ Logged badge, its balance, edit/remove. Plus "+ Add account" and "Import statement" actions.
   - "Your wallets" (read-only disclosure, not editable): Tali Wallet 0xDEF…71C with green ✓ You sign, and AutonomousRule.sol 0xGHI…04A with violet 🤖 Agent, plus small mono "ERC-8004 Identity #8.472".
3) "Preferences": a Theme toggle (Light/Dark), a Language toggle (English / Bahasa Indonesia), and Base currency = IDR.
4) "Nudges": one line "Tell me when a balance sits still for 60 days" with an editable number.
Keep it calm — quiet rows, hairline dividers, no loud buttons.
```

---

## 2) ADD / IMPORT — yes, it's necessary, and here's where it goes

**Your question:** is an action button on Activity necessary, and where is the "import data to log onto Activity"?

**Answer: it's necessary — and right now it's missing entirely.** There is no affordance anywhere to add a transaction or import a statement, so the "Logged" data has no way in. That's the gap.

**Clean mental model (so it doesn't get confusing):**
- **Profile = manage *accounts*** (the containers: which wallets you watch, which offchain accounts exist).
- **Activity = log/import *transactions*** (the movements). Activity is the ledger of things that moved, so a manual entry or an imported statement *produces Activity rows*. That's its natural home.

So: **put a single "+" / "Add or import" action on the Activity screen** (top-right, quiet — not a loud FAB). It opens a small sheet with two paths:
1. **Log a transaction** — quick manual entry (amount, account, in/out, note). Produces one Activity row tagged `✎ Logged`.
2. **Import a statement** — upload/paste a bank or e-wallet statement (the README's "ingests bank statements"). Produces multiple Logged rows, shown as a reviewable batch before they're committed.

Keep the same `Import statement` entry inside Profile → Accounts → Logged, so it's reachable both in-context (Activity) and from account management (Profile). One action, two doors.

### Bolt paste block — Add/Import
```
On the ACTIVITY screen, add a quiet "+ Add or import" action in the top-right (calm text/icon button, not a big floating button). It opens a small bottom sheet with two options:
1) "Log a transaction" — a simple form: amount, account (pick from Logged accounts), direction (in/out), optional note. On save it appears in the feed as a normal row with the warm-gray ✎ Logged badge.
2) "Import a statement" — an upload/paste area for a bank or e-wallet statement. After import, show the detected transactions as a reviewable list with a "Looks right — add these" confirm before they enter the feed.
Reuse this same "Import a statement" flow from the Profile → Accounts → Logged section.
```

---

## 3) The "balances sitting still" card — what it means + clearer copy

**What it is:** the *forgotten-balance nudge* (the one honey-amber card from the spec — gentle attention, never alarming). It surfaces money that **hasn't moved in a while**, so idle funds don't get forgotten.

**Reading the card:**
- `847 USDT on Indodax · 67 days` = that balance hasn't been touched in 67 days.
- `Rp 312.000 in GoPay · 21 days` = same, 21 days idle.
- `Bring forward` / `Ignore` = the two actions per balance.

**Why it's confusing:** "Bring forward" is accounting jargon (a *balance brought forward*) and doesn't tell a beginner what tapping it actually does. For a calm beginner app it should say what happens.

**The action's real intent:** "this money is sitting idle — do something with it" (e.g., move it to USDY savings, or just acknowledge it). "Ignore" = dismiss the nudge.

**Copy fix — pick one (recommend A):**
- **A.** `Do something` / `Dismiss`  ← plainest, warmest
- **B.** `Put it to work` / `Dismiss`  ← nudges toward the savings rule
- **C.** `Review` / `Dismiss`

Also add a one-line subtitle under the card title so the "67 days" reads clearly, and make the idle time the label, not a bare number:

### Bolt paste block — nudge clarity
```
On the OVERVIEW forgotten-balance card (honey-amber): keep it gentle. Under the title "A couple of balances have been sitting still", add a quiet one-line subtitle: "These haven't moved in a while — want to do something with them?". Change the metric label from "67 days" to "Untouched for 67 days" / "Untouched for 21 days". Replace the "Bring forward" action with "Do something" and replace "Ignore" with "Dismiss". Keep both as quiet text actions, honey-amber for the primary one.
```

---

## Later — for ProtoPie (future self)

**When all four+1 screens are finalized in Bolt/Figma:** export each screen as separate **slices / scenes** (one per state, not one flat board) so the ProtoPie interactive prototype is easier to wire. Specifically cut scenes for:
- Overview (default) · Overview (nudge dismissed)
- Activity (feed) · Add/import sheet · Statement-import review state
- Rules (compose) · Rules (active rule fired)
- Agent (track record)
- Profile (default) · Theme = dark · Add-account / Watch-wallet sheets
- Light + dark variant of each hero screen

Naming convention for scenes: `screen.state` (e.g. `overview.nudge-dismissed`, `activity.import-review`) so triggers/transitions map cleanly in ProtoPie.
