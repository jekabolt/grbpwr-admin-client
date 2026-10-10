// clean/ (A8) — the INPUT pages cleaned before anything is parsed (plan auto/00-PLAN §A8; owner
// 10.10: "on the input PDF, not on the DXF"). Worker graph only.
//
//   8a `cleanPages` — per page, right after extract: page roles (non-tile pages are set aside first,
//      the operator can re-include one), the background grid, tile chrome repeated at one page
//      place on ≥ 3 tiles (frames, corner marks, ROW/COLUMN labels), stroke text (kept as text
//      evidence: `curveTexts`), the test square drawn as line work (+ a scale candidate);
//   8b `cleanSheet` — after assembly, before chains: the sheet-wide watermark whose outline letters
//      the tile borders cut (wm: «WWW.PAPAVERO.PL», 60 mm letters, three times on the sheet).
//
// D3: an object is masked by itself ('auto') only on two independent evidences — or repetition on
// ≥ 3 tiles, which no garment line has; one evidence makes a suggestion the operator accepts. The
// wall guard has the last word: a line a garment line meets end-on is never masked. The mask is a
// FLAG (`IRPath.background`), never a deletion: assembly still reads frames and marks, the files
// step draws the mask tinted, and an undo is one edit.
import { PATIMPORT } from 'lib/pattern-import/types';
import type {
  BackgroundKind,
  CleanInput,
  CleanOutput,
  CurveText,
  IRPage,
  IRText,
  MaskItem,
  PageClassification,
  PageMask,
  PageMaskEdit,
  PathId,
  ScaleCandidate,
  Sheet,
  SheetClean,
  SourceDoc,
  TextId,
} from 'lib/pattern-import/types';

import { bboxOf } from '../chains/geom';
import {
  CLEAN,
  chromeKind,
  clippedByPage,
  drawingOf,
  pieceSized,
  crossedGlyphs,
  gridOf,
  memberIds,
  repetition,
  runStrokes,
  sharpGlyphs,
  squaresOf,
  tablesOf,
  textLines,
  touchingLineWork,
  type Found,
} from './detect';
import { pageChains, type PageChains } from './page-chains';
import { SegGrid } from '../chains/geom';
import { DEFAULT_CHAIN_OPTS } from '../chains/build';
import { makeChains } from '../chains/make';

export { CLEAN } from './detect';

const KIND_ORDER: BackgroundKind[] = [
  'grid',
  'tile-frame',
  'regmark',
  'tile-label',
  'watermark',
  'curve-text',
  'logo',
  'copyright',
  'table',
  'legend-swatch',
  'test-square',
  'stray',
];

const pageKey = (file: string, page: number) => `${file}:${page}`;

/** A path's source, the same on the page and on the sheet (assembly keeps `src`). */
export const srcKey = (s: { file: string; page: number; op: number; sub: number }) =>
  `${s.file}:${s.page}:${s.op}:${s.sub}`;

/** Lexicon of text that is never part of a piece: URLs, copyright lines. */
const COPYRIGHT =
  /©|\(c\)\s*\d{2,4}|copyright|all rights reserved|www\.|https?:\/\/|\.(com|pl|de|ru|fr|net|org)\b/i;

/** The operator's decision for one item, edits applied in order (later wins). */
function appliedOf(
  item: Pick<MaskItem, 'id' | 'kind' | 'status'>,
  file: string,
  page: number,
  edits: PageMaskEdit[],
) {
  let on = item.status === 'auto';
  for (const e of edits) {
    if ('item' in e) {
      if (e.item === item.id) on = !e.keep;
    } else if ('kind' in e && e.kind === item.kind) {
      if (e.file !== undefined && e.file !== file) continue;
      if (e.page !== undefined && e.page !== page) continue;
      on = !e.keep;
    }
  }
  return on;
}

/** Page roles after the operator's door: a page re-included as a tile joins the nearest sheet. */
export function rolesOf(
  classes: PageClassification[],
  edits: PageMaskEdit[],
): PageClassification[] {
  const out = classes.map((c) => ({ ...c }));
  for (const e of edits) {
    if (!('role' in e)) continue;
    const c = out.find((x) => x.file === e.file && x.page === e.page);
    if (!c || c.cls === e.role) continue;
    if (e.role === 'tile') {
      const near = out
        .filter((x) => x.cls === 'tile' && x.file === e.file)
        .sort((a, b) => Math.abs(a.page - e.page) - Math.abs(b.page - e.page))[0];
      c.sheet = near?.sheet ?? 0;
    } else delete c.sheet;
    c.cls = e.role;
    c.confidence = 1;
    c.why = `set by the operator (was: ${c.why})`;
  }
  return out;
}

