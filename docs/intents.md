# TaliSkill intents — week 1

The set of natural-language intents TaliSkill must recognize and act on. This is the
contract between the NL parser (LLM intent classification + slot extraction) and the
handler layer. Chat flows that use these intents: `../design/telegram/conversation-flows.md`.

## Scope

**Week 1 = the three daily-use must-haves** (`../../context/13_project_locked.md`):
net-worth visibility, two-sided P2P logging, forgotten-balance detection. Rule-setting
intents are week 3 (the agentic core) but the parser should *recognize* them early and
reply "coming soon" rather than misclassify — stubs are marked 🔜.

## Conventions

- **Slots** are the structured fields the parser extracts. `?` = optional.
- **Confirm?** = does Tali show a confirmation (inline buttons) before committing?
  Money-moving and ambiguous-link actions always confirm; pure logging confirms softly
  (shows the parsed result, easy to undo).
- **Bilingual:** every intent must trigger in English *and* Bahasa Indonesia. Example
  triggers below show both. If the user opts into Bahasa, replies are fully Bahasa.
- Amounts may be written `2000`, `2,000`, `2k`, `35.38M`, `35,380,000` — normalize all.
- Slash commands (`/networth`, `/start`) are shortcuts that map to the same handlers;
  they already exist in `skill/src/bot/commands/`.

---

## Tier 1 — Core week-1 intents (must ship)

### `query_net_worth`
Show total net worth across all wallets + offchain accounts, in IDR.
- **Triggers:** "what's my net worth", "how much do I have", "/networth", "berapa total uangku", "cek saldo total"
- **Slots:** `breakdown?` (full | onchain | offchain), `currency?` (default IDR)
- **Action:** aggregate Tier-1 watched balances + Tier-2 Tali wallet + offchain ledger → IDR via price layer. Render table.
- **Confirm?** No (read-only).

### `query_balance`
Show one account/wallet/asset instead of the full total.
- **Triggers:** "how much USDT do I have", "what's in my BCA", "saldo gopay berapa", "balance on Indodax"
- **Slots:** `account?` (BCA | GoPay | Indodax | MetaMask | Tali wallet | cash), `asset?` (USDT | ETH | …)
- **Action:** filtered read of the same data layer.
- **Confirm?** No.

### `log_p2p_trade` ⭐ (the core differentiator)
Log a crypto↔IDR trade as **one event with two sides**, then try to auto-link the
on-chain leg from a watched wallet.
- **Triggers:** "sold 2000 USDT, got 35,380,000 IDR in BCA", "transferred 2000 USDT to p2p, got 35.38M", "jual 2000 USDT dapat 35 juta masuk BCA", "beli 500 USDT pakai 8 juta dari BCA"
- **Slots:** `direction` (sell_crypto | buy_crypto), `crypto_asset`, `crypto_amount`, `fiat_amount`, `fiat_account` (BCA | GoPay | cash | …), `rate?` (derive if absent), `counterparty?`
- **Action:** create one ledger event with two legs (crypto out/in + fiat in/out). Search watched-wallet transfers within a time window for a matching crypto leg → if found, offer to link.
- **Confirm?** Soft (shows parsed two-sided event) **+** explicit link confirmation if a candidate match is found (→ `confirm_reconciliation`).

### `log_offchain_event`
Log a one-sided offchain transaction (income, expense, transfer) that has no crypto leg.
- **Triggers:** "spent 250k on groceries", "got paid 5 million salary to BCA", "bayar listrik 400rb", "terima gaji 5 juta"
- **Slots:** `type` (income | expense | transfer), `amount`, `account`, `category?`, `note?`
- **Action:** write single-leg ledger entry. Auto-suggest category.
- **Confirm?** Soft.

### `confirm_reconciliation`
User responds to a "same trade?" / "link these?" prompt.
- **Triggers:** inline-button tap (`Yes, link it` / `No, separate`), or text "yes that's the same", "no, different", "iya sama", "bukan"
- **Slots:** `decision` (link | separate), `event_ref` (carried from the prompt context)
- **Action:** link the two legs into one event, or keep separate. Record the decision so the matcher learns.
- **Confirm?** This *is* the confirmation step.

