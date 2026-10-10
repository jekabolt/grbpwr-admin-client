// The landmark program and the standard POMs (§5.3), run on ONE size's model. Every value says
// how it was read (landmarks, edges, drawable lines) and how exact it is; a landmark that is not
// there makes the POM `not-found`, never a guess.

import type { Edge, EdgeId, Pt2 } from 'lib/assembly-skeleton/types';
import { bboxOf, dist, first, hIntervals, last, mirrorErrorMm, vIntervals } from './geom';
import { partnersOf, pieceOf, type Model } from './model';
import { BODY_TOP, LEG } from './pieces';
import { layoutUnion, toUnion, type Union } from './union';
import {
  POM,
  type EdgeRole,
  type GirthConvention,
  type LandmarkPoint,
  type PomCode,
  type PomDef,
  type PomLine,
  type PomValue,
} from './types';

// ── definitions ────────────────────────────────────────────────────────────────────────────

export const POM_DEFS: PomDef[] = [
  {
    code: 'chest',
    name: 'Chest 1" below armhole',
    garment: 'top',
    method: 'flat-width',
    girth: true,
    how: 'level 25.4 mm below the armhole bottom (top of the side seam); widths of all body panels at that level summed, CF to CF through the button drills',
  },
  {
    code: 'waist',
    name: 'Waist (narrowest level)',
    garment: 'top',
    method: 'flat-width',
    girth: true,
    how: 'narrowest girth between the chest level and the hem; reported only when the pattern is shaped there',
  },
  {
    code: 'hem',
    name: 'Hem sweep',
    garment: 'top',
    method: 'girth-sum',
    girth: true,
    how: 'hem edge lengths of all body panels summed (seam line), CF to CF',
  },
  {
    code: 'length-hps',
    name: 'Body length from HPS (front)',
    garment: 'top',
    method: 'flat-length',
    girth: false,
    how: 'HPS (shoulder ∩ neckline on the front) straight down, parallel to the grain, to the hem',
  },
  {
    code: 'length-cb',
    name: 'CB length',
    garment: 'top',
    method: 'flat-length',
    girth: false,
    how: 'CB neck point straight down the centre back (through the yoke) to the hem',
  },
  {
    code: 'across-shoulder',
    name: 'Across shoulder',
    garment: 'top',
    method: 'chord',
    girth: false,
    how: 'shoulder point to shoulder point (shoulder ∩ armhole) across the back, straight',
  },
  {
    code: 'shoulder',
    name: 'Shoulder length',
    garment: 'top',
    method: 'edge-length',
    girth: false,
    how: 'shoulder seam line, HPS to shoulder point',
  },
  {
    code: 'neck-width',
    name: 'Neck width',
    garment: 'top',
    method: 'chord',
    girth: false,
    how: 'HPS to HPS across the back neckline, straight',
  },
  {
    code: 'neck-drop-front',
    name: 'Front neck drop',
    garment: 'top',
    method: 'flat-length',
    girth: false,
    how: 'HPS level down to the lowest point of the front neckline',
  },
  {
    code: 'neck-drop-back',
    name: 'Back neck drop',
    garment: 'top',
    method: 'flat-length',
    girth: false,
    how: 'HPS level down to the CB neck point',
  },
  {
    code: 'armhole',
    name: 'Armhole (curved)',
    garment: 'top',
    method: 'girth-sum',
    girth: false,
    how: 'armhole seam line of the body, front + back, one side',
  },
  {
    code: 'sleeve-length',
    name: 'Sleeve length from shoulder',
    garment: 'top',
    method: 'flat-length',
    girth: false,
    how: 'cap apex straight down the sleeve, parallel to the grain, to the wrist',
  },
  {
    code: 'underarm',
    name: 'Underarm length',
    garment: 'top',
    method: 'edge-length',
    girth: false,
    how: 'underarm seam line of the sleeve',
  },
  {
    code: 'bicep',
    name: 'Bicep 1" below armhole',
    garment: 'top',
    method: 'flat-width',
    girth: true,
    how: 'level 25.4 mm below the cap bottom; sleeve panel widths summed',
  },
  {
    code: 'sleeve-opening',
    name: 'Sleeve opening',
    garment: 'top',
    method: 'girth-sum',
    girth: true,
    how: 'wrist edge lengths of the sleeve panels summed (seam line)',
  },
  {
    code: 'collar-length',
    name: 'Collar length',
    garment: 'top',
    method: 'edge-length',
    girth: false,
    how: 'neck seam line of the stand (or of the collar without a stand)',
  },
  {
    code: 'stand-height',
    name: 'Stand height at CB',
    garment: 'top',
    method: 'flat-length',
    girth: false,
    how: 'height of the stand at its centre',
  },
  {
    code: 'collar-point',
    name: 'Collar point',
    garment: 'top',
    method: 'edge-length',
    girth: false,
    how: 'end edge of the collar, neck to point',
  },
  {
    code: 'waist',
    name: 'Waist',
    garment: 'bottom',
    method: 'girth-sum',
    girth: true,
    how: 'waist edge lengths of all leg panels summed (seam line)',
  },
  {
    code: 'hip',
    name: 'Hip / seat 3" above crotch',
    garment: 'bottom',
    method: 'flat-width',
    girth: true,
    how: 'level 76.2 mm above the crotch point; front + back widths of both legs summed',
  },
  {
    code: 'front-rise',
    name: 'Front rise',
    garment: 'bottom',
    method: 'edge-length',
    girth: false,
    how: 'front rise seam line, crotch point to the waist seam',
  },
  {
    code: 'back-rise',
    name: 'Back rise',
    garment: 'bottom',
    method: 'edge-length',
    girth: false,
    how: 'back rise seam line, crotch point to the waist seam',
  },
  {
    code: 'inseam',
    name: 'Inseam',
    garment: 'bottom',
    method: 'edge-length',
    girth: false,
    how: 'inseam seam line, crotch point to the leg hem',
  },
  {
    code: 'outseam',
    name: 'Outseam',
    garment: 'bottom',
    method: 'edge-length',
    girth: false,
    how: 'outseam seam line, waist seam to the leg hem',
  },
  {
    code: 'thigh',
    name: 'Thigh 1" below crotch',
    garment: 'bottom',
    method: 'flat-width',
    girth: true,
    how: 'level 25.4 mm below the crotch point; front + back leg widths summed',
  },
  {
    code: 'knee',
    name: 'Knee (half inseam)',
    garment: 'bottom',
    method: 'flat-width',
    girth: true,
    how: 'level at half the inseam below the crotch; front + back leg widths summed',
  },
  {
    code: 'leg-opening',
    name: 'Leg opening',
    garment: 'bottom',
    method: 'girth-sum',
    girth: true,
    how: 'leg hem edge lengths of front + back summed (seam line)',
  },
];

/** A full back / yoke is symmetric to this (pleats drawn slightly off make SS26-005's BP 4.0 mm). */
const SYM_MM = 6;
/** Seat / hip of trousers: 3 inches above the crotch point (a common spec line). */
const SEAT_MM = 76.2;

// ── small readers ──────────────────────────────────────────────────────────────────────────

const ok = (m: Model, id: EdgeId, role: EdgeRole) => {
  const r = m.roles.get(id);
  return !!r && r.role === role && r.confidence >= POM.roleAccept;
};
const edgesOf = (m: Model, key: string, role: EdgeRole): Edge[] =>
  (m.geoms.get(key)?.edges ?? []).filter((e) => ok(m, e.id, role));
