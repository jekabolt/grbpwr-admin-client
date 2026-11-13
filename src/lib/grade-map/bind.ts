// Grade map · binding a stored map to live geometry, by position and never by vertex index (the
// runtime cleans contours, moves their start vertex and resamples internal lines). A track binds to
// a live line of its kind when every node lies within BIND_MM of that one line, in order: an open
// line runs one way (either way), a closed line is wound exactly once. A drill binds to the live
// drill whose centre is within BIND_MM. Whatever does not bind is refused for that size.
//
// Bound tracks carry points by node fractions (`carryArc`), and `meshSourceOf` builds the mesh's
// input from them: the cut at its nodes plus points at most 5 mm apart, and every internal line and
// drill carried in every size the cut is carried to.

import type { PtMm } from 'lib/pattern-import/types';
import { dist, fromQ, mod, pathOf, pointAt, project, type Path } from './geom';
import { classify, type SizeMarks } from './marks';
import type { MeshPart, MeshSource } from './mesh';
import type { GmLine, GmPiece, GmSizeGeometry, GmTrack } from './types';

/** A node binds to a line it lies this close to, mm. */
export const BIND_MM = 0.15;
/** Two nodes this close in arc may come out of order after rounding, mm. */
const ORDER_SLACK_MM = 0.05;
/** The mesh samples a bound line at least this often, mm. */
export const MESH_STEP_MM = 5;

export type LiveSize = {
  sizeId: number;
  cut: Path | null;
  seam: Path | null;
  marks: SizeMarks;
  lines: readonly GmLine[];
};

export function liveOf(geo: GmSizeGeometry): LiveSize {
  const cut = pathOf(geo.cut, true);
  return {
    sizeId: geo.sizeId,
    cut,
    seam: geo.seam ? pathOf(geo.seam, true) : null,
    marks: classify(geo.lines, cut),
    lines: geo.lines,
  };
}

/** A track bound in one size: its line and the node arcs on it (closed: unwrapped, ascending). */
export type BoundLine = { path: Path; arcs: number[] };
export type Bound = { ok: true; line: BoundLine } | { ok: true; point: PtMm } | { ok: false; reason: string };

function bindToLine(nodes: readonly PtMm[], path: Path): { line: BoundLine; worst: number } | null {
  const proj = nodes.map((p) => project(path, p));
  const worst = Math.max(...proj.map((p) => p.d));
  if (!(worst <= BIND_MM)) return null;
  const L = path.total;
  const s = proj.map((p) => p.s);
  if (path.closed) {
    if (s.length === 1) return { line: { path, arcs: s }, worst };
    let wound = 0;
    const steps = s.map((v, j) => {
      const step = mod(s[(j + 1) % s.length] - v + ORDER_SLACK_MM, L) - ORDER_SLACK_MM;
      wound += step;
      return step;
    });
    if (Math.round(wound / L) !== 1) return null;
    const arcs = [s[0]];
    for (let j = 1; j < s.length; j++) arcs.push(arcs[j - 1] + Math.max(0, steps[j - 1]));
    if (arcs[arcs.length - 1] - arcs[0] > L + 1e-9) return null;
    return { line: { path, arcs }, worst };
  }
  const up = s.every((v, j) => !j || v - s[j - 1] >= -ORDER_SLACK_MM);
  const down = s.every((v, j) => !j || v - s[j - 1] <= ORDER_SLACK_MM);
  if (!up && !down) return null;
  let p = path;
  let arcs = s;
  if (!up) {
    const rev = pathOf([...path.pts].reverse(), false);
    if (!rev) return null;
    p = rev;
    arcs = s.map((v) => L - v);
  }
  for (let j = 1; j < arcs.length; j++) arcs[j] = Math.max(arcs[j], arcs[j - 1]);
  return { line: { path: p, arcs }, worst };
}

