export function fixLatexEscapes(text) {
  const t = String(text ?? "");
  if (!t.includes("\\\\")) return t;

  // Accept mistakenly "escaped" LaTeX like "\\sigma" from CSV/plain text.
  // Convert only when it looks like the start of a command/delimiter.
  return t.replace(/\\\\(?=[A-Za-z[\]{}()_%^$,.:;=+\-*/|])/g, "\\");
}

