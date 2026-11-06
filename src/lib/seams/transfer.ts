// Stored seams on every size (L2b). Anchors are resolved on the size they were confirmed on
// (`StoredSeam.anchoredSize`); the resolved runs are then CARRIED to each other size by the piece's
// topology: a graded piece keeps its corner / edge sequence, so edge i of the base size is the
// edge of the other size that sits at the same place in that sequence — matched by edge count,
// the edges' shapes in the unit square (all frames: as is / 180° / mirrored, every start offset),
// their share of the perimeter and their notch counts. Shape fit at the design threshold is the
// fallback only where the topology differs (a corner appeared or vanished) or is ambiguous; what
// still does not fit is stale, the words naming the size.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry/match';
import type { EdgeId, Mm, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
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

type EdgeMapChoice = { frame: Frame; shift: number; cost: number };

const mappingOf = (choice: EdgeMapChoice, base: PieceGeom, target: PieceGeom): EdgeMap => {
  const n = base.edges.length;
  const back = backwards(choice.frame);
  const map = new Map<EdgeId, EdgeId>();
  base.edges.forEach((edge, index) => {
    const targetIndex = back ? (((choice.shift - index) % n) + n) % n : (index + choice.shift) % n;
    map.set(edge.id, target.edges[targetIndex].id);
  });
  return {
    map,
    frame: choice.frame,
    cost: Math.round(choice.cost * 10000) / 10000,
  };
};

function edgeMapInFrames(
  base: PieceGeom,
  target: PieceGeom,
  frames: readonly Frame[],
  degBase: number,
  degTarget: number,
  preferAsis: boolean,
  distinctMappings: boolean,
): EdgeMap | null {
  const n = base.edges.length;
  if (n === 0 || target.edges.length !== n) return null;
  const fb = frameOf(base, degBase);
  const ft = frameOf(target, degTarget);
  const sb = base.edges.map((edge) => runSamples(fb, edge));
  const st = target.edges.map((edge) => runSamples(ft, edge));
  const shareB = base.edges.map((edge) => edge.lenMm / (base.perimMm || 1));
  const shareT = target.edges.map((edge) => edge.lenMm / (target.perimMm || 1));
  const tried: EdgeMapChoice[] = [];
  for (const frame of frames) {
    const back = backwards(frame);
    for (let shift = 0; shift < n; shift++) {
      let cost = 0;
      for (let index = 0; index < n; index++) {
        const targetIndex = back ? (((shift - index) % n) + n) % n : (index + shift) % n;
        cost +=
          rmsFit(inFrame(st[targetIndex], frame), sb[index]) +
          Math.abs(shareT[targetIndex] - shareB[index]) +
          (target.edges[targetIndex].notchesMm.length !== base.edges[index].notchesMm.length
            ? TRANSFER.notchPenalty
            : 0);
      }
      tried.push({ frame, shift, cost: cost / n });
    }
  }
  tried.sort((left, right) => left.cost - right.cost);
  const bestAsis = preferAsis ? tried.find((choice) => choice.frame === 'asis') : undefined;
  const pick = bestAsis && bestAsis.cost <= tried[0].cost + TRANSFER.margin ? bestAsis : tried[0];
  if (!pick || pick.cost > TRANSFER.costMax) return null;
  const pickedMap = mappingOf(pick, base, target);
  const pickedSig = [...pickedMap.map.values()].join('|');
  const rival = tried.find((choice) => {
    if (choice === pick) return false;
    if (!distinctMappings) return choice.frame === pick.frame;
    return [...mappingOf(choice, base, target).map.values()].join('|') !== pickedSig;
  });
  if (rival && rival.cost - pick.cost < TRANSFER.margin) return null;
  return pickedMap;
}

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
  // Sizes of one file sit in one frame: as is wins unless another frame is clearly better (a
  // symmetric piece fits mirrored as well — that is not a reason to flip it).
  return edgeMapInFrames(base, target, FRAMES, degBase, degTarget, true, false);
}

