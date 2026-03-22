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

