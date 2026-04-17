import { connectWallet, disconnectWallet, tryAutoConnect, walletPublicKey, fetchWalletBalances, setLastJLPPrice } from "./wallet.js";
import { launchDCAOrder, fetchDCAOrders, closeDCA } from "./dca.js";
import { swapUSDCtoJLP, getJLPApy } from "./jlp.js";

// ── Wallet ──────────────────────────────────────────────────────────────────
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.__setJLPPrice = setLastJLPPrice;


// ── JLP toggle ───────────────────────────────────────────────────────────────
window.toggleJLP = () => {
  const tog = document.getElementById("jlp-tog");
  tog.classList.toggle("on");
};

// ── Launch DCA orbit ─────────────────────────────────────────────────────────
window.launchDCA = async () => {
  if (!walletPublicKey) {
    await connectWallet();
    if (!walletPublicKey) return;
  }

  const amountUsdc = parseFloat(document.getElementById("dca-amt").value) || 100;
  const jlpEnabled = document.getElementById("jlp-tog").classList.contains("on");
  const btn = document.getElementById("launch-btn");

  // Read phase from the existing lunar engine (global scope from inline script)
  const day = typeof getLunarDay === "function" ? getLunarDay() : 14;
  const phase = typeof getPhase === "function" ? getPhase(day) : { id: "wax", pct: 50 };
  const cyclePct = day / 29.53059;

  // Full moon / mid-cycle: show modal unless overriding
  if (phase.pct === 0 && !jlpEnabled) {
    typeof showMidModal === "function" && showMidModal(day, cyclePct);
    return;
  }

  // Waning / full moon with JLP enabled → swap to JLP
  if (phase.pct === 0 && jlpEnabled) {
    setBtn(btn, "☽ Parking in JLP...", 0.7);
    try {
      const sig = await swapUSDCtoJLP(amountUsdc);
      setBtn(btn, "✓ JLP Position Open", 1, "linear-gradient(135deg,#00A870,#006B50)");
      console.log("[JLP] tx:", sig);
      resetBtn(btn, 5000);
    } catch (err) {
      resetBtn(btn, 0);
      console.error("[JLP] failed:", err);
      alert("JLP swap failed: " + err.message);
    }
    return;
  }

  // New moon (100%) or waxing (50%) → DCA into SOL
  setBtn(btn, "🚀 Launching...", 0.7);
  try {
    const { sig, dcaAccount } = await launchDCAOrder(amountUsdc, phase.pct / 100);
    setBtn(btn, "🚀 DCA Orbit Active!", 1,
      "linear-gradient(135deg,var(--sol-green),#00A068)",
      "0 0 30px rgba(20,241,149,0.3)");
    console.log("[DCA] tx:", sig, "account:", dcaAccount);
    resetBtn(btn, 5000);
    refreshDCAOrders();
  } catch (err) {
    resetBtn(btn, 0);
    console.error("[DCA] failed:", err);
    alert("DCA failed: " + err.message);
  }
};

// ── Mid-cycle modal actions ──────────────────────────────────────────────────
window.waitForMoon = () => {
  document.getElementById("overlay").classList.remove("visible");
  const btn = document.getElementById("launch-btn");
  setBtn(btn, "🌑 Queued for New Moon", 1, "linear-gradient(135deg,#00A870,#006B50)");
};

window.beginNow = async () => {
  document.getElementById("overlay").classList.remove("visible");
  const amountUsdc = parseFloat(document.getElementById("dca-amt").value) || 100;
  const btn = document.getElementById("launch-btn");
  setBtn(btn, "🚀 Launching at half tide...", 0.7);
  try {
    const { sig, dcaAccount } = await launchDCAOrder(amountUsdc, 0.5);
    setBtn(btn, "🚀 DCA Orbit Active!", 1,
      "linear-gradient(135deg,var(--sol-green),#00A068)",
      "0 0 30px rgba(20,241,149,0.3)");
    console.log("[DCA mid-cycle] tx:", sig, "account:", dcaAccount);
    resetBtn(btn, 5000);
    refreshDCAOrders();
  } catch (err) {
    resetBtn(btn, 0);
    console.error("[DCA mid-cycle] failed:", err);
    alert("DCA failed: " + err.message);
  }
};

