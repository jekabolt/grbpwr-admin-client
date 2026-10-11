// chains/ (P2) — the legend role of a line from its LAYER, where the file names its layers the
// AAMA/ASTM way (DXF without CLO blocks: our own marker export RC28, a foreign CAD's loose DXF).
//
// AAMA/ASTM D6673 numbers its layers — 1 the piece boundary (cut line), 14 the sew line, 4 notches,
// 7 the grain line, 8 internal lines, 6 a mirror line, 15/19 annotation, 84–87 QV copies — and
// CAD that names them says CUT / INNER / NOTCH / GRAIN … (adapters/dxf/segment layerKind). Where
// that evidence is there, the layer IS the role: the face pass (chains/face-role) read RC28-test-3's
// pleat lines on INNER as the piece outlines and filed its CUT outlines as strays and internal
// lines (10 junk faces, the leg panels split edge to edge, 7 pieces of 11).
//
// Evidence (Codex P2 review): a layer NAME (CUT, INNER, SEW …) is trusted; a bare NUMBER is AAMA
// only when the reader proved the dialect (`aama`: AAMA labels, CLO blocks) or the file carries the
// whole signature — closed outlines on 1, lines on 8, and a grain (7) or notch (4) layer — and even
// then layer 1 is no cut line when another numbered layer draws larger closed outlines round most of
// its outlines (a Gerber/Lectra file with the seam on 1 and the cut on 8). A two-size drawing on
// layers 1/2 is no AAMA file. Then, with no size row, ≥ 60 % of the line length on layers of known
// meaning and closed (or within 5 mm of closed) cut-layer outlines:
//   cut                         → the outline row ('common'), sure;
//   notch                       → 'notch';   grain → 'grain';   sew line → 'seam';
//   internal, mirror, drill …   → 'internal', except a line of that layer that
//       runs ON a cut outline (a copy of the cut line, ≥ 80 % of it within 0.5 mm) → 'ignore',
//       is drawn as CLO's grain arrow (lib/nesting isGrainArrow)                   → 'grain',
//       lies outside every cut outline (≥ 80 % of it, farther than 2 mm)          → 'ignore', only
//         when every cut-layer line closes an outline (else a dart of an open outline would go),
//       is the sew line                                                           → 'seam', only
//         file-wide: on most pieces one closed loop of that layer (drawn once or twice) runs round the cut line at
//         one offset (3–30 mm, spread ≤ 2 mm, ≥ 80 % of the cut line covered), the offsets agree
//         (± 1.5 mm); a lone loop at an offset stays internal;
//   annotation, QV, grade points → 'ignore'.
// Lines on a layer of no known meaning keep the row the earlier passes gave them. Without the
// evidence the set comes back unchanged.
//
// layerLoopAsides (the autopilot's set-aside question): an outline the face pass set aside inside a
// cut piece — a closed loop on the internal layer, or a part split off by internal lines — on a file
// whose layers proved their meaning and every cut outline closed, is positive evidence of no piece
// when every line bounding it lies on the cut layer or a proven internal layer (re-flooded locally
// from its point); never an outline on the cut layer, never one with a boundary on another layer
// (a lining or facing drawn on a proprietary layer stays a question).
import type {
  BoxMm,
  Chain,
  ChainId,
  ChainRole,
  ChainSet,
  ClassEvidence,
  LineClass,
  PtMm,
  SetAside,
  Style,
} from 'lib/pattern-import/types';

import { isGrainArrow } from 'lib/nesting/dxf/grain-arrow';

import { layerKind } from '../adapters/dxf/segment';
import { pointInPoly } from '../pieces/geom';
import { drawPolyline, flood, Grid } from '../pieces/raster';
import { bboxOf, median, resample, SegGrid, segNearest } from './geom';

type LayerKind = ReturnType<typeof layerKind>;

/** Probe switches (mutation) and the reader's dialect proof. */
export type LayerRoleOpts = {
  off?: ReadonlySet<'all' | 'split' | 'provenance' | 'enclose' | 'validated' | 'seam-file'>;
  /** The reader proved an AAMA/CLO dialect (AAMA labels, CLO blocks): numbered layers are AAMA. */
  aama?: boolean;
};

