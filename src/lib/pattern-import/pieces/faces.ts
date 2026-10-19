// pieces/ (A2) — every closed face of the sheet in one pass, and one seed per closed outline.
//
// The fill raster (raster.ts) with the walls of EVERY rank drawn (common + each size's lines +
// lone stretches + band cuts; rescued 'ignore' lines drawn as "weak" walls), the exterior flooded
// from the border, then two labellings:
//   faces   4-connected components of the pixels that are neither wall nor exterior — each has an
//           area, a box and its nesting depth (walls crossed from the outside);
//   blobs   4-connected components of the NOT-exterior pixels (walls included) — exactly the region
//           fillPieces takes for a seed (regionOf), so one blob is one seed: the rings of a
//           multi-size nest, a cut + seam double line, a dart or a split by an internal line all
//           stay inside one blob and never make a second seed (two seeds in one region would be
//           "merged" and split by cells — a wrong piece).
// The seed of a blob is the pole of inaccessibility of its free pixels (chamfer distance to the
// nearest wall): rings and slivers are thin, so it lies in the innermost face of the nest — one
// point per outline whatever the operator would have clicked (the r4454 back closed or was refused
// by where the click fell, FLY-final M2; its face seed closes all six sizes). A click stays where
// the operator puts it and supersedes the face seed of its outline (worker/session.ts).
// One blob may hold several outlines (splitUnits): its faces big enough to be a piece are compared
// by their FILLED outlines. Inside another and of its shape (area ratio, how far the outer line
// strays) = another size of it or its seam line; of another shape = a piece of its own (wm's collar
// inside the back, a pocket between two size lines), seeded when drawn in the outline pen, and on a
// graded sheet only as a nest of its own sizes (a lone shape of size lines is where sizes cross).
// Side by side, touching along < CONTACT_MM (a corner) = two pieces; along more = one seeded, the
// other set aside (a seam strip, a half split by an inner line, a piece drawn joined to it).
// SEEDNAME: a face set aside so (or by the fragments rule) that prints its own piece name AND is
// closed by one size's lines alone is seeded as a piece of its own (judgeBlobs namedOneSize).
//
// D3: a face seed is not a decision (the piece still goes through the fill, the H1 guard and the
// gate) but it must never make a piece out of junk silently. Not seeded, with the reason:
//   small        the blob is below PATIMPORT.minPieceAreaMm2;
//   sheet        it covers > 60 % of the sheet (a sheet border drawn as a wall);
//   tile-frame   its box is a page rectangle (± 2 mm);
//   (both peel: the faces just inside the frame are taken as the outside and the outlines within
//   it are seeded on their own)
//   test-square  its box is the drawn test square (chains/classify testSquareBoxes, ± 2 mm);
//   legend       ≥ 3 texts and ≥ 3 parallel short line samples, each with a text at its end and
//                floating (a line with both ends on other lines crosses a piece: r4454's band
//                with its size ends), a quarter of its line length (a notch stack is a sliver);
//   table        ≥ 6 rectangular cells, ≥ 4 of one height, most of its area, no dominant cell
//                (a size table; a collar with notches across its rings has its core);
//   unlabelled   the sheet labels its pieces in text (≥ 2 text seeds) and not this outline;
//   other-size   file-per-size side by side: only the first size's drawing is seeded (the fill
//                carries the seed to the other sizes' drawings);
//   logo         > 40 wall strokes < 5 mm, a quarter of its line length (a logo, a hatching);
//   background   most of its outer wall is lines set aside as page furniture (rescued only by the
//                wall model, never an outline of their own).
// A blob holding a text seed is the text seed's (text wins); a text seed IN junk (a "10" in the
// test square, a table cell) is held back. D3: no closed outline vanishes silently — every outline
// not seeded and every held text seed comes back as a SetAside (asidesOf), listed on the pieces
// step with its reason and "this is a piece" one click away.
import type {
  BoxMm,
  Chain,
  ChainId,
  ChainRole,
  FaceJunk,
  ChainSet,
  IRText,
  PagePose,
  PtMm,
  Seed,
  SetAside,
  SetAsideCopy,
  SetAsideDart,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';
import { PATIMPORT, SLIVER_MM } from 'lib/pattern-import/types';
import { pageMarginIds, testSquareBoxes } from 'lib/pattern-import/chains/classify';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';

import { chainView, faceCapBox, partAt, sheetView } from '../assemble/composite';
import { drawPolyline, exterior, Grid } from './raster';
import type { WallItem } from './snap';
import {
  cornerSources,
  itemsOf,
  lonePortions,
  rescuedIgnored,
  sheetModule,
  wallModel,
} from './walls';

export type { FaceJunk };

/** One closed outline (blob) of the sheet and what became of it. */
export type FaceBlob = {
  id: number;
  /** Area inside its outer wall (walls and inner faces included), mm². */
  areaMm2: number;
  box: BoxMm;
  /** Pole of inaccessibility of its free space — the seed point. */
  at: PtMm;
  /** Distance from `at` to the nearest wall, mm. */
  clearMm: number;
  /** Nesting depth of the face holding `at` (1 = just inside the outer wall). */
  depth: number;
  /** Texts whose centre lies inside. */
  texts: number;
  /** Why it is not seeded (null = seeded, or the text seed's). */
  junk: FaceJunk | null;
  /** The text seed whose blob it is (no face seed then). */
  textSeed: number | null;
  /** Peeled out of a frame / sheet-sized blob. */
  peeled?: boolean;
  /** A piece drawn inside another blob (its id); for an aside, the outline it belongs to. */
  inside?: number;
  /** One outline of a blob set aside (not the blob's own seeded outline): no pixels of its own. */
  aside?: boolean;
  /**
   * A 'size-copy' / 'seam-line' aside: how it was told a copy, and whether the outline it was
   * attached to (`inside`) was seeded by the face pass.
   */
  copy?: {
    how: CopyHow;
    hostSeeded: boolean;
    rim?: PtMm[];
    cellMm?: number;
    /** The text seeds standing in its own face (not in the faces it holds). */
    labels?: number[];
    /** A piece label (pieceLabelText) in its own face that its host carries nowhere else. */
    ownText?: string;
  };
  /**
   * DARTS: an aside whose only label is a dart / pleat / tuck word and whose face is a narrow wedge
   * (SetAsideDart) — the mouth on its host's outline is proven later, against the host's sizes.
   */
  dart?: Omit<SetAsideDart, 'host'> & { hostSeeded: boolean };
};

/**
 * How a face was set aside as another size (or the seam line) of a piece:
 *   shape     inside it and of its shape (area ratio, outer line close) — a proven copy;
 *   sliver    joined to it, no wider than 2 × SLIVER_MM (the gap between two sizes' lines);
 *   lines     joined to it across size lines only, of any shape (proves nothing about its shape);
 *   fragment  a shape bounded by size lines with no copy of itself in another size.
 */
export type CopyHow = SetAsideCopy['how'];

export type FaceOpts = {
  cellMm?: number;
  /** Probe mutation switches: a filter off (its junk is seeded). */
  off?: ReadonlySet<FaceSwitch>;
  /** Chain id → class id (nested outlines must be drawn in a class of the main outline). */
  classOf?: ReadonlyMap<ChainId, number>;
  /** Chain id → its legend role ('inner-line': split by internal lines). */
  roleOf?: ReadonlyMap<ChainId, ChainRole>;
  /** The size lines of a graded sheet (a copy across them is another size). */
  sizeLine?: ReadonlySet<ChainId>;
  /** The sheet draws several sizes (nested copies are sizes, not seam lines). */
  graded?: boolean;
  /**
   * SEEDNAME: the rank a wall item is a wall of in the fill — a size rank, 'all' (common lines,
   * lone stretches: walls of every rank), null (a wall of no one rank's fill, e.g. a band cut).
   */
  rankOfItem?: (it: WallItem) => number | 'all' | null;
};

/** A filter, or a step of the face pass ('units': the split of a blob into outlines). */
export type FaceSwitch =
  | FaceJunk
  | 'peel'
  | 'nested'
  | 'units'
  | 'held'
  | 'free-ends'
  | 'fragments'
  | 'own-name';

/** The labelled raster (faces, depth, blobs, clearance). */
export type FaceRaster = {
  g: Grid;
  cell: number;
  wall: Uint8Array;
  weak: Uint8Array;
  ext: Uint8Array;
  /** Face id per pixel (−1 wall or exterior). */
  face: Int32Array;
  faces: FaceStat[];
  /** Walls crossed from the exterior, per face (−1: not reached). */
  depth: Int32Array;
  /** Blob id per pixel (−1 exterior); peeled and nested blobs are relabelled. */
  blobAt: Int32Array;
  /** Chamfer clearance (3 per pixel) of every free pixel. */
  dt: Uint16Array;
};

export type FaceStat = { px: number; x0: number; y0: number; x1: number; y1: number; blob: number };

/** The labelled raster and its blobs, kept by the session to place the operator's clicks. */
export type FaceMap = {
  g: Grid;
  blobAt: Int32Array;
  blobs: FaceBlob[];
  /**
   * D6: a drawing of several tile sheets is read one sheet at a time — each sheet's raster (blob
   * ids already global); `g` / `blobAt` above are the first one's. Read through `blobOf`.
   */
  subs?: { g: Grid; blobAt: Int32Array }[];
};

const SQUARE_TOL_MM = 2;
/** Two outlines side by side touching along less than this are two pieces (a point, a corner). */
const CONTACT_MM = 15;
/** Outlines this close (walls and slivers too small to be a piece between them) touch. */
const GAP_MM = 4;
/** A face joined to a larger one no wider than 2 × this is a strip of it (a seam allowance). */
const STRIP_MM = 20;
/** A nested outline is a copy of the one around it from this area ratio … */
const COPY_RATIO = 0.45;
/** … when the outer line strays from it by at most max(COPY_MM, COPY_SHARE · √area). */
const COPY_MM = 30;
const COPY_SHARE = 0.2;
/** Edge points a 'lines' / 'fragment' copy carries (SetAsideCopy.rim). */
const RIM_SAMPLES = 160;
/** A blob with more piece-sized faces than this is not split (a grid of cells: junk anyway). */
const MAX_UNIT_FACES = 200;
/** A piece drawn inside another is outlined in lines at least this long (not glyph strokes). */
const NESTED_LINE_MM = 40;
const FRAME_TOL_MM = 2;
/** The face pass keeps its raster under this many pixels (a coarser cell on a huge sheet). */
const MAX_PX = 4e6;
const EXT = -2;
/**
 * SEEDNAME: a piece name printed in a face — a garment-part word or a cutting instruction
 * ("CUT 2", "CUT 1 ON FOLD"); a word split by a tile edge ("ONT") is no name.
 */
const PIECE_NAME =
  /\b(?:front|back|sleeves?|slv|collar|cuffs?|facing|yoke|pockets?|waistband|band|bodice|skirt|pants?|shorts|panel|placket|lining|flap|belt|straps?|hood|gusset|cups?|tie|loop|ruffle|flounce|extension|underlay|overlay|casing|binding|peplum|lapel|stand|welt|fly|leg|godet|tier|insert|sash|bib)\b|\bcut\s*\d+\b/i;
/** …and what says the outline is no piece to cut (a template, a view's cut line). */
const NOT_A_PIECE =
  /do\s*not\s*cut|don'?t\s*cut|template|cut\s*(?:here|line)|trim\s+(?:here|line)/i;
/** …or a mark whose own outline / a fold this face may be (Codex r1: a veto wherever it stands). */
const MARK_VETO = /placement|fold\s+(?:here|line)/i;
/** A text naming a mark or a fold on a piece, never the piece's own name. */
const MARK_TEXT = /placement|fold\s+(?:here|line|under|back|down|in)|gather|stitch|notch/i;
/** …and a piece face at least this large (a label box, a notch stack is smaller). */
const PIECE_NAMED_MIN_MM2 = 2000;

/** The walls the face pass draws: every rank's (fillPieces rank r draws a subset of these). */
export function faceWalls(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
): {
  items: WallItem[];
  weak: WallItem[];
  model: ReturnType<typeof wallModel>;
  /** The lone stretches among `items` (walls of every rank). */
  lone: ReadonlySet<WallItem>;
} {
  const model = wallModel(set, run, sheet.texts, new Map(sheet.styles.map((s) => [s.id, s])));
  const rescued = rescuedIgnored(
    set,
    model,
    1.5,
    15,
    sheetModule(sheet),
    new Set([...pageMarginIds(set.chains, sheet.poses), ...cornerSources(model)]),
    true,
  );
  const ids = new Set<ChainId>([...model.common, ...model.byRank.flat()]);
  const lone = lonePortions(set, model);
  const items: WallItem[] = [
    ...itemsOf(set, ids),
    ...lone,
    ...(model.bandCuts ?? []).map((b) => ({ chain: -3, pts: [b.from, b.to] })),
  ];
  return { items, weak: itemsOf(set, rescued), model, lone: new Set(lone) };
}

function pageRect(p: PagePose): BoxMm {
  const { a, b, c, d, e, f } = p.toSheet;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [0, 0],
    [p.widthMm, 0],
    [0, p.heightMm],
    [p.widthMm, p.heightMm],
  ]) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const sameBox = (a: BoxMm, b: BoxMm, tol: number) =>
  Math.abs(a.minX - b.minX) <= tol &&
  Math.abs(a.maxX - b.maxX) <= tol &&
  Math.abs(a.minY - b.minY) <= tol &&
  Math.abs(a.maxY - b.maxY) <= tol;

