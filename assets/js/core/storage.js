import { CardType, StorageKeys } from "./constants.js";
import { fixLatexEscapes } from "./latex.js";
import { safeJsonParse } from "./util.js";

export function saveDecks(decks) {
  localStorage.setItem(StorageKeys.decks, JSON.stringify(decks));
}

export function loadDecks() {
  const raw = localStorage.getItem(StorageKeys.decks);
  const decks = safeJsonParse(raw ?? "[]", []);
  if (!Array.isArray(decks)) return [];

  // Normalize common LaTeX escape mistakes across persisted data (migrates in-place).
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

export function upsertDeck(deck) {
  const decks = loadDecks();
  const idx = decks.findIndex((d) => d.id === deck.id);
  if (idx === -1) decks.push(deck);
  else decks[idx] = deck;
  saveDecks(decks);
}

export function deleteDeck(deckId) {
  const decks = loadDecks().filter((d) => d.id !== deckId);
  saveDecks(decks);
}

export function loadSession() {
  const raw = localStorage.getItem(StorageKeys.session);
  const s = safeJsonParse(raw ?? "null", null);
  return s && typeof s === "object" ? s : null;
}

export function saveSession(session) {
  localStorage.setItem(StorageKeys.session, JSON.stringify(session));
}

