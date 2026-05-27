# Bolt refinement — Round 1 (paste when tokens reset)

Context: first Bolt build looked great (warm Monai-style + trust spine landed). This round fixes correctness bugs (numbers didn't reconcile; offchain accounts wrongly tagged "Watched") + small polish. Paste the block below into the existing Bolt project — it edits in place, keep the current look.

After Bolt applies it, screenshot the result back to Claude for round 2 (dark mode + mobile check, then Bahasa Indonesia copy variant).

---

```
Refine the existing app — keep the current look and layout, make these specific changes:

1) MAKE THE NUMBERS RECONCILE. The hero net worth must equal the sum of all holdings shown. Use exactly these values (rates: $1 = Rp 16.000, mETH $3.000, SOL $150):
- Hero total: Rp 183.072.000, "up Rp 5,85jt this month (+3,3%)".
- ONCHAIN subtotal Rp 146,9jt:
  • MetaMask 0xABC…9F2 — 3.500 USDT + 0,8 mETH — Rp 94.400.000
  • Indodax (read-only API) — 847 USDT — Rp 13.552.000
  • Phantom — 0,42 SOL — Rp 1.008.000
  • Tali Wallet 0xDEF…71C — 1.240 USDT + 450 USDY — Rp 27.040.000
  • AutonomousRule.sol 0xGHI…04A — 680 USDY — Rp 10.880.000
- OFFCHAIN subtotal Rp 36,2jt: BCA Rp 35.380.000; GoPay Rp 312.000; Cash Rp 500.000.

2) FIX THE TRUST BADGES. Offchain accounts (BCA, GoPay, Cash) are NOT "Watched" — they're logged by hand. Add a new badge: "✎ Logged" in warm neutral gray (#9B9389). Use it for all offchain accounts AND for the offchain (BCA) side of the P2P trade on the Activity screen. Offchain rows must NEVER show a "verify on Mantle" link. Keep "Watched" only for onchain read-only wallets, and recolor the Watched badge to slate-blue (#7C8AA6) so it reads as its own tier, not gray.

3) POLISH:
- Give each wallet row its own icon instead of the same chain-link: MetaMask = fox/diamond, Indodax = exchange/building, Phantom = ghost/wallet, Tali Wallet = shield-with-spark, AutonomousRule.sol = small robot/contract glyph.
- On the Rules screen, reduce the empty space below the active rule — tighten vertical rhythm and let the content sit higher.
- Make every transaction-hash suffix unique on the Agent activity log (no two the same).
```

---

To show a bigger hero number for pitch impact: tell Bolt "multiply every holding by 7" — it stays reconciled (≈ Rp 1,28 M).
```
