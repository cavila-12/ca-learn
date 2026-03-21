export function deckTypeCounts(deck) {
  const counts = { MCQ: 0, FLASHCARD: 0, FORMULA: 0 };
  for (const c of deck.cards || []) {
    if (c?.type && counts[c.type] !== undefined) counts[c.type] += 1;
  }
  return counts;
}

export function deckMetaLine(deck) {
  const counts = deckTypeCounts(deck);
  const parts = [];
  if (counts.MCQ) parts.push(`MCQ ${counts.MCQ}`);
  if (counts.FLASHCARD) parts.push(`FLASH ${counts.FLASHCARD}`);
  if (counts.FORMULA) parts.push(`FORMULA ${counts.FORMULA}`);
  const typeText = parts.length ? parts.join(" • ") : "No cards yet";
  return `${(deck.cards?.length ?? 0)} cards • ${typeText}`;
}

