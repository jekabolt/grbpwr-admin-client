// PATTERN-IMPORT · REG probe — tile registration on a printed label grid (bundled by reg.mjs).
//
// Case: Mood's Alghero (MDF445), 50 Letter pages: p1–8 instructions and draping guide, p9–50 tiles
// A1…A8, B1, B8, C1, C8 … J1, J8, K1…K8, L1…L8 — a 12 × 8 grid whose EMPTY interior tiles
// (B2–B7 … J2–J7) are not printed. Before the fix the draping pages read as tiles (they link with
// each other through the logo and frame), the labels were then dropped as "42/47 only" and the
// layout came from seam votes in READING ORDER: a shuffle / strip, interior cells "missing".
//
//   1 · classes: p1–8 not tiles, p9–50 tiles of one sheet;
//   2 · the real worker Session (extract → clean → scale → assemble): 42 tiles, every pose at the
//       cell its label names (row = letter, col = number), 12 rows × 8 cols, every pose within
//       0.5 mm of label × pitch, nothing missing, nothing refused, extent ≈ 1587.5 × 3213 mm;
//       PNG of the assembled sheet;
//   3 · controls — every one must REFUSE (Sheet.refused) or flag a missing tile, never assemble:
//       a · the old classification (p4–8 as tiles): the 42 labelled tiles still on their labels,
//           p4–8 left off and refused;
//       b · the hand grid 1 × 42 in reading order (the strip): refused against the labels;
//       c · B1 and B8 labels swapped (a misread): refused (the drawing breaks at the seams);
//       d · C8 also reads "B8" (two pages one cell): refused;
//       e · L4 dropped (lines run into its cell): missing L4;
//       f · labels read on 12 pages only (below half): seam layout, held to those 12 labels —
//           refused, or every labelled page on its label (never a silent contradiction);
//       g · a dense label grid of 4 tiles where one page prints no label: that page refused;
//       h · a hand grid smaller than the tile count: refused (pages without a cell).
//
//   node scripts/pattern-import/reg.mjs [pdf]   (yarn patimport:reg)
//   env PATIMPORT_ALGHERO (the PDF), REG_OUT (PNG dir, default tmp/plans/pdf-to-dxf/auto/reg)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { encode as encodePng } from 'fast-png';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheetDetailed, classifyPages } from 'lib/pattern-import/assemble';
import { cellLabelOf } from 'lib/pattern-import/assemble/labels';
import type {
  GridOverride,
  IRPage,
  PageClassification,
  Sheet,
  SourceDoc,
} from 'lib/pattern-import/types';
import { readPassport } from 'lib/pattern-import/passport';
import { allowanceFromTexts } from 'lib/pattern-import/semantics/allowance';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const ALGHERO_CANDIDATES = [
  process.env.PATIMPORT_ALGHERO,
  '/private/tmp/alghero-dx/src/alghero.pdf',
  '/Users/jekabolt/Downloads/archive 600 pcs/dresses/MDF445-Alghero-One-Shoulder-Dress-Free-Sewing-Pattern-Sizes-XS-5XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
].filter((x): x is string => !!x);
const OUT =
  process.env.REG_OUT ?? '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/auto/reg';

