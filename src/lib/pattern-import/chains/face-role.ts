// chains/ (A0.3) — the legend role of a line class from the faces its lines close, and the layer.
//
// When no class carries the piece outlines (no 'size', no 'common' row — a one-size SVG / PLT /
// DXF whose cut lines the recovery filed as 'internal', or a one-pen PDF like wm M where outlines,
// stroke lettering, a watermark and stray lines are one class), the faces decide:
//   piece wall   a line that separates the outside from a closed outline, or two faces of one nest
//                at different depths (the cut line round the seam line, a piece drawn inside
//                another), in the pen of the outer outlines (a grey label box is not);
//   stray        a line that sticks outside every outline (≥ 30 % of it), that lies in a junk face
//                (the test square, a legend, a table), or that the clean stage offered as
//                background and the operator has not taken (a watermark, stroke text, a stray);
//   internal     the rest — lines inside the outlines (grain, darts, placement).
// The piece walls become one row — 'common' (a sheet with no size row is one size) — AUTO only with
// evidence from another source than the geometry: it closes the largest faces (drawn double or not —
// the same evidence) AND the layer is named cut / Schnitt / крой / …, OR the outlines are in a pen the
// other lines are not, OR the sheet prints a key naming the cut line. Otherwise the row is
// pre-filled and asked (confidence < 0.6). The strays are an 'ignore' row,
// always asked (D3: a suggestion one click away); 'internal' is sure only for lines inside faces.
import type {
  Chain,
  ChainId,
  ChainSet,
  LineClass,
  PathId,
  PtMm,
  Sheet,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { faceRaster, judgeBlobs, type FaceBlob, type FaceRaster } from '../pieces/faces';
import { testSquareBoxes, turnOf } from './classify';
import { resample, SegGrid, segNearest } from './geom';
import type { WallItem } from '../pieces/snap';

/** A printed key that names the cut line (a legend entry, not "cut 2" on a piece). */
export const CUT_LINE_TEXT =
  /(?:cut(?:ting)?[\s-]*line|линия\s+кроя|schnitt-?\s*linie|ligne\s+de\s+coupe|l[ií]nea\s+de\s+corte|linea\s+di\s+taglio)/i;

/** Layer names that say "the cut line" (SVG/DXF layers, PDF OCGs). */
export const CUT_LAYER =
  /(?:^|[^a-z])(?:cut(?:ting)?(?:\s*lines?)?|schnitt\w*|zuschnitt\w*|крой|раскрой|линия\s+кроя|coupe|corte|taglio|knip)(?:$|[^a-z])/i;

type Kind = 'piece' | 'stray' | 'internal';
type Verdict = { kind: Kind; why: string };

const EXT = -2;
/** The face pass of the legend: coarser than the fill (see rolesByFaces). */
const ROLE_CELL_MM = 1.5;
/** A face counts for a depth change from this area (a ring segment between two notches: yes). */
const FACE_MIN_MM2 = 100;

const sameStyle = (a: Style | undefined, b: Style | undefined) =>
  !!a &&
  !!b &&
  JSON.stringify(a.strokeRgb) === JSON.stringify(b.strokeRgb) &&
  !!a.dash === !!b.dash &&
  Math.abs(a.widthMm - b.widthMm) <= 0.3 * Math.max(a.widthMm, b.widthMm, 0.05);

/** Probe switches (mutation): a cue or a stray rule off. */
export type FaceRoleOpts = {
  off?: ReadonlySet<
    | 'layer'
    | 'ring'
    | 'pen'
    | 'text'
    | 'outside'
    | 'junk'
    | 'offered'
    | 'square'
    | 'inside'
    | 'runs'
    | 'lettering'
    | 'all'
  >;
};

/**
 * A0.3: split the legend by faces where no row carries the outlines. Returns the set unchanged
 * when a size or common row exists, when nothing closes, or when no line bounds a kept face.
 */
export function rolesByFaces(
  sheet: Sheet,
  set: ChainSet,
  styles: ReadonlyMap<number, Style>,
  offered: ReadonlySet<PathId> = new Set(),
  o: FaceRoleOpts = {},
): ChainSet {
  const off = o.off ?? new Set();
  if (off.has('all')) return set;
  if (set.classes.some((c) => (c.role === 'size' || c.role === 'common') && c.chains.length))
    return set;
  const wallClasses = set.classes.filter((c) => c.role !== 'ignore' && c.role !== 'notch');
  // a drawn test square (the scale step's) is a stray, never a wall of an outline it overlaps
  const square = new Set(
    testSquareBoxes(set.chains, sheet.poses, sheet.texts, [], true).flatMap((q) => q.ids),
  );
  const allIds = wallClasses.flatMap((c) => c.chains);
  // what the clean stage offers as background (a watermark, stroke text) is no wall here either:
  // its letters' bowls would read as faces inside the pieces
  const offeredChain = (id: ChainId) => {
    const ps = [...new Set(set.chains[id].ranges.map((r) => r.path))];
    return ps.length > 0 && ps.filter((p) => offered.has(p)).length >= 0.5 * ps.length;
  };
  const wallIds = allIds.filter(
    (id) => (off.has('square') || !square.has(id)) && (off.has('offered') || !offeredChain(id)),
  );
  if (!wallIds.length) return set;
  const items: WallItem[] = wallIds.flatMap((id) => {
    const c = set.chains[id];
    return c && c.pts.length >= 2 ? [{ chain: id, pts: c.pts, closed: c.closed }] : [];
  });
  // a coarse raster (walls ~4.5 mm thick): a seam line broken at its notches still closes its
  // ring, a stroke glyph closes no face of its own
  const fr = faceRaster(sheet.bbox, items, [], ROLE_CELL_MM);
  const blobs = judgeBlobs(fr, sheet, set.chains, items, [], { off: new Set(['nested', 'units']) });
  const kept = new Set(blobs.filter((b) => !b.junk).map((b) => b.id));
  if (!kept.size) return set;
  const { verdict, rim, rimStyle } = classify(
    fr,
    blobs,
    kept,
    set.chains,
    items,
    styles,
    offered,
    off,
  );
  for (const id of allIds)
    if (!verdict.has(id))
      verdict.set(id, {
        kind: 'stray',
        why: square.has(id) ? 'the test square' : 'offered as background by the clean step',
      });
  // drawn double: lines in the outline's pen running at a constant distance inside the outer
  // outlines (the seam line round a cut line, broken at a fold or a notch) are outline lines too
  const seams = off.has('ring')
    ? []
    : drawnDouble(
        set.chains,
        rim,
        allIds.filter(
          (id) =>
            !rim.includes(id) &&
            (verdict.get(id)?.kind === 'internal' || verdict.get(id)?.kind === 'piece') &&
            (!rimStyle || sameStyle(styles.get(set.chains[id].style), rimStyle)),
        ),
      );
  for (const id of seams) verdict.set(id, { kind: 'piece', why: 'the seam line inside' });
  // lines inside the outlines that are no pattern line (suggested, D3): a straight line that
  // crosses an outline, a wiggling line, stroke lettering
  const piece0 = allIds.filter((id) => verdict.get(id)?.kind === 'piece');
  if (!off.has('inside')) {
    for (const [id, why] of insideStrays(
      set.chains,
      piece0,
      allIds.filter((id) => verdict.get(id)?.kind === 'internal'),
    ))
      verdict.set(id, { kind: 'stray', why });
    // pieces of a line set aside: short lines whose both ends meet strays or furniture end to end
    // (the parts of a hand-drawn line between the parts already set aside)
    for (const id of strayPieces(
      set.chains,
      piece0,
      [
        ...allIds.filter((id) => verdict.get(id)?.kind === 'stray'),
        ...set.classes.filter((c) => c.role === 'ignore').flatMap((c) => c.chains),
      ],
      allIds.filter((id) => verdict.get(id)?.kind === 'internal'),
    ))
      verdict.set(id, { kind: 'stray', why: 'part of a line set aside' });
    // N3 (wm M): the rest of a hand-drawn line the watermark's letters cut into runs, and a long
    // straight line that runs from free space into lettering set aside (a tile label)
    const strayIds = () => allIds.filter((id) => verdict.get(id)?.kind === 'stray');
    const internalIds = () => allIds.filter((id) => verdict.get(id)?.kind === 'internal');
    if (!off.has('runs'))
      for (const [id, why] of handDrawnRuns(
        set.chains,
        piece0,
        allIds.filter((id) => HAND_DRAWN.has(verdict.get(id)?.why ?? '')),
        internalIds(),
      ))
        verdict.set(id, { kind: 'stray', why });
    if (!off.has('lettering'))
      for (const [id, why] of intoLettering(
        set.chains,
        piece0,
        [...strayIds(), ...set.classes.filter((c) => c.role === 'ignore').flatMap((c) => c.chains)],
        internalIds(),
      ))
        verdict.set(id, { kind: 'stray', why });
  }
  const piece = allIds.filter((id) => verdict.get(id)?.kind === 'piece');
  if (!piece.length) return set;
  // cues
  const len = (ids: ChainId[]) => ids.reduce((a, i) => a + set.chains[i].lengthMm, 0);
  const pieceLen = len(piece);
  const byLayer = new Map<string, number>();
  for (const id of piece) {
    const l = styles.get(set.chains[id].style)?.layer;
    if (l) byLayer.set(l, (byLayer.get(l) ?? 0) + set.chains[id].lengthMm);
  }
  const layer = [...byLayer].find(([l, L]) => L >= 0.6 * pieceLen && CUT_LAYER.test(l))?.[0];
  const cues: string[] = [`closes ${kept.size} outline${kept.size === 1 ? '' : 's'}`];
  if (layer && !off.has('layer')) cues.push(`layer “${layer}”`);
  const rimLen = len(rim);
  if (seams.length && len(seams) >= 0.4 * rimLen)
    cues.push(
      `drawn double: a seam line inside ${Math.round((100 * len(seams)) / rimLen)} % of the outline`,
    );
  // a pen of its own
  const rest = allIds.filter((id) => verdict.get(id)?.kind !== 'piece');
  const dominant = (ids: ChainId[]) => {
    const m = new Map<number, number>();
    for (const id of ids)
      m.set(set.chains[id].style, (m.get(set.chains[id].style) ?? 0) + set.chains[id].lengthMm);
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const pieceStyle = styles.get(dominant(piece) ?? -1);
  if (!off.has('pen') && rest.length) {
    const own = rest.filter((id) => sameStyle(styles.get(set.chains[id].style), pieceStyle));
    if (len(own) <= 0.2 * len(rest)) cues.push('a pen the other lines are not drawn in');
  }
  // a printed key naming the cut line (not "cut 2" on a piece)
  if (!off.has('text')) {
    const t = sheet.texts.find((x) => CUT_LINE_TEXT.test(x.text));
    if (t) cues.push(`the sheet says “${t.text.trim().slice(0, 40)}”`);
  }
  // closing faces and being drawn double are one kind of evidence (the geometry); AUTO needs a cue
  // from another source — the layer's name, a pen of its own, a printed key (Codex A0.3 review)
  const independent = cues.filter((c) => !c.startsWith('closes ') && !c.startsWith('drawn double'));
  const auto = independent.length >= 1;
  // the rows: piece outlines, the lines inside them, the strays
  const internal = rest.filter((id) => verdict.get(id)?.kind === 'internal');
  const stray = rest.filter((id) => verdict.get(id)?.kind === 'stray');
  const others = set.classes.filter((c) => c.role === 'ignore' || c.role === 'notch');
  const classes: LineClass[] = [];
  const push = (c: Omit<LineClass, 'id'>) => classes.push({ ...c, id: classes.length });
  push({
    role: 'common',
    sizeLabel: null,
    chains: piece,
    totalLengthMm: pieceLen,
    evidence: [{ kind: 'faces', pieces: kept.size, cues, auto }],
    confidence: auto ? 0.8 : 0.5,
  });
  if (internal.length) {
    // sure only when its lines lie inside the outlines (no stray rule fired on them)
    push({
      role: 'internal',
      sizeLabel: null,
      chains: internal,
      totalLengthMm: len(internal),
      evidence: [{ kind: 'inside-faces', pieces: kept.size }],
      confidence: 0.7,
    });
  }
  if (stray.length) {
    const whys = new Map<string, ChainId[]>();
    for (const id of stray) {
      const w = verdict.get(id)!.why;
      whys.set(w, [...(whys.get(w) ?? []), id]);
    }
    push({
      role: 'ignore',
      sizeLabel: null,
      chains: stray,
      totalLengthMm: len(stray),
      evidence: [
        {
          kind: 'face-stray',
          why: [...whys]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([w, ids]) => `${ids.length} ${w}`)
            .join(', '),
          byWhy: [...whys].map(([why, chains]) => ({ why, chains })),
        },
      ],
      confidence: 0.4,
    });
  }
  for (const c of others) push({ ...c });
  const pieceSet = new Set(piece);
  return {
    ...set,
    classes,
    // the outlines are no longer orphans; the strays stay out of every wall
    orphans: set.orphans.filter((id) => !pieceSet.has(id)),
    ambiguities: (set.ambiguities ?? []).filter((a) => !a.classes.length),
    warnings: [
      ...set.warnings,
      `A0.3: ${piece.length} lines close ${kept.size} outlines (${cues.join('; ')}) → ${auto ? 'outline row' : 'outline row to confirm'}; ${internal.length} inside; ${stray.length} stray (to confirm)`,
    ],
  };
}

const gradeViews = new WeakMap<ChainSet, ChainSet>();

/** Strays that are never line work of a size (per-chain `byWhy`): left out of the size checks. */
const NEVER_A_SIZE = new Set(['the test square', 'offered as background by the clean step']);

/** Probe switch (mutation): hand back every stray, whatever its reason. */
export type GradeViewOpts = { off?: ReadonlySet<'why'> };

/**
 * What the size checks (pieces/grade: the hook, the drawn-size inference) may read of the face
 * pass. Its stray row rests on "a sheet with no size row is one size": a line sticking outside
 * every outline is a stray. On a sheet drawing several sizes in one pen that is every larger size's
 * line (the stripped bench: kombinezon lost a whole size, the solver counted 7 bands for 8 and a
 * 7-size control closed 6 wrong contours; palto 21 closed wrong). So, per chain, an unconfirmed stray
 * is handed back as F3's unconfirmed 'internal' — size evidence and a wall, what it was before the
 * face pass — unless its own reason says it is no line work (the drawn test square, what the clean
 * step offered as background).
 *
 * Every other stray comes back, with lanes or without: a line no other line runs beside is either a
 * positioning / grid line across the nest or an edge drawn once for every size (a fold, a CF), and
 * nothing here tells the two apart — the bench's laneless strays hold 1.3–2.7 m of shared edges per
 * sheet. Leaving them out took those walls from every size (palto L1 closed a wrong contour,
 * kombinezon L2 fell 33 → 23 correct); a line across the nest as a wall of every size is what the
 * solver had before the face pass, and its checks hold there (faces probe: «grade view»).
 *
 * A row the operator answered (confidence 1: its role changed, or confirmed as proposed —
 * chains/legend confirmRows) is the operator's. Cached per set: the solver's cache is keyed by it.
 */
export function gradeView(set: ChainSet, o: GradeViewOpts = {}): ChainSet {
  const off = o.off ?? new Set();
  const unsure = (c: LineClass) =>
    c.role === 'ignore' && c.confidence < 0.9 && c.evidence.some((e) => e.kind === 'face-stray');
  if (!set.classes.some(unsure)) return set;
  const cached = !o.off && gradeViews.get(set);
  if (cached) return cached;
  const whyOf = new Map<ChainId, string>();
  for (const c of set.classes)
    if (unsure(c))
      for (const e of c.evidence)
        if (e.kind === 'face-stray')
          for (const g of e.byWhy ?? []) for (const id of g.chains) whyOf.set(id, g.why);
  const classes: LineClass[] = [];
  const back: ChainId[] = [];
  for (const c of set.classes) {
    if (!unsure(c)) {
      classes.push(c);
      continue;
    }
    const out = c.chains.filter((id) => !off.has('why') && NEVER_A_SIZE.has(whyOf.get(id) ?? ''));
    const keep = new Set(out);
    back.push(...c.chains.filter((id) => !keep.has(id)));
    if (out.length)
      classes.push({
        ...c,
        chains: out,
        totalLengthMm: out.reduce((a, id) => a + set.chains[id].lengthMm, 0),
      });
  }
  let v = set;
  if (back.length) {
    classes.push({
      id: Math.max(-1, ...set.classes.map((c) => c.id)) + 1,
      role: 'internal',
      sizeLabel: null,
      chains: back,
      totalLengthMm: back.reduce((a, id) => a + set.chains[id].lengthMm, 0),
      evidence: [
        { kind: 'face-stray', why: `${back.length} strays handed back to the size checks` },
      ],
      confidence: Math.min(...set.classes.filter(unsure).map((c) => c.confidence)),
    });
    v = { ...set, classes };
  }
  if (!o.off) gradeViews.set(set, v);
  return v;
}

/** Per wall line: piece wall, stray or internal (see the header). */
function classify(
  fr: FaceRaster,
  blobs: FaceBlob[],
  kept: ReadonlySet<number>,
  chains: readonly Chain[],
  items: readonly WallItem[],
  styles: ReadonlyMap<number, Style>,
  offered: ReadonlySet<PathId>,
  off: NonNullable<FaceRoleOpts['off']>,
): { verdict: Map<ChainId, Verdict>; rim: ChainId[]; rimStyle: Style | undefined } {
  const { g, face, ext, faces: fs, depth } = fr;
  const W = g.W;
  const junkBlob = new Set(blobs.filter((b) => b.junk).map((b) => b.id));
  type S = { rim: number; out: number; junk: number; ext: number; n: number };
  const stat = new Map<ChainId, S>();
  const labels = new Set<number>();
  for (const it of items) {
    const s: S = { rim: 0, out: 0, junk: 0, ext: 0, n: 0 };
    const visit = (x: number, y: number) => {
      if (!g.inside(x, y)) return;
      s.n++;
      labels.clear();
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (!g.inside(xx, yy)) continue;
          const q = yy * W + xx;
          if (ext[q]) labels.add(EXT);
          else if (face[q] >= 0) labels.add(face[q]);
        }
      let keptFaces = 0;
      let junkFaces = 0;
      const depths = new Set<number>();
      for (const l of labels) {
        if (l === EXT) {
          depths.add(0);
          continue;
        }
        const b = fs[l].blob;
        if (kept.has(b)) {
          keptFaces++;
          // a face counts for a depth change only when it is piece-sized (not a glyph's bowl)
          if (fs[l].px * fr.cell * fr.cell >= FACE_MIN_MM2) depths.add(depth[l]);
        } else if (junkBlob.has(b)) junkFaces++;
      }
      if (labels.has(EXT)) s.ext++;
      if (!keptFaces && !junkFaces) s.out++;
      else if (keptFaces && depths.size >= 2) s.rim++;
      else if (!keptFaces && junkFaces) s.junk++;
    };
    const pts = it.closed && it.pts.length > 2 ? [...it.pts, it.pts[0]] : it.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const m = Math.max(1, Math.ceil(L / fr.cell));
      for (let j = 0; j < m; j++)
        visit(g.ix(a.x + ((b.x - a.x) * j) / m), g.iy(a.y + ((b.y - a.y) * j) / m));
    }
    const prev = stat.get(it.chain);
    if (prev) {
      prev.rim += s.rim;
      prev.out += s.out;
      prev.junk += s.junk;
      prev.ext += s.ext;
      prev.n += s.n;
    } else stat.set(it.chain, s);
  }
  // the pen of the outer outlines: the dominant style of lines on the outside rim
  const rimLen = new Map<number, number>();
  for (const [id, s] of stat)
    if (s.n && s.rim >= 0.6 * s.n && s.ext >= 0.3 * s.n)
      rimLen.set(chains[id].style, (rimLen.get(chains[id].style) ?? 0) + chains[id].lengthMm);
  const rimStyle = styles.get([...rimLen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1);
  const out = new Map<ChainId, Verdict>();
  for (const [id, s] of stat) {
    const c = chains[id];
    const paths = [...new Set(c.ranges.map((r) => r.path))];
    const offeredShare = paths.length
      ? paths.filter((p) => offered.has(p)).length / paths.length
      : 0;
    const wallLike = s.n > 0 && s.rim >= 0.6 * s.n;
    if (wallLike && (!rimStyle || sameStyle(styles.get(c.style), rimStyle)) && offeredShare < 0.5) {
      out.set(id, { kind: 'piece', why: 'bounds an outline' });
      continue;
    }
    if (!off.has('offered') && offeredShare >= 0.5)
      out.set(id, { kind: 'stray', why: 'offered as background by the clean step' });
    else if (!off.has('outside') && s.n && s.out >= 0.3 * s.n)
      out.set(id, { kind: 'stray', why: 'outside every outline' });
    else if (!off.has('junk') && s.n && s.junk >= 0.5 * s.n)
      out.set(id, { kind: 'stray', why: 'in a test square / legend / table' });
    else out.set(id, { kind: 'internal', why: 'inside an outline' });
  }
  const rim = [...stat]
    .filter(([id, s]) => out.get(id)?.kind === 'piece' && s.ext >= 0.3 * s.n)
    .map(([id]) => id);
  return { verdict: out, rim, rimStyle };
}

