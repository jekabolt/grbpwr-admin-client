import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { jsPDF } from 'jspdf';
import { unzipSync } from 'fflate';

import { DRAWING_PEN_MM, type PdfFont } from 'lib/pattern-export/dxf-pdf';
import type { DrawingLabel, DrawingStroke } from 'lib/pattern-export/drawing';
import { rollFurnitureMm, ROLL_TITLE_FURNITURE_MM } from 'lib/pattern-export/roll-layout';
import {
  exportRollPrint,
  minRollWidthCm,
  planRollPrint,
  readRollPrintSource,
  ROLL_DEFAULTS,
  ROLL_GAP_MM,
  type RollPrintPlan,
  type RollSpec,
} from 'lib/pattern-export/roll-print';
import { zipRollPrintPdfs } from 'lib/pattern-export/roll-print-zip';

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

type Point = [number, number];
type InkSegment = {
  a: Point;
  b: Point;
  radiusMm: number;
};

const labelMeasurePdf = new jsPDF({ unit: 'mm', format: [100, 100] });
font.register(labelMeasurePdf);
labelMeasurePdf.setFont(font.family, 'normal');

function labelSegments(label: DrawingLabel): InkSegment[] {
  const sizeMm = label.sizeMm ?? 9 * (25.4 / 72);
  labelMeasurePdf.setFontSize(sizeMm / (25.4 / 72));
  const width = labelMeasurePdf.getTextWidth(label.s);
  // jsPDF draws placed labels from their baseline-left anchor. This em box is deliberately
  // taller than the font's reported glyph box, so containing it contains every printed glyph.
  const local: Point[] = [
    [0, -sizeMm],
    [width, -sizeMm],
    [width, sizeMm * 0.35],
    [0, sizeMm * 0.35],
  ];
  const angle = ((label.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = local.map(
    ([x, y]) => [label.x + x * cos - y * sin, label.y + x * sin + y * cos] as Point,
  );
  return points.map((point, i) => ({
    a: point,
    b: points[(i + 1) % points.length],
    radiusMm: 0,
  }));
}

const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.abs(cross(a, b, p)) <= 1e-9 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = cross(a, b, c);
  const o2 = cross(a, b, d);
  const o3 = cross(c, d, a);
  const o4 = cross(c, d, b);
  const opposite = (x: number, y: number) => (x > 1e-9 && y < -1e-9) || (x < -1e-9 && y > 1e-9);
  if (opposite(o1, o2) && opposite(o3, o4)) return true;
  return (
    (Math.abs(o1) <= 1e-9 && onSegment(a, b, c)) ||
    (Math.abs(o2) <= 1e-9 && onSegment(a, b, d)) ||
    (Math.abs(o3) <= 1e-9 && onSegment(c, d, a)) ||
    (Math.abs(o4) <= 1e-9 && onSegment(c, d, b))
  );
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const raw = length2 <= 1e-18 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2;
  const t = Math.max(0, Math.min(1, raw));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function strokeSegments(stroke: DrawingStroke): InkSegment[] {
  const out: InkSegment[] = [];
  const radiusMm = DRAWING_PEN_MM[stroke.kind] / 2;
  for (let i = 1; i < stroke.pts.length; i++)
    out.push({ a: stroke.pts[i - 1], b: stroke.pts[i], radiusMm });
  if (stroke.closed && stroke.pts.length > 2)
    out.push({ a: stroke.pts[stroke.pts.length - 1], b: stroke.pts[0], radiusMm });
  return out;
}

const axisDistance = (a0: number, a1: number, b0: number, b1: number) =>
  a1 < b0 ? b0 - a1 : b1 < a0 ? a0 - b1 : 0;

function segmentBoxesFurtherThan(a: InkSegment, b: InkSegment, distanceMm: number): boolean {
  const dx = axisDistance(
    Math.min(a.a[0], a.b[0]),
    Math.max(a.a[0], a.b[0]),
    Math.min(b.a[0], b.b[0]),
    Math.max(b.a[0], b.b[0]),
  );
  const dy = axisDistance(
    Math.min(a.a[1], a.b[1]),
    Math.max(a.a[1], a.b[1]),
    Math.min(b.a[1], b.b[1]),
    Math.max(b.a[1], b.b[1]),
  );
  return Math.hypot(dx, dy) >= distanceMm + a.radiusMm + b.radiusMm;
}

function inkBounds(segments: readonly InkSegment[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const segment of segments) {
    x0 = Math.min(x0, segment.a[0] - segment.radiusMm, segment.b[0] - segment.radiusMm);
    y0 = Math.min(y0, segment.a[1] - segment.radiusMm, segment.b[1] - segment.radiusMm);
    x1 = Math.max(x1, segment.a[0] + segment.radiusMm, segment.b[0] + segment.radiusMm);
    y1 = Math.max(y1, segment.a[1] + segment.radiusMm, segment.b[1] + segment.radiusMm);
  }
  return { x0, y0, x1, y1 };
}

function assertPlan(
  plan: RollPrintPlan,
  roll: RollSpec,
): { piecePairs: number; minEdgeMm: number } {
  let cutStrokes = 0;
  let piecePairs = 0;
  let minEdgeMm = Infinity;
  const requiredGapMm = ROLL_GAP_MM - 0.5;
  const furnitureMm = rollFurnitureMm(roll);
  for (let sheetIndex = 0; sheetIndex < plan.sheets.length; sheetIndex++) {
    const sheet = plan.sheets[sheetIndex];
    const byPiece = new Map<string, InkSegment[]>();
    if (sheet.lengthMm > Math.min(roll.maxSheetM * 1000, 5080) + 1e-6)
      throw new Error(`sheet ${sheetIndex + 1} is longer than the roll profile`);
    if (Math.abs(sheet.drawing.w - roll.widthCm * 10) > 1e-6)
      throw new Error(`sheet ${sheetIndex + 1} does not use the full roll width`);
    for (const stroke of sheet.drawing.strokes) {
      if (!stroke.pieceKey) continue; // page furniture is not a laid piece
      if (stroke.kind === 'cut') cutStrokes++;
      const radiusMm = DRAWING_PEN_MM[stroke.kind] / 2;
      for (const [x, y] of stroke.pts) {
        const edgeClearance = Math.min(x - radiusMm, roll.widthCm * 10 - x - radiusMm);
        minEdgeMm = Math.min(minEdgeMm, edgeClearance);
        if (edgeClearance < roll.edgeMm - 1e-5)
          throw new Error(
            `sheet ${sheetIndex + 1}, piece ${stroke.pieceKey}: ink leaves the ${roll.edgeMm} mm edge at x=${x}`,
          );
        if (y - radiusMm < furnitureMm - 1e-5 || y + radiusMm > sheet.lengthMm + 1e-5)
          throw new Error(`sheet ${sheetIndex + 1}: a piece crosses the sheet edge at y=${y}`);
      }
      const segments = byPiece.get(stroke.pieceKey) ?? [];
      segments.push(...strokeSegments(stroke));
      byPiece.set(stroke.pieceKey, segments);
    }
    for (const label of sheet.drawing.labels) {
      if (!label.pieceKey) continue;
      const segments = labelSegments(label);
      for (const segment of segments) {
        for (const [x, y] of [segment.a, segment.b]) {
          const edgeClearance = Math.min(x, roll.widthCm * 10 - x);
          minEdgeMm = Math.min(minEdgeMm, edgeClearance);
          if (edgeClearance < roll.edgeMm - 1e-5)
            throw new Error(
              `sheet ${sheetIndex + 1}, piece ${label.pieceKey}: label leaves the ${roll.edgeMm} mm edge at x=${x}`,
            );
          if (y < furnitureMm - 1e-5 || y > sheet.lengthMm + 1e-5)
            throw new Error(`sheet ${sheetIndex + 1}: a label crosses the sheet edge at y=${y}`);
        }
      }
      const pieceSegments = byPiece.get(label.pieceKey) ?? [];
      pieceSegments.push(...segments);
      byPiece.set(label.pieceKey, pieceSegments);
    }
    const pieces = [...byPiece].map(([key, segments]) => ({
      key,
      segments,
      bounds: inkBounds(segments),
    }));
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const aPiece = pieces[i];
        const bPiece = pieces[j];
        piecePairs++;
        const dx = axisDistance(
          aPiece.bounds.x0,
          aPiece.bounds.x1,
          bPiece.bounds.x0,
          bPiece.bounds.x1,
        );
        const dy = axisDistance(
          aPiece.bounds.y0,
          aPiece.bounds.y1,
          bPiece.bounds.y0,
          bPiece.bounds.y1,
        );
        if (Math.hypot(dx, dy) >= requiredGapMm) continue;
        for (const a of aPiece.segments) {
          for (const b of bPiece.segments) {
            if (segmentBoxesFurtherThan(a, b, requiredGapMm)) continue;
            const clearanceMm = segmentDistance(a.a, a.b, b.a, b.b) - a.radiusMm - b.radiusMm;
            if (clearanceMm < requiredGapMm - 1e-5)
              throw new Error(
                `sheet ${sheetIndex + 1}: pieces ${aPiece.key} and ${bPiece.key} have ${clearanceMm.toFixed(3)} mm ink clearance; need ${requiredGapMm.toFixed(1)} mm`,
              );
          }
        }
      }
    }
  }
  if (cutStrokes !== plan.placed)
    throw new Error(`cut-stroke count ${cutStrokes} does not match placed ${plan.placed}`);
  if (plan.placed + plan.tooWide.length + plan.tooLong.length !== plan.total)
    throw new Error('placed + tooWide + tooLong does not match total');
  return { piecePairs, minEdgeMm };
}