type Opts = {
  checkCancel?: () => void;
  progress?: (done: number, total: number, note?: string) => void;
};

/**
 * 8a: masks of every tile page (the docs are NOT touched — `applyMasks` sets the flags), pages set
 * aside, the stroke texts, and a scale candidate per test square drawn as line work.
 */
export function cleanPages(
  docs: SourceDoc[],
  classes: PageClassification[],
  input: CleanInput,
  o: Opts = {},
): Omit<CleanOutput, 'previews' | 'scale'> {
  const edits = input.edits ?? [];
  const roles = rolesOf(classes, edits);
  const roleOf = new Map(roles.map((c) => [pageKey(c.file, c.page), c]));
  const edited = new Set(edits.flatMap((e) => ('role' in e ? [pageKey(e.file, e.page)] : [])));
  // a page is set aside by itself only when it holds no line work that could be pattern; one
  // that does (a long line, a closed contour of a piece's size) is set aside as the classifier
  // said but flagged — the files step shows its thumbnail, one click reads it as a tile
  const docPage = new Map(
    docs.flatMap((d) => d.pages.map((pg) => [pageKey(d.file.id, pg.page), pg] as const)),
  );
  const dropped: CleanOutput['dropped'] = roles
    .filter((c) => c.cls !== 'tile')
    .map((c) => {
      const pg = docPage.get(pageKey(c.file, c.page));
      const art = pg && !edited.has(pageKey(c.file, c.page)) ? patternLike(pg) : null;
      return {
        file: c.file,
        page: c.page,
        cls: c.cls,
        why: c.why,
        status: art ? ('suggest' as const) : ('auto' as const),
        ...(art ? { drawing: art } : {}),
      };
    });
  const droppedOf = new Map(dropped.map((d) => [pageKey(d.file, d.page), d]));
  const notes: string[] = [];
  const pages: PageMask[] = [];
  const curveTexts: CurveText[] = [];
  const scaleHints: ScaleCandidate[] = [];
  const total = docs.reduce((a, d) => a + d.pages.length, 0);
  let done = 0;
  for (const doc of docs) {
    const tiles = doc.pages.filter((p) => roleOf.get(pageKey(doc.file.id, p.page))?.cls === 'tile');
    const pcs: PageChains[] = [];
    for (const pg of tiles) {
      o.checkCancel?.();
      pcs.push(pageChains(pg));
      o.progress?.(++done, total * 2, `${doc.file.name} · page ${pg.page + 1}`);
    }
    // repetition counts only between tiles of ONE file: per-size files overlay at one place
    const rep =
      pcs.length >= CLEAN.repeatMinPages
        ? repetition(pcs)
        : pcs.map((pc) => pc.chains.map(() => 1));
    const textRep =
      pcs.length >= CLEAN.repeatMinPages
        ? repeatedTexts(tiles)
        : tiles.map(() => new Map<number, number>());
    const foundOf = pcs.map((pc, k) => {
      o.checkCancel?.();
      return detectPage(pc, rep[k], textRep[k], notes);
    });
    // Tile chrome is decided per FILE and kind: where garment lines end on a frame (they are cut
    // at it on the tile — blazer, Redcafe), the frame closes their gaps at the seams once tiles
    // meet, and half a frame masked loses its corners to the furniture test downstream — either
    // way pieces leak. Such chrome is offered on every page of the file, never applied alone.
    const touchedKinds = new Set(
      foundOf.flatMap((fs) => fs.filter((f) => f.repeated && f.touched).map((f) => f.kind)),
    );
    for (const fs of foundOf)
      for (const f of fs)
        if (f.repeated && f.chrome && touchedKinds.has(f.kind)) {
          f.repeated = false;
          f.evidence = [...f.evidence.slice(0, 1)];
          notes.push(
            `${doc.file.name}: ${f.kind} — garment lines end on it on some tile, offered, not applied`,
          );
        }
    for (let k = 0; k < pcs.length; k++) {
      o.checkCancel?.();
      const pc = pcs[k];
      const found = foundOf[k];
      for (const f of found)
        if (f.band)
          curveTexts.push({
            file: doc.file.id,
            page: pc.page.page,
            bbox: f.band.box,
            along: f.band.along,
            glyphs: f.band.glyphs.length,
            heightMm: f.band.heightMm,
          });
      const items = itemsOf(pc, found, doc.file.id, edits, input);
      found.forEach((f, k) => {
        if (!f.square) return;
        // itemsOf keeps the order of `found`
        const it = items[k];
        if (!it.applied && it.status === 'auto') return; // the operator said it is not one
        const b = f.square.box;
        const measured = (b.maxX - b.minX + (b.maxY - b.minY)) / 2;
        scaleHints.push({
          method: 'test-square',
          factor: f.square.nominalMm / measured,
          measuredMm: measured,
          declaredMm: f.square.nominalMm,
          evidence: {
            page: pc.page.page,
            bbox: b,
            text: `square drawn as lines, ${measured.toFixed(2)} mm (${it.evidence.slice(1).join('; ') || 'nothing labels it'})`,
          },
          // certain only with the scale keyword (or the operator's accept): a square with any
          // other label may be a small piece
          confidence: it.applied ? 0.97 : 0.6,
        });
      });
      pages.push({
        file: doc.file.id,
        page: pc.page.page,
        role: 'tile',
        roleEdited: edited.has(pageKey(doc.file.id, pc.page.page)) || undefined,
        items,
      });
      o.progress?.(++done, total * 2);
    }
    for (const pg of doc.pages) {
      const c = roleOf.get(pageKey(doc.file.id, pg.page));
      if (c && c.cls !== 'tile')
        pages.push({
          file: doc.file.id,
          page: pg.page,
          role: c.cls,
          roleEdited: edited.has(pageKey(doc.file.id, pg.page)) || undefined,
          status: droppedOf.get(pageKey(doc.file.id, pg.page))?.status,
          items: [],
        });
    }
  }
  if (input.aiHints?.pages?.length)
    notes.push(`AI page roles given: ${input.aiHints.pages.length}`);
  pages.sort((a, b) => Number(a.file) - Number(b.file) || a.page - b.page);
  const { summary, offered } = countsOf(pages.flatMap((p) => p.items));
  return {
    pages,
    dropped,
    classes: roles,
    summary,
    offered,
    scaleHints,
    curveTexts,
    notes: [...new Set(notes)],
  };
}