const ringOf = (m: Model, key: string) => m.geoms.get(key)?.rs ?? [];
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const highEnd = (e: Edge) => (first(e)[1] >= last(e)[1] ? first(e) : last(e));
const lowEnd = (e: Edge) => (first(e)[1] >= last(e)[1] ? last(e) : first(e));
const lp = (
  id: string,
  pieceKey: string,
  pt: Pt2,
  exactness: 'exact' | 'approx',
  from: string,
): LandmarkPoint => ({ id, pieceKey, pt, exactness, from });

type Built = Omit<PomValue, 'code' | 'name' | 'method'>;

const notFound = (reason: string): Built => ({
  valueMm: null,
  exactness: 'not-found',
  reason,
  path: { landmarks: [], edges: [], lines: [] },
});

function girth(fullMm: number, conv: GirthConvention) {
  return { fullMm, halfMm: fullMm / 2, valueMm: conv === 'half' ? fullMm / 2 : fullMm };
}

/** Horizontal segments of piece `key` at union level Y (piece-local). */
function levelLines(
  m: Model,
  u: Union,
  keys: string[],
  Y: number,
): { width: number; lines: PomLine[] } {
  let width = 0;
  const lines: PomLine[] = [];
  for (const k of keys) {
    const at = u.at.get(k);
    if (!at) continue;
    const y = Y - at.dy;
    const mult = m.info.get(k)?.girthMult ?? 1;
    for (const [a, b] of hIntervals(ringOf(m, k), y)) {
      width += (b - a) * mult;
      lines.push({
        pieceKey: k,
        pts: [
          [a, y],
          [b, y],
        ],
      });
    }
  }
  return { width, lines };
}

/** Lowest union y on the vertical X over `keys` (each piece may override its own local X). */
function lowestOnVertical(
  m: Model,
  u: Union,
  keys: string[],
  X: number,
  localX?: (k: string) => number | null,
) {
  let lo: { y: number; key: string; x: number } | null = null;
  for (const k of keys) {
    const at = u.at.get(k);
    if (!at) continue;
    const x0 = localX?.(k) ?? X - at.dx;
    // A landmark on a vertical edge (CB, CF) sits ON the contour: look a millimetre to each side.
    for (const x of [x0, x0 + 1, x0 - 1]) {
      const iv = vIntervals(ringOf(m, k), x);
      if (!iv.length || iv[iv.length - 1][1] - iv[0][0] < 1) continue;
      const y = iv[0][0] + at.dy;
      if (!lo || y < lo.y - 0.5) lo = { y, key: k, x };
      break;
    }
  }
  return lo;
}

/** Vertical measure line from union (X, yTop) down to yBot, cut into the pieces it crosses. */
function verticalLines(
  m: Model,
  u: Union,
  keys: string[],
  X: number,
  yTop: number,
  yBot: number,
  localX?: (k: string) => number | null,
): PomLine[] {
  const out: PomLine[] = [];
  for (const k of keys) {
    const at = u.at.get(k);
    if (!at) continue;
    const x0 = localX?.(k) ?? X - at.dx;
    const x = [x0, x0 + 1, x0 - 1].find((xx) => vIntervals(ringOf(m, k), xx).length) ?? x0;
    for (const [a, b] of vIntervals(ringOf(m, k), x)) {
      const lo = Math.max(a, yBot - at.dy);
      const hi = Math.min(b, yTop - at.dy);
      if (hi - lo > 0.5)
        out.push({
          pieceKey: k,
          pts: [
            [x, hi],
            [x, lo],
          ],
        });
    }
  }
  return out;
}

const nearEdge = (m: Model, key: string, p: Pt2, role: EdgeRole, tol = 3) =>
  edgesOf(m, key, role).some((e) => e.pts.some((q) => dist(q, p) <= tol));

/** Drill columns of a piece: x of ≥ 2 drills stacked vertically (button line). */
function drillColumns(m: Model, key: string): number[] {
  const ds = m.drills.get(key) ?? [];
  const cols: number[][] = [];
  for (const [x] of ds) {
    const c = cols.find((col) => Math.abs(col[0] - x) <= 3);
    if (c) c.push(x);
    else cols.push([x]);
  }
  return cols.filter((c) => c.length >= 2).map(mean);
}

// ── the program ────────────────────────────────────────────────────────────────────────────

type Ctx = {
  m: Model;
  conv: GirthConvention;
  out: Map<PomCode, Built>;
};

export function measureModel(m: Model, conv: GirthConvention): PomValue[] {
  const ctx: Ctx = { m, conv, out: new Map() };
  if (m.garment === 'top') measureTop(ctx);
  else measureBottom(ctx);
  return POM_DEFS.filter((d) => d.garment === m.garment).map((d) => ({
    code: d.code,
    name: d.name,
    method: d.method,
    ...(ctx.out.get(d.code) ?? notFound('no rule produced it')),
  }));
}

const usable = (m: Model, key: string) => {
  const i = m.info.get(key);
  return !!i && !i.lining && !i.layerOf;
};

