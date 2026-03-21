import { toast } from "./dom.js";

export function wrapDisplayMath(s) {
  const t = String(s || "").trim();
  if (!t) return "";

  // If already wrapped, return as-is. (Injected via textContent later.)
  if (t.includes("\\[") || t.includes("\\]") || t.includes("\\(") || t.includes("\\)") || /\$.*\$/s.test(t)) {
    return t;
  }

  return `\\[${t}\\]`;
}

export function wrapInlineMath(s) {
  const t = String(s || "").trim();
  if (!t) return "";

  // If already wrapped, return as-is. (Injected via textContent later.)
  if (t.includes("\\[") || t.includes("\\]") || t.includes("\\(") || t.includes("\\)") || /\$.*\$/s.test(t)) {
    return t;
  }

  return `\\(${t}\\)`;
}
const pendingMathTypesetRoots = new Set();
let mathJaxLoadPoller = null;

function hydrateMath(root) {
  const nodes = root.querySelectorAll ? root.querySelectorAll(".js-math[data-math]") : [];
  for (const el of nodes) {
    const enc = el.getAttribute("data-math") || "";
    try {
      el.textContent = decodeURIComponent(enc);
    } catch {
      el.textContent = enc;
    }
  }
}

function tryTypesetPendingMath() {
  const mj = window.MathJax;
  if (!mj || typeof mj.typesetPromise !== "function") return false;

  const roots = Array.from(pendingMathTypesetRoots);
  pendingMathTypesetRoots.clear();

  if (typeof mj.typesetClear === "function") mj.typesetClear(roots);
  mj.typesetPromise(roots).catch(() => {});
  return true;
}

export function typesetMath(root) {
  if (!root) return;

  hydrateMath(root);

  pendingMathTypesetRoots.add(root);
  if (tryTypesetPendingMath()) return;

  if (mathJaxLoadPoller) return;
  let tries = 0;
  mathJaxLoadPoller = window.setInterval(() => {
    tries++;
    const ok = tryTypesetPendingMath();
    if (ok || tries >= 50) {
      window.clearInterval(mathJaxLoadPoller);
      mathJaxLoadPoller = null;
      if (!ok) {
        pendingMathTypesetRoots.clear();
        console.warn("MathJax did not finish loading; formulas will remain as text.");
        toast("MathJax not loaded (check internet/CDN).", 2600);
      }
    }
  }, 100);
}


