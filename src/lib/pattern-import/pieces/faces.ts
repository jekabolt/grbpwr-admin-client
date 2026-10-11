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
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { pageMarginIds, testSquareBoxes } from 'lib/pattern-import/chains/classify';

import { drawPolyline, exterior, Grid } from './raster';
import type { WallItem } from './snap';
import { itemsOf, lonePortions, rescuedIgnored, sheetModule, wallModel } from './walls';

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
};

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
};

/** A filter, or a step of the face pass ('units': the split of a blob into outlines). */
export type FaceSwitch =
  | FaceJunk
  | 'peel'
  | 'nested'
  | 'units'
  | 'held'
  | 'free-ends'
  | 'fragments';

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
/** A blob with more piece-sized faces than this is not split (a grid of cells: junk anyway). */
const MAX_UNIT_FACES = 200;
/** A piece drawn inside another is outlined in lines at least this long (not glyph strokes). */
const NESTED_LINE_MM = 40;
const FRAME_TOL_MM = 2;
/** The face pass keeps its raster under this many pixels (a coarser cell on a huge sheet). */
const MAX_PX = 4e6;
const EXT = -2;

/** The walls the face pass draws: every rank's (fillPieces rank r draws a subset of these). */
export function faceWalls(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
): { items: WallItem[]; weak: WallItem[]; model: ReturnType<typeof wallModel> } {
  const model = wallModel(set, run, sheet.texts);
  const rescued = rescuedIgnored(
    set,
    model,
    1.5,
    15,
    sheetModule(sheet),
    pageMarginIds(set.chains, sheet.poses),
  );
  const ids = new Set<ChainId>([...model.common, ...model.byRank.flat()]);
  const items: WallItem[] = [
    ...itemsOf(set, ids),
    ...lonePortions(set, model),
    ...(model.bandCuts ?? []).map((b) => ({ chain: -3, pts: [b.from, b.to] })),
  ];
  return { items, weak: itemsOf(set, rescued), model };
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
): FaceRaster {
  const cell = faceCell(sheetBox, cellMm);
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
    };
    const units: Unit[] = [];
    const asides: { f: number; junk: FaceJunk; host: Unit }[] = [];
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
            for (const f of grp) {
              host.members.push(f);
              asides.push({ f, junk: copyWhy, host });
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
        for (const f of grp.slice(1)) {
          const why = joinedWhy(f, grp);
          if (off.has(why)) {
            const v: Unit = {
              root: f,
              members: [f],
              seeded: pen,
              junk: u.junk,
              host,
              id: -1,
              rim: u.rim,
              near: u.near,
            };
            units.push(v);
            queue.push({ f, u: v });
          } else {
            asides.push({ f, junk: why, host: u });
            queue.push({ f, u });
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
          u.seeded = false;
          u.junk = 'size-copy';
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
      asides.push({ f: u.root, junk: u.junk ?? 'other-pen', host: u.host ?? units[0] });
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
      });
    }
    return nextId;

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
  const { items, weak, model } = faceWalls(sheet, set, run);
  const fr = faceRaster(sheet.bbox, items, weak, o.cellMm || PATIMPORT.fillCellMm);
  const classOf = new Map<ChainId, number>();
  const roleOf = new Map<ChainId, ChainRole>();
  for (const c of set.classes)
    for (const id of c.chains) {
      classOf.set(id, c.id);
      roleOf.set(id, c.role);
    }
  const blobs = judgeBlobs(fr, sheet, set.chains, items, textSeeds, {
    ...o,
    classOf,
    roleOf,
    graded: model.mode !== 'single',
    sizeLine: new Set(model.byRank.flat()),
  });
  const off = o.off ?? new Set();
  // a sheet that labels its pieces in text (≥ 2 text seeds) labels every piece: an outline it
  // does not label is a legend box, an overview, a label frame — not seeded (the operator clicks)
  if (textSeeds.length >= 2 && !off.has('unlabelled'))
    for (const b of blobs) if (!b.junk && b.textSeed == null) b.junk = 'unlabelled';
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
    });
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
export function blobOf(map: Pick<FaceMap, 'g' | 'blobAt'>, p: PtMm): number {
  const x = map.g.ix(p.x);
  const y = map.g.iy(p.y);
  return map.g.inside(x, y) ? map.blobAt[y * map.g.W + x] : -1;
}
