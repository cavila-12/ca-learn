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

export function initSettingsPage() {
  const v = $("#appVersion");
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
