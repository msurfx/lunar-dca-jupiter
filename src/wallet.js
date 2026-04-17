import { Connection, PublicKey } from "@solana/web3.js";

export const connection = new Connection(
  import.meta.env.VITE_HELIUS_RPC_URL,
  "confirmed"
);

export let walletPublicKey = null;
export let isSimulation = false;

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

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
    const [lamports, tokenAccounts] = await Promise.all([
      connection.getBalance(walletPublicKey),
      connection.getParsedTokenAccountsByOwner(walletPublicKey, { mint: USDC_MINT }),
    ]);

    const solEl = document.getElementById("d-sol");
    if (solEl) solEl.textContent = (lamports / 1e9).toFixed(3);

    const usdcEl = document.getElementById("d-usdc");
    if (usdcEl) {
      const raw = tokenAccounts.value[0]
        ?.account.data.parsed.info.tokenAmount.uiAmount;
      usdcEl.textContent = (raw ?? 0).toFixed(2);
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

    const addr = walletPublicKey.toBase58();
    btn.textContent = `◎ ${addr.slice(0, 4)}...${addr.slice(-4)}`;
    btn.style.color = "var(--sol-green)";
    btn.style.borderColor = "rgba(20,241,149,0.3)";
    btn.style.opacity = "1";

    await detectNetwork();
    fetchWalletBalances();
  } catch (err) {
    btn.textContent = "Connect Wallet";
    btn.style.opacity = "1";
    console.error("Wallet connect failed:", err);
  }
}

export async function tryAutoConnect() {
  if (!window.solana?.isPhantom) return;
  try {
    const resp = await window.solana.connect({ onlyIfTrusted: true });
    walletPublicKey = resp.publicKey;
    const addr = walletPublicKey.toBase58();
    const btn = document.getElementById("wbtn");
    btn.textContent = `◎ ${addr.slice(0, 4)}...${addr.slice(-4)}`;
    btn.style.color = "var(--sol-green)";
    btn.style.borderColor = "rgba(20,241,149,0.3)";
    await detectNetwork();
    fetchWalletBalances();
  } catch {
    // not pre-approved, no-op
  }
}
