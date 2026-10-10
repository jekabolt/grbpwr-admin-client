// Stored seams on every size (L2b). Anchors are resolved on the size they were confirmed on
// (`StoredSeam.anchoredSize`); the resolved runs are then CARRIED to each other size by the piece's
// topology: a graded piece keeps its corner / edge sequence, so edge i of the base size is the
// edge of the other size that sits at the same place in that sequence — matched by edge count,
// the edges' shapes in the unit square (all frames: as is / 180° / mirrored, every start offset),
// their share of the perimeter and their notch counts. Shape fit at the design threshold is the
// fallback only where the topology differs (a corner appeared or vanished) or is ambiguous; what
// still does not fit is stale, the words naming the size.

import type { EdgeId, PieceGeom } from 'lib/assembly-skeleton/types';
import { FRAMES, frameOf, inFrame, rmsFit, runSamples, runsOfPiece, type SeamRun } from './frame';
import { hitOf, resolveSeamDecisions } from './resolve';
import {
  SEAMS,
  type AnchorHit,
  type EdgeAnchor,
  type Frame,
  type ResolveOptions,
  type Resolved,
  type StoredSeam,
} from './types';

/** Thresholds of the topology transfer (measured on SS26-005, cards 4–11, XS…XL). */
export const TRANSFER = {
  /** Mean per-edge cost (sample RMS in the unit square + perimeter-share difference) accepted. */
  costMax: 0.08,
  /** The chosen edge sequence must beat any other offset in the same frame by this much. */
  margin: 0.02,
  /** One edge whose notch count differs costs this much (a graded notch rarely moves). */
  notchPenalty: 0.03,
} as const;

/** Frames as (flipU, flipV): composition is XOR, a frame walks the run backwards when exactly one flips. */
const BITS: Record<Frame, [number, number]> = {
  asis: [0, 0],
  rot180: [1, 1],
  mirrorU: [1, 0],
  mirrorV: [0, 1],
};
const composeFrames = (a: Frame, b: Frame): Frame => {
  const u = BITS[a][0] ^ BITS[b][0];
  const v = BITS[a][1] ^ BITS[b][1];
  return (Object.keys(BITS) as Frame[]).find((f) => BITS[f][0] === u && BITS[f][1] === v)!;
};
const backwards = (f: Frame) => (BITS[f][0] ^ BITS[f][1]) === 1;

export type EdgeMap = { map: Map<EdgeId, EdgeId>; frame: Frame; cost: number };

/**
 * Edge i of `base` → edge of `target` at the same place in the piece's edge sequence, or null when
 * the sequences differ (edge count) or no single offset fits clearly. Both pieces keep their own
 * grain-upright frames.
 */
export function edgeMapOf(
  base: PieceGeom,
  target: PieceGeom,
  degBase = 0,
  degTarget = 0,
): EdgeMap | null {
  const n = base.edges.length;
  if (n === 0 || target.edges.length !== n) return null;
  const fb = frameOf(base, degBase);
  const ft = frameOf(target, degTarget);
  const sb = base.edges.map((e) => runSamples(fb, e));
  const st = target.edges.map((e) => runSamples(ft, e));
  const shareB = base.edges.map((e) => e.lenMm / (base.perimMm || 1));
  const shareT = target.edges.map((e) => e.lenMm / (target.perimMm || 1));
  const tried: { frame: Frame; shift: number; cost: number }[] = [];
  for (const frame of FRAMES) {
    const back = backwards(frame);
    for (let shift = 0; shift < n; shift++) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const j = back ? (((shift - i) % n) + n) % n : (i + shift) % n;
        cost +=
          rmsFit(inFrame(st[j], frame), sb[i]) +
          Math.abs(shareT[j] - shareB[i]) +
          (target.edges[j].notchesMm.length !== base.edges[i].notchesMm.length
            ? TRANSFER.notchPenalty
            : 0);
      }
      tried.push({ frame, shift, cost: cost / n });
    }
  }
  tried.sort((x, y) => x.cost - y.cost);
  // Sizes of one file sit in one frame: as is wins unless another frame is clearly better (a
  // symmetric piece fits mirrored as well — that is not a reason to flip it).
  const bestAsis = tried.find((t) => t.frame === 'asis');
  const pick = bestAsis && bestAsis.cost <= tried[0].cost + TRANSFER.margin ? bestAsis : tried[0];
  if (pick.cost > TRANSFER.costMax) return null;
  const rival = tried.find((t) => t !== pick && t.frame === pick.frame);
  if (rival && rival.cost - pick.cost < TRANSFER.margin) return null;
  const back = backwards(pick.frame);
  const map = new Map<EdgeId, EdgeId>();
  base.edges.forEach((e, i) => {
    const j = back ? (((pick.shift - i) % n) + n) % n : (i + pick.shift) % n;
    map.set(e.id, target.edges[j].id);
  });
  return { map, frame: pick.frame, cost: Math.round(pick.cost * 10000) / 10000 };
}