function assertNoTestSquare(plan: RollPrintPlan, roll: RollSpec): void {
  const furnitureMm = rollFurnitureMm(roll);
  if (furnitureMm !== ROLL_TITLE_FURNITURE_MM)
    throw new Error(`title-only furniture is ${furnitureMm} mm`);
  for (const [index, sheet] of plan.sheets.entries()) {
    if (sheet.drawing.strokes.some((stroke) => !stroke.pieceKey))
      throw new Error(`sheet ${index + 1}: title-only plan contains a square stroke`);
    if (sheet.drawing.labels.some((label) => label.s === '10 × 10 cm'))
      throw new Error(`sheet ${index + 1}: title-only plan contains a square label`);
    const pieceY = sheet.drawing.strokes
      .filter((stroke) => stroke.pieceKey)
      .flatMap((stroke) => stroke.pts.map((point) => point[1]));
    if (pieceY.length === 0 || Math.min(...pieceY) < furnitureMm - 1e-5)
      throw new Error(`sheet ${index + 1}: a piece starts before ${furnitureMm} mm`);
  }
  console.log(`assert no test square: pieces start at or after ${furnitureMm} mm`);
}

export function assertRollPrintZip(
  pdfs: Uint8Array[] = [
    new TextEncoder().encode('%PDF first slot'),
    new TextEncoder().encode('%PDF second slot'),
  ],
) {
  const archive = zipRollPrintPdfs('FW28-001', { kind: 'roll', widthCm: 91.4 }, [
    { slotLabel: 'Main Material', bytes: pdfs[0] },
    { slotLabel: 'Lining', bytes: pdfs[1] },
  ]);
  const expectedZipPaths = ['FW28-001_main-material_roll91.4.pdf', 'FW28-001_lining_roll91.4.pdf'];
  const unzipped = unzipSync(archive.bytes);
  if (archive.name !== 'FW28-001_print_roll91.4.zip')
    throw new Error(`print zip name ${archive.name} is wrong`);
  if (JSON.stringify(Object.keys(unzipped)) !== JSON.stringify(expectedZipPaths))
    throw new Error(`print zip paths ${JSON.stringify(Object.keys(unzipped))} are wrong`);
  for (const path of expectedZipPaths)
    if (new TextDecoder().decode(unzipped[path].subarray(0, 4)) !== '%PDF')
      throw new Error(`${path} is not a PDF`);
  const tiles = zipRollPrintPdfs('FW28-001', { kind: 'tiles', paper: 'A4' }, [
    { slotLabel: 'Main Material', bytes: pdfs[0] },
    { slotLabel: 'Lining', bytes: pdfs[1] },
  ]);
  const expectedTilePaths = ['FW28-001_main-material_a4.pdf', 'FW28-001_lining_a4.pdf'];
  if (
    tiles.name !== 'FW28-001_print_a4.zip' ||
    JSON.stringify(tiles.paths) !== JSON.stringify(expectedTilePaths)
  )
    throw new Error(`tile print zip names are wrong: ${tiles.name} ${JSON.stringify(tiles.paths)}`);
  console.log(`assert print zip: ${archive.name} · ${expectedZipPaths.length} PDFs`);
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
  const xsOnly = Object.fromEntries(expected.map((size) => [size, size === 'XS' ? 1 : 0]));
  console.log(
    `source ${source.title}: ${source.sizes.map((row) => `${row.size}:${row.pieces}`).join(' ')}`,
  );

  const min = minRollWidthCm(bytes, name, copies);
  const renders: Array<{ pdf: string; pages: number; stem: string; suffix: string }> = [];
  const zipPdfs: Uint8Array[] = [];
  const metrics: Array<{
    key: string;
    widthCm: number;
    lengthMm: number;
    markerLengthMm: number;
    seedLengthMm: number;
    source: string;
    generations: number;
    sheets: number;
    runtimeMs: number;
  }> = [];
  const cases = [
    { key: 'XS@160', widthCm: 160, copies: xsOnly, title: 'card70-XS', testSquare: false },
    {
      key: 'XS-XL@91.4',
      widthCm: 91.4,
      copies,
      title: 'card70-XS-XL',
      testSquare: true,
    },
    {
      key: 'XS-XL@152.4',
      widthCm: 152.4,
      copies,
      title: 'card70-XS-XL',
      testSquare: true,
    },
  ];
  for (const run of cases) {
    const { widthCm } = run;
    const roll: RollSpec = { widthCm, ...ROLL_DEFAULTS, testSquare: run.testSquare };
    const started = performance.now();
    const plan = await planRollPrint(bytes, name, run.copies, roll);
    const elapsedMs = performance.now() - started;
    const asserted = assertPlan(plan, roll);
    if (!run.testSquare) assertNoTestSquare(plan, roll);
    const furnitureMm = rollFurnitureMm(roll);
    const accountedLengthMm = plan.markerLengthMm + plan.sheets.length * furnitureMm;
    if (Math.abs(plan.lengthMm - accountedLengthMm) > 1e-4)
      throw new Error(
        `print length ${plan.lengthMm} mm != marker ${plan.markerLengthMm} mm + furniture ${plan.sheets.length * furnitureMm} mm`,
      );
    const exported = exportRollPrint(plan, run.title, roll, { jsPDF, font });
    const exportedBytes = new Uint8Array(await exported.blob.arrayBuffer());
    if (zipPdfs.length < 2) zipPdfs.push(exportedBytes);
    const base = `${run.title}-roll${widthCm}`;
    const pdfPath = resolve(outDir, `${base}-after.pdf`);
    writeFileSync(pdfPath, Buffer.from(exportedBytes));
    const tooWide = plan.tooWide.length;
    const tooLong = plan.tooLong.length;
    if (!plan.search) throw new Error(`${run.key}: plan carries no search report`);
    if (plan.lengthMm > plan.search.seedLengthMm + 1e-6)
      throw new Error(
        `${run.key}: final ${plan.lengthMm} mm is longer than its seed ${plan.search.seedLengthMm} mm`,
      );
    console.log(
      `after ${run.key}: length ${(plan.lengthMm / 1000).toFixed(3)} m | seed ${(plan.search.seedLengthMm / 1000).toFixed(3)} m | ${plan.search.source} after ${plan.search.generations} generations | marker ${(plan.markerLengthMm / 1000).toFixed(3)} m | sheets ${plan.sheets.length} | placed ${plan.placed}/${plan.total} | tooWide ${tooWide} | tooLong ${tooLong} | runtime ${elapsedMs.toFixed(0)} ms`,
    );
    console.log(
      `assert gap >= ${(ROLL_GAP_MM - 0.5).toFixed(1)} mm across ${asserted.piecePairs} piece pairs | min ink edge ${asserted.minEdgeMm.toFixed(3)} mm`,
    );
    console.log(`pdf ${pdfPath}`);
    renders.push({
      pdf: pdfPath,
      pages: plan.sheets.length,
      stem: resolve(outDir, base),
      suffix: '-after',
    });
    metrics.push({
      key: run.key,
      widthCm,
      lengthMm: plan.lengthMm,
      markerLengthMm: plan.markerLengthMm,
      seedLengthMm: plan.search.seedLengthMm,
      source: plan.search.source,
      generations: plan.search.generations,
      sheets: plan.sheets.length,
      runtimeMs: elapsedMs,
    });
  }
  assertRollPrintZip(zipPdfs);
  const abortController = new AbortController();
  const abortRun = planRollPrint(
    bytes,
    name,
    xsOnly,
    { widthCm: 160, ...ROLL_DEFAULTS },
    abortController.signal,
  );
  setTimeout(() => abortController.abort(), 20);
  try {
    await abortRun;
    throw new Error('mid-search abort did not stop roll planning');
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
  }
  console.log('assert mid-search AbortSignal: ok');
  return { code: 0, renders, metrics, min };
}
