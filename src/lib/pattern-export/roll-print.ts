// Print 1:1 on a print-shop paper roll: the pattern's pieces for the chosen sizes × copies, laid
// out across the roll's printable width and cut into sheets no longer than the roll profile allows.
// A sheet break always falls between pieces, and every sheet carries its own test square and title
// line, so the shop can print and check each sheet on its own.
//
// CONTRACT between the print dialog (UI) and the layout engine. The UI codes against these
// signatures only; the engine fills in the bodies.
import type { ExportDeps, ExportResult } from './formats';
import type { PatternDrawing } from './drawing';
import { PDF_PAGE_LIMIT_MM, renderPdf, type PdfPlan } from './dxf-pdf';
import { area, bounds } from 'lib/nesting/geom/polygon';
import { estimateRun, type EstimatePiece } from 'lib/nesting/nest/estimate';
import { mirrorParts, NfpCache, type PreparedPiece } from 'lib/nesting/nest/nfp';
import { placeOrder, type Gene } from 'lib/nesting/nest/place';
import {
  NEST_DEFAULTS,
  placedPoly,
  variantPoly,
  type Placement,
  type Pt,
  type RotationDeg,
} from 'lib/nesting/types';
import {
  addRollFurniture,
  printableRollWidthMm,
  retitleRollDrawing,
  ROLL_FURNITURE_MM,
  rollSheetLimitMm,
  rollWidthMm,
} from './roll-layout';
import { readRollSourceModel, ROLL_PIECE_LABEL_MM, type RollPieceTemplate } from './roll-source';

/** One paper roll as the user set it for this print. */
export type RollSpec = {
  /** Roll width as sold, cm (61, 91.4, 106.7, 111.8, 152.4 …). */
  widthCm: number;
  /** Longest sheet the shop prints, m. Default 5. Never above the PDF page limit (5.08 m). */
  maxSheetM: number;
  /** Dead edge the printer leaves on each side, mm. Default 5. Printable width = width − 2·edge. */
  edgeMm: number;
};

