// clean/ (STOPS) — what the line work on a page set aside IS, without the AI. The archive (692 PDFs,
// auto/ARCHIVE-RUN-2.md) stopped 358 files on "page N was set aside as instructions but holds line
// work — is it a pattern page?": a page the classifier read as instructions / cover / overview
// whose lines are long or closed. Read on 24 of them (scripts/pattern-import/page-ink-entry.ts),
// that line work is, every time, one of:
//   · rules — a table's grid, a separator, the page's trim line: straight, axis-parallel, open;
//   · frames — a text box, a table's outline, a QR frame, the 2-inch / 5 cm test square, the cells
//     of the tile-assembly map: closed axis-parallel rectangles;
//   · reduced copies — the pieces at 1:5…1:25 (the pieces index, the tile map, the graded nest of a
//     pieces inventory): the outline of one of THIS file's tile pieces at scale ≤ 0.35;
//   · drawings — the garment flats and the sewing-step sketches: small (≤ 0.6 of the page's short
//     side) and drawn with a pen no line of the tile sheet is drawn with.
// A page where EVERY long or piece-sized line is one of these is the second, geometric evidence
// that it is not pattern (the first is the classifier's text-led role). A curve at 1:1 drawn with
// the pattern's pen, a large curve, a curve that is no tile piece reduced — anything else — stays
// unexplained, and the page stays the question (a real piece on an instruction page asks).
// A file with no tile page has no pattern to compare with: nothing is explained.
import type { Chain, IRPage, PtMm, Style } from '../types';
import type { PageChains } from './page-chains';
import { outlineHu, REDUCED_COPY, type Shape } from './reduced-copy';

export const PAGE_INK = {
  /** A chain is "pattern-like" (patternLike in clean/index.ts): this long, or closed this large. */
  longMm: 100,
  pieceMm2: 400,
  /** Axis-parallel share of a rule's / frame's length. */
  ruleAxis: 0.98,
  frameAxis: 0.9,
  /** A straight rule's box is at most this thin. */
  ruleThinMm: 1.5,
  /** A frame fills at least this share of its box (a rectangle; `REDUCED_COPY.rectFill`). */
  frameFill: 0.93,
  /** A drawing's extent is at most this share of the page's shorter side … */
  drawingMaxShare: 0.6,
  /** … or, drawn with a hairline (≤ `hairlineMm`), this share of its longer side (a full-length
   *  flat of a midi dress: Amalfi MDF536, 188 mm on letter). */
  hairlineMm: 0.15,
  hairlineMaxShare: 0.75,
  /** A reduced copy draws the piece at most at this scale (`AI_PAGES.copyMaxScale`). */
  copyMaxScale: 0.35,
  /** Pens: same stroke width within max(abs, rel × width), colour within this per channel. */
  penWidthAbsMm: 0.02,
  penWidthRel: 0.1,
  penRgb: 12,
  /** Test squares: sides within this share of 25.4·k or 10·k mm. */
  squareTol: 0.015,
};

/** A pen: what a line is drawn with (stroke width, colour, dashed or not). Fill-only = no pen. */
export type Pen = { w: number; rgb: [number, number, number] | null; dashed: boolean };

const penOf = (st: Style | undefined, ch: Chain): Pen | null =>
  !st || (st.fill && !(st.widthMm > 0))
    ? null
    : { w: st.widthMm, rgb: st.strokeRgb, dashed: !!(st.dash?.length || ch.motif?.length) };

const samePen = (a: Pen, b: Pen) =>
  a.dashed === b.dashed &&
  Math.abs(a.w - b.w) <= Math.max(PAGE_INK.penWidthAbsMm, PAGE_INK.penWidthRel * b.w) &&
  (!a.rgb || !b.rgb
    ? a.rgb === b.rgb
    : a.rgb.every((v, k) => Math.abs(v - b.rgb![k]) <= PAGE_INK.penRgb));

const areaOf = (q: readonly PtMm[]) => {
  let a = 0;
  for (let k = 0, j = q.length - 1; k < q.length; j = k++)
    a += (q[j].x + q[k].x) * (q[j].y - q[k].y);
  return Math.abs(a) / 2;
};

/** Share of a polyline's length that runs within 1.5° of the page axes. */
export function axisShare(q: readonly PtMm[], closed: boolean): number {
  let ax = 0;
  let all = 0;
  const n = closed ? q.length : q.length - 1;
  for (let k = 0; k < n; k++) {
    const a = q[k];
    const b = q[(k + 1) % q.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    all += l;
    const ang = (Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) * 180) / Math.PI;
    if (Math.min(ang % 90, 90 - (ang % 90)) <= 1.5) ax += l;
  }
  return all ? ax / all : 0;
}

const isPatternLike = (c: Chain) =>
  c.lengthMm >= PAGE_INK.longMm || (c.closed && areaOf(c.pts) >= PAGE_INK.pieceMm2);

/**
 * The line pens of a file's tile sheet: the pens of its long / piece-sized lines (fill-only glyph
 * shapes are no pen). A pen here is the pattern's — a curve drawn with it on a page set aside may
 * be a piece.
 */