/** The detectors of one tile page, in priority order (a line goes to the first that takes it). */
function detectPage(
  pc: PageChains,
  rep: number[],
  textRep: Map<TextId, number>,
  notes: string[],
): Found[] {
  const styles = new Map(pc.page.styles.map((s) => [s.id, s]));
  const taken = new Set<number>();
  const out: Found[] = [];
  const polys = pc.chains.map((c) => c.pts);
  const lens = pc.chains.map((c) => c.lengthMm);
  const drawn = drawingOf(pc);
  const at = `page ${pc.page.page + 1}`;
  // tile chrome: the same line at one page place on ≥ 3 tiles, that no tile clipped (a garment
  // line cut at the printable area repeats too) and that is not a closed piece-sized shape
  const furnitureMemo = new Map<number, boolean>();
  const furniture = (i: number) => {
    if (rep[i] < CLEAN.repeatMinPages) return false;
    let v = furnitureMemo.get(i);
    if (v === undefined) {
      v = !clippedByPage(pc, i, rep, drawn) && !pieceSized(pc, i, drawn);
      furnitureMemo.set(i, v);
    }
    return v;
  };
  const take = (f: Found) => {
    f.chains = f.chains.filter((i) => !taken.has(i));
    if (!f.chains.length) return;
    for (const i of f.chains) taken.add(i);
    out.push(f);
  };
  // the lattice first (its long lines would glue every glyph into one cluster), then the stroke
  // text — both found before any guard runs, so neither protects the other
  const lattices = gridOf(pc, styles, rep);
  const lattice = new Set(lattices.flatMap((f) => f.chains));
  const bands = !CLEAN.on.text
    ? []
    : textLines(
        polys,
        {
          minH: CLEAN.textMinHeightMm,
          maxH: CLEAN.textMaxHeightMm,
          minGlyphs: CLEAN.textMinGlyphs,
          minStrokes: CLEAN.textMinStrokes,
        },
        (i) => !lattice.has(i),
      );
  const lettered = new Set(bands.flatMap(memberIds));
  // test squares are found before any guard too: a square's corners on lattice lines (wm: the
  // 100 mm square drawn on the 10 mm grid) are furniture meeting furniture
  const squares = squaresOf(pc, pc.page.texts, lettered);
  const squared = new Set(squares.flatMap((f) => f.chains));
  // what never protects a candidate: what is already found, the lattice, lettering, the squares,
  // tile chrome
  const inert = (i: number) =>
    taken.has(i) || lattice.has(i) || lettered.has(i) || squared.has(i) || furniture(i);
  // 1 · the lattice: masks by itself only on repetition / a whole-page 10 mm pitch (gridOf).
  //     An unproven lattice (a quilting grid inside a piece) is guarded to closure: what line
  //     work meets stays line work — the walls its spacing swallowed with it — the rest is a
  //     suggestion. A PROVEN print lattice is masked whole: the garment lines that end on its
  //     lines (drawn snapped to the grid) are their own paths and stay; a full-page grid line
  //     kept live would cross every piece it runs through (Redcafe: 9 such lines, one more
  //     legend row) — the contacts go to the notes.
  for (const f of lattices) {
    const proven = !!(f.repeated || f.proof);
    // a proven print lattice is clipped with the drawing at its own box: garment lines cut at
    // that printable edge meet its ends there — no contact
    const edge = proven ? bboxOf(f.chains.flatMap((i) => polys[i])) : undefined;
    const g = guardNetwork(polys, lens, f.chains, inert, edge);
    if (g.size) {
      const n = f.chains.length;
      f.guarded = g.size;
      if (proven)
        notes.push(
          `${at}: line work ends on ${g.size} of ${n} lines of the print grid (snapped to it) — masked with the grid; the garment lines are their own paths`,
        );
      else {
        f.chains = f.chains.filter((i) => !g.has(i));
        notes.push(`${at}: ${g.size} of ${n} grid lines meet line work — kept as line work`);
      }
    }
    take(f);
  }
  // 2 · stroke text: a band of glyphs; mostly repeated on every tile = the tile's label (auto);
  //     any other text line is a suggestion (one geometric evidence)
  for (const b of bands) {
    const ids = memberIds(b).filter((i) => !taken.has(i));
    if (!ids.length) continue;
    const repeated = ids.filter((i) => rep[i] >= CLEAN.repeatMinPages);
    const isLabel = repeated.length >= 0.2 * ids.length;
    const guarded = touchingLineWork(polys, lens, new Set(ids), inert);
    const keep = ids.filter((i) => !guarded.has(i));
    const ev = [
      `a text line of ${b.glyphs.length} glyphs ${b.heightMm.toFixed(0)} mm high, ${runStrokes(b)} strokes`,
    ];
    if (isLabel)
      ev.push(`repeats at one place on ${Math.max(...repeated.map((i) => rep[i]))} tiles`);
    take({
      kind: isLabel ? 'tile-label' : 'curve-text',
      chains: keep,
      evidence: ev,
      repeated: isLabel,
      guarded: guarded.size,
      band: b,
    });
  }
  // 3 · the test square drawn as line work (auto only with the scale keyword: `squaresOf`)
  for (const f of squares) {
    const g = touchingLineWork(polys, lens, new Set(f.chains), inert);
    if (g.size) {
      notes.push(`${at}: a ${f.square!.nominalMm} mm square is met by line work — not masked`);
      continue;
    }
    take(f);
  }
  // 3b · ruled tables with text in their cells (a size table, the print-order map): auto only on
  //      repetition / a whole-page pitch, like the lattice; a table line work meets is offered
  for (const f of tablesOf(pc, pc.page.texts, taken, lettered, rep, notes)) {
    const g = guardNetwork(polys, lens, f.chains, inert);
    if (g.size) {
      f.chains = f.chains.filter((i) => !g.has(i));
      f.guarded = g.size;
      demote(f, `line work meets ${g.size} of its lines`);
    }
    take(f);
  }
  // 4 · tile chrome: the same line at one page place on ≥ 3 tiles of the file
  const byKind = new Map<BackgroundKind, number[]>();
  pc.chains.forEach((_, i) => {
    if (!CLEAN.on.chrome || taken.has(i) || rep[i] < CLEAN.repeatMinPages) return;
    if (!furniture(i)) {
      if (pieceSized(pc, i, drawn))
        notes.push(`${at}: a closed piece-sized shape repeats at one page place — kept as a piece`);
      return;
    }
    const k = chromeKind(pc, i);
    const a = byKind.get(k);
    if (a) a.push(i);
    else byKind.set(k, [i]);
  });
  // The guard looks at the chain's OWN ends only: a garment line cut at the tile frame ends ON the
  // frame on every tile (blazer), and a frame half masked is worse than either — the furniture test
  // downstream lost its corners and the rest became a wall (blazer's back leaked into the frame).
  // A chain whose own end runs on into a garment line is that line's piece (Redcafe's outline
  // stubs at the same page place on a row of tiles).
  //
  // Marks are not frames (A8b, owner 10.10 — Redcafe 44: the corner brackets, filled 15 × 1 mm
  // bars on every tile, were only offered because garment lines end on them; live, the wall
  // tracing ran around their arms and the cut line got 15 × 1 mm hairpins). A small repeated
  // CLOSED shape (a bracket, a crosshair ring, an arrow head) IS the mark: masking it removes
  // only its own paths (`itemsOf` masks a path only when every chain it feeds is masked), never
  // the garment line that touches it — no guard, and it never makes the kind "touched". An open
  // small mark keeps the own-ends guard (a garment stub repeats at one page place too).
  for (const [kind, ids] of byKind) {
    const mark = CLEAN.on.marks && (kind === 'regmark' || kind === 'tile-label');
    const isMark = (i: number) => mark && pc.chains[i].closed;
    const guarded = touchingLineWork(polys, lens, new Set(ids.filter((i) => !isMark(i))), inert, {
      ownEndsOnly: true,
      along: false,
    });
    const keep = ids.filter((i) => !guarded.has(i));
    const n = Math.max(...keep.map((i) => rep[i]), 0);
    // garment lines ending ON the chrome, or running along it (a CF on the tile frame): the
    // file-wide decision in cleanPages — frames only (a mark is masked whatever touches it)
    const met = mark ? new Set<number>() : touchingLineWork(polys, lens, new Set(keep), inert);
    take({
      kind,
      chains: keep,
      evidence: [`${keep.length} lines repeat at one page place on ${n} tiles`],
      repeated: true,
      chrome: true,
      touched: met.size > 0,
      guarded: guarded.size,
    });
  }
  // 5 · text furniture (real text): the same words at one page place on ≥ 3 tiles; a URL / ©
  const texts: { kind: BackgroundKind; ids: TextId[]; ev: string[]; repeated: boolean }[] = [];
  const repT = !CLEAN.on.texts
    ? []
    : pc.page.texts.filter((t) => (textRep.get(t.id) ?? 0) >= CLEAN.repeatMinPages);
  if (repT.length)
    texts.push({
      kind: 'tile-label',
      ids: repT.map((t) => t.id),
      ev: [
        `${repT.length} ${repT.length === 1 ? 'text repeats' : 'texts repeat'} at one page place on ${Math.max(...repT.map((t) => textRep.get(t.id) ?? 0))} tiles`,
      ],
      repeated: true,
    });
  const copy = !CLEAN.on.texts
    ? []
    : pc.page.texts.filter((t) => COPYRIGHT.test(t.text) && !repT.includes(t));
  if (copy.length)
    texts.push({
      kind: 'copyright',
      ids: copy.map((t) => t.id),
      ev: [`reads like a URL / copyright: "${copy[0].text.slice(0, 40)}"`],
      repeated: false,
    });
  for (const t of texts)
    out.push({
      kind: t.kind,
      chains: [],
      evidence: t.ev,
      repeated: t.repeated,
      // the URL / © lexicon is an explicit keyword: masks by itself (text only, never line work)
      ...(t.kind === 'copyright' ? { proof: 'the URL / copyright lexicon' } : {}),
      label: pc.page.texts.find((x) => x.id === t.ids[0])?.text,
      textIds: t.ids,
    });
  return out;
}

