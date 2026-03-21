const APP_VERSION = "1.0.0";

const StorageKeys = {
  decks: "celeReviewer.decks.v1",
  session: "celeReviewer.session.v1",
  defaultsLoaded: "celeReviewer.defaultsLoaded.v1"
};

const CardType = {
  MCQ: "MCQ",
  FLASHCARD: "FLASHCARD",
  FORMULA: "FORMULA"
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ThemeColors = {
  light: "#f7f7f8",
  dark: "#0b1220"
};


function fixLatexEscapes(text) {
  const t = String(text ?? "");
  if (!t.includes("\\\\")) return t;

  // Accept mistakenly "escaped" LaTeX like "\\sigma" from CSV/plain text.
  // Convert only when it looks like the start of a command/delimiter.
  return t.replace(/\\\\(?=[A-Za-z[\]{}()_%^$,.:;=+\-*/|])/g, "\\");
}

function syncThemeColorMeta() {
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

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function toast(message, ms = 1800) {
  const tpl = $("#toastTpl");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), ms);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -----------------------------
// CSV parsing (supports quotes, commas, newlines)
// -----------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      cell = "";
      if (row.some((c) => String(c).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  if (row.some((c) => String(c).trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}

function normalizeCsvRowsToCards(rows) {
  if (rows.length === 0) return { cards: [], warnings: ["CSV is empty."] };

  const first = rows[0].map((c) => c.toUpperCase());
  const headerish =
    first.includes("TYPE") &&
    (first.includes("QUESTION") || first.includes("FORMULA") || first.includes("ANSWER"));
  const data = headerish ? rows.slice(1) : rows;

  const cards = [];
  const warnings = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const line = i + 1 + (headerish ? 1 : 0);
    const typeRaw = (r[0] || "").toUpperCase();
    if (!typeRaw) {
      warnings.push(`Line ${line}: Missing Type; skipped.`);
      continue;
    }
    if (![CardType.MCQ, CardType.FLASHCARD, CardType.FORMULA].includes(typeRaw)) {
      warnings.push(`Line ${line}: Unknown Type "${r[0]}"; skipped.`);
      continue;
    }

    if (typeRaw === CardType.MCQ) {
      const question = fixLatexEscapes(r[1] || "");
      const choices = [r[2], r[3], r[4], r[5]].map((c) => fixLatexEscapes((c || "").trim()));
      const answer = (r[6] || "").trim();
      if (!question) {
        warnings.push(`Line ${line}: MCQ missing Question; skipped.`);
        continue;
      }
      if (choices.some((c) => !c)) {
        warnings.push(`Line ${line}: MCQ missing one or more choices; skipped.`);
        continue;
      }
      if (!answer) {
        warnings.push(`Line ${line}: MCQ missing Answer; skipped.`);
        continue;
      }
      if (!choices.includes(answer)) {
        warnings.push(`Line ${line}: MCQ Answer does not match any choice; skipped.`);
        continue;
      }
      cards.push({ id: uid("c"), type: CardType.MCQ, question, choices, answer });
      continue;
    }

    if (typeRaw === CardType.FLASHCARD) {
      const question = fixLatexEscapes(r[1] || "");
      const answer = fixLatexEscapes((r[2] || r[6] || "").trim());
      if (!question || !answer) {
        warnings.push(`Line ${line}: FLASHCARD missing Question/Answer; skipped.`);
        continue;
      }
      cards.push({ id: uid("c"), type: CardType.FLASHCARD, front: question, back: answer });
      continue;
    }

    if (typeRaw === CardType.FORMULA) {
      const name = fixLatexEscapes(r[1] || "");
      const formula = fixLatexEscapes((r[2] || r[6] || "").trim());
      const defsText = fixLatexEscapes((r[3] || r[7] || "").trim());
      const defs = defsText
        ? defsText
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      if (!name || !formula) {
        warnings.push(`Line ${line}: FORMULA missing Name/Formula; skipped.`);
        continue;
      }
      cards.push({ id: uid("c"), type: CardType.FORMULA, name, formula, defs });
      continue;
    }
  }

  if (cards.length === 0 && warnings.length === 0) warnings.push("No valid rows found.");
  return { cards, warnings };
}

function cardsToCsv(cards) {
  const header = ["Type", "Question/Name", "Choice1", "Choice2", "Choice3", "Choice4", "Answer/Formula", "OptionalDefs"];
  const rows = [header];

  for (const c of cards) {
    if (c.type === CardType.MCQ) {
      rows.push([c.type, c.question, c.choices[0], c.choices[1], c.choices[2], c.choices[3], c.answer, ""]);
    } else if (c.type === CardType.FLASHCARD) {
      rows.push([c.type, c.front, "", "", "", "", c.back, ""]);
    } else if (c.type === CardType.FORMULA) {
      rows.push([c.type, c.name, "", "", "", "", c.formula, (c.defs || []).join("; ")]);
    }
  }

  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
          return s;
        })
        .join(",")
    )
    .join("\n");
}

