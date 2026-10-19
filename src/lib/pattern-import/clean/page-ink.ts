// clean/ (STOPS) — what the line work on a page set aside IS, without the AI. The archive (692 PDFs,
// auto/ARCHIVE-RUN-2.md) stopped 358 files on "page N was set aside as instructions but holds line
// work — is it a pattern page?": a page the classifier read as instructions / cover / overview
// whose lines are long or closed. Read on 24 of them (scripts/pattern-import/page-ink-entry.ts),
// that line work is, every time, one of:
//   · rules — a table's grid, a separator, the page's trim line: straight, axis-parallel, open
//     and on the page (nothing drawn past its edge is explained), or a closed bar ≤ 3 mm thin —
//     straight lines of one pen closing a cycle (a rectangle drawn as four paths) are one outline;
//   · frames — a text box, a table's outline, the cells of the tile-assembly map: an axis-parallel
//     rectangle in a pen the tiles do not use, holding words or lines (a piece-sized one: text
//     covering it, a few lines or a pieces index's ids — never a name or a grainline alone) — a
//     piece's label at print size only as a table of pieces (ids + labels) or a note (running
//     text) that fills it; a rectangle in the pattern's pen may be a waistband, whatever lies in
//     it — unless what lies in it says what it is in any pen: a size line key, the tile-assembly
//     map, a code stamp;
//   · the test square — 2 in / 5 cm / 8×8 см …, where text near it prints its own dimension;
//   · reduced copies — the pieces at 1:5…1:25 (the pieces index, the tile map, the graded nest of a
//     pieces inventory): outlines at one scale ≤ 0.35 shaped as ≥ 2 different tile pieces;
//   · drawings — the garment flats and the sewing-step sketches: small (≤ 0.6 of the page's short
//     side, ≤ 0.75 of its long side in a hairline), drawn with a pen no line of the tile sheet is
//     drawn with, and — a closed piece-sized one — full of inner detail of its own (seams,
//     buttons: lines within its polygon, some in its ink or ending on its outline) with no name or
//     label at print size in it (POCKET, CUT 2, КАРМАН), lying within such a drawing of its pen
//     (unnamed), or toned underneath with a second cue: a family of unnamed outlines in its pen
//     and tint (a pieces index; the outline drawn twice is none), or alone with no word and its
//     line art (strokes and shades ≥ 4 mm, not drill dots, notch triangles or arrowheads).
// A page where EVERY long or piece-sized line is one of these is the second, geometric evidence
// that it is not pattern (the first is the classifier's text-led role). A curve at 1:1 drawn with
// the pattern's pen, a large curve, a curve that is no tile piece reduced — anything else — stays
// unexplained, and the page stays the question (a real piece on an instruction page asks).
// A file with no tile page has no pattern to compare with: nothing is explained.
import type { Chain, IRPage, PtMm, Style } from '../types';
import { bboxOf } from '../chains/geom';
import { pointInPoly } from '../pieces/geom';
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
  /** A piece-sized closed drawing in a pen thicker than a hairline holds this many lines inside,
   *  at least `drawingOwned` of them its own: drawn with its ink (any dash) or ending on its
   *  outline (a seam, a dart — Codex r5: an illustration's lines under a bare piece are not). */
  drawingDetail: 6,
  drawingOwned: 2,
  /** A detail line ends on the outline within this. */
  ownedEndMm: 1,
  /** A piece's own label (CUT 2, ON FOLD) is printed at least this tall (mm). */
  labelMm: 1.5,
  /** A line inside an outline: at least this share of its points inside the outline's polygon. */
  withinShare: 0.9,
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
  /** A toned rectangle with nothing inside is a colour band only this thin (Codex r3: a tinted
   *  patch template is a rectangle too). */
  toneBarMm: 8,
  /** A raster tone (an illustration's shading, a gradient clipped to the outline — Vixen MDF371
   *  p1's open back): an image covering this share of the outline's box … */
  rasterCover: 0.75,
  /** … whose own box is at most this many times the outline's (the outline's own tone, not a
   *  photo or a page background behind it). */
  rasterBoxMax: 4,
  /** A lone toned outline is an illustration's when at least this many fill-only paths (its line
   *  art: seams, folds, shading drawn as fills) lie on it — each with most of its box on the
   *  outline's box. */
  lineArtFills: 4,
  lineArtMm: 4,
  lineArtShare: 0.5,
  /** A line-art fill is a stroke (perimeter² / 4·area at least this — Vixen's folds are 39–146)
   *  or a shade (at least this many mm²); a filled notch triangle or arrowhead is neither (a 5 mm
   *  triangle is 5.2 and 11 mm² — Codex r5). */
  lineArtStroke: 10,
  lineArtShadeMm2: 25,
  /** A toned outline's family: at least this many other closed outlines (each at least this
   *  long) in its pen and tint. */
  familyOthers: 1,
  familyMm: 20,
  /** A size line key: at least this many different size labels, each beside a sample of its
   *  line (at least `keyPens` different pens). */
  keyLabels: 4,
  keyPens: 3,
  /** A key's sample lies on its label's baseline (centre within this) and beside it. */
  keyBaselineMm: 4,
  keyBesideMm: 40,
  /** The tile-assembly map: at least this many tile ids (A1 … F9) in a grid, nothing else. */
  mapIds: 6,
  /** A table of pieces (Mood's cutting legend, a row per piece: «A · FRONT · FABRIC - CUT 2»): at
   *  least this many piece ids and this many piece labels in it. */
  tableRows: 2,
  /** … or a note: running text of at least `noteTokens` words with `noteWords` different function
   *  words among them (Mood's «Patterns with more than one grainline can be placed …» box). */
  noteTokens: 12,
  noteWords: 3,
  /** Either fills its box with text: words covering at least this share of it (Mood's legends
   *  0.21–0.59; Codex r5: a 12-word cutting note or «A · B · FABRIC: CUT 1 · INTERFACING: CUT 1» on
   *  a 36×196 mm waistband covers 3 %) … */
  noteCover: 0.15,
  /** … top to bottom: its words span at least this share of its height (Mood's legends 0.76–1; the
   *  same note on a 36×60 mm piece covers 18 % but spans a third of it). */
  noteSpan: 0.6,
  /** A piece-sized rectangle in a pen of its own frames what it holds: text covering at least this
   *  share of it, at least `frameLines` lines (a drawing, a grid, a stamp's logo), or only a pieces
   *  index's ids (A, 12) — never just a name (WAISTBAND) or a grainline (Codex r5). */
  frameCover: 0.1,
  frameLines: 3,
  /** A code stamp (Mood's «PATTERNS BY mood · MDF474» badge on every page): a square at most this
   *  large (side within `stampSquare`) … */
  stampMm: 60,
  stampSquare: 0.03,
  /** … holding only the pattern's code as words, a row of at least this many closed glyph outlines
   *  (the logo's letters: one height within `stampGlyphTol`, at most `stampGlyphShare` of its side,
   *  each narrower than `stampGlyphAspect` of its height — a letter, not a round hole — centres on
   *  one line within `stampRowTol` of that height, the row across at least `stampSpan` of the
   *  side; the badge's letters are 0.8–0.84 as wide as tall, 0.09–0.1 of the side, across
   *  0.75–0.86 of it) … */
  stampGlyphs: 3,
  stampGlyphShare: 0.12,
  stampGlyphTol: 0.15,
  stampGlyphAspect: 0.9,
  stampRowTol: 0.5,
  stampSpan: 0.6,
  /** … and at least this many filled letter shapes (fill-only paths; the badge has 15), every
   *  fill inside a letter's size (≤ `stampFillShare` of its height) and on the row (within
   *  `stampBand` heights of it), at least `stampFilledGlyphs` of them a row letter's own box (the
   *  logo's letters are drawn twice, outline and fill; each edge within `stampGlyphTol` of the
   *  height). */
  stampFills: 10,
  stampFillShare: 1.25,
  stampBand: 1.5,
  stampFilledGlyphs: 3,
  /** Straight lines of one pen whose ends meet within this close round a cycle (`closeLoops`). */
  loopGapMm: 0.5,
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

