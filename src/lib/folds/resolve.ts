// Stored fold → the line the doll folds on THIS size.
//
// With an edge locator: find the edge again (the stored run id when the contour signature still
// matches, else by the shape of its five samples), lay the line parallel to its chord at `offsetMm`
// inward, extend it to the contour. A hem allowance stays 30 mm on every size, where a scaled (u, v)
// line would grow with the piece. A bounded drawn line is matched to the corresponding construction
// line on this size; without those lines, the stored (u, v) locator remains the legacy fallback.
// Every other row is extended to the contour. The flipping side is kept from the stored `flipAt`.
// What cannot be laid on this size is reported in words and left out — never guessed.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import {
  FRAMES,
  inFrame,
  rmsFit,
  runById,
  runSamples,
  runsOfPiece,
  type PieceFrame,
  type SeamRun,
} from 'lib/seams/frame';
import type { Frame } from 'lib/seams/types';
import {
  add,
  chordDeviation,
  clampUV,
  clipThrough,
  contourSig,
  distToPoly,
  frameOf,
  fromUV,
  inside,
  inwardSign,
  len,
  mapUV,
  mul,
  perp,
  sideDist,
  sub,
  toUV,
  unit,
} from './geom';
import {
  FOLDS,
  type DollFold,
  type FoldResolveOptions,
  type FoldVia,
  type ResolvedFolds,
  type StoredFold,
  type UnresolvedFold,
} from './types';

type Th = typeof FOLDS;
type EdgeHit = { run: SeamRun; frame: Frame; via: FoldVia };

/** Every stored fold laid on the given pieces (one size): per piece, in seq order. */
export function resolveFolds(
  rows: readonly StoredFold[],
  pieces: readonly PieceGeom[],
  opts: FoldResolveOptions = {},
): ResolvedFolds {
  const th: Th = { ...FOLDS, ...opts.thresholds };
  const byKey = new Map(pieces.map((p) => [p.pieceKey.toUpperCase(), p]));
  const folds: Record<string, DollFold[]> = {};
  const unresolved: UnresolvedFold[] = [];
  const via: Record<string, FoldVia> = {};
  const nameOf = (key: string) =>
    opts.nameOf?.(key) || byKey.get(key.toUpperCase())?.name || 'a piece';

  const sorted = [...rows].sort(
    (x, y) =>
      x.pieceKey.localeCompare(y.pieceKey) || x.seq - y.seq || x.foldKey.localeCompare(y.foldKey),
  );
  for (const row of sorted) {
    const report = (words: string) =>
      unresolved.push({
        foldKey: row.foldKey,
        pieceKey: row.pieceKey,
        seq: row.seq,
        words: `${nameOf(row.pieceKey)}, fold ${row.seq}: ${words}`,
      });
    const piece = byKey.get(row.pieceKey.toUpperCase());
    if (!piece || piece.rs.length < 3) {
      report('the piece is not in this pattern');
      continue;
    }
    if (row.stale) {
      report('the pattern changed since it was saved; confirm it again');
      continue;
    }
    const f = frameOf(piece, opts.grainDeg?.get(piece.pieceKey) ?? 0);
    const r = resolveOne(row, piece, f, th, opts.innerLines?.get(piece.pieceKey));
    if (typeof r === 'string') {
      report(r);
      continue;
    }
    (folds[piece.pieceKey] ??= []).push(r.fold);
    via[row.foldKey] = r.via;
  }
  for (const list of Object.values(folds)) list.sort((a, b) => a.seq - b.seq);
  return { folds, unresolved, via };
}

function resolveOne(
  row: StoredFold,
  piece: PieceGeom,
  f: PieceFrame,
  th: Th,
  innerLines: readonly (readonly Pt2[])[] | undefined,
): { fold: DollFold; via: FoldVia } | string {
  const hit = row.edge ? findEdge(row, piece, f, th) : null;
  const inner =
    row.source === 'dxf' && !row.edge && innerLines ? findInnerLine(row, f, innerLines, th) : null;
  if (row.source === 'dxf' && !row.edge && innerLines && !inner)
    return 'the drawn line is not on this size';
  const frame: Frame = hit?.frame ?? inner?.frame ?? 'asis';
  // The stored line and flip point as they read on today's piece (mm).
  const sa = fromUV(f, mapUV(row.line[0], frame));
  const sb = fromUV(f, mapUV(row.line[1], frame));
  const sf = fromUV(f, mapUV(row.flipAt, frame));

  let line: [Pt2, Pt2] | null = null;
  let via: FoldVia = 'uv';
  if (hit && row.edge) {
    const a = hit.run.pts[0];
    const b = hit.run.pts[hit.run.pts.length - 1];
    const d = sub(b, a);
    const n = mul(perp(unit(d)), inwardSign(piece, hit.run));
    const p = add(mul(add(a, b), 0.5), mul(n, row.edge.offsetMm));
    line = clipThrough(piece.rs, p, d);
    if (line) via = hit.via;
  }
  if (!line && inner) {
    line = inner.line;
    via = 'inner';
  }
  if (!line) {
    if (len(sub(sb, sa)) < 1e-6) return 'the saved line has no length';
    const through = clipThrough(piece.rs, mul(add(sa, sb), 0.5), sub(sb, sa));
    if (through) {
      // Only a drawn inner line may stop inside the piece: it is saved as dxf with no edge. Any
      // other row was laid across the piece, so ends that miss the outline on this size stay full.
      const mayStopInside = row.source === 'dxf' && !row.edge;
      const reachesOutline =
        distToPoly(piece.rs, sa) <= th.onContourMm && distToPoly(piece.rs, sb) <= th.onContourMm;
      if (!mayStopInside || reachesOutline) line = through;
      else {
        const d = unit(sub(sb, sa));
        const rawLen = len(sub(sb, sa));
        const along = (p: Pt2) => sub(p, sa)[0] * d[0] + sub(p, sa)[1] * d[1];
        const lo = Math.max(0, along(through[0]));
        const hi = Math.min(rawLen, along(through[1]));
        if (hi > lo) {
          line =
            lo <= 1e-9 && hi >= rawLen - 1e-9
              ? [sa, sb]
              : [add(sa, mul(d, lo)), add(sa, mul(d, hi))];
        }
      }
    }
  }
  if (!line) return 'the saved line falls outside the piece on this size';
  if (len(sub(line[1], line[0])) < th.minLenMm) return 'the line is too short on this size';
  // Keep the stored direction a→b.
  const sd = sub(sb, sa);
  const ld = sub(line[1], line[0]);
  if (sd[0] * ld[0] + sd[1] * ld[1] < 0) line = [line[1], line[0]];

  const flip = flipPoint(row, piece, line, sa, sb, sf, th);
  if (!flip) return 'no point of the flipping part lies inside the piece';
  return {
    fold: {
      seq: row.seq,
      a: clampUV(toUV(f, line[0])),
      b: clampUV(toUV(f, line[1])),
      flipAt: clampUV(toUV(f, flip)),
      kind: row.kind,
    },
    via,
  };
}

