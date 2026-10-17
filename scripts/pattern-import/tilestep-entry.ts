// Entry of tilestep.mjs (bundled by esbuild, run in node) — TILESTEP probe.
//
// ROUND TRIP (default): sparse drawings (synthetic markers, the corpus PLTs, a DXF) → OUR 1:1
// tiled PDF export (lib/pattern-export/dxf-pdf.ts, with its GRBPWR-TILES line) → our importer →
// the tile pitch of the assembled sheet, per seam. Variants of the line: as written, removed, a
// wrong step, a wrong grid, an unknown version. Pass = never a silently wrong pitch: either every
// seam is the true step within 0.2 mm, or the sheet is refused (a question). With the true line
// the pitch must be exact and no page missing (blank cells are declared).
//
// SURVEY (--survey <pdf…>): extract → classify → assemble every tile sheet; reports where the
// pitch came from and whether the TILESTEP page-size stop fires — so the stop is measured against
// files that work today before it ships.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { jsPDF } from 'jspdf';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { assembleSheetDetailed, classifyPages } from 'lib/pattern-import/assemble';
import { parseTilesLine } from 'lib/pattern-import/assemble/tiles-line';
import { drawingFromDxf, type PatternDrawing } from 'lib/pattern-export/drawing';
import { planPdf, renderPdf, type PdfPlan, type TilePaper } from 'lib/pattern-export/dxf-pdf';
import { drawingFromPltSheet, readPltSheet } from 'lib/pattern-export/plt-pdf';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);
const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const CORPUS = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus';

// ── synthetic sparse drawings ────────────────────────────────────────────────────────────────

const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const poly = (cx: number, cy: number, rx: number, ry: number, n: number): [number, number][] =>
  Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n + 0.3;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as [number, number];
  });
const drawing = (
  title: string,
  w: number,
  h: number,
  shapes: [number, number][][],
): PatternDrawing => ({
  w,
  h,
  title,
  warnings: [],
  labels: [],
  strokes: [
    // a frame of the extent, so the drawing's box is (0, 0)–(w, h) exactly, then the pieces
    {
      kind: 'line',
      closed: false,
      pts: [
        [0, 0],
        [2, 0],
      ],
    },
    {
      kind: 'line',
      closed: false,
      pts: [
        [w - 2, h],
        [w, h],
      ],
    },
    ...shapes.map((pts) => ({ kind: 'cut' as const, closed: true, pts })),
  ],
});

/** A marker: two big polygons, a run of rectangles, a pocket and its copy; blank cells. */
const MARKER = drawing('synthetic-marker', 900, 560, [
  poly(200, 140, 170, 110, 9),
  rect(40, 300, 150, 230),
  rect(420, 60, 140, 120),
  rect(600, 330, 260, 200),
  rect(620, 30, 90, 90),
  rect(760, 30, 90, 90),
]);
/** Rectangles only (4 vertices): nothing passes the strict recurrence filter. */
const RECTS = drawing('synthetic-rects', 640, 520, [
  rect(30, 40, 300, 160),
  rect(360, 40, 250, 220),
  rect(60, 300, 520, 180),
]);

type Case = { name: string; d: PatternDrawing; paper: TilePaper };

async function cases(): Promise<Case[]> {
  const out: Case[] = [
    { name: 'marker-A4', d: MARKER, paper: 'A4' },
    { name: 'marker-Letter', d: MARKER, paper: 'Letter' },
    { name: 'rects-A4', d: RECTS, paper: 'A4' },
  ];
  for (const f of ['gerber-front.plt', 'lectra-back-sc.plt']) {
    const p = resolve(CORPUS, 'synthetic', f);
    out.push({
      name: `${f}-A4`,
      d: drawingFromPltSheet(await readPltSheet(ab(readFileSync(p)), { name: f })),
      paper: 'A4',
    });
  }
  const pockets = resolve(CORPUS, 'dxf-clo', 'POCKETS.dxf');
  out.push({
    name: 'POCKETS.dxf-A4',
    d: drawingFromDxf(ab(readFileSync(pockets)), 'POCKETS.dxf'),
    paper: 'A4',
  });
  return out;
}