/** The live candidates of a track's kind in one size. */
function candidatesOf(track: GmTrack, live: LiveSize): Path[] {
  switch (track.kind) {
    case 'cut':
      return live.cut ? [live.cut] : [];
    case 'seam':
      return live.seam ? [live.seam] : [];
    case 'notch':
      return live.marks.notches
        .map((n) => pathOf([n.a, n.b], false))
        .filter((p): p is Path => !!p);
    case 'internal':
      return live.marks.internals
        .filter((l) => l.line.layer === track.layer && l.line.closed === track.closed)
        .map((l) => l.path);
    default:
      return [];
  }
}

/** Node positions of a track in one size (mm): the base, or base + that size's delta. */
export function nodesOf(track: GmTrack, sizeId: number | null): PtMm[] | null {
  if (sizeId === null) return track.base.map(([x, y]) => ({ x: fromQ(x), y: fromQ(y) }));
  const s = track.sizes.find((z) => z.sizeId === sizeId);
  if (!s?.delta) return null;
  return track.base.map(([x, y], j) => ({ x: fromQ(x + s.delta![j][0]), y: fromQ(y + s.delta![j][1]) }));
}

export function bindNodes(track: GmTrack, nodes: readonly PtMm[], live: LiveSize): Bound {
  if (!nodes.length) return { ok: false, reason: 'unbound: no nodes' };
  if (track.kind === 'drill') {
    let best: PtMm | null = null;
    let bestD = BIND_MM;
    for (const d of live.marks.drills) {
      const e = dist(d.c, nodes[0]);
      if (e <= bestD) [best, bestD] = [d.c, e];
    }
    return best ? { ok: true, point: best } : { ok: false, reason: 'unbound: no drill within 0.15 mm' };
  }
  let best: { line: BoundLine; worst: number } | null = null;
  for (const path of candidatesOf(track, live)) {
    const b = bindToLine(nodes, path);
    if (b && (!best || b.worst < best.worst)) best = b;
  }
  return best ? { ok: true, line: best.line } : { ok: false, reason: `unbound: no ${track.kind} line holds the nodes in order` };
}

/** Size arc of base arc s, by node fractions between two bound lines of one track. */
export function carryArc(base: BoundLine, size: BoundLine, s: number): number {
  const u = base.arcs;
  const v = size.arcs;
  const n = u.length;
  if (n === 1) return v[0] + (s - u[0]) * (size.path.total / base.path.total);
  const closed = base.path.closed;
  const U = closed ? [...u, u[0] + base.path.total] : u;
  const V = closed ? [...v, v[0] + size.path.total] : v;
  const x = closed ? u[0] + mod(s - u[0], base.path.total) : Math.max(U[0], Math.min(U[U.length - 1], s));
  let j = 0;
  while (j < U.length - 2 && U[j + 1] <= x) j++;
  const span = U[j + 1] - U[j];
  const f = span > 1e-12 ? (x - U[j]) / span : 0;
  return V[j] + f * (V[j + 1] - V[j]);
}

/** Base arcs at the nodes plus points at most `step` apart, ascending (closed: one lap). */
function sampleArcs(line: BoundLine, step: number): number[] {
  const u = line.arcs;
  const closed = line.path.closed;
  const U = closed ? [...u, u[0] + line.path.total] : u;
  const out: number[] = [];
  for (let j = 0; j + 1 < U.length; j++) {
    const len = U[j + 1] - U[j];
    const k = Math.max(1, Math.ceil(len / step - 1e-9));
    for (let i = 0; i < k; i++) out.push(U[j] + (len * i) / k);
  }
  if (!closed) out.push(U[U.length - 1]);
  return out;
}

export type PieceBinding = {
  /** Per track: the base binding and each size's (absent when the size is not carried). */
  tracks: { base: Bound; sizes: Map<number, Bound> }[];
};

export function bindPiece(piece: GmPiece, base: LiveSize, sizes: ReadonlyMap<number, LiveSize>): PieceBinding {
  return {
    tracks: piece.tracks.map((t) => {
      const b = bindNodes(t, nodesOf(t, null)!, base);
      const out = new Map<number, Bound>();
      for (const s of t.sizes) {
        if (!s.delta) continue;
        const live = sizes.get(s.sizeId);
        if (!live) out.set(s.sizeId, { ok: false, reason: 'unbound: size missing' });
        else if (!b.ok) out.set(s.sizeId, { ok: false, reason: 'unbound: base did not bind' });
        else out.set(s.sizeId, bindNodes(t, nodesOf(t, s.sizeId)!, live));
      }
      return { base: b, sizes: out };
    }),
  };
}