function measureTop(ctx: Ctx) {
  const { m, conv, out } = ctx;
  const keys = [...m.geoms.keys()].filter((k) => usable(m, k));
  const body = keys.filter((k) => BODY_TOP.has(m.info.get(k)!.kind));
  const fronts = body.filter((k) => m.info.get(k)!.kind === 'front');
  const backs = body.filter((k) => ['back', 'yoke'].includes(m.info.get(k)!.kind));
  const reasonsBody: string[] = [];

  // Role-implied yoke seams the graph did not find.
  const extra: { a: EdgeId[]; b: EdgeId[] }[] = [];
  const yokes = body.filter((k) => m.info.get(k)!.kind === 'yoke');
  for (const y of yokes) {
    const ys = edgesOf(m, y, 'yoke-seam').map((e) => e.id);
    for (const b of body.filter((k) => m.info.get(k)!.kind === 'back')) {
      const bs = edgesOf(m, b, 'yoke-seam').map((e) => e.id);
      const sewn = m.seams.some(
        (s) =>
          (s.a.some((x) => ys.includes(x)) && s.b.some((x) => bs.includes(x))) ||
          (s.b.some((x) => ys.includes(x)) && s.a.some((x) => bs.includes(x))),
      );
      if (ys.length && bs.length && !sewn) extra.push({ a: ys, b: bs });
    }
  }
  const u = body.length
    ? layoutUnion(m, body, new Set<EdgeRole>(['side', 'panel', 'cb', 'cf', 'yoke-seam']), extra)
    : null;
  if (u && u.components.length > 1) {
    // Components not joined by any seam: stand them on the root's hem (approximate).
    const rootLow = Math.min(
      ...u.components[0].flatMap((k) => ringOf(m, k).map((p) => p[1] + u.at.get(k)!.dy)),
    );
    let xShift =
      Math.max(...u.components[0].flatMap((k) => ringOf(m, k).map((p) => p[0] + u.at.get(k)!.dx))) +
      50;
    for (const comp of u.components.slice(1)) {
      const low = Math.min(...comp.flatMap((k) => ringOf(m, k).map((p) => p[1] + u.at.get(k)!.dy)));
      const x0 = Math.min(...comp.flatMap((k) => ringOf(m, k).map((p) => p[0] + u.at.get(k)!.dx)));
      for (const k of comp) {
        const at = u.at.get(k)!;
        at.dy += rootLow - low;
        at.dx += xShift - x0;
      }
      xShift =
        Math.max(...comp.flatMap((k) => ringOf(m, k).map((p) => p[0] + u.at.get(k)!.dx))) + 50;
    }
    reasonsBody.push(
      `body panels in ${u.components.length} unjoined parts (${u.components.map((c) => c.join('+')).join(' | ')}) — stood on a common hem`,
    );
  }
  for (const a of u ? [...u.at.values()] : []) {
    if (a.via && a.levelErrMm > POM.alignRmsMm)
      reasonsBody.push(
        `${a.via}: ${a.partial ? 'partial / eased seam that trues up at no end' : 'its two ends disagree'} — levels across it unsure by ${a.levelErrMm.toFixed(0)} mm`,
      );
  }

  // CF offsets: from each front's CF edge to its button line (drills on the front or its placket).
  const cfOffsets: { key: string; mm: number; resolved: boolean; how: string }[] = [];
  for (const f of fronts) {
    const info = m.info.get(f)!;
    const cf = edgesOf(m, f, 'cf');
    if (!cf.length || !info.hand) continue;
    const ex = mean(cf.flatMap((e) => e.pts.map((p) => p[0])));
    const own = drillColumns(m, f)
      .filter((x) => Math.abs(x - ex) <= 80)
      .sort((a, b) => Math.abs(a - ex) - Math.abs(b - ex))[0];
    if (own != null) {
      cfOffsets.push({
        key: f,
        mm: -Math.abs(own - ex),
        resolved: true,
        how: `${f}: button line ${Math.abs(own - ex).toFixed(0)} mm inside the front edge`,
      });
      continue;
    }
    const plk = cf
      .flatMap((e) => partnersOf(m, e.id))
      .map((p) => p.piece)
      .find((k) => m.info.get(k)?.kind === 'placket');
    if (plk) {
      const att = (m.geoms.get(plk)?.edges ?? []).filter((e) => ok(m, e.id, 'strip-attach'));
      const ax = att.length ? mean(att.flatMap((e) => e.pts.map((p) => p[0]))) : null;
      const col =
        ax == null
          ? undefined
          : drillColumns(m, plk).sort((a, b) => Math.abs(a - ax) - Math.abs(b - ax))[0];
      if (ax != null && col != null) {
        cfOffsets.push({
          key: f,
          mm: Math.abs(col - ax),
          resolved: true,
          how: `${f}: button line on ${plk}, ${Math.abs(col - ax).toFixed(0)} mm beyond the front edge`,
        });
        continue;
      }
    }
    cfOffsets.push({
      key: f,
      mm: 0,
      resolved: false,
      how: `${f}: CF line not marked (no button drills) — measured to the front edge`,
    });
  }
  const cfSum = cfOffsets.reduce((s, c) => s + c.mm, 0);
  const cfReasons = cfOffsets.filter((c) => !c.resolved).map((c) => c.how);

  // Armhole bottom: top of the side seams.
  let ahb: { y: number; exact: boolean; marks: LandmarkPoint[]; detail: string[] } | null = null;
  if (u) {
    const tops: { y: number; mark: LandmarkPoint }[] = [];
    for (const s of m.seams) {
      if (s.kind === 'closure-not-seam') continue;
      const sideA = s.a.filter((id) => ok(m, id, 'side'));
      const sideB = s.b.filter((id) => ok(m, id, 'side'));
      if (!sideA.length || !sideB.length) continue;
      const ys: number[] = [];
      let mark: LandmarkPoint | null = null;
      for (const id of [...sideA, ...sideB]) {
        const k = pieceOf(id);
        if (!u.at.has(k)) continue;
        const e = m.edges.get(id)!;
        const h = highEnd(e);
        ys.push(h[1] + u.at.get(k)!.dy);
        mark ??= lp(
          'armhole-bottom',
          k,
          h,
          'exact',
          `top of the side seam ${sideA.join('+')}~${sideB.join('+')}`,
        );
      }
      if (ys.length && mark) tops.push({ y: mean(ys), mark });
    }
    if (tops.length) {
      const ys = tops.map((t) => t.y);
      ahb = {
        y: mean(ys),
        exact: true,
        marks: tops.map((t) => t.mark),
        detail:
          tops.length > 1 && Math.max(...ys) - Math.min(...ys) > POM.pairDiffMm
            ? [`side seam tops differ by ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} mm`]
            : [],
      };
    } else {
      const arm = body.flatMap((k) => edgesOf(m, k, 'armhole').map((e) => ({ k, p: lowEnd(e) })));
      if (arm.length) {
        const lo = arm.reduce((a, b) =>
          b.p[1] + u.at.get(b.k)!.dy < a.p[1] + u.at.get(a.k)!.dy ? b : a,
        );
        ahb = {
          y: lo.p[1] + u.at.get(lo.k)!.dy,
          exact: false,
          marks: [
            lp('armhole-bottom', lo.k, lo.p, 'approx', 'lowest armhole point (no side seam read)'),
          ],
          detail: [],
        };
      }
    }
  }

  // A girth needs the whole body: a front and a back, and both hands of a front cut in halves.
  const halves = (ks: string[]) => {
    const hands = new Set(ks.map((k) => m.info.get(k)!.hand));
    const folded = ks.some(
      (k) =>
        !m.info.get(k)!.hand &&
        (m.info.get(k)!.girthMult > 1 || mirrorErrorMm(m.geoms.get(k)!) <= SYM_MM),
    );
    return folded || (hands.has('L') && hands.has('R'));
  };
  const girthGap = !fronts.length
    ? 'no front piece is named — a girth of the back alone is not the garment'
    : !backs.length
      ? 'no back piece is named — a girth of the front alone is not the garment'
      : null;
  const folds = body.filter((k) => m.info.get(k)!.foldAssumed);
  if (folds.length)
    reasonsBody.push(
      `${folds.join(', ')} read as cut on the fold (unsewn centre edge, no twin; the card does not say FOLD)`,
    );
  if (!halves(fronts))
    reasonsBody.push(
      `only one front half is read (${fronts.join(', ')}) — the other was not recognised`,
    );
  // Chest.
  if (!u || !body.length)
    out.set('chest', notFound('no body panel is named (front / back / side / yoke)'));
  else if (girthGap) out.set('chest', notFound(girthGap));
  else if (!ahb)
    out.set('chest', notFound('armhole bottom not found: no side seam and no armhole edge read'));
  else {
    const Y = ahb.y - POM.inchMm;
    const { width, lines } = levelLines(m, u, body, Y);
    const reasons = [
      ...reasonsBody,
      ...cfReasons,
      ...(ahb.exact ? [] : ['armhole bottom read from the lowest armhole point']),
    ];
    out.set('chest', {
      ...girth(width + cfSum, conv),
      exactness: reasons.length ? 'approx' : 'exact',
      reason: reasons.join('; ') || undefined,
      detail: [
        ...ahb.detail,
        ...cfOffsets.filter((c) => c.resolved).map((c) => c.how),
        `panels at the level: ${lines.length}`,
      ],
      path: { landmarks: ahb.marks, edges: [], lines },
    });
    // Waist: narrowest girth between chest and hem, if the pattern is shaped there.
    const hemLow = Math.min(
      ...body.map((k) => Math.min(...ringOf(m, k).map((p) => p[1])) + u.at.get(k)!.dy),
    );
    const scan: { y: number; w: number }[] = [];
    for (let y = Y; y > hemLow + 40; y -= 5) scan.push({ y, w: levelLines(m, u, body, y).width });
    if (scan.length > 10) {
      const min = scan.reduce((a, b) => (b.w < a.w ? b : a));
      const i = scan.indexOf(min);
      const shaped =
        i > 3 &&
        i < scan.length - 4 &&
        scan[0].w - min.w >= 20 &&
        scan[scan.length - 1].w - min.w >= 10;
      if (shaped) {
        const wl = levelLines(m, u, body, min.y);
        out.set('waist', {
          ...girth(min.w + cfSum, conv),
          exactness: 'approx',
          reason: `narrowest level, ${(ahb.y - min.y).toFixed(0)} mm below the armhole bottom (no waist mark in the pattern)`,
          path: { landmarks: [], edges: [], lines: wl.lines },
        });
      } else
        out.set(
          'waist',
          notFound('the body is not shaped between chest and hem — no waist level to read'),
        );
    }
  }

  // Hem sweep.
  if (girthGap) {
    out.set('hem', notFound(girthGap));
    out.set('waist', notFound(girthGap));
  } else if (u && body.length) {
    const hemEdges = body.flatMap((k) => edgesOf(m, k, 'hem').map((e) => ({ k, e })));
    const missing = body.filter(
      (k) => m.info.get(k)!.kind !== 'yoke' && !edgesOf(m, k, 'hem').length,
    );
    if (!hemEdges.length) out.set('hem', notFound('no hem edge read on the body panels'));
    else {
      const full =
        hemEdges.reduce((s, { k, e }) => s + e.lenMm * (m.info.get(k)!.girthMult ?? 1), 0) + cfSum;
      const chord =
        hemEdges.reduce((s, { k, e }) => s + e.chordMm * (m.info.get(k)!.girthMult ?? 1), 0) +
        cfSum;
      const reasons = [
        ...cfReasons,
        ...reasonsBody.filter((r) => r.startsWith('only one front')),
        ...(missing.length ? [`no hem edge on ${missing.join(', ')}`] : []),
      ];
      out.set('hem', {
        ...girth(full, conv),
        exactness: reasons.length ? 'approx' : 'exact',
        reason: reasons.join('; ') || undefined,
        detail: [`along the curve ${full.toFixed(0)} mm, chords ${chord.toFixed(0)} mm (full)`],
        path: {
          landmarks: [],
          edges: hemEdges.map((x) => x.e.id),
          lines: hemEdges.map(({ k, e }) => ({ pieceKey: k, pts: e.pts })),
        },
      });
    }
  } else out.set('hem', notFound('no body panel is named'));

  // HPS on the fronts.
  type Hps = { key: string; pt: Pt2; exact: boolean; from: string; shoulder: Edge };
  const hpsOn = (k: string): Hps | null => {
    const sh = edgesOf(m, k, 'shoulder');
    if (!sh.length) return null;
    const s = sh.sort((a, b) => highEnd(b)[1] - highEnd(a)[1])[0];
    const h = highEnd(s);
    const neck = edgesOf(m, k, 'neckline').find(
      (e) => dist(first(e), h) <= 15 || dist(last(e), h) <= 15,
    );
    return neck
      ? {
          key: k,
          pt: h,
          exact: true,
          from: `corner ${s.id} shoulder ∩ ${neck.id} neckline`,
          shoulder: s,
        }
      : {
          key: k,
          pt: h,
          exact: false,
          from: `high end of shoulder ${s.id} (no neckline next to it)`,
          shoulder: s,
        };
  };
  const frontHps = fronts.map(hpsOn).filter((x): x is Hps => !!x);
  if (!u || !frontHps.length)
    out.set(
      'length-hps',
      notFound(fronts.length ? 'no shoulder edge read on the fronts' : 'no front piece is named'),
    );
  else {
    const vals: number[] = [];
    const lines: PomLine[] = [];
    const marks: LandmarkPoint[] = [];
    let exact = true;
    const det: string[] = [];
    for (const h of frontHps) {
      const at = u.at.get(h.key)!;
      const X = h.pt[0] + at.dx;
      const lo = lowestOnVertical(m, u, fronts, X);
      if (!lo) continue;
      const v = h.pt[1] + at.dy - lo.y;
      vals.push(v);
      det.push(`${h.key}: ${v.toFixed(1)} mm`);
      lines.push(...verticalLines(m, u, fronts, X, h.pt[1] + at.dy, lo.y));
      marks.push(lp(`hps-${h.key}`, h.key, h.pt, h.exact ? 'exact' : 'approx', h.from));
      if (!h.exact) exact = false;
      if (!nearEdge(m, lo.key, [lo.x, lo.y - u.at.get(lo.key)!.dy], 'hem')) {
        exact = false;
        det.push(`${h.key}: the vertical from HPS lands off the hem edge`);
      }
    }
    if (!vals.length) out.set('length-hps', notFound('the vertical from HPS meets no front piece'));
    else
      out.set('length-hps', {
        valueMm: mean(vals),
        exactness: exact ? 'exact' : 'approx',
        reason: exact ? undefined : 'HPS or hem read approximately (see detail)',
        detail: det,
        path: { landmarks: marks, edges: frontHps.map((h) => h.shoulder.id), lines },
      });
  }

  // Back: shoulders, HPS, CB neck point.
  const backSh = backs.flatMap((k) => edgesOf(m, k, 'shoulder').map((e) => ({ k, e })));
  const backHps = backSh.map(({ k, e }) => ({ k, p: highEnd(e), sp: lowEnd(e), e }));
  type Cb = { key: string; pt: Pt2; exact: boolean; from: string; centreX: number | null };
  let cbNeck: Cb | null = null;
  for (const k of backs) {
    const cb = edgesOf(m, k, 'cb');
    const neck = edgesOf(m, k, 'neckline');
    if (!neck.length) continue;
    if (cb.length) {
      const top = cb.map(highEnd).sort((a, b) => b[1] - a[1])[0];
      const touches = neck.some((e) => dist(first(e), top) <= 15 || dist(last(e), top) <= 15);
      cbNeck = {
        key: k,
        pt: top,
        exact: touches,
        from: `top of the CB edge${touches ? ' at the neckline' : ' (no neckline next to it)'}`,
        centreX: null,
      };
      break;
    }
    const g = m.geoms.get(k)!;
    if (!m.info.get(k)!.hand && mirrorErrorMm(g) <= SYM_MM) {
      const bb = bboxOf(g.rs);
      const cx = (bb.x0 + bb.x1) / 2;
      const iv = vIntervals(g.rs, cx);
      if (iv.length) {
        cbNeck = {
          key: k,
          pt: [cx, iv[iv.length - 1][1]],
          exact: true,
          from: `neckline on the symmetry axis of ${k}`,
          centreX: cx,
        };
        break;
      }
    }
  }
  // CB length.
  if (!u || !cbNeck)
    out.set(
      'length-cb',
      notFound(
        backs.length
          ? 'CB neck point not found (no CB edge, no symmetric back with a neckline)'
          : 'no back piece is named',
      ),
    );
  else {
    const at = u.at.get(cbNeck.key)!;
    const X = cbNeck.pt[0] + at.dx;
    // A symmetric back measures down its own axis (union x across a pleated yoke seam is not exact).
    const localX = (k: string) => {
      const g = m.geoms.get(k)!;
      if (!m.info.get(k)!.hand && mirrorErrorMm(g) <= SYM_MM) {
        const bb = bboxOf(g.rs);
        return (bb.x0 + bb.x1) / 2;
      }
      return null;
    };
    const lo = lowestOnVertical(m, u, backs, X, localX);
    if (!lo) out.set('length-cb', notFound('the CB vertical meets no back piece'));
    else {
      const onHem = nearEdge(m, lo.key, [lo.x, lo.y - u.at.get(lo.key)!.dy], 'hem');
      const ex = cbNeck.exact && onHem;
      out.set('length-cb', {
        valueMm: cbNeck.pt[1] + at.dy - lo.y,
        exactness: ex ? 'exact' : 'approx',
        reason: ex
          ? undefined
          : [cbNeck.exact ? '' : cbNeck.from, onHem ? '' : 'the CB vertical lands off the hem edge']
              .filter(Boolean)
              .join('; '),
        path: {
          landmarks: [
            lp('cb-neck', cbNeck.key, cbNeck.pt, cbNeck.exact ? 'exact' : 'approx', cbNeck.from),
          ],
          edges: [],
          lines: verticalLines(m, u, backs, X, cbNeck.pt[1] + at.dy, lo.y, localX),
        },
      });
    }
  }

  // Across shoulder + neck width (across the back).
  if (!u || backHps.length === 0) {
    out.set('across-shoulder', notFound('no shoulder edge read on the back'));
    out.set('neck-width', notFound('no shoulder edge read on the back'));
  } else {
    const U = (k: string, p: Pt2) => toUnion(u, k, p);
    const pair = <T extends { k: string }>(xs: T[], pt: (x: T) => Pt2) => {
      if (xs.length < 2) return null;
      let best: [T, T] | null = null;
      for (const a of xs)
        for (const b of xs)
          if (
            a !== b &&
            (!best ||
              dist(U(a.k, pt(a)), U(b.k, pt(b))) >
                dist(U(best[0].k, pt(best[0])), U(best[1].k, pt(best[1]))))
          )
            best = [a, b];
      return best;
    };
    const sameComp = (a: string, b: string) =>
      u.components.some((c) => c.includes(a) && c.includes(b));
    const sp = pair(backHps, (x) => x.sp);
    const shMean = mean(backHps.map((x) => x.e.lenMm));
    const implausible = sp && dist(U(sp[0].k, sp[0].sp), U(sp[1].k, sp[1].sp)) < 2 * shMean;
    if (sp && implausible) {
      const why = `the back halves carrying the two shoulders are not joined reliably (shoulder points ${dist(U(sp[0].k, sp[0].sp), U(sp[1].k, sp[1].sp)).toFixed(0)} mm apart, less than two shoulders)`;
      out.set('across-shoulder', notFound(why));
      out.set('neck-width', notFound(why));
    } else if (sp) {
      const [a, b] = sp;
      const exact = a.k === b.k || (sameComp(a.k, b.k) && !reasonsBody.length);
      out.set('across-shoulder', {
        valueMm: dist(U(a.k, a.sp), U(b.k, b.sp)),
        exactness: exact ? 'exact' : 'approx',
        reason: exact
          ? undefined
          : 'the two shoulder points sit on pieces joined only approximately',
        path: {
          landmarks: [
            lp('sp-1', a.k, a.sp, 'exact', `low end of shoulder ${a.e.id}`),
            lp('sp-2', b.k, b.sp, 'exact', `low end of shoulder ${b.e.id}`),
          ],
          edges: [a.e.id, b.e.id],
          lines:
            a.k === b.k
              ? [{ pieceKey: a.k, pts: [a.sp, b.sp] }]
              : [{ pieceKey: a.k, pts: [a.sp, toLocal(u, a.k, U(b.k, b.sp))] }],
        },
      });
      const hp = [a, b].map((x) => ({
        ...x,
        neck: edgesOf(m, x.k, 'neckline').some(
          (e) => dist(first(e), x.p) <= 15 || dist(last(e), x.p) <= 15,
        ),
      }));
      const ex2 = exact && hp.every((x) => x.neck);
      out.set('neck-width', {
        valueMm: dist(U(a.k, a.p), U(b.k, b.p)),
        exactness: ex2 ? 'exact' : 'approx',
        reason: ex2
          ? undefined
          : 'back HPS read without a neckline next to the shoulder, or across an approximate join',
        path: {
          landmarks: [
            lp('hps-back-1', a.k, a.p, ex2 ? 'exact' : 'approx', `high end of shoulder ${a.e.id}`),
            lp('hps-back-2', b.k, b.p, ex2 ? 'exact' : 'approx', `high end of shoulder ${b.e.id}`),
          ],
          edges: [],
          lines:
            a.k === b.k
              ? [{ pieceKey: a.k, pts: [a.p, b.p] }]
              : [{ pieceKey: a.k, pts: [a.p, toLocal(u, a.k, U(b.k, b.p))] }],
        },
      });
    } else {
      const one = backHps[0];
      const g = m.geoms.get(one.k)!;
      const bb = bboxOf(g.rs);
      const cx = cbNeck?.centreX ?? (bb.x0 + bb.x1) / 2;
      out.set('across-shoulder', {
        valueMm: 2 * Math.abs(one.sp[0] - cx),
        exactness: 'approx',
        reason: 'one shoulder point on the back; doubled across the centre line',
        path: {
          landmarks: [lp('sp-1', one.k, one.sp, 'approx', `low end of shoulder ${one.e.id}`)],
          edges: [one.e.id],
          lines: [{ pieceKey: one.k, pts: [one.sp, [2 * cx - one.sp[0], one.sp[1]]] }],
        },
      });
      out.set('neck-width', {
        valueMm: 2 * Math.abs(one.p[0] - cx),
        exactness: 'approx',
        reason: 'one back HPS; doubled across the centre line',
        path: {
          landmarks: [lp('hps-back-1', one.k, one.p, 'approx', `high end of shoulder ${one.e.id}`)],
          edges: [],
          lines: [{ pieceKey: one.k, pts: [one.p, [2 * cx - one.p[0], one.p[1]]] }],
        },
      });
    }
  }

  // Shoulder length.
  const frontSh = frontHps.map((h) => h.shoulder);
  const shAll = frontSh.length ? frontSh : backSh.map((x) => x.e);
  if (!shAll.length) out.set('shoulder', notFound('no shoulder edge read'));
  else {
    const v = mean(shAll.map((e) => e.lenMm));
    const det = [
      ...frontSh.map((e) => `front ${e.id} ${e.lenMm.toFixed(1)}`),
      ...backSh.map((x) => `back ${x.e.id} ${x.e.lenMm.toFixed(1)}`),
    ];
    out.set('shoulder', {
      valueMm: v,
      exactness: 'exact',
      reason: frontSh.length ? undefined : 'read on the back (no front shoulder)',
      detail: det,
      path: {
        landmarks: [],
        edges: shAll.map((e) => e.id),
        lines: shAll.map((e) => ({ pieceKey: e.pieceKey, pts: e.pts })),
      },
    });
  }

  // Neck drops.
  if (!frontHps.length) out.set('neck-drop-front', notFound('no front HPS'));
  else {
    const vals: { v: number; h: Hps; low: Pt2 }[] = [];
    for (const h of frontHps) {
      const neck = edgesOf(m, h.key, 'neckline');
      if (!neck.length) continue;
      const low = neck.flatMap((e) => e.pts).reduce((a, b) => (b[1] < a[1] ? b : a));
      vals.push({ v: h.pt[1] - low[1], h, low });
    }
    if (!vals.length) out.set('neck-drop-front', notFound('no neckline read on the fronts'));
    else
      out.set('neck-drop-front', {
        valueMm: mean(vals.map((x) => x.v)),
        exactness: vals.every((x) => x.h.exact) ? 'exact' : 'approx',
        detail: vals.map((x) => `${x.h.key}: ${x.v.toFixed(1)}`),
        path: {
          landmarks: vals.map((x) =>
            lp(`cf-neck-${x.h.key}`, x.h.key, x.low, 'exact', 'lowest point of the front neckline'),
          ),
          edges: [],
          lines: vals.map((x) => ({ pieceKey: x.h.key, pts: [[x.low[0], x.h.pt[1]], x.low] })),
        },
      });
  }
  if (!u || !cbNeck || !backHps.length)
    out.set('neck-drop-back', notFound(!cbNeck ? 'CB neck point not found' : 'no back HPS'));
  else {
    const hy = mean(backHps.map((x) => x.p[1] + u.at.get(x.k)!.dy));
    const cy = cbNeck.pt[1] + u.at.get(cbNeck.key)!.dy;
    out.set('neck-drop-back', {
      valueMm: hy - cy,
      exactness: cbNeck.exact ? 'exact' : 'approx',
      path: {
        landmarks: [
          lp('cb-neck', cbNeck.key, cbNeck.pt, cbNeck.exact ? 'exact' : 'approx', cbNeck.from),
        ],
        edges: [],
        lines: [
          { pieceKey: cbNeck.key, pts: [[cbNeck.pt[0], hy - u.at.get(cbNeck.key)!.dy], cbNeck.pt] },
        ],
      },
    });
  }

  // Armhole (curved, one side).
  const arm = body.flatMap((k) => edgesOf(m, k, 'armhole').map((e) => ({ k, e })));
  if (!arm.length) out.set('armhole', notFound('no armhole edge read'));
  else {
    const total = arm.reduce((s, { k, e }) => s + e.lenMm * (m.info.get(k)!.girthMult ?? 1), 0);
    const onF = arm.some(({ k }) => m.info.get(k)!.kind === 'front');
    const onB = arm.some(({ k }) => ['back', 'yoke'].includes(m.info.get(k)!.kind));
    const ex = onF && onB;
    out.set('armhole', {
      valueMm: total / 2,
      exactness: ex ? 'exact' : 'approx',
      reason: ex
        ? 'both armholes summed, halved (one side)'
        : `armhole read only on the ${onF ? 'front' : 'back'}`,
      path: {
        landmarks: [],
        edges: arm.map((x) => x.e.id),
        lines: arm.map(({ k, e }) => ({ pieceKey: k, pts: e.pts })),
      },
    });
  }

  measureSleeves(ctx, keys);
  measureCollar(ctx, keys);
}

