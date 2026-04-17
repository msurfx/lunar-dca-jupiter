import { DCA, Network } from "@jup-ag/dca-sdk";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { connection, walletPublicKey, isSimulation } from "./wallet.js";
import { jupiterFetch } from "./jupiter.js";

// Mainnet USDC
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_DECIMALS = 1_000_000;

// Weekly cycles aligned to lunar sub-phases
const CYCLE_SECONDS = BigInt(86400 * 7);

let _dca = null;
function getDCA() {
  if (!_dca) _dca = new DCA(connection, Network.MAINNET);
  return _dca;
}

async function ensureUSDCAta() {
  const ata = await getAssociatedTokenAddress(
    USDC_MINT,
    walletPublicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const info = await connection.getAccountInfo(ata);
  if (info !== null) return ata;

  const ix = createAssociatedTokenAccountInstruction(
    walletPublicKey,
    ata,
    walletPublicKey,
    USDC_MINT,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPublicKey;

  const signed = await window.solana.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return ata;
}

/**
 * Fetch open DCA orders via Jupiter Recurring API, normalised to our display shape.
 * Falls back to the on-chain SDK if the API call fails (e.g. missing API key).
 * In simulation mode returns a single mock order.
 */
export async function fetchDCAOrders() {
  if (!walletPublicKey) return [];

  if (isSimulation) {
    const now = Math.floor(Date.now() / 1000);
    return [normalise({
      orderKey:            "SIM_DCA_DEMO",
      rawInAmountPerCycle: "250000",
      rawInDeposited:      "1000000",
      rawInUsed:           "250000",
      rawOutReceived:      "3500000",
      cycleFrequency:      "604800",
      createdAt:           new Date((now - 86400 * 7) * 1000).toISOString(),
      trades:              [],
    })];
  }

  try {
    const params = new URLSearchParams({
      user:          walletPublicKey.toBase58(),
      orderStatus:   "active",
      recurringType: "time",
    });
    const data = await jupiterFetch(`/recurring/v1/getRecurringOrders?${params}`);
    return (data.orders ?? []).map(normalise);
  } catch (err) {
    console.warn("[DCA] Recurring API unavailable, falling back to on-chain SDK:", err.message);
    return getDCA().getCurrentByUser(walletPublicKey);
  }
}

// Normalise a Recurring API order object to the shape renderDCARow expects.
function normalise(o) {
  const freq = parseInt(o.cycleFrequency);
  const lastTrade = o.trades?.at(-1);
  const lastAt = lastTrade
    ? Math.floor(new Date(lastTrade.confirmedAt).getTime() / 1000)
    : Math.floor(new Date(o.createdAt).getTime() / 1000);

  return {
    publicKey: { toBase58: () => o.orderKey },
    account: {
      inAmountPerCycle: { toNumber: () => parseInt(o.rawInAmountPerCycle) },
      inDeposited:      { toNumber: () => parseInt(o.rawInDeposited) },
      inUsed:           { toNumber: () => parseInt(o.rawInUsed) },
      outReceived:      { toNumber: () => parseInt(o.rawOutReceived) },
      nextCycleAt:      { toNumber: () => lastAt + freq },
      createdAt:        { toNumber: () => Math.floor(new Date(o.createdAt).getTime() / 1000) },
    },
  };
}

/**
 * Launch a Jupiter DCA order: USDC → SOL
 * In simulation mode: mocks the response without sending any transaction.
 * @param {number} amountUsdc       - base amount per cycle in USDC
 * @param {number} phaseMultiplier  - 0.5 (waxing) or 1.0 (new moon)
 */
export async function launchDCAOrder(amountUsdc, phaseMultiplier) {
  if (!walletPublicKey) throw new Error("Wallet not connected");
  if (phaseMultiplier <= 0) throw new Error("DCA disabled in this lunar phase");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1400)); // simulate latency
    const fakeSig = "SIM" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const fakeDca = "DCA" + Math.random().toString(36).slice(2, 10).toUpperCase();
    console.log(
      `[SIM] DCA order — ${amountUsdc} USDC × ${phaseMultiplier} → SOL\n` +
      `  sig: ${fakeSig}\n  dcaAccount: ${fakeDca}`
    );
    return { sig: fakeSig, dcaAccount: fakeDca };
  }

  const userInTokenAccount = await ensureUSDCAta();

  const totalIn = BigInt(Math.round(amountUsdc * phaseMultiplier * USDC_DECIMALS));
  const perCycle = totalIn / BigInt(4);

  if (perCycle < BigInt(1)) {
    throw new Error("Amount too small — minimum 4 micro-USDC per cycle");
  }

  const { tx, dcaPubKey } = await getDCA().createDcaV2(
    {
      payer: walletPublicKey,
      user: walletPublicKey,
      userInTokenAccount,
      inAmount: totalIn,
      inAmountPerCycle: perCycle,
      cycleSecondsApart: CYCLE_SECONDS,
      inputMint: USDC_MINT,
      outputMint: SOL_MINT,
      minOutAmountPerCycle: null,
      maxOutAmountPerCycle: null,
      startAt: null,
    },
    true // skipBalanceCheck — ATA existence already verified above
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPublicKey;

  const signed = await window.solana.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return { sig, dcaAccount: dcaPubKey.toBase58() };
}

/**
 * Close an open DCA order and return remaining funds to the wallet.
 * @param {string|PublicKey} dcaPubKey - the DCA account address
 */
export async function closeDCA(dcaPubKey) {
  if (!walletPublicKey) throw new Error("Wallet not connected");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1000));
    const fakeSig = "SIM_CLOSE_" + Math.random().toString(36).slice(2, 8).toUpperCase();
    console.log(`[SIM] closeDCA ${dcaPubKey} → ${fakeSig}`);
    return fakeSig;
  }

  const { tx } = await getDCA().closeDCA({
    user: walletPublicKey,
    dca: typeof dcaPubKey === "string" ? new PublicKey(dcaPubKey) : dcaPubKey,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletPublicKey;

  const signed = await window.solana.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return sig;
}
