// SHAPE-KINK (18.10): one size (or a strict minority) carries turns the family's strict majority
// does not — a kink, a bump, a step in one size only (gate/shape.ts holds it under G5). This module
// straightens such a size onto the family's structure, by the chord across the offending stretch,
// and records every straightening (D5: piece note, ManifestBlock.kinkStraightened, passport).
//
// When (D3 — two independent evidences, never a silent change):
//   · the family: ≥ 3 sizes and a strict majority (≥ 2, > half) that pairwise share one turn
//     structure (shape-check.ts sameTurns); every size outside it is repaired, or nothing is;
//   · the repair: the chord only REMOVES turns — after it the size agrees with every majority size
//     and the whole family is one structure (a size that LACKS a turn of the majority cannot be
//     repaired: a chord never adds one); a hysteresis tie of majorities is decided by this test —
//     exactly one majority must admit a repair;
//   · the stretch, per tier:
//       'jitter'      ≤ JITTER_DEV_MM off the chord over ≤ JITTER_SPAN_MM (trace jitter, a spike);
//       'mark-detour' ≤ DETOUR_DEV_MM over ≤ DETOUR_SPAN_MM AND the size's own drawn line runs on
//                     the chord (the outline left its line; pieces/notch-marks.ts cleans most of
//                     these upstream, this is the fallback);
//       'operator'    ≤ OPERATOR_DEV_MM over ≤ OPERATOR_SPAN_MM, only for a size the operator asked
//                     to fix (api.fixShape) — the operator is the second evidence;
//   · never where any size of the family carries a notch (that is GRADE P1's notch question).

import type { ChainId, ChainSet, KinkRecord, KinkRule, PieceCandidate, PtMm } from '../types';
import { closestOnPolyline, dist, sampleAlong, signedArea } from './geom';
import {
  largestAgreeing,
  sameTurns,
  shapeOfCut,
  turnMismatch,
  turnsOf,
  type SizeShape,
} from './shape-check';

export const JITTER_DEV_MM = 2;
export const JITTER_SPAN_MM = 20;
export const DETOUR_DEV_MM = 6;
export const DETOUR_SPAN_MM = 160;
export const OPERATOR_DEV_MM = 6;
export const OPERATOR_SPAN_MM = 160;
/** A notch of any size this close to the straightened stretch (beyond its half span) vetoes it, mm. */
const NOTCH_CLEAR_MM = 10;
/** How many vertices each side of a turn a stretch may reach. */
const REACH_VERTS = 40;
/** A removed turn with a majority neighbour's turn this close is that size's feature too, mm. */
const SHARED_TURN_MM = 15;
/**
 * The most one size's search may measure (Σ vertices of the straightened outlines it tries; the
 * largest repair met, polupalto's crosses-drawn 44, takes 1.5 M). A line that jitters all along —
 * a motif drawn as crosses — is not a kink: past this the size is refused (D3: G5 holds the family),
 * where the search would run for minutes and still refuse.
 */
const SEARCH_WORK = 4_000_000;

export type { KinkRecord, KinkRule };

export type KinkLine = { rank: number; token: string; outer: PtMm[] };
/** A straightening with its geometry (sheet frame): the chord and the stretch it replaced. */
export type KinkDone = KinkRecord & { chord: [PtMm, PtMm]; removed: PtMm[] };

/** probe switch (node only): SHAPE_KINK_OFF=1 — no AUTOMATIC straightening (the operator's
 * fixShape still applies) */
export function kinkRepairOff(): boolean {
  return typeof process !== 'undefined' && !!process.env?.SHAPE_KINK_OFF;
}

/**
 * The size's own drawn line runs on the chord a→b: every 1 mm of it within 0.5 mm of a wall chain
 * of the size's own class or a common line (the 'mark-detour' evidence; never another size's line).
 */