/** Share of the line work (length) that must sit on layers of known meaning. */
const KNOWN_SHARE = 0.6;
const STEP_MM = 2;
const ON_MM = 0.5;
const SEAM_MIN_MM = 3;
const SEAM_MAX_MM = 30;
const SEAM_SPREAD_MM = 1;
const OUT_MM = 2;
/** A cut-layer line whose ends are this close closes its outline. */
const CLOSE_MM = 5;
/** Cut-layer lines shorter than this need not close (a stray tick on the layer). */
const CUT_MIN_MM = 30;
const SEAM_COVER = 0.8;
const SEAM_AGREE_MM = 1.5;
const NUMBERED = /^\s*\d+\s*$/;

/** The outline a cut-layer line closes (closed, or its ends within CLOSE_MM), else null. */
function loopOf(ch: Chain): PtMm[] | null {
  if (ch.pts.length < 3) return null;
  if (ch.closed) return ch.pts;
  const a = ch.pts[0];
  const b = ch.pts[ch.pts.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) <= CLOSE_MM && ch.lengthMm >= 4 * CLOSE_MM
    ? ch.pts
    : null;
}

function areaOf(p: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
  return Math.abs(a / 2);
}

/** ≤ 32 of a polyline's points (the containment tests). */
const few = (p: readonly PtMm[]) =>
  p.filter((_, i) => i % Math.max(1, Math.floor(p.length / 32)) === 0);

type Row = { role: ChainRole; meaning: string };

const ROLE: Partial<Record<LayerKind, Row>> = {
  cut: { role: 'common', meaning: 'cut line' },
  notch: { role: 'notch', meaning: 'notches' },
  grain: { role: 'grain', meaning: 'grain line' },
  seam: { role: 'seam', meaning: 'sew line' },
  internal: { role: 'internal', meaning: 'internal lines' },
  mirror: { role: 'internal', meaning: 'mirror line' },
  drill: { role: 'internal', meaning: 'drill holes' },
  cutout: { role: 'internal', meaning: 'internal cut-outs' },
  ref: { role: 'internal', meaning: 'reference lines' },
  annotation: { role: 'ignore', meaning: 'annotation' },
  qv: { role: 'ignore', meaning: 'quality-validation copy' },
  turn: { role: 'ignore', meaning: 'grade points' },
  curve: { role: 'ignore', meaning: 'grade points' },
};

