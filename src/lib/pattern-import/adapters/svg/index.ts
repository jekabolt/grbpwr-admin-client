// F12 · SVG adapter → canonical IR (one page, mm, y-up).
//
// No DOM: a tolerant XML parser (./xml) builds a tree, a walker composes nested transforms and
// flattens every geometry element (path incl. arcs, rect incl. rounded corners, circle, ellipse,
// line, polyline, polygon, <use>, nested <svg>) at the sagitta in MILLIMETRES after the full
// transform. Units: the root's width/height (mm, cm, in, pt, pc, Q, px) and viewBox map user
// units to mm; when the size is px or missing, 1 user unit = 1 px is assumed at the producer's
// dpi (96 CSS; Illustrator 72; Inkscape < 0.92 at 90) and a warning says so — the scale step must
// confirm it. Finally y-down → y-up: y' = pageHeight − y (contract §1).
//
// Style: stroke colour (0..255) / width / dasharray in mm → `Style`; fill-only shapes are kept as
// `fill:true` (letters-as-curves) unless `keepFills` is false. Layer = Inkscape layer label, else
// the top-level group's data-name / decoded id (Illustrator), else null. <text>/<tspan> → IRText.

import type {
  Affine,
  DeclaredUnits,
  ExtractFn,
  PtMm,
  SourceDoc,
  WorkBudgetLike,
} from '../../types';
import { PATIMPORT } from '../../types';
import { budgetOf, inputTooLarge } from '../budget';
import { apply, applyVec, meanScale, mul, scale, translate } from '../vector/affine';
import { bboxOf, fileInfo, PageBuilder, type StyleSpec } from '../vector/builder';
import { flattenCubic, flattenEllipseArc, flattenQuad } from '../vector/flatten';
import { UnsupportedFormat } from '../sniff/errors';
import { arcCenter, parsePathData, parseTransform, type PathSink } from './path-data';
import { computeProps, lengthUser, numberList, parsePaint, type Props, StyleSheet } from './style';
import { parseXml, textOf, type XNode } from './xml';

export type SvgOptions = {
  /** Force the px → mm basis (px per inch). Default: by producer (96 / Illustrator 72 / old Inkscape 90). */
  pxPerInch?: number;
};

type RawPath = {
  pts: PtMm[];
  closed: boolean;
  style: StyleSpec;
  op: number;
  sub: number;
  handle?: string;
};
type RawText = {
  text: string;
  anchor: PtMm;
  corners: PtMm[];
  fontSizeMm: number;
  rotDownDeg: number;
  layer: string | null;
  op: number;
  sub: number;
  handle?: string;
};

type Ctx = {
  m: Affine;
  props: Props;
  layer: string | null;
  clip: string | null;
  /** Viewport size in user units, for % lengths. */
  vw: number;
  vh: number;
  depth: number;
  useStack: Set<string>;
};

const SKIP = new Set([
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'linearGradient',
  'radialGradient',
  'filter',
  'style',
  'metadata',
  'title',
  'desc',
  'script',
  'foreignObject',
  'font',
  'font-face',
  'cursor',
  'view',
]);