const STEP_MM = 2;
/** Pieces of one hand-drawn line: ends this close are one run (the chains' join gap). */
const WIGGLE_JOIN_MM = 3;
const REACH_MM = 30;

/**
 * Lines that keep a constant distance (3–30 mm, ± 0.5 mm over ≥ 20 mm stretches, ≥ 55 % of their
 * length) to the outer outline lines: the seam line drawn inside the cut line (chains/seam.ts
 * measures the same between two pens; here both are one pen).
 */
function drawnDouble(chains: readonly Chain[], rim: ChainId[], cand: ChainId[]): ChainId[] {
  if (!rim.length || !cand.length) return [];
  const pts = (c: Chain) => (c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts);
  const grid = new SegGrid(8);
  for (const id of rim) grid.addPolyline(id, pts(chains[id]));
  const out: ChainId[] = [];
  for (const id of cand) {
    const c = chains[id];
    if (c.lengthMm < 40) continue;
    const ds: number[] = [];
    for (const smp of resample(pts(c), STEP_MM)) {
      let best = Infinity;
      grid.near(smp.p, REACH_MM, (o, si) => {
        const q = pts(chains[o]);
        const r = segNearest(smp.p, q[si], q[si + 1]);
        if (r.d < best) best = r.d;
      });
      ds.push(best);
    }
    if (ds.length < 10) continue;
    let held = 0;
    let k = 0;
    while (k < ds.length) {
      const d0 = ds[k];
      let j = k + 1;
      if (d0 >= 3 && d0 <= REACH_MM) while (j < ds.length && Math.abs(ds[j] - d0) <= 0.5) j++;
      if (d0 >= 3 && d0 <= REACH_MM && (j - k) * STEP_MM >= 20) held += j - k;
      k = j;
    }
    if (held >= 0.55 * ds.length) out.push(id);
  }
  return out;
}

