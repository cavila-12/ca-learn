# CELE Reviewer (Offline)

Static reviewer/quiz app (HTML/CSS/JS) designed for GitHub Pages and offline use (PWA).

## Features
- Decks: create/edit/delete, manual entry + CSV import
- Quiz: MCQ scoring + flashcards flip + formula cards (MathJax)
- Modules: markdown-based lessons from `modules/`
- Offline: service worker caches app shell + defaults

## Data folders
- Default decks: `data/decks/` (update `data/decks/index.json` to add more)
- Modules: `modules/` (update `modules/index.json` to add more)

## CSV format
Header row is optional. Supported rows:
- `MCQ, Question, Choice1, Choice2, Choice3, Choice4, Answer`
- `FLASHCARD, Question, Answer` (also accepts legacy: `FLASHCARD, Question, , , , , Answer`)
- `FORMULA, Name, Formula, OptionalDefs` (OptionalDefs uses `;` separator; also accepts legacy: `FORMULA, Name, , , , , Formula, OptionalDefs`)

## GitHub Pages
Push to a repo and enable Pages for the branch/root.

## Offline note
The app caches all same-origin files on first run. MathJax is loaded from jsDelivr and is cached by the service worker after the first successful online load.
