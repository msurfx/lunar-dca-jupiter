import { VersionedTransaction } from "@solana/web3.js";
import { connection, walletPublicKey, isSimulation } from "./wallet.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
// JLP (Jupiter Liquidity Pool token) mainnet mint
const JLP_MINT = "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4";
const QUOTE_API = "https://quote-api.jup.ag/v6";

/**
 * Swap USDC → JLP via Jupiter Swap API v6 (VersionedTransaction)
 * Used during waning/full-moon phases to park idle USDC in JLP yield
 * @param {number} amountUsdc - amount to swap in USDC
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

  // 1. Get best route quote
  const quoteUrl =
    `${QUOTE_API}/quote` +
    `?inputMint=${USDC_MINT}` +
    `&outputMint=${JLP_MINT}` +
    `&amount=${amountRaw}` +
    `&slippageBps=50` +
    `&onlyDirectRoutes=false`;

  const quoteResp = await fetch(quoteUrl);
  const quote = await quoteResp.json();
  if (quote.error) throw new Error(`Jupiter quote: ${quote.error}`);

  // 2. Build swap transaction
  const swapResp = await fetch(`${QUOTE_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: walletPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  const swapData = await swapResp.json();
  if (swapData.error) throw new Error(`Jupiter swap build: ${swapData.error}`);

  // 3. Deserialize, sign, send
  const txBuf = Buffer.from(swapData.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);

  const signed = await window.solana.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return sig;
}

/**
 * Fetch current JLP APY from Jupiter's stats endpoint (display only)
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