/** 4-connected labelling of the pixels `ok(k)` not yet labelled; returns the next free id. */
function labelAll(g: Grid, lab: Int32Array, ok: (k: number) => boolean, first = 0): number {
  const W = g.W;
  const H = g.H;
  let id = first;
  const stack: number[] = [];
  for (let k0 = 0; k0 < W * H; k0++) {
    if (lab[k0] !== -1 || !ok(k0)) continue;
    lab[k0] = id;
    stack.push(k0);
    while (stack.length) {
      const k = stack.pop()!;
      const y = (k / W) | 0;
      const x = k - y * W;
      if (x > 0 && lab[k - 1] === -1 && ok(k - 1)) {
        lab[k - 1] = id;
        stack.push(k - 1);
      }
      if (x + 1 < W && lab[k + 1] === -1 && ok(k + 1)) {
        lab[k + 1] = id;
        stack.push(k + 1);
      }
      if (y > 0 && lab[k - W] === -1 && ok(k - W)) {
        lab[k - W] = id;
        stack.push(k - W);
      }
      if (y + 1 < H && lab[k + W] === -1 && ok(k + W)) {
        lab[k + W] = id;
        stack.push(k + W);
      }
    }
    id++;
  }
  return id;
}

/** Chamfer (3-4) distance of every free pixel to the nearest blocked one. */
function chamferWH(W: number, H: number, blocked: (k: number) => boolean): Uint16Array {
  const d = new Uint16Array(W * H);
  const INF = 65000;
  for (let k = 0; k < W * H; k++) d[k] = blocked(k) ? 0 : INF;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (!d[k]) continue;
      let v = d[k];
      if (x > 0) v = Math.min(v, d[k - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[k - W] + 3);
        if (x > 0) v = Math.min(v, d[k - W - 1] + 4);
        if (x + 1 < W) v = Math.min(v, d[k - W + 1] + 4);
      }
      d[k] = v;
    }
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const k = y * W + x;
      if (!d[k]) continue;
      let v = d[k];
      if (x + 1 < W) v = Math.min(v, d[k + 1] + 3);
      if (y + 1 < H) {
        v = Math.min(v, d[k + W] + 3);
        if (x + 1 < W) v = Math.min(v, d[k + W + 1] + 4);
        if (x > 0) v = Math.min(v, d[k + W - 1] + 4);
      }
      d[k] = v;
    }
  return d;
}

/** The face pass's cell: the fill's, coarser on a sheet that would exceed MAX_PX. */
export function faceCell(box: BoxMm, cellMm: number): number {
  const area = (box.maxX - box.minX + 30) * (box.maxY - box.minY + 30);
  return Math.max(cellMm, Math.sqrt(area / MAX_PX));
}

/** Walls drawn, exterior flooded, faces / depth / blobs / clearance labelled. */
export function faceRaster(
  sheetBox: BoxMm,
  items: readonly WallItem[],
  weakItems: readonly WallItem[],
  cellMm: number,
  /** D6: the box the cell is capped by (the largest tile sheet of a composite); default `sheetBox`. */
  capBox: BoxMm = sheetBox,
): FaceRaster {
  const cell = faceCell(capBox, cellMm);
  const g = new Grid(
    {
      minX: sheetBox.minX - 15,
      minY: sheetBox.minY - 15,
      maxX: sheetBox.maxX + 15,
      maxY: sheetBox.maxY + 15,
    },
    cell,
  );
  const N = g.W * g.H;
  const W = g.W;
  const wall = new Uint8Array(N);
  for (const it of items) drawPolyline(g, wall, it.pts, it.closed);
  const weak = new Uint8Array(N);
  for (const it of weakItems) drawPolyline(g, weak, it.pts, it.closed);
  for (let k = 0; k < N; k++) if (weak[k] && !wall[k]) wall[k] = 1;
  const ext = exterior(g, wall);
  const face = new Int32Array(N).fill(-1);
  const nFaces = labelAll(g, face, (k) => !wall[k] && !ext[k]);
  const faces: FaceStat[] = Array.from({ length: nFaces }, () => ({
    px: 0,
    x0: W,
    y0: g.H,
    x1: -1,
    y1: -1,
    blob: -1,
  }));
  for (let k = 0; k < N; k++) {
    const f = face[k];
    if (f < 0) continue;
    const s = faces[f];
    const y = (k / W) | 0;
    const x = k - y * W;
    s.px++;
    if (x < s.x0) s.x0 = x;
    if (x > s.x1) s.x1 = x;
    if (y < s.y0) s.y0 = y;
    if (y > s.y1) s.y1 = y;
  }
  // depth: faces seen from one wall pixel within 2 px (a single drawn line is 3 px thick) are
  // neighbours across that line; BFS from the exterior. Two lines drawn closer than a pixel or two
  // merge into a thicker wall — faces only reached across one are given depth through a 4 px
  // window afterwards (never before: a 4 px window sees across a ring of zero width too).
  const depth = new Int32Array(nFaces).fill(-1);
  {
    const E = nFaces;
    const adjOf = (R: number) => {
      const adj: Set<number>[] = Array.from({ length: nFaces + 1 }, () => new Set<number>());
      const near = new Set<number>();
      for (let k = 0; k < N; k++) {
        if (!wall[k]) continue;
        const y = (k / W) | 0;
        const x = k - y * W;
        near.clear();
        for (let dy = -R; dy <= R; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= g.H) continue;
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const q = yy * W + xx;
            if (ext[q]) near.add(E);
            else if (face[q] >= 0) near.add(face[q]);
          }
        }
        if (near.size > 1) for (const a of near) for (const b of near) if (a !== b) adj[a].add(b);
      }
      return adj;
    };
    const dd = new Int32Array(nFaces + 1).fill(-1);
    const bfs = (adj: Set<number>[], from: number[]) => {
      const q = from.slice();
      for (let h = 0; h < q.length; h++)
        for (const b of adj[q[h]])
          if (dd[b] < 0) {
            dd[b] = dd[q[h]] + 1;
            q.push(b);
          }
    };
    dd[E] = 0;
    bfs(adjOf(2), [E]);
    if (dd.some((v, f) => v < 0 && f < nFaces && faces[f].px > 0)) {
      const wide = adjOf(4);
      const reached: number[] = [];
      for (let f = 0; f <= nFaces; f++) if (dd[f] >= 0) reached.push(f);
      // continue from the reached faces in depth order, only into the unreached ones
      reached.sort((a, b) => dd[a] - dd[b]);
      bfs(wide, reached);
    }
    for (let f = 0; f < nFaces; f++) depth[f] = dd[f];
  }
  const blobAt = new Int32Array(N).fill(-1);
  labelAll(g, blobAt, (k) => !ext[k]);
  for (let k = 0; k < N; k++)
    if (face[k] >= 0 && faces[face[k]].blob < 0) faces[face[k]].blob = blobAt[k];
  const dt = chamferWH(g.W, g.H, (k) => wall[k] === 1 || ext[k] === 1);
  return { g, cell, wall, weak, ext, face, faces, depth, blobAt, dt };
}

/**
 * Wall items sampled every cell: per item the faces (or EXT) its samples touch within 2 px, and
 * the samples count — which outline a line bounds.
 */
export function touchOf(fr: FaceRaster, items: readonly WallItem[]) {
  const { g, face, ext } = fr;
  const W = g.W;
  return items.map((it) => {
    const touch = new Map<number, number>();
    let n = 0;
    const seen = new Set<number>();
    const visit = (p: PtMm) => {
      const x = g.ix(p.x);
      const y = g.iy(p.y);
      if (!g.inside(x, y)) return;
      n++;
      seen.clear();
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (!g.inside(xx, yy)) continue;
          const q = yy * W + xx;
          const l = ext[q] ? EXT : face[q];
          if (l === -1 || seen.has(l)) continue;
          seen.add(l);
          touch.set(l, (touch.get(l) ?? 0) + 1);
        }
    };
    const pts = it.closed && it.pts.length > 2 ? [...it.pts, it.pts[0]] : it.pts;
    if (pts.length === 1) visit(pts[0]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const m = Math.max(1, Math.ceil(L / fr.cell));
      for (let j = 0; j < m; j++)
        visit({ x: a.x + ((b.x - a.x) * j) / m, y: a.y + ((b.y - a.y) * j) / m });
    }
    if (pts.length > 1) visit(pts[pts.length - 1]);
    return { touch, n };
  });
}

type BlobAcc = {
  px: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pole: number;
  poleD: number;
  rim: number;
  rimWeak: number;
};

/**
 * The blobs of a face raster judged (junk filters), frames peeled, pieces drawn inside other pieces
 * split off, text seeds deduped. Relabels `fr.blobAt` for peeled and nested blobs.
 */
