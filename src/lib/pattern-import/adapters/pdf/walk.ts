// One page's operator list → IR paths + raster placements + text-run origins (F1).
//
// What this walker keeps that the Ф0 probes proved necessary:
//  - the CTM through q/Q, `cm`, form XObjects (their /Matrix AND their /BBox as a clip) and
//    annotation appearance streams;
//  - line width and dash from `w`/`d` AND from ExtGState (`gs` LW/D), converted to mm with the
//    CTM in force at the PAINT operator (that is when PDF applies them);
//  - the optional-content (OCG) stack from marked content, kept SEPARATE from the q/Q graphics
//    state — BDC/EMC nest independently of q/Q in real files;
//  - colours as pdf.js 4.10 sends them (Uint8ClampedArray rgb 0..255; hex strings in 5.x);
//  - pdf.js 4.10 `constructPath` args `[ops, flatArgs, minMax]`.
// Clip is RECORDED on the style, never applied (contract §1, Codex H6).

import type { BoxMm, IRPath, PtMm, Style, WorkBudgetLike } from 'lib/pattern-import/types';

import {
  apply,
  boxOfPts,
  boxOfRect,
  flattenCubic,
  intersectBox,
  linScale,
  mul,
  type M6,
} from './geom';

type Ops = Record<string, number>;

/** Operator-list slice of pdf.js' `PDFOperatorList`. */
export type OpList = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> };

export type OcResolver = (props: unknown) => string | null;

/** A placed image, before pixel lookup. `objId` null = inline image (data in `inline`). */
export type RasterPlacement = {
  op: number;
  objId: string | null;
  inline: unknown;
  widthPx: number;
  heightPx: number;
  /** Image unit square → page mm. */
  m: M6;
  bbox: BoxMm;
  layer: string | null;
};

/** Origin of a text-showing run (page mm) with the OCG in force — used to give IRText a layer. */
export type TextRun = { x: number; y: number; layer: string | null };

export type WalkOut = {
  paths: Omit<IRPath, 'id'>[];
  styles: Style[];
  rasters: RasterPlacement[];
  textRuns: TextRun[];
  layersUsed: Set<string>;
  clipCount: number;
  /** Paint ops whose path was dropped (keepFills = false). */
  droppedFills: number;
};

