// clean/ (STOPS) — what the line work on a page set aside IS, without the AI. The archive (692 PDFs,
// auto/ARCHIVE-RUN-2.md) stopped 358 files on "page N was set aside as instructions but holds line
// work — is it a pattern page?": a page the classifier read as instructions / cover / overview
// whose lines are long or closed. Read on 24 of them (scripts/pattern-import/page-ink-entry.ts),
// that line work is, every time, one of:
//   · rules — a table's grid, a separator, the page's trim line: straight, axis-parallel, open
//     (on the page or past its edge), or a closed bar ≤ 3 mm thin;
//   · frames — a text box, a table's outline, the cells of the tile-assembly map: an axis-parallel
//     rectangle in a pen the tiles do not use, holding words or lines (a rectangle in the
//     pattern's pen may be a waistband, whatever lies in it — unless what lies in it says what it
//     is in any pen: a size line key, the tile-assembly map, a code stamp);
//   · the test square — 2 in / 5 cm …, where text near it prints its own dimension;
//   · reduced copies — the pieces at 1:5…1:25 (the pieces index, the tile map, the graded nest of a
//     pieces inventory): outlines at one scale ≤ 0.35 shaped as ≥ 2 different tile pieces;
//   · drawings — the garment flats and the sewing-step sketches: small (≤ 0.6 of the page's short
//     side, ≤ 0.75 of its long side in a hairline), drawn with a pen no line of the tile sheet is
//     drawn with, and — a closed piece-sized one — full of inner detail (seams, buttons), toned
//     underneath (a tinted fill or a raster clipped to it) or a part of such a drawing in its pen.
// A page where EVERY long or piece-sized line is one of these is the second, geometric evidence
// that it is not pattern (the first is the classifier's text-led role). A curve at 1:1 drawn with
// the pattern's pen, a large curve, a curve that is no tile piece reduced — anything else — stays
// unexplained, and the page stays the question (a real piece on an instruction page asks).
// A file with no tile page has no pattern to compare with: nothing is explained.
import type { Chain, IRPage, PtMm, Style } from '../types';
import { bboxOf } from '../chains/geom';
import { parseSizeToken } from '../sizes/tokens';
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
  /** A closed outline at most this thin is a bar (a rule drawn as a filled box), never a piece:
   *  the narrowest cut piece — a rouleau strip — is several times wider. */
  barMm: 3,
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
  /** Dash motifs differ when an entry differs by more than this (or 25 %). */
  dashTolMm: 0.3,
  /** A chain reaching this far past the page's edge is drawn off the page. */
  offPageMm: 3,
  /** Test squares: sides within this share of 25.4·k or 10·k mm. */
  squareTol: 0.015,
  /** A tone under a drawing: a fill-only path of the outline's box (each side within this) … */
  toneBoxMm: 1.5,
  /** … tinted: a channel below this (white masks under real pieces are common — kombinezon). */
  toneMax: 250,
  /** A raster tone (an illustration's shading, a gradient clipped to the outline — Vixen MDF371
   *  p1's open back): an image covering this share of the outline's box … */
  rasterCover: 0.75,
  /** … whose own box is at most this many times the outline's (the outline's own tone, not a
   *  photo or a page background behind it). */
  rasterBoxMax: 4,
  /** Parts of one drawing: the boxes of two outlines in one pen overlap by this share of the
   *  smaller. */
  partOverlap: 0.25,
  /** A size line key: at least this many different size labels, each beside a sample of its
   *  line (at least `keyPens` different pens). */
  keyLabels: 4,
  keyPens: 3,
  /** The tile-assembly map: at least this many tile ids (A1 … F9) in a grid, nothing else. */
  mapIds: 6,
  /** A code stamp (Mood's «PATTERNS BY mood · MDF474» badge on every page): a square at most this
   *  large (side within `stampSquare`) … */
  stampMm: 60,
  stampSquare: 0.03,
  /** … holding only the pattern's code as words and at least this many small marks (the logo's
   *  glyph outlines), each at most this share of its side. */
  stampGlyphs: 4,
  stampGlyphShare: 0.6,
};

/**
 * A pen: what a line is drawn with (stroke width, colour, dashed or not, and the dash motif).
 * Fill-only = no pen.
 */
