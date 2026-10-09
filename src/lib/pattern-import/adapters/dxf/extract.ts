// F8 — DXF → canonical IR, losslessly, with provenance on every path and text.
//
// Units: everything leaves here in MILLIMETRES, y-up (DXF's own frame; no flip). Page frame =
// model space after INSERT expansion: CLO's blocks already sit in absolute world coordinates, so
// the page keeps the file's coordinates verbatim (extents in DxfMeta.extents, the page's width and
// height are the extents' size).
//
// Accounting: every record of BLOCKS/ENTITIES ends in exactly one bucket of the tally —
// rendered / structural / dropped-with-a-reason. Nothing disappears silently.

import type {
  Affine,
  ExtractFn,
  ExtractOpts,
  IRPage,
  IRPath,
  IRRaster,
  IRText,
  PathId,
  Progress,
  PtMm,
  SourceDoc,
  Style,
  StyleId,
} from '../../types';
import { PATIMPORT } from '../../types';
import {
  buildAst,
  int,
  numOf,
  numOr,
  rawStr,
  str,
  type RawBlock,
  type RawDxf,
  type RawEntity,
} from './ast';
import type {
  DxfDialect,
  DxfGroup,
  DxfMeta,
  DxfPointAttrs,
  DxfRead,
  DxfUnits,
  TallyRow,
} from './dxf-types';
import {
  IDENTITY,
  apply,
  applyDir,
  arcPts,
  bboxOf,
  bulgePolyline,
  catmullRom,
  ellipsePts,
  mul,
  nurbsAt,
  ocsToWcs,
  rotate,
  sampleAdaptive,
  scale,
  scaleOf,
  translate,
  type P,
} from './geometry';
import { loadDxf, num, type Tag } from './tags';
import { decodeLabel, decodeMText, decodeTextValue, type DecodedLabel } from './text';

const MAX_DEPTH = 16;
const MAX_INSTANCES = 50_000;

const INSUNITS_MM: Record<number, number> = {
  1: 25.4,
  2: 304.8,
  3: 1_609_344,
  4: 1,
  5: 10,
  6: 1000,
  7: 1_000_000,
  8: 2.54e-5,
  9: 0.0254,
  10: 914.4,
  11: 1e-7,
  12: 1e-6,
  13: 1e-3,
  14: 100,
};

// AutoCAD Color Index → RGB. 1–9 and the grey ramp exactly; 10–249 by the standard hue wheel.
function aciRgb(i: number): [number, number, number] {
  const base: Record<number, [number, number, number]> = {
    1: [255, 0, 0],
    2: [255, 255, 0],
    3: [0, 255, 0],
    4: [0, 255, 255],
    5: [0, 0, 255],
    6: [255, 0, 255],
    7: [0, 0, 0], // white-on-black in CAD; black ink on paper
    8: [128, 128, 128],
    9: [192, 192, 192],
    250: [51, 51, 51],
    251: [80, 80, 80],
    252: [105, 105, 105],
    253: [130, 130, 130],
    254: [190, 190, 190],
    255: [255, 255, 255],
  };
  if (base[i]) return base[i];
  if (i < 10 || i > 249) return [0, 0, 0];
  const hue = Math.floor((i - 10) / 10) * 15;
  const step = (i - 10) % 10;
  const v = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][step];
  const s = step % 2 === 0 ? 1 : 0.5;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

type Ctx = {
  /** local drawing units → page mm */
  M: Affine;
  /** flattening tolerance in LOCAL units */
  tol: number;
  /** block the entity is defined in (null = model space) */
  block: string | null;
  /** effective layer of the INSERT (entities on layer 0 inside a block inherit it) */
  layer0: string | null;
  /** effective colour of the INSERT (BYBLOCK) */
  colorByBlock: number | null;
  group: DxfGroup;
  depth: number;
};

type Emit = {
  pts: PtMm[];
  closed: boolean;
  sub: number;
  fill: boolean;
  width?: number;
};

class Builder {
  paths: IRPath[] = [];
  texts: IRText[] = [];
  rasters: IRRaster[] = [];
  styles: Style[] = [];
  styleKey = new Map<string, StyleId>();
  layers: string[] = [];
  layerSet = new Set<string>();
  pathEntity: string[] = [];
  textEntity: string[] = [];
  attribTag: Record<number, string> = {};
  points: Record<PathId, DxfPointAttrs> = {};
  groups: DxfGroup[] = [];
  /** record key → rendered */
  rendered = new Set<string>();
  /** record key → structural */
  structural = new Set<string>();
  /** record key → drop reason */
  dropped = new Map<string, string>();
  emitted = new Map<string, { p: number; t: number; r: number }>();
  warnings: string[] = [];
  budget = MAX_INSTANCES;
  budgetWarned = false;
  insertCount = 0;

  constructor(
    readonly fileId: string,
    readonly raw: RawDxf,
    readonly units: DxfUnits,
    readonly opts: ExtractOpts,
  ) {
    for (const l of raw.layers) this.addLayer(l.name);
  }

  addLayer(name: string) {
    if (!this.layerSet.has(name)) {
      this.layerSet.add(name);
      this.layers.push(name);
    }
  }

  bumpEmit(type: string, k: 'p' | 't' | 'r') {
    const row = this.emitted.get(type) ?? { p: 0, t: 0, r: 0 };
    row[k]++;
    this.emitted.set(type, row);
  }