### `respond_to_nudge`
User answers the weekly forgotten-balance check-in.
- **Triggers:** inline-button tap (`Surface them` / `Ignore for now`), or "bring it forward", "ignore", "abaikan dulu"
- **Slots:** `decision` (surface | ignore), `targets?` (which balances)
- **Action:** adjust net-worth view / snooze the nudge for those balances.
- **Confirm?** No.

### `add_watched_wallet`
Register a read-only Tier-1 address or exchange account.
- **Triggers:** "watch this wallet 0xABC…", "track my metamask 0x…", "pantau wallet ini 0x…", "add my Indodax (read-only key)"
- **Slots:** `address` (0x… EVM), `label?`, `source?` (MetaMask | Indodax | …)
- **Action:** validate address, store address + label only (never keys), subscribe via Goldsky Mirror.
- **Confirm?** Soft — echo the address + label, remind it's read-only.

---

## Tier 2 — Supporting intents (ship if week-1 slack)

### `categorize_transaction`
Tag or recategorize an existing event.
- **Triggers:** "tag that last one as rent", "the 5M deposit was salary", "kategori transaksi tadi: makan"
- **Slots:** `event_ref` (last | by description/date), `category`
- **Action:** update ledger entry's category.
- **Confirm?** No.

### `query_recent_activity`
List recent events / activity feed in-chat.
- **Triggers:** "show my recent transactions", "what happened this week", "transaksi minggu ini"
- **Slots:** `window?` (today | week | month), `account?`
- **Action:** render recent ledger events.
- **Confirm?** No.

### `import_statement`
User uploads a bank statement (PDF/CSV/screenshot) — week-2 feature, but the parser
should recognize the upload intent now and reply gracefully if not yet built.
- **Triggers:** file/photo upload, "here's my BCA statement", "import this", "ini rekening koran BCA"
- **Slots:** `file`, `account?`
- **Action (wk2):** parse entries, match to existing events, flag orphans → reconciliation prompts.
- **Confirm?** Per-orphan confirmation.

### `help` / `start`
Onboarding + capability list.
- **Triggers:** "/start", "/help", "what can you do", "apa yang bisa kamu lakukan"
- **Action:** intro + example sentences. `/start` already exists in `skill/src/bot/commands/`.
- **Confirm?** No.

---

## Tier 3 — Agentic-core intents (week 3 — recognize early, stub reply) 🔜

### `set_rule` 🔜
Create an autonomous rule in natural language.
- **Triggers:** "every time USDT comes in, save 10% as USDY", "when I have over 500 USDT idle for 7 days, stake it", "sisihkan 10% tiap ada USDT masuk ke USDY"
- **Slots:** `trigger` (on_inflow | idle_threshold), `asset`, `percentage?`, `threshold_amount?`, `idle_days?`, `target_asset` (USDY | …), `venue?` (Agni | Merchant Moe)
- **Action (wk3):** build structured rule → confirmation → one-time Privy signature → `setRule()` on AutonomousRule.sol → mint ERC-8004 NFT if first rule.
- **Confirm?** Yes — money-authority action, requires signature.

### `query_rules` 🔜 / `pause_rule` 🔜 / `disable_rule` 🔜
"show my rules" · "pause the USDY rule" · "stop saving to USDY" / "berhenti dulu".
- **Action (wk3):** list / pause / revoke. Revoke = one signed transaction.
- **Confirm?** Yes for pause/disable (changes agent authority).

---

## Fallback behavior

- **Low-confidence classification:** ask a clarifying question, don't guess on
  money-moving intents. ("Did you mean you *sold* or *bought* USDT?")
- **Unknown intent:** offer the closest 2–3 supported intents as buttons.
- **Partial slots:** ask only for the missing slot, never re-ask what was given.
- **Stub intents (🔜):** recognize and reply "That's coming in the rules update —
  for now I can log it / show it" rather than misclassifying into a wrong handler.