export function ownLineOn(
  c: Pick<PieceCandidate, 'walls'>,
  set: ChainSet,
  ownClass: number | null,
  a: PtMm,
  b: PtMm,
): boolean {
  const clsOf = new Map<ChainId, { id: number; role: string }>();
  for (const k of set.classes) for (const id of k.chains) clsOf.set(id, { id: k.id, role: k.role });
  const lines = c.walls.flatMap((id) => {
    const k = clsOf.get(id);
    const ch = set.chains[id];
    if (!ch || !k) return [];
    if (k.role !== 'common' && !(k.role === 'size' && k.id === ownClass)) return [];
    return [ch];
  });
  if (!lines.length) return false;
  return sampleAlong([a, b], false, 1).every((q) =>
    lines.some((ch) => closestOnPolyline(q, ch.pts, ch.closed).d <= 0.5),
  );
}

export type KinkOpts = {
  /** every notch position of the family's sizes (sheet frame) — no straightening near one */
  notches?: readonly PtMm[];
  /** the size's own drawn line runs on the chord a→b (≤ 0.5 mm) — the 'mark-detour' evidence */
  ownLine?: (rank: number, a: PtMm, b: PtMm) => boolean;
  /** ranks the operator asked to straighten ('operator' tier allowed for them) */
  operator?: ReadonlySet<number>;
  /** no automatic straightening: only the operator's sizes are repaired (SHAPE_KINK_OFF) */
  autoOff?: boolean;
};

export type KinkResult = {
  /** per repaired rank: the straightened outline and what was straightened */
  byRank: Map<number, { outer: PtMm[]; kinks: KinkDone[] }>;
  /** why the family was left as it is ('' = nothing to do, or repaired) */
  why: string;
};

const SCALES = [
  { reach: 1.5, strong: 60, weak: 25 },
  { reach: 6, strong: 45, weak: 20 },
] as const;

/** How far the size is from agreeing with every canonical size (0 = agrees with all). */
function excess(d: SizeShape, canon: readonly SizeShape[]): number {
  let e = 0;
  for (const c of canon)
    for (let k = 0; k < d.events.length; k++) {
      const x = d.events[k];
      const y = c.events[k];
      if (!y) continue;
      e += Math.max(0, x.strong - y.weak) + Math.max(0, y.strong - x.weak);
    }
  return e;
}

/** A size lacks a turn every canonical size carries strongly: a chord cannot add it. */
function lacks(d: SizeShape, canon: readonly SizeShape[]): boolean {
  return canon.some((c) => c.events.some((y, k) => d.events[k] && y.strong > d.events[k].weak));
}

const ccw = (pts: readonly PtMm[]) => (signedArea(pts) < 0 ? [...pts].reverse() : [...pts]);

function segDist(p: PtMm, a: PtMm, b: PtMm): number {
  return closestOnPolyline(p, [a, b], false).d;
}

type Tier = { rule: KinkRule; dev: number; span: number };

/**
 * One size against the canonical shapes: the fewest chord straightenings (greedy, each one must
 * lower the excess) that make it agree with every one of them, or null.
 */