const toLocal = (u: Union, k: string, p: Pt2): Pt2 => {
  const t = u.at.get(k) ?? { dx: 0, dy: 0 };
  return [p[0] - t.dx, p[1] - t.dy];
};

function measureSleeves(ctx: Ctx, keys: string[]) {
  const { m, conv, out } = ctx;
  const sleeves = keys.filter((k) => m.info.get(k)!.kind === 'sleeve');
  if (!sleeves.length) {
    for (const c of ['sleeve-length', 'underarm', 'bicep', 'sleeve-opening'] as PomCode[])
      out.set(c, notFound('no sleeve piece is named'));
    return;
  }
  const u = layoutUnion(m, sleeves, new Set<EdgeRole>(['sleeve-seam', 'underarm']));
  const cuffs = keys.filter((k) => m.info.get(k)!.kind === 'cuff');
  type R = {
    len?: number;
    ua?: { v: number; approx: boolean; ids: EdgeId[] };
    bicep?: number;
    open?: number;
    lines: Record<string, PomLine[]>;
    marks: LandmarkPoint[];
    group: string;
  };
  const res: R[] = [];
  for (const comp of u.components) {
    const cap = comp.flatMap((k) => edgesOf(m, k, 'cap').map((e) => ({ k, e })));
    const r: R = {
      lines: { len: [], bicep: [], open: [], ua: [] },
      marks: [],
      group: comp.join('+'),
    };
    if (cap.length) {
      const apex = cap
        .flatMap(({ k, e }) => e.pts.map((p) => ({ k, p, y: p[1] + u.at.get(k)!.dy })))
        .reduce((a, b) => (b.y > a.y ? b : a));
      const X = apex.p[0] + u.at.get(apex.k)!.dx;
      const lo = lowestOnVertical(m, u, comp, X);
      if (lo) {
        r.len = apex.y - lo.y;
        r.lines.len = verticalLines(m, u, comp, X, apex.y, lo.y);
        r.marks.push(
          lp(`cap-apex-${comp[0]}`, apex.k, apex.p, 'exact', 'highest point of the cap'),
        );
      }
      const capLow = Math.min(
        ...cap.flatMap(({ k, e }) => [first(e), last(e)].map((p) => p[1] + u.at.get(k)!.dy)),
      );
      const lvl = levelLines(m, u, comp, capLow - POM.inchMm);
      r.bicep = lvl.width;
      r.lines.bicep = lvl.lines;
    }
    const wr = comp.flatMap((k) => edgesOf(m, k, 'wrist').map((e) => ({ k, e })));
    if (wr.length) {
      r.open = wr.reduce((s, { k, e }) => s + e.lenMm * (m.info.get(k)!.girthMult ?? 1), 0);
      r.lines.open = wr.map(({ k, e }) => ({ pieceKey: k, pts: e.pts }));
    }
    const ua = comp.flatMap((k) => edgesOf(m, k, 'underarm'));
    const ss = comp.flatMap((k) => edgesOf(m, k, 'sleeve-seam'));
    if (ua.length)
      r.ua = { v: mean(ua.map((e) => e.lenMm)), approx: false, ids: ua.map((e) => e.id) };
    else if (ss.length) {
      const s = ss.sort((a, b) => a.lenMm - b.lenMm)[0];
      r.ua = { v: s.lenMm, approx: true, ids: [s.id] };
    }
    if (r.ua)
      r.lines.ua = r.ua.ids.map((id) => ({ pieceKey: pieceOf(id), pts: m.edges.get(id)!.pts }));
    res.push(r);
  }
  const put = (
    code: PomCode,
    get: (r: R) => number | undefined,
    isGirth: boolean,
    lineKey: string,
    approxWhy?: (rs: R[]) => string | null,
  ) => {
    const rs = res.filter((r) => get(r) != null);
    if (!rs.length) {
      out.set(
        code,
        notFound(
          code === 'underarm'
            ? 'no underarm / sleeve seam edge read'
            : 'no cap / wrist edge read on the sleeve',
        ),
      );
      return;
    }
    const vs = rs.map((r) => get(r)!);
    const v = mean(vs);
    const det = rs.length > 1 ? rs.map((r, i) => `${r.group}: ${vs[i].toFixed(1)}`) : [];
    const spread = Math.max(...vs) - Math.min(...vs);
    if (spread > POM.pairDiffMm) det.push(`sleeves differ by ${spread.toFixed(1)} mm`);
    const why = approxWhy?.(rs) ?? null;
    out.set(code, {
      ...(isGirth ? girth(v, conv) : { valueMm: v }),
      exactness: why ? 'approx' : 'exact',
      reason: why ?? undefined,
      detail: det,
      path: {
        landmarks: rs.flatMap((r) => r.marks),
        edges: [],
        lines: rs.flatMap((r) => r.lines[lineKey]),
      },
    });
  };
  const cuffH = cuffs.length ? Math.min(...cuffs.map((k) => bboxOf(ringOf(m, k)).h)) : 0;
  put(
    'sleeve-length',
    (r) => (r.len == null ? undefined : r.len + cuffH),
    false,
    'len',
    () =>
      cuffs.length
        ? `cuff ${cuffs[0]} added at its drawn height (${cuffH.toFixed(0)} mm; fold not known)`
        : null,
  );
  put(
    'underarm',
    (r) => r.ua?.v,
    false,
    'ua',
    (rs) =>
      rs.some((r) => r.ua?.approx)
        ? 'two-piece sleeve: the shorter sleeve seam read as the underarm'
        : null,
  );
  put(
    'bicep',
    (r) => r.bicep,
    true,
    'bicep',
    (rs) =>
      rs.some((r) => (r.group.match(/\+/g) ?? []).length > 0) &&
      [...u.at.values()].some((a) => a.levelErrMm > POM.alignRmsMm)
        ? 'sleeve panels joined approximately'
        : null,
  );
  put('sleeve-opening', (r) => r.open, true, 'open');
}