/**
 * The guard on a network of lines (a lattice, a ruled table) to closure: a line kept as line work
 * protects the lines that meet it in turn — a quilting grid whose lines end on a piece's walls
 * keeps the walls the lattice spacing swallowed (and then itself).
 */
function guardNetwork(
  polys: readonly (readonly { x: number; y: number }[])[],
  lens: readonly number[],
  ids: readonly number[],
  inert: (i: number) => boolean,
  edge?: { minX: number; minY: number; maxX: number; maxY: number },
): Set<number> {
  const kept = new Set<number>();
  const cand = new Set(ids);
  for (let pass = 0; pass < 8 && cand.size; pass++) {
    const g = touchingLineWork(polys, lens, cand, (i) => !kept.has(i) && inert(i), { edge });
    if (!g.size) break;
    for (const i of g) {
      kept.add(i);
      cand.delete(i);
    }
  }
  return kept;
}

/** A find the guard cut into: no longer proven, offered at most. */
function demote(f: Found, why: string) {
  f.repeated = false;
  f.proof = undefined;
  f.evidence = [...f.evidence.filter((e) => !/repeats at one|whole page/.test(e)), why];
}

/**
 * What on a page could be pattern line work: a line ≥ 100 mm or a closed contour of a piece's
 * size (`minPieceAreaMm2`). Null = nothing (a text page, a cover with a photo) — safe to set aside.
 */
