// DXF already carries pieces: one top-level INSERT = one piece × size. This turns the IR + the DXF
// side channel into pre-segmented piece candidates, applying every measured CLO/AAMA rule of
// 10-CLO-DXF-FORMAT §2 (dialect, cut-line mode, grain arrow, POINT notches, notch twins, labels,
// sizes, pairs, ungraded layer 1).

import type { AllowanceDecision, IRPath, IRText, PathId, PtMm } from '../../types';
import { PATIMPORT } from '../../types';
import type {
  CutMode,
  DxfBlockPiece,
  DxfContour,
  DxfGrain,
  DxfGroup,
  DxfIdentity,
  DxfLabels,
  DxfNotch,
  DxfPair,
  DxfRead,
  DxfSegmentation,
  NotchOn,
  PathRole,
} from './dxf-types';
import { bboxOf, nearestOnPolyline, pointInPolygon, segDir, signedArea } from './geometry';
import { decodeLabel, decodeTextValue, isPointNumber } from './text';

// ── layer semantics ─────────────────────────────────────────────────────────────────────────

type LayerKind =
  | 'cut'
  | 'turn'
  | 'curve'
  | 'notch'
  | 'mirror'
  | 'grain'
  | 'internal'
  | 'cutout'
  | 'drill'
  | 'seam'
  | 'annotation'
  | 'qv'
  | 'ref'
  | 'unknown';

/** AAMA/ASTM D6673 layer numbers (+ CLO's 19 annotation) and common names in foreign files. */
export function layerKind(layer: string | null): LayerKind {
  const l = (layer ?? '').trim();
  const aama: Record<string, LayerKind> = {
    '1': 'cut',
    '2': 'turn',
    '3': 'curve',
    '4': 'notch',
    '5': 'ref',
    '6': 'mirror',
    '7': 'grain',
    '8': 'internal',
    '9': 'ref',
    '10': 'ref',
    '11': 'cutout',
    '13': 'drill',
    '14': 'seam',
    '15': 'annotation',
    '19': 'annotation',
    '80': 'notch',
    '81': 'notch',
    '82': 'notch',
    '83': 'notch',
    '84': 'qv',
    '85': 'qv',
    '86': 'qv',
    '87': 'qv',
  };
  if (aama[l]) return aama[l];
  const s = l.toLowerCase();
  if (/(^|[^a-z])(cut|boundary|outline|contour)([^a-z]|$)|крой|контур/.test(s)) return 'cut';
  if (/sew|seam|stitch|шов|швы/.test(s)) return 'seam';
  if (/grain|долев/.test(s)) return 'grain';
  if (/notch|надсеч|рассеч/.test(s)) return 'notch';
  if (/drill|hole|punch|button/.test(s)) return 'drill';
  if (/mirror|fold|сгиб/.test(s)) return 'mirror';
  if (/inner|internal|intern|внутр/.test(s)) return 'internal';
  if (/text|label|annot|подпис/.test(s)) return 'annotation';
  return 'unknown';
}

// ── sizes ───────────────────────────────────────────────────────────────────────────────────

const LETTER_ORDER = [
  'XXXXS',
  'XXXS',
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  'XXXXL',
  'XXXXXL',
  'XXXXXXL',
];
const LETTER_ALIAS: Record<string, string> = {
  '4XS': 'XXXXS',
  '3XS': 'XXXS',
  '2XS': 'XXS',
  '2XL': 'XXL',
  '3XL': 'XXXL',
  '4XL': 'XXXXL',
  '5XL': 'XXXXXL',
  '6XL': 'XXXXXXL',
};
/** `<S>` → `S`; upper-case, decoration stripped (10-CLO-DXF-FORMAT §2.4-5). */
export const bareSize = (s: string) => s.replace(/[^\p{L}\p{N}.,]+/gu, '').toUpperCase();
const letterRank = (t: string) => LETTER_ORDER.indexOf(LETTER_ALIAS[t] ?? t);
const isLetterSize = (t: string) => letterRank(t) >= 0;
const isNumericSize = (t: string) => /^\d{1,3}([.,]\d)?$/.test(t);

function rankSizes(tokens: string[]): string[] {
  const uniq = [...new Set(tokens)];
  if (uniq.every(isLetterSize)) return uniq.sort((a, b) => letterRank(a) - letterRank(b));
  if (uniq.every(isNumericSize))
    return uniq.sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')));
  return uniq; // file order
}

const isUniToken = (t: string) => bareSize(t) === 'UNI';

/** Size tail of every block name, decided over the whole file (FP_L is left, FP_L_L is size L). */
function sizeTailsByName(names: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const parts = names.map((n) => n.split('_'));
  const stems = new Map<string, Set<string>>();
  const tailStems = new Map<string, Set<string>>();
  for (const p of parts) {
    if (p.length < 2) continue;
    const tail = bareSize(p[p.length - 1]);
    const stem = p.slice(0, -1).join('_');
    if (!tail || !stem) continue;
    (stems.get(stem) ?? stems.set(stem, new Set()).get(stem)!).add(tail);
    (tailStems.get(tail) ?? tailStems.set(tail, new Set()).get(tail)!).add(stem);
  }
  const sizeLike = (t: string) =>
    isLetterSize(t) || (isNumericSize(t) && (tailStems.get(t)?.size ?? 0) >= 2);
  // single-size rule: every block ends with the same size-like token (BLAZER M, allsizes M)
  const tails = new Set(parts.filter((p) => p.length >= 2).map((p) => bareSize(p[p.length - 1])));
  const single =
    names.length >= 2 &&
    tails.size === 1 &&
    parts.every((p) => p.length >= 2) &&
    [...tails].every((t) => isLetterSize(t) || isNumericSize(t));
  names.forEach((n, i) => {
    const p = parts[i];
    if (p.length < 2) return;
    const raw = p[p.length - 1];
    const tail = bareSize(raw);
    const stem = p.slice(0, -1).join('_');
    // UNI: the author declared the piece ungraded; a size-like tail after it is the base size.
    const uniAt = p.findIndex(isUniToken);
    if (uniAt >= 0 && uniAt < p.length - 1 && (isLetterSize(tail) || isNumericSize(tail))) {
      out.set(n, raw);
      return;
    }
    if (single) {
      out.set(n, raw);
      return;
    }
    const st = stems.get(stem);
    const graded = st ? [...st].filter(sizeLike).length >= 2 : false;
    if (graded && sizeLike(tail)) out.set(n, raw);
  });
  return out;
}