let fails = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  if (!ok) fails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name} · ${typeof got === 'string' ? got : JSON.stringify(got)}`,
  );
};

const bytesOf = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const sctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });

/** Tile outlines blue, drawing black (downscaled). */
function renderSheet(sheet: Sheet, file: string, maxPx = 1600) {
  const box = sheet.bbox;
  const s = maxPx / Math.max(box.maxX - box.minX, box.maxY - box.minY, 1);
  const w = Math.ceil((box.maxX - box.minX) * s) + 4;
  const h = Math.ceil((box.maxY - box.minY) * s) + 4;
  const data = new Uint8Array(w * h * 3).fill(255);
  const px = (x: number, y: number, c: number[]) => {
    const X = Math.round((x - box.minX) * s) + 2;
    const Y = Math.round((box.maxY - y) * s) + 2;
    if (X < 0 || Y < 0 || X >= w || Y >= h) return;
    data.set(c, (Y * w + X) * 3);
  };
  const line = (ax: number, ay: number, bx: number, by: number, c: number[]) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * s));
    if (n > 40000) return;
    for (let i = 0; i <= n; i++) px(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, c);
  };
  for (const p of sheet.poses) {
    const m = p.toSheet;
    const c = [
      [0, 0],
      [p.widthMm, 0],
      [p.widthMm, p.heightMm],
      [0, p.heightMm],
    ].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    for (let i = 0; i < 4; i++)
      line(c[i][0], c[i][1], c[(i + 1) % 4][0], c[(i + 1) % 4][1], [150, 200, 255]);
  }
  for (const path of sheet.paths) {
    if (path.background) continue;
    const st = sheet.styles[path.style];
    const col = st?.fill && !st.widthMm ? [170, 170, 170] : [0, 0, 0];
    const pts = path.closed ? [...path.pts, path.pts[0]] : path.pts;
    for (let i = 1; i < pts.length; i++) line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, col);
  }
  writeFileSync(file, encodePng({ width: w, height: h, data, channels: 3 }));
  return file;
}

/** Every pose against its page's printed label: cell, and position on label × pitch. */
function againstLabels(sheet: Sheet, pages: IRPage[]) {
  const byPage = new Map(pages.map((p) => [p.page, p]));
  const lab = sheet.poses.map((p) => ({ p, l: cellLabelOf(byPage.get(p.page) as IRPage) }));
  const offCell = lab.filter(({ p, l }) => !l || l.row !== p.row || l.col !== p.col);
  // Pitch from the A1 → A2 and A1 → B1 poses; then every tile at label × pitch.
  const at = (r: number, c: number) => lab.find(({ l }) => l?.row === r && l?.col === c)?.p;
  const a1 = at(0, 0);
  const a2 = at(0, 1);
  const b1 = at(1, 0);
  let worst = Infinity;
  if (a1 && a2 && b1) {
    worst = 0;
    const R = { x: a2.toSheet.e - a1.toSheet.e, y: a2.toSheet.f - a1.toSheet.f };
    const B = { x: b1.toSheet.e - a1.toSheet.e, y: b1.toSheet.f - a1.toSheet.f };
    for (const { p, l } of lab) {
      if (!l) continue;
      const ex = a1.toSheet.e + l.col * R.x + l.row * B.x;
      const ey = a1.toSheet.f + l.col * R.y + l.row * B.y;
      worst = Math.max(worst, Math.hypot(p.toSheet.e - ex, p.toSheet.f - ey));
    }
  }
  return { offCell, worst };
}

/** A deep enough copy of the doc to edit texts / drop pages per control. */
const cloneDoc = (d: SourceDoc): SourceDoc => ({
  ...d,
  pages: d.pages.map((p) => ({ ...p, texts: p.texts.map((t) => ({ ...t })) })),
});

const setLabel = (pg: IRPage, from: string, to: string | null) => {
  const t = pg.texts.find((x) => x.text.trim() === from);
  if (!t) throw new Error(`page ${pg.page + 1}: no label "${from}"`);
  if (to === null) pg.texts = pg.texts.filter((x) => x !== t);
  else t.text = to;
};

const tileClasses = (doc: SourceDoc, pages: number[]): PageClassification[] =>
  doc.pages.map((p) =>
    pages.includes(p.page + 1)
      ? { file: p.file, page: p.page, cls: 'tile', sheet: 0, confidence: 1, why: 'control' }
      : { file: p.file, page: p.page, cls: 'instructions', confidence: 1, why: 'control' },
  );

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export async function main(args: string[]): Promise<number> {
  const path = args[0] ?? ALGHERO_CANDIDATES.find((p) => existsSync(p));
  if (!path || !existsSync(path)) {
    console.log(
      `FAIL  alghero · the PDF is not on this machine (${ALGHERO_CANDIDATES.join(' | ')})`,
    );
    return 1;
  }
  mkdirSync(OUT, { recursive: true });
  const bytes = bytesOf(path);
  const doc = await extractPdf({ id: '0', name: 'alghero.pdf', bytes }, DEFAULT_EXTRACT_OPTS);
  const tiles = range(9, 50);

  // 1 · classes
  const classes = classifyPages([doc]);
  const tilePages = classes.filter((c) => c.cls === 'tile').map((c) => c.page + 1);
  check(
    'alghero · classes: p1–8 aside, p9–50 the tiles of one sheet',
    JSON.stringify(tilePages) === JSON.stringify(tiles) &&
      new Set(classes.filter((c) => c.cls === 'tile').map((c) => c.sheet)).size === 1,
    `tiles ${tilePages.length ? `${tilePages[0]}–${tilePages[tilePages.length - 1]} (${tilePages.length})` : 'none'}; ` +
      classes
        .slice(0, 8)
        .map((c) => `p${c.page + 1} ${c.cls}`)
        .join(', '),
  );

  // 2 · the worker Session
  const s = new Session(1, [{ name: 'alghero.pdf', bytes: bytesOf(path) }]);
  const ex = await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, sctx());
  const cl = await s.runStage('clean', { edits: [] }, sctx());
  const best = cl.scale[0] ?? ex.scale[0];
  await s.runStage(
    'scale',
    { decision: { factor: best.factor, method: best.method, operatorConfirmed: true } },
    sctx(),
  );
  await s.runStage('assemble', { sheet: 0 }, sctx());
  // The full sheet (paths) for the PNG and the label check, from the same pages.
  const full = assembleSheetDetailed([doc], classes, 0);
  const sheet = full.sheet;
  const sess = (s as unknown as { sheet: Sheet }).sheet;
  const rows = new Set(sess.poses.map((p) => p.row)).size;
  const cols = new Set(sess.poses.map((p) => p.col)).size;
  const { offCell, worst } = againstLabels(sess, doc.pages);
  const W = sess.bbox.maxX - sess.bbox.minX;
  const H = sess.bbox.maxY - sess.bbox.minY;
  check(
    'alghero · session: 42 tiles, each on the cell its label names, 12 rows × 8 cols',
    sess.poses.length === 42 && !offCell.length && rows === 12 && cols === 8,
    `${sess.poses.length} tiles, ${rows} × ${cols}, off their label: ${offCell.map((o) => o.p.page + 1).join(', ') || 'none'}`,
  );
  check(
    'alghero · session: every tile within 0.5 mm of label × pitch',
    worst <= 0.5,
    `worst ${worst.toFixed(3)} mm`,
  );
  check(
    'alghero · session: nothing missing, nothing refused, no residual over the limit',
    !sess.missing.length &&
      !sess.refused?.length &&
      Math.max(...sess.poses.map((p) => p.residualMm)) <= 0.3,
    `missing ${sess.missing.length}, refused ${sess.refused?.length ?? 0}, worst residual ${Math.max(...sess.poses.map((p) => p.residualMm)).toFixed(3)} mm, warnings: ${sess.warnings.join(' | ') || 'none'}`,
  );
  check(
    'alghero · sheet ≈ 7 × 196.85 + 209.5 by 11 × 266.7 + 279.4 mm (a 12 × 8 grid, not a strip)',
    Math.abs(W - 1587.45) < 5 && Math.abs(H - 3213.1) < 5,
    `${W.toFixed(1)} × ${H.toFixed(1)} mm`,
  );
  const png = renderSheet(sheet, resolve(OUT, 'alghero-after.png'));
  console.log(`      PNG ${png}`);

  // 2b · the file's allowance sentence (p10, A2): «1/2” seam allowances (SA’s) included»
  {
    const texts = doc.pages.flatMap((p) => p.texts.map((t) => t.text));
    const t = allowanceFromTexts(texts).decision;
    const pp = readPassport([doc], { sourceDigest: 'reg' }).allowance;
    check(
      'alghero · allowance sentence: included, 12.7 mm (text reader and passport)',
      !!t &&
        t.meaning === 'cut' &&
        Math.abs(t.allowanceMm - 12.7) < 0.05 &&
        !!pp &&
        pp.value.included === true &&
        Math.abs((pp.value.mm ?? 0) - 12.7) < 0.05,
      `text: ${t ? `${t.meaning} ${t.allowanceMm} mm (${t.origin}) «${t.evidence[0]?.slice(0, 80)}»` : 'none'}; ` +
        `passport: ${pp ? `included ${pp.value.included}, ${pp.value.mm} mm, ${pp.status}` : 'none'}`,
    );
  }

  // 3 · controls
  const refusedOrMissing = (sh: Sheet) => !!sh.refused?.length || sh.missing.length > 0;
  const brief = (sh: Sheet) =>
    sh.refused?.length
      ? `refused: ${sh.refused.map((r) => r.slice(0, 160)).join(' · ')}`
      : sh.missing.length
        ? `missing ${sh.missing.map((m) => `${String.fromCharCode(65 + m.row)}${m.col + 1}`).join(', ')}`
        : `assembled (${sh.poses.length} tiles, no refusal)`;

  {
    // a · the classification before the fix: p4–8 as tiles
    const r = assembleSheetDetailed([doc], tileClasses(doc, range(4, 50)), 0);
    const { offCell: off } = againstLabels(r.sheet, doc.pages);
    check(
      'control a · p4–8 read as tiles: labelled tiles on their labels, p4–8 left off and refused',
      r.sheet.poses.length === 42 &&
        !off.length &&
        !!r.sheet.refused?.some((x) => /pages 4, 5, 6, 7, 8 print no tile label/.test(x)),
      `${r.sheet.poses.length} placed, off-label ${off.length}; ${brief(r.sheet)}`,
    );
    renderSheet(r.sheet, resolve(OUT, 'alghero-control-a.png'), 900);
  }
  {
    // b · the hand grid in reading order: one row of 42 (the strip)
    const o: GridOverride = {
      rows: 1,
      cols: 42,
      stepXMm: 196.85,
      stepYMm: 266.7,
      order: 'row-major',
      originPage: { file: '0', page: 8 },
    };
    const r = assembleSheetDetailed([doc], tileClasses(doc, tiles), 0, o);
    check(
      'control b · hand grid 1 × 42 (the strip): refused against the labels',
      !!r.sheet.refused?.some((x) => /hand grid contradicts the printed labels/.test(x)),
      brief(r.sheet),
    );
    renderSheet(r.sheet, resolve(OUT, 'alghero-before-strip.png'), 1600);
  }
  {
    // c · B1 ↔ B8 swapped (a misread)
    const d = cloneDoc(doc);
    setLabel(d.pages[16], 'B1', 'B8');
    setLabel(d.pages[17], 'B8', 'B1');
    const r = assembleSheetDetailed([d], tileClasses(d, tiles), 0);
    check(
      'control c · B1 ↔ B8 labels swapped: refused',
      refusedOrMissing(r.sheet),
      brief(r.sheet),
    );
  }
  {
    // d · C8 also reads "B8"
    const d = cloneDoc(doc);
    setLabel(d.pages[19], 'C8', 'B8');
    const r = assembleSheetDetailed([d], tileClasses(d, tiles), 0);
    check(
      'control d · two pages print "B8": refused',
      !!r.sheet.refused?.some((x) => /all print "B8"/.test(x)),
      brief(r.sheet),
    );
  }
  {
    // e · L4 dropped
    const r = assembleSheetDetailed(
      [doc],
      tileClasses(
        doc,
        tiles.filter((p) => p !== 46),
      ),
      0,
    );
    check(
      'control e · L4 (p46) dropped: L4 missing',
      r.sheet.missing.some((m) => m.row === 11 && m.col === 3),
      brief(r.sheet),
    );
  }
  {
    // f · labels on 12 pages only (below half): seam layout, held to those labels
    const d = cloneDoc(doc);
    const keep = new Set([9, 10, 16, 17, 18, 33, 34, 35, 42, 43, 49, 50]);
    for (const p of tiles)
      if (!keep.has(p)) {
        const l = cellLabelOf(d.pages[p - 1]);
        if (l) setLabel(d.pages[p - 1], l.text.trim(), null);
      }
    const r = assembleSheetDetailed([d], tileClasses(d, tiles), 0);
    const { offCell: off } = againstLabels(r.sheet, doc.pages);
    check(
      'control f · labels on 12/42 pages: refused, or every tile on its (true) label',
      !!r.sheet.refused?.length || (!off.length && r.sheet.poses.length === 42),
      `${brief(r.sheet)}; off the true label: ${off.length}`,
    );
  }
  {
    // g · a dense 2 × 2 label grid (K1 K2 / L1 L2) where L2 prints no label
    const d = cloneDoc(doc);
    setLabel(d.pages[43], 'L2', null);
    const r = assembleSheetDetailed([d], tileClasses(d, [35, 36, 43, 44]), 0);
    check(
      'control g · K1 K2 L1 + an unlabelled L2: L2 (p44) left off and refused',
      r.sheet.poses.length === 3 &&
        !!r.sheet.refused?.some((x) => /page 44 prints no tile label/.test(x)),
      `${r.sheet.poses.length} placed; ${brief(r.sheet)}`,
    );
  }
  {
    // h · a hand grid too small for the tiles (5 × 5 of 42): the pages past it are not dropped
    const o: GridOverride = {
      rows: 5,
      cols: 5,
      stepXMm: 196.85,
      stepYMm: 266.7,
      order: 'row-major',
      originPage: { file: '0', page: 8 },
    };
    const r = assembleSheetDetailed([doc], tileClasses(doc, tiles), 0, o);
    check(
      'control h · hand grid 5 × 5 for 42 tiles: refused (17 pages without a cell)',
      !!r.sheet.refused?.some((x) => /leaves pages .* without a cell/.test(x)),
      brief(r.sheet),
    );
  }
  console.log(fails ? `REG: ${fails} FAIL` : 'REG: all PASS');
  return fails ? 1 : 0;
}
