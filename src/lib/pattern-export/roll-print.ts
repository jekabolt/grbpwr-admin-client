// Print 1:1 on a print-shop paper roll: the pattern's pieces for the chosen sizes × copies, laid
// out across the roll's printable width and cut into sheets no longer than the roll profile allows.
// A sheet break always falls between pieces, and every sheet carries its own title line plus an
// optional test square, so the shop can print and identify each sheet on its own.
//
// CONTRACT between the print dialog (UI) and the layout engine. The UI codes against these
// signatures only; the engine fills in the bodies.
import type { ExportDeps, ExportResult } from './formats';
import type { PatternDrawing } from './drawing';
import { grainArrowGeometry, grainDisplaySegment } from 'lib/nesting/geom/grain-display';
import { PDF_PAGE_LIMIT_MM, renderPdf, type PdfPlan } from './dxf-pdf';
import { bounds } from 'lib/nesting/geom/polygon';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import {
  NEST_DEFAULTS,
  placedPoly,
  type Placement,
  type Pt,
  type RotationDeg,
} from 'lib/nesting/types';
import {
  addRollFurniture,
  printableRollWidthMm,
  retitleRollDrawing,
  rollFurnitureMm,
  rollSheetLimitMm,
  rollWidthMm,
} from './roll-layout';
import { readRollSourceModel, ROLL_PIECE_LABEL_MM, type RollPieceTemplate } from './roll-source';
import {
  rollSearch,
  RollSearchAborted,
  type RollSearchJob,
  type RollSearchPlan,
  type RollSearchResult,
} from './roll-search';

/** One paper roll as the user set it for this print. */
export type RollSpec = {
  /** Roll width as sold, cm (61, 91.4, 106.7, 111.8, 152.4 …). */
  widthCm: number;
  /** Longest sheet the shop prints, m. Default 5. Never above the PDF page limit (5.08 m). */
  maxSheetM: number;
  /** Dead edge the printer leaves on each side, mm. Default 5. Printable width = width − 2·edge. */
  edgeMm: number;
  /** Draw a 10 × 10 cm scale check before the pieces. Defaults to true. */
  testSquare?: boolean;
};

export const ROLL_DEFAULTS: Omit<RollSpec, 'widthCm'> = {
  maxSheetM: 5,
  edgeMm: 5,
  testSquare: true,
};
export const ROLL_MAX_WIDTH_CM = PDF_PAGE_LIMIT_MM / 10;
export const ROLL_GAP_MM = NEST_DEFAULTS.gapCm * 10;

/** Copies per size, e.g. { XS: 1, M: 2 }. Sizes with 0 copies are left out of the print. */
export type SizeCopies = Record<string, number>;

/** What the DXF offers to print: its sizes and the piece count per size. */
export type RollPrintSource = {
  sizes: { size: string; pieces: number }[];
  title: string;
  warnings: string[];
};

export type RollSheet = {
  /** The sheet as it lands on the PDF page: page width = roll width, title furniture drawn. */
  drawing: PatternDrawing;
  lengthMm: number;
};

export type RollPrintPlan = {
  sheets: RollSheet[];
  /** Paper used, mm (sum of sheet lengths). */
  lengthMm: number;
  /** Pieces laid / pieces asked for. */
  placed: number;
  total: number;
  /** Piece labels (`FRONT · M`) that fit the printable width in no orientation. */
  tooWide: string[];
  /** Piece labels longer than one sheet in every orientation. */
  tooLong: string[];
  /** Sum of the marker engine's used lengths, excluding per-sheet furniture. */
  markerLengthMm: number;
  /** How the layout was found; absent when nothing was laid. */
  search?: {
    /** Paper of the deterministic plan the search started from, mm (furniture included). */
    seedLengthMm: number;
    source: 'seed' | 'search';
    generations: number;
    searchMs: number;
  };
  warnings: string[];
};

/** Read the DXF once: sizes and piece counts for step 1 of the dialog. */
export function readRollPrintSource(dxf: ArrayBuffer, fileName: string): RollPrintSource {
  const source = readRollSourceModel(dxf, fileName);
  return {
    sizes: source.sizes.map((size) => ({
      size,
      pieces: source.templates.filter((template) => (template.size || 'OS') === size).length,
    })),
    title: source.title,
    warnings: source.warnings,
  };
}

