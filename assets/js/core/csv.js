import { CardType } from "./constants.js";
import { fixLatexEscapes } from "./latex.js";
import { uid } from "./util.js";

// CSV parsing (supports quotes, commas, newlines)
export function parseCsv(text) {
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

function parseOptionalDefsCell(cell) {
  const defsText = fixLatexEscapes(String(cell || "").trim());
  if (!defsText) return [];
  return defsText
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeCsvRowsToCards(rows) {
  if (rows.length === 0) return { cards: [], warnings: ["CSV is empty."] };

  const first = rows[0].map((c) => c.toUpperCase());
  const headerish =
    first.includes("TYPE") && (first.includes("QUESTION") || first.includes("FORMULA") || first.includes("ANSWER"));
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
      // New format:
      // Type,Question,Choice1,Choice2,Choice3,Choice4,answer index(0-3),OptionalDefs
      // Backward-compatible: column 6 may be exact answer text.
      const question = fixLatexEscapes(r[1] || "");
      const choices = [r[2], r[3], r[4], r[5]].map((c) => fixLatexEscapes((c || "").trim()));
      const answerField = fixLatexEscapes((r[6] || "").trim());
      const defs = parseOptionalDefsCell(r[7] || "");

      if (!question) {
        warnings.push(`Line ${line}: MCQ missing Question; skipped.`);
        continue;
      }
      if (choices.some((c) => !c)) {
        warnings.push(`Line ${line}: MCQ missing one or more choices; skipped.`);
        continue;
      }

      const num = Number(answerField);
      const hasIndex = Number.isInteger(num) && num >= 0 && num <= 3;
      const answerIndex = hasIndex ? num : choices.indexOf(answerField);

      if (!(Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3)) {
        warnings.push(`Line ${line}: MCQ missing/invalid answer (use 0-3 index or exact choice text); skipped.`);
        continue;
      }

      const answer = choices[answerIndex];
      cards.push({ id: uid("c"), type: CardType.MCQ, question, choices, answerIndex, answer, defs });
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

export function cardsToCsv(cards) {
  const header = [
    "Type",
    "Question/Name",
    "Choice1",
    "Choice2",
    "Choice3",
    "Choice4",
    "answer index(0-3)",
    "OptionalDefs"
  ];
  const rows = [header];

  for (const c of cards) {
    if (c.type === CardType.MCQ) {
      const choices = Array.isArray(c.choices) ? c.choices : ["", "", "", ""];
      const idx =
        Number.isInteger(c.answerIndex) && c.answerIndex >= 0 && c.answerIndex <= 3
          ? c.answerIndex
          : choices.indexOf(c.answer);
      rows.push([
        c.type,
        c.question,
        choices[0] || "",
        choices[1] || "",
        choices[2] || "",
        choices[3] || "",
        idx,
        (c.defs || []).join("; ")
      ]);
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
          if (/[\",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
          return s;
        })
        .join(",")
    )
    .join("\n");
}
