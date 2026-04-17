import { connectWallet, tryAutoConnect, walletPublicKey } from "./wallet.js";
import { launchDCAOrder } from "./dca.js";
import { swapUSDCtoJLP, getJLPApy } from "./jlp.js";

// ── Wallet ──────────────────────────────────────────────────────────────────
window.connectWallet = connectWallet;

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
  } catch (err) {
    resetBtn(btn, 0);
    console.error("[DCA mid-cycle] failed:", err);
    alert("DCA failed: " + err.message);
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
  tryAutoConnect();
  loadJLPApy();
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