export function judgeBlobs(
  fr: FaceRaster,
  sheet: Sheet,
  chains: readonly Chain[],
  items: readonly WallItem[],
  textSeeds: readonly Pick<Seed, 'id' | 'at'>[],
  o: FaceOpts = {},
): FaceBlob[] {
  const { g, cell, wall, weak, ext, face, faces: fs, depth, blobAt, dt } = fr;
  const off = o.off ?? new Set();
  const N = g.W * g.H;
  const W = g.W;
  const nFaces = fs.length;
  const pxArea = cell * cell;
  const sb = sheet.bbox;
  const sheetArea = Math.max(1, (sb.maxX - sb.minX) * (sb.maxY - sb.minY));
  const boxOf = (a: { x0: number; y0: number; x1: number; y1: number }): BoxMm => {
    const p = g.corner(a.x0, a.y1 + 1);
    const q = g.corner(a.x1 + 1, a.y0);
    return { minX: p.x, minY: p.y, maxX: q.x, maxY: q.y };
  };
  const pixelOf = (p: PtMm) => {
    const x = g.ix(p.x);
    const y = g.iy(p.y);
    return g.inside(x, y) ? y * W + x : -1;
  };
  const gather = (ids: (k: number) => number, n: number, outside: (k: number) => boolean) => {
    const acc: BlobAcc[] = Array.from({ length: n }, () => ({
      px: 0,
      x0: W,
      y0: g.H,
      x1: -1,
      y1: -1,
      pole: -1,
      poleD: -1,
      rim: 0,
      rimWeak: 0,
    }));
    for (let k = 0; k < N; k++) {
      const b = ids(k);
      if (b < 0 || b >= n) continue;
      const a = acc[b];
      const y = (k / W) | 0;
      const x = k - y * W;
      a.px++;
      if (x < a.x0) a.x0 = x;
      if (x > a.x1) a.x1 = x;
      if (y < a.y0) a.y0 = y;
      if (y > a.y1) a.y1 = y;
      if (face[k] >= 0 && dt[k] > a.poleD) {
        a.poleD = dt[k];
        a.pole = k;
      }
      if (wall[k] && (outside(k - 1) || outside(k + 1) || outside(k - W) || outside(k + W))) {
        a.rim++;
        if (weak[k]) a.rimWeak++;
      }
    }
    return acc;
  };
  const isExt = (k: number) => k >= 0 && k < N && ext[k] === 1;
  let nBlobs = 0;
  for (let k = 0; k < N; k++) if (blobAt[k] >= nBlobs) nBlobs = blobAt[k] + 1;
  const acc = gather((k) => blobAt[k], nBlobs, isExt);
  const accOf = new Map<number, BlobAcc>(acc.map((a, b) => [b, a]));
  const pages = sheet.poses.map(pageRect);
  const squares = testSquareBoxes([...chains], sheet.poses, sheet.texts, [], true).map(
    (s) => s.box,
  );
  const textAt = sheet.texts.map((t) => ({
    t,
    k: pixelOf({ x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 }),
  }));
  const itemMid = items.map((it) =>
    it.pts.length ? pixelOf(it.pts[Math.floor(it.pts.length / 2)]) : -1,
  );
  const itemLen = items.map((it) => {
    let L = 0;
    for (let i = 1; i < it.pts.length; i++)
      L += Math.hypot(it.pts[i].x - it.pts[i - 1].x, it.pts[i].y - it.pts[i - 1].y);
    return L;
  });
  /** The blob (or a peeled / nested one) at a point, nearest within 8 px as seedPixel does. */
  const blobNear = (p: PtMm) => {
    const x0 = g.ix(p.x);
    const y0 = g.iy(p.y);
    for (let r = 0; r <= 8; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!g.inside(x0 + dx, y0 + dy)) continue;
          const v = blobAt[(y0 + dy) * W + x0 + dx];
          if (v >= 0) return v;
        }
    return -1;
  };

  const judge = (
    b: number,
    a: BlobAcc,
    peeled: boolean,
  ): { junk: FaceJunk | null; shell: boolean } => {
    const area = a.px * pxArea;
    const box = boxOf(a);
    if (!off.has('small') && area < PATIMPORT.minPieceAreaMm2)
      return { junk: 'small', shell: false };
    if (!peeled && !off.has('sheet') && area > 0.6 * sheetArea)
      return { junk: 'sheet', shell: true };
    if (!peeled && !off.has('tile-frame') && pages.some((p) => sameBox(p, box, FRAME_TOL_MM)))
      return { junk: 'tile-frame', shell: true };
    if (!off.has('test-square') && squares.some((q) => sameBox(q, box, SQUARE_TOL_MM)))
      return { junk: 'test-square', shell: false };
    if (!off.has('background') && a.rim > 0 && a.rimWeak > 0.5 * a.rim)
      return { junk: 'background', shell: false };
    const mine = fs.filter((s) => s.px > 0 && s.blob === b);
    if (!off.has('table')) {
      const rects = mine.filter(
        (s) => s.px >= 0.9 * (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1) && s.px * pxArea >= 20,
      );
      const hs = new Map<number, number>();
      for (const s of rects) {
        const h = Math.round((s.y1 - s.y0 + 1) * cell);
        hs.set(h, (hs.get(h) ?? 0) + 1);
      }
      const rowCells = Math.max(0, ...hs.values());
      const rectPx = rects.reduce((n, s) => n + s.px, 0);
      const freePx = mine.reduce((n, s) => n + s.px, 0);
      // a table has no dominant cell; a piece (a collar with notches across its rings) has its core
      const biggest = Math.max(0, ...mine.map((s) => s.px));
      if (rects.length >= 6 && rowCells >= 4 && rectPx >= 0.6 * freePx && biggest < 0.3 * freePx)
        return { junk: 'table', shell: false };
    }
    if (!off.has('logo')) {
      let tiny = 0;
      let tinyLen = 0;
      let len = 0;
      items.forEach((_, i) => {
        const k = itemMid[i];
        if (k < 0 || blobAt[k] !== b) return;
        len += itemLen[i];
        if (itemLen[i] < 5) {
          tiny++;
          tinyLen += itemLen[i];
        }
      });
      if (tiny > 40 && tinyLen >= 0.25 * len) return { junk: 'logo', shell: false };
    }
    if (!off.has('legend')) {
      const inside = textAt.filter(({ k }) => k >= 0 && blobAt[k] === b).map(({ t }) => t);
      if (inside.length >= 3) {
        const smp = legendSamples(
          items,
          inside,
          (p) => {
            const k = pixelOf(p);
            return k >= 0 && blobAt[k] === b;
          },
          { off },
        );
        // the samples are what the box is made of (a piece's notch stacks with their size
        // numbers are a sliver of its line work)
        let len = 0;
        items.forEach((_, i) => {
          const k = itemMid[i];
          if (k >= 0 && blobAt[k] === b) len += itemLen[i];
        });
        if (smp.n >= 3 && smp.len >= 0.25 * len) return { junk: 'legend', shell: false };
      }
    }
    return { junk: null, shell: false };
  };

  const blobs: FaceBlob[] = [];
  let touches: ReturnType<typeof touchOf> | null = null;
  const emit = (b: number, a: BlobAcc, peeled: boolean, inside?: number) => {
    const v = judge(b, a, peeled);
    const at = a.pole >= 0 ? g.centre(a.pole % W, (a.pole / W) | 0) : g.centre(a.x0, a.y0);
    const f = a.pole >= 0 ? face[a.pole] : -1;
    blobs.push({
      id: b,
      areaMm2: a.px * pxArea,
      box: boxOf(a),
      at,
      clearMm: (Math.max(0, a.poleD) / 3) * cell,
      depth: f >= 0 ? depth[f] : -1,
      texts: textAt.filter(({ k }) => k >= 0 && blobAt[k] === b).length,
      junk: v.junk,
      textSeed: null,
      ...(peeled ? { peeled } : {}),
      ...(inside != null ? { inside } : {}),
    });
    return v;
  };
  const shells: number[] = [];
  const firstPass: number[] = [];
  for (let b = 0; b < nBlobs; b++) {
    if (!acc[b].px) continue;
    const v = emit(b, acc[b], false);
    firstPass.push(b);
    if (v.shell && !off.has('peel')) shells.push(b);
  }
  let next = nBlobs;
  // peel frames / sheet borders: their depth-1 faces are the outside, the rest is judged anew
  if (shells.length) {
    const shellSet = new Set(shells);
    const outer = new Uint8Array(nFaces);
    for (let f = 0; f < nFaces; f++) if (shellSet.has(fs[f].blob) && depth[f] === 1) outer[f] = 1;
    const sub = new Int32Array(N).fill(-1);
    const end = labelAll(
      g,
      sub,
      (k) => shellSet.has(blobAt[k]) && !(face[k] >= 0 && outer[face[k]]),
      next,
    );
    const outside = (k: number) =>
      k >= 0 && k < N && (ext[k] === 1 || (face[k] >= 0 && outer[face[k]] === 1));
    const acc2 = gather((k) => (sub[k] >= next ? sub[k] - next : -1), end - next, outside);
    for (let k = 0; k < N; k++) if (sub[k] >= next) blobAt[k] = sub[k];
    for (let f = 0; f < nFaces; f++) {
      if (!shellSet.has(fs[f].blob) || outer[f]) continue;
      const k = fs[f].y0 * W + fs[f].x0;
      // the face's top-left pixel may be a corner it does not own: find any of its pixels
      fs[f].blob = blobAt[k] >= next && face[k] === f ? blobAt[k] : blobOfFace(fr, f);
    }
    for (let i = 0; i < acc2.length; i++) {
      const a = acc2[i];
      if (!a.px || a.pole < 0) continue;
      emit(next + i, a, true);
      accOf.set(next + i, a);
      firstPass.push(next + i);
    }
    next = end;
  }
  // units: one blob (the fill's region) may hold several closed outlines — a nest of one piece's
  // sizes, a piece with its seam line, two pieces drawn touching, a collar drawn inside the back.
  // The faces big enough to be a piece are grouped by their filled outlines (pieces/faces header).
  if (!off.has('units'))
    for (const b of firstPass) {
      const B = blobs.find((x) => x.id === b);
      if (B && !B.junk) next = splitUnits(b, B, next);
    }
  // text seeds: the blob each lands in owns no face seed
  for (const s of textSeeds) {
    const bid = blobNear(s.at);
    const B = blobs.find((x) => x.id === bid);
    if (B && B.textSeed == null) B.textSeed = s.id;
  }
  return blobs;

  /**
   * One blob split into its outlines. Faces ≥ minPieceAreaMm2 only (a sliver between two sizes, a
   * glyph's bowl is no outline of its own). Each face's FILLED outline (the face and its holes) is
   * compared with the one just around it:
   *   copy   a similar outline (area ratio ≥ COPY_RATIO, its outer line nowhere further than
   *          max(COPY_MM, COPY_SHARE·√area) from it): another size of the piece, or its seam line —
   *          the same piece, set aside as 'size-copy' / 'seam-line';
   *   own    any other shape (a collar inside the back, a pocket between two size lines, a facing):
   *          a piece of its own, seeded when drawn in the host's outline pen in long lines, else
   *          set aside as 'other-pen' (a label box, a placement mark).
   * Outlines side by side in one blob (not inside each other) are separate pieces when they touch
   * along less than CONTACT_MM (a point, a corner); along more, the largest is seeded and the
   * others set aside ('size-copy' across size lines, 'inner-line' across inner lines, 'joined').
   * Returns the next free blob id.
   */
  function splitUnits(b: number, B: FaceBlob, nextId: number): number {
    const MIN = PATIMPORT.minPieceAreaMm2;
    const fat: number[] = [];
    for (let f = 0; f < nFaces; f++) if (fs[f].blob === b && fs[f].px * pxArea >= MIN) fat.push(f);
    if (fat.length < 2 || fat.length > MAX_UNIT_FACES) return nextId;
    const fatSet = new Set(fat);
    touches ??= touchOf(fr, items);
    const T = touches;
    const fills = new Map<number, FillMask>(fat.map((f) => [f, fillOf(fr, f)]));
    const fillOfF = (f: number) => fills.get(f)!;
    // the face whose filled outline holds this one most tightly
    const parent = new Map<number, number>();
    for (const c of fat) {
      const k = firstPixel(fr, c);
      let best = -1;
      for (const f of fat)
        if (
          f !== c &&
          inFill(fillOfF(f), k, W) &&
          (best < 0 || fillOfF(f).area < fillOfF(best).area)
        )
          best = f;
      if (best >= 0) parent.set(c, best);
    }
    const kids = new Map<number, number[]>();
    for (const [c, p] of parent) kids.set(p, [...(kids.get(p) ?? []), c]);
    const roots = fat.filter((f) => !parent.has(f));
    const poles = new Map<number, { k: number; d: number }>();
    const poleOf = (f: number) => {
      let v = poles.get(f);
      if (v) return v;
      const s = fs[f];
      v = { k: -1, d: -1 };
      for (let y = s.y0; y <= s.y1; y++)
        for (let x = s.x0; x <= s.x1; x++) {
          const k = y * W + x;
          if (face[k] === f && dt[k] > v.d) v = { k, d: dt[k] };
        }
      poles.set(f, v);
      return v;
    };
    const clearMmOf = (f: number) => (Math.max(0, poleOf(f).d) / 3) * cell;
    /** Lines lying mostly between face f1 and one of f2s (an outline round both touches each along half). */
    const sep = (f1: number, f2s: readonly number[]) =>
      items.flatMap((it, i) => {
        const t = T[i];
        if (!t.n || (t.touch.get(f1) ?? 0) < 0.6 * t.n) return [];
        return f2s.some((f2) => (t.touch.get(f2) ?? 0) >= 0.6 * t.n) ? [it.chain] : [];
      });
    /** Why an outline joined to a seeded one along an edge is not seeded itself. */
    const joinedWhy = (f: number, grp: readonly number[]): FaceJunk => {
      const ids = sep(
        f,
        grp.filter((x) => x !== f),
      );
      if (ids.length && o.graded && ids.every((id) => o.sizeLine?.has(id))) return 'size-copy';
      // a thin strip along it (a seam allowance cut into strips by notch ticks, a sliver between
      // two sizes)
      if (clearMmOf(f) <= STRIP_MM && fillOfF(f).area <= 0.35 * fillOfF(grp[0]).area)
        return o.graded ? 'size-copy' : 'seam-line';
      if (ids.length && ids.every((id) => o.roleOf?.get(id) === 'internal')) return 'inner-line';
      return 'joined';
    };
    /** Siblings (faces side by side) grouped by contact ≥ CONTACT_MM; largest first. */
    const groupsOf = (sib: readonly number[]): number[][] => {
      const list = [...sib].sort((x, y) => fillOfF(y).area - fillOfF(x).area);
      const comp = list.map((_, i) => i);
      const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i])));
      if (list.length > 1) {
        let x0 = W;
        let y0 = g.H;
        let x1 = -1;
        let y1 = -1;
        for (const f of list) {
          const F = fillOfF(f);
          x0 = Math.min(x0, F.x0);
          y0 = Math.min(y0, F.y0);
          x1 = Math.max(x1, F.x0 + F.w - 1);
          y1 = Math.max(y1, F.y0 + F.h - 1);
        }
        const padPx = Math.ceil(GAP_MM / cell) + 4;
        x0 = Math.max(0, x0 - padPx);
        y0 = Math.max(0, y0 - padPx);
        x1 = Math.min(W - 1, x1 + padPx);
        y1 = Math.min(g.H - 1, y1 + padPx);
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        const idx = new Int32Array(bw * bh).fill(-1);
        list.forEach((f, i) => {
          const F = fillOfF(f);
          for (let ly = 0; ly < F.h; ly++)
            for (let lx = 0; lx < F.w; lx++) {
              if (!F.m[ly * F.w + lx]) continue;
              const x = lx + F.x0 - x0;
              const y = ly + F.y0 - y0;
              if (x >= 0 && y >= 0 && x < bw && y < bh) idx[y * bw + x] = i;
            }
        });
        // grow every sibling over the walls and the faces too small to be a piece between them
        // (a hairline sliver, a stack of close lines) up to GAP_MM; where two meet they touch
        const blocks = new Map<number, Set<number>>();
        const reach = Math.ceil(GAP_MM / cell) + 3;
        let front: number[] = [];
        for (let l = 0; l < bw * bh; l++)
          if (idx[l] >= 0) {
            front.push(l);
          }
        const meet = (l: number, i: number, j: number) => {
          const key = Math.min(i, j) * list.length + Math.max(i, j);
          let set = blocks.get(key);
          if (!set) blocks.set(key, (set = new Set()));
          const y = ((l / bw) | 0) + y0;
          const x = (l % bw) + x0;
          set.add((y >> 2) * (W + 4) + (x >> 2));
        };
        for (let d = 0; d < reach && front.length; d++) {
          const nx: number[] = [];
          for (const l of front) {
            const ly = (l / bw) | 0;
            const lx = l - ly * bw;
            for (const [ddx, ddy] of [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ]) {
              const xx = lx + ddx;
              const yy = ly + ddy;
              if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
              const q = yy * bw + xx;
              if (idx[q] >= 0) {
                if (idx[q] !== idx[l]) meet(q, idx[l], idx[q]);
                continue;
              }
              const k = (yy + y0) * W + xx + x0;
              const thin = wall[k] || (face[k] >= 0 && !fatSet.has(face[k]));
              if (!thin) continue;
              idx[q] = idx[l];
              nx.push(q);
            }
          }
          front = nx;
        }
        for (const [key, set] of blocks)
          if (set.size * 4 * cell >= CONTACT_MM)
            comp[find(Math.floor(key / list.length))] = find(key % list.length);
      }
      const by = new Map<number, number[]>();
      list.forEach((f, i) => by.set(find(i), [...(by.get(find(i)) ?? []), f]));
      return [...by.values()];
    };
    type Unit = {
      root: number;
      members: number[];
      seeded: boolean;
      junk: FaceJunk | null;
      host: Unit | null;
      id: number;
      /** A nested unit's outline lines (between it and the face around it). */
      rim: number[];
      /** The faces of its outline (with a seam ring too thin to be a piece), for hasSizeCopy. */
      near: Set<number>;
      /** Set aside by the fragments rule: how (a sliver, or a shape with no copy of its own). */
      how?: CopyHow;
    };
    const units: Unit[] = [];
    const asides: { f: number; junk: FaceJunk; host: Unit; how?: CopyHow }[] = [];
    /** The copy account of each face set aside so far (a copy of one inherits it). */
    const howOf = new Map<number, CopyHow>();
    /** How a face set aside as a copy beside / inside `head` was told one (SetAside.copy). */
    const howBeside = (f: number): CopyHow => (clearMmOf(f) <= SLIVER_MM ? 'sliver' : 'lines');
    let outlinePens: Set<number> | null = null;
    const copyWhy: FaceJunk = o.graded ? 'size-copy' : 'seam-line';
    const queue: { f: number; u: Unit }[] = [];
    /** Siblings placed: copies of the host, or units (seeded / other pen) with their strips aside. */
    const place = (sib: readonly number[], host: Unit | null, p: number | null) => {
      for (const grp of groupsOf(sib)) {
        const head = grp[0];
        if (host && p != null) {
          const P = fillOfF(p);
          const C = fillOfF(head);
          const copy =
            !off.has(copyWhy) &&
            (off.has('nested') ||
              (C.area >= COPY_RATIO * P.area &&
                farthestMm(P, C, cell) <=
                  Math.max(COPY_MM, COPY_SHARE * Math.sqrt(P.area * pxArea))));
          if (copy) {
            // of the shape of p: proven only as far as p is — p itself set aside joined across
            // size lines (wm's sleeve beside the back) passes its account on to its copies
            const ph = howOf.get(p);
            const shapeHow: CopyHow =
              ph == null || ph === 'shape'
                ? 'shape'
                : howBeside(head) === 'sliver'
                  ? 'sliver'
                  : ph === 'sliver'
                    ? 'lines'
                    : ph;
            for (const f of grp) {
              host.members.push(f);
              const how = f === head ? shapeHow : howBeside(f);
              howOf.set(f, how);
              asides.push({ f, junk: copyWhy, host, how });
              queue.push({ f, u: host });
            }
            continue;
          }
        }
        const pen = !host || p == null || off.has('other-pen') || drawnInPen(grp, p);
        const u: Unit = {
          root: head,
          members: [head],
          seeded: pen,
          junk: pen ? null : 'other-pen',
          host,
          id: -1,
          rim: rimOf(grp, p),
          near: p == null ? new Set(grp) : facesAround(grp, p),
        };
        units.push(u);
        queue.push({ f: head, u });
        /** SEEDNAME: the faces of this group promoted to pieces of their own, and its asides. */
        const own: Unit[] = [];
        const mineAside: { a: number; q: number }[] = [];
        for (const f of grp.slice(1)) {
          const why = joinedWhy(f, grp);
          // SEEDNAME: a piece drawn against this one (Olea's back beside the front, across the
          // front's size lines) — its own name and one size's lines closing it alone (D3: both).
          // Only across size lines: a face split off by a common / inner line ('joined', or a strip
          // told by its width) may be half of the piece — that stays a question (Codex r1)
          // DARTS (class C): or drawn against it with no line between them at all — it meets the
          // group only through the slivers between its sizes' lines — and each side printing a
          // piece name of its own (namedApart)
          const named =
            !off.has(why) &&
            !off.has('own-name') &&
            !!o.graded &&
            (why === 'size-copy' || (why === 'joined' && namedApart(f, grp))) &&
            namedOneSize(f) != null &&
            acrossSizeLines(f, grp);
          if (off.has(why) || named) {
            const v: Unit = {
              root: f,
              members: [f],
              seeded: pen,
              junk: u.junk,
              host,
              id: -1,
              rim: named ? rimOf([f], p) : u.rim,
              near: named ? (p == null ? new Set([f]) : facesAround([f], p)) : u.near,
            };
            units.push(v);
            queue.push({ f, u: v });
            if (named) own.push(v);
          } else {
            const how = why === 'size-copy' || why === 'seam-line' ? howBeside(f) : 'lines';
            howOf.set(f, how);
            mineAside.push({ a: asides.length, q: queue.length });
            asides.push({
              f,
              junk: why,
              host: u,
              ...(why === 'size-copy' || why === 'seam-line' ? { how } : {}),
            });
            queue.push({ f, u });
          }
        }
        // the group's other faces go to the piece they lie beside (its grading strips): the nearest
        // root across shared lines, the head on a tie — an account only (provenCopy still proves
        // a strip against its piece's closed sizes, or it stays a question)
        if (own.length && mineAside.length) {
          const owner = nearestRoot(grp, [u, ...own]);
          for (const { a, q } of mineAside) {
            const w = owner.get(asides[a].f);
            if (!w || w === u) continue;
            asides[a].host = w;
            queue[q].u = w;
          }
        }
      }
    };
    place(roots, null, null);
    for (let h = 0; h < queue.length; h++) {
      const { f, u } = queue[h];
      const ks = kids.get(f);
      if (ks?.length) place(ks, u, f);
    }
    // a graded sheet: a piece drawn inside or beside another is a nest of its own sizes (wm's collar
    // in seven) or drawn once (common lines only); a shape bounded by size lines (with a common
    // edge or not: leonie's waistband corners) with no copy of itself in another size is a fragment
    // where the sizes cross, not a piece
    if (o.graded && !off.has('fragments'))
      for (const u of units) {
        if (u === units[0] || !u.seeded || hasSizeCopy(u)) continue;
        if (!u.rim.length || u.rim.some((id) => o.sizeLine?.has(id))) {
          // SEEDNAME: a piece of its own after all — it prints its own piece name AND one size's
          // lines close it alone (D3: two independent evidences; the fill and the gates follow)
          if (!off.has('own-name') && namedOneSize(u.root) != null) continue;
          u.seeded = false;
          u.junk = 'size-copy';
          u.how = clearMmOf(u.root) <= SLIVER_MM ? 'sliver' : 'fragment';
        }
      }
    // seeded units get blob ids of their own (the first, largest one keeps b); asides do not — a
    // click there still lands in their host's blob
    const mine = new Set<number>([b]);
    units[0].id = b;
    for (const u of units) {
      if (u === units[0]) continue;
      if (!u.seeded) continue;
      u.id = nextId++;
      mine.add(u.id);
      const F = fillOfF(u.root);
      const st: number[] = [];
      for (let ly = 0; ly < F.h; ly++)
        for (let lx = 0; lx < F.w; lx++) {
          if (!F.m[ly * F.w + lx]) continue;
          const k = (ly + F.y0) * W + lx + F.x0;
          if (mine.has(blobAt[k])) {
            blobAt[k] = u.id;
            st.push(k);
          }
        }
      // and the walls round it (≤ 3 px)
      let ring = st;
      for (let step = 0; step < 3; step++) {
        const nx: number[] = [];
        for (const k of ring)
          for (const q of [k - 1, k + 1, k - W, k + W]) {
            if (q < 0 || q >= N || !wall[q] || blobAt[q] === u.id || !mine.has(blobAt[q])) continue;
            blobAt[q] = u.id;
            nx.push(q);
          }
        ring = nx;
      }
    }
    for (let f = 0; f < nFaces; f++)
      if (mine.has(fs[f].blob)) fs[f].blob = blobAt[firstPixel(fr, f)];
    const one = (id: number) =>
      gather(
        (k) => (blobAt[k] === id ? 0 : -1),
        1,
        (k) => k >= 0 && k < N && blobAt[k] !== id,
      )[0];
    // the blob's own entry now stands for its first unit: its seed in that unit's faces (not in a
    // strip or a half set aside beside it)
    let best = { k: -1, d: -1 };
    for (const f of units[0].members) {
      const q = poleOf(f);
      if (q.d > best.d) best = q;
    }
    if (best.k >= 0) {
      B.at = g.centre(best.k % W, (best.k / W) | 0);
      B.clearMm = (best.d / 3) * cell;
      B.depth = depth[face[best.k]];
    }
    for (const u of units) {
      if (u === units[0]) continue;
      const hostId = u.host?.id != null && u.host.id >= 0 ? u.host.id : b;
      if (u.seeded) {
        const a = one(u.id);
        if (a.px && a.pole >= 0) emit(u.id, a, false, u.host ? hostId : undefined);
        continue;
      }
      asides.push({
        f: u.root,
        junk: u.junk ?? 'other-pen',
        host: u.host ?? units[0],
        ...(u.how ? { how: u.how } : {}),
      });
    }
    for (const x of asides) {
      const F = fillOfF(x.f);
      const { k: pole, d: pd } = poleOf(x.f);
      if (pole < 0) continue;
      blobs.push({
        id: nextId++,
        areaMm2: F.area * pxArea,
        box: boxOf({ x0: F.x0 + 1, y0: F.y0 + 1, x1: F.x0 + F.w - 2, y1: F.y0 + F.h - 2 }),
        at: g.centre(pole % W, (pole / W) | 0),
        clearMm: (pd / 3) * cell,
        depth: depth[x.f],
        texts: 0,
        junk: x.junk,
        textSeed: null,
        inside: x.host.id >= 0 ? x.host.id : b,
        aside: true,
        ...(x.how
          ? {
              copy: {
                how: x.how,
                hostSeeded: x.host.seeded,
                ...(x.how === 'lines' || x.how === 'fragment'
                  ? { rim: rimSamples(F), cellMm: cell }
                  : {}),
                ...labelsIn(x.f, x.host, x.how),
                ...ownTextIn(x.f, x.host, x.how),
              },
            }
          : {}),
        ...dartIn(x.f, F, x.host.seeded),
      });
    }
    return nextId;

    /**
     * The text seeds (piece numbers / names) standing in face f itself — its own label. Told by
     * the faces, not by the blob a seed was later given to (an aside keeps its host's blob, so a
     * label inside it would read as the host's). A face's FILLED outline holds the label of the
     * piece nested in it, so only the face's own pixels are asked; and a 'shape' copy whose host
     * holds no text seed in its other faces carries the piece's own label (the innermost size).
     */
    function labelsIn(f: number, host: Unit, how: CopyHow): { labels?: number[] } {
      const ids = textSeeds.filter((s) => inFace(pixelOf(s.at), f)).map((s) => s.id);
      if (!ids.length) return {};
      if (how === 'shape') {
        const others = new Set([host.root, ...host.members].filter((h) => h !== f));
        const hostHas = textSeeds.some((s) => {
          const k = pixelOf(s.at);
          return k >= 0 && others.has(face[k]);
        });
        if (!hostHas) return {};
      }
      return { labels: ids };
    }

    /** Is pixel k in face f, or a wall pixel touching it (a text centred on a line)? */
    function inFace(k: number, f: number): boolean {
      if (k < 0) return false;
      if (face[k] === f) return true;
      if (face[k] >= 0) return false;
      const x = k % W;
      const y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (g.inside(x + dx, y + dy) && face[(y + dy) * W + x + dx] === f) return true;
      return false;
    }

    /**
     * A piece label standing in face f (pieceLabelText) that the host unit carries in none of its
     * other faces: a name / letter of its own (D3: such an outline is never set aside silently).
     * A 'shape' copy (another size nested in the piece, its outline proven the piece's) holds the
     * piece's own label in the innermost size: its label is its own only when the host carries a
     * piece label elsewhere and this one differs (a BACK LINING drawn inside the BACK). A sliver
     * (narrower than any piece is cut) holds a word of the piece printed across its lines («DART»).
     */
    function ownTextIn(f: number, host: Unit, how: CopyHow): { ownText?: string } {
      const mine = textAt.filter(
        ({ t, k }) => !t.background && inFace(k, f) && pieceLabelText(t.text),
      );
      if (!mine.length) return {};
      const norm = (x: string) => x.trim().replace(/\s+/g, ' ').toUpperCase();
      const hostFaces = new Set([host.root, ...host.members].filter((h) => h !== f));
      const hostTexts = textAt
        .filter(({ t, k }) => !t.background && k >= 0 && hostFaces.has(face[k]))
        .map(({ t }) => t.text);
      if (how === 'sliver' || (how === 'shape' && !hostTexts.some(pieceLabelText))) return {};
      const have = new Set(hostTexts.map(norm));
      const own = mine.find(({ t }) => !have.has(norm(t.text)));
      return own ? { ownText: own.t.text.trim().slice(0, 60) } : {};
    }

    /**
     * DARTS · face f set aside is a dart drawn inside its host, on two evidences of its own (the
     * third, its mouth on the host's outline and its sides off it, is asked of the host's closed
     * sizes along its edge samples — pieces/darts provenDart):
     *   label  every piece label standing in it (pieceLabelText) is a dart word (DART_WORD:
     *          «DART», «PLEAT», «TUCK») — a name of a piece beside it («BACK», «CUT 2») vetoes;
     *   wedge  its filled outline is a narrow wedge (wedgeOf): long, widest at one end, tapering
     *          to a point at the other.
     */
    function dartIn(
      f: number,
      F: FillMask,
      hostSeeded: boolean,
    ): { dart?: NonNullable<FaceBlob['dart']> } {
      const labels = textAt
        .filter(({ t, k }) => !t.background && inFace(k, f) && pieceLabelText(t.text))
        .map(({ t }) => t.text.trim().replace(/\s+/g, ' '));
      if (!labels.length || !labels.every((l) => DART_WORD.test(l))) return {};
      const w = wedgeOf(F);
      if (!w) return {};
      const at = (q: { x: number; y: number }) => {
        const c = g.centre(q.x, q.y);
        return { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 };
      };
      return {
        dart: {
          label: labels[0].slice(0, 30),
          base: [at(w.baseA), at(w.baseB)],
          apex: at(w.apex),
          lenMm: Math.round(w.lenPx * cell),
          openMm: Math.round(w.openPx * cell),
          rim: rimSamples(F),
          cellMm: cell,
          hostSeeded,
        },
      };
    }

    /** Up to RIM_SAMPLES points along a filled outline's edge (its boundary pixels), mm. */
    function rimSamples(F: FillMask): PtMm[] {
      const at: number[] = [];
      for (let ly = 0; ly < F.h; ly++)
        for (let lx = 0; lx < F.w; lx++) {
          if (!F.m[ly * F.w + lx]) continue;
          const edge =
            lx === 0 ||
            ly === 0 ||
            lx === F.w - 1 ||
            ly === F.h - 1 ||
            !F.m[ly * F.w + lx - 1] ||
            !F.m[ly * F.w + lx + 1] ||
            !F.m[(ly - 1) * F.w + lx] ||
            !F.m[(ly + 1) * F.w + lx];
          if (edge) at.push((ly + F.y0) * W + lx + F.x0);
        }
      const step = Math.max(1, Math.ceil(at.length / RIM_SAMPLES));
      const out: PtMm[] = [];
      for (let i = 0; i < at.length; i += step) {
        const c = onWall(at[i]);
        out.push({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10 });
      }
      return out;
    }

    /**
     * An edge pixel's sample on the line that bounds it: across the wall beside it (a line is
     * drawn 3 px wide), the middle of that wall run — the drawn line itself, so its distance to a
     * size outline says whether this is that line. A run wider than one line's (two lines side by
     * side, merged — Codex r2), or no wall beside it: the pixel's own centre, as before.
     */
    function onWall(k: number): PtMm {
      const x = k % W;
      const y = (k / W) | 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        let n = 0;
        while (n < 4 && g.inside(x + dx * (n + 1), y + dy * (n + 1))) {
          if (!wall[(y + dy * (n + 1)) * W + x + dx * (n + 1)]) break;
          n++;
        }
        if (!n) continue;
        if (n > 3) break;
        const t = 1 + (n - 1) / 2;
        const a = g.centre(x, y);
        const b = g.centre(x + dx, y + dy);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      return g.centre(x, y);
    }

    /**
     * Face f is parted from the rest of its group by size lines only: read straight across every
     * wall pixel between f and another face of the group (acrossWall), the wall is a ranked size
     * line there — not a line every rank shares (a common line, a lone stretch where the sizes
     * coincide), a rescued line or a wall of no rank (Codex r2: those may split one piece in two).
     * A few such pixels where lines meet at a corner are tolerated (≤ 10 %); ≥ 20 ranked ones.
     */
    function acrossSizeLines(f: number, grp: readonly number[]): boolean {
      if (!o.rankOfItem) return false;
      const og = new Set(grp.filter((x) => x !== f));
      const q = fs[f];
      const x0 = Math.max(0, q.x0 - 4);
      const y0 = Math.max(0, q.y0 - 4);
      const x1 = Math.min(W - 1, q.x1 + 4);
      const y1 = Math.min(g.H - 1, q.y1 + 4);
      const shared = new Uint8Array(N);
      items.forEach((it) => {
        if (typeof o.rankOfItem!(it) !== 'number') drawPolyline(g, shared, it.pts, it.closed);
      });
      let ranked = 0;
      let other = 0;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const k = y * W + x;
          if (!wall[k]) continue;
          const side = acrossWall(x, y);
          if (!side || !((side[0] === f && og.has(side[1])) || (side[1] === f && og.has(side[0]))))
            continue;
          if (shared[k] || weak[k]) other++;
          else ranked++;
        }
      return ranked >= 20 && other <= 0.1 * (ranked + other);
    }

    /**
     * The two faces on either side of the wall at (x, y), read straight across it (horizontally,
     * then vertically, ≤ 4 px each way) — never two faces that only meet at a junction's corner.
     */
    function acrossWall(x: number, y: number): [number, number] | null {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const end = (sx: number, sy: number) => {
          for (let n = 1; n <= 4; n++) {
            const xx = x + sx * n;
            const yy = y + sy * n;
            if (!g.inside(xx, yy)) return -1;
            const k = yy * W + xx;
            if (wall[k]) continue;
            return face[k];
          }
          return -1;
        };
        const a = end(-dx, -dy);
        const b = end(dx, dy);
        if (a >= 0 && b >= 0 && a !== b) return [a, b];
      }
      return null;
    }

    /**
     * DARTS · class C: face f, joined to its group (joinedWhy 'joined'), is drawn apart from the
     * group's head — not a half of it split off by a line inside it:
     *   no line between them  no line lies mostly between f and the group's other faces (sep): f
     *                         meets the group only through the grading slivers between its sizes'
     *                         lines (Delta's side back beside the back, Cherry's patch pocket on
     *                         the sleeve) — a half split off by an inner / common line has one;
     *   two names             f and the head each print a piece name (a garment-part word, not a
     *                         bare "CUT 2") and a cutting instruction («CUT 2») of its own — two
     *                         label blocks — and no name of one is the other's;
     *   no text seed          no text seed stands in f (a text seed already seeds the piece it
     *                         stands in: a second seed in its region would merge — Atlas's sleeve).
     * The caller still asks namedOneSize (one size's lines close it alone) and acrossSizeLines
     * (every wall between f and the group is a ranked size line).
     */
    function namedApart(f: number, grp: readonly number[]): boolean {
      if (
        sep(
          f,
          grp.filter((x) => x !== f),
        ).length
      )
        return false;
      if (textSeeds.some((t) => inFace(pixelOf(t.at), f))) return false;
      const norm = (x: string) => x.trim().replace(/\s+/g, ' ').toUpperCase();
      const namesIn = (q: number) =>
        new Set(
          textAt
            .filter(
              ({ t, k }) =>
                !t.background &&
                inFace(k, q) &&
                pieceLabelText(t.text) &&
                PIECE_NAME.test(t.text) &&
                !MARK_TEXT.test(t.text) &&
                !/^\s*cut\s*\d/i.test(t.text),
            )
            .map(({ t }) => norm(t.text)),
        );
      // each its own label block: a cutting instruction of its own beside the name (a name split
      // into two text items — «FRONT» | «FACING» — across a size line is one label, Codex r1)
      const cutIn = (q: number) =>
        textAt.some(({ t, k }) => !t.background && inFace(k, q) && /\bcut\s*\d+\b/i.test(t.text));
      if (!cutIn(f) || !cutIn(grp[0])) return false;
      const mine = namesIn(f);
      const head = namesIn(grp[0]);
      return mine.size > 0 && head.size > 0 && ![...mine].some((x) => head.has(x));
    }

    /**
     * Each face of a group → the unit whose root it reaches first across a line they share: faces
     * read on the two sides of one wall (acrossWall) at ≥ 8 of its pixels — never two faces one
     * polyline touches at distant places, nor two meeting at a junction (Codex r1, r2); a tie or
     * no path keeps the head (roots[0]).
     */
    function nearestRoot(grp: readonly number[], roots: readonly Unit[]): Map<number, Unit> {
      const inG = new Set(grp);
      const adj = new Map<number, Set<number>>(grp.map((f) => [f, new Set<number>()]));
      let x0 = W;
      let y0 = g.H;
      let x1 = -1;
      let y1 = -1;
      for (const f of grp) {
        const q = fs[f];
        x0 = Math.min(x0, q.x0 - 3);
        y0 = Math.min(y0, q.y0 - 3);
        x1 = Math.max(x1, q.x1 + 3);
        y1 = Math.max(y1, q.y1 + 3);
      }
      x0 = Math.max(0, x0);
      y0 = Math.max(0, y0);
      x1 = Math.min(W - 1, x1);
      y1 = Math.min(g.H - 1, y1);
      const shared = new Map<number, number>();
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!wall[y * W + x]) continue;
          const side = acrossWall(x, y);
          if (!side || !inG.has(side[0]) || !inG.has(side[1])) continue;
          const key = Math.min(...side) * nFaces + Math.max(...side);
          shared.set(key, (shared.get(key) ?? 0) + 1);
        }
      for (const [key, c] of shared) {
        if (c < 8) continue;
        const a = Math.floor(key / nFaces);
        const b = key % nFaces;
        adj.get(a)!.add(b);
        adj.get(b)!.add(a);
      }
      const out = new Map<number, Unit>();
      const tie = new Set<number>();
      let front: number[] = [];
      for (const r of roots) {
        out.set(r.root, r);
        front.push(r.root);
      }
      while (front.length) {
        const reach = new Map<number, Unit>();
        for (const a of front)
          for (const b of adj.get(a) ?? []) {
            if (out.has(b)) continue;
            const w = out.get(a)!;
            const was = reach.get(b);
            if (was && was !== w) tie.add(b);
            else reach.set(b, w);
          }
        for (const [b, w] of reach) out.set(b, tie.has(b) ? roots[0] : w);
        front = [...reach.keys()];
      }
      return out;
    }

    /**
     * SEEDNAME · a face that is a piece of its own though the face pass would set it aside: Mood's
     * old sheets draw a piece's sizes side by side from a common edge (the smallest size whole,
     * the larger ones as strips beside it, joined across size lines) and pieces touching each
     * other, so (1) a piece that is not its blob's largest reads to the fragments rule as "no copy
     * of itself" (Rue's sleeve, Vanda's bodice front), and (2) a piece drawn against another
     * across that one's size lines reads as a size copy of it (Olea's back beside the front).
     * Two independent evidences, both required (D3):
     *   name      its own face prints a piece name (PIECE_NAME: a garment-part word, or a cutting
     *             instruction "CUT 2") — and nothing there says it is no piece to cut (a template,
     *             a placement mark, a cut line of a view);
     *   one size  the lines of ONE size (with the lines every size shares) close its face on their
     *             own: flooded from its seed point on just those walls, the region stays in the
     *             face's box and covers the face (≥ 90 %), no more than 15 % larger — the outline
     *             of one drawn size, not a shape cut out where several sizes cross.
     * The piece still goes through the fill, the H1 guard and the gate (G21 / G22 / G24 / G8): a
     * face cut where sizes cross does not close in one size, and two pieces closing one region
     * still merge there and are refused. Returns the name, or null.
     */
    function namedOneSize(f: number): string | null {
      if (!o.rankOfItem) return null;
      const texts = textAt.filter(({ t, k }) => !t.background && inFace(k, f)).map(({ t }) => t);
      if (texts.some((t) => NOT_A_PIECE.test(t.text) || MARK_VETO.test(t.text))) return null;
      const name = texts.find(
        (t) => pieceLabelText(t.text) && PIECE_NAME.test(t.text) && !MARK_TEXT.test(t.text),
      );
      if (!name) return null;
      const F = fillOfF(f);
      const pole = poleOf(f).k;
      if (pole < 0 || F.area * pxArea < PIECE_NAMED_MIN_MM2) return null;
      // the ranks whose lines bound the face, most touching first
      const byRank = new Map<number, number>();
      items.forEach((it, i) => {
        const t = T[i];
        const c = t.touch.get(f) ?? 0;
        if (!t.n || c < 0.3 * t.n) return;
        const r = o.rankOfItem!(it);
        if (typeof r === 'number') byRank.set(r, (byRank.get(r) ?? 0) + c);
      });
      const ranks = [...byRank].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const pad = Math.max(8, Math.ceil(0.1 * Math.max(F.w, F.h)));
      const bx0 = Math.max(0, F.x0 - pad);
      const by0 = Math.max(0, F.y0 - pad);
      const bx1 = Math.min(W - 1, F.x0 + F.w - 1 + pad);
      const by1 = Math.min(g.H - 1, F.y0 + F.h - 1 + pad);
      // the walls of every rank (common lines, lone stretches, rescued lines) alone
      const all = new Uint8Array(N);
      items.forEach((it) => {
        if (o.rankOfItem!(it) === 'all') drawPolyline(g, all, it.pts, it.closed);
      });
      for (let y = by0; y <= by1; y++)
        for (let x = bx0; x <= bx1; x++) if (weak[y * W + x]) all[y * W + x] = 1;
      /** Flood from the pole on `mask` in the box: null on a leak, else the region's account. */
      const flood = (mask: Uint8Array) => {
        if (mask[pole]) return null;
        const seen = new Uint8Array(N);
        const st = [pole];
        seen[pole] = 1;
        let n = 0;
        let inF = 0;
        let rimAll = 0;
        let rimOwn = 0;
        while (st.length) {
          const k = st.pop()!;
          n++;
          if (inFill(F, k, W)) inF++;
          const x = k % W;
          const y = (k / W) | 0;
          if (x <= bx0 || y <= by0 || x >= bx1 || y >= by1) return null;
          for (const q of [k - 1, k + 1, k - W, k + W]) {
            if (q < 0 || q >= N || seen[q]) continue;
            seen[q] = 1;
            if (!mask[q]) st.push(q);
            else if (all[q]) rimAll++;
            else rimOwn++;
          }
        }
        return { n, inF, own: rimOwn / Math.max(1, rimAll + rimOwn) };
      };
      // closed by the shared walls alone: an outline drawn once (a box, a cartouche) — not a size's
      // outline (Codex r1)
      if (flood(all)) return null;
      for (const [r] of ranks) {
        const mask = all.slice();
        items.forEach((it) => {
          if (o.rankOfItem!(it) === r) drawPolyline(g, mask, it.pts, it.closed);
        });
        const v = flood(mask);
        // …and that size's own lines bound a good part of it (≥ 30 % of its edge)
        if (v && v.inF >= 0.9 * F.area && v.n <= 1.15 * F.area && v.own >= 0.3)
          return name.text.trim();
      }
      return null;
    }

    /**
     * A unit outlined in one size's line holds a copy of it in another size: inside its filled
     * outline, lines of another size class at least half as long as its outline (a nest).
     */
    function hasSizeCopy(u: Unit): boolean {
      if (!o.classOf) return true;
      const F = fillOfF(u.root);
      const rim = new Set(u.rim);
      // a copy lies between the unit's own faces only (a size line of the nest crossing by also
      // bounds faces outside it: that is where sizes cross, not a copy)
      const onNear = (i: number) => {
        const t = T[i];
        if (!t.n) return false;
        let v = 0;
        for (const [l, c] of t.touch) {
          if (u.near.has(l)) v += c;
          else if (c >= 0.2 * t.n) return false;
        }
        return v >= 0.3 * t.n;
      };
      const rimCls = new Set(u.rim.map((id) => o.classOf!.get(id)));
      let rimLen = 0;
      const byCls = new Map<number, number>();
      items.forEach((it, i) => {
        if (rim.has(it.chain)) {
          rimLen += itemLen[i];
          return;
        }
        const k = itemMid[i];
        if (itemLen[i] < 20 || !o.sizeLine?.has(it.chain)) return;
        if (!(k >= 0 && inFill(F, k, W)) && !onNear(i)) return;
        const cl = o.classOf!.get(it.chain);
        if (cl == null || rimCls.has(cl)) return;
        byCls.set(cl, (byCls.get(cl) ?? 0) + itemLen[i]);
      });
      return [...byCls.values()].some((L) => L >= 0.5 * rimLen);
    }

    /**
     * The group's faces and every face (of any size) between it and the face p around it — the
     * group's filled outlines with GAP_MM round them: a seam ring too thin to be a piece of its own
     * lies between a nested piece's core and its host.
     */
    function facesAround(grp: readonly number[], p: number): Set<number> {
      const pad = Math.ceil(GAP_MM / cell) + 3;
      let x0 = W;
      let y0 = g.H;
      let x1 = -1;
      let y1 = -1;
      for (const f of grp) {
        const F = fillOfF(f);
        x0 = Math.min(x0, F.x0 - pad);
        y0 = Math.min(y0, F.y0 - pad);
        x1 = Math.max(x1, F.x0 + F.w - 1 + pad);
        y1 = Math.max(y1, F.y0 + F.h - 1 + pad);
      }
      const out = new Set<number>(grp);
      for (let f = 0; f < nFaces; f++) {
        const q = fs[f];
        if (f === p || !q.px || q.x0 < x0 || q.y0 < y0 || q.x1 > x1 || q.y1 > y1) continue;
        out.add(f);
      }
      return out;
    }

    /** The lines between a group of faces and the face p around it (the outside for a root). */
    function rimOf(grp: readonly number[], p: number | null): number[] {
      const near = p == null ? new Set(grp) : facesAround(grp, p);
      return items.flatMap((it, i) => {
        const t = T[i];
        if (!t.n || (p != null && (t.touch.get(p) ?? 0) < 0.3 * t.n)) return [];
        let onC = 0;
        for (const f of near) onC += t.touch.get(f) ?? 0;
        return onC >= 0.3 * t.n ? [it.chain] : [];
      });
    }

    /** A nested outline drawn in the host's outline pen, in long lines (not glyph strokes). */
    function drawnInPen(grp: readonly number[], p: number): boolean {
      if (!o.classOf) return true;
      const near = facesAround(grp, p);
      // the pens of the blob's outer outline: lines between the outside and the blob's faces
      if (!outlinePens) {
        outlinePens = new Set<number>();
        const mineF = new Set<number>();
        for (let f = 0; f < nFaces; f++) if (fs[f].blob === b) mineF.add(f);
        items.forEach((it, i) => {
          const t = T[i];
          const cl = o.classOf!.get(it.chain);
          if (cl == null || !t.n || (t.touch.get(EXT) ?? 0) < 0.3 * t.n) return;
          let inner = 0;
          for (const [l, v] of t.touch) if (mineF.has(l)) inner = Math.max(inner, v);
          if (inner >= 0.3 * t.n) outlinePens!.add(cl);
        });
      }
      const mainClasses = outlinePens;
      let mainLen = 0;
      let foreignLen = 0;
      items.forEach((it, i) => {
        const t = T[i];
        if (!t.n || (t.touch.get(p) ?? 0) < 0.3 * t.n) return;
        let onC = 0;
        for (const f of near) onC += t.touch.get(f) ?? 0;
        if (onC < 0.3 * t.n) return;
        const cl = o.classOf!.get(it.chain);
        if (cl != null && mainClasses.has(cl) && itemLen[i] >= NESTED_LINE_MM)
          mainLen += itemLen[i];
        else foreignLen += itemLen[i];
      });
      return mainLen > 0 && mainLen >= 0.8 * (mainLen + foreignLen);
    }
  }

  function boxOfFace(s: FaceStat): BoxMm {
    return boxOf(s);
  }
}

