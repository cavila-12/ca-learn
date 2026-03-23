import { $, $$, escapeHtml } from "../core/dom.js";
import { typesetMath } from "../core/mathjax.js";
import { markdownToHtml } from "../core/markdown.js";

function ensureModuleWrapStyles() {
  if (document.querySelector("style[data-module-wrap=\'1\']")) return;
  const st = document.createElement("style");
  st.setAttribute("data-module-wrap", "1");
  st.textContent = `
  /* Prevent long reference URLs from forcing horizontal scroll on mobile */
  .modulecontent, #moduleContent { overflow-wrap: anywhere; }
  .modulecontent p, .modulecontent li, #moduleContent p, #moduleContent li { overflow-wrap: anywhere; }
  .modulecontent a, #moduleContent a { overflow-wrap: anywhere; word-break: break-word; }
  .modulecontent code, #moduleContent code { word-break: break-word; }

  /* Tables (GFM) */
  .modulecontent table, #moduleContent table { width: 100%; border-collapse: collapse; }
  .modulecontent th, .modulecontent td, #moduleContent th, #moduleContent td { border: 1px solid var(--line); padding: 8px; vertical-align: top; }
  .modulecontent th, #moduleContent th { background: var(--surface2); }
  .modulecontent td, .modulecontent th, #moduleContent td, #moduleContent th { word-break: break-word; overflow-wrap: anywhere; }
  .modulecontent table, #moduleContent table { display:block; overflow-x:auto; -webkit-overflow-scrolling: touch; }
  `;
  document.head.appendChild(st);
}

async function loadModulesIndex() {
  try {
    const res = await fetch("./modules/index.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Missing modules/index.json");
    const json = await res.json();
    const modules = Array.isArray(json?.modules) ? json.modules : [];
    return modules;
  } catch {
    return [];
  }
}

export async function renderModulesList() {
  const modules = await loadModulesIndex();
  const root = $("#moduleList");
  if (!root) return;
  root.innerHTML = "";

  if (!modules.length) {
    root.innerHTML = `<div class="muted">No modules found. Add markdown files to <code>modules/</code> and update <code>modules/index.json</code>.</div>`;
    return;
  }

  for (const m of modules) {
    const el = document.createElement("div");
    el.className = "modulecard";
    el.setAttribute("data-file", m.file || "");
    el.innerHTML = `
      <div class="modulecard__title">${escapeHtml(m.title || "Untitled")}</div>
      <div class="modulecard__desc">${escapeHtml(m.description || "")}</div>
    `;
    root.appendChild(el);
  }
}

async function openModule(file, title) {
  if (!file) return;
  try {
    const res = await fetch(`./${file}`);
    if (!res.ok) throw new Error("Load failed");
    const md = await res.text();

    const listView = $("#modulesListView");
    const moduleView = $("#moduleView");
    if (listView) listView.hidden = true;
    if (moduleView) moduleView.hidden = false;

    const moduleTitle = $("#moduleTitle");
    const moduleContent = $("#moduleContent");
    if (moduleTitle) moduleTitle.textContent = title || file;
    if (moduleContent) {
      const base = `./${file}`;
      moduleContent.classList.remove("muted");
      moduleContent.innerHTML = await markdownToHtml(md, base);
      typesetMath(moduleContent);
    }
  } catch {
    const moduleTitle = $("#moduleTitle");
    const moduleContent = $("#moduleContent");
    if (moduleTitle) moduleTitle.textContent = "Error";
    if (moduleContent) {
      moduleContent.classList.add("muted");
      moduleContent.textContent = "Failed to load module.";
    }
  }
}

export function initModulesPage() {
  ensureModuleWrapStyles();
  renderModulesList();

  const modulesRefreshBtn = $("#modulesRefreshBtn");
  if (modulesRefreshBtn) modulesRefreshBtn.addEventListener("click", () => renderModulesList());

  const moduleList = $("#moduleList");
  if (moduleList) {
    moduleList.addEventListener("click", (e) => {
      const card = e.target.closest(".modulecard");
      if (!card) return;
      openModule(card.getAttribute("data-file"), $(".modulecard__title", card)?.textContent || "");
    });
  }

  const backToModulesBtn = $("#backToModulesBtn");
  if (backToModulesBtn) {
    backToModulesBtn.addEventListener("click", () => {
      const listView = $("#modulesListView");
      const moduleView = $("#moduleView");
      if (moduleView) moduleView.hidden = true;
      if (listView) listView.hidden = false;
      const moduleContent = $("#moduleContent");
      if (moduleContent) {
        moduleContent.classList.add("muted");
        moduleContent.textContent = "Select a module.";
      }
    });
  }
}

