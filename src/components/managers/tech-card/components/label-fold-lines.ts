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

// Stitch lines: where the label is sewn, mm from the top; 0 and the height are its edges.
export function parseStitchLines(csv: string | null | undefined, heightMm: number): number[] {
  const seen = new Set<number>();
  for (const part of (csv ?? '').split(',')) {
    const text = part.trim().replace(/\s+/g, '');
    if (!text) continue;
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0) continue;
    if (heightMm > 0 && value > heightMm) continue;
    seen.add(round1(value));
  }
  return [...seen].sort((a, b) => a - b).slice(0, MAX_FOLD_LINES);
}

export function formatStitchLines(lines: readonly number[], heightMm: number): string {
  return parseStitchLines(lines.join(','), heightMm).join(',');
}

/** The span that stays in front once folded: between the outer lines; one line keeps the longer side. */
export function foldFront(lines: readonly number[], heightMm: number): [number, number] {
  if (!lines.length || !(heightMm > 0)) return [0, heightMm];
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  if (lines.length === 1) return first >= heightMm - first ? [0, first] : [first, heightMm];
  return [first, last];
}

/** Where a point of the flat label lands on the folded one, mm from the folded top. */
export function foldedAt(mm: number, lines: readonly number[], heightMm: number): number {
  const [a, b] = foldFront(lines, heightMm);
  const at = mm < a ? 2 * a - mm : mm > b ? 2 * b - mm : mm;
  return round1(Math.min(b - a, Math.max(0, at - a)));
}

/** How many layers lie at a point of the folded label. */
export function layersAt(mm: number, lines: readonly number[], heightMm: number): number {
  const [a, b] = foldFront(lines, heightMm);
  const front = b - a;
  let layers = 1;
  if (a > 0 && mm <= a) layers += 1;
  if (b < heightMm && front - mm <= heightMm - b) layers += 1;
  return layers;
}

/**
 * The label as it lies on the garment: folded, then cut at its stitch line to the part that shows.
 * The sewn edge is the top edge of that part; without a stitch the whole folded label shows.
 */
export type LabelAssembly = {
  /** Folded size along the height. */
  foldedMm: number;
  /** The part that shows, the piece drawn in the assembly. */
  heightMm: number;
  /** The stitch lines on the folded label, mm from its top. */
  stitches: number[];
  /** The top edge of the shown part is the stitch. */
  sewnTop: boolean;
  /** Layers under the stitch. */
  layers: number;
};

export function labelAssembly(
  foldLines: readonly number[],
  stitchLines: readonly number[],
  heightMm: number,
): LabelAssembly {
  const [a, b] = foldFront(foldLines, heightMm);
  const foldedMm = round1(b - a);
  const stitches = [...new Set(stitchLines.map((mm) => foldedAt(mm, foldLines, heightMm)))].sort(
    (x, y) => x - y,
  );
  const first = stitches[0];
  if (first === undefined)
    return { foldedMm, heightMm: foldedMm, stitches, sewnTop: false, layers: 1 };
  const shown = Math.max(first, foldedMm - first);
  return {
    foldedMm,
    heightMm: round1(shown > 0 ? shown : foldedMm),
    stitches,
    sewnTop: shown > 0,
    layers: layersAt(first, foldLines, heightMm),
  };
}