/**
 * DARTS: a dart's own word — the whole label (a piece name that mentions a dart, «DART FACING»,
 * is no dart).
 */
const DART_WORD = /^(?:dart|pleat|tuck)s?$/i;

/**
 * DARTS: a filled outline that is a narrow wedge — a dart drawn as two legs meeting at its point,
 * its mouth closed by the piece's outline (or a size line across it). Read along its principal
 * axis in WEDGE_BINS slices (the width of a slice = its pixels over the slice's length): at least
 * WEDGE_ASPECT times longer than its widest slice, widest in the mouth's 40 %, never widening by
 * more than 15 % of that width towards the point, the last slice at most 40 % of it, and a
 * triangle's fill (area / (length × widest) in 0.3…0.75: a strip, a rectangle, a pleat band is
 * not one). Grid coordinates: the mouth's two corners (the slice's extreme pixels across the axis),
 * the point (the mean of the last slice's tip pixels), the length and the widest slice's width
 * (the mouth's opening) in pixels.
 */
function wedgeOf(F: FillMask): {
  baseA: { x: number; y: number };
  baseB: { x: number; y: number };
  apex: { x: number; y: number };
  lenPx: number;
  openPx: number;
} | null {
  const { w, h, m } = F;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++)
      if (m[ly * w + lx]) {
        n++;
        sx += lx;
        sy += ly;
      }
  if (n < 50) return null;
  const cx = sx / n;
  const cy = sy / n;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++)
      if (m[ly * w + lx]) {
        cxx += (lx - cx) ** 2;
        cyy += (ly - cy) ** 2;
        cxy += (lx - cx) * (ly - cy);
      }
  const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(th);
  const uy = Math.sin(th);
  let smin = Infinity;
  let smax = -Infinity;
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++)
      if (m[ly * w + lx]) {
        const s = (lx - cx) * ux + (ly - cy) * uy;
        if (s < smin) smin = s;
        if (s > smax) smax = s;
      }
  const L = smax - smin + 1;
  const nb = WEDGE_BINS;
  const cnt = new Array<number>(nb).fill(0);
  const binOf = (s: number) => Math.min(nb - 1, Math.floor(((s - smin) / L) * nb));
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++)
      if (m[ly * w + lx]) cnt[binOf((lx - cx) * ux + (ly - cy) * uy)]++;
  let wd = cnt.map((c) => c / (L / nb));
  // the mouth is the wider end
  const flip = wd[0] + wd[1] < wd[nb - 1] + wd[nb - 2];
  if (flip) wd = wd.reverse();
  const maxW = Math.max(...wd);
  const arg = wd.indexOf(maxW);
  if (L < WEDGE_ASPECT * maxW || arg > 0.4 * nb - 1 || wd[nb - 1] > 0.4 * maxW) return null;
  for (let i = arg; i < nb - 1; i++) if (wd[i + 1] > wd[i] + 0.15 * maxW) return null;
  const fill = n / (L * maxW);
  if (fill < 0.3 || fill > 0.75) return null;
  // the mouth's corners and the point, along the oriented axis (o = 0 at the mouth)
  const along = (s: number) => (flip ? smax - s : s - smin);
  let a = { t: Infinity, x: 0, y: 0 };
  let b = { t: -Infinity, x: 0, y: 0 };
  let tx = 0;
  let ty = 0;
  let tn = 0;
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++) {
      if (!m[ly * w + lx]) continue;
      const o = along((lx - cx) * ux + (ly - cy) * uy);
      if (o <= 0.06 * L) {
        const t = -(lx - cx) * uy + (ly - cy) * ux;
        if (t < a.t) a = { t, x: lx + F.x0, y: ly + F.y0 };
        if (t > b.t) b = { t, x: lx + F.x0, y: ly + F.y0 };
      }
      if (o >= 0.97 * L) {
        tx += lx + F.x0;
        ty += ly + F.y0;
        tn++;
      }
    }
  if (!tn || !Number.isFinite(a.t)) return null;
  return {
    baseA: { x: a.x, y: a.y },
    baseB: { x: b.x, y: b.y },
    apex: { x: tx / tn, y: ty / tn },
    lenPx: L,
    openPx: maxW,
  };
}
const WEDGE_BINS = 10;
const WEDGE_ASPECT = 2;