/** Narrowest 0.1 cm roll on which every selected piece fits in at least one quarter-turn. */
export function minRollWidthCm(
  dxf: ArrayBuffer,
  fileName: string,
  copies: SizeCopies,
  edgeMm = ROLL_DEFAULTS.edgeMm,
): number {
  const source = readRollSourceModel(dxf, fileName);
  let picked = false;
  let requiredAcrossMm = 0;
  for (const template of source.templates) {
    const size = template.size || 'OS';
    const count = normalizedCopies(copies[size] ?? copies[template.size] ?? 0);
    if (count === 0) continue;
    picked = true;
    const narrowestAcrossMm = Math.min(
      ...ROLL_ROTATIONS.map((rotation) => rotatedSpansMm(template, rotation).across),
    );
    requiredAcrossMm = Math.max(requiredAcrossMm, narrowestAcrossMm);
  }
  if (!picked) return 0;
  const widthMm = requiredAcrossMm + 2 * normalizedEdgeMm(edgeMm);
  return Math.ceil(widthMm - FIT_TOLERANCE_MM) / 10;
}

/**
 * Lay the chosen sizes × copies onto the roll. Async: the engine may run the nesting worker.
 * `signal` aborts a stale run when the user changes a number.
 */
export async function planRollPrint(
  dxf: ArrayBuffer,
  fileName: string,
  copies: SizeCopies,
  roll: RollSpec,
  signal?: AbortSignal,
): Promise<RollPrintPlan> {
  throwIfAborted(signal);
  const source = readRollSourceModel(dxf, fileName);
  await yieldTask();
  throwIfAborted(signal);

  const widthMm = rollWidthMm(roll);
  const printableMm = printableRollWidthMm(roll);
  const sheetLimitMm = Math.min(rollSheetLimitMm(roll), PDF_PAGE_LIMIT_MM);
  const furnitureMm = rollFurnitureMm(roll);
  const contentLengthMm = sheetLimitMm - furnitureMm;
  type Item = {
    template: RollPieceTemplate;
    instance: number;
    allowedRots: RotationDeg[];
    label: string;
  };
  const items: Item[] = [];
  const tooWide: string[] = [];
  const tooLong: string[] = [];
  let total = 0;
  for (const template of source.templates) {
    const size = template.size || 'OS';
    const count = normalizedCopies(copies[size] ?? copies[template.size] ?? 0);
    const label = template.label;
    const fitsWidth = ROLL_ROTATIONS.filter(
      (rotation) => rotatedSpansMm(template, rotation).across <= printableMm + FIT_TOLERANCE_MM,
    );
    const allowedRots = fitsWidth.filter(
      (rotation) => rotatedSpansMm(template, rotation).along <= contentLengthMm + 1e-6,
    );
    for (let instance = 0; instance < count; instance++) {
      total++;
      if (fitsWidth.length === 0) tooWide.push(label);
      else if (allowedRots.length === 0) tooLong.push(label);
      else items.push({ template, instance, allowedRots, label });
    }
  }

  if (items.length === 0) {
    return {
      sheets: [],
      lengthMm: 0,
      placed: 0,
      total,
      tooWide,
      tooLong,
      markerLengthMm: 0,
      warnings: source.warnings,
    };
  }

  const templates = new Map<number, RollPieceTemplate>();
  for (const item of items) templates.set(item.template.piece.id, item.template);
  const job: RollSearchJob = {
    pieces: [...templates.values()].map((template) => ({
      id: template.piece.id,
      footprint: template.footprint,
    })),
    items: items.map((item) => ({
      pieceId: item.template.piece.id,
      instance: item.instance,
      allowedRots: item.allowedRots,
    })),
    widthCm: printableMm / 10,
    sheetCm: contentLengthMm / 10,
    sheetFurnitureCm: furnitureMm / 10,
    gapCm: ROLL_GAP_MM / 10,
  };
  const search = await runRollSearch(job, signal);
  throwIfAborted(signal);
  const planned = search.best.sheets.map((sheet) => ({
    // The search works on the printable strip; the roll's dead edge is added only here.
    placements: sheet.placements.map((placement) => ({
      ...placement,
      y: placement.y + roll.edgeMm / 10,
      flipped: false,
    })),
    usedLengthCm: sheet.usedLengthCm,
  }));
  const placedCount = planned.reduce((sum, sheet) => sum + sheet.placements.length, 0);
  if (placedCount !== items.length)
    throw new Error(`roll print laid ${placedCount} of ${items.length} pieces`);

  const itemByKey = new Map(
    items.map((item) => [`${item.template.piece.id}|${item.instance}`, item] as const),
  );
  const drawings = planned.map((sheet, index) => {
    const lengthMm = Math.min(
      sheetLimitMm,
      Math.max(furnitureMm + 1, furnitureMm + sheet.usedLengthCm * 10),
    );
    const drawing = drawingFromRollPlacements(
      sheet.placements,
      itemByKey,
      widthMm,
      lengthMm,
      source.title,
      source.warnings,
      furnitureMm,
    );
    return {
      drawing: addRollFurniture(drawing, index + 1, planned.length, roll, source.title),
      lengthMm,
    };
  });
  const sheetPaperMm = (plan: RollSearchPlan) =>
    plan.sheets.reduce((sum, sheet) => sum + furnitureMm + sheet.usedLengthCm * 10, 0);
  return {
    sheets: drawings,
    lengthMm: drawings.reduce((sum, sheet) => sum + sheet.lengthMm, 0),
    placed: items.length,
    total,
    tooWide,
    tooLong,
    markerLengthMm: planned.reduce((sum, sheet) => sum + sheet.usedLengthCm * 10, 0),
    search: {
      seedLengthMm: sheetPaperMm(search.seed),
      source: search.source,
      generations: search.generations,
      searchMs: search.searchMs,
    },
    warnings: [...source.warnings],
  };
}