/** P2: give the lines their AAMA/ASTM layer meaning (see the header); unchanged without evidence. */
export function rolesByLayer(
  set: ChainSet,
  styles: ReadonlyMap<number, Style>,
  o: LayerRoleOpts = {},
): ChainSet {
  const off = o.off ?? new Set();
  // probe mutation: the whole pass off (e2e / autopilot run with P2_NOLAYER=1)
  const envOff = typeof process !== 'undefined' && !!process.env?.P2_NOLAYER;
  if (off.has('all') || (!o.off && envOff)) return set;
  if (set.classes.some((c) => c.role === 'size' && c.chains.length)) return set;
  const layerOf = (ch: Chain) => styles.get(ch.style)?.layer?.trim() ?? null;
  const lines = set.chains.filter((ch) => ch && ch.pts.length >= 2);
  const total = lines.reduce((a, ch) => a + ch.lengthMm, 0);
  if (!total) return set;
  // a bare layer number is AAMA only with proof (the reader's dialect, or the whole signature)
  const on = (l: string) => lines.filter((ch) => layerOf(ch) === l);
  let numbered =
    !!o.aama ||
    off.has('provenance') ||
    (on('1').some((ch) => loopOf(ch)) && on('8').length > 0 && on('7').length + on('4').length > 0);
  let proof = o.aama ? 'the AAMA/CLO dialect' : 'the AAMA layer signature (1, 8, 7/4)';
  if (numbered && !off.has('enclose')) {
    // layer 1 is no cut line when another numbered layer draws larger outlines round it
    const ones = on('1')
      .map(loopOf)
      .filter((p): p is PtMm[] => !!p);
    const others = lines
      .filter((ch) => {
        const l = layerOf(ch);
        return !!l && NUMBERED.test(l) && l !== '1';
      })
      .map(loopOf)
      .filter((p): p is PtMm[] => !!p)
      .map((p) => ({ p, a: areaOf(p) }));
    const enclosed = ones.filter((p) => {
      const A = areaOf(p);
      return others.some((q) => q.a > 1.02 * A && few(p).every((pt) => pointInPoly(pt, q.p)));
    });
    if (ones.length && enclosed.length >= 0.5 * ones.length) {
      numbered = false;
      proof = '';
    }
  }
  const kindOf = new Map<ChainId, LayerKind>();
  let known = 0;
  let byName = 0;
  for (const ch of lines) {
    const l = layerOf(ch);
    if (l == null || (NUMBERED.test(l) && !numbered)) continue;
    const k = layerKind(l);
    if (k === 'unknown' || !ROLE[k]) continue;
    kindOf.set(ch.id, k);
    known += ch.lengthMm;
    if (!NUMBERED.test(l)) byName += ch.lengthMm;
  }
  if (known < KNOWN_SHARE * total) return set;
  if (byName >= 0.5 * known) proof = 'the layer names';
  const cut = lines.filter((ch) => kindOf.get(ch.id) === 'cut');
  const outlines = cut.map(loopOf).filter((p): p is PtMm[] => !!p);
  if (!outlines.length) return set;
  // every cut-layer line closes an outline: only then is "outside every outline" a fact
  const validated = cut.every((ch) => ch.lengthMm < CUT_MIN_MM || !!loopOf(ch));
  // a line of the internal layer: on a cut outline, the sew line inside one, or outside them all
  const grid = new SegGrid(8);
  for (const ch of cut) {
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
    grid.addPolyline(ch.id, pts);
  }
  const ptsOf = new Map(cut.map((ch) => [ch.id, ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts]));
  const nearest = (p: PtMm, reach: number) => {
    let d = Infinity;
    grid.near(p, reach, (owner, seg) => {
      const pts = ptsOf.get(owner)!;
      const s = segNearest(p, pts[seg], pts[seg + 1]);
      if (s.d < d) d = s.d;
    });
    return d;
  };
  const inside = (p: PtMm) => outlines.some((q) => pointInPoly(p, q));
  /** A closed loop at one offset inside a cut outline: the piece it is in, offset, coverage. */
  type SeamCand = { id: ChainId; piece: number; m: number; cover: number; len: number };
  const seamCands: SeamCand[] = [];
  const seamOf = (ch: Chain, sm: PtMm[], ds: number[]): SeamCand | null => {
    if (!ch.closed || ch.lengthMm < 100 || !sm.every(inside)) return null;
    const m = median(ds);
    const spread = Math.max(...ds) - Math.min(...ds);
    if (m < SEAM_MIN_MM || m > SEAM_MAX_MM || spread > 2 * SEAM_SPREAD_MM) return null;
    // the piece it runs round: the smallest outline holding it
    let piece = -1;
    for (let i = 0; i < outlines.length; i++)
      if (
        pointInPoly(sm[0], outlines[i]) &&
        (piece < 0 || areaOf(outlines[i]) < areaOf(outlines[piece]))
      )
        piece = i;
    if (piece < 0) return null;
    // how much of that cut line it runs along at its offset
    const g = new SegGrid(8);
    const loop = [...ch.pts, ch.pts[0]];
    g.addPolyline(0, loop);
    const rim = resample([...outlines[piece], outlines[piece][0]], STEP_MM).map((x) => x.p);
    let covered = 0;
    for (const p of rim) {
      let d = Infinity;
      g.near(p, m + 3, (_, seg) => {
        const s = segNearest(p, loop[seg], loop[seg + 1]);
        if (s.d < d) d = s.d;
      });
      if (Math.abs(d - m) <= 2) covered++;
    }
    return { id: ch.id, piece, m, cover: rim.length ? covered / rim.length : 0, len: ch.lengthMm };
  };
  const split = (ch: Chain): Row | null => {
    const sm = resample(ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts, STEP_MM).map((s) => s.p);
    if (!sm.length) return null;
    // CLO's grain arrow (3-vertex shaft + barb) drawn on the internal layer is the grain line: an
    // internal line of that shape is what the card parser takes for a second grain
    if (!ch.closed && isGrainArrow(ch.pts)) return { role: 'grain', meaning: 'grain arrow' };
    const ds = sm.map((p) => nearest(p, SEAM_MAX_MM + 2));
    const onCut = ds.filter((d) => d <= ON_MM).length;
    if (onCut >= 0.8 * sm.length) return { role: 'ignore', meaning: 'a copy of the cut line' };
    if (validated || off.has('validated')) {
      const out = sm.filter((p, i) => ds[i] > OUT_MM && !inside(p)).length;
      if (out >= 0.8 * sm.length) return { role: 'ignore', meaning: 'outside every cut outline' };
    }
    const sc = seamOf(ch, sm, ds);
    if (sc) seamCands.push(sc);
    return null;
  };
  const rowOf = new Map<ChainId, Row>();
  for (const ch of lines) {
    const k = kindOf.get(ch.id);
    if (!k) continue;
    let row = ROLE[k]!;
    if (row.role === 'internal' && !off.has('split')) row = split(ch) ?? row;
    rowOf.set(ch.id, row);
  }
  // the sew line on the internal layer: file-wide, never one loop on its own
  const SEAM: Row = { role: 'seam', meaning: 'sew line' };
  if (off.has('seam-file')) for (const c of seamCands) rowOf.set(c.id, SEAM);
  else {
    const byPiece = new Map<number, SeamCand[]>();
    for (const c of seamCands) byPiece.set(c.piece, [...(byPiece.get(c.piece) ?? []), c]);
    // one coherent loop per piece: the same loop drawn twice (RC28 doubles its INNER lines) is one
    const same = (a: SeamCand, b: SeamCand) =>
      Math.abs(a.m - b.m) <= 0.5 && Math.abs(a.len - b.len) <= 0.02 * a.len;
    const good = [...byPiece.values()].filter(
      (cs) => cs.every((c) => same(c, cs[0])) && cs[0].cover >= SEAM_COVER,
    );
    const mo = median(good.map((cs) => cs[0].m));
    const agree = good.filter((cs) => Math.abs(cs[0].m - mo) <= SEAM_AGREE_MM);
    if (agree.length > 0.5 * outlines.length)
      for (const cs of agree) for (const c of cs) rowOf.set(c.id, SEAM);
  }
  const rows = new Map<string, { row: Row; layers: Set<string>; ids: ChainId[] }>();
  const taken = new Set<ChainId>();
  for (const ch of lines) {
    const row = rowOf.get(ch.id);
    if (!row) continue;
    const key = `${row.role}|${row.meaning}`;
    const r = rows.get(key) ?? { row, layers: new Set<string>(), ids: [] };
    r.layers.add(layerOf(ch) ?? '');
    r.ids.push(ch.id);
    rows.set(key, r);
    taken.add(ch.id);
  }
  const len = (ids: ChainId[]) => ids.reduce((a, i) => a + set.chains[i].lengthMm, 0);
  const classes: LineClass[] = [];
  const push = (c: Omit<LineClass, 'id'>) => classes.push({ ...c, id: classes.length });
  const order: ChainRole[] = ['common', 'seam', 'notch', 'grain', 'internal', 'ignore'];
  for (const role of order)
    for (const { row, layers, ids } of rows.values()) {
      if (row.role !== role) continue;
      const evidence: ClassEvidence[] = [...layers].map((layer) => ({
        kind: 'layer',
        layer,
        meaning: row.meaning,
      }));
      push({
        role,
        sizeLabel: null,
        chains: ids,
        totalLengthMm: len(ids),
        evidence,
        confidence: role === 'common' ? 0.9 : 0.8,
      });
    }
  // lines on a layer of no known meaning keep their row (the marker's STRIP border stays a stray)
  for (const c of set.classes) {
    const rest = c.chains.filter((id) => !taken.has(id));
    if (rest.length) push({ ...c, chains: rest, totalLengthMm: len(rest) });
  }
  const outline = new Set(rows.get('common|cut line')?.ids ?? []);
  const n = (role: ChainRole) =>
    [...rows.values()].filter((r) => r.row.role === role).reduce((a, r) => a + r.ids.length, 0);
  return {
    ...set,
    classes,
    orphans: set.orphans.filter((id) => !taken.has(id)),
    // the rows the earlier passes asked about are gone: the layers answered them
    ambiguities: (set.ambiguities ?? []).filter((a) => !a.classes.length),
    warnings: [
      ...set.warnings,
      `P2: AAMA/ASTM layers by ${proof} (${Math.round((100 * known) / total)} % of the line work) → ${outline.size} cut-line outlines, ${n('internal')} internal, ${n('seam')} sew, ${n('notch')} notch, ${n('grain')} grain, ${n('ignore')} set aside`,
    ],
  };
}

