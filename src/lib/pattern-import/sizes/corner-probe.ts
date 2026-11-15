// CORNER PROBE · replay and diff (dev loop for sizes/corners.ts; used by scripts/pattern-import/corner-replay.ts).
// A probe is the exact input of one `closeCorners` call plus the output of the run that wrote it
// (`CornerProbe`, corners.ts). Replay runs the CURRENT corners code on it; the diff compares links, not
// only counts: which pair of ends was closed, at what vertex, over what gap, wide or not.
//
// What a replay can NOT tell: the fill and everything after the corner step. A closed corner is a
// derived wall; whether the piece it closes is the right one (or merges with a neighbour) only a
// run shows. And upstream changes (chains, ranks, `own`/`cand`, marks) need fresh probes.
import type { Chain, PtMm } from 'lib/pattern-import/types';

import { CORNER, closeCornersRun, type CornerOut, type CornerProbe } from './corners';

const dist = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

/** Replay the current code on a probe's input (never recorded again: no sink call). */
export function replayCornerProbe(p: CornerProbe): CornerOut {
  return closeCornersRun(
    p.chains,
    new Map(p.rankOf),
    new Map(p.styles),
    (c) => p.own[c] === true,
    (c) => p.cand[c] === true,
    p.n,
    p.marks,
  );
}

/** Stable text of an output: the equality used by --verify (key order is fixed by the code). */
export const outKey = (o: CornerOut) => JSON.stringify(o);

/**
 * A smaller probe: chains that no loop of the corner step can reach (not ranked, not `own`, not
 * `cand`) are replaced by empty stand-ins (same index, same style). Kept only when the replay
 * of the small probe is identical to the recorded output; otherwise the full probe is returned.
 */
export function liteProbe(p: CornerProbe): CornerProbe {
  const keep = (c: number) => p.own[c] || p.cand[c] || p.rankOf.some(([k]) => k === c);
  const chains: Chain[] = p.chains.map((ch, c) =>
    keep(c) ? ch : { ...ch, pts: [], ranges: [], lengthMm: 0, closed: false },
  );
  const lite = { ...p, chains };
  return outKey(replayCornerProbe(lite)) === outKey(p.out) ? lite : p;
}

/** Non-finite numbers JSON would turn into null (a probe that has any is not bit-exact). */
export function nonFiniteCount(p: CornerProbe): number {
  let n = 0;
  for (const ch of p.chains) {
    if (!Number.isFinite(ch.lengthMm)) n++;
    for (const q of ch.pts) if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) n++;
  }
  return n;
}

export type LinkView = {
  /** rule + the two ends, sorted: what identifies a link between two runs */
  key: string;
  rule: 'stub' | 'ramp' | 'extend';
  rank: number | null;
  ends: string[];
  via: PtMm | null;
  /** distance between the two ends' tips, mm (extend: the gap the corner closes) */
  gapMm: number;
  /** distance from each tip to the vertex, mm (extend) */
  armA: number;
  armB: number;
  /** an extend past `CORNER.extendMaxMm` on the gap or an arm: closed by the trend alone */
  wide: boolean;
};

/** The links an output closed, from its derived walls ([tipA, vertex…, tipB], own, ends). */
export function linksOf(rankOf: readonly [number, number][], out: CornerOut): LinkView[] {
  const rank = new Map(rankOf);
  return out.walls.map((w) => {
    const first = w.pts[0];
    const last = w.pts[w.pts.length - 1];
    const via = w.rule === 'extend' && w.pts.length >= 3 ? w.pts[1] : null;
    const gapMm = dist(first, last);
    const armA = via ? dist(first, via) : 0;
    const armB = via ? dist(via, last) : 0;
    return {
      key: `${w.rule} ${[...w.ends].sort().join('+')}`,
      rule: w.rule,
      rank: rank.get(w.own[0]) ?? null,
      ends: w.ends,
      via,
      gapMm,
      armA,
      armB,
      wide:
        w.rule === 'extend' &&
        (gapMm > CORNER.extendMaxMm || armA > CORNER.extendMaxMm || armB > CORNER.extendMaxMm),
    };
  });
}

export type LinkDiff = {
  added: LinkView[];
  removed: LinkView[];
  /** the same pair of ends, a different vertex (> 0.01 mm) or wide flag */
  moved: { before: LinkView; after: LinkView }[];
  same: number;
};

export function diffLinks(before: readonly LinkView[], after: readonly LinkView[]): LinkDiff {
  const b = new Map(before.map((l) => [l.key, l]));
  const a = new Map(after.map((l) => [l.key, l]));
  const d: LinkDiff = { added: [], removed: [], moved: [], same: 0 };
  for (const [k, l] of a) {
    const o = b.get(k);
    if (!o) d.added.push(l);
    else if (o.wide !== l.wide || (o.via && l.via && dist(o.via, l.via) > 0.01))
      d.moved.push({ before: o, after: l });
    else d.same++;
  }
  for (const [k, l] of b) if (!a.has(k)) d.removed.push(l);
  return d;
}

const COUNTS = ['stubs', 'ramps', 'extended', 'crossed', 'marked', 'wide'] as const;
/** One line per counter or refusal key that differs, '' when nothing does. */
export function diffCounts(before: CornerOut, after: CornerOut): string[] {
  const out: string[] = [];
  for (const k of COUNTS) if (before[k] !== after[k]) out.push(`${k} ${before[k]} → ${after[k]}`);
  const keys = new Set([...Object.keys(before.refused), ...Object.keys(after.refused)]);
  for (const k of [...keys].sort())
    if ((before.refused[k] ?? 0) !== (after.refused[k] ?? 0))
      out.push(`refused "${k}" ${before.refused[k] ?? 0} → ${after.refused[k] ?? 0}`);
  return out;
}
