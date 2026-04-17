# MoonSurfer — Lunar DCA on Solana

> Automate SOL/USDC DCA trades timed to lunar phases. Idle USDC earns yield in JLP during waning phases. Powered by Jupiter.

**Bounty:** Jupiter × Superteam Frontier — "Not Your Regular Bounty"
**Deadline:** May 26, 2026 | **Prize pool:** 3,000 jupUSD

---

## What's built (this repo)

| File | Status | Description |
|---|---|---|
| `index.html` | ✅ Done | Full frontend UI — moon dial, moonsurfer, Jupiter orbit, DCA config, cosmic confidence |
| `src/lunar.js` | ⬜ Next | Lunar phase engine (extract from index.html) |
| `src/dca.js` | ⬜ Next | Jupiter DCA program integration |
| `src/jlp.js` | ⬜ Next | JLP deposit/withdraw logic |
| `src/wallet.js` | ⬜ Next | Solana wallet adapter (Phantom, Backpack) |

---

## Architecture

```
User
  └─ Connects wallet (Phantom/Backpack)
  └─ Sets DCA amount (USDC)
  └─ Toggles JLP Yield Mode

Lunar Engine (client-side)
  └─ Calculates current phase from synodic cycle math (no API)
  └─ Returns phase ID: new | wax | full | wan
  └─ Updates moon dial live every 60s

DCA Trigger Logic (4-phase)
  ├─ NEW MOON  (0–12.5% cycle) → Full buy  100% of set amount
  ├─ WAXING    (12.5–50%)      → Light buy 50% of set amount
  ├─ FULL MOON (50–62.5%)      → Pause, no buy
  └─ WANING    (62.5–100%)     → Deposit idle USDC → JLP

Jupiter Integration (Claude Code / solana.new)
  ├─ Jupiter DCA Program   → on-chain recurring swaps
  ├─ Jupiter Swap API      → USDC → SOL execution
  └─ JLP Token             → idle USDC yield during waning phase

Mid-Cycle Entry UX
  └─ If user starts mid-cycle (not near new moon):
     └─ Show countdown timer to next new moon
     └─ Offer: "Wait for New Moon" OR "Begin Now (50% weight)"
     └─ Moon advises the user, not the app
```

---

## Lunar Phase Engine

Pure math — no external API needed for the dial.

```javascript
const SYNODIC = 29.53059; // days
const KNOWN_NEW = new Date('2024-01-11T00:00:00Z');

function getLunarDay() {
  const diff = (Date.now() - KNOWN_NEW.getTime()) / 86400000;
  return ((diff % SYNODIC) + SYNODIC) % SYNODIC;
}

// Returns: 0 = new moon, ~14.77 = full moon
```

Phase mapping:
- 0–12.5% → New Moon → 100% DCA buy
- 12.5–50% → Waxing  → 50% DCA buy
- 50–62.5% → Full Moon → Pause
- 62.5–100% → Waning  → Park USDC in JLP

---

## Jupiter DCA Integration (Claude Code TODO)

Use Jupiter's on-chain DCA program. Docs: https://station.jup.ag/docs/dca/overview

```bash
# Install
npm install @jup-ag/dca-sdk @solana/web3.js

# Init DCA
npx solana.new  # run this to scaffold with Jupiter skills
```

Key calls needed:

```javascript
import { DCA, Network } from '@jup-ag/dca-sdk';

// Create a DCA order
const dca = new DCA(connection, Network.MAINNET);
await dca.createDCA({
  inputMint: USDC_MINT,
  outputMint: SOL_MINT,
  inAmount: amountBasedOnPhase,   // 100% or 50% based on lunar phase
  inAmountPerCycle: cycleAmount,
  cycleFrequency: 86400,          // daily check
  ...
});
```

---

## JLP Integration (Claude Code TODO)

JLP = Jupiter Liquidity Pool token. Earns yield from perp trading fees.

```javascript
// During WANING phase: deposit idle USDC into JLP
// Jupiter provides liquidity deposit endpoints
// Docs: https://station.jup.ag/docs/jlp

// Simplified flow:
// 1. Detect waning phase
// 2. Swap USDC → JLP via Jupiter Swap API
// 3. Store JLP token balance
// 4. On next new moon: swap JLP → USDC, resume DCA
```

---

## Wallet Setup (Claude Code TODO)

```bash
npm install @solana/wallet-adapter-react @solana/wallet-adapter-phantom
```

---

## Cosmic Confidence Score

Simple weighted score shown in UI:

```
Score = (moon_weight * 0.6) + (funding_rate_weight * 0.4)

moon_weight:
  new moon  = 88
  waxing    = 64
  full moon = 38
  waning    = 72

funding_rate_weight:
  Fetch from: https://api.hyperliquid.xyz/info (or Drift)
  Negative funding = bullish signal = higher weight
```

---

## Solana.new handoff

Run this to scaffold the on-chain parts:
```bash
curl -fsSL https://www.solana.new/setup.sh | bash
# Then inside project:
solana-new build --template jupiter-dca
```

---

## Stack
- Frontend: Vanilla HTML/CSS/JS (index.html) → can be ported to React
- Fonts: Orbitron (headers), Rajdhani (body)
- Colors: Solana purple #9945FF, Solana green #14F195
- On-chain: Solana, Jupiter DCA program, JLP
- Wallet: Phantom / Backpack via wallet adapter

---

## Bounty notes
- "Not your regular" angle: automated on-chain DCA bot timed to lunar cycles
- Research backing: Dichev & Janes (2001), Yuan, Zheng & Zhu (2006) — ~55% accuracy across 33 tracked cycles
- Institutional angle: hedge funds quietly use lunar timing (W.D. Gann, Ray Merriman)
- Jupiter integration: DCA program + JLP yield = two native Jupiter products
- UI differentiator: quirky cosmic brand, moonsurfer mascot, live moon dial