function segX(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}

/**
 * Lines inside the outlines that no pattern draws (each one evidence → the stray row, asked):
 *   crosses an outline   straight (chord ≥ 95 % of the length), ≥ 60 mm, passing through an
 *                        outline line ≥ 5 mm from both its ends (wm's diagonals; a notch is short,
 *                        a grain line stays inside);
 *   wiggles              ≥ 150 mm turning ≥ 6π, also as a run of pieces end to end (a
 *                        hand-drawn map; an armhole turns ½π, a rounded pocket 2π);
 *   stroke lettering     < 30 mm strokes, ≥ 3 others within 25 mm, none touching an outline (the
 *                        "SIZE: M" the clean step could not read as text; a grain line's two
 *                        arrowheads and spaced buttonholes stay).
 */
function insideStrays(
  chains: readonly Chain[],
  outline: readonly ChainId[],
  cand: readonly ChainId[],
): Map<ChainId, string> {
  const out = new Map<ChainId, string>();
  const pts = (c: Chain) => (c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts);
  const grid = new SegGrid(8);
  for (const id of outline) grid.addPolyline(id, pts(chains[id]));
  const crossesOutline = (c: Chain) => {
    const p = pts(c);
    let along = 0;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let hit = false;
      grid.near(mid, L / 2 + 1, (o, si) => {
        if (hit) return;
        const q = pts(chains[o]);
        if (!segX(a, b, q[si], q[si + 1])) return;
        // where along the line it crosses: not at its ends (a line ending on the outline)
        hit = along + L / 2 >= 5 && c.lengthMm - (along + L / 2) >= 5;
      });
      if (hit) return true;
      along += L;
    }
    return false;
  };
  const short: ChainId[] = [];
  for (const id of cand) {
    const c = chains[id];
    const p = c.pts;
    if (p.length < 2) continue;
    const chord = Math.hypot(p[p.length - 1].x - p[0].x, p[p.length - 1].y - p[0].y);
    if (c.lengthMm >= 60 && chord >= 0.95 * c.lengthMm && crossesOutline(c)) {
      out.set(id, 'cross an outline');
      continue;
    }
    if (c.lengthMm < 30) short.push(id);
  }
  // wiggles: a line (or a run of pieces end to end — a hand-drawn line breaks into many) of
  // ≥ 150 mm turning ≥ 6π
  const rest = cand.filter((id) => !out.has(id) && chains[id].pts.length >= 2);
  const ends = new SegGrid(4);
  rest.forEach((id) => {
    const p = chains[id].pts;
    ends.addSeg(id, 0, p[0], p[0]);
    ends.addSeg(id, 1, p[p.length - 1], p[p.length - 1]);
  });
  const parent = new Map<ChainId, ChainId>(rest.map((id) => [id, id]));
  const find = (i: ChainId): ChainId => {
    while (parent.get(i) !== i) i = parent.get(i)!;
    return i;
  };
  for (const id of rest) {
    const p = chains[id].pts;
    for (const e of [p[0], p[p.length - 1]])
      ends.near(e, WIGGLE_JOIN_MM, (o, k) => {
        if (o === id) return;
        const q = chains[o].pts;
        const f = k === 0 ? q[0] : q[q.length - 1];
        if (Math.hypot(f.x - e.x, f.y - e.y) <= WIGGLE_JOIN_MM) parent.set(find(o), find(id));
      });
  }
  const groups = new Map<ChainId, ChainId[]>();
  for (const id of rest) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  for (const ids of groups.values()) {
    const L = ids.reduce((a, i) => a + chains[i].lengthMm, 0);
    const T = ids.reduce((a, i) => a + turnOf(pts(chains[i])), 0);
    if (L >= 150 && T >= 6 * Math.PI) for (const i of ids) out.set(i, 'wiggle (no pattern line)');
  }
  // stroke lettering: short strokes in a crowd, none on an outline
  const mid = (c: Chain) => c.pts[Math.floor(c.pts.length / 2)];
  const onOutline = (c: Chain) => {
    let hit = false;
    for (const q of [c.pts[0], c.pts[c.pts.length - 1]])
      grid.near(q, 2, (o, si) => {
        if (hit) return;
        const r = pts(chains[o]);
        if (segNearest(q, r[si], r[si + 1]).d <= 1.5) hit = true;
      });
    return hit;
  };
  for (const id of short) {
    const c = chains[id];
    if (out.has(id) || onOutline(c)) continue;
    const m = mid(c);
    const crowd = short.filter(
      (o) => o !== id && Math.hypot(mid(chains[o]).x - m.x, mid(chains[o]).y - m.y) <= 25,
    ).length;
    if (crowd >= 3) out.set(id, 'stroke lettering');
  }
  return out;
}

