// THE DOLL IN WORDS (01-DESIGN-L0 §4, §6): the state line, the report's rows, the POM rail's
// exactness — lengths in millimetres, rules in words, never a bare score. Monochrome: weight and
// words carry the state; only `check` (a seam the doll could not close as drawn, a measure off its
// spec) takes the blue tone.

import type { EdgeId, PieceGeom } from 'lib/assembly-skeleton/types';
import type { DollReport, DollSeamReport, DollSeamState } from 'lib/doll/types';
import type { ChartComparison, PomValue } from 'lib/pom';
import { sideWords, type RoleWords } from '../assembly-seams/words';

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

/** Seams the report strip lists, worst first: what the doll could not close as drawn. */
const RANK: Record<DollSeamState, number> = {
  open: 0,
  twisted: 1,
  proposed: 2,
  stretched: 3,
  eased: 9,
  closed: 9,
};

export type ReportRow =
  | {
      kind: 'seam';
      key: string;
      state: DollSeamState;
      /** Shown with the blue `check` pill. */
      check: boolean;
      who: string;
      gap: string;
      note: string;
      seam: DollSeamReport;
    }
  | { kind: 'words'; key: string; label: string; text: string; check: boolean };

/** The gap a seam keeps, in words: «18 mm open at its worst», «closes, stretching 4 %». */
function gapWords(s: DollSeamReport): string {
  const mm = (v: number) => `${Math.round(v)} mm`;
  if (s.state === 'open' || s.state === 'twisted')
    return `${mm(s.residualMaxMm)} apart at the worst point`;
  if (s.state === 'stretched') return `closes only by stretching ${Math.round(s.stretchPct)} %`;
  if (s.state === 'proposed')
    return `${Math.round(s.lenA)} ≈ ${Math.round(s.lenB)} mm, not in the pattern`;
  return `gap ${mm(s.residualP95Mm)}`;
}

const KIND_WORDS: Partial<Record<DollSeamReport['kind'], string>> = {
  'proposed-composite': 'proposed by the doll from the free loops',
  'proposed-closure': 'proposed as the front closure',
  'from-order': 'proposed from the technologist’s order',
  'facing-free': 'a facing left free',
};

export function reportRows(
  r: DollReport,
  geoms: ReadonlyMap<string, PieceGeom>,
  roles: RoleWords,
  names: ReadonlyMap<string, string>,
): ReportRow[] {
  const rows: ReportRow[] = [];
  const say = (t: string) => namedKeys(t, names);
  for (const w of r.contradictions ?? [])
    rows.push({ kind: 'words', key: `c:${w}`, label: 'contradiction', text: say(w), check: true });
  const seams = seamsOf(r)
    .filter((s) => RANK[s.state] < 9)
    .sort((a, b) => RANK[a.state] - RANK[b.state] || b.residualMaxMm - a.residualMaxMm);
  for (const s of seams) {
    const side = (ids: EdgeId[]) => (ids.length ? sideWords(ids, geoms, roles) : 'free loop');
    rows.push({
      kind: 'seam',
      key: `s:${s.id}`,
      state: s.state,
      check: s.state === 'open' || s.state === 'twisted' || s.state === 'stretched',
      who: say(`${side(s.a)} ↔ ${side(s.b)}`),
      gap: gapWords(s),
      note: KIND_WORDS[s.kind] ?? (s.decidedBy === 'person' ? 'confirmed by a person' : ''),
      seam: { ...s, note: say(s.note) },
    });
  }
  for (const f of r.floating)
    rows.push({
      kind: 'words',
      key: `f:${f.pieceKey}`,
      label: 'floating',
      text: `${(names.get(f.pieceKey) ?? geoms.get(f.pieceKey)?.name ?? f.pieceKey).replace(/_/g, ' ')} · ${say(f.reason)}`,
      check: true,
    });
  for (const w of r.rows?.words ?? [])
    rows.push({
      kind: 'words',
      key: `r:${w}`,
      label: 'stored rows',
      text: w,
      check: /stale|not found/.test(w),
    });
  return rows;
}

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