function patternLike(pg: IRPage): string | null {
  if (!pg.paths.length) return null;
  const { chains } = pageChains(pg);
  const long = chains.reduce((a, c) => Math.max(a, c.lengthMm), 0);
  if (long >= 100) return `a line ${Math.round(long)} mm long`;
  for (const c of chains) {
    if (!c.closed) continue;
    let a = 0;
    const q = c.pts;
    for (let k = 0, j = q.length - 1; k < q.length; j = k++)
      a += (q[j].x + q[k].x) * (q[j].y - q[k].y);
    if (Math.abs(a) / 2 >= PATIMPORT.minPieceAreaMm2)
      return `a closed contour of ${Math.round(Math.abs(a) / 200)} cm²`;
  }
  return null;
}

/** For each text of each tile page: on how many tiles the same words (digits aside) sit there. */
function repeatedTexts(tiles: IRPage[]): Map<TextId, number>[] {
  const norm = (t: IRText) => t.text.replace(/\d+/g, '#').trim().toLowerCase();
  const all: { page: number; key: string; x: number; y: number; id: TextId }[] = [];
  tiles.forEach((pg, k) =>
    pg.texts.forEach((t) => {
      if (t.text.trim().length >= 2)
        all.push({ page: k, key: norm(t), x: t.anchor.x, y: t.anchor.y, id: t.id });
    }),
  );
  const byKey = new Map<string, typeof all>();
  for (const a of all) {
    const l = byKey.get(a.key);
    if (l) l.push(a);
    else byKey.set(a.key, [a]);
  }
  const out = tiles.map(() => new Map<TextId, number>());
  for (const l of byKey.values()) {
    if (new Set(l.map((a) => a.page)).size < CLEAN.repeatMinPages) continue;
    for (const a of l) {
      const pagesAt = new Set(
        l.filter((b) => Math.abs(b.x - a.x) <= 2 && Math.abs(b.y - a.y) <= 2).map((b) => b.page),
      );
      out[a.page].set(a.id, pagesAt.size);
    }
  }
  return out;
}