type GState = {
  ctm: M6;
  lw: number;
  dash: number[] | null;
  stroke: [number, number, number] | null;
  fill: [number, number, number] | null;
  clip: BoxMm | null;
  clipId: string | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function rgbOf(a: unknown): [number, number, number] | null {
  if (typeof a === 'string') {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(a);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
  }
  if (a && typeof a === 'object' && 'length' in a) {
    const arr = Array.from(a as ArrayLike<unknown>);
    if (typeof arr[0] === 'string') return rgbOf(arr[0]);
    if (arr.length >= 3 && arr.slice(0, 3).every((v) => typeof v === 'number')) {
      return [
        Math.round(arr[0] as number),
        Math.round(arr[1] as number),
        Math.round(arr[2] as number),
      ];
    }
  }
  return null;
}

function dashOf(v: unknown): number[] | null {
  if (!v || typeof v !== 'object' || !('length' in v)) return null;
  const arr = Array.from(v as ArrayLike<number>).filter((x) => typeof x === 'number');
  if (!arr.length || arr.every((x) => x === 0)) return null;
  return arr;
}

export type WalkOpts = {
  ops: Ops;
  file: string;
  page: number;
  /** User space → page mm (y-up, origin at the view box's lower-left). */
  base: M6;
  sagittaMm: number;
  keepFills: boolean;
  ocName: OcResolver;
  /** C4: points made here are spent from it (adapters/budget.ts). */
  budget?: WorkBudgetLike;
};

export function walkOperatorList(ol: OpList, o: WalkOpts): WalkOut {
  const { ops: OPS, base } = o;
  const out: WalkOut = {
    paths: [],
    styles: [],
    rasters: [],
    textRuns: [],
    layersUsed: new Set(),
    clipCount: 0,
    droppedFills: 0,
  };
  const styleIds = new Map<string, number>();
  const styleOf = (s: Omit<Style, 'id'>): number => {
    const key = JSON.stringify(s);
    let id = styleIds.get(key);
    if (id === undefined) {
      id = out.styles.length;
      styleIds.set(key, id);
      out.styles.push({ id, ...s });
    }
    return id;
  };

  let st: GState = {
    ctm: base,
    lw: 1,
    dash: null,
    stroke: [0, 0, 0],
    fill: [0, 0, 0],
    clip: null,
    clipId: null,
  };
  const stack: GState[] = [];
  // Marked-content stack: one entry per BMC/BDC; OC entries carry the OCG name, others null.
  const mc: (string | null)[] = [];
  const layer = (): string | null => {
    for (let k = mc.length - 1; k >= 0; k--) if (mc[k] !== null) return mc[k];
    return null;
  };

  // Pending path between constructPath and its paint op: flattened subpaths in page mm.
  let pending: { pts: PtMm[]; closed: boolean }[] = [];
  let pendingClip = false;
  let groupBbox: unknown = null;

  // Text state for run origins (only positions; glyph advances are not modelled).
  let tm: M6 = [1, 0, 0, 1, 0, 0];
  let tlm: M6 = [1, 0, 0, 1, 0, 0];
  let leading = 0;

  const setClip = (b: BoxMm, tag: string) => {
    const c = intersectBox(st.clip, b);
    st.clip = c;
    st.clipId = `${tag}:${r2(c.minX)},${r2(c.minY)},${r2(c.maxX)},${r2(c.maxY)}`;
    out.clipCount++;
  };

  const emit = (op: number, stroked: boolean, filled: boolean, closeFirst: boolean) => {
    if (closeFirst) for (const s of pending) if (s.pts.length > 2) s.closed = true;
    if (!stroked && filled && !o.keepFills) {
      out.droppedFills++;
      return;
    }
    const L = layer();
    if (L) out.layersUsed.add(L);
    const sc = linScale(st.ctm);
    const style = styleOf({
      strokeRgb: stroked ? st.stroke : st.fill,
      widthMm: stroked ? st.lw * sc : 0,
      dash: stroked && st.dash ? st.dash.map((v) => v * sc) : null,
      layer: L,
      fill: filled,
      clip: st.clipId,
    });
    pending.forEach((s, sub) => {
      if (s.pts.length < 2) return;
      out.paths.push({
        pts: s.pts,
        closed: s.closed,
        style,
        src: { file: o.file, page: o.page, op, sub },
      });
    });
  };

  const build = (pathOps: ArrayLike<number>, args: ArrayLike<number>) => {
    const m = st.ctm;
    let j = 0;
    let cur: { pts: PtMm[]; closed: boolean } | null = null;
    let start: PtMm | null = null;
    const last = (): PtMm =>
      cur && cur.pts.length ? cur.pts[cur.pts.length - 1] : start ?? { x: 0, y: 0 };
    const ensure = () => {
      if (!cur) {
        // lineTo/curveTo after closePath (or without moveTo) starts a new subpath at the last start.
        cur = { pts: [start ?? { x: 0, y: 0 }], closed: false };
        pending.push(cur);
      }
      return cur;
    };
    // C4: one constructPath can hold a million curves of up to 4096 points each — paid as made.
    let made = 0;
    const curve = (fl: (out: PtMm[]) => void) => {
      const out = ensure().pts;
      const n0 = out.length;
      fl(out);
      made += out.length - n0;
    };
    for (let k = 0; k < pathOps.length; k++) {
      const op = pathOps[k];
      if (made > 4096) {
        o.budget?.spend(made, `the paths of page ${o.page + 1}`);
        made = 0;
      }
      if (op === OPS.moveTo) {
        start = apply(m, args[j], args[j + 1]);
        cur = { pts: [start], closed: false };
        pending.push(cur);
        made++;
        j += 2;
      } else if (op === OPS.lineTo) {
        ensure().pts.push(apply(m, args[j], args[j + 1]));
        made++;
        j += 2;
      } else if (op === OPS.curveTo) {
        const p0 = last();
        curve((out) =>
          flattenCubic(
            p0,
            apply(m, args[j], args[j + 1]),
            apply(m, args[j + 2], args[j + 3]),
            apply(m, args[j + 4], args[j + 5]),
            o.sagittaMm,
            out,
          ),
        );
        j += 6;
      } else if (op === OPS.curveTo2) {
        // `v`: first control point = current point.
        const p0 = last();
        curve((out) =>
          flattenCubic(
            p0,
            p0,
            apply(m, args[j], args[j + 1]),
            apply(m, args[j + 2], args[j + 3]),
            o.sagittaMm,
            out,
          ),
        );
        j += 4;
      } else if (op === OPS.curveTo3) {
        // `y`: second control point = end point.
        const p0 = last();
        const p3 = apply(m, args[j + 2], args[j + 3]);
        curve((out) => flattenCubic(p0, apply(m, args[j], args[j + 1]), p3, p3, o.sagittaMm, out));
        j += 4;
      } else if (op === OPS.closePath) {
        if (cur) {
          cur.closed = true;
          start = cur.pts[0];
        }
        cur = null;
      } else if (op === OPS.rectangle) {
        const x = args[j];
        const y = args[j + 1];
        const w = args[j + 2];
        const h = args[j + 3];
        const r = {
          pts: [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)],
          closed: true,
        };
        pending.push(r);
        start = r.pts[0];
        cur = null;
        made += 4;
        j += 4;
      }
    }
    o.budget?.spend(made, `the paths of page ${o.page + 1}`);
  };

  const fnArray = ol.fnArray;
  const argsArray = ol.argsArray;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ...st });
        break;
      case OPS.restore:
        st = stack.pop() ?? st;
        break;
      case OPS.transform:
        st.ctm = mul(st.ctm, a as number[]);
        break;
      case OPS.beginGroup: {
        const g = a[0] as { bbox?: unknown } | undefined;
        groupBbox = g?.bbox ?? null;
        break;
      }
      case OPS.endGroup:
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...st });
        const matrix = a[0] as number[] | null;
        if (matrix && matrix.length === 6) st.ctm = mul(st.ctm, matrix);
        const bbox = (a[1] as number[] | null) ?? (groupBbox as number[] | null);
        groupBbox = null;
        if (bbox && bbox.length === 4) setClip(boxOfRect(st.ctm, bbox), `f${i}`);
        break;
      }
      case OPS.paintFormXObjectEnd:
        st = stack.pop() ?? st;
        break;
      case OPS.beginAnnotation: {
        // [id, rect, transform, matrix, hasOwnCanvas]; appearance starts from the page default.
        stack.push({ ...st });
        const rect = a[1] as number[] | null;
        st = { ...st, ctm: base, clip: null, clipId: null };
        if (rect && rect.length === 4) setClip(boxOfRect(base, rect), `a${i}`);
        if (Array.isArray(a[2])) st.ctm = mul(st.ctm, a[2] as number[]);
        if (Array.isArray(a[3])) st.ctm = mul(st.ctm, a[3] as number[]);
        break;
      }
      case OPS.endAnnotation:
        st = stack.pop() ?? st;
        break;
      case OPS.setLineWidth:
        st.lw = a[0] as number;
        break;
      case OPS.setDash:
        st.dash = dashOf(a[0]);
        break;
      case OPS.setGState:
        for (const [k, v] of (a[0] as [string, unknown][]) ?? []) {
          if (k === 'LW' && typeof v === 'number') st.lw = v;
          else if (k === 'D' && Array.isArray(v)) st.dash = dashOf(v[0]);
        }
        break;
      case OPS.setStrokeRGBColor:
        st.stroke = rgbOf(a);
        break;
      case OPS.setFillRGBColor:
        st.fill = rgbOf(a);
        break;
      case OPS.setStrokeColorN:
      case OPS.setStrokeColor:
        // pdf.js 4.10 converts plain colours to RGB ops; what is left here is a pattern/shading.
        st.stroke = rgbOf(a);
        break;
      case OPS.setFillColorN:
      case OPS.setFillColor:
        st.fill = rgbOf(a);
        break;
      case OPS.beginMarkedContentProps:
        mc.push(a[0] === 'OC' ? o.ocName(a[1]) : null);
        break;
      case OPS.beginMarkedContent:
        mc.push(null);
        break;
      case OPS.endMarkedContent:
        mc.pop();
        break;
      case OPS.constructPath:
        build(a[0] as ArrayLike<number>, a[1] as ArrayLike<number>);
        break;
      case OPS.clip:
      case OPS.eoClip:
        pendingClip = true;
        break;
      case OPS.stroke:
        emit(i, true, false, false);
        break;
      case OPS.closeStroke:
        emit(i, true, false, true);
        break;
      case OPS.fill:
      case OPS.eoFill:
        emit(i, false, true, true);
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
        emit(i, true, true, true);
        break;
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        emit(i, true, true, true);
        break;
      case OPS.endPath:
        break;
      case OPS.beginText:
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
        break;
      case OPS.setTextMatrix:
        tm = (a as number[]).slice(0, 6) as M6;
        tlm = tm;
        break;
      case OPS.setLeading:
        leading = a[0] as number;
        break;
      case OPS.moveText:
      case OPS.setLeadingMoveText:
        if (fn === OPS.setLeadingMoveText) leading = -(a[1] as number);
        tlm = mul(tlm, [1, 0, 0, 1, a[0] as number, a[1] as number]);
        tm = tlm;
        break;
      case OPS.nextLine:
      case OPS.nextLineShowText:
      case OPS.nextLineSetSpacingShowText:
        tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]);
        tm = tlm;
        if (fn !== OPS.nextLine) recordRun();
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        recordRun();
        break;
      case OPS.paintImageXObject:
        placeImage(i, (a[0] as string) ?? null, null, a[1] as number, a[2] as number, st.ctm);
        break;
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject: {
        const img = a[0] as { width?: number; height?: number } | undefined;
        placeImage(i, null, img, img?.width ?? 0, img?.height ?? 0, st.ctm);
        break;
      }
      case OPS.paintImageXObjectRepeat: {
        // [objId, scaleX, scaleY, positions]
        const pos = (a[3] as ArrayLike<number>) ?? [];
        for (let k = 0; k + 1 < pos.length; k += 2) {
          const m = mul(st.ctm, [a[1] as number, 0, 0, a[2] as number, pos[k], pos[k + 1]]);
          placeImage(i, a[0] as string, null, 0, 0, m);
        }
        break;
      }
      default:
        break;
    }
    // A clip takes effect after the painting operator that ends its path (`W n`, `W f`, …).
    if (
      fn === OPS.endPath ||
      fn === OPS.stroke ||
      fn === OPS.closeStroke ||
      fn === OPS.fill ||
      fn === OPS.eoFill ||
      fn === OPS.fillStroke ||
      fn === OPS.eoFillStroke ||
      fn === OPS.closeFillStroke ||
      fn === OPS.closeEOFillStroke
    ) {
      if (pendingClip) {
        const all = pending.flatMap((s) => s.pts);
        if (all.length) setClip(boxOfPts(all), `c${i}`);
        pendingClip = false;
      }
      pending = [];
    }
  }
  return out;

  function recordRun() {
    const p = apply(mul(st.ctm, tm), 0, 0);
    out.textRuns.push({ x: p.x, y: p.y, layer: layer() });
  }

  function placeImage(
    op: number,
    objId: string | null,
    inline: unknown,
    w: number,
    h: number,
    m: M6,
  ) {
    const L = layer();
    if (L) out.layersUsed.add(L);
    out.rasters.push({
      op,
      objId,
      inline,
      widthPx: w,
      heightPx: h,
      m,
      bbox: boxOfRect(m, [0, 0, 1, 1]),
      layer: L,
    });
  }
}
