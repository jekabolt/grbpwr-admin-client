// Roll print search: the deterministic marker seed first (the floor), then the marker GA seeded
// with it under a wall-clock budget, and never a plan longer than the seed.
//
// Pure computation over caller-prepared keep-outs (cm, strip frame: x along the roll, y across
// the printable width). It runs inside the nesting worker in the browser and in-thread in node
// probes; nothing here touches the DOM or the PDF.
//
// One GA individual is one order of ALL remaining instances. Its decoder lays that order on
// sheet 1 (what does not fit the sheet is skipped, smaller pieces behind it still try), then the
// skipped instances in the same order on sheet 2, and so on. The fitness is the paper of the
// whole plan — every sheet's run plus its furniture — so the search optimises what the shop
// actually prints instead of each sheet on its own.
import { rdpSimplify, SCALE } from 'lib/nesting/geom/clipper';
import { convexHull } from 'lib/nesting/geom/convex';
import { offsetOutward } from 'lib/nesting/geom/offset';
import { area, bounds } from 'lib/nesting/geom/polygon';
import { partsAt } from 'lib/nesting/nest/estimate';
import { hashString, runGa } from 'lib/nesting/nest/ga';
import { mirrorParts, NfpCache, type PreparedPiece } from 'lib/nesting/nest/nfp';
import {
  compactPlacements,
  placeOrder,
  type Gene,
  type PlacedGene,
  type PlacementResult,
} from 'lib/nesting/nest/place';
import { variantPoly, type Placement, type Pt, type RotationDeg } from 'lib/nesting/types';

/** Wall-clock budget of the GA phase, counted after the seed is laid. */
export const ROLL_GA_BUDGET_MS = 4_000;
// A keep-out whose convex hull adds at most this share of area is searched as its hull: one
// convex part makes every NFP a single Minkowski sum, and the true outline of such a piece has
// nothing a neighbour could tuck into anyway. Collars, crotch curves and the like stay concave.
const HULL_AREA_RATIO = 1.1;
// Search geometry is simplified inward by at most this much (RDP), and the NFP gap grows by
// twice it so the simplified pair still keeps the promised gap; the placer verifies every seat
// against the unsimplified keep-outs regardless. Pen-radius arcs give a hull 40–110 vertices;
// at this tolerance 6–30 remain, which is what makes one GA decode cheap.
const SEARCH_EPS_CM = 0.02;
// Concave keep-outs are decomposed after an OUTWARD offset of this much, simplified at the same
// tolerance: their parts cover the true outline, so fewer parts cost no overlap, only up to twice
// this much extra spacing around the few pieces that stay concave.
const CONCAVE_CM = 0.3;
const MAX_GENERATIONS = 400;

export type RollSearchItem = { pieceId: number; instance: number; allowedRots: RotationDeg[] };

export type RollSearchJob = {
  /** One keep-out per unique piece, cm, local origin; every item refers to one by id. */
  pieces: { id: number; footprint: Pt[] }[];
  items: RollSearchItem[];
  /** Printable width across the roll, cm. */
  widthCm: number;
  /** Longest piece run one sheet may hold, cm (sheet limit minus furniture). */
  sheetCm: number;
  /** Paper every sheet costs besides its piece run (title and optional test square), cm. */
  sheetFurnitureCm: number;
  gapCm: number;
  /** GA wall-clock budget, ms. Defaults to {@link ROLL_GA_BUDGET_MS}. */
  budgetMs?: number;
};

export type RollSearchSheet = { placements: Placement[]; usedLengthCm: number };

export type RollSearchPlan = {
  sheets: RollSearchSheet[];
  /** Paper of the whole plan, cm: every sheet's piece run plus its furniture. */
  paperCm: number;
};

export type RollSearchResult = {
  /** The deterministic plan: the floor the search started from. */
  seed: RollSearchPlan;
  /** What to print; never longer than `seed`. */
  best: RollSearchPlan;
  source: 'seed' | 'search';
  generations: number;
  evaluated: number;
  seedMs: number;
  searchMs: number;
};