// ── contours ────────────────────────────────────────────────────────────────────────────────

function contourOf(paths: IRPath[], layer: string): DxfContour {
  const pts = paths.length === 1 ? paths[0].pts : paths.flatMap((p) => p.pts);
  const sa = signedArea(pts);
  return {
    paths: paths.map((p) => p.id),
    pts,
    areaMm2: Math.abs(sa),
    signedAreaMm2: sa,
    bbox: bboxOf(pts),
    layer,
  };
}

/** Greedy endpoint chaining of open polylines (snap mm). Returns chains with their source ids. */
function chainOpen(
  paths: IRPath[],
  snap: number,
): { ids: PathId[]; pts: PtMm[]; closed: boolean }[] {
  const left = paths.filter((p) => p.pts.length >= 2);
  const used = new Set<number>();
  const out: { ids: PathId[]; pts: PtMm[]; closed: boolean }[] = [];
  const d = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);
  for (let s = 0; s < left.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    let pts = [...left[s].pts];
    const ids = [left[s].id];
    let grown = true;
    while (grown) {
      grown = false;
      for (let k = 0; k < left.length; k++) {
        if (used.has(k)) continue;
        const q = left[k].pts;
        const end = pts[pts.length - 1];
        const start = pts[0];
        if (d(end, q[0]) <= snap) pts = pts.concat(q.slice(1));
        else if (d(end, q[q.length - 1]) <= snap) pts = pts.concat([...q].reverse().slice(1));
        else if (d(start, q[q.length - 1]) <= snap) pts = q.slice(0, -1).concat(pts);
        else if (d(start, q[0]) <= snap) pts = [...q].reverse().slice(0, -1).concat(pts);
        else continue;
        used.add(k);
        ids.push(left[k].id);
        grown = true;
      }
    }
    const closed = pts.length > 3 && d(pts[0], pts[pts.length - 1]) <= snap;
    if (closed) pts = pts.slice(0, -1);
    out.push({ ids, pts, closed });
  }
  return out;
}

function distToContour(p: PtMm, c: DxfContour | null): number {
  return c ? nearestOnPolyline(p, c.pts, true).dist : Infinity;
}

/** Inward unit normal of contour c at its nearest point to p. */
function inwardAt(p: PtMm, c: DxfContour): { at: PtMm; n: PtMm; seg: number; t: number } {
  const near = nearestOnPolyline(p, c.pts, true);
  const tdir = segDir(c.pts, near.seg);
  // left normal is inward for CCW (signed area > 0)
  const s = c.signedAreaMm2 >= 0 ? 1 : -1;
  return { at: near.at, n: { x: -tdir.y * s, y: tdir.x * s }, seg: near.seg, t: near.t };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sampled distances from contour a's vertices to contour b (≤ 400 samples). */
function sampleDistances(a: DxfContour, b: DxfContour): number[] {
  const step = Math.max(1, Math.floor(a.pts.length / 400));
  const out: number[] = [];
  for (let i = 0; i < a.pts.length; i += step)
    out.push(nearestOnPolyline(a.pts[i], b.pts, true).dist);
  return out;
}

const deg = (v: PtMm) => ((((Math.atan2(v.y, v.x) * 180) / Math.PI) % 360) + 360) % 360;
const unit = (v: PtMm): PtMm => {
  const L = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / L, y: v.y / L };
};

// ── per block ───────────────────────────────────────────────────────────────────────────────

type RawNotch = DxfNotch & { twinOf?: number; dupOf?: number };

type BlockWork = {
  piece: DxfBlockPiece;
  raw: RawNotch[];
};

function readLabels(
  texts: IRText[],
  attribTag: Record<number, string>,
): { labels: DxfLabels; pointNumbers: number; annotations: number[] } {
  const labels: DxfLabels = {
    pieceName: null,
    size: null,
    quantity: null,
    material: null,
    category: null,
    annotation: [],
    description: null,
    other: [],
    texts: [],
  };
  let pointNumbers = 0;
  const annotations: number[] = [];
  // one entry per LINE of text: MTEXT carries several labels; an ATTRIB's tag is its key
  const lines: { t: IRText; text: string }[] = [];
  for (const t of texts) {
    const tag = attribTag[t.id];
    if (tag) lines.push({ t, text: `${tag}: ${t.text}` });
    else for (const ln of t.text.split('\n')) lines.push({ t, text: ln });
  }
  for (const { t, text } of lines) {
    if (isPointNumber(text)) {
      pointNumbers++;
      continue;
    }
    const l = decodeLabel(text);
    const kind = layerKind(t.layer);
    if (!l || (l.key === 'other' && kind === 'annotation')) {
      if (text.trim()) {
        labels.annotation.push(text);
        if (!annotations.includes(t.id)) annotations.push(t.id);
      }
      continue;
    }
    if (!labels.texts.includes(t.id)) labels.texts.push(t.id);
    switch (l.key) {
      case 'pieceName':
        labels.pieceName ??= l.value;
        break;
      case 'size':
        labels.size ??= l.value;
        break;
      case 'quantity': {
        const q = parseInt(l.value, 10);
        labels.quantity ??= Number.isFinite(q) ? q : null;
        break;
      }
      case 'material':
        labels.material ??= l.value;
        break;
      case 'category':
        labels.category ??= l.value;
        break;
      case 'annotation':
        labels.annotation.push(l.value);
        break;
      case 'description':
        labels.description ??= l.value;
        break;
      default:
        labels.other.push(l);
    }
  }
  return { labels, pointNumbers, annotations };
}