export const ROLL_DEFAULTS: Omit<RollSpec, 'widthCm'> = { maxSheetM: 5, edgeMm: 5 };
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
  /** The sheet as it lands on the PDF page: page width = roll width, test square + title drawn. */
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
  const contentLengthMm = sheetLimitMm - ROLL_FURNITURE_MM;
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
      warnings: source.warnings,
    };
  }

  const prepared = preparePieces(items);
  const estimatePieces: EstimatePiece[] = [...prepared.values()].map((piece) => ({
    id: piece.id,
    poly: items.find((item) => item.template.piece.id === piece.id)!.template.footprint,
    allowedRots: uniqueRotations(
      items
        .filter((item) => item.template.piece.id === piece.id)
        .flatMap((item) => item.allowedRots),
    ),
    flips: [0],
  }));
  // This path deliberately reuses the marker's true-contour NFP placer but not its full GA. The
  // latter has a mandatory two-second search floor; the print dialog recomputes live. A coarse
  // estimate only chooses the NFP fidelity, then one deterministic, aspect-sensitive marker seed
  // keeps the live run below the dialog's two-second target.
  const estimate = estimateRun(estimatePieces, { timeBudgetMs: 1_200, rdpEpsCm: 0.05 });
  estimatePieces.forEach((piece, index) => {
    const preparedPiece = prepared.get(piece.id)!;
    const decomposition = estimate.decompositions[index];
    preparedPiece.parts0 = [decomposition.parts, mirrorParts(decomposition.parts)];
  });
  const gapCm = ROLL_GAP_MM / 10;
  const nfps = new NfpCache(gapCm + 2 * estimate.effectiveEps, gapCm);

  type PlannedSheet = { placements: Placement[]; usedLengthCm: number };
  const planned: PlannedSheet[] = [];
  let remaining = [...items];
  while (remaining.length > 0) {
    throwIfAborted(signal);
    let best: ReturnType<typeof placeOrder> = null;
    const trials = trialGenes(remaining, prepared, printableMm);
    for (const genes of trials) {
      const candidate = placeOrder(
        genes,
        roll.widthCm,
        roll.edgeMm / 10,
        contentLengthMm / 10,
        nfps,
        () => signal?.aborted === true,
        true,
      );
      throwIfAborted(signal);
      if (!candidate) continue;
      if (
        !best ||
        candidate.placements.length > best.placements.length ||
        (candidate.placements.length === best.placements.length &&
          candidate.usedLengthCm < best.usedLengthCm)
      )
        best = candidate;
    }
    if (!best || best.placements.length === 0)
      throw new Error('roll print could not place a piece that fits an empty sheet');
    planned.push({ placements: best.placements, usedLengthCm: best.usedLengthCm });
    const placedKeys = new Set(best.placements.map((placement) => placementKey(placement)));
    remaining = remaining.filter(
      (item) => !placedKeys.has(`${item.template.piece.id}|${item.instance}`),
    );
    await yieldTask();
  }

  const itemByKey = new Map(
    items.map((item) => [`${item.template.piece.id}|${item.instance}`, item] as const),
  );
  const drawings = planned.map((sheet, index) => {
    const lengthMm = Math.min(
      sheetLimitMm,
      Math.max(ROLL_FURNITURE_MM + 1, ROLL_FURNITURE_MM + sheet.usedLengthCm * 10),
    );
    const drawing = drawingFromRollPlacements(
      sheet.placements,
      itemByKey,
      widthMm,
      lengthMm,
      source.title,
      source.warnings,
    );
    return {
      drawing: addRollFurniture(drawing, index + 1, planned.length, roll, source.title),
      lengthMm,
    };
  });
  const warnings = [...source.warnings];
  if (estimate.effectiveEps > 0.05)
    warnings.push(
      `contours were simplified to ${estimate.effectiveEps} cm for the live roll layout; the ${ROLL_GAP_MM} mm drawn-geometry gap was verified by the placer`,
    );
  return {
    sheets: drawings,
    lengthMm: drawings.reduce((sum, sheet) => sum + sheet.lengthMm, 0),
    placed: items.length,
    total,
    tooWide,
    tooLong,
    warnings: [...new Set(warnings)],
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

function uniqueRotations(rotations: readonly RotationDeg[]): RotationDeg[] {
  return [...new Set(rotations)];
}

function preparePieces(
  items: readonly { template: RollPieceTemplate; allowedRots: RotationDeg[] }[],
): Map<number, PreparedPiece> {
  const prepared = new Map<number, PreparedPiece>();
  for (const item of items) {
    const { piece: dto, footprint } = item.template;
    if (prepared.has(dto.id)) continue;
    const variants = (flipped: boolean) => {
      const polyAt = {} as Record<RotationDeg, Pt[]>;
      const boundsAt = {} as Record<
        RotationDeg,
        { minX: number; minY: number; maxX: number; maxY: number }
      >;
      for (const rotation of [0, 90, 180, 270] as const) {
        const poly = variantPoly(footprint, rotation, flipped);
        polyAt[rotation] = poly;
        boundsAt[rotation] = bounds(poly);
      }
      return { polyAt, boundsAt };
    };
    const normal = variants(false);
    const flipped = variants(true);
    prepared.set(dto.id, {
      id: dto.id,
      polyAt: [normal.polyAt, flipped.polyAt],
      boundsAt: [normal.boundsAt, flipped.boundsAt],
      parts0: [[], []],
      areaCm2: area(footprint),
    });
  }
  return prepared;
}

type TrialItem = {
  template: RollPieceTemplate;
  instance: number;
  allowedRots: RotationDeg[];
};

function trialGenes(
  items: readonly TrialItem[],
  prepared: ReadonlyMap<number, PreparedPiece>,
  printableWidthMm: number,
): Gene[][] {
  const along = (item: TrialItem, rotation: RotationDeg) =>
    rotatedSpansMm(item.template, rotation).along;
  const across = (item: TrialItem, rotation: RotationDeg) =>
    rotatedSpansMm(item.template, rotation).across;
  const choose = (item: TrialItem, mode: number, index: number): RotationDeg => {
    const options = [...item.allowedRots];
    if (mode === 0)
      options.sort((a, b) => along(item, a) - along(item, b) || across(item, b) - across(item, a));
    else if (mode === 1) options.sort((a, b) => Number(a !== 0) - Number(b !== 0) || a - b);
    else if (mode === 2)
      options.sort((a, b) => across(item, b) - across(item, a) || along(item, a) - along(item, b));
    else
      options.sort(
        (a, b) =>
          Number(a !== (index % 2 ? 180 : 0)) - Number(b !== (index % 2 ? 180 : 0)) || a - b,
      );
    return options[0];
  };
  // A single aspect-sensitive marker seed keeps live recomputation below the dialog's two-second
  // target. Long-first is measurably tighter on narrow rolls; broad rolls fill more reliably when
  // pieces with the largest short side lead and their grain direction is preserved.
  const trials =
    printableWidthMm < 1_200
      ? [
          {
            mode: 1,
            order: [...items].sort(
              (a, b) =>
                Math.max(
                  rotatedSpansMm(b.template, 0).along,
                  rotatedSpansMm(b.template, 0).across,
                ) -
                Math.max(rotatedSpansMm(a.template, 0).along, rotatedSpansMm(a.template, 0).across),
            ),
          },
        ]
      : [
          {
            mode: 3,
            order: [...items].sort(
              (a, b) =>
                Math.min(
                  rotatedSpansMm(b.template, 0).along,
                  rotatedSpansMm(b.template, 0).across,
                ) -
                Math.min(rotatedSpansMm(a.template, 0).along, rotatedSpansMm(a.template, 0).across),
            ),
          },
        ];
  return trials.map(({ order, mode }) =>
    order.map((item, index) => ({
      piece: prepared.get(item.template.piece.id)!,
      instance: item.instance,
      rot: choose(item, mode, index),
      flip: 0,
      allowedRots: item.allowedRots,
    })),
  );
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
): PatternDrawing {
  const strokes: PatternDrawing['strokes'] = [];
  const labels: PatternDrawing['labels'] = [];
  // The placer already applies the roll edge margin in strip coordinates.
  const pagePoint = (point: Pt): [number, number] => [
    point.y * 10,
    ROLL_FURNITURE_MM + point.x * 10,
  ];
  for (const placement of placements) {
    const item = itemByKey.get(placementKey(placement));
    if (!item) continue;
    const piece = item.template.piece;
    const pieceKey = placementKey(placement);
    const outline = placedPoly(piece.poly, placement).map(pagePoint);
    strokes.push({ kind: 'cut', closed: true, pts: outline, pieceKey });
    for (const path of piece.inner ?? []) {
      if (path.pts.length < 2) continue;
      strokes.push({
        kind: 'line',
        closed: path.closed,
        pts: placedPoly(path.pts, placement).map(pagePoint),
        pieceKey,
      });
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
