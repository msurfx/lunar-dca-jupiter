import { VersionedTransaction } from "@solana/web3.js";
import { walletPublicKey, isSimulation } from "./wallet.js";
import { jupiterFetch, withRetry } from "./jupiter.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JLP_MINT  = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";

/**
 * Swap USDC → JLP via Jupiter Swap v2 (order → sign → execute).
 * Jupiter submits the transaction — no sendRawTransaction needed.
 * Retries retryable error codes per the integrating-jupiter skill.
 */
export async function swapUSDCtoJLP(amountUsdc) {
  if (!walletPublicKey) throw new Error("Wallet not connected");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeSig = "SIM" + Math.random().toString(36).slice(2, 10).toUpperCase();
    console.log(`[SIM] JLP swap — ${amountUsdc} USDC → JLP\n  sig: ${fakeSig}`);
    return fakeSig;
  }

  const amountRaw = Math.round(amountUsdc * 1_000_000); // USDC 6 decimals

  // 1. Get order — Swap v2 returns a pre-built transaction + requestId
  const params = new URLSearchParams({
    inputMint: USDC_MINT,
    outputMint: JLP_MINT,
    amount:     amountRaw.toString(),
    taker:      walletPublicKey.toBase58(),
    slippageBps: "50",
  });

  const order = await withRetry(() => jupiterFetch(`/swap/v2/order?${params}`));

  if (order.error || !order.transaction) {
    throw new Error(`Swap order: ${order.error ?? "no transaction returned"}`);
  }

  // 2. Sign (Phantom) — transaction is already built, just sign it
  const tx     = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  const signed = await window.solana.signTransaction(tx);
  const signedB64 = Buffer.from(signed.serialize()).toString("base64");

  // 3. Execute — Jupiter submits to the network on our behalf
  const result = await withRetry(() =>
    jupiterFetch("/swap/v2/execute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedTransaction: signedB64,
        requestId:         order.requestId,
      }),
    })
  );

  if (result.status !== "Success") {
    const err = Object.assign(
      new Error(`Swap failed: ${result.error ?? "unknown"}`),
      { code: result.code }
    );
    throw err;
  }

  console.log(`[JLP] swapped ${amountUsdc} USDC → JLP  sig:`, result.signature);
  return result.signature;
}

/**
 * Swap SOL → USDC via Jupiter Swap v2 (full moon exit).
 */
export async function swapSOLtoUSDC(amountSol) {
  if (!walletPublicKey) throw new Error("Wallet not connected");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeSig = "SIM" + Math.random().toString(36).slice(2, 10).toUpperCase();
    console.log(`[SIM] SOL→USDC swap — ${amountSol} SOL\n  sig: ${fakeSig}`);
    return fakeSig;
  }

  const SOL_MINT  = "So11111111111111111111111111111111111111112";
  const amountRaw = Math.round(amountSol * 1_000_000_000); // SOL 9 decimals

  const params = new URLSearchParams({
    inputMint:   SOL_MINT,
    outputMint:  USDC_MINT,
    amount:      amountRaw.toString(),
    taker:       walletPublicKey.toBase58(),
    slippageBps: "50",
  });

  const order = await withRetry(() => jupiterFetch(`/swap/v2/order?${params}`));
  if (order.error || !order.transaction) {
    throw new Error(`Swap order: ${order.error ?? "no transaction returned"}`);
  }

  const tx     = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  const signed = await window.solana.signTransaction(tx);
  const signedB64 = Buffer.from(signed.serialize()).toString("base64");

  const result = await withRetry(() =>
    jupiterFetch("/swap/v2/execute", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedTransaction: signedB64,
        requestId:         order.requestId,
      }),
    })
  );

  if (result.status !== "Success") {
    throw Object.assign(
      new Error(`SOL→USDC swap failed: ${result.error ?? "unknown"}`),
      { code: result.code }
    );
  }

  console.log(`[SELL] swapped ${amountSol} SOL → USDC  sig:`, result.signature);
  return result.signature;
}

const JUPUSD_MINT = "JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD"; // update with real mint

/**
 * Deposit USDC → jupUSD via Jupiter Lend Earn API (full moon phase).
 */
