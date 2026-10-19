// The map says in words what the picture only hints at (D5, D9): lengths and notches per seam, how
// sure the read is, and which units the result goes into next. Shared by the screen and the print
// key so «416 onto 515 mm, eased» reads the same on both.

import { SKELETON, type SeamCandidate } from '../types';
import { resolveEdge, pieceKeyOf } from '../union/layout';
import { edgesOf } from './frame';
import type { MapRead, MapStep } from './step-seams';

export type ConfidenceWord = 'sure' | 'likely' | 'check';

/** D5: sure ≥ 0.9 · likely ≥ 0.6 · check below, and `check` when nothing was read. */
export function confidenceWord(score: number | null | undefined): ConfidenceWord {
  if (score == null || !Number.isFinite(score)) return 'check';
  return score >= 0.9 ? 'sure' : score >= SKELETON.accept ? 'likely' : 'check';
}

/**
 * How sure the map is of step `i`: a proposal step's own confidence when it has one, else the
 * weakest seam it sews; a join with no seams is `check` (its edges were never read).
 */
export function stepConfidence(read: MapRead, i: number, own?: number | null): ConfidenceWord {
  if (own != null) return confidenceWord(own);
  const seams = read.seams[i] ?? [];
  if (seams.length === 0) return 'check';
  return confidenceWord(Math.min(...seams.map((c) => c.score)));
}

/** Another reading within the ambiguity band exists for one of the step's seams. */
export const stepReadings = (read: MapRead, i: number): number =>
  Math.max(1, ...(read.seams[i] ?? []).map((c) => 1 + (c.ambiguousWith?.length ?? 0)));

const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;

/**
 * One seam in words: `BP 1 L ↔ BP L · 416 onto 515 mm, eased · no notches · partial`. Equal when
 * within SKELETON.lenAbsMm / lenRel (the matcher's own tolerance).
 */
export function seamWords(read: MapRead, c: SeamCandidate, nameOf: (k: string) => string): string {
  const len = (id: string, ev?: number) => ev ?? resolveEdge(id, read.geoms)?.len ?? null;
  const a = len(c.a, c.evidence?.aLenMm);
  const b = len(c.b, c.evidence?.bLenMm);
  const r = (v: number | null) => (v == null ? '?' : String(Math.round(v)));
  let lens = `${r(a)} · ${r(b)} mm`;
  if (a != null && b != null) {
    const eq = Math.abs(a - b) <= Math.max(SKELETON.lenAbsMm, SKELETON.lenRel * Math.max(a, b));
    lens = eq ? `${r(a)} = ${r(b)} mm` : `${r(a)} onto ${r(b)} mm, eased`;
  }
  const notchCount = (id: string) => {
    const g = read.geoms.get(pieceKeyOf(id));
    return g ? edgesOf(id, g).reduce((n, e) => n + e.notchesMm.length, 0) : 0;
  };
  const na = notchCount(c.a);
  const nb = notchCount(c.b);
  // Older evidence carries only the score: 0.7 and up means the notches line up along the pair.
  const matched =
    c.evidence?.notchesMatched ?? ((c.evidence?.notchScore ?? 0) >= 0.7 ? Math.min(na, nb) : 0);
  const notches =
    matched > 0
      ? `${plural(matched, 'notch', 'notches')} match`
      : na + nb > 0
        ? `notches ${na} / ${nb}, none match`
        : 'no notches';
  const kind =
    c.kind === 'partial'
      ? ' · partial'
      : c.kind === 'composite'
        ? ' · across several edges'
        : c.kind === 'surface'
          ? ' · sewn on top'
          : '';
  return `${nameOf(pieceKeyOf(c.a))} ↔ ${nameOf(pieceKeyOf(c.b))} · ${lens} · ${notches}${kind}`;
}

export type ThenUnit = { step: number; unitKey: string };

/**
 * The units the result of step `i` is sewn into, in order (`consumedBy` followed to the end): the
 * next step that takes the unit and makes ANOTHER one; steps that only add to or process the same
 * unit are walked through. A step that makes nothing follows its single input.
 */
export function thenChain(steps: readonly MapStep[], i: number, cap = 64): ThenUnit[] {
  const s = steps[i];
  if (!s) return [];
  const inputs = s.inputs.map((k) => k.trim()).filter(Boolean);
  let unit = s.outputUnitKey.trim() || (inputs.length === 1 ? inputs[0] : '');
  const out: ThenUnit[] = [];
  let at = i;
  while (unit && out.length < cap) {
    let next = -1;
    for (let j = at + 1; j < steps.length; j++) {
      const o = steps[j].outputUnitKey.trim();
      if (o && o !== unit && steps[j].inputs.some((k) => k.trim() === unit)) {
        next = j;
        break;
      }
    }
    if (next < 0) break;
    unit = steps[next].outputUnitKey.trim();
    out.push({ step: next, unitKey: unit });
    at = next;
  }
  return out;
}