  style(e: RawEntity, ctx: Ctx, fill: boolean, widthUnits = 0): StyleId {
    const layer = this.layerOf(e, ctx);
    const layerRec = this.raw.layers.find((l) => l.name === layer);
    let color = int(e.tags, 62);
    const tc = int(e.tags, 420);
    let rgb: [number, number, number] | null = null;
    if (tc != null) rgb = [(tc >> 16) & 255, (tc >> 8) & 255, tc & 255];
    else {
      if (color === 0) color = ctx.colorByBlock;
      if (color == null || color === 256) {
        if (layerRec?.trueColor != null) {
          const t = layerRec.trueColor;
          rgb = [(t >> 16) & 255, (t >> 8) & 255, t & 255];
        } else color = layerRec ? Math.abs(layerRec.color) : 7;
      }
      if (!rgb && color != null) rgb = aciRgb(Math.abs(color));
    }
    let ltype = str(e.tags, 6);
    if (!ltype || /^bylayer$/i.test(ltype)) ltype = layerRec?.ltype ?? 'CONTINUOUS';
    const lt = this.raw.ltypes.get(ltype.toUpperCase());
    const ltscale = numOr(e.tags, 48, 1);
    const s = scaleOf(ctx.M);
    const dash =
      lt && lt.dash.length > 0 && lt.dash.some((d) => d > 0)
        ? lt.dash.map((d) => d * ltscale * s)
        : null;
    const lw = int(e.tags, 370);
    const widthMm = widthUnits > 0 ? widthUnits * s : lw != null && lw > 0 ? lw / 100 : 0;
    const key = JSON.stringify([rgb, widthMm, dash, layer, fill]);
    let id = this.styleKey.get(key);
    if (id == null) {
      id = this.styles.length;
      this.styles.push({ id, strokeRgb: rgb, widthMm, dash, layer, fill, clip: null });
      this.styleKey.set(key, id);
    }
    return id;
  }

  layerOf(e: RawEntity, ctx: Ctx): string {
    const l = e.layer === '0' && ctx.layer0 != null ? ctx.layer0 : e.layer;
    this.addLayer(l);
    return l;
  }

  pushPath(e: RawEntity, ctx: Ctx, em: Emit, key: string): PathId {
    const id = this.paths.length;
    this.paths.push({
      id,
      pts: em.pts,
      closed: em.closed,
      style: this.style(e, ctx, em.fill, em.width ?? 0),
      src: {
        file: this.fileId,
        page: 0,
        op: e.op,
        sub: em.sub,
        handle: e.handle,
        block: ctx.block,
      },
    });
    this.pathEntity.push(e.type);
    ctx.group.paths.push(id);
    this.rendered.add(key);
    this.bumpEmit(e.type, 'p');
    return id;
  }

  pushText(
    e: RawEntity,
    ctx: Ctx,
    t: {
      text: string;
      anchor: PtMm;
      heightMm: number;
      rotDeg: number;
      widthMm: number;
      lines: number;
    },
    key: string,
  ): number {
    const id = this.texts.length;
    const r = (t.rotDeg * Math.PI) / 180;
    const ux = { x: Math.cos(r), y: Math.sin(r) };
    const uy = { x: -ux.y, y: ux.x };
    const h = t.heightMm;
    const corners = [
      { x: 0, y: -0.25 * h - (t.lines - 1) * 1.66 * h },
      { x: t.widthMm, y: -0.25 * h - (t.lines - 1) * 1.66 * h },
      { x: t.widthMm, y: h },
      { x: 0, y: h },
    ].map((c) => ({
      x: t.anchor.x + c.x * ux.x + c.y * uy.x,
      y: t.anchor.y + c.x * ux.y + c.y * uy.y,
    }));
    this.texts.push({
      id,
      text: t.text,
      anchor: t.anchor,
      bbox: bboxOf(corners),
      fontSizeMm: h,
      rotationDeg: ((t.rotDeg % 360) + 360) % 360,
      layer: this.layerOf(e, ctx),
      src: { file: this.fileId, page: 0, op: e.op, sub: 0, handle: e.handle, block: ctx.block },
    });
    this.textEntity.push(e.type);
    ctx.group.texts.push(id);
    this.rendered.add(key);
    this.bumpEmit(e.type, 't');
    return id;
  }

  drop(key: string, reason: string) {
    if (!this.rendered.has(key) && !this.structural.has(key)) this.dropped.set(key, reason);
  }
}

// ── entity decoders ─────────────────────────────────────────────────────────────────────────

function ocsOf(tags: Tag[]): Affine {
  const nx = numOf(tags, 210);
  const ny = numOf(tags, 220);
  const nz = numOf(tags, 230);
  if (nx == null && ny == null && nz == null) return IDENTITY;
  return ocsToWcs(nx ?? 0, ny ?? 0, nz ?? 1);
}

function pt(tags: Tag[], cx: number, cy: number): P {
  return { x: numOr(tags, cx, 0), y: numOr(tags, cy, 0) };
}

/** LWPOLYLINE vertices in order: 10 opens a vertex, 20 its y, 42 its bulge. */
function lwVertices(tags: Tag[]): { x: number; y: number; bulge: number }[] {
  const v: { x: number; y: number; bulge: number }[] = [];
  for (const t of tags) {
    if (t.code === 10) v.push({ x: num(t), y: 0, bulge: 0 });
    else if (t.code === 20 && v.length) v[v.length - 1].y = num(t);
    else if (t.code === 42 && v.length) v[v.length - 1].bulge = num(t);
  }
  return v;
}

