// File name → which adapter reads it (08-CONTRACT §2 adapters). EPS is refused by F12
// (`UnsupportedFormat`); the files step says so before anything is read.
import type { SourceFileInfo } from 'lib/pattern-import/types';

const KIND_OF_EXT: Record<string, SourceFileInfo['kind']> = {
  pdf: 'pdf',
  dxf: 'dxf',
  png: 'raster',
  jpg: 'raster',
  jpeg: 'raster',
  tif: 'raster',
  tiff: 'raster',
  plt: 'hpgl',
  hpgl: 'hpgl',
  hpg: 'hpgl',
  svg: 'svg',
  ai: 'ai',
};

export function kindOfName(name: string): SourceFileInfo['kind'] | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return KIND_OF_EXT[ext] ?? null;
}

/**
 * The two measured sides of a test square, as F1 reports them in the evidence text
 * (`… [measured 100.270 × 99.890 mm]`). ScaleCandidate carries one mean `measuredMm`; a Burda
 * square is 100.27 × 99.89 in the file, and one factor cannot correct both directions — the scale
 * step shows the pair and asks. null = not a measured square.
 */
export function squareSidesOf(text: string | undefined): { w: number; h: number } | null {
  const m = /\[measured ([\d.]+) × ([\d.]+) mm\]/.exec(text ?? '');
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h } : null;
}

/** Relative difference of the two sides: 0.0038 for 100.27 × 99.89. */
export const anisotropyOf = (s: { w: number; h: number }) =>
  Math.abs(s.w - s.h) / ((s.w + s.h) / 2);
