import { $ } from "../core/dom.js";

export function openDrawer() {
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  backdrop.hidden = false;
}

export function closeDrawer() {
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
}

export function wireDrawerUI() {
  const menuBtn = $("#menuBtn");
  const closeBtn = $("#closeDrawerBtn");
  const backdrop = $("#backdrop");
  if (menuBtn) menuBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