/**
 * The topology map of an explicitly mirrored twin. Only mirrored frames are legal, and two
 * equally plausible, genuinely different edge correspondences are refused instead of guessed.
 */
export function mirrorEdgeMapOf(
  base: PieceGeom,
  target: PieceGeom,
  degBase = 0,
  degTarget = 0,
): EdgeMap | null {
  return edgeMapInFrames(base, target, ['mirrorU', 'mirrorV'], degBase, degTarget, false, true);
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

/**
 * Owner-mode candidates are built once, on the size the card was read at, and name its edges
 * literally. A graded contour may start at another corner, so the same number is another edge there:
 * each side moves through its piece's edge map, its millimetres scaled by the run's length (and
 * walked the other way when the frame does). A piece with no map keeps its numbers.
 */
export function candidatesOnSize<T extends { candidate: SeamCandidate }>(
  owned: readonly T[],
  base: SizePieces,
  target: SizePieces,
): T[] {
  const pieceB = new Map(base.pieces.map((p) => [p.pieceKey, p]));
  const pieceT = new Map(target.pieces.map((p) => [p.pieceKey, p]));
  const maps = new Map<string, EdgeMap | null>();
  const pieceOf = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));
  const mapOf = (id: EdgeId) => {
    const key = pieceOf(id);
    if (!maps.has(key)) {
      const pb = pieceB.get(key);
      const pt = pieceT.get(key);
      maps.set(
        key,
        pb && pt ? edgeMapOf(pb, pt, base.grainDeg?.get(key), target.grainDeg?.get(key)) : null,
      );
    }
    return maps.get(key) ?? null;
  };
  const isBack = (id: EdgeId) => {
    const m = mapOf(id);
    return !!m && backwards(m.frame);
  };
  /** A side's id (`P#1+2`): its edges moved, in the target's walk order; an inner line stays. */
  const movedRun = (id: EdgeId): EdgeId => {
    if (!id.includes('#')) return id;
    const edges = edgeIdsOf(id);
    const moved = edges.map((edge) => mapOf(edge)?.map.get(edge));
    if (moved.some((edge) => !edge)) return id;
    const walk = isBack(id) ? [...moved].reverse() : moved;
    return `${pieceOf(id)}#${(walk as EdgeId[]).map((e) => e.slice(e.lastIndexOf('#') + 1)).join('+')}`;
  };
  const movedParts = (parts: EdgeId[]) =>
    (isBack(parts[0]) ? [...parts].reverse() : parts).map(movedRun);
  const runLen = (pieces: ReadonlyMap<string, PieceGeom>, id: EdgeId) =>
    edgeIdsOf(id).reduce(
      (sum, edge) =>
        sum + (pieces.get(pieceOf(edge))?.edges.find((e) => e.id === edge)?.lenMm ?? 0),
      0,
    );
  const movedRange = (id: EdgeId, to: EdgeId, [lo, hi]: [Mm, Mm]): [Mm, Mm] => {
    const lb = runLen(pieceB, id);
    const lt = runLen(pieceT, to);
    if (!lb || !lt) return [lo, hi];
    const k = lt / lb;
    return isBack(id) ? [lt - hi * k, lt - lo * k] : [lo * k, hi * k];
  };
  return owned.map((item) => {
    const c = item.candidate;
    const a = movedRun(c.a);
    const b = movedRun(c.b);
    return {
      ...item,
      candidate: {
        ...c,
        a,
        b,
        ...(c.aParts ? { aParts: movedParts(c.aParts) } : {}),
        ...(c.bParts ? { bParts: movedParts(c.bParts) } : {}),
        ...(c.range
          ? { range: { a: movedRange(c.a, a, c.range.a), b: movedRange(c.b, b, c.range.b) } }
          : {}),
        ...(c.partRange
          ? {
              partRange: Object.fromEntries(
                Object.entries(c.partRange).map(([id, range]) => {
                  const to = movedRun(id);
                  return [to, movedRange(id, to, range)];
                }),
              ),
            }
          : {}),
      },
    };
  });
}

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