function measureCollar(ctx: Ctx, keys: string[]) {
  const { m, out } = ctx;
  const stand = keys.find((k) => m.info.get(k)!.kind === 'stand');
  const collar = keys.find((k) => m.info.get(k)!.kind === 'collar');
  const neckOf = (k: string, role: EdgeRole) => edgesOf(m, k, role);
  if (stand && neckOf(stand, 'stand-neck').length) {
    const es = neckOf(stand, 'stand-neck');
    out.set('collar-length', {
      valueMm: es.reduce((s, e) => s + e.lenMm, 0),
      exactness: 'exact',
      reason: `neck edge of the stand ${stand}`,
      path: {
        landmarks: [],
        edges: es.map((e) => e.id),
        lines: es.map((e) => ({ pieceKey: stand, pts: e.pts })),
      },
    });
  } else if (collar && neckOf(collar, 'collar-neck').length) {
    const es = neckOf(collar, 'collar-neck');
    out.set('collar-length', {
      valueMm: es.reduce((s, e) => s + e.lenMm, 0),
      exactness: 'exact',
      reason: `neck edge of the collar ${collar} (no stand)`,
      path: {
        landmarks: [],
        edges: es.map((e) => e.id),
        lines: es.map((e) => ({ pieceKey: collar, pts: e.pts })),
      },
    });
  } else
    out.set(
      'collar-length',
      notFound(
        stand || collar
          ? 'the neck edge of the collar was not read'
          : 'no collar or stand is named',
      ),
    );
  const hk = stand ?? collar;
  if (hk) {
    const g = m.geoms.get(hk)!;
    const bb = bboxOf(g.rs);
    const cx = (bb.x0 + bb.x1) / 2;
    const iv = vIntervals(g.rs, cx);
    if (iv.length) {
      const lo = iv[0][0];
      const hi = iv[iv.length - 1][1];
      out.set('stand-height', {
        valueMm: hi - lo,
        exactness: stand ? 'exact' : 'approx',
        reason: stand ? undefined : "no stand: the collar's height at its centre",
        path: {
          landmarks: [],
          edges: [],
          lines: [
            {
              pieceKey: hk,
              pts: [
                [cx, hi],
                [cx, lo],
              ],
            },
          ],
        },
      });
    }
  } else out.set('stand-height', notFound('no collar or stand is named'));
  if (collar) {
    const ends = edgesOf(m, collar, 'collar-end');
    if (ends.length)
      out.set('collar-point', {
        valueMm: mean(ends.map((e) => e.lenMm)),
        exactness: 'exact',
        detail: ends.map((e) => `${e.id} ${e.lenMm.toFixed(1)}`),
        path: {
          landmarks: [],
          edges: ends.map((e) => e.id),
          lines: ends.map((e) => ({ pieceKey: collar, pts: e.pts })),
        },
      });
    else out.set('collar-point', notFound('collar end edges not read'));
  } else out.set('collar-point', notFound('no collar is named'));
}