/** Found objects → mask items: owned paths, D3 status, the operator's decision. */
function itemsOf(
  pc: PageChains,
  found: Found[],
  file: string,
  edits: PageMaskEdit[],
  input: CleanInput,
): MaskItem[] {
  // a path is masked only when every chain it feeds is masked (a path split into two chains, one
  // of them a garment line, stays)
  const chainsOfPath = new Map<PathId, number[]>();
  pc.pathsOf.forEach((ps, i) =>
    ps.forEach((p) => {
      const a = chainsOfPath.get(p);
      if (a) a.push(i);
      else chainsOfPath.set(p, [i]);
    }),
  );
  const seq = new Map<BackgroundKind, number>();
  const junk = (input.aiHints?.junk ?? []).filter(
    (j) => j.file === file && j.page === pc.page.page,
  );
  return found.map((f) => {
    const n = seq.get(f.kind) ?? 0;
    seq.set(f.kind, n + 1);
    const mine = new Set(f.chains);
    const paths = [...new Set(f.chains.flatMap((i) => pc.pathsOf[i]))].filter((p) =>
      (chainsOfPath.get(p) ?? []).every((i) => mine.has(i)),
    );
    const textIds = f.textIds;
    const pts = f.chains.flatMap((i) => pc.chains[i].pts);
    const tb = textIds?.length
      ? pc.page.texts
          .filter((t) => textIds.includes(t.id))
          .flatMap((t) => [
            { x: t.bbox.minX, y: t.bbox.minY },
            { x: t.bbox.maxX, y: t.bbox.maxY },
          ])
      : [];
    const bbox = bboxOf([...pts, ...tb]);
    const evidence = [...f.evidence];
    // A9 hook: an AI junk box over the object is one more evidence (empty today)
    const ai = junk.find(
      (j) =>
        j.kind === f.kind &&
        j.bbox.minX <= bbox.maxX &&
        j.bbox.maxX >= bbox.minX &&
        j.bbox.minY <= bbox.maxY &&
        j.bbox.maxY >= bbox.minY,
    );
    if (ai) evidence.push(`the AI reads it as ${ai.kind}${ai.text ? ` "${ai.text}"` : ''}`);
    if (f.proof && !evidence.includes(f.proof)) evidence.push(f.proof);
    // D3 until A9: repetition or an explicit keyword masks by itself; geometry alone (however many
    // shapes agree) is one evidence — a suggestion. The AI's word is the independent second one.
    const status = f.repeated || f.proof || (ai && evidence.length >= 2) ? 'auto' : 'suggest';
    const base = {
      id: `${file}:${pc.page.page}:${f.kind}:${n}`,
      kind: f.kind,
      status,
      evidence,
      confidence: status === 'auto' ? 0.9 : 0.6,
      paths,
      ...(textIds?.length ? { texts: textIds } : {}),
      lines: f.chains.length || (textIds?.length ?? 0),
      bbox,
      ...(f.label ? { label: f.label } : {}),
    } as Omit<MaskItem, 'applied'>;
    return { ...base, applied: appliedOf(base, file, pc.page.page, edits) };
  });
}

