import { isGirth } from './chart-points';
import type { PomCode, PomReport } from './types';

export type PatternChartValues = Map<PomCode, Map<number, number>>;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * Finished-garment centimetres keyed by POM and card size id. Pattern reports are millimetres;
 * girths always use the flat half reading. A missing/not-found measurement is absent, never zero.
 */
export function chartFromReport(
  report: PomReport,
  points: readonly PomCode[],
  sizeMap: ReadonlyMap<string, number>,
  shrinkPct: number,
): PatternChartValues {
  const wanted = new Set(points);
  const out: PatternChartValues = new Map();
  const shrink = Number.isFinite(shrinkPct) ? shrinkPct : 0;
  for (const size of report.sizes) {
    const cardSizeId = sizeMap.get(size.size);
    if (!cardSizeId) continue;
    for (const value of size.values) {
      if (!wanted.has(value.code) || value.exactness === 'not-found') continue;
      const mm = isGirth(value.code) ? value.halfMm : value.valueMm;
      if (mm == null || !Number.isFinite(mm) || mm <= 0) continue;
      const finished = oneDecimal((mm / 10) * (1 - shrink / 100));
      if (finished <= 0) continue;
      const row = out.get(value.code) ?? new Map<number, number>();
      row.set(cardSizeId, finished);
      out.set(value.code, row);
    }
  }
  return out;
}

/** Piece-line evidence stored with a chart point; never rendered as operator-facing text. */
export function chartBasisFromReport(
  report: PomReport,
  points: readonly PomCode[],
): Map<PomCode, string[]> {
  const wanted = new Set(points);
  const out = new Map<PomCode, Set<string>>();
  for (const size of report.sizes) {
    for (const value of size.values) {
      if (!wanted.has(value.code)) continue;
      const basis = out.get(value.code) ?? new Set<string>();
      for (const edge of value.basis ?? []) {
        const cut = edge.lastIndexOf('#');
        const pieceKey = cut > 0 ? edge.slice(0, cut) : edge;
        if (pieceKey) basis.add(pieceKey);
      }
      out.set(value.code, basis);
    }
  }
  return new Map([...out].map(([code, keys]) => [code, [...keys].sort()]));
}
