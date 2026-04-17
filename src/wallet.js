import { Connection } from "@solana/web3.js";

export const connection = new Connection(
  import.meta.env.VITE_HELIUS_RPC_URL,
  "confirmed"
);

export let walletPublicKey = null;
export let isSimulation = false;

// Mainnet genesis hash — anything else is devnet/testnet → simulation mode
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

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
  } catch {
    // not pre-approved, no-op
  }
}