/** The layer evidence of a row: its layer names (rolesByLayer rows only). */
const layersOf = (c: LineClass) => c.evidence.flatMap((e) => (e.kind === 'layer' ? [e.layer] : []));

/**
 * The autopilot's set-aside question (see the header): on a file whose layers proved their meaning
 * and whose every cut-layer line closes an outline, the pieces are exactly the cut outlines — an
 * outline set aside inside one of them (a closed loop on the internal layer, or a part split off by
 * internal lines) carries `layerLoop`, positive evidence of no piece. An outline that matches a
 * cut-layer outline never does.
 */
export function layerLoopAsides(
  set: ChainSet,
  asides: SetAside[],
  o: { off?: boolean | ReadonlySet<'all' | 'bounds'> } = {},
): SetAside[] {
  const off: ReadonlySet<string> = o.off === true ? new Set(['all']) : o.off ? o.off : new Set();
  if (off.has('all') || !asides.length) return asides;
  const cutRow = set.classes.find(
    (c) =>
      c.role === 'common' && c.evidence.some((e) => e.kind === 'layer' && e.meaning === 'cut line'),
  );
  if (!cutRow) return asides;
  // every cut-layer line closes an outline: the pieces are exactly the cut outlines
  const cutChains = cutRow.chains.map((id) => set.chains[id]).filter(Boolean);
  if (cutChains.some((ch) => ch.lengthMm >= CUT_MIN_MM && !loopOf(ch))) return asides;
  const cuts = cutChains
    .map(loopOf)
    .filter((p): p is PtMm[] => !!p)
    .map((p) => ({ p, a: areaOf(p), box: bboxOf(p) }));
  const loops = set.classes
    .filter((c) => (c.role === 'internal' || c.role === 'seam') && layersOf(c).length)
    .flatMap((c) =>
      c.chains
        .map((id) => set.chains[id])
        .filter((ch) => ch && ch.closed && ch.pts.length >= 3)
        .map((ch) => ({ ch, box: bboxOf(ch.pts), layer: layersOf(c).join(', ') })),
    );
  const TOL = 4;
  const near = (b: BoxMm, c: BoxMm) =>
    Math.abs(b.minX - c.minX) <= TOL &&
    Math.abs(b.maxX - c.maxX) <= TOL &&
    Math.abs(b.minY - c.minY) <= TOL &&
    Math.abs(b.maxY - c.maxY) <= TOL;
  const within = (b: BoxMm, c: BoxMm) =>
    b.minX >= c.minX - TOL &&
    b.maxX <= c.maxX + TOL &&
    b.minY >= c.minY - TOL &&
    b.maxY <= c.maxY + TOL;
  // the lines the face pass draws as walls, and which of them the layers proved (cut + internal)
  const classOf = new Map<ChainId, LineClass>();
  for (const c of set.classes) for (const id of c.chains) classOf.set(id, c);
  const walls = set.chains.filter((ch) => {
    const r = classOf.get(ch.id)?.role;
    return ch && ch.pts.length >= 2 && r !== 'ignore' && r !== 'notch';
  });
  const proven = (id: ChainId) => {
    const c = classOf.get(id);
    return !!c && layersOf(c).length > 0;
  };
  const wallGrid = new SegGrid(8);
  const wallPts = new Map<ChainId, PtMm[]>();
  for (const ch of walls) {
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
    wallPts.set(ch.id, pts);
    wallGrid.addPolyline(ch.id, pts);
  }
  /** Every line bounding the aside's region drawn on the cut layer or a proven internal layer. */
  const boundedByProven = (a: SetAside): boolean => {
    const cell = Math.max(0.5, Math.sqrt(a.areaMm2) / 300);
    const box = {
      minX: a.box.minX - 6,
      minY: a.box.minY - 6,
      maxX: a.box.maxX + 6,
      maxY: a.box.maxY + 6,
    };
    const g = new Grid(box, cell);
    const wall = new Uint8Array(g.W * g.H);
    for (const ch of walls) {
      const b = bboxOf(ch.pts);
      if (b.maxX < box.minX || b.minX > box.maxX || b.maxY < box.minY || b.minY > box.maxY)
        continue;
      drawPolyline(g, wall, ch.pts, ch.closed);
    }
    const k = g.iy(a.at.y) * g.W + g.ix(a.at.x);
    if (wall[k]) return false;
    const reg = new Uint8Array(g.W * g.H);
    const n = flood(g, wall, [k], reg);
    // it must close inside its box, at about its own area
    for (let x = 0; x < g.W; x++) if (reg[x] || reg[(g.H - 1) * g.W + x]) return false;
    for (let y = 0; y < g.H; y++) if (reg[y * g.W] || reg[y * g.W + g.W - 1]) return false;
    const area = n * cell * cell;
    if (Math.abs(area - a.areaMm2) > 0.25 * a.areaMm2) return false;
    // the wall pixels round it, each attributed to its nearest line
    const W = g.W;
    const rim: number[] = [];
    for (let q = 0; q < reg.length; q++) {
      if (!wall[q]) continue;
      const x = q % W;
      if (
        (x > 0 && reg[q - 1]) ||
        (x + 1 < W && reg[q + 1]) ||
        (q >= W && reg[q - W]) ||
        (q + W < reg.length && reg[q + W])
      )
        rim.push(q);
    }
    const step = Math.max(1, Math.floor(rim.length / 600));
    for (let i = 0; i < rim.length; i += step) {
      const y = (rim[i] / W) | 0;
      const p = g.centre(rim[i] - y * W, y);
      let best = -1;
      let bd = Infinity;
      wallGrid.near(p, 3 * cell + 1, (owner, seg) => {
        const pts = wallPts.get(owner)!;
        const d = segNearest(p, pts[seg], pts[seg + 1]).d;
        if (d < bd) {
          bd = d;
          best = owner;
        }
      });
      if (best >= 0 && !proven(best)) return false;
    }
    return rim.length > 0;
  };
  return asides.map((a) => {
    // an outline on the cut layer is a piece of its own: never
    if (cuts.some((q) => near(q.box, a.box))) return a;
    // inside one cut piece, and smaller than it: a part of it, not a piece
    const host = cuts.find(
      (q) => pointInPoly(a.at, q.p) && within(a.box, q.box) && q.a > 1.02 * a.areaMm2,
    );
    if (!host) return a;
    // a subdivision of the cut piece: bounded only by the cut line and proven internal lines (a
    // lining / facing outline on another layer stays a question)
    if (!off.has('bounds') && !boundedByProven(a)) return a;
    const loop = loops.find((l) => near(l.box, a.box) && pointInPoly(a.at, l.ch.pts));
    return {
      ...a,
      layerLoop: loop
        ? `a closed loop on the internal layer “${loop.layer}” inside a cut piece`
        : 'a part of a cut piece, split off by lines that are not on the cut layer',
    };
  });
}
