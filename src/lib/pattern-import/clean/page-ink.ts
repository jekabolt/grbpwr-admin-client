// clean/ (STOPS) — what the line work on a page set aside IS, without the AI. The archive (692 PDFs,
// auto/ARCHIVE-RUN-2.md) stopped 358 files on "page N was set aside as instructions but holds line
// work — is it a pattern page?": a page the classifier read as instructions / cover / overview
// whose lines are long or closed. Read on 24 of them (scripts/pattern-import/page-ink-entry.ts),
// that line work is, every time, one of:
//   · rules — a table's grid, a separator, the page's trim line: straight, axis-parallel, open;
//   · frames — a text box, a table's outline, the cells of the tile-assembly map: an axis-parallel
//     rectangle that holds a table (≥ 2 rules / frames) or, in a pen the tiles do not use, words or
//     a drawing (a rectangle in the pattern's pen holding nothing may be a waistband);
//   · the test square — 2 in / 5 cm …, with a scale word on the page;
//   · reduced copies — the pieces at 1:5…1:25 (the pieces index, the tile map, the graded nest of a
//     pieces inventory): outlines at one scale ≤ 0.35 shaped as ≥ 2 different tile pieces;
//   · drawings — the garment flats and the sewing-step sketches: small (≤ 0.6 of the page's short
//     side, ≤ 0.75 of its long side in a hairline), drawn with a pen no line of the tile sheet is
//     drawn with, and — a closed piece-sized one — a hairline or full of inner detail.
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
  /** A reduced copy draws the piece at most at this scale (`AI_PAGES.copyMaxScale`) … */
  copyMaxScale: 0.35,
  /** … as outlines of at least this many DIFFERENT tile pieces at one scale (Codex: never one). */
  copyMinPieces: 2,
  /** A piece-sized closed drawing in a pen thicker than a hairline holds this many lines inside. */
  drawingDetail: 6,
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

/** An axis-parallel rectangle (a frame, a cell, a label box). */
const isRect = (c: Chain, b: PageChains['box'][number]) =>
  c.closed &&
  axisShare(c.pts, true) >= PAGE_INK.frameAxis &&
  areaOf(c.pts) >= PAGE_INK.frameFill * (b.maxX - b.minX) * (b.maxY - b.minY);

/**
 * The line pens of a file's tile sheet: the pens of its long / piece-sized lines (fill-only glyph
 * shapes are no pen; nor are a pen's rectangles alone — the label boxes and frames a tile repeats:
 * a rectangular piece is drawn with the pen of the sheet's curved pieces). A pen here is the pattern's — a curve drawn with it on a page set aside may
 * be a piece.
 */