/** A face's filled outline: the face and its holes, in its own box (+1 px). */
type FillMask = { x0: number; y0: number; w: number; h: number; m: Uint8Array; area: number };

function fillOf(fr: FaceRaster, f: number): FillMask {
  const s = fr.faces[f];
  const W = fr.g.W;
  const H = fr.g.H;
  const x0 = s.x0 - 1;
  const y0 = s.y0 - 1;
  const w = s.x1 - s.x0 + 3;
  const h = s.y1 - s.y0 + 3;
  const reach = new Uint8Array(w * h);
  const st: number[] = [];
  const push = (lx: number, ly: number) => {
    const l = ly * w + lx;
    if (reach[l]) return;
    const x = lx + x0;
    const y = ly + y0;
    if (x >= 0 && y >= 0 && x < W && y < H && fr.face[y * W + x] === f) return;
    reach[l] = 1;
    st.push(l);
  };
  for (let lx = 0; lx < w; lx++) {
    push(lx, 0);
    push(lx, h - 1);
  }
  for (let ly = 0; ly < h; ly++) {
    push(0, ly);
    push(w - 1, ly);
  }
  while (st.length) {
    const l = st.pop()!;
    const ly = (l / w) | 0;
    const lx = l - ly * w;
    if (lx > 0) push(lx - 1, ly);
    if (lx + 1 < w) push(lx + 1, ly);
    if (ly > 0) push(lx, ly - 1);
    if (ly + 1 < h) push(lx, ly + 1);
  }
  const m = new Uint8Array(w * h);
  let area = 0;
  for (let l = 0; l < w * h; l++)
    if (!reach[l]) {
      m[l] = 1;
      area++;
    }
  return { x0, y0, w, h, m, area };
}