export async function depositToJupUSD(amountUsdc) {
  if (!walletPublicKey) throw new Error("Wallet not connected");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeSig = "SIM" + Math.random().toString(36).slice(2, 10).toUpperCase();
    console.log(`[SIM] jupUSD deposit — ${amountUsdc} USDC\n  sig: ${fakeSig}`);
    return fakeSig;
  }

  const amountRaw = Math.round(amountUsdc * 1_000_000);
  const JUP_KEY = window.__JUP_KEY__ || '';

  const res = await withRetry(() =>
    fetch('https://api.jup.ag/lend/v1/earn/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': JUP_KEY },
      body: JSON.stringify({
        asset:  USDC_MINT,
        amount: amountRaw.toString(),
        signer: walletPublicKey.toBase58(),
      })
    }).then(r => r.json())
  );

  if (!res.transaction) throw new Error(`jupUSD deposit failed: ${res.error ?? 'no transaction'}`);

  const tx     = VersionedTransaction.deserialize(Buffer.from(res.transaction, 'base64'));
  const signed = await window.solana.signTransaction(tx);
  const sig    = await import('./wallet.js').then(m =>
    m.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false })
  );

  console.log(`[jupUSD] deposited ${amountUsdc} USDC  sig:`, sig);
  return sig;
}

/**
 * Withdraw jupUSD → USDC via Jupiter Lend Earn API.
 */
export async function withdrawFromJupUSD(amountUsdc) {
  if (!walletPublicKey) throw new Error("Wallet not connected");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeSig = "SIM" + Math.random().toString(36).slice(2, 10).toUpperCase();
    console.log(`[SIM] jupUSD withdraw — ${amountUsdc} USDC\n  sig: ${fakeSig}`);
    return fakeSig;
  }

  const amountRaw = Math.round(amountUsdc * 1_000_000);
  const JUP_KEY = window.__JUP_KEY__ || '';

  const res = await withRetry(() =>
    fetch('https://api.jup.ag/lend/v1/earn/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': JUP_KEY },
      body: JSON.stringify({
        asset:  USDC_MINT,
        amount: amountRaw.toString(),
        signer: walletPublicKey.toBase58(),
      })
    }).then(r => r.json())
  );

  if (!res.transaction) throw new Error(`jupUSD withdraw failed: ${res.error ?? 'no transaction'}`);

  const tx     = VersionedTransaction.deserialize(Buffer.from(res.transaction, 'base64'));
  const signed = await window.solana.signTransaction(tx);
  const sig    = await import('./wallet.js').then(m =>
    m.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false })
  );

  console.log(`[jupUSD] withdrew ${amountUsdc} USDC  sig:`, sig);
  return sig;
}

/**
 * Swap jupUSD → JLP via Jupiter Swap v2 (waning phase).
 */
export async function swapJupUSDtoJLP(amountJupUSD) {
  if (!walletPublicKey) throw new Error("Wallet not connected");

  if (isSimulation) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeSig = "SIM" + Math.random().toString(36).slice(2, 10).toUpperCase();
    console.log(`[SIM] jupUSD→JLP — ${amountJupUSD}\n  sig: ${fakeSig}`);
    return fakeSig;
  }

  const amountRaw = Math.round(amountJupUSD * 1_000_000);

  const params = new URLSearchParams({
    inputMint:   JUPUSD_MINT,
    outputMint:  JLP_MINT,
    amount:      amountRaw.toString(),
    taker:       walletPublicKey.toBase58(),
    slippageBps: "50",
  });

  const order = await withRetry(() => jupiterFetch(`/swap/v2/order?${params}`));
  if (order.error || !order.transaction) throw new Error(`jupUSD→JLP swap: ${order.error ?? 'no transaction'}`);

  const tx        = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
  const signed    = await window.solana.signTransaction(tx);
  const signedB64 = Buffer.from(signed.serialize()).toString('base64');

  const result = await withRetry(() =>
    jupiterFetch('/swap/v2/execute', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedTransaction: signedB64, requestId: order.requestId }),
    })
  );

  if (result.status !== 'Success') throw new Error(`jupUSD→JLP failed: ${result.error ?? 'unknown'}`);

  console.log(`[jupUSD→JLP] swapped ${amountJupUSD}  sig:`, result.signature);
  return result.signature;
}

/**
 * Fetch current JLP APY from Jupiter's stats endpoint (display only).
 */
export async function getJLPApy() {
  try {
    const resp = await fetch("https://stats.jup.ag/perpetuals/pool-stats");
    const data = await resp.json();
    return data?.apy ? (data.apy * 100).toFixed(1) + "%" : "—";
  } catch {
    return "—";
  }
}
