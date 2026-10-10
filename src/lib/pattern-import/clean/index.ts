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
  const dropped = roles
    .filter((c) => c.cls !== 'tile')
    .map((c) => ({ file: c.file, page: c.page, cls: c.cls, why: c.why }));
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
      CLEAN.on.chrome && pcs.length >= CLEAN.repeatMinPages
        ? repetition(pcs)
        : pcs.map((pc) => pc.chains.map(() => 1));
    const textRep =
      pcs.length >= CLEAN.repeatMinPages
        ? repeatedTexts(tiles)
        : tiles.map(() => new Map<number, number>());
    for (let k = 0; k < pcs.length; k++) {
      o.checkCancel?.();
      const pc = pcs[k];
      const found = detectPage(pc, rep[k], textRep[k], notes);
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
            text: `square drawn as lines, ${measured.toFixed(2)} mm (${f.evidence.slice(1).join('; ') || 'nothing labels it'})`,
          },
          // two evidences (the geometry + a label, lettering inside or overlaid copies): certain
          confidence: it.status === 'auto' ? 0.97 : 0.75,
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
          items: [],
        });
    }
  }
  if (input.aiHints?.pages?.length)
    notes.push(`AI page roles given: ${input.aiHints.pages.length}`);
  pages.sort((a, b) => Number(a.file) - Number(b.file) || a.page - b.page);
  const { summary, offered } = countsOf(pages.flatMap((p) => p.items));
  return { pages, dropped, classes: roles, summary, offered, scaleHints, curveTexts, notes };
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
  const take = (f: Found) => {
    f.chains = f.chains.filter((i) => !taken.has(i));
    if (!f.chains.length) return;
    for (const i of f.chains) taken.add(i);
    out.push(f);
  };
  // 1 · the lattice (pen evidence; it is no garment line, the guard does not apply)
  for (const f of gridOf(pc, styles)) take(f);
  // 2 · stroke text: a band of glyphs; mostly repeated on every tile = the tile's label
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
        (i) => !taken.has(i),
      );
  const lettered = new Set<number>();
  for (const b of bands) {
    const ids = memberIds(b).filter((i) => !taken.has(i));
    if (!ids.length) continue;
    const repeated = ids.filter((i) => rep[i] >= CLEAN.repeatMinPages);
    const isLabel = repeated.length >= 0.2 * ids.length;
    const guarded = touchingLineWork(polys, lens, new Set(ids), taken);
    const keep = ids.filter((i) => !guarded.has(i));
    for (const i of ids) lettered.add(i);
    const ev = [
      `a text line of ${b.glyphs.length} glyphs ${b.heightMm.toFixed(0)} mm high, ${runStrokes(b)} strokes`,
    ];
    if (isLabel)
      ev.push(`repeats at one place on ${Math.max(...repeated.map((i) => rep[i]))} tiles`);
    // the strokes a garment line meets stay line work; the rest of the band is clear of the drawing
    if (guarded.size <= 0.1 * ids.length)
      ev.push(
        guarded.size
          ? `${ids.length - guarded.size} of ${ids.length} strokes clear of the garment lines`
          : 'no garment line meets it',
      );
    take({
      kind: isLabel ? 'tile-label' : 'curve-text',
      chains: keep,
      evidence: ev,
      repeated: isLabel,
      guarded: guarded.size,
      band: b,
    });
  }
  // 3 · the test square drawn as line work (lettering inside it is the second evidence)
  for (const f of squaresOf(pc, pc.page.texts, lettered)) {
    const g = touchingLineWork(polys, lens, new Set(f.chains), taken);
    if (g.size) {
      notes.push(
        `page ${pc.page.page + 1}: a ${f.square!.nominalMm} mm square is met by garment lines — not masked`,
      );
      continue;
    }
    take(f);
  }
  // 3b · ruled tables with text in their cells (a size table, the print-order map)
  for (const f of tablesOf(pc, pc.page.texts, taken, lettered)) {
    const g = touchingLineWork(polys, lens, new Set(f.chains), taken);
    if (g.size) {
      // a garment line ends on it: offered at most, never applied by itself
      f.evidence = f.evidence.slice(0, 1);
      f.chains = f.chains.filter((i) => !g.has(i));
      f.guarded = g.size;
    }
    take(f);
  }
  // 4 · tile chrome: the same line at one page place on ≥ 3 tiles of the file
  const byKind = new Map<BackgroundKind, number[]>();
  pc.chains.forEach((_, i) => {
    if (!CLEAN.on.chrome || taken.has(i) || rep[i] < CLEAN.repeatMinPages) return;
    const k = chromeKind(pc, i);
    const a = byKind.get(k);
    if (a) a.push(i);
    else byKind.set(k, [i]);
  });
  // No wall guard here: a garment line cut at the tile frame ENDS on it on every tile (blazer), and
  // a frame half masked is worse than either — the furniture test downstream no longer sees its
  // corners and the rest became a wall (blazer's back leaked into the frame). A garment line never
  // repeats at one page place on three tiles; that alone is the proof.
  for (const [kind, ids] of byKind) {
    const n = Math.max(...ids.map((i) => rep[i]), 0);
    take({
      kind,
      chains: ids,
      evidence: [`${ids.length} lines repeat at one page place on ${n} tiles`],
      repeated: true,
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
      label: pc.page.texts.find((x) => x.id === t.ids[0])?.text,
      textIds: t.ids,
    });
  return out;
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
    const status = f.repeated || evidence.length >= 2 ? 'auto' : 'suggest';
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
export function cleanSheet(sheet: Sheet, edits: PageMaskEdit[]): SheetClean['items'] {
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
  const live = (i: number) => !taken.has(i) && polys[i].length >= 2;
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
          maxGap: 1.2,
          endsOnly: true,
        },
        live,
      );
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
      // a stroke a garment line meets end-on stays line work whatever the row says
      const guarded = touchingLineWork(polys, lens, mine, taken);
      add(
        'watermark',
        n,
        ids.filter((i) => !guarded.has(i)),
        evidence,
        evidence.length >= 2 ? 'auto' : 'suggest',
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
  bands.forEach((b, n) => {
    const ids = memberIds(b).filter(live);
    if (!ids.length) return;
    const guarded = touchingLineWork(polys, lens, new Set(ids), taken);
    const evidence = [
      `a text line of ${b.glyphs.length} glyphs ${b.heightMm.toFixed(0)} mm high, ${runStrokes(b)} strokes`,
    ];
    if (guarded.size <= 0.1 * ids.length)
      evidence.push(
        guarded.size
          ? `${ids.length - guarded.size} of ${ids.length} strokes clear of the garment lines`
          : 'no garment line meets it',
      );
    add(
      'curve-text',
      n,
      ids.filter((i) => !guarded.has(i)),
      evidence,
      evidence.length >= 2 ? 'auto' : 'suggest',
      b.box,
    );
  });
  return out;
}