type InnerMatch = { line: [Pt2, Pt2]; frame: Frame };

const lineFit = (samples: readonly Pt2[], stored: readonly Pt2[]) =>
  Math.min(rmsFit(samples, stored), rmsFit([...samples].reverse(), stored));

const sameDrawnLine = (left: readonly Pt2[], right: readonly Pt2[], th: Th) =>
  lineFit(left, right) <= th.dedupeMm;

/** Find the same bounded DXF construction line on this graded size. */
function findInnerLine(
  row: StoredFold,
  f: PieceFrame,
  innerLines: readonly (readonly Pt2[])[],
  th: Th,
): InnerMatch | null {
  const candidates = innerLines.flatMap((points): { line: [Pt2, Pt2] }[] => {
    if (
      points.length < 2 ||
      chordDeviation(points) > th.straightMm ||
      len(sub(points[points.length - 1], points[0])) < th.innerMinMm
    )
      return [];
    const line: [Pt2, Pt2] = [points[0], points[points.length - 1]];
    return [{ line }];
  });
  for (const frame of FRAMES) {
    const fits = candidates
      .map(({ line }) => ({
        line,
        fit: lineFit(
          inFrame(
            line.map((point) => toUV(f, point)),
            frame,
          ),
          row.line,
        ),
      }))
      .filter((candidate) => candidate.fit <= th.innerFitMax)
      .sort((a, b) => a.fit - b.fit);
    const best = fits[0];
    if (!best) continue;
    const rival = fits.find(
      (candidate) =>
        candidate !== best &&
        candidate.fit < best.fit + th.tieMargin &&
        !sameDrawnLine(best.line, candidate.line, th),
    );
    if (rival) return null;
    return { line: best.line, frame };
  }
  return null;
}

/**
 * The stored edge on today's piece. The run id is trusted only while the contour signature matches
 * (the seams' fast path); otherwise the five samples are matched by shape — the piece as is first,
 * a turned or mirrored export only when nothing fits as is (a symmetric piece fits both ways, and
 * «as is» is the honest reading). A tie between two disjoint runs is no answer.
 */
function findEdge(row: StoredFold, piece: PieceGeom, f: PieceFrame, th: Th): EdgeHit | null {
  const edge = row.edge;
  if (!edge) return null;
  if (edge.hint && row.contourSig && row.contourSig === contourSig(piece, f)) {
    const run = runById(piece, edge.hint, th.maxChain);
    if (run) return { run, frame: 'asis', via: 'hint' };
  }
  const cands = runsOfPiece(piece, th.maxChain).map((run) => ({ run, s: runSamples(f, run) }));
  for (const frame of FRAMES) {
    const fits = cands
      .map((c) => ({ run: c.run, fit: rmsFit(inFrame(c.s, frame), edge.samples) }))
      .sort((x, y) => x.fit - y.fit);
    const best = fits[0];
    if (!best || best.fit > th.fitMax) continue;
    const ids = new Set(best.run.edges.map((e) => e.id));
    const rival = fits.find((x) => x !== best && x.run.edges.every((e) => !ids.has(e.id)));
    if (rival && rival.fit < best.fit + th.tieMargin) return null;
    return { run: best.run, frame, via: 'shape' };
  }
  return null;
}

/**
 * A point on the flipping part: the stored one when it still lies inside the piece and on the stored
 * side of today's line; otherwise one synthesised just off the line's midpoint on that side (for a
 * hem, half-way to the edge first).
 */
function flipPoint(
  row: StoredFold,
  piece: PieceGeom,
  line: [Pt2, Pt2],
  sa: Pt2,
  sb: Pt2,
  sf: Pt2,
  th: Th,
): Pt2 | null {
  const side = Math.sign(sideDist(sa, sb, sf)) || 1;
  const d = sideDist(line[0], line[1], sf);
  if (Math.sign(d) === side && Math.abs(d) >= th.flipMinMm && inside(piece.rs, sf)) return sf;
  const mid = mul(add(line[0], line[1]), 0.5);
  const n = mul(perp(unit(sub(line[1], line[0]))), side);
  const probes = row.edge ? [row.edge.offsetMm / 2, ...th.flipProbeMm] : th.flipProbeMm;
  for (const step of probes) {
    const p = add(mid, mul(n, step));
    if (inside(piece.rs, p)) return p;
  }
  return null;
}