function decodeGeometry(e: RawEntity, ctx: Ctx, b: Builder): Emit[] | { drop: string } {
  const tg = e.tags;
  const tol = ctx.tol;
  const M = ctx.M;
  const toPage = (m: Affine, pts: P[]) => pts.map((p) => apply(m, p));
  switch (e.type) {
    case 'LINE': {
      return [
        { pts: toPage(M, [pt(tg, 10, 20), pt(tg, 11, 21)]), closed: false, sub: 0, fill: false },
      ];
    }
    case 'LWPOLYLINE': {
      const flags = int(tg, 70) ?? 0;
      const closed = (flags & 1) === 1;
      const v = lwVertices(tg);
      if (v.length === 0) return { drop: 'polyline without vertices' };
      const pts = bulgePolyline(v, closed, tol);
      return [
        {
          pts: toPage(mul(M, ocsOf(tg)), pts),
          closed,
          sub: 0,
          fill: false,
          width: numOr(tg, 43, 0),
        },
      ];
    }
    case 'POLYLINE': {
      const flags = int(tg, 70) ?? 0;
      if (flags & 16) return { drop: 'polygon mesh (3D surface)' };
      if (flags & 64) return { drop: 'polyface mesh (3D surface)' };
      const closed = (flags & 1) === 1;
      const is3d = (flags & 8) === 8;
      type V = { x: number; y: number; bulge: number; f: number };
      let vs: V[] = e.children.map((c) => ({
        x: numOr(c.tags, 10, 0),
        y: numOr(c.tags, 20, 0),
        bulge: numOr(c.tags, 42, 0),
        f: int(c.tags, 70) ?? 0,
      }));
      const splineFit = vs.some((v) => v.f & 8);
      vs = splineFit ? vs.filter((v) => v.f & 8 || !(v.f & 16)) : vs.filter((v) => !(v.f & 16));
      if (vs.length === 0) return { drop: 'polyline without vertices' };
      const pts = bulgePolyline(vs, closed, tol);
      const m = is3d ? M : mul(M, ocsOf(tg));
      return [{ pts: toPage(m, pts), closed, sub: 0, fill: false, width: numOr(tg, 40, 0) }];
    }
    case 'ARC': {
      const c = pt(tg, 10, 20);
      const r = numOr(tg, 40, 0);
      const a0 = (numOr(tg, 50, 0) * Math.PI) / 180;
      const a1 = (numOr(tg, 51, 360) * Math.PI) / 180;
      let sweep = a1 - a0;
      while (sweep <= 1e-12) sweep += 2 * Math.PI;
      return [
        {
          pts: toPage(mul(M, ocsOf(tg)), arcPts(c.x, c.y, r, a0, sweep, tol)),
          closed: false,
          sub: 0,
          fill: false,
        },
      ];
    }
    case 'CIRCLE': {
      const c = pt(tg, 10, 20);
      const r = numOr(tg, 40, 0);
      const pts = arcPts(c.x, c.y, r, 0, 2 * Math.PI, tol);
      pts.pop();
      while (pts.length < 8) {
        // tiny circles: keep at least an octagon so drills stay recognisable
        const n = 8;
        pts.length = 0;
        for (let i = 0; i < n; i++)
          pts.push({
            x: c.x + r * Math.cos((2 * Math.PI * i) / n),
            y: c.y + r * Math.sin((2 * Math.PI * i) / n),
          });
      }
      return [{ pts: toPage(mul(M, ocsOf(tg)), pts), closed: true, sub: 0, fill: false }];
    }
    case 'ELLIPSE': {
      const nz = numOf(tg, 230) ?? 1;
      const { pts, full } = ellipsePts(
        pt(tg, 10, 20),
        pt(tg, 11, 21),
        numOr(tg, 40, 1),
        numOr(tg, 41, 0),
        numOr(tg, 42, 2 * Math.PI),
        nz < 0 ? -1 : 1,
        tol,
      );
      return [{ pts: toPage(M, pts), closed: full, sub: 0, fill: false }];
    }
    case 'SPLINE': {
      const flags = int(tg, 70) ?? 0;
      const closed = (flags & 1) === 1;
      const degree = int(tg, 71) ?? 3;
      const knots = tg.filter((t) => t.code === 40).map(num);
      const weights = tg.filter((t) => t.code === 41).map(num);
      const ctrl: P[] = [];
      const fit: P[] = [];
      for (const t of tg) {
        if (t.code === 10) ctrl.push({ x: num(t), y: 0 });
        else if (t.code === 20 && ctrl.length) ctrl[ctrl.length - 1].y = num(t);
        else if (t.code === 11) fit.push({ x: num(t), y: 0 });
        else if (t.code === 21 && fit.length) fit[fit.length - 1].y = num(t);
      }
      if (ctrl.length >= degree + 1 && knots.length === ctrl.length + degree + 1) {
        const w = weights.length === ctrl.length ? weights : ctrl.map(() => 1);
        const t0 = knots[degree];
        const t1 = knots[ctrl.length];
        const pts = sampleAdaptive(
          (t) => nurbsAt(degree, ctrl, w, knots, t),
          t0,
          t1,
          Math.max(4, ctrl.length - degree) * 2,
          tol,
        );
        if (
          closed &&
          pts.length > 2 &&
          Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < tol
        )
          pts.pop();
        return [{ pts: toPage(M, pts), closed, sub: 0, fill: false }];
      }
      if (fit.length >= 2)
        return [{ pts: toPage(M, catmullRom(fit, closed, tol)), closed, sub: 0, fill: false }];
      if (ctrl.length >= 2) {
        b.warnings.push(
          `SPLINE at line ${e.line}: malformed knot vector — its control polygon is used`,
        );
        return [{ pts: toPage(M, ctrl), closed, sub: 0, fill: false }];
      }
      return { drop: 'spline without control or fit points' };
    }
    case 'POINT': {
      return [{ pts: toPage(M, [pt(tg, 10, 20)]), closed: false, sub: 0, fill: false }];
    }
    case 'SOLID':
    case 'TRACE':
    case '3DFACE': {
      const c = [pt(tg, 10, 20), pt(tg, 11, 21), pt(tg, 12, 22), pt(tg, 13, 23)];
      const order = e.type === '3DFACE' ? [0, 1, 2, 3] : [0, 1, 3, 2];
      const pts = order.map((k) => c[k]);
      if (Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y) < 1e-12) pts.pop();
      const m = e.type === '3DFACE' ? M : mul(M, ocsOf(tg));
      return [{ pts: toPage(m, pts), closed: true, sub: 0, fill: e.type !== '3DFACE' }];
    }
    case 'LEADER': {
      const pts: P[] = [];
      for (const t of tg) {
        if (t.code === 10) pts.push({ x: num(t), y: 0 });
        else if (t.code === 20 && pts.length) pts[pts.length - 1].y = num(t);
      }
      if (pts.length < 1) return { drop: 'leader without vertices' };
      return [{ pts: toPage(M, pts), closed: false, sub: 0, fill: false }];
    }
    case 'HATCH':
      return hatchLoops(e, ctx);
    default:
      return { drop: `unsupported entity ${e.type}` };
  }
}