const lineOf = (b: Bound | undefined): BoundLine | null => (b && b.ok && 'line' in b ? b.line : null);
const pointOf = (b: Bound | undefined): PtMm | null => (b && b.ok && 'point' in b ? b.point : null);

export type MeshSourceResult = {
  src: MeshSource | null;
  /** Per size of the piece: why it has no mesh pair (cut not carried or not bound). */
  noCut: Map<number, string>;
  /** Mark tracks (notch, internal, drill) left out: not carried and bound in every cut size. */
  notInMesh: number[];
};

/** The mesh input of one piece from its bound tracks. */
export function meshSourceOf(piece: GmPiece, binding: PieceBinding, base: LiveSize): MeshSourceResult {
  const noCut = new Map<number, string>();
  const ci = piece.tracks.findIndex((t) => t.kind === 'cut');
  if (ci < 0) return { src: null, noCut, notInMesh: [] };
  const cut = piece.tracks[ci];
  const cb = binding.tracks[ci];
  const baseCut = lineOf(cb.base);
  const sizes: number[] = [];
  for (const s of cut.sizes) {
    if (!s.delta) noCut.set(s.sizeId, `no-cut: ${s.refused ?? 'refused'}`);
    else if (!baseCut) noCut.set(s.sizeId, 'unbound: base cut');
    else if (!lineOf(cb.sizes.get(s.sizeId))) {
      const b = cb.sizes.get(s.sizeId);
      noCut.set(s.sizeId, b && !b.ok ? b.reason : 'unbound: cut');
    } else sizes.push(s.sizeId);
  }
  if (!baseCut || !sizes.length) return { src: null, noCut, notInMesh: [] };
  const ringArcs = sampleArcs(baseCut, MESH_STEP_MM);
  const ring: MeshPart = {
    track: ci,
    kind: 'cut',
    closed: true,
    base: ringArcs.map((s) => pointAt(baseCut.path, s)),
    images: new Map(
      sizes.map((z) => {
        const line = lineOf(cb.sizes.get(z))!;
        return [z, ringArcs.map((s) => pointAt(line.path, carryArc(baseCut, line, s)))];
      }),
    ),
  };
  const parts: MeshPart[] = [];
  const notInMesh: number[] = [];
  piece.tracks.forEach((t, k) => {
    if (t.kind === 'cut' || t.kind === 'seam') return;
    const tb = binding.tracks[k];
    const everywhere = sizes.every((z) => tb.sizes.get(z)?.ok);
    if (!tb.base.ok || !everywhere) {
      notInMesh.push(k);
      return;
    }
    if (t.kind === 'drill') {
      parts.push({
        track: k,
        kind: 'drill',
        closed: false,
        base: [pointOf(tb.base)!],
        images: new Map(sizes.map((z) => [z, [pointOf(tb.sizes.get(z))!]])),
      });
      return;
    }
    const bl = lineOf(tb.base)!;
    const arcs = sampleArcs(bl, MESH_STEP_MM);
    parts.push({
      track: k,
      kind: t.kind,
      closed: t.closed,
      base: arcs.map((s) => pointAt(bl.path, s)),
      images: new Map(
        sizes.map((z) => {
          const line = lineOf(tb.sizes.get(z))!;
          return [z, arcs.map((s) => pointAt(line.path, carryArc(bl, line, s)))];
        }),
      ),
    });
  });
  const notchNodes: PtMm[] = [];
  piece.tracks.forEach((t) => {
    if (t.kind === 'notch') notchNodes.push(...nodesOf(t, null)!);
  });
  return {
    src: { ring, parts, notchNodes, baseCut: base.cut?.pts ?? [], sizes },
    noCut,
    notInMesh,
  };
}