// ── bottoms ────────────────────────────────────────────────────────────────────────────────

function measureBottom(ctx: Ctx) {
  const { m, conv, out } = ctx;
  const keys = [...m.geoms.keys()].filter((k) => usable(m, k));
  const legs = keys.filter((k) => LEG.has(m.info.get(k)!.kind));
  const fr = legs.filter((k) => m.info.get(k)!.kind === 'leg-front');
  const bk = legs.filter((k) => m.info.get(k)!.kind === 'leg-back');
  const all: PomCode[] = [
    'waist',
    'hip',
    'front-rise',
    'back-rise',
    'inseam',
    'outseam',
    'thigh',
    'knee',
    'leg-opening',
  ];
  if (!legs.length) {
    for (const c of all) out.set(c, notFound('no leg panel is named (front / back)'));
    return;
  }
  const bothSides = fr.length > 0 && bk.length > 0;
  const missing = bothSides
    ? null
    : `only ${fr.length ? 'front' : 'back'} leg pieces are named — no ${fr.length ? 'back' : 'front'}`;
  const multOf = (k: string) => {
    const i = m.info.get(k)!;
    return i.girthMult > 1 ? i.girthMult : i.hand ? 1 : 2;
  };
  const handNullMult = legs.some((k) => !m.info.get(k)!.hand && m.info.get(k)!.girthMult === 1);

  // Waist (whole garment): the waistband's length when there is one (the finished waist — the legs
  // may be pleated or gathered into it), else the legs' waist seam.
  const wEdges = legs.flatMap((k) => edgesOf(m, k, 'waist').map((e) => ({ k, e })));
  const legWaist = wEdges.reduce((s, { k, e }) => s + e.lenMm * multOf(k), 0);
  const bandsAll = keys.filter((k) => m.info.get(k)!.kind === 'waistband');
  const longest = (k: string) => Math.max(...m.geoms.get(k)!.edges.map((e) => e.lenMm));
  const bandMax = Math.max(0, ...bandsAll.map(longest));
  // A «belt» piece a fraction of the band's length is a belt loop, not the band.
  const bands = bandsAll.filter((k) => longest(k) >= 0.3 * bandMax);
  // The waist sits at the band's TOP edge: of its two long edges the shorter one (a contoured band
  // is longer where it is sewn on; a straight band has two equal edges).
  const bandEdge = (k: string) =>
    [...m.geoms.get(k)!.edges]
      .sort((a, b) => b.lenMm - a.lenMm)
      .slice(0, 2)
      .sort((a, b) => a.lenMm - b.lenMm)[0];
  if (bands.length && !missing) {
    const es = bands.map((k) => ({ k, e: bandEdge(k) })).filter((x) => !!x.e);
    const full = es.reduce((s, { k, e }) => s + e.lenMm * (m.info.get(k)!.girthMult ?? 1), 0);
    const halvesOfBand = bands.length === 2 && bands.every((k) => m.info.get(k)!.hand);
    const diff = halvesOfBand ? Math.abs(es[0].e.lenMm - es[1].e.lenMm) : 0;
    out.set('waist', {
      ...girth(full, conv),
      exactness: diff > 10 ? 'approx' : 'exact',
      reason:
        diff > 10
          ? `waistband halves differ by ${diff.toFixed(0)} mm (fly extension / overlap included)`
          : `top edge of the waistband ${bands.join(' + ')} (finished waist)`,
      detail: wEdges.length
        ? [
            `legs' waist seam ${legWaist.toFixed(0)} mm full${Math.abs(legWaist - full) > 20 ? ` — ${(legWaist - full).toFixed(0)} mm eased, pleated or gathered into the band` : ''}`,
          ]
        : [],
      path: {
        landmarks: [],
        edges: es.map((x) => x.e.id),
        lines: es.map(({ k, e }) => ({ pieceKey: k, pts: e.pts })),
      },
    });
  } else if (!wEdges.length) out.set('waist', notFound('no waist edge read on the legs'));
  else {
    const full = wEdges.reduce((s, { k, e }) => s + e.lenMm * multOf(k), 0);
    const reasons = [
      missing,
      handNullMult ? 'a leg piece without a hand counted twice (cut as a pair assumed)' : null,
    ].filter(Boolean) as string[];
    out.set(
      'waist',
      missing
        ? notFound(missing)
        : {
            ...girth(full, conv),
            exactness: reasons.length ? 'approx' : 'exact',
            reason: reasons.join('; ') || 'at the waist seam (waistband not added)',
            path: {
              landmarks: [],
              edges: wEdges.map((x) => x.e.id),
              lines: wEdges.map(({ k, e }) => ({ pieceKey: k, pts: e.pts })),
            },
          },
    );
  }
  const edgeLen = (code: PomCode, ks: string[], role: EdgeRole, why: string) => {
    const per = ks.map((k) => ({ k, es: edgesOf(m, k, role) })).filter((x) => x.es.length);
    if (!per.length) {
      out.set(code, notFound(ks.length ? `no ${role} edge read` : why));
      return null;
    }
    const vs = per.map((x) => x.es.reduce((s, e) => s + e.lenMm, 0));
    const v = mean(vs);
    const spread = Math.max(...vs) - Math.min(...vs);
    out.set(code, {
      valueMm: v,
      exactness: 'exact',
      reason:
        code.includes('rise') || code === 'outseam'
          ? 'to the waist seam (waistband not added)'
          : undefined,
      detail: [
        ...per.map((x, i) => `${x.k}: ${vs[i].toFixed(1)}`),
        ...(spread > 5 ? [`pieces differ by ${spread.toFixed(1)} mm (ease?)`] : []),
      ],
      path: {
        landmarks: [],
        edges: per.flatMap((x) => x.es.map((e) => e.id)),
        lines: per.flatMap((x) => x.es.map((e) => ({ pieceKey: x.k, pts: e.pts }))),
      },
    });
    return v;
  };
  edgeLen('front-rise', fr, 'rise', 'no front leg piece is named');
  edgeLen('back-rise', bk, 'rise', 'no back leg piece is named');
  const inseam = edgeLen('inseam', legs, 'inseam', '');
  edgeLen('outseam', legs, 'outseam', '');

  // Per leg: front + back of one hand (hand-less pieces form one leg).
  const hands = [...new Set(legs.map((k) => m.info.get(k)!.hand ?? '-'))];
  const legGroups = hands.map((h) => legs.filter((k) => (m.info.get(k)!.hand ?? '-') === h));
  type LegR = {
    thigh?: number;
    knee?: number;
    open?: number;
    hipBest?: number;
    lines: Record<string, PomLine[]>;
    marks: LandmarkPoint[];
    ok: boolean;
  };
  const lr: LegR[] = [];
  for (const g of legGroups) {
    const extra: { a: EdgeId[]; b: EdgeId[] }[] = [];
    for (const role of ['inseam', 'outseam'] as EdgeRole[]) {
      const f = g
        .filter((k) => fr.includes(k))
        .flatMap((k) => edgesOf(m, k, role).map((e) => e.id));
      const b = g
        .filter((k) => bk.includes(k))
        .flatMap((k) => edgesOf(m, k, role).map((e) => e.id));
      const sewn = m.seams.some(
        (s) =>
          s.a.some((x) => f.includes(x) || b.includes(x)) &&
          s.b.some((x) => f.includes(x) || b.includes(x)),
      );
      if (f.length === 1 && b.length === 1 && !sewn) extra.push({ a: f, b });
    }
    const u = layoutUnion(m, g, new Set<EdgeRole>(['inseam', 'outseam']), extra);
    const r: LegR = {
      lines: { thigh: [], knee: [], open: [], hip: [] },
      marks: [],
      ok:
        u.components.length === 1 && g.some((k) => fr.includes(k)) && g.some((k) => bk.includes(k)),
    };
    const crotch = g.flatMap((k) => edgesOf(m, k, 'rise').map((e) => ({ k, p: lowEnd(e) })));
    if (crotch.length && r.ok) {
      const cy = mean(crotch.map((c) => c.p[1] + u.at.get(c.k)!.dy));
      r.marks.push(
        ...crotch.map((c) => lp(`crotch-${c.k}`, c.k, c.p, 'exact', 'low end of the rise')),
      );
      const t = levelLines(m, u, g, cy - POM.inchMm);
      r.thigh = t.width;
      r.lines.thigh = t.lines;
      if (inseam) {
        const kn = levelLines(m, u, g, cy - inseam / 2);
        r.knee = kn.width;
        r.lines.knee = kn.lines;
      }
      const hip = levelLines(m, u, g, cy + SEAT_MM);
      if (hip.width > 0) {
        r.hipBest = hip.width;
        r.lines.hip = hip.lines;
      }
    }
    const hem = g.flatMap((k) => edgesOf(m, k, 'leg-hem').map((e) => ({ k, e })));
    if (hem.length && r.ok) {
      r.open = hem.reduce((s, { e }) => s + e.lenMm, 0);
      r.lines.open = hem.map(({ k, e }) => ({ pieceKey: k, pts: e.pts }));
    }
    lr.push(r);
  }
  const put = (
    code: PomCode,
    get: (r: LegR) => number | undefined,
    lineKey: string,
    approx?: string,
  ) => {
    const rs = lr.filter((r) => get(r) != null);
    if (!rs.length) {
      out.set(
        code,
        notFound(
          missing ??
            (lr.some((r) => !r.ok)
              ? 'front and back of a leg are not joined by an inseam / outseam'
              : 'crotch point (rise) not read'),
        ),
      );
      return;
    }
    const v = mean(rs.map((r) => get(r)!));
    out.set(code, {
      ...girth(v, conv),
      exactness: approx ? 'approx' : 'exact',
      reason: approx,
      path: {
        landmarks: rs.flatMap((r) => r.marks),
        edges: [],
        lines: rs.flatMap((r) => r.lines[lineKey]),
      },
    });
  };
  put('thigh', (r) => r.thigh, 'thigh');
  put('knee', (r) => r.knee, 'knee', 'knee level taken at half the inseam below the crotch');
  put('leg-opening', (r) => r.open, 'open');
  // Hip: both legs' widest levels summed.
  const hips = lr.filter((r) => r.hipBest != null);
  if (!hips.length) out.set('hip', notFound(missing ?? 'crotch or waist level not read'));
  else {
    const perLeg = mean(hips.map((r) => r.hipBest!));
    const full =
      legGroups.length >= 2
        ? hips.reduce((s, r) => s + r.hipBest!, 0) * (legGroups.length / hips.length)
        : perLeg * 2;
    out.set('hip', {
      ...girth(full, conv),
      exactness: 'approx',
      reason: 'seat level 3" (76 mm) above the crotch point — the pattern carries no hip mark',
      path: { landmarks: [], edges: [], lines: hips.flatMap((r) => r.lines.hip) },
    });
  }
}