export function tilePensOf(tiles: readonly PageChains[]): Pen[] {
  const out: Pen[] = [];
  for (const pc of tiles) {
    const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
    for (const c of pc.chains) {
      if (!isPatternLike(c)) continue;
      const p = penOf(styles.get(c.style), c);
      if (p && !out.some((o) => samePen(o, p))) out.push(p);
      if (out.length >= 64) return out;
    }
  }
  return out;
}

/** 25.4·k (k = 1…4) or 10·k (k = 2…10) mm within `squareTol`: a test square's side. */
function squareSide(w: number, h: number): number | null {
  if (Math.abs(w - h) > PAGE_INK.squareTol * Math.max(w, h)) return null;
  const s = (w + h) / 2;
  const sides = [25.4, 50.8, 76.2, 101.6, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return sides.find((x) => Math.abs(s - x) <= PAGE_INK.squareTol * x) ?? null;
}

export type InkKind = 'rule' | 'frame' | 'square' | 'copy' | 'drawing';

export type PageInk = {
  /** Every long / piece-sized line explained: the counts by kind, in words. Null = not all. */
  explained: string | null;
  /** The first line nothing explains, in words (the question says what it is). */
  unexplained: string | null;
  /** A piece-sized rectangle drawn with the tile sheet's pen was taken as a frame (a waistband
   *  could be one): the assumption is strong. */
  penFrame: boolean;
  counts: Partial<Record<InkKind, number>>;
};

/**
 * The page's long / piece-sized lines, each explained as a rule, a frame, a test square, a reduced
 * copy of a tile piece or a small drawing in a pen the tiles do not use (see the header).
 */
export function pageInk(
  pc: PageChains,
  tilePens: readonly Pen[],
  tileShapes: readonly Shape[],
  page: Pick<IRPage, 'widthMm' | 'heightMm'>,
): PageInk {
  const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
  const counts: Partial<Record<InkKind, number>> = {};
  let unexplained: string | null = null;
  let penFrame = false;
  const drawMax = PAGE_INK.drawingMaxShare * Math.min(page.widthMm, page.heightMm);
  const tilePen = (p: Pen | null) => !!p && tilePens.some((t) => samePen(p, t));
  const fmtPen = (p: Pen | null) =>
    p
      ? `${p.w.toFixed(2)} mm${p.dashed ? ' dashed' : ''}${p.rgb ? ` rgb(${p.rgb.join(',')})` : ''}`
      : 'no pen';
  pc.chains.forEach((c, i) => {
    if (unexplained || !isPatternLike(c)) return;
    const b = pc.box[i];
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const ax = axisShare(c.pts, c.closed);
    const pen = penOf(styles.get(c.style), c);
    const add = (k: InkKind) => (counts[k] = (counts[k] ?? 0) + 1);
    if (!c.closed) {
      if (ax >= PAGE_INK.ruleAxis && (Math.min(w, h) <= PAGE_INK.ruleThinMm || ax >= 0.999))
        return add('rule');
    } else {
      const a = areaOf(c.pts);
      if (ax >= PAGE_INK.frameAxis && a >= PAGE_INK.frameFill * w * h) {
        if (squareSide(w, h)) return add('square');
        if (a >= PAGE_INK.pieceMm2 && tilePen(pen)) penFrame = true;
        return add('frame');
      }
      // a tile piece at a reduced scale (the pieces index, the tile map, a graded nest)
      const hu = a >= REDUCED_COPY.minOverviewMm2 ? outlineHu(c.pts) : null;
      if (
        hu &&
        tileShapes.some((t) => {
          const s = Math.sqrt(a / t.areaMm2);
          return (
            s >= REDUCED_COPY.minScale &&
            s <= PAGE_INK.copyMaxScale &&
            Math.max(...hu.map((v, k) => Math.abs(v - t.hu[k]))) <= REDUCED_COPY.sameShape
          );
        })
      )
        return add('copy');
    }
    const hairMax = PAGE_INK.hairlineMaxShare * Math.max(page.widthMm, page.heightMm);
    const max = pen && pen.w <= PAGE_INK.hairlineMm ? Math.max(drawMax, hairMax) : drawMax;
    if (Math.max(w, h) <= max && pen && !tilePen(pen)) return add('drawing');
    unexplained = `a ${c.closed ? 'closed outline' : 'line'} ${Math.round(c.lengthMm)} mm long, ${Math.round(w)}×${Math.round(h)} mm, ${
      !pen
        ? 'filled'
        : tilePen(pen)
          ? `drawn with the tile sheet's pen (${fmtPen(pen)})`
          : `${fmtPen(pen)}, larger than a drawing (${Math.round(max)} mm)`
    }${c.closed ? ', no tile piece reduced' : ''}`;
  });
  const words: Record<InkKind, string> = {
    rule: 'table rules / separators',
    frame: 'frames',
    square: 'test square',
    copy: 'tile pieces reduced',
    drawing: 'drawings in pens the tiles do not use',
  };
  const n = Object.values(counts).reduce((x, y) => x + (y ?? 0), 0);
  return {
    explained:
      unexplained || !n
        ? null
        : (Object.keys(counts) as InkKind[]).map((k) => `${counts[k]} ${words[k]}`).join(', '),
    unexplained,
    penFrame,
    counts,
  };
}