export function makeExtractSvg(options: SvgOptions = {}): ExtractFn {
  return async (file, opts, progress) => {
    const sag = opts?.sagittaMm ?? PATIMPORT.sagittaMm;
    const keepFills = opts?.keepFills !== false;
    const budget = budgetOf(opts);
    let visited = 0;
    let u = new Uint8Array(file.bytes);
    if (u.length === 0) throw new UnsupportedFormat('empty');
    if (u[0] === 0x1f && u[1] === 0x8b) u = await gunzip(u);
    const src = decodeText(u);
    progress?.(0, 3, 'parse');
    const { root: docRoot, comments } = parseXml(src);
    const svg = findSvg(docRoot);
    if (!svg) throw new UnsupportedFormat('not-svg');

    const warnings: string[] = [];
    const producer = detectProducer(svg, comments);
    const pxPerInch = options.pxPerInch ?? producer.pxPerInch;
    const pxMm = 25.4 / pxPerInch;

    // Style sheets and the id index (for <use>).
    const sheet = new StyleSheet();
    const ids = new Map<string, XNode>();
    const index = (n: XNode) => {
      if (n.attrs.id && !ids.has(n.attrs.id)) ids.set(n.attrs.id, n);
      if (n.local === 'style' && isSvgNs(n)) sheet.add(textOf(n));
      for (const c of n.children) if (typeof c !== 'string') index(c);
    };
    index(svg);

    // Root viewport → mm (y-down).
    const vp = rootViewport(svg, pxMm, producer.name);
    warnings.push(...vp.warnings);

    const inkscapeDoc = producer.name === 'inkscape' || hasInkscapeLayers(svg);
    const paths: RawPath[] = [];
    const texts: RawText[] = [];
    let op = 0;
    let invisible = 0;
    let images = 0;
    let parseErrors = 0;

    const styleOf = (props: Props, m: Affine, ctx: Ctx, el: XNode) => {
      const ms = meanScale(m);
      const diag = Math.hypot(ctx.vw, ctx.vh) / Math.SQRT2;
      const so = parseFloat(props['stroke-opacity'] ?? '1');
      const fo = parseFloat(props['fill-opacity'] ?? '1');
      const stroke = so === 0 ? null : parsePaint(props.stroke, props.color);
      const fill =
        fo === 0
          ? null
          : props.fill === undefined
            ? ([0, 0, 0] as [number, number, number])
            : parsePaint(props.fill, props.color);
      const sw = lengthUser(props['stroke-width'] ?? '1', diag) ?? 1;
      let dash: number[] | null = null;
      const da = props['stroke-dasharray'];
      if (da && da.trim() !== 'none') {
        const parts = da
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((p) => lengthUser(p, diag));
        if (
          parts.length &&
          parts.every((p): p is number => p !== null && p >= 0) &&
          parts.some((p) => p > 0)
        ) {
          const list = parts.length % 2 ? [...parts, ...parts] : parts;
          dash = list.map((p) => p * ms);
        }
      }
      const fillsArea = el.local !== 'line';
      return { stroke, fill: fillsArea ? fill : null, widthMm: sw * ms, dash };
    };

    const emitShape = (el: XNode, ctx: Ctx, draw: (sink: FlatSink) => void) => {
      const st = styleOf(ctx.props, ctx.m, ctx, el);
      const thisOp = op++;
      if (!st.stroke && !(st.fill && keepFills)) {
        invisible++;
        return;
      }
      const sink = new FlatSink(ctx.m, sag, budget);
      draw(sink);
      if (sink.error) parseErrors++;
      const subs = sink.finish();
      const spec: StyleSpec = st.stroke
        ? {
            strokeRgb: st.stroke,
            widthMm: st.widthMm,
            dash: st.dash,
            layer: ctx.layer,
            fill: st.fill !== null,
            clip: ctx.clip,
          }
        : {
            strokeRgb: st.fill,
            widthMm: 0,
            dash: null,
            layer: ctx.layer,
            fill: true,
            clip: ctx.clip,
          };
      subs.forEach((s, k) => {
        const closed = s.closed || (!st.stroke && s.pts.length >= 3);
        paths.push({ pts: s.pts, closed, style: spec, op: thisOp, sub: k, handle: el.attrs.id });
      });
    };

    const len = (el: XNode, name: string, ctx: Ctx, axis: 'x' | 'y' | 'd', dflt = 0): number => {
      const base =
        axis === 'x' ? ctx.vw : axis === 'y' ? ctx.vh : Math.hypot(ctx.vw, ctx.vh) / Math.SQRT2;
      return lengthUser(el.attrs[name], base) ?? dflt;
    };

    const walk = (el: XNode, parent: Ctx) => {
      if (!isSvgNs(el) || SKIP.has(el.local)) return;
      if (parent.depth > 64) return;
      // C4: every element visited counts, so a <use> fan-out (each level referencing the one below
      // ten times) is refused instead of expanded 10^k times. Visiting one costs ~2 µs (style
      // cascade), so elements have their own, tighter cap: about a second, not forty.
      if (++visited > PATIMPORT.maxSvgElements)
        throw inputTooLarge(
          `the SVG has more than ${PATIMPORT.maxSvgElements.toLocaleString('en-US')} elements once its <use> copies are expanded. Export only the pattern pieces (no repeated symbols or patterns), or export PDF/DXF.`,
        );
      budget.spend(1, 'the SVG elements (with <use> copies)');
      const props = computeProps(el, parent.props, sheet);
      resolveFontSize(props, parent.props);
      if ((props.display ?? '').trim() === 'none') return;
      const hidden = props.visibility === 'hidden' || props.visibility === 'collapse';

      let m = mul(parent.m, parseTransform(el.attrs.transform));
      let layer = parent.layer;
      if (el.local === 'g') {
        if (el.attrs['inkscape:groupmode'] === 'layer')
          layer = el.attrs['inkscape:label'] ?? el.attrs.id ?? layer;
        else if (!inkscapeDoc && parent.depth === 0 && layer === null)
          layer = el.attrs['data-name'] ?? decodeAiId(el.attrs.id) ?? null;
      }
      const clipAttr = props['clip-path'] ?? el.attrs['clip-path'];
      const clip =
        clipAttr && clipAttr !== 'none'
          ? /url\(\s*#?([^)]*?)\s*\)/.exec(clipAttr)?.[1] ?? clipAttr
          : parent.clip;
      const ctx: Ctx = { ...parent, m, props, layer, clip, depth: parent.depth + 1 };

      switch (el.local) {
        case 'svg': {
          // Nested viewport.
          const x = len(el, 'x', parent, 'x');
          const y = len(el, 'y', parent, 'y');
          const w = lengthUser(el.attrs.width ?? '100%', parent.vw) ?? parent.vw;
          const h = lengthUser(el.attrs.height ?? '100%', parent.vh) ?? parent.vh;
          const vb = parseViewBox(el.attrs.viewBox);
          m = mul(m, translate(x, y));
          if (vb) m = mul(m, viewBoxMatrix(vb, w, h, el.attrs.preserveAspectRatio));
          const inner: Ctx = {
            ...ctx,
            m,
            vw: vb ? vb[2] : w,
            vh: vb ? vb[3] : h,
            depth: parent.depth === 0 ? 0 : ctx.depth,
          };
          for (const c of el.children) if (typeof c !== 'string') walk(c, inner);
          return;
        }
        case 'g':
        case 'a':
        case 'switch': {
          // Root-level wrappers (Illustrator <switch>, <a>, an unnamed <g i:extraneous>) do not
          // consume the "top level" where layers are named.
          const unnamedTop =
            el.local === 'g' && parent.depth === 0 && layer === null && !inkscapeDoc;
          const inner: Ctx =
            el.local === 'g' && !unnamedTop ? ctx : { ...ctx, depth: parent.depth };
          for (const c of el.children) if (typeof c !== 'string') walk(c, inner);
          return;
        }
        case 'use': {
          const href = (el.attrs.href ?? el.attrs['xlink:href'] ?? '').replace(/^#/, '');
          const target = ids.get(href);
          if (!target || ctx.useStack.has(href)) return;
          const x = len(el, 'x', parent, 'x');
          const y = len(el, 'y', parent, 'y');
          let um = mul(m, translate(x, y));
          const stack = new Set(ctx.useStack).add(href);
          const inner: Ctx = { ...ctx, m: um, useStack: stack };
          if (target.local === 'symbol') {
            const vb = parseViewBox(target.attrs.viewBox);
            const w =
              lengthUser(el.attrs.width ?? target.attrs.width ?? '100%', parent.vw) ?? parent.vw;
            const h =
              lengthUser(el.attrs.height ?? target.attrs.height ?? '100%', parent.vh) ?? parent.vh;
            if (vb) um = mul(um, viewBoxMatrix(vb, w, h, target.attrs.preserveAspectRatio));
            const symCtx: Ctx = { ...inner, m: um, props: computeProps(target, props, sheet) };
            for (const c of target.children) if (typeof c !== 'string') walk(c, symCtx);
          } else walk(target, inner);
          return;
        }
        case 'image':
          images++;
          return;
        case 'text':
          if (!hidden) emitText(el, ctx);
          return;
      }
      if (hidden) return;

      switch (el.local) {
        case 'path': {
          const d = el.attrs.d ?? '';
          emitShape(el, ctx, (sink) => {
            const err = parsePathData(d, sink);
            if (err) sink.error = err;
          });
          return;
        }
        case 'rect': {
          const x = len(el, 'x', parent, 'x');
          const y = len(el, 'y', parent, 'y');
          const w = len(el, 'width', parent, 'x');
          const h = len(el, 'height', parent, 'y');
          if (!(w > 0 && h > 0)) return;
          let rx = lengthUser(el.attrs.rx, parent.vw);
          let ry = lengthUser(el.attrs.ry, parent.vh);
          if (rx === null && ry !== null) rx = ry;
          if (ry === null && rx !== null) ry = rx;
          rx = Math.min(Math.max(0, rx ?? 0), w / 2);
          ry = Math.min(Math.max(0, ry ?? 0), h / 2);
          emitShape(el, ctx, (s) => {
            if (rx! > 0 && ry! > 0) {
              const RX = rx!;
              const RY = ry!;
              s.moveTo(x + RX, y);
              s.lineTo(x + w - RX, y);
              s.arcTo(RX, RY, 0, false, true, x + w, y + RY);
              s.lineTo(x + w, y + h - RY);
              s.arcTo(RX, RY, 0, false, true, x + w - RX, y + h);
              s.lineTo(x + RX, y + h);
              s.arcTo(RX, RY, 0, false, true, x, y + h - RY);
              s.lineTo(x, y + RY);
              s.arcTo(RX, RY, 0, false, true, x + RX, y);
            } else {
              s.moveTo(x, y);
              s.lineTo(x + w, y);
              s.lineTo(x + w, y + h);
              s.lineTo(x, y + h);
            }
            s.close();
          });
          return;
        }
        case 'circle':
        case 'ellipse': {
          const cx = len(el, 'cx', parent, 'x');
          const cy = len(el, 'cy', parent, 'y');
          const rx = el.local === 'circle' ? len(el, 'r', parent, 'd') : len(el, 'rx', parent, 'x');
          const ry = el.local === 'circle' ? rx : len(el, 'ry', parent, 'y');
          if (!(rx > 0 && ry > 0)) return;
          emitShape(el, ctx, (s) => s.ellipse(cx, cy, rx, ry));
          return;
        }
        case 'line':
          emitShape(el, ctx, (s) => {
            s.moveTo(len(el, 'x1', parent, 'x'), len(el, 'y1', parent, 'y'));
            s.lineTo(len(el, 'x2', parent, 'x'), len(el, 'y2', parent, 'y'));
          });
          return;
        case 'polyline':
        case 'polygon': {
          const v = numberList(el.attrs.points);
          if (v.length < 4) return;
          emitShape(el, ctx, (s) => {
            s.moveTo(v[0], v[1]);
            for (let k = 2; k + 1 < v.length; k += 2) s.lineTo(v[k], v[k + 1]);
            if (el.local === 'polygon') s.close();
          });
          return;
        }
        default:
          // Unknown SVG element: descend (tolerant of wrappers we do not name).
          for (const c of el.children) if (typeof c !== 'string') walk(c, ctx);
      }
    };

    const emitText = (el: XNode, ctx: Ctx) => {
      const thisOp = op++;
      type Chunk = { x: number; y: number; text: string; props: Props };
      const xs = numberList(el.attrs.x);
      const ys = numberList(el.attrs.y);
      let cx = (xs[0] ?? 0) + (numberList(el.attrs.dx)[0] ?? 0);
      let cy = (ys[0] ?? 0) + (numberList(el.attrs.dy)[0] ?? 0);
      let chunk: Chunk = { x: cx, y: cy, text: '', props: ctx.props };
      let sub = 0;
      const flush = () => {
        const t = chunk.text
          .replace(/[\n\r\t]/g, ' ')
          .replace(/ {2,}/g, ' ')
          .trim();
        const fs = lengthUser(chunk.props['font-size'] ?? '16') ?? 16;
        if (t) {
          const w = 0.55 * fs * t.length;
          const anchorShift =
            chunk.props['text-anchor'] === 'middle'
              ? 0.5
              : chunk.props['text-anchor'] === 'end'
                ? 1
                : 0;
          const x0 = chunk.x - anchorShift * w;
          const m = ctx.m;
          const ux = applyVec(m, 1, 0);
          const vy = applyVec(m, 0, 1);
          texts.push({
            text: t,
            anchor: apply(m, x0, chunk.y),
            corners: [
              apply(m, x0, chunk.y - 0.8 * fs),
              apply(m, x0 + w, chunk.y - 0.8 * fs),
              apply(m, x0 + w, chunk.y + 0.2 * fs),
              apply(m, x0, chunk.y + 0.2 * fs),
            ],
            fontSizeMm: fs * Math.hypot(vy.x, vy.y),
            rotDownDeg: (Math.atan2(ux.y, ux.x) * 180) / Math.PI,
            layer: ctx.layer,
            op: thisOp,
            sub: sub++,
            handle: el.attrs.id,
          });
          cx = chunk.x + (1 - anchorShift) * w;
        }
      };
      const visit = (node: XNode, props: Props) => {
        for (const c of node.children) {
          if (typeof c === 'string') {
            chunk.text += c;
            continue;
          }
          if (!isSvgNs(c) || !['tspan', 'textPath', 'a', 'tref'].includes(c.local)) continue;
          budget.spend(1, 'the SVG elements (with <use> copies)');
          const p = computeProps(c, props, sheet);
          resolveFontSize(p, props);
          if (p.display === 'none' || (c.attrs.display ?? '') === 'none') continue;
          const tx = numberList(c.attrs.x);
          const ty = numberList(c.attrs.y);
          const tdx = numberList(c.attrs.dx)[0] ?? 0;
          const tdy = numberList(c.attrs.dy)[0] ?? 0;
          if (tx.length || ty.length || tdx || tdy || c.attrs['sodipodi:role'] === 'line') {
            flush();
            chunk = { x: (tx[0] ?? cx) + tdx, y: (ty[0] ?? cy) + tdy, text: '', props: p };
            cy = chunk.y;
          } else if (chunk.text.trim() === '') chunk.props = p;
          visit(c, p);
        }
      };
      visit(el, ctx.props);
      flush();
    };

    progress?.(1, 3, 'walk');
    const top: Ctx = {
      m: vp.m,
      props: {},
      layer: null,
      clip: null,
      vw: vp.vw,
      vh: vp.vh,
      depth: 0,
      useStack: new Set(),
    };
    const rootProps = computeProps(svg, {}, sheet);
    resolveFontSize(rootProps, {});
    top.props = rootProps;
    for (const c of svg.children) if (typeof c !== 'string') walk(c, top);

    // Page size and the y-flip.
    let W = vp.pageW;
    let H = vp.pageH;
    if (W == null || H == null) {
      const all: PtMm[] = [];
      for (const p of paths) all.push(...p.pts);
      for (const t of texts) all.push(...t.corners);
      const bb = all.length ? bboxOf(all) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      W = W ?? Math.max(0, bb.maxX);
      H = H ?? Math.max(0, bb.maxY);
    }
    const flip = (p: PtMm): PtMm => ({ x: p.x, y: H! - p.y });

    const b = new PageBuilder(file.id, 0);
    for (const p of paths) {
      const sid = b.style(p.style);
      b.path(p.pts.map(flip), p.closed, sid, {
        file: file.id,
        page: 0,
        op: p.op,
        sub: p.sub,
        handle: p.handle,
        block: null,
      });
    }
    for (const t of texts) {
      b.text({
        text: t.text,
        anchor: flip(t.anchor),
        bbox: bboxOf(t.corners.map(flip)),
        fontSizeMm: t.fontSizeMm,
        rotationDeg: normDeg(-t.rotDownDeg),
        layer: t.layer,
        src: { file: file.id, page: 0, op: t.op, sub: t.sub, handle: t.handle, block: null },
      });
    }
    if (invisible) warnings.push(`${invisible} elements with neither stroke nor fill skipped`);
    if (images)
      warnings.push(
        `${images} embedded <image> elements ignored (raster inside SVG is not traced)`,
      );
    if (parseErrors)
      warnings.push(`${parseErrors} paths had malformed data and were drawn up to the error`);
    if (b.dropped) warnings.push(`${b.dropped} degenerate sub-paths (a single point) dropped`);

    progress?.(3, 3);
    const doc: SourceDoc = {
      file: await fileInfo(file, 'svg', producer.label),
      pages: [b.build(W, H)],
      warnings,
      ...(vp.declared ? { declaredUnits: vp.declared } : {}),
    };
    return doc;
  };
}

export const extractSvg: ExtractFn = makeExtractSvg();

// ── sink: transform + flatten into mm polylines ─────────────────────────────────────────────

class FlatSink implements PathSink {
  private subs: { pts: PtMm[]; closed: boolean }[] = [];
  private cur: { pts: PtMm[]; closed: boolean } | null = null;
  private ux = 0;
  private uy = 0;
  private sx = 0;
  private sy = 0;
  error: string | null = null;

  constructor(
    private m: Affine,
    private s: number,
    private budget: WorkBudgetLike,
  ) {}

  private spend(n: number): void {
    this.budget.spend(n, 'the SVG paths');
  }

  private ensure(): PtMm[] {
    if (!this.cur) {
      this.cur = { pts: [apply(this.m, this.sx, this.sy)], closed: false };
      this.subs.push(this.cur);
      this.ux = this.sx;
      this.uy = this.sy;
    }
    return this.cur.pts;
  }

  moveTo(x: number, y: number): void {
    this.spend(1);
    this.cur = { pts: [apply(this.m, x, y)], closed: false };
    this.subs.push(this.cur);
    this.ux = this.sx = x;
    this.uy = this.sy = y;
  }
  lineTo(x: number, y: number): void {
    this.spend(1);
    this.ensure().push(apply(this.m, x, y));
    this.ux = x;
    this.uy = y;
  }
  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    const pts = this.ensure();
    const n0 = pts.length;
    flattenCubic(
      pts[pts.length - 1],
      apply(this.m, x1, y1),
      apply(this.m, x2, y2),
      apply(this.m, x, y),
      this.s,
      pts,
    );
    this.spend(pts.length - n0);
    this.ux = x;
    this.uy = y;
  }
  quadTo(x1: number, y1: number, x: number, y: number): void {
    const pts = this.ensure();
    const n0 = pts.length;
    flattenQuad(pts[pts.length - 1], apply(this.m, x1, y1), apply(this.m, x, y), this.s, pts);
    this.spend(pts.length - n0);
    this.ux = x;
    this.uy = y;
  }
  arcTo(
    rx: number,
    ry: number,
    phiDeg: number,
    large: boolean,
    sweep: boolean,
    x: number,
    y: number,
  ): void {
    const pts = this.ensure();
    const n0 = pts.length;
    const c = arcCenter(this.ux, this.uy, rx, ry, phiDeg, large, sweep, x, y);
    // a radius so large its square overflows leaves no centre: the arc is its chord
    if (!c || ![c.cx, c.cy, c.rx, c.ry, c.t1, c.dt].every(Number.isFinite)) {
      if (this.ux !== x || this.uy !== y) pts.push(apply(this.m, x, y));
    } else
      flattenEllipseArc(
        c.cx,
        c.cy,
        c.rx,
        c.ry,
        c.phi,
        c.t1,
        c.dt,
        this.m,
        this.s,
        pts,
        apply(this.m, x, y),
      );
    this.spend(pts.length - n0);
    this.ux = x;
    this.uy = y;
  }
  /** A full ellipse as one closed sub-path starting at (cx+rx, cy) — SVG's start point. */
  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    this.moveTo(cx + rx, cy);
    const pts = this.cur!.pts;
    const n0 = pts.length;
    flattenEllipseArc(
      cx,
      cy,
      rx,
      ry,
      0,
      0,
      2 * Math.PI,
      this.m,
      this.s,
      pts,
      apply(this.m, cx + rx, cy),
    );
    this.spend(pts.length - n0);
    this.close();
  }
  close(): void {
    if (this.cur) this.cur.closed = true;
    this.cur = null;
    this.ux = this.sx;
    this.uy = this.sy;
  }
  finish(): { pts: PtMm[]; closed: boolean }[] {
    return this.subs;
  }
}

