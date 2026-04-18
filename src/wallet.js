import { Connection, PublicKey } from "@solana/web3.js";

export const connection = new Connection(
  import.meta.env.VITE_HELIUS_RPC_URL,
  "confirmed"
);

export let walletPublicKey = null;
export let isSimulation = false;

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const JLP_MINT  = new PublicKey("27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4");

let lastJLPPrice = 0;
export function setLastJLPPrice(price) { lastJLPPrice = price; }

async function detectNetwork() {
  try {
    const genesis = await connection.getGenesisHash();
    isSimulation = genesis !== MAINNET_GENESIS;
  } catch {
    isSimulation = false;
  }
  updateSimBanner();
}

function updateSimBanner() {
  const banner = document.getElementById("sim-banner");
  if (!banner) return;
  if (isSimulation) {
    banner.classList.add("visible");
  } else {
    banner.classList.remove("visible");
  }
}

export async function fetchWalletBalances() {
  if (!walletPublicKey) return;

  try {
    const [lamports, usdcAccounts, jlpAccounts] = await Promise.all([
      connection.getBalance(walletPublicKey),
      connection.getParsedTokenAccountsByOwner(walletPublicKey, { mint: USDC_MINT }),
      connection.getParsedTokenAccountsByOwner(walletPublicKey, { mint: JLP_MINT }),
    ]);

    const solEl = document.getElementById("d-sol");
    if (solEl) solEl.textContent = (lamports / 1e9).toFixed(3);

    const usdcEl = document.getElementById("d-usdc");
    if (usdcEl) {
      const raw = usdcAccounts.value[0]
        ?.account.data.parsed.info.tokenAmount.uiAmount;
      usdcEl.textContent = (raw ?? 0).toFixed(2);
    }

    const jlpBal = jlpAccounts.value[0]
      ?.account.data.parsed.info.tokenAmount.uiAmount ?? 0;

    const jlpBalEl = document.getElementById("d-jlp-bal");
    if (jlpBalEl) jlpBalEl.textContent = jlpBal.toFixed(4);

    const jlpUsdEl = document.getElementById("d-jlp-usd");
    if (jlpUsdEl) {
      jlpUsdEl.textContent = lastJLPPrice > 0
        ? `≈ $${(jlpBal * lastJLPPrice).toFixed(2)} USD`
        : jlpBal > 0 ? `${jlpBal.toFixed(4)} JLP` : "0.00";
    }
  } catch (err) {
    console.error("Balance fetch failed:", err);
  }
}

export async function connectWallet() {
  const btn = document.getElementById("wbtn");

  if (!window.solana?.isPhantom) {
    window.open("https://phantom.app/", "_blank");
    return;
  }

  try {
    btn.textContent = "Connecting...";
    btn.style.opacity = "0.7";

    const resp = await window.solana.connect();
    walletPublicKey = resp.publicKey;

    btn.textContent = "Disconnect";
    btn.style.color = "var(--sol-green)";
    btn.style.borderColor = "rgba(20,241,149,0.3)";
    btn.style.opacity = "1";
    window.__walletConnected = true;
    if (window.checkLunarBanner) window.checkLunarBanner();

    const addrEl = document.getElementById('wallet-addr');
    if (addrEl) {
      const addr = resp.publicKey.toString();
      addrEl.textContent = addr.slice(0,4)+'...'+addr.slice(-4);
      addrEl.style.display = 'block';
    }

    await detectNetwork();
    fetchWalletBalances();
  } catch (err) {
    btn.textContent = "Connect Wallet";
    btn.style.opacity = "1";
    console.error("Wallet connect failed:", err);
  }
}

export async function disconnectWallet() {
  try {
    await window.solana?.disconnect();
  } catch { /* ignore */ }

  walletPublicKey = null;

  window.__walletConnected = false;

  const btn = document.getElementById("wbtn");
  if (btn) {
    btn.textContent = "Connect Wallet";
    btn.style.color = "";
    btn.style.borderColor = "";
    btn.style.opacity = "1";
  }

  for (const id of ["d-sol", "d-usdc", "d-jlp-bal"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "—";
  }
  const jlpUsd = document.getElementById("d-jlp-usd");
  if (jlpUsd) jlpUsd.textContent = "0.00";

  const addrEl = document.getElementById('wallet-addr');
  if (addrEl) addrEl.style.display = 'none';
}

export async function tryAutoConnect() {
  if (!window.solana?.isPhantom) return;
  try {
    const resp = await window.solana.connect({ onlyIfTrusted: true });
    walletPublicKey = resp.publicKey;
    const btn = document.getElementById("wbtn");
    btn.textContent = "Disconnect";
    btn.style.color = "var(--sol-green)";
    btn.style.borderColor = "rgba(20,241,149,0.3)";
    window.__walletConnected = true;
    const addrEl = document.getElementById('wallet-addr');
    if (addrEl) {
      const addr = resp.publicKey.toString();
      addrEl.textContent = addr.slice(0,4)+'...'+addr.slice(-4);
      addrEl.style.display = 'block';
    }
    await detectNetwork();
    fetchWalletBalances();
  } catch {
    // not pre-approved, no-op
  }
}