function grainOf(paths: IRPath[]): DxfGrain | null {
  const cand: DxfGrain[] = [];
  for (const p of paths) {
    if (p.closed || p.pts.length < 2) continue;
    const pts = p.pts;
    if (pts.length === 3) {
      const l01 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const l12 = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
      if (l01 >= 3 * l12 && l01 > 0) {
        cand.push({
          a: pts[0],
          b: pts[1],
          angleDeg: deg({ x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }),
          form: 'clo-arrow',
          directed: true,
          path: p.id,
          others: [],
        });
        continue;
      }
    }
    if (pts.length === 2) {
      cand.push({
        a: pts[0],
        b: pts[1],
        angleDeg: deg({ x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y }),
        form: 'axis',
        directed: false,
        path: p.id,
        others: [],
      });
      continue;
    }
    let best = -1;
    let bl = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      if (l > bl) {
        bl = l;
        best = i;
      }
    }
    if (best >= 0) {
      cand.push({
        a: pts[best],
        b: pts[best + 1],
        angleDeg: deg({ x: pts[best + 1].x - pts[best].x, y: pts[best + 1].y - pts[best].y }),
        form: 'longest-segment',
        directed: false,
        path: p.id,
        others: [],
      });
    }
  }
  if (!cand.length) return null;
  const len = (g: DxfGrain) => Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  cand.sort(
    (x, y) => Number(y.form === 'clo-arrow') - Number(x.form === 'clo-arrow') || len(y) - len(x),
  );
  const g = cand[0];
  g.others = cand.slice(1).map((c) => c.path);
  return g;
}

