// A label's fold lines: positions in mm along its height, from the top edge. Stored as CSV
// ("12,88"); a label saved before the lines existed derives them from its fold word.

export const MAX_FOLD_LINES = 8;

type FoldLabel = {
  foldLinesMm?: string | null;
  fold?: string | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function parseFoldLines(csv: string | null | undefined, heightMm: number): number[] {
  const seen = new Set<number>();
  for (const part of (csv ?? '').split(',')) {
    const text = part.trim().replace(/\s+/g, '');
    if (!text) continue;
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (heightMm > 0 && value >= heightMm) continue;
    seen.add(round1(value));
  }
  return [...seen].sort((a, b) => a - b).slice(0, MAX_FOLD_LINES);
}

export function formatFoldLines(lines: readonly number[], heightMm: number): string {
  return parseFoldLines(lines.join(','), heightMm).join(',');
}

/** The ends' fold depth for a label of this height. */
export function endDepthMm(heightMm: number): number {
  return round1(Math.max(1, Math.min(10, heightMm / 5)));
}

export function presetFoldLines(fold: string, heightMm: number): number[] {
  if (!(heightMm > 0)) return [];
  if (fold === 'half' || fold === 'loop') return [round1(heightMm / 2)];
  if (fold === 'ends' || fold === 'mitre') {
    const depth = endDepthMm(heightMm);
    return depth * 2 < heightMm ? [depth, round1(heightMm - depth)] : [round1(heightMm / 2)];
  }
  return [];
}

/** The lines the label is drawn with: the stored ones, else the ones its fold word implies. */
export function labelFoldLines(label: FoldLabel, heightMm: number): number[] {
  const stored = parseFoldLines(label.foldLinesMm, heightMm);
  if (stored.length || (label.foldLinesMm ?? '').trim()) return stored;
  return presetFoldLines((label.fold ?? '').trim(), heightMm);
}

/** What folds under: from each end to the nearest line; one line = everything after it. */
export function foldedSpans(lines: readonly number[], heightMm: number): [number, number][] {
  if (!lines.length || !(heightMm > 0)) return [];
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  if (lines.length === 1) return [[first, heightMm]];
  return [
    [0, first],
    [last, heightMm],
  ];
}

/** The fold word a set of lines reads as, for the PDF table and older readers. */
export function foldWordOf(lines: readonly number[], heightMm: number): string {
  if (!lines.length) return 'flat';
  if (lines.length === 1)
    return Math.abs(lines[0]! - heightMm / 2) <= heightMm * 0.05 ? 'half' : 'loop';
  return 'ends';
}
