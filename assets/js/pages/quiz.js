import { $, $$, escapeHtml, toast } from "../core/dom.js";
import { CardType } from "../core/constants.js";
import { clamp } from "../core/util.js";
import { loadDecks, saveSession, loadSession } from "../core/storage.js";
import { deckMetaLine } from "../features/decks/meta.js";
import { typesetMath, wrapDisplayMath, wrapInlineMath } from "../core/mathjax.js";

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

let mcqAutoNextTimer = null;

function clearMcqAutoNext() {
  if (mcqAutoNextTimer) {
    clearTimeout(mcqAutoNextTimer);
    mcqAutoNextTimer = null;
  }
}


const mcqSounds = {
  correct: null,
  wrong: null
};

function getMcqSound(name) {
  const existing = mcqSounds[name];
  if (existing) return existing;
  const audio = new Audio(`./sounds/${name}.mp3`);
  audio.preload = "auto";
  audio.volume = 0.7;
  mcqSounds[name] = audio;
  return audio;
}

function playMcqSound(isCorrect) {
  try {
    const a = getMcqSound(isCorrect ? "correct" : "wrong");
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}
function ensureQuizCssLoaded() {
  if (document.querySelector("link[data-quiz-css=\'1\']")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./assets/css/quiz.css";
  link.setAttribute("data-quiz-css", "1");
  document.head.appendChild(link);
}

function ensureQuizUiHidesLegacyToolbar() {
  if (document.querySelector("style[data-quiz-hide-toolbar=\'1\']")) return;
  const st = document.createElement("style");
  st.setAttribute("data-quiz-hide-toolbar", "1");
  st.textContent = `#quizRunView .toolbar{display:none !important;}`;
  document.head.appendChild(st);
}

function setAsIconButton(btn, iconClass, label) {
  if (!btn) return;
  btn.className = "iconaction";
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = `<span class="icon ${iconClass}" aria-hidden="true"></span>`;
}

function setupQuizRunLayout() {
  const run = $("#quizRunView");
  if (!run) return;
  if (run.dataset.layoutReady === "1") return;
  try {
    const stage = $("#quizStage");
  if (!stage) return;

  const oldHead = run.querySelector(".pagehead");
  const toolbar = run.querySelector(".toolbar");

  const quizHead = document.createElement("div");
  quizHead.className = "quizhead";

  const top = document.createElement("div");
  top.className = "quizhead__top";
  const title = document.createElement("div");
  title.className = "quizhead__title";
  title.textContent = "Quiz";
  const actions = document.createElement("div");
  actions.className = "quizhead__actions";
  top.append(title, actions);

  const bottom = document.createElement("div");
  bottom.className = "quizhead__bottom";

  const settingsPanel = document.createElement("div");
  settingsPanel.className = "quizsettings";
  settingsPanel.id = "quizSettingsPanel";
  settingsPanel.hidden = true;

  if (oldHead) {
    const left = oldHead.children[0];
    const right = oldHead.querySelector(".pagehead__right");
    if (left) {
      left.className = "quizhead__deck";
      const deckTitle = $("#quizDeckTitle");
      if (deckTitle) deckTitle.classList.add("quizhead__deckTitle");
      bottom.appendChild(left);
    }
    if (right) {
      right.classList.add("quizhead__stats");
      bottom.appendChild(right);
    }
    oldHead.remove();
  }

  // Settings list (Filter + Shuffle) shown only when Settings is toggled
  const filterSelectLegacy = $("#quizFilterSelect");
  const shuffleLegacy = $("#quizShuffle");

  const filterField = document.createElement("label");
  filterField.className = "field";
  filterField.innerHTML = `
    <span>Filter</span>
    <select id="quizFilterSelect2">
      <option value="ALL">All types</option>
      <option value="MCQ">MCQ only</option>
      <option value="FLASHCARD">Flashcards only</option>
      <option value="FORMULA">Formulas only</option>
    </select>
  `;
  const filterSelect = filterField.querySelector("select");
  if (filterSelectLegacy && filterSelect) filterSelect.value = filterSelectLegacy.value || "ALL";

  const shuffleField = document.createElement("label");
  shuffleField.className = "check";
  shuffleField.innerHTML = `
    <input type="checkbox" id="quizShuffle2" />
    <span>Shuffle</span>
  `;
  const shuffleCheck = shuffleField.querySelector("input");
  if (shuffleLegacy && shuffleCheck) shuffleCheck.checked = Boolean(shuffleLegacy.checked);

  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      if (filterSelectLegacy) filterSelectLegacy.value = filterSelect.value;
      quizRestart();
    });
  }
  if (shuffleCheck) {
    shuffleCheck.addEventListener("change", () => {
      if (shuffleLegacy) shuffleLegacy.checked = Boolean(shuffleCheck.checked);
      quizRestart();
    });
  }

  settingsPanel.appendChild(filterField);
  settingsPanel.appendChild(shuffleField);

  // Always hide the legacy toolbar controls (we keep them only as state holders).
  if (toolbar) toolbar.style.display = "none";


  const restartBtn = $("#quizRestartBtn");
  const backBtn = $("#quizBackBtn");
  setAsIconButton(restartBtn, "icon--restart", "Restart");
  setAsIconButton(backBtn, "icon--deck", "Change deck");

  const settingsBtn = document.createElement("button");
  settingsBtn.id = "quizSettingsBtn";
  setAsIconButton(settingsBtn, "icon--settings", "Settings");
  settingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  if (restartBtn) actions.appendChild(restartBtn);
  if (backBtn) actions.appendChild(backBtn);
  actions.appendChild(settingsBtn);

  if (toolbar) toolbar.style.display = "none";

  const flipBtn = $("#flipBtn");
  if (flipBtn) flipBtn.remove();

  quizHead.append(top, bottom, settingsPanel);
  run.insertBefore(quizHead, stage);

    run.dataset.layoutReady = "1";
  } catch (e) {
    console.error("Quiz layout setup failed", e);
  }
}

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

