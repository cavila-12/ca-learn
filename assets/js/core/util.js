export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function safeJsonParse(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