/** HATCH boundary loops → closed fill paths (one per loop, `sub` = loop index). */
function hatchLoops(e: RawEntity, ctx: Ctx): Emit[] | { drop: string } {
  const tg = e.tags;
  const m = mul(ctx.M, ocsOf(tg));
  const tol = ctx.tol;
  let i = tg.findIndex((t) => t.code === 91);
  if (i < 0) return { drop: 'hatch without boundary' };
  const nLoops = Math.trunc(num(tg[i]));
  i++;
  const next = (code: number): Tag | null => {
    while (i < tg.length && tg[i].code !== code) i++;
    if (i >= tg.length) return null;
    return tg[i++];
  };
  const out: Emit[] = [];
  for (let L = 0; L < nLoops; L++) {
    const ft = next(92);
    if (!ft) break;
    const flags = Math.trunc(num(ft));
    const pts: P[] = [];
    if (flags & 2) {
      const hasBulge = Math.trunc(num(next(72) ?? ft)) === 1;
      next(73);
      const n = Math.trunc(num(next(93) ?? ft));
      const v: { x: number; y: number; bulge: number }[] = [];
      for (let k = 0; k < n; k++) {
        const x = next(10);
        const y = next(20);
        if (!x || !y) break;
        let bulge = 0;
        if (hasBulge && tg[i]?.code === 42) bulge = num(tg[i++]);
        v.push({ x: num(x), y: num(y), bulge });
      }
      pts.push(...bulgePolyline(v, true, tol));
    } else {
      const nEdges = Math.trunc(num(next(93) ?? ft));
      for (let k = 0; k < nEdges; k++) {
        const typ = Math.trunc(num(next(72) ?? ft));
        const seg: P[] = [];
        if (typ === 1) {
          seg.push(
            { x: num(next(10)!), y: num(next(20)!) },
            { x: num(next(11)!), y: num(next(21)!) },
          );
        } else if (typ === 2) {
          const c = { x: num(next(10)!), y: num(next(20)!) };
          const r = num(next(40)!);
          const s = num(next(50)!);
          const en = num(next(51)!);
          const ccw = Math.trunc(num(next(73)!)) === 1;
          const a0 = ((ccw ? s : -s) * Math.PI) / 180;
          let sweep = ((ccw ? en - s : -(en - s)) * Math.PI) / 180;
          if (ccw) while (sweep <= 0) sweep += 2 * Math.PI;
          else while (sweep >= 0) sweep -= 2 * Math.PI;
          seg.push(...arcPts(c.x, c.y, r, a0, sweep, tol));
        } else if (typ === 3) {
          const c = { x: num(next(10)!), y: num(next(20)!) };
          const maj = { x: num(next(11)!), y: num(next(21)!) };
          const ratio = num(next(40)!);
          const s = (num(next(50)!) * Math.PI) / 180;
          const en = (num(next(51)!) * Math.PI) / 180;
          const ccw = Math.trunc(num(next(73)!)) === 1;
          seg.push(...ellipsePts(c, maj, ratio, ccw ? s : -en, ccw ? en : -s, 1, tol).pts);
          if (!ccw) seg.reverse();
        } else if (typ === 4) {
          const deg = Math.trunc(num(next(94)!));
          next(73);
          next(74);
          const nk = Math.trunc(num(next(95)!));
          const nc = Math.trunc(num(next(96)!));
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(num(next(40)!));
          const ctrl: P[] = [];
          const w: number[] = [];
          for (let q = 0; q < nc; q++) {
            ctrl.push({ x: num(next(10)!), y: num(next(20)!) });
            w.push(tg[i]?.code === 42 ? num(tg[i++]) : 1);
          }
          if (knots.length === nc + deg + 1 && nc > deg) {
            seg.push(
              ...sampleAdaptive(
                (t) => nurbsAt(deg, ctrl, w, knots, t),
                knots[deg],
                knots[nc],
                nc * 2,
                tol,
              ),
            );
          } else seg.push(...ctrl);
        } else {
          return { drop: `hatch edge type ${typ} not readable` };
        }
        for (const p of seg) {
          const last = pts[pts.length - 1];
          if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) pts.push(p);
        }
      }
      if (
        pts.length > 2 &&
        Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-9
      )
        pts.pop();
    }
    if (pts.length)
      out.push({ pts: pts.map((p) => apply(m, p)), closed: true, sub: L, fill: true });
  }
  if (out.length === 0) return { drop: 'hatch boundary unreadable' };
  return out;
}

