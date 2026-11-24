import type { IRText } from 'lib/pattern-import/types';

// A tiled PDF may spell one cutting instruction in two text operators on adjacent pages.
// Join only a unique continuation that completes an identifiable instruction or piece title.
const complete =
  /^(?:cut \d{1,2} of fabric(?: and lining)?|(?:front|back) (?:top|bottom)|\(fabric face (?:up|down)\))$/i;
export function restoreCutLabels(texts: IRText[]): IRText[] {
  const consumed = new Set<IRText>();
  const restored = new Map<IRText, IRText>();
  for (const a of texts) {
    if (!/^(?:cu?$|cut\b|front\b|back\b|\(fab)/i.test(a.text)) continue;
    // Axis-aligned glyph boxes give an exact baseline extent for orthogonal text only.
    if (a.rotationDeg % 90 !== 0) continue;
    const z = (a.rotationDeg * Math.PI) / 180,
      dx = Math.cos(z),
      dy = Math.sin(z);
    const end = Math.max(
      ...[a.bbox.minX, a.bbox.maxX].flatMap((x) =>
        [a.bbox.minY, a.bbox.maxY].map((y) => (x - a.anchor.x) * dx + (y - a.anchor.y) * dy),
      ),
    );
    const matches = texts.flatMap((b) => {
      if (
        b.src.page === a.src.page ||
        b.src.file !== a.src.file ||
        b.layer !== a.layer ||
        b.rotationDeg !== a.rotationDeg ||
        Math.abs(a.fontSizeMm - b.fontSizeMm) > 0.01
      )
        return [];
      const x = b.anchor.x - a.anchor.x,
        y = b.anchor.y - a.anchor.y,
        gap = x * dx + y * dy - end;
      if (Math.abs(x * dy - y * dx) > 0.02 || gap < -0.02 || gap > 0.35 * a.fontSizeMm) return [];
      const word = a.text.trimEnd() + (gap > 0.08 * a.fontSizeMm ? ' ' : '') + b.text.trimStart();
      return complete.test(word) ? [{ b, word }] : [];
    });
    if (matches.length !== 1) continue;
    const { b, word } = matches[0];
    if (consumed.has(b)) continue;
    consumed.add(b);
    restored.set(a, {
      ...a,
      text: word,
      bbox: {
        minX: Math.min(a.bbox.minX, b.bbox.minX),
        maxX: Math.max(a.bbox.maxX, b.bbox.maxX),
        minY: Math.min(a.bbox.minY, b.bbox.minY),
        maxY: Math.max(a.bbox.maxY, b.bbox.maxY),
      },
    });
  }
  return consumed.size
    ? texts.filter((t) => !consumed.has(t)).map((t, id) => ({ ...(restored.get(t) ?? t), id }))
    : texts;
}