// ── DCA orders ───────────────────────────────────────────────────────────────
export async function refreshDCAOrders() {
  let orders;
  try {
    orders = await fetchDCAOrders();
  } catch (err) {
    console.error("fetchDCAOrders failed:", err);
    return;
  }

  console.log("[DCA] raw orders:", JSON.stringify(orders, null, 2));
  window.dcaTrades = orders.flatMap(o => {
    const timestamps = o.trades?.length
      ? o.trades.map(t => new Date(t.confirmedAt).getTime())
      : [o.account.createdAt.toNumber() * 1000];
    return timestamps.map(timestamp => ({ timestamp, amountUsdc: o.inAmountPerCycle }));
  });
  console.log("[DCA] dcaTrades:", window.dcaTrades);
  if (typeof drawChart === "function" && document.getElementById('view-chart').classList.contains('active')) drawChart();

  const countEl = document.getElementById("d-orders");
  if (countEl) countEl.textContent = orders.length;

  const list = document.getElementById("tx-list");
  if (!list) return;

  if (orders.length === 0) {
    list.innerHTML =
      `<div class="tx-row"><div class="tx-left">` +
      `<div class="tx-dot" style="background:var(--text-dim)"></div>` +
      `<div class="tx-info"><span class="tx-type" style="color:var(--text-dim)">No open DCA orders</span>` +
      `<span class="tx-time">Launch an orbit to get started</span></div></div></div>`;
    return;
  }

  list.innerHTML = orders.map(renderDCARow).join("");
}

function renderDCARow(order) {
  const a       = order.account;
  const pubkey  = order.publicKey.toBase58 ? order.publicKey.toBase58() : order.publicKey;
  const perCycle  = a.inAmountPerCycle.toNumber() / 1e6;
  const deposited = a.inDeposited.toNumber()      / 1e6;
  const used      = a.inUsed.toNumber()           / 1e6;
  const received  = a.outReceived.toNumber()      / 1e9;
  const remaining = Math.max(0, deposited - used);

  const secsLeft  = a.nextCycleAt.toNumber() - Math.floor(Date.now() / 1000);
  const nextLabel = secsLeft <= 0     ? "Next buy: imminent"
                  : secsLeft < 3_600  ? `Next buy: ${Math.round(secsLeft / 60)}m`
                  : secsLeft < 86_400 ? `Next buy: ${Math.round(secsLeft / 3_600)}h`
                  :                     `Next buy: ${Math.round(secsLeft / 86_400)}d`;

  const color = "var(--sol-green)";
  return (
    `<div class="tx-row">` +
      `<div class="tx-left">` +
        `<div class="tx-dot" style="background:${color}"></div>` +
        `<div class="tx-info">` +
          `<span class="tx-type">DCA Active · ${perCycle.toFixed(2)} USDC/cycle</span>` +
          `<span class="tx-time">${nextLabel} · ${remaining.toFixed(2)} USDC left</span>` +
        `</div>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:10px">` +
        `<span class="tx-amount" style="color:${color}">+${received.toFixed(4)} SOL</span>` +
        `<button class="close-dca-btn" onclick="window.closeOrder('${pubkey}')" title="Close order and recover USDC">✕ Withdraw</button>` +
      `</div>` +
    `</div>`
  );
}

// ── Close DCA order ───────────────────────────────────────────────────────────
window.closeOrder = async (pubkey) => {
  const confirmed = window.confirm(
    "Close this DCA order and return remaining USDC to your wallet?"
  );
  if (!confirmed) return;

  const btn = [...document.querySelectorAll(".close-dca-btn")]
    .find((el) => el.getAttribute("onclick").includes(pubkey));
  if (btn) { btn.textContent = "Closing..."; btn.disabled = true; }

  try {
    const sig = await closeDCA(pubkey);
    console.log("[closeDCA] sig:", sig);
    await refreshDCAOrders();
    fetchWalletBalances();
  } catch (err) {
    console.error("[closeDCA] failed:", err);
    alert("Failed to close order: " + err.message);
    if (btn) { btn.textContent = "✕ Withdraw"; btn.disabled = false; }
  }
};

// ── JLP APY display ──────────────────────────────────────────────────────────
async function loadJLPApy() {
  const apy = await getJLPApy();
  const desc = document.querySelector(".jlp-desc");
  if (desc) desc.textContent = `Park USDC in JLP during waning phase · APY: ${apy}`;
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  tryAutoConnect().then(async () => {
    await refreshDCAOrders();
    if (typeof drawChart === "function") {
      setTimeout(drawChart, 500);
    }
  });
  loadJLPApy();
  setInterval(fetchWalletBalances, 30_000);
  setInterval(refreshDCAOrders, 30_000);
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function setBtn(btn, text, opacity, bg = "", shadow = "") {
  btn.textContent = text;
  btn.style.opacity = opacity;
  if (bg) btn.style.background = bg;
  if (shadow) btn.style.boxShadow = shadow;
}

function resetBtn(btn, delay) {
  const reset = () => {
    btn.textContent = "◎ LAUNCH DCA ORBIT";
    btn.style.opacity = "1";
    btn.style.background = "";
    btn.style.boxShadow = "";
  };
  if (delay > 0) setTimeout(reset, delay);
  else reset();
}