function textOf(
  e: RawEntity,
  ctx: Ctx,
): {
  text: string;
  anchor: PtMm;
  heightMm: number;
  rotDeg: number;
  widthMm: number;
  lines: number;
} {
  const tg = e.tags;
  const s = scaleOf(ctx.M);
  if (e.type === 'MTEXT') {
    const chunks = tg.filter((t) => t.code === 3).map((t) => t.value);
    const v = chunks.join('') + (rawStr(tg, 1) ?? '');
    const text = decodeMText(v);
    const h = numOr(tg, 40, 2.5);
    const xd = numOf(tg, 11) != null ? pt(tg, 11, 21) : null;
    const localRot = xd ? Math.atan2(xd.y, xd.x) : numOr(tg, 50, 0); // 50 is radians for MTEXT
    const dir = applyDir(ctx.M, { x: Math.cos(localRot), y: Math.sin(localRot) });
    const lines = Math.max(1, text.split('\n').length);
    const longest = Math.max(1, ...text.split('\n').map((l) => l.length));
    const refW = numOr(tg, 41, 0);
    const wLocal = refW > 0 ? Math.min(refW, longest * 0.6 * h) : longest * 0.6 * h;
    const att = int(tg, 71) ?? 1;
    // insertion → baseline-left of the first line
    const col = (att - 1) % 3; // 0 left 1 centre 2 right
    const row = Math.floor((att - 1) / 3); // 0 top 1 middle 2 bottom
    const blockH = lines * h * 1.66;
    const dx = -[0, wLocal / 2, wLocal][col];
    const dy = [-h, blockH / 2 - h, blockH - h][row];
    const ins = pt(tg, 10, 20);
    const r = localRot;
    const local = {
      x: ins.x + dx * Math.cos(r) - dy * Math.sin(r),
      y: ins.y + dx * Math.sin(r) + dy * Math.cos(r),
    };
    return {
      text,
      anchor: apply(ctx.M, local),
      heightMm: h * s,
      rotDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
      widthMm: wLocal * s,
      lines,
    };
  }
  // TEXT / ATTRIB / ATTDEF — OCS
  const m = mul(ctx.M, ocsOf(tg));
  const value =
    e.type === 'ATTDEF' && rawStr(tg, 1) === '' ? str(tg, 2) ?? '' : rawStr(tg, 1) ?? '';
  const text = decodeTextValue(value);
  const h = numOr(tg, 40, 2.5);
  const rot = (numOr(tg, 50, 0) * Math.PI) / 180;
  const dir = applyDir(m, { x: Math.cos(rot), y: Math.sin(rot) });
  const wf = numOr(tg, 41, 1) || 1;
  return {
    text,
    anchor: apply(m, pt(tg, 10, 20)),
    heightMm: h * s,
    rotDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
    widthMm: Math.max(1, text.length) * 0.6 * h * wf * s,
    lines: 1,
  };
}

// ── walk ────────────────────────────────────────────────────────────────────────────────────

function insertTransform(e: RawEntity, block: RawBlock, ci: number, ri: number): Affine {
  const tg = e.tags;
  const pos = pt(tg, 10, 20);
  const sx = numOf(tg, 41) ?? 1;
  const sy = numOf(tg, 42) ?? 1;
  const rot = (numOr(tg, 50, 0) * Math.PI) / 180;
  const colSp = numOr(tg, 44, 0);
  const rowSp = numOr(tg, 45, 0);
  // OCS · T(pos) · R · T(array offset) · S · T(−base)
  return mul(
    ocsOf(tg),
    mul(
      translate(pos.x, pos.y),
      mul(
        rotate(rot),
        mul(
          translate(ci * colSp, ri * rowSp),
          mul(scale(sx || 1, sy || 1), translate(-block.base.x, -block.base.y)),
        ),
      ),
    ),
  );
}