// ── variants of the line ─────────────────────────────────────────────────────────────────────

type Variant = 'line' | 'noline' | 'wrongstep' | 'farstep' | 'badgrid' | 'v2';
// farstep: a step far off (−80 mm across and down, > 25 % — not a «jump»): only the drawing
// meeting at the declared step can catch it (Codex review 17.10 #1)
const VARIANTS: Variant[] = ['line', 'noline', 'wrongstep', 'farstep', 'badgrid', 'v2'];

function withVariant(plan: PdfPlan, v: Variant): PdfPlan {
  const pages = plan.pages.map((p, i) => {
    if (i !== 0) return p;
    const marks = p.marks.flatMap((m) => {
      if (m.k !== 'text' || !m.s.startsWith('GRBPWR-TILES')) return [m];
      if (v === 'noline') return [];
      let s = m.s;
      if (v === 'wrongstep')
        s = s.replace(/step=([\d.]+)x([\d.]+)mm/, (_, a, b) => `step=${+a + 10}x${+b}mm`);
      if (v === 'farstep')
        s = s.replace(/step=([\d.]+)x([\d.]+)mm/, (_, a, b) => `step=${+a - 80}x${+b - 80}mm`);
      if (v === 'badgrid') s = s.replace(/grid=(\d+)x/, (_, a) => `grid=${+a + 1}x`);
      if (v === 'v2') s = s.replace('GRBPWR-TILES v1', 'GRBPWR-TILES v2');
      return [{ ...m, s }];
    });
    return { ...p, marks };
  });
  return { ...plan, pages };
}

type Seam = { a: string; b: string; rel: 'right' | 'below'; errMm: number };

async function roundTrip(c: Case, v: Variant) {
  const plan0 = planPdf(c.d, { kind: 'tiles', paper: c.paper });
  const g = plan0.grid!;
  const line0 = plan0.pages[0].marks.find(
    (m) => m.k === 'text' && m.s.startsWith('GRBPWR-TILES'),
  ) as { s: string } | undefined;
  const plan = withVariant(plan0, v);
  const bytes = Buffer.from(renderPdf(jsPDF, c.d, plan).output('arraybuffer'));
  const doc = await extractPdf(
    { id: '0', name: `${c.name}-${v}.pdf`, bytes: ab(bytes) },
    DEFAULT_EXTRACT_OPTS,
  );
  const classes = classifyPages([doc]);
  const sids = [...new Set(classes.filter((k) => k.cls === 'tile').map((k) => k.sheet as number))];
  const blank = g.cells.filter((k) => k.blank).map((k) => k.label);
  const res = {
    case: c.name,
    variant: v,
    grid: `${g.cols}x${g.rows}`,
    blank,
    step: [g.sx, g.sy],
    line: line0?.s ?? null,
    sheets: sids.length,
    pitchFrom: null as string | null,
    layoutFrom: null as string | null,
    right: null as number[] | null,
    below: null as number[] | null,
    seams: [] as Seam[],
    worstSeamMm: 0,
    missing: 0,
    refused: [] as string[],
    tilesWarnings: [] as string[],
    pageSizeWarning: false,
    ok: false,
    why: '',
  };
  if (sids.length !== 1) {
    res.why = `${sids.length} tile sheets`;
    return res;
  }
  const { sheet, report } = assembleSheetDetailed([doc], classes, sids[0]);
  const gr = report.groups[0];
  res.pitchFrom = gr?.pitch.from ?? null;
  res.layoutFrom = gr?.layoutFrom ?? null;
  res.right = gr ? [gr.pitch.right.dx, gr.pitch.right.dy] : null;
  res.below = gr ? [gr.pitch.below.dx, gr.pitch.below.dy] : null;
  res.missing = sheet.missing.length;
  res.refused = sheet.refused ?? [];
  res.tilesWarnings = sheet.warnings.filter((w) => /tiles line/.test(w));
  res.pageSizeWarning = sheet.warnings.some((w) => /assumed page size/.test(w));
  // Seams: poses of row / column neighbours (their printed cells) against the true step.
  const byCell = new Map(sheet.poses.map((p) => [`${p.row},${p.col}`, p]));
  for (const p of sheet.poses) {
    for (const [rel, dr, dc] of [
      ['right', 0, 1],
      ['below', 1, 0],
    ] as const) {
      const q = byCell.get(`${(p.row ?? 0) + dr},${(p.col ?? 0) + dc}`);
      if (!q) continue;
      const dx = q.toSheet.e - p.toSheet.e;
      const dy = q.toSheet.f - p.toSheet.f;
      const err = rel === 'right' ? Math.hypot(dx - g.sx, dy) : Math.hypot(dx, dy + g.sy);
      res.seams.push({
        a: `${p.row},${p.col}`,
        b: `${q.row},${q.col}`,
        rel,
        errMm: +err.toFixed(3),
      });
    }
  }
  res.worstSeamMm = Math.max(0, ...res.seams.map((s) => s.errMm));
  const exact = res.seams.length > 0 && res.worstSeamMm <= 0.2;
  const refused = res.refused.length > 0;
  // D3: the one failure is a pitch that is wrong and NOT refused.
  if (v === 'line') {
    res.ok = exact && !refused && res.missing === 0;
    res.why = res.ok ? 'exact' : `exact=${exact} refused=${refused} missing=${res.missing}`;
  } else {
    const lineUsed = res.pitchFrom === 'tiles-line' || res.layoutFrom === 'tiles-line';
    const ignored = v === 'noline' || (!lineUsed && res.tilesWarnings.length > 0);
    res.ok = ignored && (exact || refused);
    res.why = !ignored
      ? `line ${lineUsed ? 'USED' : 'not used, no warning'}`
      : exact
        ? 'exact without the line'
        : refused
          ? 'refused (a question)'
          : `SILENTLY WRONG (worst seam ${res.worstSeamMm.toFixed(1)} mm)`;
  }
  return res;
}