// ── root viewport, units, producer ──────────────────────────────────────────────────────────

const ABS_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  q: 0.25,
};

type Viewport = {
  m: Affine;
  pageW: number | null;
  pageH: number | null;
  vw: number;
  vh: number;
  warnings: string[];
  /** A0.1: width/height in mm/cm/in that agree with the viewBox — the file states its scale. */
  declared?: DeclaredUnits;
};

/** width/height attribute → mm. `px`/unitless use pxMm and are flagged uncertain; `%`/missing → null. */
function lengthMm(
  v: string | undefined,
  pxMm: number,
): { mm: number; certain: boolean; unit: string } | null {
  if (v === undefined) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (!(n > 0) || unit === '%' || unit === 'em' || unit === 'ex') return null;
  if (unit === '' || unit === 'px') return { mm: n * pxMm, certain: false, unit };
  const f = ABS_MM[unit];
  return f ? { mm: n * f, certain: true, unit } : null;
}

function parseViewBox(v: string | undefined): [number, number, number, number] | null {
  const a = numberList(v);
  return a.length === 4 && a[2] > 0 && a[3] > 0 ? [a[0], a[1], a[2], a[3]] : null;
}

/** viewBox → viewport (w×h in the parent's units), honouring preserveAspectRatio. */
function viewBoxMatrix(
  vb: [number, number, number, number],
  w: number,
  h: number,
  par: string | undefined,
): Affine {
  const [minX, minY, vw, vh] = vb;
  let sx = w / vw;
  let sy = h / vh;
  const p = (par ?? 'xMidYMid meet').trim().split(/\s+/);
  const align = p[0] === 'defer' ? p[1] ?? 'xMidYMid' : p[0];
  const slice = p.includes('slice');
  let tx = 0;
  let ty = 0;
  if (align !== 'none') {
    const s = slice ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = sy = s;
    const ax = align.includes('xMid') ? 0.5 : align.includes('xMax') ? 1 : 0;
    const ay = align.includes('YMid') ? 0.5 : align.includes('YMax') ? 1 : 0;
    tx = (w - vw * s) * ax;
    ty = (h - vh * s) * ay;
  }
  return mul(translate(tx, ty), mul(scale(sx, sy), translate(-minX, -minY)));
}