function inFill(F: FillMask, k: number, W: number): boolean {
  const y = (k / W) | 0;
  const lx = k - y * W - F.x0;
  const ly = y - F.y0;
  return lx >= 0 && ly >= 0 && lx < F.w && ly < F.h && F.m[ly * F.w + lx] === 1;
}

/** How far the outer filled outline P strays from the inner one C at most, in pixels × cell. */
function farthestMm(P: FillMask, C: FillMask, cell = 1): number {
  const { w, h } = P;
  const d = chamferWH(w, h, (l) => {
    const ly = (l / w) | 0;
    const gx = l - ly * w + P.x0 - C.x0;
    const gy = ly + P.y0 - C.y0;
    return gx >= 0 && gy >= 0 && gx < C.w && gy < C.h && C.m[gy * C.w + gx] === 1;
  });
  let mx = 0;
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++) {
      const l = ly * w + lx;
      if (!P.m[l]) continue;
      const edge =
        lx === 0 ||
        ly === 0 ||
        lx === w - 1 ||
        ly === h - 1 ||
        !P.m[l - 1] ||
        !P.m[l + 1] ||
        !P.m[l - w] ||
        !P.m[l + w];
      if (edge && d[l] > mx) mx = d[l];
    }
  return (mx / 3) * cell;
}