function blockPiece(
  group: DxfGroup,
  read: DxfRead,
  pathById: Map<PathId, IRPath>,
  textById: Map<number, IRText>,
): BlockWork {
  const page = read.doc.pages[0];
  const paths = group.paths.map((id) => pathById.get(id)).filter((p): p is IRPath => !!p);
  const texts = group.texts.map((id) => textById.get(id)).filter((t): t is IRText => !!t);
  const layerOfPath = (p: IRPath) => page.styles[p.style]?.layer ?? null;
  const kindOf = (p: IRPath) => layerKind(layerOfPath(p));
  const roles: Record<PathId, PathRole> = {};
  const by = (k: LayerKind) => paths.filter((p) => kindOf(p) === k);

  // cut
  let cutLayerPaths = by('cut');
  if (cutLayerPaths.length === 0) {
    // generic files: the largest closed loop on a layer that has no other meaning
    const free = paths.filter(
      (p) => p.closed && p.pts.length >= 3 && ['unknown', 'ref'].includes(kindOf(p)),
    );
    if (free.length) cutLayerPaths = free;
  }
  const pickOuter = (
    ps: IRPath[],
    layerName: string,
  ): { outer: DxfContour | null; rest: IRPath[] } => {
    const closed = ps.filter((p) => p.closed && p.pts.length >= 3);
    const open = ps.filter((p) => !p.closed && p.pts.length >= 2);
    const loops: DxfContour[] = closed.map((p) => contourOf([p], layerName));
    for (const ch of chainOpen(open, PATIMPORT.snapMm)) {
      if (ch.closed && ch.pts.length >= 3) {
        const sa = signedArea(ch.pts);
        loops.push({
          paths: ch.ids,
          pts: ch.pts,
          areaMm2: Math.abs(sa),
          signedAreaMm2: sa,
          bbox: bboxOf(ch.pts),
          layer: layerName,
        });
      }
    }
    if (!loops.length) return { outer: null, rest: ps };
    loops.sort((a, b) => b.areaMm2 - a.areaMm2);
    const outer = loops[0];
    const usedIds = new Set(outer.paths);
    return { outer, rest: ps.filter((p) => !usedIds.has(p.id)) };
  };
  const cutPick = pickOuter(
    cutLayerPaths,
    cutLayerPaths[0] ? layerOfPath(cutLayerPaths[0]) ?? '' : '',
  );
  const cut = cutPick.outer;
  if (cut) for (const id of cut.paths) roles[id] = 'cut';
  for (const p of cutPick.rest) {
    if (p.closed && cut && pointInPolygon(p.pts[0], cut.pts)) roles[p.id] = 'hole';
    else roles[p.id] = p.closed ? 'cut-extra' : 'other';
  }

  // seam (L14)
  const seamPick = pickOuter(by('seam'), '14');
  let seam = seamPick.outer;
  let seamSource: DxfBlockPiece['seamSource'] = seam ? 'L14' : null;
  for (const p of seamPick.rest) roles[p.id] = p.closed ? 'seam-extra' : 'other';

  // L1 == L14 → mode B: the seam lives on layer 8
  let cutEqualsSeam = false;
  if (cut && seam && Math.abs(cut.areaMm2 - seam.areaMm2) <= 1e-4 * cut.areaMm2) {
    const ds = sampleDistances(seam, cut);
    cutEqualsSeam = Math.max(...ds) < 0.05;
  }
  const internalPaths = by('internal');
  if (cut && cutEqualsSeam) {
    const big = (c: DxfContour) =>
      c.areaMm2 >= 0.5 * cut.areaMm2 &&
      c.areaMm2 < cut.areaMm2 * 0.9999 &&
      pointInPolygon(c.pts[0], cut.pts);
    const loops = internalPaths
      .filter((p) => p.closed && p.pts.length >= 4)
      .map((p) => contourOf([p], layerOfPath(p) ?? '8'))
      .filter(big);
    let found: DxfContour | null = null;
    let src: DxfBlockPiece['seamSource'] = null;
    if (loops.length) {
      loops.sort((a, b) => b.areaMm2 - a.areaMm2);
      found = loops[0];
      src = 'L8-loop';
    } else if (cutEqualsSeam) {
      for (const ch of chainOpen(
        internalPaths.filter((p) => !p.closed),
        PATIMPORT.snapMm,
      )) {
        if (!ch.closed) continue;
        const sa = signedArea(ch.pts);
        const c: DxfContour = {
          paths: ch.ids,
          pts: ch.pts,
          areaMm2: Math.abs(sa),
          signedAreaMm2: sa,
          bbox: bboxOf(ch.pts),
          layer: '8',
        };
        if (big(c) && (!found || c.areaMm2 > found.areaMm2)) {
          found = c;
          src = 'L8-chain';
        }
      }
    }
    // The L14 copy of the cut line is not a seam line either way.
    if (seam) for (const id of seam.paths) roles[id] = 'seam-extra';
    seam = found;
    seamSource = found ? src : null;
  }
  if (seam) for (const id of seam.paths) roles[id] = 'seam';
  const seamToCutMm =
    cut && seam && !cutEqualsSeam
      ? median(sampleDistances(seam, cut))
      : cutEqualsSeam && seam && seamSource !== 'L14' && cut
        ? median(sampleDistances(seam, cut))
        : null;

  // grain
  const grainPaths = by('grain');
  const grain = grainOf(grainPaths);
  for (const p of grainPaths) roles[p.id] = 'grain';

  // drills: AAMA 13 + small closed squares/circles on 8 (CLO writes a 10×10 square)
  const drills: DxfBlockPiece['drills'] = [];
  for (const p of by('drill')) {
    roles[p.id] = 'drill';
    const bb = bboxOf(p.pts);
    drills.push({
      at: { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 },
      path: p.id,
      form: p.pts.length === 1 ? 'point' : p.pts.length === 4 ? 'square' : 'circle',
    });
  }
  for (const p of internalPaths) {
    if (roles[p.id]) continue;
    if (p.closed && p.pts.length >= 4) {
      const bb = bboxOf(p.pts);
      const w = bb.maxX - bb.minX;
      const h = bb.maxY - bb.minY;
      if (w <= 12 && h <= 12 && w > 0 && h > 0 && w / h > 0.75 && w / h < 1.33) {
        roles[p.id] = 'drill';
        drills.push({
          at: { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 },
          path: p.id,
          form: p.pts.length === 4 ? 'square' : 'circle',
        });
        continue;
      }
    }
    if (p.pts.length === 1) {
      roles[p.id] = 'drill';
      drills.push({ at: p.pts[0], path: p.id, form: 'point' });
      continue;
    }
    roles[p.id] = 'internal';
  }
  for (const p of by('cutout')) roles[p.id] = p.closed ? 'hole' : 'internal';
  for (const p of by('mirror')) roles[p.id] = 'fold';
  let turn = 0;
  let curve = 0;
  for (const p of by('turn')) {
    roles[p.id] = 'grade-point';
    turn++;
  }
  for (const p of by('curve')) {
    roles[p.id] = 'grade-point';
    curve++;
  }
  for (const p of by('qv')) roles[p.id] = 'qv-copy';

  // notches
  const raw: RawNotch[] = [];
  for (const p of by('notch')) {
    roles[p.id] = 'notch';
    const pa = read.meta.points[p.id];
    if (p.pts.length === 1) {
      const at = p.pts[0];
      const dc = distToContour(at, cut);
      const dsm = distToContour(at, seam);
      const on: NotchOn =
        Math.min(dc, dsm) <= PATIMPORT.snapMm ? (dc <= dsm ? 'cut' : 'seam') : 'none';
      let dir: PtMm;
      if (pa?.angleDeg != null)
        dir = {
          x: Math.cos((pa.angleDeg * Math.PI) / 180),
          y: Math.sin((pa.angleDeg * Math.PI) / 180),
        };
      else if (cut) dir = inwardAt(at, on === 'seam' && seam ? seam : cut).n;
      else dir = { x: 0, y: 1 };
      const depth = pa && pa.z > 0 ? pa.z : 5;
      raw.push({
        at,
        dir,
        depthMm: depth,
        angleDeg: deg(dir),
        on,
        distMm: on === 'seam' ? dsm : dc,
        source: 'point',
        paths: [p.id],
      });
      continue;
    }
    // LINE / polyline notch: the end on a contour is the position, the other end gives the direction
    const ends: PtMm[] = p.pts.length === 2 ? [p.pts[0], p.pts[1]] : p.pts;
    let best = { i: 0, d: Infinity, on: 'none' as NotchOn };
    ends.forEach((q, i) => {
      const dc = distToContour(q, cut);
      const dsm = distToContour(q, seam);
      if (dc < best.d) best = { i, d: dc, on: 'cut' };
      if (dsm < best.d - 1e-9) best = { i, d: dsm, on: 'seam' };
    });
    const at = ends[best.i];
    let far = ends[0];
    let fd = -1;
    for (const q of ends) {
      const d = Math.hypot(q.x - at.x, q.y - at.y);
      if (d > fd) {
        fd = d;
        far = q;
      }
    }
    const dir = unit({ x: far.x - at.x, y: far.y - at.y });
    raw.push({
      at,
      dir,
      depthMm: fd,
      angleDeg: deg(dir),
      on: best.d <= PATIMPORT.snapMm ? best.on : 'none',
      distMm: best.d,
      source: 'line',
      paths: [p.id],
    });
  }
  for (const p of paths) if (!roles[p.id]) roles[p.id] = 'other';

  const { labels, pointNumbers, annotations } = readLabels(texts, read.meta.attribTag);
  const piece: DxfBlockPiece = {
    group: group.index,
    block: group.block ?? '',
    identity: '',
    identitySource: 'block-name',
    sizeRaw: '',
    size: '',
    sizeSource: 'none',
    uni: false,
    labels,
    cut,
    seam,
    seamSource,
    cutEqualsSeam,
    seamToCutMm,
    grain,
    notches: [],
    notchStats: { raw: raw.length, exactDuplicates: 0, twins: 0, derived: 0 },
    drills,
    roles,
    texts: group.texts,
    gradePoints: { turn, curve },
    pointNumbers,
    annotations,
  };
  return { piece, raw };
}