/**
 * A0.1: the file states its own scale when BOTH width and height carry a physical unit the pattern
 * world uses (mm, cm, in — the same unit; pt/pc/Q and px are left to the test square) and the
 * viewBox maps one user unit to the same mm on both axes (0.1 %): nothing is letterboxed or
 * stretched, so a length in the drawing IS its length on paper.
 */
function declaredUnits(
  svg: XNode,
  W: { mm: number; unit: string },
  H: { mm: number; unit: string },
  vb: [number, number, number, number],
): DeclaredUnits | undefined {
  const unit = W.unit;
  if (unit !== H.unit || (unit !== 'mm' && unit !== 'cm' && unit !== 'in')) return undefined;
  const sx = W.mm / vb[2];
  const sy = H.mm / vb[3];
  if (!(sx > 0) || Math.abs(sx / sy - 1) > 0.001) return undefined;
  return {
    unit,
    widthMm: W.mm,
    heightMm: H.mm,
    userUnitMm: (sx + sy) / 2,
    evidence: `width="${svg.attrs.width}" height="${svg.attrs.height}" viewBox="${svg.attrs.viewBox}"`,
  };
}

function rootViewport(svg: XNode, pxMm: number, producer: string): Viewport {
  const warnings: string[] = [];
  const vb = parseViewBox(svg.attrs.viewBox);
  let W = lengthMm(svg.attrs.width, pxMm);
  let H = lengthMm(svg.attrs.height, pxMm);
  if (vb) {
    if (W && !H) H = { mm: (W.mm * vb[3]) / vb[2], certain: W.certain, unit: '' };
    if (H && !W) W = { mm: (H.mm * vb[2]) / vb[3], certain: H.certain, unit: '' };
  }
  const dpi = Math.round(25.4 / pxMm);
  const pxNote = `assumed ${dpi} px per inch${producer !== 'unknown' ? ` (${producer})` : ''}`;
  if (W && H) {
    if (!W.certain || !H.certain)
      warnings.push(
        `SVG size is in px: ${pxNote} — confirm the scale (test square / known length)`,
      );
    if (vb)
      return {
        m: viewBoxMatrix(vb, W.mm, H.mm, svg.attrs.preserveAspectRatio),
        pageW: W.mm,
        pageH: H.mm,
        vw: vb[2],
        vh: vb[3],
        warnings,
        declared: declaredUnits(svg, W, H, vb),
      };
    return { m: scale(pxMm), pageW: W.mm, pageH: H.mm, vw: W.mm / pxMm, vh: H.mm / pxMm, warnings };
  }
  warnings.push(
    `SVG has no physical size (width/height missing or relative): 1 user unit = 1 px, ${pxNote} — confirm the scale`,
  );
  if (vb) {
    return {
      m: mul(scale(pxMm), translate(-vb[0], -vb[1])),
      pageW: vb[2] * pxMm,
      pageH: vb[3] * pxMm,
      vw: vb[2],
      vh: vb[3],
      warnings,
    };
  }
  return { m: scale(pxMm), pageW: null, pageH: null, vw: 1000, vh: 1000, warnings };
}

