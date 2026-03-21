import { $, $$, escapeHtml, toast } from "../core/dom.js";
import { CardType } from "../core/constants.js";
import { cardsToCsv, normalizeCsvRowsToCards, parseCsv } from "../core/csv.js";
import { deleteDeck, loadDecks, upsertDeck } from "../core/storage.js";
import { nowIso, uid } from "../core/util.js";
import { deckMetaLine } from "../features/decks/meta.js";
import { renderQuizDeckList } from "./quiz.js";

let activeDeckId = null;
let pendingImportCards = [];

const ADD_MODE_IMPORT_CSV = "IMPORT_CSV";

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
  syncAddMode($("#cardTypeSelect").value);
  syncMcqAnswerIndexOptions();
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
  $("#mcqAnswerIndex").value = "0";
  $("#mcqDefs").value = "";
  $("#fcFront").value = "";
  $("#fcBack").value = "";
  $("#fmName").value = "";
  $("#fmFormula").value = "";
  $("#fmExplain").value = "";
}

function syncMcqAnswerIndexOptions() {
  const sel = $("#mcqAnswerIndex");
  if (!sel) return;

  const choices = [$("#mcqC1"), $("#mcqC2"), $("#mcqC3"), $("#mcqC4")].map((el) => String(el?.value || "").trim());

  for (let i = 0; i < 4; i++) {
    const opt = sel.querySelector(`option[value="${i}"]`);
    if (!opt) continue;
    const text = choices[i];
    opt.textContent = text ? `Choice ${i + 1}: ${text}` : `Choice ${i + 1}`;
  }
}
function setCardTypeForm(type) {
  for (const el of $$(".cardform__type")) el.hidden = el.dataset.type !== type;
}
function syncAddMode(type) {
  setCardTypeForm(type);
  const actions = $("#cardFormActions");
  if (actions) actions.hidden = type === ADD_MODE_IMPORT_CSV;
}
function validateCardFromForm(type) {
  if (type === CardType.MCQ) {
    const question = $("#mcqQuestion").value.trim();
    const choices = [$("#mcqC1").value, $("#mcqC2").value, $("#mcqC3").value, $("#mcqC4").value].map((v) => v.trim());
    const answerIndex = Number.parseInt($("#mcqAnswerIndex").value, 10);
    const defsText = $("#mcqDefs").value.trim();
    const defs = defsText
      ? defsText
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (!question) return { ok: false, message: "MCQ needs a question." };
    if (choices.some((c) => !c)) return { ok: false, message: "MCQ needs 4 choices." };
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3)
      return { ok: false, message: "Pick the correct choice (0-3)." };

    return { ok: true, card: { type, question, choices, answerIndex, answer: choices[answerIndex], defs } };
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
  syncAddMode(c.type);
  $("#cardSaveBtn").textContent = "Save changes";
  $("#cardCancelBtn").hidden = false;

  if (c.type === CardType.MCQ) {
    $("#mcqQuestion").value = c.question || "";
    $("#mcqC1").value = c.choices?.[0] || "";
    $("#mcqC2").value = c.choices?.[1] || "";
    $("#mcqC3").value = c.choices?.[2] || "";
    $("#mcqC4").value = c.choices?.[3] || "";
    const idx = Number.isInteger(c.answerIndex) ? c.answerIndex : (c.choices || []).indexOf(c.answer);
    $("#mcqAnswerIndex").value = String(idx >= 0 ? idx : 0);
    $("#mcqDefs").value = (c.defs || []).join("; ");
    syncMcqAnswerIndexOptions();
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
  syncMcqAnswerIndexOptions();
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

    const choices = [c1, c2, c3, c4].map((x) => String(x || "").trim());
    const idxDefault = Number.isInteger(c.answerIndex) ? c.answerIndex : choices.indexOf(String(c.answer || "").trim());
    const answerIndexText = prompt("Answer index (0-3):", String(idxDefault >= 0 ? idxDefault : 0));
    if (answerIndexText === null) return;

    const answerIndex = Number.parseInt(String(answerIndexText).trim(), 10);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      toast("Answer index must be 0-3. Edit canceled.");
      return;
    }

    const defsText = prompt("Optional defs (separate with ';'):", (c.defs || []).join("; "));
    if (defsText === null) return;

    c.question = String(question).trim();
    c.choices = choices;
    c.answerIndex = answerIndex;
    c.answer = choices[answerIndex];
    c.defs = String(defsText)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
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
  syncMcqAnswerIndexOptions();
  renderCardList(deck);
  renderDeckList();
  renderQuizDeckList();
  toast("Imported CSV into deck.");
}

function showDecksListView() {
  const listView = $("#decksListView");
  const editView = $("#deckEditView");
  if (listView) listView.hidden = false;
  if (editView) editView.hidden = true;
  activeDeckId = null;
}

export function initDecksPage() {
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
  if (newDeckBtn) {
    newDeckBtn.addEventListener("click", () => {
      createNewDeck();
      const name = $("#deckNameInput");
      if (name) {
        name.focus();
        if (typeof name.select === "function") name.select();
      }
    });
  }
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
      syncAddMode(type);

      if (type === ADD_MODE_IMPORT_CSV) {
        const file = $("#csvFileInput");
        if (file) file.focus();
      } else if (type === CardType.MCQ) {
        syncMcqAnswerIndexOptions();
        const q = $("#mcqQuestion");
        if (q) q.focus();
      } else if (type === CardType.FLASHCARD) {
        const front = $("#fcFront");
        if (front) front.focus();
      } else if (type === CardType.FORMULA) {
        const name = $("#fmName");
        if (name) name.focus();
      }
    });
  }

  // Keep MCQ correct-choice dropdown in sync with the choice text.
  [$("#mcqC1"), $("#mcqC2"), $("#mcqC3"), $("#mcqC4")].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", syncMcqAnswerIndexOptions);
  });

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
      if (type === ADD_MODE_IMPORT_CSV) {
        toast("Use \"Parse\" then \"Import into deck\".");
        return;
      }

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
      syncAddMode($("#cardTypeSelect").value);
      syncMcqAnswerIndexOptions();
  renderCardList(deck);
      renderDeckList();
      renderQuizDeckList();
    });
  }

  const cardCancelBtn = $("#cardCancelBtn");
  if (cardCancelBtn) {
    cardCancelBtn.addEventListener("click", () => {
      clearCardForm();
      syncAddMode($("#cardTypeSelect").value);
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