/**
 * One logical notch per position on the target line (§2.4-4). Measured on the corpus:
 *  - CLO draws the LINE's direction either way (outward on some cut notches), so the direction is
 *    re-derived as the inward normal of the line the notch lands on;
 *  - mode A writes every notch twice — on the cut line and ~allowance inside on the seam line —
 *    and in non-sample sizes the "cut" copy sits on the STALE layer 1 (the sample's line) while
 *    the graded copy floats at ~allowance outside the graded seam (no drawn line there);
 *  - mode B writes exact duplicates.
 * So: drop stale copies (mode A, non-sample, on layer 1), merge exact duplicates, project every
 * notch within reach onto the target line (seam in mode A, cut otherwise), and merge projections
 * closer than 1.5 mm — a cut/seam twin projects onto the same spot.
 */
function dedupeNotches(
  w: BlockWork,
  keep: 'cut' | 'seam',
  staleCut: boolean,
  allowanceMm: number,
): void {
  const { raw, piece } = w;
  const live = raw.map(() => true);
  if (staleCut) {
    const graded = raw.some((n) => n.on !== 'cut');
    raw.forEach((n, i) => {
      if (graded && n.on === 'cut') {
        live[i] = false;
        piece.notchStats.twins++;
      }
    });
  }
  for (let i = 0; i < raw.length; i++) {
    if (!live[i]) continue;
    for (let j = i + 1; j < raw.length; j++) {
      if (!live[j]) continue;
      const a = raw[i];
      const b = raw[j];
      if (
        Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) <= 0.01 &&
        a.dir.x * b.dir.x + a.dir.y * b.dir.y > 0.999 &&
        Math.abs(a.depthMm - b.depthMm) <= 0.01
      ) {
        live[j] = false;
        a.paths.push(...b.paths);
        piece.notchStats.exactDuplicates++;
      }
    }
  }
  const target = keep === 'seam' ? piece.seam ?? piece.cut : piece.cut ?? piece.seam;
  const on: NotchOn = target === piece.cut ? 'cut' : 'seam';
  // Explicit twins: two notches ~allowance apart along their own (parallel) line direction —
  // the same notch written on the cut and on the seam line. Projection alone mis-pairs at corners.
  const allowances = [allowanceMm, piece.seamToCutMm].filter(
    (a): a is number => a != null && a > 0.5,
  );
  const cand: { i: number; j: number; err: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (!live[i]) continue;
    for (let j = i + 1; j < raw.length; j++) {
      if (!live[j]) continue;
      const a = raw[i];
      const b = raw[j];
      const v = { x: b.at.x - a.at.x, y: b.at.y - a.at.y };
      const L = Math.hypot(v.x, v.y);
      if (L < 0.5) continue;
      const align =
        Math.max(Math.abs(v.x * a.dir.x + v.y * a.dir.y), Math.abs(v.x * b.dir.x + v.y * b.dir.y)) /
        L;
      const par = Math.abs(a.dir.x * b.dir.x + a.dir.y * b.dir.y);
      const local =
        a.on === 'cut' && piece.cut
          ? distToContour(b.at, piece.cut)
          : b.on === 'cut' && piece.cut
            ? distToContour(a.at, piece.cut)
            : null;
      const err = Math.min(
        ...[...allowances, ...(local != null ? [local] : [])].map((A) => Math.abs(L - A)),
      );
      if (align >= 0.9 && par >= 0.8 && err <= 2.5) cand.push({ i, j, err });
    }
  }
  cand.sort((x, y) => x.err - y.err);
  const paired = new Set<number>();
  for (const c of cand) {
    if (paired.has(c.i) || paired.has(c.j)) continue;
    paired.add(c.i);
    paired.add(c.j);
    const di = target ? distToContour(raw[c.i].at, target) : 0;
    const dj = target ? distToContour(raw[c.j].at, target) : 0;
    const [win, lose] = di <= dj ? [c.i, c.j] : [c.j, c.i];
    raw[win].paths.push(...raw[lose].paths);
    live[lose] = false;
    piece.notchStats.twins++;
  }
  const reach = Math.max(allowanceMm, piece.seamToCutMm ?? 0, 10) + 3;
  const out: DxfNotch[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (!live[i]) continue;
    const { twinOf: _t, dupOf: _d, ...n } = raw[i];
    if (!target) {
      out.push(n);
      continue;
    }
    const d = distToContour(n.at, target);
    if (d > reach) {
      out.push({ ...n, on: 'none', distMm: d });
      continue;
    }
    const inw = inwardAt(n.at, target);
    const proj: DxfNotch = { ...n, at: inw.at, dir: inw.n, angleDeg: deg(inw.n), on, distMm: 0 };
    const twin = out.find(
      (o) => o.on === on && Math.hypot(o.at.x - proj.at.x, o.at.y - proj.at.y) <= 1.5,
    );
    if (twin) {
      twin.paths.push(...proj.paths);
      piece.notchStats.twins++;
      continue;
    }
    out.push(proj);
  }
  piece.notches = out;
}