const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export class RollSearchAborted extends Error {
  constructor() {
    super('roll print layout aborted');
    this.name = 'AbortError';
  }
}

type Prepared = {
  pieces: Map<number, PreparedPiece>;
  nfps: NfpCache;
  job: RollSearchJob;
};

function prepare(job: RollSearchJob): Prepared {
  const pieces = new Map<number, PreparedPiece>();
  for (const { id, footprint } of job.pieces) {
    const hull = convexHull(footprint);
    const convex = area(hull) <= area(footprint) * HULL_AREA_RATIO;
    // The placer verifies every seat against `polyAt` at the true gap, so `polyAt` must contain
    // all ink: the hull does by construction, and a concave piece keeps its true outline.
    const keepOut = convex ? hull : footprint;
    const parts = convex
      ? [convexHull(rdpSimplify(hull, SEARCH_EPS_CM))]
      : partsAt(offsetOutward(footprint, CONCAVE_CM).poly, CONCAVE_CM).parts;
    const polyAt = {} as Record<RotationDeg, Pt[]>;
    const boundsAt = {} as Record<
      RotationDeg,
      { minX: number; minY: number; maxX: number; maxY: number }
    >;
    for (const rotation of [0, 90, 180, 270] as const) {
      polyAt[rotation] = variantPoly(keepOut, rotation, false);
      boundsAt[rotation] = bounds(polyAt[rotation]);
    }
    // Paper patterns are never mirrored: the flipped slot exists only because PreparedPiece
    // carries both chiralities. No gene ever asks for it.
    pieces.set(id, {
      id,
      polyAt: [polyAt, polyAt],
      boundsAt: [boundsAt, boundsAt],
      parts0: [parts, mirrorParts(parts)],
      areaCm2: area(footprint),
    });
  }
  return { pieces, nfps: new NfpCache(job.gapCm + 2 * SEARCH_EPS_CM, job.gapCm), job };
}

const itemKey = (item: { pieceId: number; instance: number }) => `${item.pieceId}|${item.instance}`;
const geneKey = (gene: Gene) => `${gene.piece.id}|${gene.instance}`;

function spans(piece: PreparedPiece, rotation: RotationDeg) {
  const b = piece.boundsAt[0][rotation];
  return { along: b.maxX - b.minX, across: b.maxY - b.minY };
}