function walk(list: RawEntity[], ctx: Ctx, b: Builder, newGroupPerInsert: boolean): void {
  for (const e of list) {
    const key = String(e.op);
    if (e.paper) {
      b.drop(key, 'paper-space entity (layout, not the drawing)');
      continue;
    }
    if (e.type === 'INSERT' || e.type === 'DIMENSION') {
      const name = str(e.tags, 2) ?? '';
      const block = b.raw.blocks.get(name);
      if (!block) {
        b.drop(
          key,
          e.type === 'INSERT'
            ? `INSERT of a missing block “${name}”`
            : 'DIMENSION without its block (measurement drawn nowhere)',
        );
        if (e.type === 'INSERT') b.warnings.push(`INSERT references a missing block “${name}”`);
        continue;
      }
      if (block.flags & 4) {
        b.drop(key, `external reference “${name}” (xref) — not embedded in this file`);
        continue;
      }
      if (ctx.depth >= MAX_DEPTH) {
        b.drop(key, `nested deeper than ${MAX_DEPTH} levels`);
        continue;
      }
      const cols = e.type === 'INSERT' ? Math.max(1, int(e.tags, 70) ?? 1) : 1;
      const rows = e.type === 'INSERT' ? Math.max(1, int(e.tags, 71) ?? 1) : 1;
      const layer = b.layerOf(e, ctx);
      const color = int(e.tags, 62);
      let placed = 0;
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          if (b.budget <= 0) break;
          b.budget--;
          placed++;
          const T =
            e.type === 'INSERT'
              ? insertTransform(e, block, ci, ri)
              : translate(-block.base.x, -block.base.y);
          const M = mul(ctx.M, T);
          let group = ctx.group;
          if (newGroupPerInsert && e.type === 'INSERT') {
            group = {
              index: b.groups.length,
              kind: 'insert',
              block: name,
              insertOp: e.op,
              insertHandle: e.handle,
              transform: M,
              paths: [],
              texts: [],
            };
            b.groups.push(group);
            b.insertCount++;
          }
          walk(
            block.entities,
            {
              M,
              tol: (b.opts.sagittaMm || PATIMPORT.sagittaMm) / scaleOf(M),
              block: name,
              layer0: layer,
              colorByBlock: color == null || color === 256 ? null : color,
              group,
              depth: ctx.depth + 1,
            },
            b,
            false,
          );
          // ATTRIBs are already placed in the INSERT's own space (not the block's).
          if (e.type === 'INSERT') {
            e.children.forEach((c, k) => {
              const ck = `${e.op}.${k}`;
              b.pushText(c, { ...ctx, group }, textOf(c, ctx), ck);
              const tag = str(c.tags, 2);
              if (tag) b.attribTag[b.texts.length - 1] = tag;
            });
          }
        }
      }
      if (placed < cols * rows) {
        if (!b.budgetWarned) {
          b.budgetWarned = true;
          b.warnings.push(`more than ${MAX_INSTANCES} block instances — the rest are not expanded`);
        }
        if (placed === 0) b.drop(key, `instance budget (${MAX_INSTANCES}) exhausted`);
      }
      if (placed > 0) b.structural.add(key);
      continue;
    }
    if (e.type === 'ATTDEF' && ctx.block != null) {
      // A template: drawn only through the ATTRIBs of each INSERT.
      b.structural.add(key);
      continue;
    }
    if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTDEF') {
      b.pushText(e, ctx, textOf(e, ctx), key);
      continue;
    }
    if (e.type === 'IMAGE') {
      const p0 = pt(e.tags, 10, 20);
      const u = pt(e.tags, 11, 21);
      const v = pt(e.tags, 12, 22);
      const size = pt(e.tags, 13, 23);
      const corners = [
        p0,
        { x: p0.x + u.x * size.x, y: p0.y + u.y * size.x },
        { x: p0.x + u.x * size.x + v.x * size.y, y: p0.y + u.y * size.x + v.y * size.y },
        { x: p0.x + v.x * size.y, y: p0.y + v.y * size.y },
      ].map((p) => apply(ctx.M, p));
      const bb = bboxOf(corners);
      const wIn = (bb.maxX - bb.minX) / 25.4;
      b.rasters.push({
        id: b.rasters.length,
        page: 0,
        file: b.fileId,
        bbox: bb,
        widthPx: Math.round(size.x),
        heightPx: Math.round(size.y),
        dpi: wIn > 0 ? size.x / wIn : 0,
        pageCover: 0,
      });
      b.rendered.add(key);
      b.bumpEmit(e.type, 'r');
      continue;
    }
    const res = decodeGeometry(e, ctx, b);
    if ('drop' in res) {
      b.drop(key, res.drop);
      continue;
    }
    for (const em of res) {
      const id = b.pushPath(e, ctx, em, key);
      if (e.type === 'POINT') {
        const a = numOf(e.tags, 50);
        let angleDeg: number | null = null;
        if (a != null) {
          const d = applyDir(mul(ctx.M, ocsOf(e.tags)), {
            x: Math.cos((a * Math.PI) / 180),
            y: Math.sin((a * Math.PI) / 180),
          });
          angleDeg = ((((Math.atan2(d.y, d.x) * 180) / Math.PI) % 360) + 360) % 360;
        }
        b.points[id] = {
          path: id,
          at: em.pts[0],
          angleDeg,
          z: numOr(e.tags, 30, 0) * scaleOf(ctx.M),
          thickness: numOr(e.tags, 39, 0),
          layer: b.paths[id] ? b.styles[b.paths[id].style].layer ?? e.layer : e.layer,
        };
      }
    }
  }
}

// ── units, dialect ──────────────────────────────────────────────────────────────────────────

function modelLabelsOf(raw: RawDxf): DecodedLabel[] {
  const out: DecodedLabel[] = [];
  for (const e of raw.entities) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue;
    const v =
      e.type === 'MTEXT'
        ? decodeMText(rawStr(e.tags, 1) ?? '')
        : decodeTextValue(rawStr(e.tags, 1) ?? '');
    const l = decodeLabel(v);
    if (l) out.push(l);
  }
  return out;
}

function unitsOf(raw: RawDxf, labels: DecodedLabel[]): DxfUnits {
  const ins = raw.header['$INSUNITS'];
  const insunits = ins?.[0] ? Math.trunc(num(ins[0])) : null;
  if (insunits != null && INSUNITS_MM[insunits]) {
    return {
      insunits,
      mmPerUnit: INSUNITS_MM[insunits],
      source: 'insunits',
      evidence: `$INSUNITS ${insunits}`,
    };
  }
  const u = labels.find((l) => l.key === 'units');
  if (u) {
    if (/metric|mm|millim/i.test(u.value))
      return { insunits, mmPerUnit: 1, source: 'units-text', evidence: `UNITS: ${u.value}` };
    if (/english|inch|imperial/i.test(u.value))
      return { insunits, mmPerUnit: 25.4, source: 'units-text', evidence: `UNITS: ${u.value}` };
    if (/cm|centim/i.test(u.value))
      return { insunits, mmPerUnit: 10, source: 'units-text', evidence: `UNITS: ${u.value}` };
  }
  const meas = raw.header['$MEASUREMENT'];
  if (meas?.[0] && Math.trunc(num(meas[0])) === 0) {
    return {
      insunits,
      mmPerUnit: 25.4,
      source: 'measurement',
      evidence: '$MEASUREMENT 0 (imperial)',
    };
  }
  return {
    insunits,
    mmPerUnit: 1,
    source: 'guess',
    evidence: 'no $INSUNITS and no UNITS text — millimetres assumed',
  };
}