// -----------------------------
// Storage
// -----------------------------
function loadDecks() {
  const raw = localStorage.getItem(StorageKeys.decks);
  const decks = safeJsonParse(raw ?? "[]", []);
  if (!Array.isArray(decks)) return [];

  let changed = false;
  for (const d of decks) {
    if (!d || typeof d !== "object") continue;
    if (!Array.isArray(d.cards)) continue;

    for (const c of d.cards) {
      if (!c || typeof c !== "object") continue;

      if (c.type === CardType.MCQ) {
        const q = fixLatexEscapes(c.question ?? "");
        if (q !== c.question) {
          c.question = q;
          changed = true;
        }
        if (Array.isArray(c.choices)) {
          const next = c.choices.map((x) => fixLatexEscapes(x ?? ""));
          for (let i = 0; i < next.length; i++) {
            if (next[i] !== c.choices[i]) {
              c.choices = next;
              changed = true;
              break;
            }
          }
        }
        const a = fixLatexEscapes(c.answer ?? "");
        if (a !== c.answer) {
          c.answer = a;
          changed = true;
        }
      } else if (c.type === CardType.FLASHCARD) {
        const front = fixLatexEscapes(c.front ?? "");
        const back = fixLatexEscapes(c.back ?? "");
        if (front !== c.front) {
          c.front = front;
          changed = true;
        }
        if (back !== c.back) {
          c.back = back;
          changed = true;
        }
      } else if (c.type === CardType.FORMULA) {
        const name = fixLatexEscapes(c.name ?? "");
        const formula = fixLatexEscapes(c.formula ?? "");
        if (name !== c.name) {
          c.name = name;
          changed = true;
        }
        if (formula !== c.formula) {
          c.formula = formula;
          changed = true;
        }
        if (Array.isArray(c.defs)) {
          const nextDefs = c.defs.map((x) => fixLatexEscapes(x ?? ""));
          for (let i = 0; i < nextDefs.length; i++) {
            if (nextDefs[i] !== c.defs[i]) {
              c.defs = nextDefs;
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  if (changed) saveDecks(decks);
  return decks;
}

function saveDecks(decks) {
  localStorage.setItem(StorageKeys.decks, JSON.stringify(decks));
}

function upsertDeck(deck) {
  const decks = loadDecks();
  const idx = decks.findIndex((d) => d.id === deck.id);
  if (idx === -1) decks.push(deck);
  else decks[idx] = deck;
  saveDecks(decks);
}

function deleteDeck(deckId) {
  const decks = loadDecks().filter((d) => d.id !== deckId);
  saveDecks(decks);
}

function loadSession() {
  const raw = localStorage.getItem(StorageKeys.session);
  const s = safeJsonParse(raw ?? "null", null);
  return s && typeof s === "object" ? s : null;
}

function saveSession(session) {
  localStorage.setItem(StorageKeys.session, JSON.stringify(session));
}

// -----------------------------
// Defaults loader (from data/decks)
// -----------------------------
async function loadDefaultDecksIfNeeded() {
  const already = localStorage.getItem(StorageKeys.defaultsLoaded) === "1";
  if (already) return;

  try {
    const indexRes = await fetch("./data/decks/index.json", { cache: "no-store" });
    if (!indexRes.ok) throw new Error("Missing data/decks/index.json");
    const index = await indexRes.json();
    const files = Array.isArray(index?.files) ? index.files : [];
    const decks = [];

    for (const item of files) {
      const deckName = item?.name ?? "Default deck";
      const path = item?.path;
      if (!path) continue;
      const csvRes = await fetch(`./${path}`);
      if (!csvRes.ok) continue;
      const csvText = await csvRes.text();
      const rows = parseCsv(csvText);
      const { cards } = normalizeCsvRowsToCards(rows);
      if (cards.length === 0) continue;
      decks.push({
        id: uid("d"),
        name: deckName,
        cards,
        source: "default",
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }

    const existing = loadDecks();
    if (existing.length === 0 && decks.length > 0) {
      saveDecks(decks);
      toast(`Loaded ${decks.length} default deck(s).`);
    }
    localStorage.setItem(StorageKeys.defaultsLoaded, "1");
  } catch {
    // If first load is offline, keep this unset so we can retry later.
  }
}

// -----------------------------
// Drawer / Page helpers
// -----------------------------
function page() {
  return document.body?.dataset?.page || "home";
}

function openDrawer() {
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  backdrop.hidden = false;
}
function closeDrawer() {
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");
  if (!drawer || !backdrop) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
}

// -----------------------------
// Decks UI
// -----------------------------
let activeDeckId = null;
let pendingImportCards = [];

function deckTypeCounts(deck) {
  const counts = { MCQ: 0, FLASHCARD: 0, FORMULA: 0 };
  for (const c of deck.cards || []) {
    if (c?.type && counts[c.type] !== undefined) counts[c.type] += 1;
  }
  return counts;
}

function deckMetaLine(deck) {
  const counts = deckTypeCounts(deck);
  const parts = [];
  if (counts.MCQ) parts.push(`MCQ ${counts.MCQ}`);
  if (counts.FLASHCARD) parts.push(`FLASH ${counts.FLASHCARD}`);
  if (counts.FORMULA) parts.push(`FORMULA ${counts.FORMULA}`);
  const typeText = parts.length ? parts.join(" • ") : "No cards yet";
  return `${(deck.cards?.length ?? 0)} cards • ${typeText}`;
}

function renderDeckList() {
  const root = $("#deckList");
  if (!root) return;
  const decks = loadDecks()
    .slice()
    .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""))
    .reverse();
  root.innerHTML = "";

  if (decks.length === 0) {
    root.innerHTML = `<div class="muted">No decks yet. Create one with "New deck".</div>`;
    return;
  }

  for (const d of decks) {
    const el = document.createElement("div");
    el.className = "deckrow";
    el.innerHTML = `
      <div class="deckrow__left">
        <div class="deckrow__title">${escapeHtml(d.name || "Untitled")}</div>
        <div class="deckrow__meta">${escapeHtml(deckMetaLine(d))}</div>
      </div>
      <div class="deckrow__actions">
        <button class="secondary" data-action="open" data-id="${d.id}">Open</button>
      </div>
    `;
    root.appendChild(el);
  }
}

function currentDeck() {
  const decks = loadDecks();
  return decks.find((d) => d.id === activeDeckId) || null;
}

function showDeckEditor(deckId) {
  const decks = loadDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return;

  activeDeckId = deckId;
  pendingImportCards = [];

  const listView = $("#decksListView");
  const editView = $("#deckEditView");
  if (listView) listView.hidden = true;
  if (editView) editView.hidden = false;

  $("#deckEditorTitle").textContent = deck.name || "Untitled";
  $("#deckNameInput").value = deck.name || "";

  clearCardForm();
  setCardTypeForm($("#cardTypeSelect").value);
  renderCardList(deck);
  $("#importCsvBtn").disabled = true;
}

function renderCardList(deck) {
  const root = $("#cardList");
  root.innerHTML = "";
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  if (cards.length === 0) {
    root.innerHTML = `<div class="muted">No cards yet.</div>`;
    return;
  }

  for (const c of cards) {
    const el = document.createElement("div");
    el.className = "carditem";
    const badgeClass =
      c.type === CardType.MCQ ? "badge--mcq" : c.type === CardType.FLASHCARD ? "badge--flash" : "badge--formula";
    const title = c.type === CardType.MCQ ? c.question : c.type === CardType.FLASHCARD ? c.front : c.name;
    const body =
      c.type === CardType.MCQ
        ? `Answer: ${c.answer}`
        : c.type === CardType.FLASHCARD
          ? `Back: ${c.back}`
          : `Formula: ${c.formula}${(c.defs || []).length ? `\nDefs: ${(c.defs || []).join("; ")}` : ""}`;
    el.innerHTML = `
      <div class="badge ${badgeClass}">${escapeHtml(c.type)}</div>
      <div class="carditem__title">${escapeHtml(title || "(empty)")}</div>
      <div class="carditem__body">${escapeHtml(body || "")}</div>
      <div class="carditem__actions">
        <button class="secondary" data-action="edit" data-id="${c.id}">Edit</button>
        <button class="danger" data-action="delete" data-id="${c.id}">Delete</button>
      </div>
    `;
    root.appendChild(el);
  }
}

function clearCardForm() {
  $("#editCardId").value = "";
  $("#cardSaveBtn").textContent = "Add card";
  $("#cardCancelBtn").hidden = true;
  $("#mcqQuestion").value = "";
  $("#mcqC1").value = "";
  $("#mcqC2").value = "";
  $("#mcqC3").value = "";
  $("#mcqC4").value = "";
  $("#mcqAnswer").value = "";
  $("#fcFront").value = "";
  $("#fcBack").value = "";
  $("#fmName").value = "";
  $("#fmFormula").value = "";
  $("#fmExplain").value = "";
}

function setCardTypeForm(type) {
  for (const el of $$(".cardform__type")) el.hidden = el.dataset.type !== type;
}

function validateCardFromForm(type) {
  if (type === CardType.MCQ) {
    const question = $("#mcqQuestion").value.trim();
    const choices = [$("#mcqC1").value, $("#mcqC2").value, $("#mcqC3").value, $("#mcqC4").value].map((v) => v.trim());
    const answer = $("#mcqAnswer").value.trim();
    if (!question) return { ok: false, message: "MCQ needs a question." };
    if (choices.some((c) => !c)) return { ok: false, message: "MCQ needs 4 choices." };
    if (!answer) return { ok: false, message: "MCQ needs an answer." };
    if (!choices.includes(answer)) return { ok: false, message: "Answer must match one of the choices exactly." };
    return { ok: true, card: { type, question, choices, answer } };
  }

  if (type === CardType.FLASHCARD) {
    const front = $("#fcFront").value.trim();
    const back = $("#fcBack").value.trim();
    if (!front || !back) return { ok: false, message: "Flashcard needs front and back." };
    return { ok: true, card: { type, front, back } };
  }

  if (type === CardType.FORMULA) {
    const name = $("#fmName").value.trim();
    const formula = $("#fmFormula").value.trim();
    const defsText = $("#fmExplain").value.trim();
    const defs = defsText
      ? defsText
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (!name || !formula) return { ok: false, message: "Formula card needs name and formula." };
    return { ok: true, card: { type, name, formula, defs } };
  }

  return { ok: false, message: "Unknown card type." };
}

function startEditCard(cardId) {
  const deck = currentDeck();
  if (!deck) return;
  const c = (deck.cards || []).find((x) => x.id === cardId);
  if (!c) return;

  $("#editCardId").value = c.id;
  $("#cardTypeSelect").value = c.type;
  setCardTypeForm(c.type);
  $("#cardSaveBtn").textContent = "Save changes";
  $("#cardCancelBtn").hidden = false;

  if (c.type === CardType.MCQ) {
    $("#mcqQuestion").value = c.question || "";
    $("#mcqC1").value = c.choices?.[0] || "";
    $("#mcqC2").value = c.choices?.[1] || "";
    $("#mcqC3").value = c.choices?.[2] || "";
    $("#mcqC4").value = c.choices?.[3] || "";
    $("#mcqAnswer").value = c.answer || "";
  } else if (c.type === CardType.FLASHCARD) {
    $("#fcFront").value = c.front || "";
    $("#fcBack").value = c.back || "";
  } else if (c.type === CardType.FORMULA) {
    $("#fmName").value = c.name || "";
    $("#fmFormula").value = c.formula || "";
    $("#fmExplain").value = (c.defs || []).join("; ");
  }
}

function removeCard(cardId) {
  const deck = currentDeck();
  if (!deck) return;
  deck.cards = (deck.cards || []).filter((c) => c.id !== cardId);
  deck.updatedAt = nowIso();
  upsertDeck(deck);
  renderCardList(deck);
  renderDeckList();
  renderQuizDeckList();
}

function updateDeckName(name) {
  const deck = currentDeck();
  if (!deck) return;
  deck.name = name.trim() || "Untitled";
  deck.updatedAt = nowIso();
  upsertDeck(deck);
  $("#deckEditorTitle").textContent = deck.name;
  renderDeckList();
  renderQuizDeckList();
}

function createNewDeck() {
  const deck = {
    id: uid("d"),
    name: "New deck",
    cards: [],
    source: "local",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  upsertDeck(deck);
  renderDeckList();
  showDeckEditor(deck.id);
}

function exportActiveDeckCsv() {
  const deck = currentDeck();
  if (!deck) return;
  const csv = cardsToCsv(deck.cards || []);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(deck.name || "deck").replaceAll(/[^\w\-]+/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// -----------------------------
// Import CSV UI
// -----------------------------
function renderCsvPreview(cards, warnings) {
  const root = $("#csvPreview");
  root.innerHTML = "";

  if (warnings.length) {
    const w = document.createElement("div");
    w.className = "muted small";
    w.textContent = `Warnings: ${warnings.join(" | ")}`;
    root.appendChild(w);
  }

  if (!cards.length) {
    const n = document.createElement("div");
    n.className = "muted";
    n.textContent = "No valid cards parsed.";
    root.appendChild(n);
    return;
  }

  const info = document.createElement("div");
  info.className = "muted small";
  info.textContent = `Parsed ${cards.length} cards.`;
  root.appendChild(info);

  for (const c of cards.slice(0, 25)) {
    const el = document.createElement("div");
    el.className = "carditem";
    const title = c.type === CardType.MCQ ? c.question : c.type === CardType.FLASHCARD ? c.front : c.name;
    const body = c.type === CardType.MCQ ? c.answer : c.type === CardType.FLASHCARD ? c.back : c.formula;
    el.innerHTML = `
      <div class="badge">${escapeHtml(c.type)}</div>
      <div class="carditem__title">${escapeHtml(title || "")}</div>
      <div class="carditem__body">${escapeHtml(body || "")}</div>
      <div class="carditem__actions">
        <button class="secondary" data-action="pedit" data-id="${c.id}">Edit</button>
        <button class="danger" data-action="pdel" data-id="${c.id}">Remove</button>
      </div>
    `;
    root.appendChild(el);
  }

  if (cards.length > 25) {
    const more = document.createElement("div");
    more.className = "muted small";
    more.textContent = `Showing first 25 of ${cards.length}.`;
    root.appendChild(more);
  }
}

function removePendingCard(cardId) {
  pendingImportCards = pendingImportCards.filter((c) => c.id !== cardId);
  renderCsvPreview(pendingImportCards, []);
  $("#importCsvBtn").disabled = pendingImportCards.length === 0 || !currentDeck();
}

function editPendingCard(cardId) {
  const c = pendingImportCards.find((x) => x.id === cardId);
  if (!c) return;

  if (c.type === CardType.MCQ) {
    const question = prompt("MCQ Question:", c.question || "");
    if (question === null) return;
    const c1 = prompt("Choice 1:", c.choices?.[0] || "");
    if (c1 === null) return;
    const c2 = prompt("Choice 2:", c.choices?.[1] || "");
    if (c2 === null) return;
    const c3 = prompt("Choice 3:", c.choices?.[2] || "");
    if (c3 === null) return;
    const c4 = prompt("Choice 4:", c.choices?.[3] || "");
    if (c4 === null) return;
    const answer = prompt("Answer (must match one of the choices exactly):", c.answer || "");
    if (answer === null) return;
    const choices = [c1, c2, c3, c4].map((x) => String(x || "").trim());
    if (!choices.includes(String(answer).trim())) {
      toast("Answer must match one of the choices. Edit canceled.");
      return;
    }
    c.question = String(question).trim();
    c.choices = choices;
    c.answer = String(answer).trim();
  } else if (c.type === CardType.FLASHCARD) {
    const front = prompt("Flashcard Front:", c.front || "");
    if (front === null) return;
    const back = prompt("Flashcard Back:", c.back || "");
    if (back === null) return;
    c.front = String(front).trim();
    c.back = String(back).trim();
  } else if (c.type === CardType.FORMULA) {
    const name = prompt("Formula Name:", c.name || "");
    if (name === null) return;
    const formula = prompt("Formula (LaTeX recommended):", c.formula || "");
    if (formula === null) return;
    const defs = prompt("Optional defs (separate with ';'):", (c.defs || []).join("; "));
    if (defs === null) return;
    c.name = String(name).trim();
    c.formula = String(formula).trim();
    c.defs = String(defs)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  renderCsvPreview(pendingImportCards, []);
}

async function parseCsvFromFileInput() {
  const file = $("#csvFileInput").files?.[0];
  if (!file) {
    toast("Pick a CSV file first.");
    return;
  }
  const text = await file.text();
  const rows = parseCsv(text);
  const { cards, warnings } = normalizeCsvRowsToCards(rows);
  pendingImportCards = cards;
  renderCsvPreview(cards, warnings);
  $("#importCsvBtn").disabled = cards.length === 0 || !currentDeck();
}

function importPendingCardsIntoActiveDeck() {
  const deck = currentDeck();
  if (!deck) {
    toast("Open a deck first.");
    return;
  }
  if (!pendingImportCards.length) {
    toast("No parsed cards to import.");
    return;
  }
  deck.cards = [...(deck.cards || []), ...pendingImportCards.map((c) => ({ ...c, id: uid("c") }))];
  deck.updatedAt = nowIso();
  upsertDeck(deck);
  pendingImportCards = [];
  $("#importCsvBtn").disabled = true;
  $("#csvPreview").innerHTML = `<div class="muted">Imported!</div>`;
  renderCardList(deck);
  renderDeckList();
  renderQuizDeckList();
  toast("Imported CSV into deck.");
}

// -----------------------------
// Quiz logic
// -----------------------------
let quizState = {
  deckId: null,
  order: [],
  index: 0,
  score: 0,
  answered: {},
  filter: "ALL",
  shuffle: false,
  flashFlipped: false
};

function buildQuizOrder(deck, filter, shuffle) {
  let cards = Array.isArray(deck.cards) ? deck.cards : [];
  if (filter !== "ALL") cards = cards.filter((c) => c.type === filter);
  const ids = cards.map((c) => c.id);
  if (shuffle) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  return ids;
}

function renderQuizDeckList() {
  const root = $("#quizDeckList");
  if (!root) return;

  const decks = loadDecks()
    .slice()
    .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""))
    .reverse();

  root.innerHTML = "";
  if (decks.length === 0) {
    root.innerHTML = `<div class="muted">No decks yet. Create one in <a href="./decks.html">Decks</a>.</div>`;
    return;
  }

  for (const d of decks) {
    const el = document.createElement("div");
    el.className = "deckrow";
    el.innerHTML = `
      <div class="deckrow__left">
        <div class="deckrow__title">${escapeHtml(d.name || "Untitled")}</div>
        <div class="deckrow__meta">${escapeHtml(deckMetaLine(d))}</div>
      </div>
      <div class="deckrow__actions">
        <button class="primary" data-action="start" data-id="${d.id}">Start</button>
      </div>
    `;
    root.appendChild(el);
  }
}

function showQuizPickView() {
  const pick = $("#quizPickView");
  const run = $("#quizRunView");
  if (pick) pick.hidden = false;
  if (run) run.hidden = true;
  quizState.deckId = null;
}

function showQuizRunView(deck) {
  const pick = $("#quizPickView");
  const run = $("#quizRunView");
  if (pick) pick.hidden = true;
  if (run) run.hidden = false;

  const title = $("#quizDeckTitle");
  const meta = $("#quizDeckMeta");
  if (title) title.textContent = deck?.name || "Deck";
  if (meta) meta.textContent = deck ? deckMetaLine(deck) : "";
}

function startQuizWithDeck(deckId) {
  const deck = loadDecks().find((d) => d.id === deckId) || null;
  if (!deck) {
    toast("Deck not found.");
    return;
  }

  quizState.deckId = deck.id;
  showQuizRunView(deck);
  quizRestart();
}

function quizRestart() {
  const stage = $("#quizStage");
  if (!stage) return;

  const decks = loadDecks();
  const deck = decks.find((d) => d.id === quizState.deckId) || null;
  if (!deck) {
    stage.innerHTML = `<div class="muted">Pick a deck first.</div>`;
    const prog = $("#quizProgress");
    const score = $("#quizScore");
    if (prog) prog.textContent = "0/0";
    if (score) score.textContent = "0";
    return;
  }

  quizState.deckId = deck.id;
  quizState.filter = $("#quizFilterSelect").value;
  quizState.shuffle = $("#quizShuffle").checked;
  quizState.order = buildQuizOrder(deck, quizState.filter, quizState.shuffle);
  quizState.index = 0;
  quizState.score = 0;
  quizState.answered = {};
  quizState.flashFlipped = false;

  saveSession({ v: 1, deckId: quizState.deckId, filter: quizState.filter, shuffle: quizState.shuffle });
  renderQuiz();
}

function getQuizCard() {
  const deck = loadDecks().find((d) => d.id === quizState.deckId);
  if (!deck) return null;
  const cardId = quizState.order[quizState.index];
  return (deck.cards || []).find((c) => c.id === cardId) || null;
}

function setQuizHeader() {
  const total = quizState.order.length;
  $("#quizProgress").textContent = total ? `${quizState.index + 1}/${total}` : "0/0";
  $("#quizScore").textContent = String(quizState.score);
}

function renderQuiz() {
  const stage = $("#quizStage");
  const deck = loadDecks().find((d) => d.id === quizState.deckId) || null;
  if (!deck) {
    stage.innerHTML = `<div class="muted">No deck selected.</div>`;
    setQuizHeader();
    return;
  }

  if (quizState.order.length === 0) {
    stage.innerHTML = `<div class="muted">No cards match the current filter.</div>`;
    setQuizHeader();
    $("#flipBtn").hidden = true;
    return;
  }

  quizState.index = clamp(quizState.index, 0, quizState.order.length - 1);
  const card = getQuizCard();
  if (!card) {
    stage.innerHTML = `<div class="muted">Card not found.</div>`;
    setQuizHeader();
    return;
  }

  $("#prevBtn").disabled = quizState.index === 0;
  $("#nextBtn").disabled = quizState.index === quizState.order.length - 1;

  if (card.type === CardType.MCQ) {
    $("#flipBtn").hidden = true;
    stage.innerHTML = renderMcq(card);
    wireMcq(card);
  } else if (card.type === CardType.FLASHCARD) {
    $("#flipBtn").hidden = false;
    stage.innerHTML = renderFlash(card, quizState.flashFlipped);
  } else if (card.type === CardType.FORMULA) {
    $("#flipBtn").hidden = true;
    stage.innerHTML = renderFormula(card);
  }

  typesetMath(stage);

  setQuizHeader();
}

function renderMcq(card) {
  const answered = quizState.answered[card.id] || null;
  const selected = answered?.selected ?? null;
  const correct = card.answer;

  const choiceBtns = (card.choices || []).map((c) => {
    const isCorrect = answered ? c === correct : false;
    const isWrong = answered ? selected === c && c !== correct : false;
    const isDisabled = Boolean(answered);
    const cls = ["choicebtn", isCorrect ? "is-correct" : "", isWrong ? "is-wrong" : "", isDisabled ? "is-disabled" : ""]
      .filter(Boolean)
      .join(" ");
    return `<button class="${cls}" data-choice="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
  });

  return `
    <div class="quizcard">
      <div class="badge badge--mcq">MCQ</div>
      <h3>${escapeHtml(card.question || "")}</h3>
      <div class="choices">${choiceBtns.join("")}</div>
      ${
        answered
          ? `<div class="muted small" style="margin-top:10px">${answered.correct ? "Correct." : "Incorrect."}</div>`
          : `<div class="muted small" style="margin-top:10px">Pick an answer.</div>`
      }
    </div>
  `;
}

function wireMcq(card) {
  const stage = $("#quizStage");
  const buttons = $$(".choicebtn", stage);
  for (const b of buttons) {
    b.addEventListener("click", () => {
      if (quizState.answered[card.id]) return;
      const choice = b.getAttribute("data-choice") ?? "";
      const correct = choice === card.answer;
      quizState.answered[card.id] = { selected: choice, correct, scored: correct };
      if (correct) quizState.score += 1;
      renderQuiz();
    });
  }
}

function renderFlash(card, flipped) {
  const front = card.front || "";
  const back = card.back || "";
  const flippedClass = flipped ? "is-flipped" : "";
  return `
    <div class="flashwrap">
      <div class="badge badge--flash">FLASHCARD</div>
      <div class="flashcard ${flippedClass}" id="flashcard">
        <div class="flashface">
          <div class="flashlabel">Front</div>
          <div class="flashtext">${escapeHtml(front)}</div>
          <div class="muted small">Tap Flip to reveal.</div>
        </div>
        <div class="flashface flashface--back">
          <div class="flashlabel">Back</div>
          <div class="flashtext">${escapeHtml(back)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderFormula(card) {
  const name = card.name || "";
  const formula = card.formula || "";
  const defs = Array.isArray(card.defs) ? card.defs : [];
  const equation = wrapDisplayMath(formula);
  const equationEnc = encodeURIComponent(equation);
  const defsList = defs.length
    ? `<ul class="formula__defs">${defs.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
    : "";
  return `
    <div class="formula">
      <div class="badge badge--formula">FORMULA</div>
      <div class="formula__name">${escapeHtml(name)}</div>
      <div class="formula__eq"><span class="js-math" data-math="${escapeHtml(equationEnc)}"></span></div>
      ${defsList}
    </div>
  `;
}

function wrapDisplayMath(s) {
  const t = String(s || "").trim();
  if (!t) return "";

  // If already wrapped, return as-is (NO escaping; inserted via textContent later)
  if (
    t.includes("\\[") ||
    t.includes("\\]") ||
    t.includes("\\(") ||
    t.includes("\\)") ||
    /\$.*\$/s.test(t)
  ) {
    return t;
  }

  // Wrap as display math
  return `\\[${t}\\]`;
}

function typesetMath(root) {
  if (!root) return;

  hydrateMath(root);

  // MathJax v3 exposes `window.MathJax.typesetPromise` only after the library finishes loading.
  // Until then, `window.MathJax` may exist as a config object set in HTML.
  pendingMathTypesetRoots.add(root);
  if (tryTypesetPendingMath()) return;

  // Poll briefly until MathJax loads, then typeset everything queued.
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

function quizPrev() {
  quizState.index = clamp(quizState.index - 1, 0, quizState.order.length - 1);
  quizState.flashFlipped = false;
  renderQuiz();
}
function quizNext() {
  quizState.index = clamp(quizState.index + 1, 0, quizState.order.length - 1);
  quizState.flashFlipped = false;
  renderQuiz();
}
function quizFlip() {
  const card = getQuizCard();
  if (!card || card.type !== CardType.FLASHCARD) return;
  quizState.flashFlipped = !quizState.flashFlipped;
  renderQuiz();
}

// -----------------------------
// Modules (markdown)
// -----------------------------
function resolveRelative(basePath, href) {
  const h = String(href || "").trim();
  if (!h) return h;
  if (/^(https?:)?\/\//i.test(h)) return h;
  if (h.startsWith("/")) return h;
  const base = new URL(basePath, location.href);
  return new URL(h, base).toString();
}

function simpleMarkdownToHtml(md, basePath = "./modules/") {
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
      return `<img alt="${escapeHtml(alt)}" src="${escapeHtml(resolved)}" />`;
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

async function renderModulesList() {
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
      moduleContent.innerHTML = simpleMarkdownToHtml(md, base);
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

// -----------------------------
// PWA
// -----------------------------
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    // ignore
  }
}

function wireInstallPrompt() {
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

function setOnlineStatusTag() {
  const tag = $("#statusTag");
  if (!tag) return;
  const set = () => {
    tag.textContent = navigator.onLine ? "Online" : "Offline";
  };
  window.addEventListener("online", set);
  window.addEventListener("offline", set);
  set();
}

// -----------------------------
// Wire events
// -----------------------------
function wireDrawerUI() {
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

function showDecksListView() {
  const listView = $("#decksListView");
  const editView = $("#deckEditView");
  if (listView) listView.hidden = false;
  if (editView) editView.hidden = true;
  activeDeckId = null;
}

function initDecksPage() {
  renderDeckList();
  showDecksListView();

  const deckList = $("#deckList");
  if (deckList) {
    deckList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='open']");
      if (!btn) return;
      showDeckEditor(btn.dataset.id);
    });
  }

  const newDeckBtn = $("#newDeckBtn");
  if (newDeckBtn) newDeckBtn.addEventListener("click", createNewDeck);

  const backToDecksBtn = $("#backToDecksBtn");
  if (backToDecksBtn) {
    backToDecksBtn.addEventListener("click", () => {
      showDecksListView();
      renderDeckList();
    });
  }

  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      $$(".tab").forEach((x) => x.classList.toggle("is-active", x === t));
      const tab = t.dataset.tab;
      $$(".tabpanel").forEach((p) => (p.hidden = p.dataset.panel !== tab));
    })
  );

  const deckNameInput = $("#deckNameInput");
  if (deckNameInput) deckNameInput.addEventListener("change", (e) => updateDeckName(e.target.value));

  const cardTypeSelect = $("#cardTypeSelect");
  if (cardTypeSelect) {
    cardTypeSelect.addEventListener("change", (e) => {
      const type = e.target.value;
      $("#editCardId").value = "";
      $("#cardSaveBtn").textContent = "Add card";
      $("#cardCancelBtn").hidden = true;
      setCardTypeForm(type);
    });
  }

  const cardForm = $("#cardForm");
  if (cardForm) {
    cardForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const deck = currentDeck();
      if (!deck) {
        toast("Open a deck first.");
        return;
      }

      const type = $("#cardTypeSelect").value;
      const v = validateCardFromForm(type);
      if (!v.ok) {
        toast(v.message);
        return;
      }

      const editId = $("#editCardId").value || "";
      const card = { id: editId || uid("c"), ...v.card };
      if (editId) {
        deck.cards = (deck.cards || []).map((c) => (c.id === editId ? { ...card } : c));
        toast("Card updated.");
      } else {
        deck.cards = [...(deck.cards || []), card];
        toast("Card added.");
      }
      deck.updatedAt = nowIso();
      upsertDeck(deck);
      clearCardForm();
      setCardTypeForm($("#cardTypeSelect").value);
      renderCardList(deck);
      renderDeckList();
      renderQuizDeckList();
    });
  }

  const cardCancelBtn = $("#cardCancelBtn");
  if (cardCancelBtn) {
    cardCancelBtn.addEventListener("click", () => {
      clearCardForm();
      setCardTypeForm($("#cardTypeSelect").value);
    });
  }

  const cardList = $("#cardList");
  if (cardList) {
    cardList.addEventListener("click", (e) => {
      const editBtn = e.target.closest("button[data-action='edit']");
      if (editBtn) return startEditCard(editBtn.dataset.id);
      const delBtn = e.target.closest("button[data-action='delete']");
      if (delBtn) {
        if (confirm("Delete this card?")) removeCard(delBtn.dataset.id);
      }
    });
  }

  const deleteDeckBtn = $("#deleteDeckBtn");
  if (deleteDeckBtn) {
    deleteDeckBtn.addEventListener("click", () => {
      const deck = currentDeck();
      if (!deck) return;
      if (!confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) return;
      deleteDeck(deck.id);
      toast("Deck deleted.");
      showDecksListView();
      renderDeckList();
      renderQuizDeckList();
    });
  }

  const exportDeckBtn = $("#exportDeckBtn");
  if (exportDeckBtn) exportDeckBtn.addEventListener("click", exportActiveDeckCsv);

  const parseCsvBtn = $("#parseCsvBtn");
  if (parseCsvBtn) parseCsvBtn.addEventListener("click", parseCsvFromFileInput);

  const csvFileInput = $("#csvFileInput");
  if (csvFileInput) {
    csvFileInput.addEventListener("change", () => {
      pendingImportCards = [];
      $("#csvPreview").innerHTML = "";
      $("#importCsvBtn").disabled = true;
    });
  }

  const csvPreview = $("#csvPreview");
  if (csvPreview) {
    csvPreview.addEventListener("click", (e) => {
      const editBtn = e.target.closest("button[data-action='pedit']");
      if (editBtn) return editPendingCard(editBtn.dataset.id);
      const delBtn = e.target.closest("button[data-action='pdel']");
      if (delBtn) return removePendingCard(delBtn.dataset.id);
    });
  }

  const importCsvBtn = $("#importCsvBtn");
  if (importCsvBtn) importCsvBtn.addEventListener("click", importPendingCardsIntoActiveDeck);
}

function initQuizPage() {
  const session = loadSession();
  if (session?.v === 1) {
    const filter = $("#quizFilterSelect");
    const shuffle = $("#quizShuffle");
    if (filter) filter.value = session.filter || "ALL";
    if (shuffle) shuffle.checked = Boolean(session.shuffle);
  }

  renderQuizDeckList();
  showQuizPickView();

  const deckList = $("#quizDeckList");
  if (deckList) {
    deckList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action='start']");
      if (!btn) return;
      startQuizWithDeck(btn.dataset.id);
    });
  }

  const quizBackBtn = $("#quizBackBtn");
  if (quizBackBtn) {
    quizBackBtn.addEventListener("click", () => {
      showQuizPickView();
      renderQuizDeckList();
    });
  }

  const quizFilterSelect = $("#quizFilterSelect");
  if (quizFilterSelect) quizFilterSelect.addEventListener("change", () => quizRestart());
  const quizShuffle = $("#quizShuffle");
  if (quizShuffle) quizShuffle.addEventListener("change", () => quizRestart());
  const quizRestartBtn = $("#quizRestartBtn");
  if (quizRestartBtn) quizRestartBtn.addEventListener("click", () => quizRestart());

  const prevBtn = $("#prevBtn");
  if (prevBtn) prevBtn.addEventListener("click", quizPrev);
  const nextBtn = $("#nextBtn");
  if (nextBtn) nextBtn.addEventListener("click", quizNext);
  const flipBtn = $("#flipBtn");
  if (flipBtn) flipBtn.addEventListener("click", quizFlip);
}

function initModulesPage() {
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

// -----------------------------
// Boot
// -----------------------------
async function main() {
  syncThemeColorMeta();
  setOnlineStatusTag();
  wireInstallPrompt();
  wireDrawerUI();
  await registerServiceWorker();
  await loadDefaultDecksIfNeeded();

  if (page() === "decks") initDecksPage();
  if (page() === "quiz") initQuizPage();
  if (page() === "modules") initModulesPage();
}

main();