/** The same ink: stroke width and colour, dashed or not. */
const sameInk = (a: Pen, b: Pen) =>
  Math.abs(a.w - b.w) <= Math.max(PAGE_INK.penWidthAbsMm, PAGE_INK.penWidthRel * b.w) &&
  (!a.rgb || !b.rgb
    ? a.rgb === b.rgb
    : a.rgb.every((v, k) => Math.abs(v - b.rgb![k]) <= PAGE_INK.penRgb));

const samePen = (a: Pen, b: Pen) =>
  a.dashed === b.dashed && !motifsApart(a.motif, b.motif) && sameInk(a, b);

/** Distance from a point to a closed polyline. */
function ringDist(p: PtMm, q: readonly PtMm[]): number {
  let d = Infinity;
  for (let k = 0, j = q.length - 1; k < q.length; j = k++) {
    const a = q[j];
    const b = q[k];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy));
  }
  return d;
}

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
 * A rectangle drawn as separate straight paths (four sides, two L's — chains/ joins ends along the
 * line only, never round a corner) is one closed outline to the page reading (Codex r5: a waistband
 * drawn side by side read as four rules): open axis-parallel lines of one pen whose ends meet in
 * pairs (within `loopGapMm`) around a cycle. The cycle takes the slot of its first line; the
 * others leave the reading (length 0).
 */