function detectDialect(
  raw: RawDxf,
  labels: DecodedLabel[],
  manifest: boolean,
  version: string | null,
): DxfDialect {
  if (manifest) return 'grbpwr';
  const author = labels.find((l) => l.key === 'author')?.value ?? '';
  let pieceNames = 0;
  let bracketed = 0;
  let lwOnCut = 0;
  const sizeValues = new Set<string>();
  for (const bl of raw.blockOrder) {
    for (const e of bl.entities) {
      if (e.type === 'TEXT') {
        const l = decodeLabel(decodeTextValue(rawStr(e.tags, 1) ?? ''));
        if (l?.key === 'pieceName') pieceNames++;
        if (l?.key === 'size') {
          sizeValues.add(l.value.trim());
          if (/^<.*>$/.test(l.value.trim())) bracketed++;
        }
      }
      if (e.type === 'LWPOLYLINE' && (e.layer === '1' || e.layer === '14')) lwOnCut++;
    }
  }
  if (
    /clo virtual fashion/i.test(author) ||
    (version === 'AC1009' && /\bCLO\b/i.test(labels.find((l) => l.key === 'product')?.value ?? ''))
  ) {
    // CLO's Gerber target writes plain sizes; plain CLO-AAMA brackets one (`<S>`). A single-size
    // file carries no such evidence and stays plain CLO-AAMA.
    return bracketed === 0 && sizeValues.size >= 2 ? 'clo-aama-gerber' : 'clo-aama-r12';
  }
  if (pieceNames > 0) return 'aama';
  if (version && version >= 'AC1015' && lwOnCut > 0) return 'clo-r2000';
  return 'generic';
}

// ── tally ───────────────────────────────────────────────────────────────────────────────────

function tallyOf(raw: RawDxf, b: Builder, innerComments: number) {
  const rows = new Map<string, TallyRow>();
  const row = (type: string) => {
    let r = rows.get(type);
    if (!r) {
      r = {
        type,
        in: 0,
        rendered: 0,
        structural: 0,
        dropped: 0,
        reasons: {},
        emittedPaths: 0,
        emittedTexts: 0,
        emittedRasters: 0,
      };
      rows.set(type, r);
    }
    return r;
  };
  const reason = (r: TallyRow, why: string) => {
    r.dropped++;
    r.reasons[why] = (r.reasons[why] ?? 0) + 1;
  };
  const visit = (e: RawEntity, where: 'block-unused' | 'layout' | 'used') => {
    const key = String(e.op);
    const r = row(e.type);
    r.in++;
    let fate: 'rendered' | 'structural' | string;
    if (b.rendered.has(key)) fate = 'rendered';
    else if (b.structural.has(key)) fate = 'structural';
    else if (b.dropped.has(key)) fate = b.dropped.get(key)!;
    else if (where === 'block-unused') fate = 'inside a block that is never inserted';
    else if (where === 'layout') fate = 'content of a *Model_Space/*Paper_Space layout block';
    else fate = 'UNACCOUNTED';
    if (fate === 'rendered') r.rendered++;
    else if (fate === 'structural') r.structural++;
    else reason(r, fate);
    // children
    e.children.forEach((c, k) => {
      const cr = row(c.type);
      cr.in++;
      if (c.type === 'VERTEX') {
        if (fate === 'rendered') cr.structural++;
        else reason(cr, `vertex of a dropped ${e.type}: ${fate === 'structural' ? 'n/a' : fate}`);
      } else {
        const ck = `${e.op}.${k}`;
        if (b.rendered.has(ck)) cr.rendered++;
        else
          reason(
            cr,
            fate === 'structural' || fate === 'rendered'
              ? 'UNACCOUNTED'
              : `attribute of a dropped INSERT: ${fate}`,
          );
      }
    });
    if (e.seqend) {
      const sr = row('SEQEND');
      sr.in++;
      sr.structural++;
    }
  };
  const used = new Set<string>();
  for (const g of b.groups) if (g.block) used.add(g.block);
  // nested blocks reached through other blocks
  const reached = new Set<string>();
  const markReached = (name: string) => {
    if (reached.has(name)) return;
    reached.add(name);
    const bl = raw.blocks.get(name);
    if (!bl) return;
    for (const e of bl.entities)
      if ((e.type === 'INSERT' || e.type === 'DIMENSION') && b.structural.has(String(e.op)))
        markReached(str(e.tags, 2) ?? '');
  };
  for (const e of raw.entities)
    if ((e.type === 'INSERT' || e.type === 'DIMENSION') && b.structural.has(String(e.op)))
      markReached(str(e.tags, 2) ?? '');
  for (const bl of raw.blockOrder) {
    const r1 = row('BLOCK');
    r1.in++;
    r1.structural++;
    const r2 = row('ENDBLK');
    r2.in++;
    r2.structural++;
    const layout = /^\*(model|paper)_space/i.test(bl.name);
    const isFirst = raw.blocks.get(bl.name) === bl;
    for (const e of bl.entities) {
      const where = layout
        ? 'layout'
        : !isFirst
          ? 'block-unused'
          : reached.has(bl.name)
            ? 'used'
            : 'block-unused';
      visit(e, where);
    }
  }
  for (const e of raw.entities) visit(e, 'used');
  for (const [type, em] of b.emitted) {
    const r = row(type);
    r.emittedPaths = em.p;
    r.emittedTexts = em.t;
    r.emittedRasters = em.r;
  }
  const list = [...rows.values()].sort((a, c) => a.type.localeCompare(c.type));
  const balanced = list.every(
    (r) => r.in === r.rendered + r.structural + r.dropped && !r.reasons['UNACCOUNTED'],
  );
  // cross-check the parser's own walk count
  for (const r of list) {
    const parsed = raw.recordsByType[r.type] ?? 0;
    if (parsed !== r.in) b.warnings.push(`tally: ${r.type} parsed ${parsed} vs accounted ${r.in}`);
  }
  return {
    rows: list,
    innerComments,
    balanced: balanced && list.every((r) => (raw.recordsByType[r.type] ?? 0) === r.in),
  };
}