/** The PDF: one page per sheet, page width = roll width exactly, 1:1. */
export function exportRollPrint(
  plan: RollPrintPlan,
  title: string,
  roll: RollSpec,
  deps: ExportDeps,
): ExportResult {
  if (plan.sheets.length === 0) throw new Error('there are no roll sheets to export');
  const widthMm = rollWidthMm(roll);
  let offset = 0;
  const strokes: PatternDrawing['strokes'] = [];
  const labels: PatternDrawing['labels'] = [];
  const pages: PdfPlan['pages'] = [];
  plan.sheets.forEach((sheet, index) => {
    if (Math.abs(sheet.drawing.w - widthMm) > 1e-6)
      throw new Error(`sheet ${index + 1} does not match the ${roll.widthCm} cm roll`);
    if (sheet.lengthMm > PDF_PAGE_LIMIT_MM + 1e-6)
      throw new Error(`sheet ${index + 1} exceeds the PDF page limit`);
    const drawing = retitleRollDrawing(sheet.drawing, title, index + 1, plan.sheets.length, roll);
    strokes.push(
      ...drawing.strokes.map((stroke) => ({
        ...stroke,
        pts: stroke.pts.map(([x, y]) => [x, y + offset] as [number, number]),
      })),
    );
    labels.push(...drawing.labels.map((label) => ({ ...label, y: label.y + offset })));
    pages.push({
      w: widthMm,
      h: sheet.lengthMm,
      role: 'sheet',
      content: { tx: 0, ty: -offset, clip: [0, 0, widthMm, sheet.lengthMm] },
      marks: [],
    });
    offset += sheet.lengthMm;
  });
  const drawing: PatternDrawing = {
    w: widthMm,
    h: offset,
    strokes,
    labels,
    title,
    warnings: [...plan.warnings],
  };
  const pdfPlan: PdfPlan = {
    layout: { kind: 'sheet' },
    pages,
    fileName: rollPrintFileName(title, roll),
    warnings: [...plan.warnings],
  };
  const pdf = renderPdf(deps.jsPDF, drawing, pdfPlan, deps.font);
  return {
    blob: new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' }),
    fileName: pdfPlan.fileName,
    warnings: pdfPlan.warnings,
  };
}

/** File name the dialog shows in its toast: `SS25-004_print_roll91.4.pdf`. */
export const rollPrintFileName = (title: string, roll: RollSpec): string =>
  `${title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'pattern'}_print_roll${roll.widthCm}.pdf`;

const normalizedCopies = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const normalizedEdgeMm = (value: number): number => {
  const edge = Number(value);
  if (!(Number.isFinite(edge) && edge >= 0)) throw new Error('roll edge must be zero or greater');
  return edge;
};

const FIT_TOLERANCE_MM = 1e-6;
const ROLL_ROTATIONS = [0, 90, 180, 270] as const;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('roll print layout aborted');
  error.name = 'AbortError';
  throw error;
}

const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function rotatedSpansMm(
  template: RollPieceTemplate,
  rotation: RotationDeg,
): { along: number; across: number } {
  const bb = bounds(template.footprint);
  const width = bb.maxX - bb.minX;
  const height = bb.maxY - bb.minY;
  return rotation === 0 || rotation === 180
    ? { along: width * 10, across: height * 10 }
    : { along: height * 10, across: width * 10 };
}

const abortError = () => {
  const error = new Error('roll print layout aborted');
  error.name = 'AbortError';
  return error;
};