export function renderQuizDeckList() {
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

  // (Re)apply the simplified header/settings layout
  setupQuizRunLayout();
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
  clearMcqAutoNext();
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
    const filterEl = $("#quizFilterSelect2") || $("#quizFilterSelect");
  const shuffleEl = $("#quizShuffle2") || $("#quizShuffle");
  quizState.filter = filterEl ? filterEl.value : "ALL";
  quizState.shuffle = shuffleEl ? Boolean(shuffleEl.checked) : false;
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
    stage.innerHTML = renderMcq(card);
    wireMcq(card);
  } else if (card.type === CardType.FLASHCARD) {
    stage.innerHTML = renderFlash(card, quizState.flashFlipped);
    wireFlashcard();
  } else if (card.type === CardType.FORMULA) {
    stage.innerHTML = renderFormula(card);
  }

  typesetMath(stage);
  setQuizHeader();
}

function getMcqCorrectIndex(card) {
  const idx = Number.isInteger(card.answerIndex) ? card.answerIndex : (card.choices || []).indexOf(card.answer);
  return Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : -1;
}

function renderMcq(card) {
  const answered = quizState.answered[card.id] || null;
  const selectedIndex = answered?.selectedIndex ?? null;
  const correctIndex = getMcqCorrectIndex(card);
  const defs = Array.isArray(card.defs) ? card.defs : [];

  const choiceBtns = (card.choices || []).map((c, i) => {
    const isCorrect = answered ? i === correctIndex : false;
    const isWrong = answered ? selectedIndex === i && i !== correctIndex : false;
    const isDisabled = Boolean(answered);
    const cls = ["choicebtn", isCorrect ? "is-correct" : "", isWrong ? "is-wrong" : "", isDisabled ? "is-disabled" : ""]
      .filter(Boolean)
      .join(" ");
    return `<button class="${cls}" data-index="${i}">${escapeHtml(c)}</button>`;
  });

  const defsList = defs.length ? `<div class="muted small" style="margin-top:10px">Definitions</div><ul class="formula__defs">${defs.map(renderFormulaDef).join("")}</ul>` : "";

  return `
    <div class="quizcard">
      <div class="badge badge--mcq">MCQ</div>
      <h3>${escapeHtml(card.question || "")}</h3>
      ${defsList}
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
  if (!stage) return;
  const buttons = stage.querySelectorAll(".choicebtn");
  const correctIndex = getMcqCorrectIndex(card);

  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    b.addEventListener("click", () => {
      if (quizState.answered[card.id]) return;
      clearMcqAutoNext();
      const idx = Number.parseInt(String(b.getAttribute("data-index") || "-1"), 10);
      const correct = idx === correctIndex;
      playMcqSound(correct);
      quizState.answered[card.id] = { selectedIndex: idx, correct, scored: correct };
      if (correct) quizState.score += 1;
      renderQuiz();
      // Auto-next (MCQ only): advance 1s after answering, if still on same card.
      const answeredCardId = card.id;
      const answeredIndex = quizState.index;
      mcqAutoNextTimer = setTimeout(() => {
        mcqAutoNextTimer = null;
        const current = getQuizCard();
        if (!current || current.id !== answeredCardId) return;
        if (quizState.index !== answeredIndex) return;
        if (quizState.index >= quizState.order.length - 1) return;
        quizNext();
      }, 1000);
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
      <div class="flashcard ${flippedClass}" id="flashcard" role="button" tabindex="0" aria-label="Flip card">
        <div class="flashface">
          <div class="flashlabel">Front</div>
          <div class="flashtext">${escapeHtml(front)}</div>
          <div class="muted small">Tap the card to reveal.</div>
        </div>
        <div class="flashface flashface--back">
          <div class="flashlabel">Back</div>
          <div class="flashtext">${escapeHtml(back)}</div>
        </div>
      </div>
    </div>
  `;
}