function closeLoops(pc: PageChains): PageChains {
  const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
  const cand = pc.chains.flatMap((c, i) =>
    !c.closed &&
    c.lengthMm >= 3 &&
    c.pts.length >= 2 &&
    axisShare(c.pts, false) >= PAGE_INK.ruleAxis
      ? [i]
      : [],
  );
  if (cand.length < 2) return pc;
  const g = PAGE_INK.loopGapMm;
  // the ends, clustered on a grid of `g`: node of end 2k (start) / 2k + 1 (end) of cand[k]
  const nodes: PtMm[] = [];
  const grid = new Map<string, number[]>();
  const nodeOf = (p: PtMm) => {
    const gx = Math.round(p.x / g);
    const gy = Math.round(p.y / g);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const n of grid.get(`${gx + dx},${gy + dy}`) ?? [])
          if (Math.hypot(nodes[n].x - p.x, nodes[n].y - p.y) <= g) return n;
    nodes.push(p);
    const k = `${gx},${gy}`;
    grid.set(k, [...(grid.get(k) ?? []), nodes.length - 1]);
    return nodes.length - 1;
  };
  const ends = cand.flatMap((i) => {
    const q = pc.chains[i].pts;
    return [nodeOf(q[0]), nodeOf(q[q.length - 1])];
  });
  const at = new Map<number, number[]>();
  ends.forEach((n, e) => at.set(n, [...(at.get(n) ?? []), e]));
  const used = new Set<number>();
  const chains = [...pc.chains];
  const box = [...pc.box];
  for (let k0 = 0; k0 < cand.length; k0++) {
    if (used.has(k0)) continue;
    // walk from the end of cand[k0]: every node on the way joins exactly two ends
    const order: { k: number; rev: boolean }[] = [{ k: k0, rev: false }];
    let e = 2 * k0 + 1;
    let ok = false;
    for (let step = 0; step < cand.length; step++) {
      const there = at.get(ends[e])!;
      if (there.length !== 2) break;
      const next = there[0] === e ? there[1] : there[0];
      const k = next >> 1;
      if (k === k0) {
        ok = next === 2 * k0 && order.length >= 2;
        break;
      }
      if (order.some((o) => o.k === k)) break;
      order.push({ k, rev: (next & 1) === 1 });
      e = next ^ 1;
    }
    if (!ok) continue;
    const first = pc.chains[cand[k0]];
    const pen = penOf(styles.get(first.style), first);
    if (
      !pen ||
      order.some(({ k }) => {
        const c = pc.chains[cand[k]];
        const p = penOf(styles.get(c.style), c);
        return !p || !samePen(p, pen);
      })
    )
      continue;
    const pts: PtMm[] = [];
    let len = 0;
    for (const { k, rev } of order) {
      const c = pc.chains[cand[k]];
      const q = rev ? [...c.pts].reverse() : c.pts;
      pts.push(...(pts.length ? q.slice(1) : q));
      len += c.lengthMm;
      used.add(k);
      if (k !== k0) {
        chains[cand[k]] = { ...c, pts: [c.pts[0]], lengthMm: 0 };
        box[cand[k]] = bboxOf([c.pts[0]]);
      }
    }
    pts.pop();
    chains[cand[k0]] = { ...first, pts, closed: true, lengthMm: len };
    box[cand[k0]] = bboxOf(pts);
  }
  return used.size ? { ...pc, chains, box } : pc;
}

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
  /(\d+(?:[.,]\d+)?)\s*(?:[x×хХ]\s*\d+(?:[.,]\d+)?\s*)?("|''|”|in\b|inch(?:es)?|cm|mm|см(?![а-яё])|мм(?![а-яё]))/gi;
const UNIT_MM: Record<string, number> = { cm: 10, mm: 1, см: 10, мм: 1 };
/** A word that names a key / legend. */
const KEY_WORD = /\b(key|legend|legende|zeichenerkl\w*|условн\w*)\b/i;
/** One size label of a key: «SIZE 00», «Größe 38», «размер 48». */
const SIZE_LABEL =
  /^(?:size|größe|grösse|gr\.|taille|talla|taglia|maat|rozmiar|размер)\s*:?\s*(\S+)$/i;
/** A tile id of an assembly map: a letter or two and a number (A1, B12). */
const TILE_ID = /^([A-Z]{1,2})\s?(\d{1,2})$/;
/** A piece's label: its cut, its fold, its grain, its material. */
const PIECE_WORDS =
  /\b(cut\s*:?\s*\d+|cut\s+on\s+fold|on\s+(the\s+)?fold|grain\s*line|(fabric|lining|fusing|interfacing|contrast)\s*:)/i;
/** A piece's id in a table of pieces: a lone letter or number (A, B, 12). */
const PIECE_ID = /^(?:[A-Z]|\d{1,2})$/;
/** The function words of running text (a note's sentences; a piece's label has few or none). */
const PROSE =
  /^(the|of|to|and|with|be|that|if|for|in|is|are|can|this|or|from|than|when|your|you|it|as|и|в|на|с|по|для|не|что|это)$/i;
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
  pc0: PageChains,
  tilePens: readonly Pen[],
  tileShapes: readonly Shape[],
  page: Pick<IRPage, 'widthMm' | 'heightMm'>,
): InkItem[] {
  const pc = closeLoops(pc0);
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
  /** Share of the points lying inside closed chain `i`'s outline (not just its box). */
  const within = (i: number, q: readonly PtMm[]) =>
    q.filter((v) => pointInPoly(v, pc.chains[i].pts)).length / Math.max(1, q.length);
  /** A word at print size inside closed chain `i`'s outline: a piece's name or cut (POCKET,
   *  КАРМАН 2 ДЕТ.) — a flat carries none, its callouts sit beside it (Codex r4); a lone letter or
   *  number is a pieces index's id, not a name. */
  const named = (i: number) =>
    wordsIn(pc.box[i]).some(
      (t) =>
        t.fontSizeMm >= PAGE_INK.labelMm &&
        /\p{L}.*\p{L}/u.test(t.text) &&
        pointInPoly(t.anchor, pc.chains[i].pts),
    );
  /** The point halfway along a chain. */
  const midOf = (q: readonly PtMm[]) => {
    let total = 0;
    for (let k = 1; k < q.length; k++)
      total += Math.hypot(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y);
    let run = 0;
    for (let k = 1; k < q.length; k++) {
      const l = Math.hypot(q[k].x - q[k - 1].x, q[k].y - q[k - 1].y);
      if (run + l >= total / 2 && l > 0) {
        const u = (total / 2 - run) / l;
        return {
          x: q[k - 1].x + u * (q[k].x - q[k - 1].x),
          y: q[k - 1].y + u * (q[k].y - q[k - 1].y),
        };
      }
      run += l;
    }
    return q[0];
  };
  /** Chains (≥ 3 mm) inside closed chain `i`'s OUTLINE, by their midpoint — a seam ends on the
   *  outline — not just its box (Codex r4: an L-shaped box holds other lines). */
  const detailOf = (i: number) =>
    pc.chains.flatMap((c, j) =>
      j !== i &&
      c.lengthMm >= 3 &&
      inside(pc.box[j], pc.box[i]) &&
      pointInPoly(midOf(c.pts), pc.chains[i].pts)
        ? [j]
        : [],
    );
  /** Of that detail, the drawing's own: drawn with its ink (any dash: topstitching) or ending on
   *  its outline (a seam, a dart) — an illustration's lines under a bare piece are neither. */
  const ownedOf = (i: number, det: readonly number[], pen: Pen) =>
    det.filter((j) => {
      const c = pc.chains[j];
      const p = penOf(styles.get(c.style), c);
      if (p && sameInk(p, pen)) return true;
      const o = pc.chains[i].pts;
      return (
        !c.closed &&
        (ringDist(c.pts[0], o) <= PAGE_INK.ownedEndMm ||
          ringDist(c.pts[c.pts.length - 1], o) <= PAGE_INK.ownedEndMm)
      );
    }).length;
  /** The share of box `b` the words' boxes cover (clipped to it). */
  const coverOf = (ws: typeof words, b: Box) =>
    ws.reduce((s, t) => {
      const w = Math.min(t.bbox.maxX, b.maxX) - Math.max(t.bbox.minX, b.minX);
      const h = Math.min(t.bbox.maxY, b.maxY) - Math.max(t.bbox.minY, b.minY);
      return s + (w > 0 && h > 0 ? w * h : 0);
    }, 0) / Math.max(1e-6, (b.maxX - b.minX) * (b.maxY - b.minY));
  /** The share of box `b`'s height its words span (top of the highest to foot of the lowest). */
  const spanOf = (ws: typeof words, b: Box) => {
    const ys = ws.flatMap((t) =>
      t.bbox.maxY > b.minY && t.bbox.minY < b.maxY
        ? [Math.max(b.minY, t.bbox.minY), Math.min(b.maxY, t.bbox.maxY)]
        : [],
    );
    return ys.length ? (Math.max(...ys) - Math.min(...ys)) / Math.max(1e-6, b.maxY - b.minY) : 0;
  };
  const wordsIn = (b: Box) =>
    words.filter(
      (t) =>
        t.anchor.x > b.minX && t.anchor.x < b.maxX && t.anchor.y > b.minY && t.anchor.y < b.maxY,
    );
  /** Fill-only paths (no pen): their boxes, fill colours, areas and elongation (perimeter² over
   *  4·area: a stroke drawn as a fill is long and thin). */
  let fills: { b: Box; rgb: Style['strokeRgb']; a: number; el: number }[] | null = null;
  /**
   * A tone under the outline: a fill-only path with its box, tinted (a silhouette's grey on a
   * pieces index, a step sketch's shading). Never white — a white mask under a real piece is
   * common on tile sheets — and never a fill of unknown colour.
   */
  const fillsOf = () =>
    pc.page.paths.flatMap((p) => {
      const s = styles.get(p.style);
      if (!s?.fill || s.widthMm > 0 || p.background || p.pts.length < 3) return [];
      const a = areaOf(p.pts);
      let per = 0;
      for (let k = 0, j = p.pts.length - 1; k < p.pts.length; j = k++)
        per += Math.hypot(p.pts[k].x - p.pts[j].x, p.pts[k].y - p.pts[j].y);
      return [{ b: bboxOf(p.pts), rgb: s.strokeRgb, a, el: (per * per) / Math.max(1e-9, 4 * a) }];
    });
  const sameBox = (q: Box, b: Box) => {
    const d = PAGE_INK.toneBoxMm;
    return (
      Math.abs(q.minX - b.minX) <= d &&
      Math.abs(q.maxX - b.maxX) <= d &&
      Math.abs(q.minY - b.minY) <= d &&
      Math.abs(q.maxY - b.maxY) <= d
    );
  };
  /** The tint of the tone under the outline (null = none). */
  const toneOf = (b: Box) => {
    fills ??= fillsOf();
    return (
      fills.find(({ b: q, rgb }) => !!rgb && rgb.some((v) => v < PAGE_INK.toneMax) && sameBox(q, b))
        ?.rgb ?? null
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
  /** Fill-only paths lying on the box (most of their own box on it), its own tone aside. */
  const lineArt = (b: Box) => {
    fills ??= fillsOf();
    return fills.filter(({ b: q, a: qa, el }) => {
      if (sameBox(q, b)) return false;
      // a stroke of shading or a fold, not a dot (a drill hole, a notch mark — Codex r4), nor a
      // filled notch triangle or arrowhead (compact and small — Codex r5)
      if (Math.max(q.maxX - q.minX, q.maxY - q.minY) < PAGE_INK.lineArtMm) return false;
      if (el < PAGE_INK.lineArtStroke && qa < PAGE_INK.lineArtShadeMm2) return false;
      const w = Math.min(q.maxX, b.maxX) - Math.max(q.minX, b.minX);
      const h = Math.min(q.maxY, b.maxY) - Math.max(q.minY, b.minY);
      const a = Math.max(1e-6, (q.maxX - q.minX) * (q.maxY - q.minY));
      return w > 0 && h > 0 && (w * h) / a >= PAGE_INK.lineArtShare;
    }).length;
  };
  /**
   * A closed piece-sized outline in a pen of its own with little inside is a drawing's when it is
   * toned AND a second cue agrees (Codex r3: a grey-filled pocket template is toned too):
   *   · its family — another closed outline in its pen toned with its tint (a pieces index's
   *     silhouettes, a step sketch's garments), itself unnamed (a pieces index letters its
   *     silhouettes at most) and with no piece label on it (cut, fold, grain …) — Codex r4: two
   *     grey pocket templates named POCKET stay pieces;
   *   · alone, the illustration around it — no word inside, its tint or an image of its size
   *     under it, and its line art (`lineArtFills` fill-only paths) lying on it (Vixen MDF371 p1).
   */
  const toneDrawing = (i: number, b: Box, pen: Pen) => {
    const ws = wordsIn(b);
    if (ws.some((t) => PIECE_WORDS.test(t.text))) return false;
    const tint = toneOf(b);
    if (
      tint &&
      // a silhouette carries no name (a pieces index letters it at most; POCKET names a piece)
      !named(i) &&
      pc.chains.filter((c, j) => {
        if (j === i || !c.closed || c.lengthMm < PAGE_INK.familyMm) return false;
        // the outline drawn twice is no family (Codex r5)
        if (sameBox(pc.box[j], b)) return false;
        const p = penOf(styles.get(c.style), c);
        const t = p && samePen(p, pen) ? toneOf(pc.box[j]) : null;
        return !!t && t.every((v, k) => Math.abs(v - tint[k]) <= PAGE_INK.penRgb);
      }).length >= PAGE_INK.familyOthers
    )
      return true;
    return !ws.length && (!!tint || shaded(b)) && lineArt(b) >= PAGE_INK.lineArtFills;
  };
  /**
   * A size line key (Mood's «Size Line Key», a box drawn with the pattern's own pen): its only
   * words a key word and «SIZE n» labels (≥ `keyLabels` different), ≥ `keyLabels` of the labels
   * each with a short straight sample of its line beside it (on its baseline, ≥ `keyPens`
   * different pens among them), nothing closed inside and nothing long but straight rules. Codex
   * r3: a waistband's name or cut, a sample line that is no label's (a lattice crossing the box)
   * — it stays a rectangle that may be a piece.
   */
  const sizeKey = (b: Box, self: number) => {
    const ws = wordsIn(b);
    if (!ws.some((t) => KEY_WORD.test(t.text))) return false;
    const labels: (typeof ws)[number][] = [];
    const ids = new Set<string>();
    for (const t of ws) {
      if (KEY_WORD.test(t.text)) continue;
      const m = SIZE_LABEL.exec(t.text.trim());
      const tok = m ? parseSizeToken(m[1], true) : null;
      if (!tok) return false;
      labels.push(t);
      ids.add(`${tok.kind}:${tok.label}`);
    }
    if (ids.size < PAGE_INK.keyLabels) return false;
    const keyed = new Set<number>();
    const samples: Pen[] = [];
    for (const [j, c] of pc.chains.entries()) {
      const q = pc.box[j];
      if (j === self || c.lengthMm < 3 || !inside(q, b)) continue;
      if (c.closed) return false;
      const straight =
        axisShare(c.pts, false) >= PAGE_INK.ruleAxis &&
        Math.min(q.maxX - q.minX, q.maxY - q.minY) <= PAGE_INK.ruleThinMm;
      if (isPatternLike(c)) {
        if (!straight) return false;
        continue;
      }
      // a sample: a short straight line on a label's baseline, beside it
      const cy = (q.minY + q.maxY) / 2;
      const cx = (q.minX + q.maxX) / 2;
      const k = labels.findIndex(
        (t) =>
          Math.abs(t.anchor.y - cy) <= PAGE_INK.keyBaselineMm &&
          Math.abs(t.anchor.x - cx) <= PAGE_INK.keyBesideMm,
      );
      if (!straight || k < 0) continue;
      keyed.add(k);
      const p = penOf(styles.get(c.style), c);
      if (p && !samples.some((s) => samePen(p, s))) samples.push(p);
    }
    return keyed.size >= PAGE_INK.keyLabels && samples.length >= PAGE_INK.keyPens;
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
   * pen becomes a "tile pen"): a small square whose only words are a pattern code and whose marks
   * are a lettered logo — a row of ≥ `stampGlyphs` closed letter outlines (one height, narrower
   * than tall, centres on one line, across most of the side) and ≥ `stampFills` letter-sized fills,
   * all on that row, ≥ `stampFilledGlyphs` of them a letter's own box (outline + fill) — with
   * nothing long or large inside. Codex r4: a coded button template (round holes, drill dots) has
   * no such row; r3: a coded square piece with a few placement marks has none either.
   */
  const stamp = (b: Box, self: number) => {
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const side = Math.max(w, h);
    if (side > PAGE_INK.stampMm || Math.abs(w - h) > PAGE_INK.stampSquare * side) return false;
    const ws = wordsIn(b);
    if (!ws.length || !ws.every((t) => CODE.test(t.text.trim()))) return false;
    const glyphs: Box[] = [];
    for (const [j, c] of pc.chains.entries()) {
      const q = pc.box[j];
      if (j === self || c.lengthMm < 3 || !inside(q, b)) continue;
      if (isPatternLike(c) || Math.max(q.maxX - q.minX, q.maxY - q.minY) > 0.6 * side) return false;
      if (c.closed && q.maxY - q.minY <= PAGE_INK.stampGlyphShare * side) glyphs.push(q);
    }
    const hOf = (q: Box) => q.maxY - q.minY;
    const mid = (v: number[]) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)] ?? 0;
    const med = mid(glyphs.map(hOf));
    if (!(med > 0)) return false;
    const tall = glyphs.filter(
      (q) =>
        Math.abs(hOf(q) - med) <= PAGE_INK.stampGlyphTol * med &&
        q.maxX - q.minX <= PAGE_INK.stampGlyphAspect * hOf(q),
    );
    const line = mid(tall.map((q) => (q.minY + q.maxY) / 2));
    const row = tall.filter(
      (q) => Math.abs((q.minY + q.maxY) / 2 - line) <= PAGE_INK.stampRowTol * med,
    );
    if (row.length < PAGE_INK.stampGlyphs) return false;
    const span = Math.max(...row.map((q) => q.maxX)) - Math.min(...row.map((q) => q.minX));
    if (span < PAGE_INK.stampSpan * side) return false;
    const lo = Math.min(...row.map((q) => q.minY)) - PAGE_INK.stampBand * med;
    const hi = Math.max(...row.map((q) => q.maxY)) + PAGE_INK.stampBand * med;
    fills ??= fillsOf();
    const letters = fills.filter(({ b: q }) => inside(q, b)).map(({ b: q }) => q);
    if (letters.length < PAGE_INK.stampFills) return false;
    if (
      !letters.every(
        (q) =>
          Math.max(q.maxX - q.minX, q.maxY - q.minY) <= PAGE_INK.stampFillShare * med &&
          q.minY >= lo &&
          q.maxY <= hi,
      )
    )
      return false;
    const d = PAGE_INK.stampGlyphTol * med;
    const filled = row.filter((g) =>
      letters.some(
        (q) =>
          Math.abs(q.minX - g.minX) <= d &&
          Math.abs(q.maxX - g.maxX) <= d &&
          Math.abs(q.minY - g.minY) <= d &&
          Math.abs(q.maxY - g.maxY) <= d,
      ),
    ).length;
    return filled >= PAGE_INK.stampFilledGlyphs;
  };

  type Item = {
    i: number;
    kind: InkKind | null;
    /** A rectangle waiting for its contents (a table, words) to decide it. */
    frame?: { pen: Pen | null; piece: boolean; small: boolean };
    copy?: { s: number; t: number };
    /** A closed outline in a pen of its own with little inside: a drawing's part if it lies in a
     *  drawing of its pen full of detail. */
    part?: Pen;
    /** A closed piece-sized drawing proven by its own inner detail (a part's host). */
    host?: boolean;
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
    // a straight rule (a table's, a separator, the trim line) in any pen: a straight open line is
    // no piece by itself
    const rule = !c.closed && ax >= PAGE_INK.ruleAxis && Math.min(w, h) <= PAGE_INK.ruleThinMm;
    // drawn off the page (clipped away on paper): nothing on paper says what it is — before any
    // other explanation (Codex r2); the trim line at the page's edge stays within the tolerance.
    // A straight rule past the edge too, in any pen (a piece's straight edge running off the page
    // — Codex r3 in the tile sheet's pen, r4 in a foreign one): polupalto p1's 545 mm seam
    // between the sheets of a tiled instruction poster stays a question
    const t = PAGE_INK.offPageMm;
    const off =
      b.minX < -t || b.minY < -t || b.maxX > page.widthMm + t || b.maxY > page.heightMm + t;
    if (rule && !off) return items.push({ i, kind: 'rule' });
    if (off) return items.push({ i, kind: null, why: `${head}, drawn off the page` });
    // a closed bar at most this thin (a colour bar, a strap's 1:10 copy): no cut piece is
    if (c.closed && Math.min(w, h) <= PAGE_INK.barMm) return items.push({ i, kind: 'rule' });
    if (!c.closed) {
      // a bent orthogonal line (a bracket, a table corner) only in a pen the tiles do not use
      if (ax >= 0.999 && pen && !tilePen(pen)) return items.push({ i, kind: 'rule' });
    } else {
      const a = areaOf(c.pts);
      if (ax >= PAGE_INK.frameAxis && a >= PAGE_INK.frameFill * w * h) {
        // the page's border drawn at its edge: the trim line (no piece is the page itself)
        if (b.minX <= t && b.minY <= t && b.maxX >= page.widthMm - t && b.maxY >= page.heightMm - t)
          return items.push({ i, kind: 'rule' });
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
      // topstitching, buttons) and no piece's words inside (CUT 2, ON FOLD, GRAINLINE — a real
      // piece's notches, darts and grainline are detail too) — a pocket in a pen of its own,
      // hairline or not, has no detail (Codex r2)
      // — or toned with a second cue (`toneDrawing`: a pieces index's silhouettes, a shaded flat)
      const pieceSized = c.closed && areaOf(c.pts) >= PAGE_INK.pieceMm2;
      if (pieceSized && !named(i)) {
        const det = detailOf(i);
        if (det.length >= PAGE_INK.drawingDetail && ownedOf(i, det, pen) >= PAGE_INK.drawingOwned)
          return items.push({ i, kind: 'drawing', host: true });
      }
      if (!pieceSized || toneDrawing(i, b, pen)) return items.push({ i, kind: 'drawing' });
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
  // little inside lying within the box of a closed drawing of the same pen that is full of detail
  // on its own — a real piece is never drawn into an illustration with the illustration's pen.
  // Never via an open line or another part (Codex r3: a grainline in the piece's own pen is a
  // "drawing" by size alone and would promote the piece it crosses).
  for (const x of items) {
    if (x.kind || !x.part) continue;
    const b = pc.box[x.i];
    // a piece's name or cut inside it: a piece laid on a flat, never a part of it (Codex r4)
    if (named(x.i)) continue;
    const host = items.find((y) => {
      if (!y.host || y.i === x.i || !inside(b, pc.box[y.i], 2)) return false;
      if (within(y.i, pc.chains[x.i].pts) < PAGE_INK.withinShare) return false;
      const p = penOf(styles.get(pc.chains[y.i].style), pc.chains[y.i]);
      return !!p && samePen(p, x.part!);
    });
    if (host) x.kind = 'drawing';
  }
  // frames: only in a pen the tiles do not use (a rectangle in the pattern's pen may be a
  // waistband, whatever lies inside it — Codex r2), holding words or other line work, and no
  // piece's label at print size unless it is a table of pieces or a note (Codex r4: a waistband
  // in a pen of its own with «CUT 1 ON FOLD», Parker MDF249 p1's bias-strip guide with its
  // GRAINLINE); in any pen, a size line key, the tile-assembly map or a code stamp (what lies
  // inside says what it is)
  for (const x of items) {
    if (!x.frame) continue;
    const b = pc.box[x.i];
    const foreign = !!x.frame.pen && !tilePen(x.frame.pen);
    const ws = wordsIn(b);
    const labels = ws.filter((t) => t.fontSizeMm >= PAGE_INK.labelMm && PIECE_WORDS.test(t.text));
    const ids = new Set(ws.map((t) => t.text.trim()).filter((t) => PIECE_ID.test(t)));
    const tokens = ws.flatMap((t) => t.text.split(/[^\p{L}\d]+/u).filter(Boolean));
    const cover = coverOf(ws, b);
    const note =
      tokens.length >= PAGE_INK.noteTokens &&
      new Set(tokens.filter((t) => PROSE.test(t)).map((t) => t.toLowerCase())).size >=
        PAGE_INK.noteWords;
    const table = labels.length >= PAGE_INK.tableRows && ids.size >= PAGE_INK.tableRows;
    const label =
      x.frame.piece &&
      labels.length > 0 &&
      !(cover >= PAGE_INK.noteCover && spanOf(ws, b) >= PAGE_INK.noteSpan && (note || table));
    if (label) {
      const c = pc.chains[x.i];
      x.why = `a rectangle ${Math.round(b.maxX - b.minX)}×${Math.round(b.maxY - b.minY)} mm (${fmtPen(x.frame.pen)}) holding a piece's label «${labels[0].text.trim().slice(0, 30)}» — it may be a piece (${Math.round(c.lengthMm)} mm)`;
      continue;
    }
    // what a piece-sized rectangle frames: text covering it, a few lines, or a pieces index's ids
    const holds = x.frame.piece
      ? cover >= PAGE_INK.frameCover ||
        detailIn(b, x.i) >= PAGE_INK.frameLines ||
        (ws.length > 0 && ws.every((t) => PIECE_ID.test(t.text.trim())))
      : ws.length >= 1 || detailIn(b, x.i) >= 1;
    if (foreign && holds) x.kind = 'frame';
    else if (sizeKey(b, x.i) || tileMap(b, x.i) || stamp(b, x.i)) x.kind = 'frame';
    else if (
      foreign &&
      x.frame.small &&
      Math.min(b.maxX - b.minX, b.maxY - b.minY) <= PAGE_INK.toneBarMm &&
      (toneOf(b) || shaded(b))
    )
      // a tinted bar (a colour band, a swatch strip): thinner than any cut piece AND toned
      x.kind = 'drawing';
    else {
      const c = pc.chains[x.i];
      x.why = `a rectangle ${Math.round(b.maxX - b.minX)}×${Math.round(b.maxY - b.minY)} mm (${fmtPen(x.frame.pen)}) ${foreign ? (x.frame.piece ? 'that frames no text, no drawing and no ids (a name or a grainline at most)' : 'that frames no words and no lines') : "drawn with the tile sheet's pen"} — it may be a piece (${Math.round(c.lengthMm)} mm)`;
    }
  }
  return items.map(({ i, kind, why }) => ({ i, kind, ...(kind ? {} : { why }) }));
}