export function countsOf(items: { kind: BackgroundKind; lines: number; applied: boolean }[]) {
  const summary: Partial<Record<BackgroundKind, number>> = {};
  const offered: Partial<Record<BackgroundKind, number>> = {};
  for (const it of items) {
    const m = it.applied ? summary : offered;
    m[it.kind] = (m[it.kind] ?? 0) + it.lines;
  }
  const sorted = (m: typeof summary) =>
    Object.fromEntries(
      KIND_ORDER.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]),
    ) as typeof summary;
  return { summary: sorted(summary), offered: sorted(offered) };
}

/** The flags on the docs: every applied item's paths and texts; everything else is line work. */
export function applyMasks(docs: SourceDoc[], pages: PageMask[]): void {
  const by = new Map(pages.map((p) => [pageKey(p.file, p.page), p]));
  for (const doc of docs)
    for (const pg of doc.pages) {
      for (const p of pg.paths) if (p.background) delete p.background;
      for (const t of pg.texts) if (t.background) delete t.background;
      const m = by.get(pageKey(doc.file.id, pg.page));
      if (!m) continue;
      const pathById = new Map(pg.paths.map((p) => [p.id, p]));
      const textById = new Map(pg.texts.map((t) => [t.id, t]));
      for (const it of m.items) {
        if (!it.applied) continue;
        for (const id of it.paths) {
          const p = pathById.get(id);
          if (p) p.background = it.kind;
        }
        for (const id of it.texts ?? []) {
          const t = textById.get(id);
          if (t) t.background = it.kind;
        }
      }
    }
}

/** extract's candidates + the clean stage's squares, best first (a certain square first). */
export function mergeScale(extracted: ScaleCandidate[], hints: ScaleCandidate[]): ScaleCandidate[] {
  const real = extracted.filter((c) => c.method !== 'none');
  const all = [...hints, ...real];
  if (!all.length) return extracted;
  return all.sort((a, b) => b.confidence - a.confidence);
}

// ── 8b · the sheet pass ─────────────────────────────────────────────────────────────────────────

/**
 * After assembly, before chains — what no single page holds:
 *  1. outline lettering over the whole sheet (a watermark whose letters the tile borders cut): a
 *     row of ≥ 4 outline glyphs 20–250 mm high, of one height, of different widths (evidence 1)
 *     that foreign lines CROSS — printed over the drawing — or that is printed again elsewhere on
 *     the sheet (evidence 2);
 *  2. stroke text the pages could not prove: a label cut by a tile border, letters the unmasked
 *     watermark met — the 8a text rule (a text line + clear of the garment lines) on the sheet.
 * Sets the flags on the sheet's paths; returns what it masked for the sheet step.
 */