/** Short internal lines (< 80 mm) whose both ends meet the ends of strays, to a fixpoint. */
function strayPieces(
  chains: readonly Chain[],
  outline: readonly ChainId[],
  strays: readonly ChainId[],
  cand: readonly ChainId[],
): ChainId[] {
  const endsOf = (id: ChainId) => {
    const p = chains[id].pts;
    return [p[0], p[p.length - 1]];
  };
  const wall = new SegGrid(8);
  for (const id of outline) {
    const c = chains[id];
    wall.addPolyline(id, c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts);
  }
  const onWall = (q: PtMm) => {
    let hit = false;
    wall.near(q, 2, (o, si) => {
      if (hit) return;
      const c = chains[o];
      const r = c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts;
      if (segNearest(q, r[si], r[si + 1]).d <= 1.5) hit = true;
    });
    return hit;
  };
  const ends = new SegGrid(4);
  const add = (id: ChainId) => endsOf(id).forEach((e, k) => ends.addSeg(id, k, e, e));
  strays.forEach(add);
  const set = new Set(strays);
  const out: ChainId[] = [];
  const left = cand.filter(
    (id) => chains[id].pts.length >= 2 && chains[id].lengthMm < 80 && !endsOf(id).some(onWall),
  );
  for (let round = 0; round < 12; round++) {
    let moved = false;
    for (const id of left) {
      if (set.has(id)) continue;
      const met = endsOf(id).every((e) => {
        let hit = false;
        ends.near(e, WIGGLE_JOIN_MM, (o, k) => {
          if (hit || o === id || !set.has(o)) return;
          const f = endsOf(o)[k];
          if (Math.hypot(f.x - e.x, f.y - e.y) <= WIGGLE_JOIN_MM) hit = true;
        });
        return hit;
      });
      if (!met) continue;
      set.add(id);
      add(id);
      out.push(id);
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/** The strays a hand drew (a map, a scribble): their pieces continue them. */
const HAND_DRAWN = new Set(['wiggle (no pattern line)', 'part of a line set aside']);
/** N3: a run end this close to a hand-drawn stray's end continues it (a letter cut the gap), mm. */
const HAND_GAP_MM = 10;

const onOutlineAt = (chains: readonly Chain[], wall: SegGrid, q: PtMm, d = 1.5) => {
  let hit = false;
  wall.near(q, d + 0.5, (o, si) => {
    if (hit) return;
    const c = chains[o];
    const r = c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts;
    if (segNearest(q, r[si], r[si + 1]).d <= d) hit = true;
  });
  return hit;
};

const wallGrid = (chains: readonly Chain[], outline: readonly ChainId[]) => {
  const wall = new SegGrid(8);
  for (const id of outline) {
    const c = chains[id];
    wall.addPolyline(id, c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts);
  }
  return wall;
};

/**
 * N3 (wm M front): a hand-drawn line crossed by the watermark's letters breaks into runs the
 * end-to-end rule cannot reach (a letter took the piece between). A run of short curved internal
 * pieces (each < 80 mm, joined end to end ≤ 3 mm, no end on an outline, the run turning or not
 * straight) whose run end lies ≤ 10 mm from the end of a hand-drawn stray continues it — the same
 * suggestion (the stray row, asked), to a fixpoint.
 */
function handDrawnRuns(
  chains: readonly Chain[],
  outline: readonly ChainId[],
  handDrawn: readonly ChainId[],
  cand: readonly ChainId[],
): Map<ChainId, string> {
  const out = new Map<ChainId, string>();
  if (!handDrawn.length) return out;
  const wall = wallGrid(chains, outline);
  const endsOf = (id: ChainId) => {
    const p = chains[id].pts;
    return [p[0], p[p.length - 1]];
  };
  const left = cand.filter(
    (id) =>
      chains[id].pts.length >= 2 &&
      chains[id].lengthMm < 80 &&
      !endsOf(id).some((e) => onOutlineAt(chains, wall, e)),
  );
  // runs: pieces joined end to end
  const parent = new Map<ChainId, ChainId>(left.map((id) => [id, id]));
  const find = (i: ChainId): ChainId => {
    while (parent.get(i) !== i) i = parent.get(i)!;
    return i;
  };
  const ends = new SegGrid(4);
  left.forEach((id) => endsOf(id).forEach((e, k) => ends.addSeg(id, k, e, e)));
  for (const id of left)
    for (const e of endsOf(id))
      ends.near(e, WIGGLE_JOIN_MM, (o, k) => {
        if (o === id) return;
        const f = endsOf(o)[k];
        if (Math.hypot(f.x - e.x, f.y - e.y) <= WIGGLE_JOIN_MM) parent.set(find(o), find(id));
      });
  const runs = new Map<ChainId, ChainId[]>();
  for (const id of left) runs.set(find(id), [...(runs.get(find(id)) ?? []), id]);
  // a run end = a piece end no other piece of the run meets
  const runEnds = (ids: ChainId[]) =>
    ids.flatMap((id) =>
      endsOf(id).filter(
        (e) =>
          !ids.some(
            (o) =>
              o !== id && endsOf(o).some((f) => Math.hypot(f.x - e.x, f.y - e.y) <= WIGGLE_JOIN_MM),
          ),
      ),
    );
  const curved = (ids: ChainId[]) => {
    const L = ids.reduce((a, i) => a + chains[i].lengthMm, 0);
    const T = ids.reduce((a, i) => a + turnOf(chains[i].pts), 0);
    const e = runEnds(ids);
    const chord = e.length === 2 ? Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y) : 0;
    return T >= 0.25 * Math.PI || ids.length >= 2 || chord < 0.95 * L;
  };
  const hand = new SegGrid(8);
  const addHand = (id: ChainId) => endsOf(id).forEach((e, k) => hand.addSeg(id, k, e, e));
  handDrawn.forEach(addHand);
  const done = new Set<ChainId>();
  for (let round = 0; round < 12; round++) {
    let moved = false;
    for (const [r, ids] of runs) {
      if (done.has(r) || !curved(ids)) continue;
      const meets = runEnds(ids).some((e) => {
        let hit = false;
        hand.near(e, HAND_GAP_MM, (o, k) => {
          if (hit || ids.includes(o)) return;
          const f = endsOf(o)[k];
          if (Math.hypot(f.x - e.x, f.y - e.y) <= HAND_GAP_MM) hit = true;
        });
        return hit;
      });
      if (!meets) continue;
      done.add(r);
      for (const id of ids) {
        out.set(id, 'part of a line set aside');
        addHand(id);
      }
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/** N3: strokes this short at a line's end, this close to it, at least this many = lettering. */
const LETTER_STROKE_MM = 15;
const LETTER_END_MM = 2.5;
const LETTER_MIN_STROKES = 3;

/**
 * N3 (wm M back): a long straight line (≥ 60 mm) inside an outline, touching it at neither end,
 * that runs from free space (nothing within 2 mm of one end) into lettering set aside (≥ 3 short
 * strokes the clean step or the legend set aside within 2.5 mm of the other end — a tile label's
 * «KOLUMNA 5»). No pattern line ends inside a tile label: the stray row (asked, D3).
 */
function intoLettering(
  chains: readonly Chain[],
  outline: readonly ChainId[],
  strays: readonly ChainId[],
  cand: readonly ChainId[],
): Map<ChainId, string> {
  const out = new Map<ChainId, string>();
  const wall = wallGrid(chains, outline);
  const pts = (c: Chain) => (c.closed && c.pts.length > 2 ? [...c.pts, c.pts[0]] : c.pts);
  const short = new SegGrid(4);
  for (const id of new Set(strays)) {
    const c = chains[id];
    if (c && c.lengthMm <= LETTER_STROKE_MM && c.pts.length >= 2) short.addPolyline(id, pts(c));
  }
  const any = new SegGrid(8);
  for (const c of chains) if (c.pts.length >= 2) any.addPolyline(c.id, pts(c));
  const near = (g: SegGrid, q: PtMm, d: number, skip: ChainId) => {
    const hit = new Set<ChainId>();
    g.near(q, d + 0.5, (o, si) => {
      if (o === skip || hit.has(o)) return;
      const r = pts(chains[o]);
      if (segNearest(q, r[si], r[si + 1]).d <= d) hit.add(o);
    });
    return hit;
  };
  for (const id of cand) {
    const c = chains[id];
    if (c.closed || c.pts.length < 2 || c.lengthMm < 60) continue;
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.95 * c.lengthMm) continue;
    if (onOutlineAt(chains, wall, a) || onOutlineAt(chains, wall, b)) continue;
    for (const [e, f] of [
      [a, b],
      [b, a],
    ] as const) {
      if (near(short, e, LETTER_END_MM, id).size < LETTER_MIN_STROKES) continue;
      if (near(any, f, 2, id).size) continue;
      out.set(id, 'runs into lettering set aside');
      break;
    }
  }
  return out;
}