// ── public ──────────────────────────────────────────────────────────────────────────────────

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export async function readDxf(
  file: { id: string; name: string; bytes: ArrayBuffer },
  opts: ExtractOpts,
  progress?: Progress,
): Promise<DxfRead> {
  progress?.(0, 3, 'decode');
  const dec = loadDxf(file.bytes);
  const tok = dec.tok;
  const raw = buildAst(tok.tags);
  const manifest = dec.manifest;
  const modelLabels = modelLabelsOf(raw);
  const units = unitsOf(raw, modelLabels);
  const version = raw.header['$ACADVER']?.[0]?.value.trim() ?? null;
  progress?.(1, 3, 'expand');

  const b = new Builder(file.id, raw, units, {
    sagittaMm: opts.sagittaMm || PATIMPORT.sagittaMm,
    keepFills: opts.keepFills,
    pages: opts.pages,
  });
  b.warnings.push(...raw.warnings);
  if (dec.fallback) b.warnings.push(`the file is not UTF-8 — decoded as ${dec.encoding}`);
  if (units.source === 'guess') b.warnings.push(units.evidence);
  const M0 = scale(units.mmPerUnit, units.mmPerUnit);
  const loose: DxfGroup = {
    index: -1,
    kind: 'loose',
    block: null,
    insertOp: null,
    transform: M0,
    paths: [],
    texts: [],
  };
  walk(
    raw.entities,
    {
      M: M0,
      tol: (opts.sagittaMm || PATIMPORT.sagittaMm) / units.mmPerUnit,
      block: null,
      layer0: null,
      colorByBlock: null,
      group: loose,
      depth: 0,
    },
    b,
    true,
  );
  if (loose.paths.length || loose.texts.length) {
    loose.index = b.groups.length;
    b.groups.push(loose);
  }
  if (!opts.keepFills) {
    // contract: keepFills=false drops filled paths — explicitly, not silently
    const keep: IRPath[] = [];
    for (const p of b.paths) {
      if (b.styles[p.style].fill)
        b.warnings.push(`filled path ${p.id} (${b.pathEntity[p.id]}) dropped: keepFills=false`);
      else keep.push(p);
    }
    if (keep.length !== b.paths.length)
      b.warnings.push('keepFills=false: path ids are not renumbered; filled ids are absent');
    b.paths = keep;
  }
  progress?.(2, 3, 'tally');

  const allPts: PtMm[] = [];
  for (const p of b.paths) for (const q of p.pts) allPts.push(q);
  for (const t of b.texts)
    allPts.push({ x: t.bbox.minX, y: t.bbox.minY }, { x: t.bbox.maxX, y: t.bbox.maxY });
  for (const r of b.rasters)
    allPts.push({ x: r.bbox.minX, y: r.bbox.minY }, { x: r.bbox.maxX, y: r.bbox.maxY });
  const extents = allPts.length ? bboxOf(allPts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const pageW = extents.maxX - extents.minX;
  const pageH = extents.maxY - extents.minY;
  for (const r of b.rasters) {
    const a = (r.bbox.maxX - r.bbox.minX) * (r.bbox.maxY - r.bbox.minY);
    r.pageCover = pageW * pageH > 0 ? Math.min(1, a / (pageW * pageH)) : 0;
  }
  const tally = tallyOf(raw, b, tok.innerComments);
  if (!tally.balanced) b.warnings.push('entity tally does not balance — see meta.tally');
  const dialect = detectDialect(raw, modelLabels, manifest, version);
  const author = modelLabels.find((l) => l.key === 'author')?.value;
  const product = modelLabels.find((l) => l.key === 'product')?.value;
  const ezdxf = /EZDXF/i.test(dec.probeText);
  const producer =
    [version, author, product, ezdxf ? 'ezdxf' : null].filter(Boolean).join(' · ') || null;

  const page: IRPage = {
    file: file.id,
    page: 0,
    widthMm: pageW,
    heightMm: pageH,
    styles: b.styles,
    paths: b.paths,
    texts: b.texts,
    rasters: b.rasters,
    layers: b.layers,
  };
  const doc: SourceDoc = {
    file: {
      id: file.id,
      name: file.name,
      bytes: file.bytes.byteLength,
      sha256: await sha256Hex(file.bytes),
      kind: 'dxf',
      pages: 1,
      producer: producer ?? undefined,
    },
    pages: [page],
    warnings: b.warnings,
  };
  const meta: DxfMeta = {
    version,
    dialect,
    producer,
    encoding: dec.encoding,
    encodingFallback: dec.fallback,
    binary: dec.binary,
    units,
    manifest,
    modelLabels,
    groups: b.groups,
    pathEntity: b.pathEntity,
    textEntity: b.textEntity,
    attribTag: b.attribTag,
    points: b.points,
    tally,
    extents,
    blockCount: raw.blockOrder.filter((x) => !/^\*(model|paper)_space/i.test(x.name)).length,
    insertCount: b.insertCount,
  };
  progress?.(3, 3, 'done');
  return { doc, meta };
}

/** Contract entry point (08-CONTRACT §2): DXF → SourceDoc. Use `readDxf` to also get the
 * DXF side-channel (groups, POINT attributes, tally) the fast path needs. */
export const extractDxf: ExtractFn = async (file, opts, progress) =>
  (await readDxf(file, opts, progress)).doc;