export type Pen = {
  w: number;
  rgb: [number, number, number] | null;
  dashed: boolean;
  /** The dash motif, normalised (zero pairs dropped, one period): Mood tells sizes apart by it. */
  motif: number[] | null;
};

/** One period of a dash motif, zero entries dropped ([1.1,1.1,1.1,1.1] → [1.1,1.1]). */
function periodOf(m: readonly number[] | null | undefined): number[] | null {
  const q = (m ?? []).filter((x) => x > 0.01);
  if (q.length < 2) return null;
  for (let n = 2; n < q.length; n += 2) {
    if (q.length % n) continue;
    if (q.every((x, k) => Math.abs(x - q[k % n]) <= 0.05 * Math.max(x, q[k % n]) + 0.02))
      return q.slice(0, n);
  }
  return q;
}

const penOf = (st: Style | undefined, ch: Chain): Pen | null =>
  !st || (st.fill && !(st.widthMm > 0))
    ? null
    : {
        w: st.widthMm,
        rgb: st.strokeRgb,
        dashed: !!(st.dash?.length || ch.motif?.length),
        motif: periodOf(st.dash?.length ? st.dash : ch.motif),
      };

/** Two motifs are different only when both are known and clearly apart (length or a dash). */
const motifsApart = (a: number[] | null, b: number[] | null) =>
  !!a &&
  !!b &&
  (a.length !== b.length ||
    a.some((x, k) => Math.abs(x - b[k]) > Math.max(PAGE_INK.dashTolMm, 0.25 * Math.max(x, b[k]))));

const samePen = (a: Pen, b: Pen) =>
  a.dashed === b.dashed &&
  !motifsApart(a.motif, b.motif) &&
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
 * The line pens of a file's tile sheet: the pens of its long / piece-sized lines, proven furniture
 * aside (fill-only glyph shapes are no pen). A pen here is the pattern's — a line drawn with it on
 * a page set aside may be a piece.
 */