export function tilePensOf(
  tiles: readonly PageChains[],
  /** Per tile, the chains proven page furniture (tile frames, trim lines, the print grid). */
  furniture: readonly (ReadonlySet<number> | undefined)[] = [],
): Pen[] {
  const out: Pen[] = [];
  for (const [k, pc] of tiles.entries()) {
    const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
    for (const [i, c] of pc.chains.entries()) {
      if (!isPatternLike(c) || furniture[k]?.has(i) || isRect(c, pc.box[i])) continue;
      const p = penOf(styles.get(c.style), c);
      if (p && !out.some((o) => samePen(o, p))) out.push(p);
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

/** Words on a page that name a test square (the square is then a scale check, not a piece). */
const SQUARE_WORDS =
  /\b(square|inch(es)?|test|quadrat\w*|carr[eé]\w*|cuadrado|kontroll\w*|квадрат\w*|kwadrat\w*)\b/i;

/**
 * The page's long / piece-sized lines, each explained as a rule, a frame, a test square, a reduced
 * copy of the tile pieces or a small drawing in a pen the tiles do not use (see the header). Codex
 * review (majors): a rectangle is a frame only when it holds a table or words in a foreign pen (a
 * waistband is a rectangle in the pattern's pen); a square only with a scale word on the page; a
 * reduced copy only as outlines of ≥ 2 different tile pieces at one scale; a piece-sized closed
 * drawing only in a hairline or with the inner detail of a drawing; nothing off the page.
 */
export function pageInk(
  pc: PageChains,
  tilePens: readonly Pen[],
  tileShapes: readonly Shape[],
  page: Pick<IRPage, 'widthMm' | 'heightMm'>,
): PageInk {
  const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
  const counts: Partial<Record<InkKind, number>> = {};
  let penFrame = false;
  const drawMax = PAGE_INK.drawingMaxShare * Math.min(page.widthMm, page.heightMm);
  const hairMax = PAGE_INK.hairlineMaxShare * Math.max(page.widthMm, page.heightMm);
  const tilePen = (p: Pen | null) => !!p && tilePens.some((t) => samePen(p, t));
  const fmtPen = (p: Pen | null) =>
    p
      ? `${p.w.toFixed(2)} mm${p.dashed ? ' dashed' : ''}${p.rgb ? ` rgb(${p.rgb.join(',')})` : ''}`
      : 'no pen';
  const words = pc.page.texts.filter((t) => !t.background && t.text.trim());
  const scaleWord = SQUARE_WORDS.test(words.map((t) => t.text).join(' '));
  type Box = PageChains['box'][number];
  const inside = (o: Box, b: Box, tol = 1) =>
    o.minX >= b.minX - tol &&
    o.maxX <= b.maxX + tol &&
    o.minY >= b.minY - tol &&
    o.maxY <= b.maxY + tol;
  /** Chains (any length ≥ 3 mm) lying inside box `b`, the chain itself left out. */
  const detailIn = (b: Box, self: number) =>
    pc.chains.filter((c, j) => j !== self && c.lengthMm >= 3 && inside(pc.box[j], b)).length;
  const textIn = (b: Box) =>
    words.filter(
      (t) =>
        t.anchor.x > b.minX && t.anchor.x < b.maxX && t.anchor.y > b.minY && t.anchor.y < b.maxY,
    ).length;

  type Item = {
    i: number;
    kind: InkKind | null;
    /** A rectangle waiting for its contents (a table, words) to decide it. */
    frame?: { pen: Pen | null; piece: boolean };
    copy?: { s: number; t: number };
    why?: string;
  };
  const items: Item[] = [];
  pc.chains.forEach((c, i) => {
    if (!isPatternLike(c)) return;
    const b = pc.box[i];
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const pen = penOf(styles.get(c.style), c);
    const head = `a ${c.closed ? 'closed outline' : 'line'} ${Math.round(c.lengthMm)} mm long, ${Math.round(w)}×${Math.round(h)} mm`;
    const ax = axisShare(c.pts, c.closed);
    // a straight rule (a table's, a separator, the trim line at the page's edge) in any pen
    if (!c.closed && ax >= PAGE_INK.ruleAxis && Math.min(w, h) <= PAGE_INK.ruleThinMm)
      return items.push({ i, kind: 'rule' });
    // drawn off the page (clipped away on paper): nothing on paper says what it is
    if (b.minX < -1 || b.minY < -1 || b.maxX > page.widthMm + 1 || b.maxY > page.heightMm + 1)
      return items.push({ i, kind: null, why: `${head}, drawn off the page` });
    if (!c.closed) {
      // a bent orthogonal line (a bracket, a table corner) only in a pen the tiles do not use
      if (ax >= 0.999 && pen && !tilePen(pen)) return items.push({ i, kind: 'rule' });
    } else {
      const a = areaOf(c.pts);
      if (ax >= PAGE_INK.frameAxis && a >= PAGE_INK.frameFill * w * h) {
        if (squareSide(w, h) && scaleWord) return items.push({ i, kind: 'square' });
        return items.push({ i, kind: null, frame: { pen, piece: a >= PAGE_INK.pieceMm2 } });
      }
      // a tile piece at a reduced scale: the best shape match, decided with the page's others
      const hu = a >= REDUCED_COPY.minOverviewMm2 ? outlineHu(c.pts) : null;
      let best: { s: number; t: number; d: number } | null = null;
      if (hu)
        tileShapes.forEach((t, k) => {
          const sc = Math.sqrt(a / t.areaMm2);
          if (sc < REDUCED_COPY.minScale || sc > PAGE_INK.copyMaxScale) return;
          const d = Math.max(...hu.map((v, j) => Math.abs(v - t.hu[j])));
          if (d <= REDUCED_COPY.sameShape && (!best || d < best.d)) best = { s: sc, t: k, d };
        });
      const bb = best as { s: number; t: number; d: number } | null;
      if (bb) return items.push({ i, kind: null, copy: { s: bb.s, t: bb.t } });
    }
    const max = pen && pen.w <= PAGE_INK.hairlineMm ? Math.max(drawMax, hairMax) : drawMax;
    const small = Math.max(w, h) <= max;
    if (small && pen && !tilePen(pen)) {
      // a piece-sized closed drawing: a hairline, or the inner detail of a garment drawing
      // (seams, topstitching, buttons) — a pocket in a pen of its own has neither
      const pieceSized = c.closed && areaOf(c.pts) >= PAGE_INK.pieceMm2;
      if (!pieceSized || pen.w <= PAGE_INK.hairlineMm || detailIn(b, i) >= PAGE_INK.drawingDetail)
        return items.push({ i, kind: 'drawing' });
      return items.push({
        i,
        kind: null,
        why: `${head}, ${fmtPen(pen)}, a closed outline with little inside (not a drawing's detail)`,
      });
    }
    items.push({
      i,
      kind: null,
      why: `${head}, ${
        !pen
          ? 'filled'
          : tilePen(pen)
            ? `drawn with the tile sheet's pen (${fmtPen(pen)})`
            : `${fmtPen(pen)}, larger than a drawing (${Math.round(max)} mm)`
      }${c.closed ? ', no tile piece reduced' : ''}`,
    });
  });
  // reduced copies: outlines at one scale (the median's spread) of ≥ 2 different tile pieces
  const cand = items.filter((x) => x.copy);
  if (cand.length) {
    const sc = cand.map((x) => x.copy!.s).sort((a, b) => a - b);
    const med = sc[Math.floor(sc.length / 2)];
    const agree = cand.filter(
      (x) => x.copy!.s / med <= REDUCED_COPY.maxSpread && med / x.copy!.s <= REDUCED_COPY.maxSpread,
    );
    const kinds: number[][] = [];
    for (const x of agree) {
      const hu = tileShapes[x.copy!.t].hu;
      if (!kinds.some((k) => k.every((v, j) => Math.abs(v - hu[j]) <= REDUCED_COPY.sameShape)))
        kinds.push(hu);
    }
    const ok = agree.length >= PAGE_INK.copyMinPieces && kinds.length >= PAGE_INK.copyMinPieces;
    for (const x of cand) {
      const c = pc.chains[x.i];
      if (ok && agree.includes(x)) x.kind = 'copy';
      else
        x.why = `a closed outline ${Math.round(c.lengthMm)} mm long, one tile piece's shape at 1:${Math.round(1 / x.copy!.s)} but not one of ≥ ${PAGE_INK.copyMinPieces} different tile pieces reduced at one scale`;
    }
  }
  // frames: a table (≥ 2 rules / frames inside it), or words / a drawing inside in a foreign pen
  const ruled = items.filter((x) => x.kind === 'rule' || x.frame);
  for (const x of items) {
    if (!x.frame) continue;
    const b = pc.box[x.i];
    const table = ruled.filter((y) => y !== x && inside(pc.box[y.i], b)).length >= 2;
    const foreign = !!x.frame.pen && !tilePen(x.frame.pen);
    if (table || (foreign && (textIn(b) >= 1 || detailIn(b, x.i) >= 1))) {
      x.kind = 'frame';
      if (x.frame.piece && !foreign) penFrame = true;
    } else {
      const c = pc.chains[x.i];
      x.why = `a rectangle ${Math.round(b.maxX - b.minX)}×${Math.round(b.maxY - b.minY)} mm (${fmtPen(x.frame.pen)}${foreign ? '' : ", the tile sheet's pen"}) that frames no table${foreign ? ' and no words' : ''} — it may be a piece (${Math.round(c.lengthMm)} mm)`;
    }
  }
  const first = items.find((x) => !x.kind);
  for (const x of items) if (x.kind) counts[x.kind] = (counts[x.kind] ?? 0) + 1;
  const wordsOf: Record<InkKind, string> = {
    rule: 'table rules / separators',
    frame: 'frames',
    square: 'test square',
    copy: 'tile pieces reduced',
    drawing: 'drawings in pens the tiles do not use',
  };
  return {
    explained:
      first || !items.length
        ? null
        : (Object.keys(counts) as InkKind[]).map((k) => `${counts[k]} ${wordsOf[k]}`).join(', '),
    unexplained: first ? first.why ?? 'unexplained' : null,
    penFrame,
    counts,
  };
}
