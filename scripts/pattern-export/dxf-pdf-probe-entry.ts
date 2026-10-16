// Entry of dxf-pdf-probe.mjs (bundled by esbuild, run in node).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { jsPDF } from 'jspdf';

import {
  DEFAULT_EXTRACT_OPTS,
  extractPdf,
  setPdfjsLoader,
  type PdfjsModule,
} from 'lib/pattern-import/adapters/pdf';
import { detectScale } from 'lib/pattern-import/adapters/pdf/scale';
import { assembleSheetDetailed, classifyPages } from 'lib/pattern-import/assemble';
import { drawingFromDxf, type PatternDrawing } from 'lib/pattern-export/drawing';
import { drawingFromPltSheet, readPltSheet } from 'lib/pattern-export/plt-pdf';
import { planPdf, renderPdf, type PdfFont, type TilePaper } from 'lib/pattern-export/dxf-pdf';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
setPdfjsLoader(() => import(LEGACY) as Promise<PdfjsModule>);

const ab = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// The same font the browser export embeds (FeatureMono, as the assembly sheet does).
const font: PdfFont = {
  family: 'FeatureMono',
  register: (pdf) => {
    for (const [file, style] of [
      ['FeatureMono-Regular.ttf', 'normal'],
      ['FeatureMono-Bold.ttf', 'bold'],
    ] as const) {
      pdf.addFileToVFS(file, readFileSync(resolve(REPO, 'src/fonts', file)).toString('base64'));
      pdf.addFont(file, 'FeatureMono', style);
    }
  },
};

export async function main(args: string[]) {
  const [dxfPath, outDir, paperArg] = args;
  const paper = (paperArg ?? 'A4') as TilePaper;
  mkdirSync(outDir, { recursive: true });
  const stem = basename(dxfPath)
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '_');
  // A .plt goes through the PLT reader into the same drawing type — the same tiler and the same
  // round trip below, so «PLT → PDF re-imports» is measured exactly like the DXF.
  const d: PatternDrawing = /\.(plt|hpgl?|hgl)$/i.test(dxfPath)
    ? drawingFromPltSheet(
        await readPltSheet(ab(readFileSync(dxfPath)), { name: basename(dxfPath) }),
      )
    : drawingFromDxf(ab(readFileSync(dxfPath)), basename(dxfPath));
  const kinds: Record<string, number> = {};
  for (const s of d.strokes) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
  console.log(
    `drawing ${d.w.toFixed(1)} x ${d.h.toFixed(1)} mm, strokes ${JSON.stringify(kinds)}, labels ${d.labels.length} (${d.labels
      .slice(0, 4)
      .map((l) => l.s)
      .join(', ')}…), warnings ${JSON.stringify(d.warnings)}`,
  );

  const out: Record<string, string> = {};
  const layouts = [
    ['sheet', { kind: 'sheet' }],
    [`tiles-${paper}`, { kind: 'tiles', paper }],
  ] as const;
  for (const [name, layout] of layouts) {
    const plan = planPdf(d, layout);
    const pdf = renderPdf(jsPDF, d, plan, font);
    const file = resolve(outDir, `${stem}-${name}.pdf`);
    const bytes = Buffer.from(pdf.output('arraybuffer'));
    writeFileSync(file, bytes);
    out[name] = file;
    const g = plan.grid;
    console.log(
      `${name}: ${plan.pages.length} pages, ${plan.pages[0].w.toFixed(1)} x ${plan.pages[0].h.toFixed(1)} mm` +
        (g
          ? `, grid ${g.rows}x${g.cols}, blank ${
              g.cells
                .filter((c) => c.blank)
                .map((c) => c.label)
                .join(',') || '-'
            }`
          : '') +
        `, ${(bytes.length / 1024).toFixed(0)} KB -> ${file}` +
        (plan.warnings.length ? ` warnings ${JSON.stringify(plan.warnings)}` : ''),
    );
  }

  // ── round trip through the importer ──
  let fail = 0;
  for (const [name, file] of Object.entries(out)) {
    const doc = await extractPdf(
      { id: '0', name: basename(file), bytes: ab(readFileSync(file)) },
      DEFAULT_EXTRACT_OPTS,
    );
    const sc = detectScale(doc);
    const top = sc[0];
    console.log(`[${name}] scale: ${top ? JSON.stringify(top) : 'none'}`);
    if (!top || Math.abs(top.factor - 1) > 0.002 || top.confidence < 0.9) fail++;
    if (name === 'sheet') continue;
    const classes = classifyPages([doc]);
    console.log(
      `[${name}] classes: ${classes
        .map((c) => `p${c.page + 1}:${c.cls}${c.sheet != null ? `#${c.sheet}` : ''}`)
        .join(' ')}`,
    );
    const sids = [
      ...new Set(classes.filter((c) => c.cls === 'tile').map((c) => c.sheet as number)),
    ];
    for (const sid of sids) {
      const { sheet, report } = assembleSheetDetailed([doc], classes, sid);
      for (const g of report.groups)
        console.log(
          `[${name}] sheet ${sid}: ${sheet.poses.length} tiles, layoutFrom=${g.layoutFrom} order=${JSON.stringify(
            g.layout.order,
          )} pitch.from=${g.pitch.from} right=${JSON.stringify(g.pitch.right)} below=${JSON.stringify(
            g.pitch.below,
          )} unverified=${g.unverified.length} rejected=${g.rejected.length}`,
        );
      console.log(
        `[${name}] sheet ${sid}: bbox ${(sheet.bbox.maxX - sheet.bbox.minX).toFixed(1)} x ${(
          sheet.bbox.maxY - sheet.bbox.minY
        ).toFixed(1)} mm (drawing ${d.w.toFixed(1)} x ${d.h.toFixed(1)}), refused=${JSON.stringify(
          sheet.refused ?? [],
        )} warnings=${JSON.stringify(sheet.warnings)}`,
      );
    }
    if (sids.length !== 1) fail++;
  }
  console.log(fail ? `ROUND TRIP: ${fail} problem(s)` : 'ROUND TRIP: ok');
  return {
    code: fail ? 1 : 0,
    renders: [
      [out.sheet, 1, resolve(outDir, `${stem}-sheet`)],
      [out[`tiles-${paper}`], 1, resolve(outDir, `${stem}-tiles-${paper}-p1-map`)],
      [out[`tiles-${paper}`], 3, resolve(outDir, `${stem}-tiles-${paper}-p3`)],
    ],
  };
}
