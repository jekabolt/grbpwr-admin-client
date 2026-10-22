import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { jsPDF } from 'jspdf';

import type { PdfFont } from 'lib/pattern-export/dxf-pdf';
import { ROLL_FURNITURE_MM } from 'lib/pattern-export/roll-layout';
import {
  exportRollPrint,
  minRollWidthCm,
  planRollPrint,
  readRollPrintSource,
  ROLL_DEFAULTS,
  type RollPrintPlan,
  type RollSpec,
} from 'lib/pattern-export/roll-print';

const REPO = process.env.ROLL_PRINT_REPO ?? process.cwd();
const parserNoise = (values: unknown[]) =>
  values.some((value) => String(value).includes('Group code does not have a defined type'));
const originalWarn = console.warn.bind(console);
console.warn = (...values: unknown[]) => {
  if (parserNoise(values)) return;
  originalWarn(...values);
};
const originalLog = console.log.bind(console);
console.log = (...values: unknown[]) => {
  if (parserNoise(values)) return;
  originalLog(...values);
};

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

const arrayBuffer = (buffer: Buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

function assertPlan(plan: RollPrintPlan, roll: RollSpec): void {
  let cutStrokes = 0;
  for (let sheetIndex = 0; sheetIndex < plan.sheets.length; sheetIndex++) {
    const sheet = plan.sheets[sheetIndex];
    if (sheet.lengthMm > Math.min(roll.maxSheetM * 1000, 5080) + 1e-6)
      throw new Error(`sheet ${sheetIndex + 1} is longer than the roll profile`);
    if (Math.abs(sheet.drawing.w - roll.widthCm * 10) > 1e-6)
      throw new Error(`sheet ${sheetIndex + 1} does not use the full roll width`);
    for (const stroke of sheet.drawing.strokes) {
      if (stroke.kind !== 'cut') continue;
      cutStrokes++;
      for (const [x, y] of stroke.pts) {
        if (x < roll.edgeMm - 1e-5 || x > roll.widthCm * 10 - roll.edgeMm + 1e-5)
          throw new Error(`sheet ${sheetIndex + 1}: a piece leaves the printable width at x=${x}`);
        if (y < ROLL_FURNITURE_MM - 1e-5 || y > sheet.lengthMm + 1e-5)
          throw new Error(`sheet ${sheetIndex + 1}: a piece crosses the sheet edge at y=${y}`);
      }
    }
  }
  if (cutStrokes !== plan.placed)
    throw new Error(`cut-stroke count ${cutStrokes} does not match placed ${plan.placed}`);
  if (plan.placed + plan.tooWide.length + plan.tooLong.length !== plan.total)
    throw new Error('placed + tooWide + tooLong does not match total');
}

export async function main(args: string[]) {
  const [dxfPath, outDir] = args;
  if (!dxfPath || !outDir) throw new Error('usage: roll-print-probe <file.dxf> <out-dir>');
  mkdirSync(outDir, { recursive: true });
  const bytes = arrayBuffer(readFileSync(dxfPath));
  const name = basename(dxfPath);
  const source = readRollPrintSource(bytes, name);
  const expected = ['XS', 'S', 'M', 'L', 'XL'];
  const actual = source.sizes.map((row) => row.size);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`size order ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  const copies = Object.fromEntries(expected.map((size) => [size, 1]));
  console.log(
    `source ${source.title}: ${source.sizes.map((row) => `${row.size}:${row.pieces}`).join(' ')}`,
  );

  const min = minRollWidthCm(bytes, name, copies);
  const atMin: RollSpec = { widthCm: min, ...ROLL_DEFAULTS };
  const belowMin: RollSpec = {
    widthCm: Math.round((min - 0.1) * 10) / 10,
    ...ROLL_DEFAULTS,
  };
  const atMinPlan = await planRollPrint(bytes, name, copies, atMin);
  const belowMinPlan = await planRollPrint(bytes, name, copies, belowMin);

  const renders: Array<{ pdf: string; pages: number; stem: string }> = [];
  for (const widthCm of [91.4, 152.4]) {
    const roll: RollSpec = { widthCm, ...ROLL_DEFAULTS };
    const started = performance.now();
    const plan = await planRollPrint(bytes, name, copies, roll);
    const elapsedMs = performance.now() - started;
    assertPlan(plan, roll);
    const exported = exportRollPrint(plan, 'SS25-004', roll, { jsPDF, font });
    const pdfPath = resolve(outDir, exported.fileName);
    writeFileSync(pdfPath, Buffer.from(await exported.blob.arrayBuffer()));
    const tooWide = plan.tooWide.length;
    const tooLong = plan.tooLong.length;
    console.log(
      `roll ${widthCm}: length ${(plan.lengthMm / 1000).toFixed(3)} m | sheets ${plan.sheets.length} | placed ${plan.placed}/${plan.total} | tooWide ${tooWide} | tooLong ${tooLong} | runtime ${elapsedMs.toFixed(0)} ms`,
    );
    console.log(`pdf ${pdfPath}`);
    renders.push({
      pdf: pdfPath,
      pages: plan.sheets.length,
      stem: resolve(outDir, `SS25-004_print_roll${widthCm}`),
    });
  }
  return {
    code: 0,
    renders,
    min,
    belowMinWidthCm: belowMin.widthCm,
    atMinTooWide: atMinPlan.tooWide.length,
    belowMinTooWide: belowMinPlan.tooWide.length,
  };
}
