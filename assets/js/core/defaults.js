import { StorageKeys } from "./constants.js";
import { parseCsv, normalizeCsvRowsToCards } from "./csv.js";
import { toast } from "./dom.js";
import { loadDecks, saveDecks } from "./storage.js";
import { nowIso, uid } from "./util.js";

export async function loadDefaultDecksIfNeeded() {
  try {
    const indexRes = await fetch("./data/decks/index.json", { cache: "no-store" });
    if (!indexRes.ok) throw new Error("Missing data/decks/index.json");
    const index = await indexRes.json();
    const files = Array.isArray(index?.files) ? index.files : [];

    const existing = loadDecks();
    const decks = [];

    for (const item of files) {
      const deckName = item?.name ?? "Default deck";
      const path = item?.path;
      if (!path) continue;

      const hasAlready = (existing || []).some(
        (d) =>
          d?.source === "default" &&
          (d?.defaultPath === path ||
            String(d?.name || "")
              .trim()
              .toLowerCase() === String(deckName)
              .trim()
              .toLowerCase())
      );
      if (hasAlready) continue;

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
        defaultPath: path,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }

    if (decks.length > 0) {
      saveDecks([...(existing || []), ...decks]);
      toast(`Loaded ${decks.length} new default deck(s).`);
    }

    localStorage.setItem(StorageKeys.defaultsLoaded, "1");
  } catch {
    // If first load is offline, keep this unset so we can retry later.
  }
}