export function tilePensOf(
  tiles: readonly PageChains[],
  /** Per tile, the chains proven page furniture (tile frames, trim lines, the print grid). */
  furniture: readonly (ReadonlySet<number> | undefined)[] = [],
): Pen[] {
  const out: Pen[] = [];
  const seen = new Set<string>();
  for (const [k, pc] of tiles.entries()) {
    const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
    for (const [i, c] of pc.chains.entries()) {
      if (!isPatternLike(c) || furniture[k]?.has(i)) continue;
      const p = penOf(styles.get(c.style), c);
      // deduplicated by exact identity (the tolerant comparison is not transitive)
      const key =
        p && JSON.stringify([p.w.toFixed(3), p.rgb, p.dashed, p.motif?.map((x) => x.toFixed(2))]);
      if (p && key && !seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
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

/** Each kind in the words of `PageInk.explained`. */
const INK_WORDS: Record<InkKind, string> = {
  rule: 'table rules / separators',
  frame: 'frames',
  square: 'test square',
  copy: 'tile pieces reduced',
  drawing: 'drawings in pens the tiles do not use',
};

/** The kinds an `explained` reading names (the autopilot's policy reads `CleanOutput.dropped`). */
export function explainedKinds(explained: string | null | undefined): InkKind[] {
  if (!explained) return [];
  return (Object.keys(INK_WORDS) as InkKind[]).filter((k) =>
    explained.split(', ').some((part) => part.replace(/^\d+ /, '') === INK_WORDS[k]),
  );
}

export type PageInk = {
  /** Every long / piece-sized line explained: the counts by kind, in words. Null = not all. */
  explained: string | null;
  /** The first line nothing explains, in words (the question says what it is). */
  unexplained: string | null;
  counts: Partial<Record<InkKind, number>>;
};

/** A printed dimension: "2 inches", "2\"", "5 cm", "50 mm", "8x8 cm". */
const DIMENSION =
  /(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*\d+(?:[.,]\d+)?\s*)?("|''|”|in\b|inch(?:es)?|cm|mm)/gi;
const UNIT_MM: Record<string, number> = { cm: 10, mm: 1 };
/** A word that names a key / legend. */
const KEY_WORD = /\b(key|legend|legende|zeichenerkl\w*|условн\w*)\b/i;
/** One size label of a key: «SIZE 00», «Größe 38», «размер 48». */
const SIZE_LABEL =
  /^(?:size|größe|grösse|gr\.|taille|talla|taglia|maat|rozmiar|размер)\s*:?\s*(\S+)$/i;
/** A tile id of an assembly map: a letter or two and a number (A1, B12). */
const TILE_ID = /^([A-Z]{1,2})\s?(\d{1,2})$/;
/** A pattern / brand code: MDF474, MDF-349, B6543. */
const CODE = /^[A-Z]{1,5}-?\d{2,5}[A-Z]?$/;

/**
 * The page's long / piece-sized lines, each explained as a rule, a frame, a test square, a reduced
 * copy of the tile pieces or a small drawing in a pen the tiles do not use (see the header). Codex
 * review (majors, 2 rounds): a rectangle is a frame only in a pen the tiles do not use, holding
 * words or lines (a waistband is a rectangle in the pattern's pen); a square only where nearby text
 * prints its own dimension; a reduced copy only as outlines of ≥ 2 different tile pieces at one
 * scale; a piece-sized closed drawing only with the inner detail of a drawing; nothing off the page.
 */
export function pageInk(
  pc: PageChains,
  tilePens: readonly Pen[],
  tileShapes: readonly Shape[],
  page: Pick<IRPage, 'widthMm' | 'heightMm'>,
): PageInk {
  PAGE_INK_TAP.fn?.(pc, tilePens, tileShapes, page);
  const items = pageInkItems(pc, tilePens, tileShapes, page);
  const counts: Partial<Record<InkKind, number>> = {};
  const first = items.find((x) => !x.kind);
  for (const x of items) if (x.kind) counts[x.kind] = (counts[x.kind] ?? 0) + 1;
  return {
    explained:
      first || !items.length
        ? null
        : (Object.keys(counts) as InkKind[]).map((k) => `${counts[k]} ${INK_WORDS[k]}`).join(', '),
    unexplained: first ? first.why ?? 'unexplained' : null,
    counts,
  };
}

/**
 * Probe seam (scripts/pattern-import/pageq-entry.ts): sees every page reading's inputs, so a sweep
 * of the archive can be cached once and the reading replayed on it. Null in the product.
 */
export const PAGE_INK_TAP: {
  fn:
    | ((
        pc: PageChains,
        tilePens: readonly Pen[],
        tileShapes: readonly Shape[],
        page: Pick<IRPage, 'widthMm' | 'heightMm'>,
      ) => void)
    | null;
} = { fn: null };

/** One long / piece-sized line of a page and what it is (null = nothing explains it, `why`). */
export type InkItem = { i: number; kind: InkKind | null; why?: string };

/** Every long / piece-sized line of the page, each with its reading (`pageInk` sums them up). */
export function pageInkItems(
  pc: PageChains,
  tilePens: readonly Pen[],
  tileShapes: readonly Shape[],
  page: Pick<IRPage, 'widthMm' | 'heightMm'>,
): InkItem[] {
  const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
  const drawMax = PAGE_INK.drawingMaxShare * Math.min(page.widthMm, page.heightMm);
  const hairMax = PAGE_INK.hairlineMaxShare * Math.max(page.widthMm, page.heightMm);
  const tilePen = (p: Pen | null) => !!p && tilePens.some((t) => samePen(p, t));
  /** A drawing's largest extent in this pen. */
  const maxOf = (p: Pen | null) =>
    p && p.w <= PAGE_INK.hairlineMm ? Math.max(drawMax, hairMax) : drawMax;
  const fmtPen = (p: Pen | null) =>
    p
      ? `${p.w.toFixed(2)} mm${p.dashed ? ' dashed' : ''}${p.rgb ? ` rgb(${p.rgb.join(',')})` : ''}`
      : 'no pen';
  const words = pc.page.texts.filter((t) => !t.background && t.text.trim());
  /**
   * Codex r2: a test square only where the words NEAR it (inside, or within its side / 60 mm of it)
   * print ITS dimension ("should measure 2 inches" beside a 50.8 mm square) — never a page-global
   * word, never a square whose side no nearby text names.
   */
  const calibrated = (b: Box, side: number) => {
    const r = Math.max(60, side);
    const near = words
      .filter(
        (t) =>
          t.anchor.x >= b.minX - r &&
          t.anchor.x <= b.maxX + r &&
          t.anchor.y >= b.minY - r &&
          t.anchor.y <= b.maxY + r,
      )
      .sort(
        (p, q) =>
          Math.round(q.anchor.y / 3) - Math.round(p.anchor.y / 3) || p.anchor.x - q.anchor.x,
      )
      .map((t) => t.text)
      .join(' ');
    for (const m of near.matchAll(DIMENSION)) {
      const v = parseFloat(m[1].replace(',', '.'));
      const u = m[2].toLowerCase();
      const mm = v * (UNIT_MM[u] ?? 25.4);
      if (Math.abs(mm - side) <= 0.03 * side) return true;
    }
    return false;
  };
  type Box = PageChains['box'][number];
  const inside = (o: Box, b: Box, tol = 1) =>
    o.minX >= b.minX - tol &&
    o.maxX <= b.maxX + tol &&
    o.minY >= b.minY - tol &&
    o.maxY <= b.maxY + tol;
  /** Chains (any length ≥ 3 mm) lying inside box `b`, the chain itself left out. */
  const detailIn = (b: Box, self: number) =>
    pc.chains.filter((c, j) => j !== self && c.lengthMm >= 3 && inside(pc.box[j], b)).length;
  const wordsIn = (b: Box) =>
    words.filter(
      (t) =>
        t.anchor.x > b.minX && t.anchor.x < b.maxX && t.anchor.y > b.minY && t.anchor.y < b.maxY,
    );
  const textIn = (b: Box) => wordsIn(b).length;
  /** Fill-only paths (no pen): their boxes and fill colours. */
  let fills: { b: Box; rgb: Style['strokeRgb'] }[] | null = null;
  /**
   * A tone under the outline: a fill-only path with its box, tinted (a silhouette's grey on a
   * pieces index, a step sketch's shading). Never white — a white mask under a real piece is
   * common on tile sheets — and never a fill of unknown colour.
   */
  const toned = (b: Box) => {
    fills ??= pc.page.paths.flatMap((p) => {
      const s = styles.get(p.style);
      return s?.fill && !(s.widthMm > 0) && !p.background && p.pts.length >= 3
        ? [{ b: bboxOf(p.pts), rgb: s.strokeRgb }]
        : [];
    });
    const d = PAGE_INK.toneBoxMm;
    return fills.some(
      ({ b: q, rgb }) =>
        !!rgb &&
        rgb.some((v) => v < PAGE_INK.toneMax) &&
        Math.abs(q.minX - b.minX) <= d &&
        Math.abs(q.maxX - b.maxX) <= d &&
        Math.abs(q.minY - b.minY) <= d &&
        Math.abs(q.maxY - b.maxY) <= d,
    );
  };
  /**
   * A raster tone under the outline: an image covering most of its box, no larger than a few
   * times the box (an illustration's shading clipped to its outline — never a photo or a page
   * background behind the line work).
   */
  const shaded = (b: Box) => {
    const ab = Math.max(1e-6, (b.maxX - b.minX) * (b.maxY - b.minY));
    return pc.page.rasters.some(({ bbox: r }) => {
      const w = Math.min(r.maxX, b.maxX) - Math.max(r.minX, b.minX);
      const h = Math.min(r.maxY, b.maxY) - Math.max(r.minY, b.minY);
      return (
        w > 0 &&
        h > 0 &&
        (w * h) / ab >= PAGE_INK.rasterCover &&
        (r.maxX - r.minX) * (r.maxY - r.minY) <= PAGE_INK.rasterBoxMax * ab
      );
    });
  };
  /** Share of the smaller box that two boxes overlap. */
  const overlap = (a: Box, b: Box) => {
    const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    if (w <= 0 || h <= 0) return 0;
    const s = (q: Box) => Math.max(1e-6, (q.maxX - q.minX) * (q.maxY - q.minY));
    return (w * h) / Math.min(s(a), s(b));
  };
  /**
   * A size line key (Mood's «Size Line Key», a box drawn with the pattern's own pen): a key word,
   * ≥ `keyLabels` different «SIZE n» labels, ≥ `keyPens` pens among its short sample lines — and
   * nothing long or closed inside but straight rules. A graded waistband holds its sizes' long
   * outlines (or no key word, no samples): it stays a rectangle that may be a piece.
   */
  const sizeKey = (b: Box, self: number) => {
    const ws = wordsIn(b);
    if (!ws.some((t) => KEY_WORD.test(t.text))) return false;
    const labels = new Set<string>();
    for (const t of ws) {
      const m = SIZE_LABEL.exec(t.text.trim());
      const tok = m ? parseSizeToken(m[1], true) : null;
      if (tok) labels.add(`${tok.kind}:${tok.label}`);
    }
    if (labels.size < PAGE_INK.keyLabels) return false;
    const samples: Pen[] = [];
    for (const [j, c] of pc.chains.entries()) {
      const q = pc.box[j];
      if (j === self || c.lengthMm < 3 || !inside(q, b)) continue;
      if (isPatternLike(c)) {
        const straight =
          !c.closed &&
          axisShare(c.pts, false) >= PAGE_INK.ruleAxis &&
          Math.min(q.maxX - q.minX, q.maxY - q.minY) <= PAGE_INK.ruleThinMm;
        if (!straight) return false;
        continue;
      }
      const p = penOf(styles.get(c.style), c);
      if (p && !c.closed && !samples.some((s) => samePen(p, s))) samples.push(p);
    }
    return samples.length >= PAGE_INK.keyPens;
  };
  /**
   * The tile-assembly map (which tile goes where): a box whose every word is a tile id — ≥
   * `mapIds` of them over ≥ 2 rows and ≥ 2 columns — and no line inside but straight rules (its
   * grid). A piece holds its name and its cut, never a grid of tile ids.
   */
  const tileMap = (b: Box, self: number) => {
    const ws = wordsIn(b);
    if (ws.length < PAGE_INK.mapIds || !ws.every((t) => TILE_ID.test(t.text.trim()))) return false;
    const ids = ws.map((t) => TILE_ID.exec(t.text.trim())!);
    if (
      new Set(ids.map((m) => `${m[1].toUpperCase()}${+m[2]}`)).size < PAGE_INK.mapIds ||
      new Set(ids.map((m) => m[1].toUpperCase())).size < 2 ||
      new Set(ids.map((m) => +m[2])).size < 2
    )
      return false;
    return pc.chains.every((c, j) => {
      const q = pc.box[j];
      if (j === self || c.lengthMm < 3 || !inside(q, b)) return true;
      return (
        !c.closed &&
        axisShare(c.pts, false) >= PAGE_INK.ruleAxis &&
        Math.min(q.maxX - q.minX, q.maxY - q.minY) <= PAGE_INK.ruleThinMm
      );
    });
  };

  /**
   * A code stamp (Mood's badge «PATTERNS BY mood · MDF474», printed on the cover as the test square
   * and smaller on every page after it, the tile sheet's first tile included — which is how its
   * pen becomes a "tile pen"): a small square whose only words are a pattern code, holding at
   * least `stampGlyphs` small marks (the logo's letters) and nothing long. A piece holds its name
   * and its cut and a grainline across it, never a code alone.
   */
  const stamp = (b: Box, self: number) => {
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const side = Math.max(w, h);
    if (side > PAGE_INK.stampMm || Math.abs(w - h) > PAGE_INK.stampSquare * side) return false;
    const ws = wordsIn(b);
    if (!ws.length || !ws.every((t) => CODE.test(t.text.trim()))) return false;
    let marks = 0;
    for (const [j, c] of pc.chains.entries()) {
      const q = pc.box[j];
      if (j === self || c.lengthMm < 3 || !inside(q, b)) continue;
      if (
        isPatternLike(c) ||
        Math.max(q.maxX - q.minX, q.maxY - q.minY) > PAGE_INK.stampGlyphShare * side
      )
        return false;
      marks++;
    }
    return marks >= PAGE_INK.stampGlyphs;
  };

  type Item = {
    i: number;
    kind: InkKind | null;
    /** A rectangle waiting for its contents (a table, words) to decide it. */
    frame?: { pen: Pen | null; piece: boolean; small: boolean };
    copy?: { s: number; t: number };
    /** A closed outline in a pen of its own with little inside: a drawing's part if it overlaps a
     *  drawing in its pen. */
    part?: Pen;
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
    // a straight rule (a table's, a separator, the trim line, the seam between the sheets of a
    // tiled instruction poster — polupalto, 545 mm across 2 pages) in any pen: a straight open
    // line is no piece by itself, on the page or past its edge
    if (!c.closed && ax >= PAGE_INK.ruleAxis && Math.min(w, h) <= PAGE_INK.ruleThinMm)
      return items.push({ i, kind: 'rule' });
    // drawn off the page (clipped away on paper): nothing on paper says what it is — before any
    // other explanation (Codex r2); the trim line at the page's edge stays within the tolerance
    const t = PAGE_INK.offPageMm;
    if (b.minX < -t || b.minY < -t || b.maxX > page.widthMm + t || b.maxY > page.heightMm + t)
      return items.push({ i, kind: null, why: `${head}, drawn off the page` });
    // a closed bar at most this thin (a colour bar, a strap's 1:10 copy): no cut piece is
    if (c.closed && Math.min(w, h) <= PAGE_INK.barMm) return items.push({ i, kind: 'rule' });
    if (!c.closed) {
      // a bent orthogonal line (a bracket, a table corner) only in a pen the tiles do not use
      if (ax >= 0.999 && pen && !tilePen(pen)) return items.push({ i, kind: 'rule' });
    } else {
      const a = areaOf(c.pts);
      if (ax >= PAGE_INK.frameAxis && a >= PAGE_INK.frameFill * w * h) {
        const side = squareSide(w, h);
        if (side && calibrated(b, (w + h) / 2)) return items.push({ i, kind: 'square' });
        return items.push({
          i,
          kind: null,
          frame: { pen, piece: a >= PAGE_INK.pieceMm2, small: Math.max(w, h) <= maxOf(pen) },
        });
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
    const max = maxOf(pen);
    const small = Math.max(w, h) <= max;
    if (small && pen && !tilePen(pen)) {
      // a piece-sized closed drawing only with the inner detail of a garment drawing (seams,
      // topstitching, buttons) — a pocket in a pen of its own, hairline or not, has none (Codex r2)
      // — or, tinted underneath, a drawing's tone (a pieces index's silhouette, a shaded sketch)
      const pieceSized = c.closed && areaOf(c.pts) >= PAGE_INK.pieceMm2;
      if (!pieceSized || detailIn(b, i) >= PAGE_INK.drawingDetail || toned(b) || shaded(b))
        return items.push({ i, kind: 'drawing' });
      return items.push({
        i,
        kind: null,
        part: pen,
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
  // the parts of one drawing (a sewing step's garment, its pocket, its facing): an outline with
  // little inside whose box overlaps a drawing's box drawn with the same pen — a real piece is
  // never drawn into an illustration with the illustration's pen
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of items) {
      if (x.kind || !x.part) continue;
      const b = pc.box[x.i];
      const host = items.find(
        (y) =>
          y.kind === 'drawing' &&
          y.i !== x.i &&
          overlap(b, pc.box[y.i]) >= PAGE_INK.partOverlap &&
          (() => {
            const p = penOf(styles.get(pc.chains[y.i].style), pc.chains[y.i]);
            return !!p && samePen(p, x.part!);
          })(),
      );
      if (host) {
        x.kind = 'drawing';
        grew = true;
      }
    }
  }
  // frames: only in a pen the tiles do not use (a rectangle in the pattern's pen may be a
  // waistband, whatever lies inside it — Codex r2), holding words or other line work; in any pen,
  // a size line key, the tile-assembly map or a code stamp (what lies inside says what it is)
  for (const x of items) {
    if (!x.frame) continue;
    const b = pc.box[x.i];
    const foreign = !!x.frame.pen && !tilePen(x.frame.pen);
    if (foreign && (textIn(b) >= 1 || detailIn(b, x.i) >= 1)) x.kind = 'frame';
    else if (sizeKey(b, x.i) || tileMap(b, x.i) || stamp(b, x.i)) x.kind = 'frame';
    else if (foreign && x.frame.small && (toned(b) || shaded(b))) x.kind = 'drawing';
    else {
      const c = pc.chains[x.i];
      x.why = `a rectangle ${Math.round(b.maxX - b.minX)}×${Math.round(b.maxY - b.minY)} mm (${fmtPen(x.frame.pen)}) ${foreign ? 'that frames no words and no lines' : "drawn with the tile sheet's pen"} — it may be a piece (${Math.round(c.lengthMm)} mm)`;
    }
  }
  return items.map(({ i, kind, why }) => ({ i, kind, ...(kind ? {} : { why }) }));
}
