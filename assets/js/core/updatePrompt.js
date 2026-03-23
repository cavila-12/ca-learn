import { toast } from "./dom.js";
import { applyServiceWorkerUpdate, getServiceWorkerRegistration } from "./pwa.js";

const UpdatePrompt = {
  id: "swUpdatePrompt",
  hideUntilKey: "sw_update_hide_until",
  hideMs: 30 * 60 * 1000
};

function ensureUpdatePromptStyles() {
  if (document.querySelector("style[data-updateprompt='1']")) return;
  const st = document.createElement("style");
  st.setAttribute("data-updateprompt", "1");
  st.textContent = `
.updateprompt{
  position: fixed;
  bottom: 62px;
  left: 50%;
  transform: translateX(-50%);
  width: min(520px, calc(100% - 24px));
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  padding: 12px 12px;
  background: var(--surface);
  border:1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--shadow);
  z-index: 55;
}
.updateprompt__title{ font-weight: 800; }
.updateprompt__actions{ display:flex; gap:8px; flex-shrink:0; }
.updateprompt__btn{ padding: 10px 12px; }
@media (max-width: 420px){
  .updateprompt{ flex-direction: column; align-items: stretch; }
  .updateprompt__actions{ justify-content: flex-end; }
}
`;
  document.head.appendChild(st);
}

function shouldShowUpdatePrompt() {
  if (!navigator.onLine) return false;
  try {
    const until = Number(sessionStorage.getItem(UpdatePrompt.hideUntilKey) || "0");
    if (until && Date.now() < until) return false;
  } catch {}
  return !document.getElementById(UpdatePrompt.id);
}

function hideUpdatePrompt({ snooze = false } = {}) {
  const el = document.getElementById(UpdatePrompt.id);
  if (el) el.remove();
  if (snooze) {
    try {
      sessionStorage.setItem(UpdatePrompt.hideUntilKey, String(Date.now() + UpdatePrompt.hideMs));
    } catch {}
  }
}

function showUpdatePrompt() {
  ensureUpdatePromptStyles();
  if (!shouldShowUpdatePrompt()) return null;

  const el = document.createElement("div");
  el.id = UpdatePrompt.id;
  el.className = "updateprompt";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Update available");
  el.innerHTML = `
    <div class="updateprompt__msg">
      <div class="updateprompt__title">Update available</div>
      <div class="updateprompt__body muted small">A new version is ready. Refresh to apply.</div>
    </div>
    <div class="updateprompt__actions">
      <button class="primary updateprompt__btn" type="button" data-act="update">Update</button>
      <button class="ghost updateprompt__btn" type="button" data-act="later">Later</button>
    </div>
  `;
  document.body.appendChild(el);

  const updateBtn = el.querySelector("[data-act='update']");
  const laterBtn = el.querySelector("[data-act='later']");

  if (updateBtn) {
    updateBtn.addEventListener("click", async () => {
      const res = await applyServiceWorkerUpdate({ reload: true });
      if (!res.applied) {
        toast("Update is not ready yet.");
        hideUpdatePrompt({ snooze: true });
      }
    });
  }

  if (laterBtn) laterBtn.addEventListener("click", () => hideUpdatePrompt({ snooze: true }));

  return el;
}

async function wireWithRegistration(reg) {
  if (!reg) return;

  if (reg.waiting) showUpdatePrompt();

  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state !== "installed") return;
      if (navigator.serviceWorker.controller) showUpdatePrompt();
    });
  });

  const maybeUpdateCheck = async () => {
    if (!navigator.onLine) return;
    try {
      await reg.update();
    } catch {}
    if (reg.waiting) showUpdatePrompt();
  };

  window.addEventListener("online", maybeUpdateCheck);

  const timer = window.setInterval(maybeUpdateCheck, 10 * 60 * 1000);
  window.addEventListener("beforeunload", () => {
    try {
      window.clearInterval(timer);
    } catch {}
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => hideUpdatePrompt(), { once: true });

  maybeUpdateCheck();
}

export function wireSwUpdatePrompt() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then(async () => wireWithRegistration(await getServiceWorkerRegistration()))
    .catch(async () => wireWithRegistration(await getServiceWorkerRegistration()));
}
