import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { jsPDF } from 'jspdf';

import type { PdfFont } from 'lib/pattern-export/dxf-pdf';
import {
  exportRollPrint,
  planRollPrint,
  readRollPrintSource,
  ROLL_DEFAULTS,
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

export async function main(args: string[]) {
  const [dxfPath, outDir] = args;
  if (!dxfPath || !outDir) throw new Error('usage: roll-print-before <file.dxf> <out-dir>');
  mkdirSync(outDir, { recursive: true });
  const bytes = arrayBuffer(readFileSync(dxfPath));
  const name = basename(dxfPath);
  const source = readRollPrintSource(bytes, name);
  const sizes = source.sizes.map((row) => row.size);
  const copies = Object.fromEntries(sizes.map((size) => [size, 1]));
  const xsOnly = Object.fromEntries(sizes.map((size) => [size, size === 'XS' ? 1 : 0]));
  const renders: Array<{ pdf: string; pages: number; stem: string; suffix: string }> = [];
  const metrics: Array<{
    key: string;
    widthCm: number;
    lengthMm: number;
    sheets: number;
    runtimeMs: number;
  }> = [];
  const cases = [
    { key: 'XS@160', widthCm: 160, copies: xsOnly, title: 'card70-XS' },
    { key: 'XS-XL@91.4', widthCm: 91.4, copies, title: 'card70-XS-XL' },
    { key: 'XS-XL@152.4', widthCm: 152.4, copies, title: 'card70-XS-XL' },
  ];
  for (const run of cases) {
    const roll: RollSpec = { widthCm: run.widthCm, ...ROLL_DEFAULTS };
    const started = performance.now();
    const plan = await planRollPrint(bytes, name, run.copies, roll);
    const elapsedMs = performance.now() - started;
    const exported = exportRollPrint(plan, run.title, roll, { jsPDF, font });
    const base = `${run.title}-roll${run.widthCm}`;
    const pdfPath = resolve(outDir, `${base}-before.pdf`);
    writeFileSync(pdfPath, Buffer.from(await exported.blob.arrayBuffer()));
    console.log(
      `before ${run.key}: length ${(plan.lengthMm / 1000).toFixed(3)} m | sheets ${plan.sheets.length} | placed ${plan.placed}/${plan.total} | runtime ${elapsedMs.toFixed(0)} ms`,
    );
    renders.push({
      pdf: pdfPath,
      pages: plan.sheets.length,
      stem: resolve(outDir, base),
      suffix: '-before',
    });
    metrics.push({
      key: run.key,
      widthCm: run.widthCm,
      lengthMm: plan.lengthMm,
      sheets: plan.sheets.length,
      runtimeMs: elapsedMs,
    });
  }
  return { code: 0, renders, metrics };
}