function wireFlashcard() {
  const el = $("#flashcard");
  if (!el) return;
  el.addEventListener("click", () => quizFlip());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      quizFlip();
    }
  });
}

function renderFormula(card) {
  const name = card.name || "";
  const formula = card.formula || "";
  const defs = Array.isArray(card.defs) ? card.defs : [];
  const equation = wrapDisplayMath(formula);
  const equationEnc = encodeURIComponent(equation);
  const defsList = defs.length ? `<ul class="formula__defs">${defs.map(renderFormulaDef).join("")}</ul>` : "";
  return `
    <div class="formula">
      <div class="badge badge--formula">FORMULA</div>
      <div class="formula__name">${escapeHtml(name)}</div>
      <div class="formula__eq"><span class="js-math" data-math="${escapeHtml(equationEnc)}"></span></div>
      ${defsList}
    </div>
  `;
}
function renderFormulaDef(def) {
  const raw = String(def || "").trim();
  if (!raw) return "";

  const eqIndex = raw.indexOf("=");
  if (eqIndex === -1) {
    if (/[\\_^{}]/.test(raw)) {
      const math = wrapInlineMath(raw);
      const enc = encodeURIComponent(math);
      return `<li><span class="js-math" data-math="${escapeHtml(enc)}"></span></li>`;
    }
    return `<li>${escapeHtml(raw)}</li>`;
  }

  const left = raw.slice(0, eqIndex).trim();
  const right = raw.slice(eqIndex + 1).trim();
  const leftMath = wrapInlineMath(left);
  const leftEnc = encodeURIComponent(leftMath);
  return `<li><span class="js-math" data-math="${escapeHtml(leftEnc)}"></span>${right ? ` = ${escapeHtml(right)}` : ""}</li>`;
}

function quizPrev() {
  clearMcqAutoNext();
  quizState.index = clamp(quizState.index - 1, 0, quizState.order.length - 1);
  quizState.flashFlipped = false;
  renderQuiz();
}
function quizNext() {
  clearMcqAutoNext();
  quizState.index = clamp(quizState.index + 1, 0, quizState.order.length - 1);
  quizState.flashFlipped = false;
  renderQuiz();
}
function quizFlip() {
  clearMcqAutoNext();
  const card = getQuizCard();
  if (!card || card.type !== CardType.FLASHCARD) return;
  quizState.flashFlipped = !quizState.flashFlipped;
  renderQuiz();
}

export function initQuizPage() {
  window.__QUIZ_UI_VERSION = "2026-03-22-settings-popover";
  ensureQuizCssLoaded();
  ensureQuizUiHidesLegacyToolbar();
  setupQuizRunLayout();

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
}