function containsBox(a: BoxMm, b: BoxMm) {
  return (
    b.minX >= a.minX - 1 && b.maxX <= a.maxX + 1 && b.minY >= a.minY - 1 && b.maxY <= a.maxY + 1
  );
}

/** Any pixel of face f (its stats box holds one on its top row). */
function firstPixel(fr: FaceRaster, f: number): number {
  const s = fr.faces[f];
  const W = fr.g.W;
  for (let x = s.x0; x <= s.x1; x++) if (fr.face[s.y0 * W + x] === f) return s.y0 * W + x;
  return s.y0 * W + s.x0;
}

function blobOfFace(fr: FaceRaster, f: number): number {
  return fr.blobAt[firstPixel(fr, f)];
}

/**
 * Legend samples inside a blob: straight chains 8–80 mm, parallel (± 3°), each with a text centre
 * within 25 mm of one of its ends and close to its line (a size number printed after a line sample).
 * Returns the largest parallel group: its count and line length.
 */
function legendSamples(
  items: readonly WallItem[],
  texts: readonly IRText[],
  inBlob: (p: PtMm) => boolean,
  o: { off?: ReadonlySet<FaceSwitch> } = {},
): { n: number; len: number } {
  /** Another item passes within 1.5 mm of the end p of item `self`. */
  const endsOn = (p: PtMm, self: WallItem) =>
    items.some((it) => {
      if (it === self || it.pts.length < 2) return false;
      const q = it.closed && it.pts.length > 2 ? [...it.pts, it.pts[0]] : it.pts;
      for (let i = 0; i + 1 < q.length; i++) {
        const u = q[i];
        const v = q[i + 1];
        if (
          p.x < Math.min(u.x, v.x) - 1.5 ||
          p.x > Math.max(u.x, v.x) + 1.5 ||
          p.y < Math.min(u.y, v.y) - 1.5 ||
          p.y > Math.max(u.y, v.y) + 1.5
        )
          continue;
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / L2)) : 0;
        if (Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy) <= 1.5) return true;
      }
      return false;
    });
  const angles: number[] = [];
  const lens: number[] = [];
  for (const it of items) {
    const p = it.pts;
    if (p.length < 2 || it.closed) continue;
    const a = p[0];
    const b = p[p.length - 1];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (chord < 8 || chord > 80) continue;
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (chord < 0.98 * L) continue;
    if (!inBlob({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) continue;
    const ux = (b.x - a.x) / chord;
    const uy = (b.y - a.y) / chord;
    const labelled = texts.some((t) => {
      const c = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
      const off = Math.max(4, 1.5 * t.fontSizeMm);
      return [a, b].some((e) => {
        const dx = c.x - e.x;
        const dy = c.y - e.y;
        if (Math.hypot(dx, dy) > 25) return false;
        return Math.abs(dx * -uy + dy * ux) <= off;
      });
    });
    if (!labelled) continue;
    // a legend sample floats in its box; a line with both ends on other lines crosses a piece (the
    // size ends of r4454's band, rungs of a ladder) — not a sample
    if (!o.off?.has('free-ends') && endsOn(a, it) && endsOn(b, it)) continue;
    let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (ang < 0) ang += 180;
    if (ang >= 180) ang -= 180;
    angles.push(ang);
    lens.push(L);
  }
  let best = { n: 0, len: 0 };
  for (const a of angles) {
    let n = 0;
    let len = 0;
    angles.forEach((b, i) => {
      if (Math.min(Math.abs(a - b), 180 - Math.abs(a - b)) > 3) return;
      n++;
      len += lens[i];
    });
    if (n > best.n) best = { n, len };
  }
  return best;
}

/**
 * Every face and blob of the sheet on the walls of every rank, judged, text seeds deduped — the
 * pieces stage's face map.
 */
export function faceMap(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  textSeeds: readonly Seed[],
  o: FaceOpts = {},
): FaceMap {
  // D6: every tile sheet read on its own (its walls, its labels, its box), as it was alone
  const parts = sheet.parts;
  if (parts && parts.length > 1) {
    const blobs: FaceBlob[] = [];
    const subs: { g: Grid; blobAt: Int32Array }[] = [];
    let off = 0;
    for (const part of parts) {
      const mine = textSeeds.filter((t) => partAt(parts, t.at)?.sheet === part.sheet);
      const m = faceMap(sheetView(sheet, part), chainView(set, parts, part.sheet), run, mine, o);
      const at = m.blobAt.map((v) => (v >= 0 ? v + off : v));
      subs.push({ g: m.g, blobAt: at });
      let top = -1;
      for (const b of m.blobs) {
        top = Math.max(top, b.id);
        blobs.push({
          ...b,
          id: b.id + off,
          ...(b.inside != null ? { inside: b.inside + off } : {}),
        });
      }
      for (let k = 0; k < m.blobAt.length; k++) top = Math.max(top, m.blobAt[k]);
      off += top + 1;
    }
    return { g: subs[0].g, blobAt: subs[0].blobAt, blobs, subs };
  }
  const { items, weak, model, lone } = faceWalls(sheet, set, run);
  const fr = faceRaster(
    sheet.bbox,
    items,
    weak,
    o.cellMm || PATIMPORT.fillCellMm,
    faceCapBox(sheet),
  );
  const classOf = new Map<ChainId, number>();
  const roleOf = new Map<ChainId, ChainRole>();
  for (const c of set.classes)
    for (const id of c.chains) {
      classOf.set(id, c.id);
      roleOf.set(id, c.role);
    }
  const common = new Set(model.common);
  const rankOfChain = new Map<ChainId, number>();
  model.byRank.forEach((ids, r) => ids.forEach((id) => rankOfChain.set(id, r)));
  const blobs = judgeBlobs(fr, sheet, set.chains, items, textSeeds, {
    ...o,
    classOf,
    roleOf,
    graded: model.mode !== 'single',
    sizeLine: new Set(model.byRank.flat()),
    rankOfItem: (it) =>
      lone.has(it) || common.has(it.chain) ? 'all' : rankOfChain.get(it.chain) ?? null,
  });
  const off = o.off ?? new Set();
  // a sheet that labels its pieces in text (≥ 2 text seeds) labels every piece: an outline it
  // does not label is a legend box, an overview, a label frame — not seeded (the operator clicks)
  // D6: per tile sheet — a sheet that labels nothing (r4454's interfacing sheet beside a labelled
  // main sheet) is not held to another sheet's labels
  if (!off.has('unlabelled')) {
    const parts = sheet.parts && sheet.parts.length > 1 ? sheet.parts : null;
    const labelsOn = (p: PtMm) => {
      if (!parts) return textSeeds.length;
      const k = partAt(parts, p)?.sheet;
      return textSeeds.filter((t) => partAt(parts, t.at)?.sheet === k).length;
    };
    for (const b of blobs)
      if (!b.junk && b.textSeed == null && labelsOn(b.at) >= 2) b.junk = 'unlabelled';
  }
  // file-per-size drawn side by side: the fill carries a seed on the first size's drawing to the
  // others (fileShift); a seed on another size's drawing would be the same piece twice
  if (model.mode === 'file' && !off.has('other-size')) {
    const ids = model.byRank[0] ?? [];
    if (ids.length) {
      let b0 = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const id of ids)
        for (const p of set.chains[id].pts)
          b0 = {
            minX: Math.min(b0.minX, p.x),
            minY: Math.min(b0.minY, p.y),
            maxX: Math.max(b0.maxX, p.x),
            maxY: Math.max(b0.maxY, p.y),
          };
      for (const b of blobs)
        if (
          !b.junk &&
          (b.at.x < b0.minX - 5 ||
            b.at.x > b0.maxX + 5 ||
            b.at.y < b0.minY - 5 ||
            b.at.y > b0.maxY + 5)
        )
          b.junk = 'other-size';
    }
  }
  return { g: fr.g, blobAt: fr.blobAt, blobs };
}

