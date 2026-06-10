// Word-wrap `text` into lines no wider than `maxWidth`, measuring with the
// caller-supplied `measure` function (so this stays pure and unit-testable —
// canvas code passes `(s) => ctx.measureText(s).width`).
//
// Unlike a naive greedy wrap, a single word wider than `maxWidth` is hard-broken
// into character chunks so an unbreakable headline can never overflow the canvas.
export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';

  for (const word of words) {
    // A word that can't fit on its own line gets hard-broken. Flush the current
    // line first, emit the full chunks, and keep the trailing chunk as `cur` so
    // following words can still pack onto it.
    if (measure(word) > maxWidth) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      const chunks = breakWord(measure, word, maxWidth);
      for (let i = 0; i < chunks.length - 1; i++) lines.push(chunks[i]);
      cur = chunks[chunks.length - 1] ?? '';
      continue;
    }

    const test = cur ? cur + ' ' + word : word;
    if (measure(test) > maxWidth && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }

  if (cur) lines.push(cur);
  return lines;
}

// Split a single overlong word into character chunks that each fit `maxWidth`.
// The `cur &&` guard guarantees at least one character lands per chunk, so this
// terminates even when a single glyph is wider than `maxWidth`.
function breakWord(
  measure: (text: string) => number,
  word: string,
  maxWidth: number,
): string[] {
  const chars = Array.from(word); // Array.from keeps surrogate pairs intact.
  const chunks: string[] = [];
  let cur = '';
  for (const ch of chars) {
    const test = cur + ch;
    if (cur && measure(test) > maxWidth) {
      chunks.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