// The deterministic orders the print dialog has always laid (long side first for narrow rolls,
// broad side first for wide ones), their area-first sibling, each under four rotation policies.
// Every trial is a plain bottom-left walk of one fixed order.
function trialGenes(items: readonly RollSearchItem[], prepared: Prepared): Gene[][] {
  const piece = (item: RollSearchItem) => prepared.pieces.get(item.pieceId)!;
  const along = (item: RollSearchItem, rotation: RotationDeg) => spans(piece(item), rotation).along;
  const across = (item: RollSearchItem, rotation: RotationDeg) =>
    spans(piece(item), rotation).across;
  const choose = (item: RollSearchItem, mode: number, index: number): RotationDeg => {
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
  const tie = (a: RollSearchItem, b: RollSearchItem) =>
    a.pieceId - b.pieceId || a.instance - b.instance;
  const longFirst = [...items].sort(
    (a, b) =>
      Math.max(along(b, 0), across(b, 0)) - Math.max(along(a, 0), across(a, 0)) || tie(a, b),
  );
  const broadFirst = [...items].sort(
    (a, b) =>
      Math.min(along(b, 0), across(b, 0)) - Math.min(along(a, 0), across(a, 0)) || tie(a, b),
  );
  const areaFirst = [...items].sort((a, b) => piece(b).areaCm2 - piece(a).areaCm2 || tie(a, b));
  const trials: Gene[][] = [];
  for (const order of [longFirst, broadFirst, areaFirst])
    for (const mode of [1, 3, 0, 2])
      trials.push(
        order.map((item, index) => ({
          piece: piece(item),
          instance: item.instance,
          rot: choose(item, mode, index),
          flip: 0,
          allowedRots: item.allowedRots,
        })),
      );
  return trials;
}

function placeSheet(genes: readonly Gene[], prepared: Prepared, abort?: () => boolean) {
  const { widthCm, sheetCm } = prepared.job;
  return placeOrder(genes, widthCm, 0, sheetCm, prepared.nfps, abort, true);
}

const without = (genes: readonly Gene[], placements: readonly Placement[]) => {
  const placed = new Set(placements.map(itemKey));
  return genes.filter((gene) => !placed.has(geneKey(gene)));
};

const paperOf = (sheets: readonly { usedLengthCm: number }[], prepared: Prepared) =>
  sheets.reduce((sum, sheet) => sum + sheet.usedLengthCm + prepared.job.sheetFurnitureCm, 0);

const planOf = (sheets: readonly PlacementResult[], prepared: Prepared): RollSearchPlan => ({
  sheets: sheets.map((sheet) => ({
    placements: sheet.placements.map((placement) => ({ ...placement, flipped: false })),
    usedLengthCm: sheet.usedLengthCm,
  })),
  paperCm: paperOf(sheets, prepared),
});

/** Decode one gene order into consecutive sheets; null when aborted mid-way. */
function decodeSheets(
  genes: readonly Gene[],
  prepared: Prepared,
  abort?: () => boolean,
): PlacementResult[] | null {
  const sheets: PlacementResult[] = [];
  let rest = genes;
  while (rest.length > 0) {
    const result = placeSheet(rest, prepared, abort);
    if (!result) return null;
    // Every rotation a gene may wear fits an empty sheet, so a sheet that takes nothing is a
    // defect; report it as unplaced instead of looping forever.
    if (result.placements.length === 0) return [...sheets, result];
    sheets.push(result);
    rest = without(rest, result.placements);
  }
  return sheets;
}

/**
 * The deterministic plan: every trial order decoded into sheets, the least paper wins (ties: the
 * earlier trial). Its gene order is the GA's individual 0, whose decode is exactly this plan.
 */
async function seedPlan(
  items: readonly RollSearchItem[],
  prepared: Prepared,
  isCancelled: () => boolean,
): Promise<{ sheets: PlacementResult[]; order: Gene[] }> {
  let best: { sheets: PlacementResult[]; order: Gene[]; paperCm: number } | null = null;
  for (const order of trialGenes(items, prepared)) {
    // In the worker a cancel is a MESSAGE: it lands only while this loop is parked.
    await yieldTask();
    if (isCancelled()) throw new RollSearchAborted();
    const sheets = decodeSheets(order, prepared, isCancelled);
    if (isCancelled() || !sheets) throw new RollSearchAborted();
    if (sheets.some((sheet) => sheet.placements.length === 0)) continue;
    const paperCm = paperOf(sheets, prepared);
    if (!best || paperCm < best.paperCm - 1e-9) best = { sheets, order, paperCm };
  }
  if (!best) throw new Error('roll print could not place a piece that fits an empty sheet');
  return best;
}

async function compactSheet(
  sheet: PlacementResult,
  genes: readonly Gene[],
  prepared: Prepared,
  isCancelled: () => boolean,
): Promise<PlacementResult> {
  const byKey = new Map(genes.map((gene) => [geneKey(gene), gene]));
  const placed: PlacedGene[] = [];
  for (const placement of sheet.placements) {
    const gene = byKey.get(itemKey(placement));
    if (!gene) return sheet;
    placed.push({
      ...gene,
      rot: placement.rot,
      x: Math.round(placement.x * SCALE),
      y: Math.round(placement.y * SCALE),
    });
  }
  if (placed.length === 0) return sheet;
  const compacted = await compactPlacements(
    placed,
    prepared.job.widthCm,
    0,
    prepared.job.sheetCm,
    prepared.nfps,
    3,
    isCancelled,
  );
  if (isCancelled()) return sheet;
  return compacted.usedLengthCm <= sheet.usedLengthCm + 1e-9
    ? { ...compacted, unplaced: sheet.unplaced }
    : sheet;
}

/**
 * Seed first, then the GA under one wall-clock budget. The seed plan goes to `onSeed` the moment
 * it exists, so a caller that loses the search still has a layout. `best` is never longer than
 * `seed`. Cancellation throws {@link RollSearchAborted}.
 */
export async function rollSearch(
  job: RollSearchJob,
  isCancelled: () => boolean,
  onSeed?: (seed: RollSearchPlan) => void,
): Promise<RollSearchResult> {
  const started = Date.now();
  const prepared = prepare(job);
  const seeded = await seedPlan(job.items, prepared, isCancelled);
  const seed = planOf(seeded.sheets, prepared);
  const seedMs = Date.now() - started;
  onSeed?.(seed);

  const searchStarted = Date.now();
  // Individual 0 IS the seed: the genes keep the seed's order, and every gene lists the
  // rotation the seed chose first, which is the rotation the GA's base individual wears.
  const genesBase: Gene[] = seeded.order.map((gene) => ({
    ...gene,
    allowedRots: [gene.rot, ...gene.allowedRots.filter((rotation) => rotation !== gene.rot)],
  }));
  const decoded = new WeakMap<PlacementResult, PlacementResult[]>();
  const ga = await runGa({
    genesBase,
    fabricWidthCm: job.widthCm,
    edgeMarginCm: 0,
    lMaxCm: job.sheetCm,
    lengthCapped: true,
    nfps: prepared.nfps,
    deadlineMs: searchStarted + (job.budgetMs ?? ROLL_GA_BUDGET_MS),
    maxGenerations: MAX_GENERATIONS,
    seed: hashString(
      JSON.stringify({
        ids: genesBase.map((gene) => `${gene.piece.id}:${gene.instance}:${gene.rot}`),
        w: job.widthCm,
        l: job.sheetCm,
      }),
    ),
    place: (genes, abort) => {
      const sheets = decodeSheets(genes, prepared, abort);
      if (!sheets) return null;
      const placements = sheets.flatMap((sheet) => sheet.placements);
      const result: PlacementResult = {
        placements,
        usedLengthCm: paperOf(sheets, prepared),
        unplaced: without(genes, placements).map((gene) => ({
          pieceId: gene.piece.id,
          instance: gene.instance,
          reason: 'no-space' as const,
        })),
      };
      decoded.set(result, sheets);
      return result;
    },
    isCancelled,
    onGeneration: () => undefined,
  });
  if (isCancelled()) throw new RollSearchAborted();

  const searchedSheets = ga.best ? decoded.get(ga.best) : undefined;
  const searchedComplete =
    searchedSheets !== undefined &&
    searchedSheets.reduce((sum, sheet) => sum + sheet.placements.length, 0) === job.items.length;
  const useSearch = searchedComplete && paperOf(searchedSheets, prepared) < seed.paperCm - 1e-9;
  let sheets = useSearch ? searchedSheets : seeded.sheets;
  // Left-slide compaction of the winner, sheet by sheet: it only ever shortens a sheet.
  const compacted: PlacementResult[] = [];
  for (const sheet of sheets)
    compacted.push(await compactSheet(sheet, genesBase, prepared, isCancelled));
  if (isCancelled()) throw new RollSearchAborted();
  sheets = compacted;
  const best = planOf(sheets, prepared);
  return {
    seed,
    best: best.paperCm <= seed.paperCm ? best : seed,
    source: useSearch ? 'search' : 'seed',
    generations: ga.generation,
    evaluated: ga.evaluated,
    seedMs,
    searchMs: Date.now() - searchStarted,
  };
}
