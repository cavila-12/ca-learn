import { escapeHtml } from "./dom.js";

function resolveRelative(basePath, href) {
  const h = String(href || "").trim();
  if (!h) return h;
  if (/^(https?:)?\/\//i.test(h)) return h;
  // Treat leading "/" as app-root relative (works on GitHub Pages subpaths like /repo/)
  if (h.startsWith("/")) {
    const appRoot = new URL(".", location.href);
    return new URL(h.slice(1), appRoot).toString();
  }
  const base = new URL(basePath, location.href);
  return new URL(h, base).toString();
}

let mdItInstance = null;
let mdItLoadPromise = null;

function loadScriptOnce(src) {
  const existing = document.querySelector(`script[data-src="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === "1") return Promise.resolve();
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Script load failed")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.defer = true;
    el.dataset.src = src;
    el.addEventListener("load", () => { el.dataset.loaded = "1"; resolve(); }, { once: true });
    el.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(el);
  });
}

async function ensureMarkdownIt() {
  if (typeof document === "undefined") return null;
  if (mdItInstance) return mdItInstance;
  if (mdItLoadPromise) return mdItLoadPromise;

  mdItLoadPromise = (async () => {
    // Local vendor file (cached by SW after first load)
    await loadScriptOnce("./libraries/markdown-it.min.js");
    const markdownit = window.markdownit;
    if (typeof markdownit !== "function") throw new Error("markdown-it not available");

    const md = markdownit({
      html: false,
      linkify: true,
      breaks: false
    });

    const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, i, opts, env, self) => self.renderToken(tokens, i, opts));
    md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
      const token = tokens[i];
      const href = token.attrGet("href");
      if (href) token.attrSet("href", resolveRelative(env?.basePath || "./", href));
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
      return defaultLinkOpen(tokens, i, opts, env, self);
    };

    const defaultImage = md.renderer.rules.image || ((tokens, i, opts, env, self) => self.renderToken(tokens, i, opts));
    md.renderer.rules.image = (tokens, i, opts, env, self) => {
      const token = tokens[i];
      const src = token.attrGet("src");
      if (src) token.attrSet("src", resolveRelative(env?.basePath || "./", src));
      token.attrSet("loading", "lazy");
      token.attrSet("decoding", "async");
      return defaultImage(tokens, i, opts, env, self);
    };

    mdItInstance = md;
    return mdItInstance;
  })().catch((e) => {
    console.warn("markdown-it load failed; falling back to simple parser", e);
    mdItLoadPromise = null;
    return null;
  });

  return mdItLoadPromise;
}

export async function markdownToHtml(md, basePath = "./modules/") {
  const engine = await ensureMarkdownIt();
  if (!engine) return simpleMarkdownToHtml(md, basePath);
  return engine.render(String(md ?? ""), { basePath });
}

export function simpleMarkdownToHtml(md, basePath = "./modules/") {
  const lines = String(md ?? "").replaceAll("\r\n", "\n").split("\n");
  let html = "";
  let inCode = false;
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html += "</ul>";
      listOpen = false;
    }
  };

  const inline = (s) => {
    let out = escapeHtml(s);
    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
      const resolved = resolveRelative(basePath, src);
      return `<img alt="${escapeHtml(alt)}" src="${escapeHtml(resolved)}" loading="lazy" decoding="async" />`;
    });
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
      const resolved = resolveRelative(basePath, href);
      return `<a href="${escapeHtml(resolved)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    });
    out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);
    out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${escapeHtml(b)}</strong>`);
    out = out.replace(/\*([^*]+)\*/g, (_m, i) => `<em>${escapeHtml(i)}</em>`);
    return out;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (!inCode) {
        closeList();
        inCode = true;
        html += "<pre><code>";
      } else {
        inCode = false;
        html += "</code></pre>";
      }
      continue;
    }

    if (inCode) {
      html += escapeHtml(line) + "\n";
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html += `<h${level}>${inline(h[2])}</h${level}>`;
      continue;
    }

    const li = line.match(/^\s*-\s+(.*)$/);
    if (li) {
      if (!listOpen) {
        closeList();
        listOpen = true;
        html += "<ul>";
      }
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }

    if (line.trim() === "") {
      closeList();
      continue;
    }

    closeList();
    html += `<p>${inline(line)}</p>`;
  }

  closeList();
  if (inCode) html += "</code></pre>";
  return html || '<p class="muted">(empty)</p>';
}