/** Junk a text seed is held back in (a "10" in the test square, a table cell, a legend box). */
const TEXT_HELD: ReadonlySet<FaceJunk> = new Set<FaceJunk>([
  'test-square',
  'table',
  'legend',
  'logo',
  'background',
  'tile-frame',
  'sheet',
]);

/**
 * A text that may name a piece (a size copy holding one is not proven, SetAsideCopy.ownLabel): a
 * word or a letter — not a bare number (tile and page numbers), a size label («SIZE 8/10», «M»),
 * the pattern's code / title / hashtag, a grainline or the maker's logo. Instructions printed on
 * a piece («GATHER HERE») count: the doubt goes to a question.
 */
export function pieceLabelText(raw: string): boolean {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!/[A-Za-z]/.test(t)) return false;
  if (/^size\b/i.test(t) || parseSizeToken(t, true)) return false;
  return !/^#|^[“"”]|\bmdf\s*\d|mood\s*fabrics|^the\s|patterns\s*by|designer\s*fabrics|grain\s*line/i.test(
    t,
  );
}

/**
 * A2 (D3: no closed outline vanishes silently): the outlines the face pass did not seed (≥
 * minPieceAreaMm2, every reason) and the text seeds that sit in junk, held back. Ids: the blob's
 * own for an outline, −1 − seed id for a held text seed.
 */
export function asidesOf(
  map: Pick<FaceMap, 'g' | 'blobAt' | 'blobs'>,
  textSeeds: readonly Seed[],
  o: { off?: ReadonlySet<FaceSwitch> } = {},
): { held: Set<number>; asides: SetAside[] } {
  const held = new Set<number>();
  const asides: SetAside[] = [];
  if (!o.off?.has('held'))
    for (const t of textSeeds) {
      const B = map.blobs.find((b) => b.id === blobOf(map, t.at) && !b.aside);
      if (!B?.junk || !TEXT_HELD.has(B.junk)) continue;
      held.add(t.id);
      asides.push({
        id: -1 - t.id,
        at: t.at,
        box: B.box,
        areaMm2: Math.round(B.areaMm2),
        reason: B.junk as SetAside['reason'],
        seed: t,
      });
    }
  for (const b of map.blobs) {
    if (!b.junk || b.junk === 'small' || b.areaMm2 < PATIMPORT.minPieceAreaMm2) continue;
    asides.push({
      id: b.id,
      at: b.at,
      box: b.box,
      areaMm2: Math.round(b.areaMm2),
      reason: b.junk,
      ...(b.copy ? { copy: copyOf(b, b.copy) } : {}),
      ...(b.dart ? { dart: dartOf(b, b.dart) } : {}),
    });
  }
  /** A dart's account, with the seed point of the seeded outline it lies in (as copyOf's host). */
  function dartOf(b: FaceBlob, d: NonNullable<FaceBlob['dart']>): SetAsideDart {
    const { hostSeeded, ...rest } = d;
    const H = hostSeeded ? map.blobs.find((x) => x.id === b.inside && !x.aside) : undefined;
    const t = H?.textSeed != null ? textSeeds.find((x) => x.id === H.textSeed) : undefined;
    return { ...rest, host: !H ? null : t ? t.at : H.junk ? null : H.at };
  }
  /** The piece a copy belongs to: the seed point of its host outline, if that one is seeded. */
  function copyOf(b: FaceBlob, c: NonNullable<FaceBlob['copy']>): SetAsideCopy {
    const H = c.hostSeeded ? map.blobs.find((x) => x.id === b.inside && !x.aside) : undefined;
    const t = H?.textSeed != null ? textSeeds.find((x) => x.id === H.textSeed) : undefined;
    const host = !H ? null : t ? t.at : H.junk ? null : H.at;
    // a label in its own face that is not its host's: its own piece
    const seed = c.labels?.[0];
    const own =
      seed != null
        ? textSeeds.find((x) => x.id === seed)?.text?.text ?? `text seed ${seed}`
        : c.ownText;
    return {
      how: c.how,
      clearMm: Math.round(b.clearMm * 10) / 10,
      host,
      ...(c.rim ? { rim: c.rim, cellMm: c.cellMm } : {}),
      ...(own ? { ownLabel: own } : {}),
    };
  }
  return { held, asides };
}

/** Face seeds: one per blob that is not junk and holds no text seed. Ids continue after `firstId`. */
export function faceSeedsOf(map: Pick<FaceMap, 'blobs'>, firstId: number): Seed[] {
  return map.blobs
    .filter((b) => !b.junk && b.textSeed == null)
    .sort((a, b) => b.areaMm2 - a.areaMm2 || b.at.y - a.at.y || a.at.x - b.at.x)
    .map((b, i) => ({
      id: firstId + i,
      at: b.at,
      origin: 'face' as const,
      variant: null,
      face: { areaMm2: Math.round(b.areaMm2), depth: b.depth, box: b.box },
    }));
}

/** The blob id holding a point (−1 outside every outline). */
export function blobOf(map: Pick<FaceMap, 'g' | 'blobAt' | 'subs'>, p: PtMm): number {
  if (map.subs) {
    for (const s of map.subs) {
      const x = s.g.ix(p.x);
      const y = s.g.iy(p.y);
      if (s.g.inside(x, y)) return s.blobAt[y * s.g.W + x];
    }
    return -1;
  }
  const x = map.g.ix(p.x);
  const y = map.g.iy(p.y);
  return map.g.inside(x, y) ? map.blobAt[y * map.g.W + x] : -1;
}