export function straightenSize(
  outer0: readonly PtMm[],
  canon: readonly SizeShape[],
  tiers: readonly Tier[],
  opts: {
    rank: number;
    notches?: readonly PtMm[];
    ownLine?: KinkOpts['ownLine'];
    /**
     * Codex r1: the strong turns of the size's nearest majority sizes — a stretch whose removed
     * turn has a same-sign turn of the same scale there (≤ SHARED_TURN_MM) is a shared feature,
     * never straightened (the counts alone cannot tell the feature from the kink)
     */
    refTurns?: readonly { at: PtMm; deg: number; reach: number }[];
  },
): { outer: PtMm[]; kinks: KinkDone[] } | null {
  let outer = ccw(outer0);
  let sh = shapeOfCut(outer, 0, 0);
  if (lacks(sh, canon)) return null;
  let E = excess(sh, canon);
  const kinks: KinkDone[] = [];
  let work = 0;
  for (let iter = 0; E > 0 && iter < 6; iter++) {
    const n = outer.length;
    // the strong turns of this size — the extra ones are among them
    const turns = SCALES.flatMap((sc) =>
      turnsOf(outer, sc.reach)
        .filter((t) => Math.abs(t.deg) > sc.strong)
        .map((t) => ({ ...t, reach: sc.reach })),
    );
    type Best = { outer: PtMm[]; E: number; arc: number; rec: KinkDone };
    const hold: { best: Best | null } = { best: null };
    // the excess after a chord a→b depends on the pair alone: neighbouring turns and both tiers
    // try the same pairs (a jagged motif line has a turn every few vertices), measured once
    const excessOf = new Map<number, number>();
    for (const t of turns) {
      let v = 0;
      let vd = Infinity;
      outer.forEach((q, i) => {
        const d = dist(q, t.at);
        if (d < vd) {
          vd = d;
          v = i;
        }
      });
      for (const tier of tiers) {
        let found = false;
        // vertices back / forward within the tier's span
        const back: { i: number; arc: number }[] = [];
        const fwd: { i: number; arc: number }[] = [];
        for (const [dir, list] of [
          [-1, back],
          [1, fwd],
        ] as const) {
          let arc = 0;
          let k = v;
          for (let s = 1; s <= Math.min(REACH_VERTS, n - 2); s++) {
            const j = (k + dir + n) % n;
            arc += dist(outer[k], outer[j]);
            if (arc > tier.span * 1.6 + 2) break;
            list.push({ i: j, arc });
            k = j;
          }
        }
        for (const a of [{ i: v, arc: 0 }, ...back])
          for (const b of [{ i: v, arc: 0 }, ...fwd]) {
            if (a.i === b.i) continue;
            if (back.length + fwd.length + 1 >= n - 1 && (b.i - a.i + n) % n >= n - 2) continue;
            const P = outer[a.i];
            const Q = outer[b.i];
            const span = dist(P, Q);
            if (span > tier.span || span < 0.05) continue;
            // the stretch strictly between a and b, its deviation from the chord
            const mid: PtMm[] = [];
            for (let i = (a.i + 1) % n; i !== b.i; i = (i + 1) % n) mid.push(outer[i]);
            if (!mid.length) continue;
            const dev = Math.max(...mid.map((q) => segDist(q, P, Q)));
            if (dev > tier.dev || dev < 0.05) continue;
            // not at a notch place of any size
            const c = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
            if ((opts.notches ?? []).some((q) => dist(q, c) <= span / 2 + NOTCH_CLEAR_MM)) continue;
            if (tier.rule === 'mark-detour' && !opts.ownLine?.(opts.rank, P, Q)) continue;
            // a turn this stretch removes that the nearest majority sizes also have: shared
            const shared = turns.some(
              (u) =>
                mid.some((q) => dist(q, u.at) < 0.05) &&
                (opts.refTurns ?? []).some(
                  (r) =>
                    r.reach === u.reach &&
                    Math.sign(r.deg) === Math.sign(u.deg) &&
                    dist(r.at, u.at) <= SHARED_TURN_MM,
                ),
            );
            if (shared) continue;
            const chordOf = () => {
              const next: PtMm[] = [];
              for (let i = b.i; ; i = (i + 1) % n) {
                next.push(outer[i]);
                if (i === a.i) break;
              }
              return next;
            };
            const left = ((a.i - b.i + n) % n) + 1;
            if (left < 3) continue;
            let E2 = excessOf.get(a.i * n + b.i);
            if (E2 === undefined) {
              work += left;
              if (work > SEARCH_WORK) return null;
              E2 = excess(shapeOfCut(chordOf(), 0, 0), canon);
              excessOf.set(a.i * n + b.i, E2);
            }
            const arc = a.arc + b.arc;
            if (E2 >= E) continue;
            found = true;
            const best = hold.best;
            if (!best || E2 < best.E || (E2 === best.E && arc < best.arc))
              hold.best = {
                outer: chordOf(),
                E: E2,
                arc,
                rec: {
                  at: { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 },
                  mm: Math.round(dev * 10) / 10,
                  spanMm: Math.round(span * 10) / 10,
                  rule: tier.rule,
                  chord: [P, Q],
                  removed: [P, ...mid, Q],
                },
              };
          }
        // the strictest tier that helps at this turn wins: a looser one only when it did not
        if (found) break;
      }
    }
    const best = hold.best;
    if (!best) return null;
    outer = best.outer;
    E = best.E;
    kinks.push(best.rec);
    sh = shapeOfCut(outer, 0, 0);
    if (lacks(sh, canon)) return null;
  }
  return E === 0 ? { outer, kinks } : null;
}