/**
 * The roll search off the main thread when a worker exists, in-thread otherwise (node probes).
 * Abort rejects at once and kills the worker. A worker that fails after posting its seed still
 * yields a layout: the seed is a complete plan, only unsearched.
 */
async function runRollSearch(job: RollSearchJob, signal?: AbortSignal): Promise<RollSearchResult> {
  throwIfAborted(signal);
  if (typeof Worker === 'undefined') {
    try {
      return await rollSearch(job, () => signal?.aborted === true);
    } catch (error) {
      throw error instanceof RollSearchAborted ? abortError() : error;
    }
  }

  const client = new NestingWorkerClient();
  const started = Date.now();
  let seed: RollSearchPlan | null = null;
  const run = client.rollSearch(job, (plan) => {
    seed = plan;
  });
  // Terminating the worker rejects `run.done`, so an abort settles the race immediately.
  const abort = () => client.terminate();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await run.done;
  } catch (error) {
    throwIfAborted(signal);
    const fallback: RollSearchPlan | null = seed;
    if (!fallback) throw error;
    return {
      seed: fallback,
      best: fallback,
      source: 'seed',
      generations: 0,
      evaluated: 0,
      seedMs: Date.now() - started,
      searchMs: 0,
    };
  } finally {
    signal?.removeEventListener('abort', abort);
    client.terminate();
  }
}

const placementKey = (placement: Pick<Placement, 'pieceId' | 'instance'>) =>
  `${placement.pieceId}|${placement.instance}`;

function polygonCentroid(poly: readonly [number, number][]): [number, number] {
  let area2 = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    area2 += f;
    x += (poly[j][0] + poly[i][0]) * f;
    y += (poly[j][1] + poly[i][1]) * f;
  }
  if (Math.abs(area2) < 1e-9) {
    const n = Math.max(1, poly.length);
    return [
      poly.reduce((sum, point) => sum + point[0], 0) / n,
      poly.reduce((sum, point) => sum + point[1], 0) / n,
    ];
  }
  return [x / (3 * area2), y / (3 * area2)];
}

function drawingFromRollPlacements(
  placements: readonly Placement[],
  itemByKey: ReadonlyMap<string, { template: RollPieceTemplate; label: string }>,
  widthMm: number,
  lengthMm: number,
  title: string,
  warnings: string[],
  furnitureMm: number,
): PatternDrawing {
  const strokes: PatternDrawing['strokes'] = [];
  const labels: PatternDrawing['labels'] = [];
  // The placer already applies the roll edge margin in strip coordinates.
  const pagePoint = (point: Pt): [number, number] => [point.y * 10, furnitureMm + point.x * 10];
  for (const placement of placements) {
    const item = itemByKey.get(placementKey(placement));
    if (!item) continue;
    const piece = item.template.piece;
    const pieceKey = placementKey(placement);
    const outline = placedPoly(piece.poly, placement).map(pagePoint);
    strokes.push({ kind: 'cut', closed: true, pts: outline, pieceKey });
    for (const path of piece.inner ?? []) {
      if (path.pts.length < 2 || path.layer === piece.displayGrain?.layer) continue;
      strokes.push({
        kind: 'line',
        closed: path.closed,
        pts: placedPoly(path.pts, placement).map(pagePoint),
        pieceKey,
      });
    }
    if (piece.displayGrain) {
      const local = grainDisplaySegment([piece.poly], piece.displayGrain);
      if (local) {
        const placed = placedPoly([local.a, local.b], placement).map(pagePoint);
        const arrow = grainArrowGeometry(
          {
            a: { x: placed[0][0], y: placed[0][1] },
            b: { x: placed[1][0], y: placed[1][1] },
          },
          3,
        );
        if (arrow) {
          strokes.push({
            kind: 'line',
            closed: false,
            pts: [
              [arrow.shaft.a.x, arrow.shaft.a.y],
              [arrow.shaft.b.x, arrow.shaft.b.y],
            ],
            pieceKey,
          });
          for (const head of arrow.heads)
            strokes.push({
              kind: 'line',
              closed: true,
              fill: true,
              pts: head.map((point) => [point.x, point.y] as [number, number]),
              pieceKey,
            });
        }
      }
    }
    const [x, y] = polygonCentroid(outline);
    labels.push({
      x,
      y,
      s: item.label,
      sizeMm: ROLL_PIECE_LABEL_MM,
      angle: 90 - placement.rot,
      pieceKey,
    });
  }
  return { w: widthMm, h: lengthMm, strokes, labels, title, warnings: [...warnings] };
}