type Producer = {
  name: 'illustrator' | 'inkscape' | 'unknown' | string;
  label?: string;
  pxPerInch: number;
};

function detectProducer(svg: XNode, comments: string[]): Producer {
  const gen = comments.map((c) => /Generator:\s*([^\n]*?)\s*$/m.exec(c)?.[1]).find(Boolean);
  if (gen && /Illustrator/i.test(gen))
    return { name: 'illustrator', label: gen.replace(/,?\s*SVG Export.*$/i, ''), pxPerInch: 72 };
  const iv = svg.attrs['inkscape:version'];
  if (iv) {
    const m = /^(\d+)\.(\d+)/.exec(iv);
    const old = m ? +m[1] === 0 && +m[2] < 92 : false;
    return { name: 'inkscape', label: `Inkscape ${iv.split(' ')[0]}`, pxPerInch: old ? 90 : 96 };
  }
  if (gen) return { name: 'unknown', label: gen, pxPerInch: 96 };
  return { name: 'unknown', pxPerInch: 96 };
}

function hasInkscapeLayers(n: XNode): boolean {
  if (n.attrs['inkscape:groupmode'] === 'layer') return true;
  for (const c of n.children) if (typeof c !== 'string' && hasInkscapeLayers(c)) return true;
  return false;
}

