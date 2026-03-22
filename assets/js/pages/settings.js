import { $, toast } from "../core/dom.js";
import { APP_VERSION } from "../core/constants.js";
import { StorageKeys } from "../core/constants.js";
import { checkForServiceWorkerUpdate, applyServiceWorkerUpdate, getServiceWorkerRegistration } from "../core/pwa.js";

async function refreshSwStatus() {
  const el = $("#swStatus");
  if (!el) return;

  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg) {
      el.textContent = "not registered";
      return;
    }
    if (reg.waiting) el.textContent = "update ready";
    else if (reg.installing) el.textContent = "installing";
    else if (reg.active) el.textContent = "active";
    else el.textContent = "registered";
  } catch {
    el.textContent = "error";
  }
}

async function resetOfflineCache() {
  if (!confirm("Clear offline cache and unregister the service worker? The app will reload.")) return;

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}

  try {
    const reg = await getServiceWorkerRegistration();
    if (reg) await reg.unregister();
  } catch {}

  toast("Offline cache cleared. Reloading?");
  location.reload();
}



function ensureSwProgressUi() {
  const updatesCard = Array.from(document.querySelectorAll(".card")).find((c) => c.querySelector("#checkUpdatesBtn"));
  if (!updatesCard) return null;
  if (!document.querySelector("style[data-sw-progress=\'1\']")) {
    const st = document.createElement("style");
    st.setAttribute("data-sw-progress", "1");
    st.textContent = `
.swprogress{margin-top:10px}
.swprogress__row{display:flex;align-items:center;gap:10px}
.swprogress__bar{flex:1;height:10px;border-radius:999px;background:var(--surface3);border:1px solid var(--line);overflow:hidden}
.swprogress__fill{height:100%;width:0%;background:var(--accent);transition:width .12s linear}
.swprogress__pct{min-width:48px;text-align:right;font-variant-numeric:tabular-nums}
`;
    document.head.appendChild(st);
  }
  let wrap = document.querySelector("#swProgress");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "swProgress";
    wrap.className = "swprogress";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="muted small" id="swProgressLabel">Downloading offline resources?</div>
      <div class="swprogress__row" style="margin-top:6px">
        <div class="swprogress__bar" aria-label="Service worker download progress">
          <div class="swprogress__fill" id="swProgressFill"></div>
        </div>
        <div class="muted small swprogress__pct" id="swProgressPct">0%</div>
      </div>
    `;
    const statusEl = updatesCard.querySelector("#updateStatus");
    if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(wrap, statusEl.nextSibling);
    else updatesCard.appendChild(wrap);
  }
  return {
    wrap,
    label: document.querySelector("#swProgressLabel"),
    fill: document.querySelector("#swProgressFill"),
    pct: document.querySelector("#swProgressPct")
  };
}


async function pollSwCacheProgress({ showWhenFound = true } = {}) {
  try {
    if (typeof caches === "undefined") return null;
    const cache = await caches.open("cele-reviewer-progress");
    const res = await cache.match("./__sw_progress.json");
    if (!res) return null;
    const data = await res.json();
    if (showWhenFound && data && typeof data.total === "number") return data;
    return data;
  } catch {
    return null;
  }
}

export function initSettingsPage() {
  const v = $("#appVersion");
  const progressUi = ensureSwProgressUi();
  let lastTotal = 0;
  let hideTimer = null;
  let progressPollTimer = null;
  function showProgress(done, total, label) {
    if (!progressUi) return;
    progressUi.wrap.hidden = false;
    if (progressUi.label && label) progressUi.label.textContent = label;
    const pct = total ? Math.round((done / total) * 100) : 0;
    if (progressUi.fill) progressUi.fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (progressUi.pct) progressUi.pct.textContent = `${pct}%`;
  }
  function hideProgressSoon() {
    if (!progressUi) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      progressUi.wrap.hidden = true;
    }, 2500);
  }

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event?.data || {};
      if (data.type === "SW_CACHE_START") {
        lastTotal = Number(data.total) || 0;
        showProgress(0, lastTotal, "Downloading offline resources?");
      }
      if (data.type === "SW_CACHE_PROGRESS") {
        const total = Number(data.total) || lastTotal || 0;
        const done = Number(data.done) || 0;
        lastTotal = total;
        showProgress(done, total, data.label || "Downloading offline resources?");
      }
      if (data.type === "SW_CACHE_DONE") {
        const total = Number(data.total) || lastTotal || 0;
        showProgress(total, total, "Offline resources ready.");
        hideProgressSoon();
      }
    });
  }

  // Poll cached SW progress so the bar works even if messages were missed.
  if (progressUi && typeof caches !== "undefined") {
    const tick = async () => {
      const data = await pollSwCacheProgress();
      if (!data) return;
      const total = Number(data.total) || 0;
      const done = Number(data.done) || 0;
      if (data.state === "done") {
        showProgress(total, total, "Offline resources ready.");
        hideProgressSoon();
      } else if (total) {
        showProgress(done, total, "Downloading offline resources?");
      }
    };

    tick();
    progressPollTimer = setInterval(tick, 350);
    window.addEventListener("beforeunload", () => {
      try { if (progressPollTimer) clearInterval(progressPollTimer); } catch {}
    });
  }

  if (v) v.textContent = APP_VERSION;
  refreshSwStatus();

  const status = $("#updateStatus");
  const applyBtn = $("#applyUpdateBtn");

  const checkBtn = $("#checkUpdatesBtn");
  if (checkBtn) {
    checkBtn.addEventListener("click", async () => {
      if (status) status.textContent = "Checking…";
      const res = await checkForServiceWorkerUpdate();
      await refreshSwStatus();

      if (!res.supported) {
        if (status) status.textContent = "Service worker not supported in this browser.";
        if (applyBtn) applyBtn.hidden = true;
        return;
      }

      if (!res.ok) {
        if (status) status.textContent = "Update check failed. Try reloading.";
        return;
      }

      if (res.hasUpdate) {
        if (status) status.textContent = "Update available.";
        if (applyBtn) applyBtn.hidden = false;
      } else {
        if (status) status.textContent = "No update found.";
        if (applyBtn) applyBtn.hidden = true;
      }
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      if (status) status.textContent = "Applying update…";
      const res = await applyServiceWorkerUpdate({ reload: true });
      if (!res.applied) {
        if (status) status.textContent = "No waiting update to apply.";
        toast("No update ready to apply.");
      }
    });
  }

  const reloadBtn = $("#reloadBtn");
  if (reloadBtn) reloadBtn.addEventListener("click", () => location.reload());

  const updateToolbar = reloadBtn ? reloadBtn.closest(".toolbar") : null;
  if (updateToolbar && !$("#resetCacheBtn")) {
    const btn = document.createElement("button");
    btn.className = "danger";
    btn.id = "resetCacheBtn";
    btn.textContent = "Reset offline cache";
    btn.addEventListener("click", () => resetOfflineCache());
    updateToolbar.appendChild(btn);
  }

  const resetBtn = $("#resetDataBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Reset local data? This clears your saved decks and quiz session.")) return;

      try {
        localStorage.removeItem(StorageKeys.decks);
        localStorage.removeItem(StorageKeys.session);
        localStorage.removeItem(StorageKeys.defaultsLoaded);
      } catch {}

      toast("Local data cleared.");
      location.reload();
    });
  }
}