// ── parser unit checks ───────────────────────────────────────────────────────────────────────

function grammar(): number {
  const L =
    'GRBPWR-TILES v1 page=210x297mm step=180x267mm overlap=10mm grid=4x3 order=row origin=A1:top-left';
  const cases: [string, 'decl' | 'ignored' | 'none', ((d: never) => boolean)?][] = [
    [
      L,
      'decl',
      (d: { stepX: number; cols: number; rows: number; skip: unknown[] }) =>
        d.stepX === 180 && d.cols === 4 && d.rows === 3 && d.skip.length === 0,
    ],
    [
      `${L} skip=B2,C4`,
      'decl',
      (d: { skip: { row: number; col: number }[] }) =>
        d.skip.length === 2 && d.skip[0].row === 1 && d.skip[0].col === 1,
    ],
    [`${L} skip=D1`, 'ignored'],
    [`${L} skip=B2,B2`, 'ignored'],
    [`${L} skip=B2, C4`, 'ignored'],
    [L.replace('v1', 'v2'), 'ignored'],
    [L.replace('step=180x267mm', 'step=180.25x267mm'), 'ignored'],
    [L.replace('order=row', 'order=diag'), 'ignored'],
    [L.replace(' overlap=10mm', ''), 'ignored'],
    [`${L} extra`, 'ignored'],
    [L.replace('origin=A1', 'origin=1:1'), 'decl'],
    [L.replace('page=210x297mm', 'page=215.9x279.4mm'), 'decl'],
    ['GRBPWR-TILESET v1', 'ignored'],
    ['pattern at 1:1', 'none'],
  ];
  let bad = 0;
  for (const [s, want, check] of cases) {
    const r = parseTilesLine(s);
    const got = !r ? 'none' : 'decl' in r ? 'decl' : 'ignored';
    const ok = got === want && (!check || (r && 'decl' in r && check(r.decl as never)));
    if (!ok) bad++;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} grammar ${want.padEnd(7)} ${s.slice(13, 110)}${!ok ? ` → ${JSON.stringify(r)}` : ''}`,
    );
  }
  return bad;
}

// ── survey ───────────────────────────────────────────────────────────────────────────────────

async function survey(files: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const f of files) {
    const t0 = Date.now();
    try {
      const doc = await extractPdf(
        { id: '0', name: basename(f), bytes: ab(readFileSync(f)) },
        DEFAULT_EXTRACT_OPTS,
      );
      const classes = classifyPages([doc]);
      const sids = [
        ...new Set(classes.filter((k) => k.cls === 'tile').map((k) => k.sheet as number)),
      ];
      for (const sid of sids) {
        const { sheet, report } = assembleSheetDetailed([doc], classes, sid);
        const g = report.groups[0];
        const row = {
          file: f.replace(/^.*archive 600 pcs\//, '').replace(/^.*corpus\//, ''),
          sheet: sid,
          tiles: sheet.poses.length,
          pitchFrom: g?.pitch.from ?? sheet.pitchFrom ?? null,
          layoutFrom: g?.layoutFrom ?? null,
          refused: (sheet.refused ?? []).length,
          tilestepStop: (sheet.refused ?? []).some((r) => /no reliable tile step/.test(r)),
          tilesLine: sheet.warnings.filter((w) => /tiles line/.test(w)).length,
          ms: Date.now() - t0,
        };
        rows.push(row);
        console.log(JSON.stringify(row));
      }
      if (!sids.length) console.log(JSON.stringify({ file: f, sheets: 0 }));
    } catch (e) {
      console.log(JSON.stringify({ file: f, error: String(e).slice(0, 200) }));
    }
  }
  const ps = rows.filter((r) => r.pitchFrom === 'page-size');
  const stops = rows.filter((r) => r.tilestepStop);
  const lines = rows.filter((r) => (r.tilesLine as number) > 0 || r.pitchFrom === 'tiles-line');
  console.log(
    `SURVEY: ${files.length} files, ${rows.length} tile sheets; pitch from ${JSON.stringify(
      rows.reduce<Record<string, number>>((a, r) => {
        const k = String(r.pitchFrom);
        a[k] = (a[k] ?? 0) + 1;
        return a;
      }, {}),
    )}; page-size ${ps.length} (${ps.map((r) => r.file).join(', ') || '-'}); TILESTEP stops ${stops.length} (${stops.map((r) => r.file).join(', ') || '-'}); tiles line seen ${lines.length}`,
  );
  return stops.length ? 1 : 0;
}

export async function main(args: string[]) {
  if (args[0] === '--survey') return survey(args.slice(1));
  let fail = grammar();
  for (const c of await cases())
    for (const v of VARIANTS) {
      const r = await roundTrip(c, v);
      if (!r.ok) fail++;
      console.log(
        `${r.ok ? 'ok  ' : 'FAIL'} ${r.case.padEnd(22)} ${r.variant.padEnd(9)} grid ${r.grid} blank ${r.blank.join(',') || '-'} ` +
          `pitch ${r.pitchFrom} (${r.right?.map((x) => x.toFixed(2)).join(',')} / ${r.below?.map((x) => x.toFixed(2)).join(',')}) ` +
          `layout ${r.layoutFrom} seams ${r.seams.length} worst ${r.worstSeamMm.toFixed(3)} mm missing ${r.missing} ` +
          `refused ${r.refused.length} — ${r.why}`,
      );
      if (!r.ok || process.env.TILESTEP_VERBOSE) {
        for (const w of r.tilesWarnings) console.log(`       ${w.slice(0, 260)}`);
        for (const w of r.refused) console.log(`       REFUSED ${w.slice(0, 260)}`);
      }
    }
  console.log(fail ? `TILESTEP: ${fail} FAIL` : 'TILESTEP: all pass');
  return fail ? 1 : 0;
}