/** A base-size hit carried to the target piece through its edge map, or undefined. */
function carry(hit: AnchorHit, m: EdgeMap, runs: SeamRun[]): AnchorHit | undefined {
  const want = hit.edges.map((e) => m.map.get(e));
  if (want.some((e) => !e)) return undefined;
  const set = new Set(want as EdgeId[]);
  // A chain stays a chain: the same edges, contiguous on the target (walk order may flip).
  const run = runs.find((r) => r.edges.length === set.size && r.edges.every((e) => set.has(e.id)));
  if (!run) return undefined;
  return { ...hitOf(hit.anchor, run, 'topology', composeFrames(hit.frame, m.frame), m.cost) };
}

export type SizePieces = {
  size: string;
  pieces: readonly PieceGeom[];
  grainDeg?: ReadonlyMap<string, number>;
};

export type SizeResolved = Resolved & {
  size: string;
  /** Rows placed on this size by topology / by the shape fallback (base size: 0 / 0). */
  carried: number;
  byShape: number;
};

/**
 * Stored rows on every size given. Each row is resolved on its `anchoredSize` (the size it was
 * confirmed on; a row naming a size not given is resolved on every size by shape), then carried.
 * A row not applied on its base size is stale on every size with the base size's words.
 */
export function resolveAcrossSizes(
  rows: readonly StoredSeam[],
  sizes: readonly SizePieces[],
  opts: Omit<ResolveOptions, 'grainDeg' | 'preHit' | 'size'> = {},
): Map<string, SizeResolved> {
  const T = { ...SEAMS, ...opts.thresholds };
  const out = new Map<string, SizeResolved>(
    sizes.map((s) => [
      s.size,
      {
        size: s.size,
        forced: [],
        closures: [],
        excluded: [],
        words: [],
        applied: [],
        stale: [],
        orphan: [],
        carried: 0,
        byShape: 0,
      },
    ]),
  );
  const merge = (size: string, r: Resolved, carried = 0, byShape = 0) => {
    const o = out.get(size)!;
    o.forced.push(...r.forced);
    o.closures.push(...r.closures);
    o.excluded.push(...r.excluded);
    o.words.push(...r.words);
    o.applied.push(...r.applied);
    o.stale.push(...r.stale);
    o.orphan.push(...r.orphan);
    o.carried += carried;
    o.byShape += byShape;
  };
  const groups = new Map<string, StoredSeam[]>();
  for (const r of rows) {
    const k = sizes.some((s) => s.size === r.anchoredSize) ? r.anchoredSize : '';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [baseSize, group] of groups) {
    if (!baseSize) {
      for (const s of sizes)
        merge(
          s.size,
          resolveSeamDecisions(group, s.pieces, { ...opts, grainDeg: s.grainDeg, size: s.size }),
        );
      continue;
    }
    const B = sizes.find((s) => s.size === baseSize)!;
    const rb = resolveSeamDecisions(group, B.pieces, { ...opts, grainDeg: B.grainDeg });
    merge(B.size, rb);
    const hitOfAnchor = new Map<EdgeAnchor, AnchorHit>();
    for (const a of rb.applied) for (const h of [...a.a, ...a.b]) hitOfAnchor.set(h.anchor, h);
    const live = new Set(rb.applied.map((a) => a.seam));
    const notOnBase = [...rb.stale, ...rb.orphan];
    for (const S of sizes) {
      if (S === B) continue;
      // Not applied on the size it was confirmed on → not applied anywhere, said per size.
      for (const x of notOnBase) {
        const w = `${x.words} (on ${S.size}: not carried — the base size ${B.size} is stale)`;
        if ('reason' in x) out.get(S.size)!.stale.push({ ...x, words: w });
        else out.get(S.size)!.orphan.push({ ...x, words: w });
        out.get(S.size)!.words.push(w);
      }
      const maps = new Map<string, EdgeMap | null>();
      const runs = new Map<string, SeamRun[]>();
      const pieceB = new Map(B.pieces.map((p) => [p.pieceKey, p]));
      const pieceT = new Map(S.pieces.map((p) => [p.pieceKey, p]));
      const mapOf = (key: string) => {
        if (!maps.has(key)) {
          const pb = pieceB.get(key);
          const pt = pieceT.get(key);
          maps.set(
            key,
            pb && pt
              ? edgeMapOf(pb, pt, B.grainDeg?.get(key) ?? 0, S.grainDeg?.get(key) ?? 0)
              : null,
          );
          if (pt) runs.set(key, runsOfPiece(pt, T.maxChain));
        }
        return maps.get(key) ?? null;
      };
      const r = resolveSeamDecisions(
        group.filter((g) => live.has(g)),
        S.pieces,
        {
          ...opts,
          grainDeg: S.grainDeg,
          size: S.size,
          preHit: (a) => {
            const h = hitOfAnchor.get(a);
            const m = h && mapOf(a.piece);
            return h && m ? carry(h, m, runs.get(a.piece) ?? []) : undefined;
          },
        },
      );
      let carried = 0;
      let byShape = 0;
      for (const a of r.applied) {
        if ([...a.a, ...a.b].every((h) => h.how === 'topology')) carried++;
        else byShape++;
      }
      merge(S.size, r, carried, byShape);
    }
  }
  return out;
}
