import { $, toast } from "./dom.js";

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    toast("Service worker registration failed.", 2200);
  }
}


export async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.getRegistration("./");
  } catch {
    return null;
  }
}

export async function checkForServiceWorkerUpdate() {
  const reg = await getServiceWorkerRegistration();
  if (!reg) return { ok: false, supported: false, hasUpdate: false };

  try {
    await reg.update();
    return { ok: true, supported: true, hasUpdate: Boolean(reg.waiting) };
  } catch {
    return { ok: false, supported: true, hasUpdate: Boolean(reg.waiting) };
  }
}

export async function applyServiceWorkerUpdate({ reload = true } = {}) {
  const reg = await getServiceWorkerRegistration();
  if (!reg || !reg.waiting) return { ok: false, applied: false };

  const waiting = reg.waiting;
  try {
    waiting.postMessage({ type: "SKIP_WAITING" });
  } catch {
    return { ok: false, applied: false };
  }

  if (!reload) return { ok: true, applied: true };

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
    window.setTimeout(finish, 1500);
  });

  location.reload();
  return { ok: true, applied: true };
}
export function wireInstallPrompt() {
  const installBtn = $("#installBtn");
  if (!installBtn) return;
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installBtn.hidden = true;
  });
}

export function setOnlineStatusTag() {
  const tag = $("#statusTag");
  if (!tag) return;
  const set = () => {
    tag.textContent = navigator.onLine ? "Online" : "Offline";
  };
  window.addEventListener("online", set);
  window.addEventListener("offline", set);
  set();
}