function isSvgNs(n: XNode): boolean {
  return n.prefix === '' || n.prefix === 'svg';
}

function findSvg(n: XNode | null): XNode | null {
  if (!n) return null;
  if (n.local === 'svg' && isSvgNs(n)) return n;
  for (const c of n.children) {
    if (typeof c === 'string') continue;
    const f = findSvg(c);
    if (f) return f;
  }
  return null;
}

/** Illustrator ids: `_x5F_` → `_`, `_x20_` → ` `; trailing `_1_` de-dup suffix dropped. */
function decodeAiId(id: string | undefined): string | null {
  if (!id) return null;
  return id
    .replace(/_x([0-9A-Fa-f]{2,4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/_\d+_$/, '');
}

/** em / % font sizes resolve against the parent's computed size now, so they never compound. */
function resolveFontSize(props: Props, parent: Props): void {
  const v = props['font-size'];
  if (!v || v === parent['font-size']) return;
  const parentPx = lengthUser(parent['font-size'] ?? '16') ?? 16;
  const KW: Record<string, number> = {
    'xx-small': 9,
    'x-small': 10,
    small: 13,
    medium: 16,
    large: 18,
    'x-large': 24,
    'xx-large': 32,
    smaller: parentPx / 1.2,
    larger: parentPx * 1.2,
  };
  const kw = KW[v.trim().toLowerCase()];
  const px = kw ?? lengthUser(v, parentPx, parentPx);
  props['font-size'] = String(px ?? parentPx);
}

function normDeg(d: number): number {
  let r = d % 360;
  if (r <= -180) r += 360;
  if (r > 180) r -= 360;
  return Math.abs(r) < 1e-9 ? 0 : r;
}

function decodeText(u: Uint8Array): string {
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u.subarray(2));
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u.subarray(2));
  const head = new TextDecoder('latin1').decode(u.subarray(0, Math.min(u.length, 200)));
  const enc = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(head)?.[1];
  if (enc && !/^utf-?8$/i.test(enc)) {
    try {
      return new TextDecoder(enc).decode(u);
    } catch {
      /* unknown label → utf-8 */
    }
  }
  return new TextDecoder('utf-8').decode(u);
}

async function gunzip(u: Uint8Array): Promise<Uint8Array> {
  const DS = (
    globalThis as {
      DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array>;
    }
  ).DecompressionStream;
  if (!DS) throw new UnsupportedFormat('svgz-unsupported');
  const stream = new Blob([u]).stream().pipeThrough(new DS('gzip'));
  // Gzip-bomb guard (M6): stop inflating past SVGZ_MAX_BYTES instead of filling the worker.
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > SVGZ_MAX_BYTES) {
      void reader.cancel();
      const e = new Error(
        `the compressed SVG inflates past ${SVGZ_MAX_BYTES / 1048576} MB; export it as a plain SVG of the pattern pieces only`,
      );
      e.name = 'InputTooLarge';
      throw e;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Largest inflated .svgz the importer accepts. */
export const SVGZ_MAX_BYTES = 64 * 1024 * 1024;
