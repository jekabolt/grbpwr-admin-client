// THE DOLL IN WORDS (01-DESIGN-L0 §4, §6): the state line and the POM rail's exactness — lengths
// in millimetres, rules in words, never a bare score.

import type { DollReport, DollSeamState } from 'lib/doll/types';
import type { ChartComparison, PomValue } from 'lib/pom';

const seamsOf = (r: DollReport) => r.seams.filter((s) => s.origin !== 'layer');

export type DollCounts = {
  closed: number;
  stretched: number;
  proposed: number;
  open: number;
};

export function dollCounts(r: DollReport): DollCounts {
  const c: DollCounts = { closed: 0, stretched: 0, proposed: 0, open: 0 };
  for (const s of seamsOf(r)) {
    if (s.state === 'closed' || s.state === 'eased') c.closed++;
    else if (s.state === 'stretched') c.stretched++;
    else if (s.state === 'proposed') c.proposed++;
    else c.open++;
  }
  return c;
}

/** «21 seams closed · 3 stretched · 2 proposed · 1 open» — zero terms after the first left out. */
export function stateLine(r: DollReport): string {
  if (r.notGarment) return r.notGarment;
  const c = dollCounts(r);
  const parts = [`${c.closed} ${c.closed === 1 ? 'seam' : 'seams'} closed`];
  if (c.stretched) parts.push(`${c.stretched} stretched`);
  if (c.proposed) parts.push(`${c.proposed} proposed`);
  if (c.open) parts.push(`${c.open} open`);
  return parts.join(' · ');
}

export const STATE_WORD: Record<DollSeamState, string> = {
  closed: 'closed',
  eased: 'eased',
  stretched: 'stretched',
  open: 'open',
  twisted: 'twisted',
  proposed: 'proposed',
};

/** «exact», «approx · darts crossing the level», «not found · no armhole edge read». */
export function exactnessWords(
  v: PomValue,
  names: ReadonlyMap<string, string> = new Map(),
): { word: string; why: string } {
  const why = namedKeys(v.reason ?? '', names);
  if (v.exactness === 'exact') return { word: 'exact', why };
  if (v.exactness === 'approx') return { word: 'approx', why };
  return { word: 'not found', why: why || 'no landmark read on this pattern' };
}

export const cm = (mm: number) => (mm / 10).toFixed(1);

/** Δ against the size chart: «spec 53.0 · Δ +1.2 cm (±1 default)». */
export function specWords(c: ChartComparison | undefined): string | null {
  if (!c) return null;
  const tol = `±${cm(c.tolMm)} ${c.tolSource === 'default' ? 'default' : ''}`.trim();
  if (c.deltaMm == null) return `spec ${cm(c.specMm)} · not read from the pattern`;
  const sign = c.deltaMm > 0 ? '+' : c.deltaMm < 0 ? '−' : '±';
  return `spec ${cm(c.specMm)} · Δ ${sign}${cm(Math.abs(c.deltaMm))} cm (${tol})`;
}

/**
 * The engine's words carry piece line keys («01M1…Q#3»): the card's piece names read instead
 * («FP L #3»), so no row shows a raw key.
 */
export function namedKeys(text: string, names: ReadonlyMap<string, string>): string {
  if (!text || names.size === 0) return text;
  let out = text;
  // Longest key first: no key is cut by a shorter one inside it.
  for (const [key, name] of [...names].sort((x, y) => y[0].length - x[0].length))
    if (key.length >= 6 && out.includes(key)) out = out.split(key).join(name.replace(/_/g, ' '));
  return out;
}