const AUTO_TIERS: Tier[] = [
  { rule: 'jitter', dev: JITTER_DEV_MM, span: JITTER_SPAN_MM },
  { rule: 'mark-detour', dev: DETOUR_DEV_MM, span: DETOUR_SPAN_MM },
];
const OPERATOR_TIERS: Tier[] = [
  ...AUTO_TIERS,
  { rule: 'operator', dev: OPERATOR_DEV_MM, span: OPERATOR_SPAN_MM },
];

/**
 * The family (one piece's sizes, drawn outlines): which sizes to straighten onto the strict
 * majority's structure. Nothing is changed unless every size off the majority is repaired, the
 * repaired family is one structure, and exactly one majority admits that (ties of majorities).
 */
export function repairMinorityKinks(lines: readonly KinkLine[], opts: KinkOpts = {}): KinkResult {
  const byRank = new Map<number, { outer: PtMm[]; kinks: KinkDone[] }>();
  const n = lines.length;
  if (n < 3) return { byRank, why: '' };
  const sh = lines.map((l) => shapeOfCut(ccw(l.outer), 0, 0));
  if (!turnMismatch(sh)) return { byRank, why: '' };
  const groups = largestAgreeing(sh).filter((g) => g.length >= 2 && 2 * g.length > n);
  if (!groups.length) return { byRank, why: 'no strict majority of sizes shares one shape' };
  const solutions: Map<number, { outer: PtMm[]; kinks: KinkDone[] }>[] = [];
  let lastWhy = '';
  for (const g of groups) {
    const canon = g.map((i) => sh[i]);
    const inG = new Set(g);
    const sol = new Map<number, { outer: PtMm[]; kinks: KinkDone[] }>();
    const partialLeft = new Set<number>();
    let ok = true;
    for (let d = 0; d < n && ok; d++) {
      if (inG.has(d)) continue;
      const tiers = opts.operator?.has(lines[d].rank)
        ? OPERATOR_TIERS
        : opts.autoOff
          ? []
          : AUTO_TIERS;
      // the two majority sizes nearest in the run: their strong turns (shared features)
      const near = [...g]
        .sort(
          (x, y) =>
            Math.abs(lines[x].rank - lines[d].rank) - Math.abs(lines[y].rank - lines[d].rank),
        )
        .slice(0, 2);
      const refTurns = near.flatMap((i) =>
        SCALES.flatMap((sc) =>
          // Codex r2: a majority turn above the WEAK threshold already matches a strong one
          turnsOf(ccw(lines[i].outer), sc.reach)
            .filter((t) => Math.abs(t.deg) > sc.weak)
            .map((t) => ({ ...t, reach: sc.reach })),
        ),
      );
      const r = straightenSize(lines[d].outer, canon, tiers, {
        rank: lines[d].rank,
        notches: opts.notches,
        ownLine: opts.ownLine,
        refTurns,
      });
      if (!r && opts.operator?.size && !opts.operator.has(lines[d].rank)) {
        // the operator's move repairs its own size; another dissenter stays as it is (still held)
        partialLeft.add(d);
        continue;
      }
      if (!r) {
        ok = false;
        lastWhy = lacks(sh[d], canon)
          ? `${lines[d].token} lacks a turn the other sizes have — straightening cannot add it`
          : `${lines[d].token}: no straightening within the limits makes it the family's shape`;
      } else sol.set(lines[d].rank, r);
    }
    if (!ok || !sol.size) continue;
    // the repaired family is ONE structure (every pair agrees)
    const after = lines.map((l) => {
      const r = sol.get(l.rank);
      return shapeOfCut(r ? r.outer : ccw(l.outer), 0, 0);
    });
    if (
      after.some(
        (a, i) =>
          !partialLeft.has(i) &&
          after.some((b, j) => i < j && !partialLeft.has(j) && !sameTurns(a, b)),
      )
    ) {
      lastWhy = 'the straightened sizes still differ';
      continue;
    }
    solutions.push(sol);
  }
  if (solutions.length !== 1)
    return {
      byRank,
      why: solutions.length ? 'two majorities admit different repairs' : lastWhy,
    };
  return { byRank: solutions[0], why: '' };
}