export function cleanSheet(
  sheet: Sheet,
  edits: PageMaskEdit[],
  /** Source keys (`srcKey`) of the paths a page item already offers — not offered twice. */
  offered: ReadonlySet<string> = new Set(),
): SheetClean['items'] {
  // the sheet's line work linked as the chains stage links it (masked paths stay out): a PDF that
  // draws a curve as one-segment paths has an END every millimetre, and ends are what glues glyph
  // strokes together — path by path, every letter a curve crosses joins the curve
  const { chains } = makeChains(sheet, DEFAULT_CHAIN_OPTS);
  const polys = chains.map((c) => c.pts);
  const lens = chains.map((c) => c.lengthMm);
  const pathsOf = chains.map((c) => [...new Set(c.ranges.map((r) => r.path))]);
  const chainsOfPath = new Map<PathId, number[]>();
  pathsOf.forEach((ps, i) =>
    ps.forEach((p) => {
      const a = chainsOfPath.get(p);
      if (a) a.push(i);
      else chainsOfPath.set(p, [i]);
    }),
  );
  const pathById = new Map(sheet.paths.map((p) => [p.id, p]));
  const taken = new Set<number>();
  // a chain every path of which a page item offers already (a stroke-text suggestion) is that
  // item's: accepting the kind takes both
  const pageOffered = (i: number) =>
    offered.size > 0 &&
    pathsOf[i].length > 0 &&
    pathsOf[i].every((id) => {
      const p = pathById.get(id);
      return !!p && offered.has(srcKey(p.src));
    });
  const live = (i: number) => !taken.has(i) && polys[i].length >= 2;
  /** Lettering found on the sheet (rows, bands): never protects a candidate. */
  const letters = new Set<number>();
  const inert = (i: number) => taken.has(i) || letters.has(i);
  const out: SheetClean['items'] = [];
  const add = (
    kind: 'watermark' | 'curve-text',
    n: number,
    keep: number[],
    evidence: string[],
    status: 'auto' | 'suggest',
    box: SheetClean['items'][number]['bbox'],
  ) => {
    const base = {
      id: `sheet:${kind}:${n}`,
      kind,
      status,
      evidence,
      confidence: status === 'auto' ? 0.9 : 0.6,
      lines: keep.length,
      bbox: box,
    };
    const applied = appliedOf(base, '', -1, edits);
    const mine = new Set(keep);
    const pages = new Map<string, { file: string; page: number }>();
    for (const c of keep) {
      if (applied) taken.add(c);
      for (const id of pathsOf[c]) {
        const p = pathById.get(id);
        if (!p) continue;
        pages.set(pageKey(p.src.file, p.src.page), { file: p.src.file, page: p.src.page });
        // a path is masked only when every chain it feeds is (a path split into a garment line
        // and a letter stays)
        if (applied && (chainsOfPath.get(id) ?? []).every((o) => mine.has(o) || taken.has(o)))
          p.background = kind;
      }
    }
    out.push({ ...base, applied, pages: [...pages.values()] });
  };
  // 1 · outline lettering
  const rows = !CLEAN.on.watermark
    ? []
    : textLines(
        polys,
        {
          minH: CLEAN.markMinHeightMm,
          maxH: CLEAN.markMaxHeightMm,
          minGlyphs: 4,
          minStrokes: 8,
          maxGap: CLEAN.markMaxGap,
          maxAspect: CLEAN.markMaxAspect,
          endsOnly: true,
        },
        live,
      );
  for (const r of rows) for (const i of memberIds(r)) letters.add(i);
  if (rows.length) {
    const grid = new SegGrid(8);
    polys.forEach((p, i) => {
      if (live(i)) grid.addPolyline(i, p);
    });
    rows.forEach((r, n) => {
      const ids = memberIds(r);
      const mine = new Set(ids);
      const crossed = crossedGlyphs(r, polys, (i) => live(i) && !mine.has(i), grid);
      const again = rows.filter(
        (o) =>
          o !== r &&
          Math.abs(o.glyphs.length - r.glyphs.length) <= 1 &&
          Math.abs(o.heightMm - r.heightMm) <= 0.1 * r.heightMm,
      ).length;
      const evidence = [
        `a row of ${r.glyphs.length} outline letters ${r.heightMm.toFixed(0)} mm high`,
      ];
      if (crossed >= 2) evidence.push(`printed over the drawing: lines cross ${crossed} letters`);
      if (again) evidence.push(`the same row is printed ${again + 1} times on the sheet`);
      // letterforms: the members are LETTERS (sharp corners of W, V, A) — a long row only
      const sharp = sharpGlyphs(r, polys);
      if (
        r.glyphs.length >= CLEAN.letterformMinGlyphs &&
        sharp >= CLEAN.letterformMinSharp &&
        sharp >= r.glyphs.length / 4
      )
        evidence.push(
          `${sharp} of its ${r.glyphs.length} shapes have the sharp corners of letters`,
        );
      // a stroke line work meets stays line work whatever the row says
      const guarded = touchingLineWork(polys, lens, mine, inert);
      // letter shapes in a row are ONE geometric evidence however many agree: a suggestion
      // until A9's AI reads the word (accepted per kind in one click)
      add(
        'watermark',
        n,
        ids.filter((i) => !guarded.has(i)),
        evidence,
        'suggest',
        r.box,
      );
    });
  }
  // 2 · stroke text left over
  const bands = !CLEAN.on.sheetText
    ? []
    : textLines(
        polys,
        {
          minH: CLEAN.textMinHeightMm,
          maxH: CLEAN.textMaxHeightMm,
          minGlyphs: CLEAN.textMinGlyphs,
          minStrokes: CLEAN.textMinStrokes,
        },
        live,
      );
  for (const b of bands) for (const i of memberIds(b)) letters.add(i);
  let nText = 0;
  for (const b of bands) {
    const ids = memberIds(b).filter((i) => live(i) && !pageOffered(i));
    if (!ids.length) continue;
    const guarded = touchingLineWork(polys, lens, new Set(ids), inert);
    const evidence = [
      `a text line of ${b.glyphs.length} glyphs ${b.heightMm.toFixed(0)} mm high, ${runStrokes(b)} strokes`,
    ];
    add(
      'curve-text',
      nText++,
      ids.filter((i) => !guarded.has(i)),
      evidence,
      'suggest',
      b.box,
    );
  }
  return out;
}
