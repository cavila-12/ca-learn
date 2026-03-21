import { ThemeColors } from "./constants.js";

export function syncThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;

  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const apply = () => {
    const isDark = mq ? mq.matches : false;
    meta.setAttribute("content", isDark ? ThemeColors.dark : ThemeColors.light);
  };

  apply();
  if (!mq) return;

  if (typeof mq.addEventListener === "function") mq.addEventListener("change", apply);
  else if (typeof mq.addListener === "function") mq.addListener(apply);
}

