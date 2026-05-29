# Tali agent intents

The set of natural-language intents Claude must recognize and route to the right skill. This is the contract between user input and the `tali-cli` / `byreal-cli` handler layer.

## Conventions

- **Slots** are the structured fields Claude extracts. `?` = optional.
- **Confirm?** = does the agent show a confirmation before committing? Money-moving actions always confirm.
- **Bilingual:** every intent must trigger in English *and* Bahasa Indonesia.
- Amounts normalize: `2000`, `2,000`, `2k`, `35.38M`, `35,380,000` → same value.

---

## Tier 1 — Core intents (must ship)

### `query_net_worth`
Show total net worth in IDR across all wallets.
- **Triggers:** "what's my net worth", "how much do I have", "berapa total uangku", "cek saldo total"
- **Slots:** `wallet?` (address), `breakdown?` (full | onchain | offchain)
- **Action:** `tali-cli networth --wallet <address>`
- **Confirm?** No (read-only).

### `query_balance`
Show one specific wallet/asset balance.
- **Triggers:** "how much USDT do I have", "balance on Byreal", "saldo berapa"
- **Slots:** `asset?`, `wallet?`
- **Action:** `tali-cli networth --wallet <address>` filtered, or `byreal-cli wallet balance`
- **Confirm?** No.

### `set_rule`
Create an autonomous rule in natural language.
- **Triggers:** "whenever USDT comes in, farm 10% on Byreal", "when I have 500 USDT idle, stake it", "sisihkan 10% tiap ada USDT masuk"
- **Slots:** `trigger` (on_inflow | idle_threshold), `asset`, `percentage?`, `threshold_amount?`, `action` (byreal_farm | byreal_dca | byreal_swap), `target_asset?`
- **Action:** `tali-cli rules add <rule>` → NL parse → Privy sign → `AutonomousRule.sol`
- **Confirm?** Yes — money-authority action, requires Privy signature.

### `query_rules`
List active rules.
- **Triggers:** "show my rules", "what rules do I have", "aturan saya apa"
- **Action:** `tali-cli rules list`
- **Confirm?** No.

### `disable_rule`
Pause or remove a rule.
- **Triggers:** "stop the USDT rule", "pause rule 1", "matikan aturan"
- **Slots:** `rule_id`
- **Action:** `tali-cli rules remove <id>` → Privy sign → contract call
- **Confirm?** Yes.

---

## Tier 2 — DeFi intents (byreal-cli)

### `defi_swap`
Swap tokens on Byreal.
- **Triggers:** "swap 100 USDT to SOL", "tukar 100 USDT ke SOL"
- **Slots:** `input_mint`, `output_mint`, `amount`
- **Action:** `byreal-cli swap execute --dry-run` then `--confirm`
- **Confirm?** Yes — always dry-run first.

### `defi_farm`
Open or copy a yield farming position.
- **Triggers:** "farm my USDC for yield", "copy the top farmer on SOL/USDC"
- **Slots:** `pool?`, `amount_usd?`, `copy_from?`
- **Action:** `byreal-cli positions copy` or `byreal-cli positions open`
- **Confirm?** Yes.

### `defi_status`
Check open positions and farming performance.
- **Triggers:** "how's my farm doing", "show my positions", "posisi saya gimana"
- **Action:** `byreal-cli positions list`
- **Confirm?** No.

---

## Tier 3 — Supported but deferred

### `log_p2p_trade`
Log a crypto↔IDR P2P trade as a two-sided event. Requires Goldsky pipeline + NL parser — planned for after week 1.
- **Stub reply:** "P2P logging coming soon — for now check your net worth with `tali-cli networth`"

### `add_watched_wallet`
Register a read-only Tier-1 address.
- **Stub reply:** "Wallet watching coming soon."

---

## Fallback behavior

- **Low-confidence classification:** ask a clarifying question, never guess on money-moving intents.
- **Unknown intent:** offer the closest 2–3 supported intents.
- **Partial slots:** ask only for the missing slot.
- **Deferred intents (Tier 3):** recognize and reply with stub message — never misclassify.