/** Cumulative arc length of a closed polyline; c[i] = length up to vertex i, c[n] = perimeter. */
function cumLen(pts: PtMm[]): number[] {
  const c = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    c.push(c[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return c;
}

/** Vertices where the outline turns by more than `minDeg` — pattern corners, stable across sizes. */
function cornerIdx(pts: PtMm[], minDeg = 25): number[] {
  const n = pts.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const u = unit({ x: b.x - a.x, y: b.y - a.y });
    const v = unit({ x: c.x - b.x, y: c.y - b.y });
    const turn = (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) / Math.PI;
    if (turn >= minDeg) out.push(i);
  }
  return out;
}

/** Point at arc length s (mod perimeter) on a closed polyline, with its segment. */
function atLength(pts: PtMm[], c: number[], s: number): { at: PtMm; seg: number } {
  const per = c[c.length - 1];
  s = ((s % per) + per) % per;
  let seg = 0;
  while (seg < pts.length - 1 && c[seg + 1] < s) seg++;
  const L = c[seg + 1] - c[seg] || 1;
  const t = (s - c[seg]) / L;
  const a = pts[seg];
  const b = pts[(seg + 1) % pts.length];
  return { at: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, seg };
}

/**
 * R12 CLO-AAMA: notches live only in the sample-size block (§2.4-3). Transfer them along the
 * graded seam line: the notch keeps its proportional position between the two pattern corners
 * that bracket it (corners matched sample → size by nearest position, which works because CLO
 * stacks all sizes on one grade anchor). Falls back to the proportional position along the whole
 * outline when the corners do not correspond.
 *
 * APPROXIMATE by construction: CLO grades notches by its own rules, which the outline alone does
 * not carry. Measured against CLO's own graded notches (ALLSIZES_DXF, probe): p95 ≈ 5 mm,
 * max ≈ 5.4 mm (distance-from-nearer-corner measured worse, 17.7 mm; whole-outline arc length
 * 4.4/5.9 mm). Derived notches are therefore `origin: 'derived'`, confidence 0.5, and the
 * segmentation warns; a per-size export gives exact notches.
 */
function transferNotches(sample: DxfBlockPiece, target: DxfBlockPiece): number {
  if (!sample.seam || !target.seam || sample.notches.length === 0) return 0;
  const S0 = sample.seam.pts;
  const Sk = target.seam.pts;
  const c0 = cumLen(S0);
  const ck = cumLen(Sk);
  const k0 = cornerIdx(S0);
  const kk = cornerIdx(Sk);
  // corner correspondence: each sample corner → nearest target corner; must be a bijection in
  // the same cyclic order
  let map: number[] | null = null;
  if (k0.length >= 2 && k0.length === kk.length) {
    const m = k0.map((i) => {
      let best = -1;
      let bd = Infinity;
      kk.forEach((j, jj) => {
        const d = Math.hypot(S0[i].x - Sk[j].x, S0[i].y - Sk[j].y);
        if (d < bd) {
          bd = d;
          best = jj;
        }
      });
      return best;
    });
    const shift = (m[0] - 0 + kk.length) % kk.length;
    if (m.every((jj, ii) => jj === (ii + shift) % kk.length)) map = m;
  }
  const sign = target.seam.signedAreaMm2 >= 0 ? 1 : -1;
  const sameDir = Math.sign(sample.seam.signedAreaMm2) === Math.sign(target.seam.signedAreaMm2);
  let n = 0;
  for (const src of sample.notches) {
    const near = nearestOnPolyline(src.at, S0, true);
    const s0 = c0[near.seg] + near.t * (c0[near.seg + 1] - c0[near.seg]);
    let sk: number;
    let method: 'corner' | 'arc-length';
    if (map && sameDir) {
      // bracketing corners in the sample
      const P0 = c0[c0.length - 1];
      const pos = k0.map((i) => c0[i]);
      let ii = pos.length - 1;
      for (let q = 0; q < pos.length; q++) if (pos[q] <= s0) ii = q;
      const a0 = pos[ii];
      const b0 = pos[(ii + 1) % pos.length] + (ii + 1 >= pos.length ? P0 : 0);
      const s0u = s0 < a0 ? s0 + P0 : s0;
      const f = (s0u - a0) / (b0 - a0 || 1);
      const Pk = ck[ck.length - 1];
      const ak = ck[kk[map[ii]]];
      let bk = ck[kk[map[(ii + 1) % pos.length]]];
      if (bk <= ak) bk += Pk;
      sk = ak + f * (bk - ak);
      method = 'corner';
    } else {
      sk = (s0 / c0[c0.length - 1]) * ck[ck.length - 1];
      method = 'arc-length';
    }
    const { at, seg } = atLength(Sk, ck, sk);
    const td = segDir(Sk, seg);
    const dir = { x: -td.y * sign, y: td.x * sign };
    target.notches.push({
      at,
      dir,
      depthMm: src.depthMm,
      angleDeg: deg(dir),
      on: 'seam',
      distMm: 0,
      source: 'derived',
      paths: [],
      from: { group: sample.group, path: src.paths[0], method },
    });
    n++;
  }
  target.notchStats.derived += n;
  return n;
}

// ── public ──────────────────────────────────────────────────────────────────────────────────

export function segmentDxf(read: DxfRead): DxfSegmentation {
  const warnings: string[] = [];
  const page = read.doc.pages[0];
  const pathById = new Map(page.paths.map((p) => [p.id, p]));
  const textById = new Map(page.texts.map((t) => [t.id, t]));
  const inserts = read.meta.groups.filter((g) => g.kind === 'insert');
  if (inserts.length === 0) {
    return {
      presegmented: false,
      dialect: read.meta.dialect,
      sizes: [],
      sampleSize: null,
      mode: 'none',
      layer1Ungraded: false,
      allowance: null,
      pieces: [],
      identities: [],
      pairs: [],
      warnings: ['no block inserts: loose geometry — the pieces stage must find the contours'],
    };
  }
  const work = inserts.map((g) => blockPiece(g, read, pathById, textById));
  const pieces = work.map((w) => w.piece);

  // identity + size
  const tails = sizeTailsByName(pieces.map((p) => p.block));
  for (const p of pieces) {
    const tail = tails.get(p.block);
    const nameIdentity =
      tail != null ? p.block.slice(0, p.block.length - tail.length - 1) : p.block;
    p.uni = p.block.split('_').some(isUniToken);
    if (p.labels.pieceName) {
      p.identity = decodeTextValue(p.labels.pieceName).trim();
      p.identitySource = 'label';
    } else {
      p.identity = nameIdentity;
      p.identitySource = 'block-name';
    }
    if (p.labels.size) {
      p.sizeRaw = p.labels.size.trim();
      p.sizeSource = 'label';
    } else if (tail != null) {
      p.sizeRaw = tail;
      p.sizeSource = 'block-name';
    }
    p.size = bareSize(p.sizeRaw);
    if (p.labels.pieceName && tail != null && p.labels.pieceName.trim() !== nameIdentity) {
      warnings.push(
        `${p.block}: PIECE NAME “${p.labels.pieceName}” differs from the block name — the label wins`,
      );
    }
  }
  const sizeOrder = rankSizes(pieces.filter((p) => p.size).map((p) => p.size));
  const sizes = sizeOrder.map((token, rank) => ({
    token,
    raw: [...new Set(pieces.filter((p) => p.size === token).map((p) => p.sizeRaw))],
    rank,
  }));
  const rankOf = (s: string) => (s ? sizeOrder.indexOf(s) : -1);

  // identities
  const idMap = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    const list = idMap.get(p.identity) ?? [];
    list.push(i);
    idMap.set(p.identity, list);
  });
  const identities: DxfIdentity[] = [];
  for (const [identity, idx] of idMap) {
    idx.sort((a, b) => rankOf(pieces[a].size) - rankOf(pieces[b].size));
    const dupSizes = idx.length !== new Set(idx.map((i) => pieces[i].size)).size;
    if (dupSizes)
      warnings.push(
        `${identity}: several blocks with the same size (${idx.map((i) => pieces[i].block).join(', ')})`,
      );
    const ps = idx.map((i) => pieces[i]);
    let mode: CutMode;
    let layer1Ungraded: boolean | null = null;
    const withCut = ps.filter((p) => p.cut);
    const withSeam = ps.filter((p) => p.seam);
    if (!withCut.length && !withSeam.length) mode = 'none';
    else if (!withCut.length) mode = 'seam-only';
    else if (ps.every((p) => p.cutEqualsSeam)) {
      mode = 'B';
      layer1Ungraded = ps.length >= 2 ? spread(withCut.map((p) => p.cut!.areaMm2)) < 0.002 : null;
    } else if (!withSeam.length) mode = 'cut-only';
    else if (ps.length < 2) mode = 'single';
    else {
      const cutGraded = spread(withCut.map((p) => p.cut!.areaMm2)) >= 0.002;
      const seamGraded = spread(withSeam.map((p) => p.seam!.areaMm2)) >= 0.002;
      if (!cutGraded && seamGraded) {
        mode = 'A';
        layer1Ungraded = true;
      } else {
        mode = 'C';
        layer1Ungraded = false;
      }
    }
    const toks = identity.split('_').map((t) => t.toUpperCase());
    const handAt = toks.findIndex((t) => t === 'L' || t === 'R' || t === 'LEFT' || t === 'RIGHT');
    const hand = handAt >= 0 ? (toks[handAt].startsWith('L') ? 'L' : 'R') : null;
    const first = ps.find((p) => p.labels.quantity != null);
    identities.push({
      identity,
      pieces: idx,
      sizes: ps.map((p) => p.size),
      uni: ps.some((p) => p.uni),
      layer1Ungraded,
      mode,
      hand,
      pairOf: null,
      quantity: first?.labels.quantity ?? null,
      material: ps.find((p) => p.labels.material)?.labels.material ?? null,
      category: ps.find((p) => p.labels.category)?.labels.category ?? null,
    });
  }

  // file mode (majority over identities that have contours)
  const counts = new Map<CutMode, number>();
  for (const id of identities)
    if (id.mode !== 'none') counts.set(id.mode, (counts.get(id.mode) ?? 0) + 1);
  const mode: CutMode = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  const layer1Ungraded = identities.some((i) => i.layer1Ungraded === true);

  // sample size: text first, else the size whose cut line is a uniform offset of its seam
  let sampleSize: DxfSegmentation['sampleSize'] = null;
  const ss = read.meta.modelLabels.find((l) => l.key === 'sampleSize');
  if (ss && bareSize(ss.value)) sampleSize = { token: bareSize(ss.value), source: 'text' };
  else if (mode === 'A' && sizes.length >= 2) {
    const score = new Map<string, number>();
    for (const id of identities) {
      if (id.mode !== 'A') continue;
      for (const i of id.pieces) {
        const p = pieces[i];
        if (!p.cut || !p.seam) continue;
        const d = sampleDistances(p.seam, p.cut).sort((a, b) => a - b);
        const iqr = d[Math.floor(d.length * 0.9)] - d[Math.floor(d.length * 0.1)];
        score.set(p.size, (score.get(p.size) ?? 0) + iqr);
      }
    }
    const best = [...score].sort((a, b) => a[1] - b[1])[0];
    if (best) sampleSize = { token: best[0], source: 'geometry' };
  }

  // allowance (as drawn)
  let allowance: AllowanceDecision | null = null;
  {
    const fromBlocks = (filter: (p: DxfBlockPiece) => boolean) =>
      median(pieces.filter((p) => filter(p) && p.seamToCutMm != null).map((p) => p.seamToCutMm!));
    const sample = sampleSize?.token;
    const a =
      mode === 'A'
        ? fromBlocks((p) => !!sample && p.size === sample)
        : mode === 'B' || mode === 'C' || mode === 'single'
          ? fromBlocks(() => true)
          : null;
    const r = a == null ? null : Math.round(a * 10) / 10;
    if (mode === 'A' && r != null) {
      allowance = {
        meaning: 'seam',
        allowanceMm: r,
        origin: 'measured',
        evidence: [
          `layer 1 is not graded (sample size ${sample}); cut = graded layer 14 + ${r} mm measured on the sample size`,
        ],
      };
    } else if ((mode === 'B' || mode === 'C' || mode === 'single') && r != null) {
      allowance = {
        meaning: 'both',
        allowanceMm: r,
        origin: 'measured',
        evidence: [`median seam→cut distance ${r} mm (mode ${mode})`],
      };
    } else if (
      mode === 'cut-only' ||
      ((mode === 'B' || mode === 'C' || mode === 'single') && r == null)
    ) {
      allowance = {
        meaning: 'cut',
        allowanceMm: 0,
        origin: 'default',
        evidence: ['no seam line: layer 1 taken as the final cut line'],
      };
    } else if (mode === 'seam-only') {
      allowance = {
        meaning: 'seam',
        allowanceMm: PATIMPORT.defaultAllowanceMm,
        origin: 'default',
        evidence: ['only a seam line is drawn'],
      };
    }
  }
  if (mode === 'A') {
    warnings.push(
      `layer 1 is the sample size's cut line copied into every size (${identities.filter((i) => i.mode === 'A').length} pieces) — the graded layer 14 + ${allowance?.allowanceMm ?? '?'} mm is used; a per-size export is exact`,
    );
  }
  if (sizes.length === 1)
    warnings.push(`single-size file (${sizes[0].token}) — grading cannot be measured`);

  // notches: dedupe per block with the mode's representative, then transfer R12 sample notches
  for (const id of identities) {
    for (const i of id.pieces) {
      const w = work[i];
      const isSample = sampleSize ? w.piece.size === sampleSize.token : true;
      dedupeNotches(
        w,
        id.mode === 'A' ? 'seam' : 'cut',
        id.mode === 'A' && !isSample,
        allowance?.allowanceMm ?? PATIMPORT.defaultAllowanceMm,
      );
    }
    if (sampleSize) {
      const sample = id.pieces.map((i) => pieces[i]).find((p) => p.size === sampleSize!.token);
      if (sample && sample.notches.length > 0) {
        for (const i of id.pieces) {
          const p = pieces[i];
          if (p === sample || p.notchStats.raw > 0) continue;
          const n = transferNotches(sample, p);
          if (n && !warnings.some((x) => x.startsWith('notches exist only in the sample'))) {
            warnings.push(
              `notches exist only in the sample-size blocks (${sampleSize.token}) — transferred to the other sizes along the graded seam line (derived, approximate: ≈5 mm p95 against CLO's own grading; a per-size export is exact)`,
            );
          }
        }
      }
    }
  }

  // pairs
  const pairs: DxfPair[] = [];
  const byName = new Map(identities.map((i) => [i.identity.toUpperCase(), i]));
  for (const id of identities) {
    if (id.hand !== 'L') continue;
    const toks = id.identity.split('_');
    const swapped = toks
      .map((t) => (/^l$/i.test(t) ? (t === 'l' ? 'r' : 'R') : /^left$/i.test(t) ? 'RIGHT' : t))
      .join('_');
    const other = byName.get(swapped.toUpperCase());
    if (!other || other.hand !== 'R') continue;
    id.pairOf = other.identity;
    other.pairOf = id.identity;
    const common =
      id.sizes.find((s) => other.sizes.includes(s) && (!sampleSize || s === sampleSize.token)) ??
      id.sizes.find((s) => other.sizes.includes(s));
    const pl = pieces[id.pieces[id.sizes.indexOf(common ?? '')] ?? id.pieces[0]];
    const pr = pieces[other.pieces[other.sizes.indexOf(common ?? '')] ?? other.pieces[0]];
    const cl = pl.cut ?? pl.seam;
    const cr = pr.cut ?? pr.seam;
    if (!cl || !cr) continue;
    const wl = cl.bbox.maxX - cl.bbox.minX;
    const hl = cl.bbox.maxY - cl.bbox.minY;
    const wr = cr.bbox.maxX - cr.bbox.minX;
    const hr = cr.bbox.maxY - cr.bbox.minY;
    pairs.push({
      left: id.identity,
      right: other.identity,
      areaRatio: cl.areaMm2 / (cr.areaMm2 || 1),
      mirrored: Math.sign(cl.signedAreaMm2) !== Math.sign(cr.signedAreaMm2),
      bboxDeltaMm: Math.max(Math.abs(wl - wr), Math.abs(hl - hr)),
      geometryConfirmed:
        Math.abs(cl.areaMm2 / (cr.areaMm2 || 1) - 1) <= PATIMPORT.pairAreaTol &&
        Math.max(Math.abs(wl - wr), Math.abs(hl - hr)) <= PATIMPORT.pairBboxTolMm,
    });
  }

  const noGrain = pieces.filter((p) => !p.grain).map((p) => p.block);
  if (noGrain.length)
    warnings.push(
      `no grain line in ${noGrain.length} block(s): ${noGrain.slice(0, 6).join(', ')}${noGrain.length > 6 ? '…' : ''}`,
    );

  return {
    presegmented: true,
    dialect: read.meta.dialect,
    sizes,
    sampleSize,
    mode,
    layer1Ungraded,
    allowance,
    pieces,
    identities,
    pairs,
    warnings,
  };
}

function spread(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mn = Math.min(...xs);
  const mx = Math.max(...xs);
  return mn > 0 ? mx / mn - 1 : Infinity;
}

/** Probe-only access to the per-block steps (scripts/pattern-import/dxf-entry.ts). */
export const __internals = { blockPiece, dedupeNotches, transferNotches };
