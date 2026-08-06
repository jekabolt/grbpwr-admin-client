// Orchestration: PieceDTO[] + NestConfig → prepared geometry → NFP prepass → seeded GA →
// NestResult. The prepass computes every pairwise NFP up front with cooperative yields
// (progress + cancel land between pairs); the GA then runs against a warm cache, so its
// per-gene abort polling is cheap and the budget overshoot is bounded.
import type { NestConfig, NestResult, PieceDTO, RotationDeg } from '../types';
import { SCALE, rdpSimplify, sanitizeLoop } from '../geom/clipper';
import { bounds, ensureCCW, rotatePoly } from '../geom/polygon';
import { convexParts } from '../geom/triangulate';
import { hashString, runGa } from './ga';
import { NfpCache, type PreparedPiece } from './nfp';
import { compactPlacements, type Gene, type PlacedGene } from './place';

export type NestProgress = {
  phase: 'nfp' | 'ga';
  generation?: number;
  best?: NestResult;
  nfpDone?: number;
  nfpTotal?: number;
};

// Primary GA stop — identical input reproduces the identical marker on any machine that
// completes this many generations inside the time budget.
const MAX_GENERATIONS = 400;
// The GA always gets a floor even when the NFP prepass ate the whole budget.
const GA_MIN_MS = 2_000;

export async function nest(
  allPieces: readonly PieceDTO[],
  config: NestConfig,
  isCancelled: () => boolean,
  onProgress: (p: NestProgress) => void,
): Promise<NestResult> {
  const started = Date.now();
  const warnings: string[] = [];
  const rotations: readonly RotationDeg[] = config.allowCrossGrain ? [0, 90, 180, 270] : [0, 180];

  const byId = new Map(allPieces.map((p) => [p.id, p]));
  const prepared = new Map<number, PreparedPiece>();
  const genesBase: Gene[] = [];

  const usableWidth = config.fabricWidthCm - 2 * config.edgeMarginCm;

  for (const pc of config.pieces) {
    const dto = byId.get(pc.pieceId);
    if (!dto || pc.quantity <= 0) continue;

    let prep = prepared.get(dto.id);
    if (!prep) {
      const polyAt = {} as PreparedPiece['polyAt'];
      const boundsAt = {} as PreparedPiece['boundsAt'];
      for (const r of [0, 90, 180, 270] as const) {
        const rp = rotatePoly(dto.poly, r);
        polyAt[r] = rp;
        boundsAt[r] = bounds(rp);
      }
      // Sanitize AFTER simplification: RDP can self-intersect a thin neck, and feeding
      // that to the decomposer should be a designed path (hull fallback), not luck.
      const simplified = rdpSimplify(dto.poly, config.rdpEpsCm);
      const decomp = convexParts(ensureCCW(sanitizeLoop(simplified) ?? simplified));
      if (decomp.degenerate) {
        warnings.push(`«${dto.name}»: контур с дефектом — раскладка считает его с запасом (выпуклая оболочка)`);
      }
      prep = { id: dto.id, polyAt, boundsAt, parts0: decomp.parts, areaCm2: dto.areaCm2 };
      prepared.set(dto.id, prep);
    }

    // The piece participates only in rotations that fit the fabric width; the modal
    // pre-filters these, the check here is the engine's own guarantee.
    const fitting = rotations.filter((r) => {
      const b = prep!.boundsAt[r];
      return b.maxY - b.minY <= usableWidth + 1e-9;
    });
    if (fitting.length === 0) continue;
    for (let inst = 0; inst < pc.quantity; inst++) {
      genesBase.push({ piece: prep, instance: inst, rot: fitting[0], allowedRots: fitting });
    }
  }

  const totalCount = config.pieces.reduce((s, pc) => s + Math.max(0, pc.quantity), 0);

  const emptyResult = (): NestResult => ({
    placements: [],
    usedLengthCm: 0,
    efficiency: 0,
    placedCount: 0,
    totalCount,
    generation: 0,
    elapsedMs: Date.now() - started,
    warnings,
  });

  if (genesBase.length === 0) return emptyResult();

  // Seed order: descending area — big pieces first is the classic BL seed.
  genesBase.sort((a, b) => b.piece.areaCm2 - a.piece.areaCm2);

  // Length never limits placement: bound = every piece end-to-end plus gaps and margins.
  const lMax =
    genesBase.reduce((s, g) => {
      const b = g.piece.boundsAt[0];
      return s + Math.max(b.maxX - b.minX, b.maxY - b.minY) + config.gapCm;
    }, 0) +
    2 * config.edgeMarginCm +
    10;

  // Gap compensation: NFP inputs are RDP-simplified, whose chords cut ≤ rdpEps inside
  // convex runs PER PIECE — widen the octagon so true contours still end up ≥ gap apart.
  const nfps = new NfpCache(config.gapCm + 2 * config.rdpEpsCm, config.gapCm);
  const areaSum = genesBase.reduce((s, g) => s + g.piece.areaCm2, 0);
  const deadline = started + config.timeBudgetMs;

  // NFP prepass: every unordered pair × relative rotation, yielding between pairs so
  // progress paints and cancel lands. On cancel/deadline the loop stops early — get()
  // computes any missing entry lazily, so a partial prepass only costs GA time.
  const uniquePieces = [...prepared.values()].filter((p) => genesBase.some((g) => g.piece === p));
  const rels: RotationDeg[] = config.allowCrossGrain ? [0, 90, 180, 270] : [0, 180];
  const pairs: Array<[PreparedPiece, PreparedPiece, RotationDeg]> = [];
  for (let i = 0; i < uniquePieces.length; i++) {
    for (let j = i; j < uniquePieces.length; j++) {
      for (const rel of rels) pairs.push([uniquePieces[i], uniquePieces[j], rel]);
    }
  }
  onProgress({ phase: 'nfp', nfpDone: 0, nfpTotal: pairs.length });
  for (let k = 0; k < pairs.length; k++) {
    if (isCancelled() || Date.now() > deadline) break;
    const [a, b, rel] = pairs[k];
    nfps.ensure(a, b, rel);
    if (k % 4 === 3 || k === pairs.length - 1) {
      onProgress({ phase: 'nfp', nfpDone: k + 1, nfpTotal: pairs.length });
      // Drain the queue so a cancel message can land mid-prepass.
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (isCancelled()) return emptyResult();

  const toResult = (
    placementsRes: { placements: NestResult['placements']; usedLengthCm: number },
    generation: number,
  ): NestResult => {
    const used = placementsRes.usedLengthCm;
    return {
      placements: placementsRes.placements,
      usedLengthCm: used,
      efficiency: used > 0 ? areaSum / (config.fabricWidthCm * used) : 0,
      placedCount: placementsRes.placements.length,
      totalCount,
      generation,
      elapsedMs: Date.now() - started,
      warnings,
    };
  };

  const seedString = JSON.stringify({
    ids: genesBase.map((g) => `${g.piece.id}:${g.instance}`),
    w: config.fabricWidthCm,
    g: config.gapCm,
    m: config.edgeMarginCm,
    r: rotations,
    e: config.rdpEpsCm,
  });

  const { best, generation } = await runGa({
    genesBase,
    fabricWidthCm: config.fabricWidthCm,
    edgeMarginCm: config.edgeMarginCm,
    lMaxCm: lMax,
    nfps,
    deadlineMs: Math.max(Date.now() + GA_MIN_MS, deadline),
    maxGenerations: MAX_GENERATIONS,
    seed: hashString(seedString),
    isCancelled,
    onGeneration: (p) => onProgress({ phase: 'ga', generation: p.generation, best: toResult(p.best, p.generation) }),
  });

  // Deterministic left-slide compaction of the GA winner: re-place each piece against the
  // others fixed, filling holes that opened after it was originally placed. Pass-capped;
  // the wall-clock cap is a safety net that only bites on runs whose determinism the
  // budget already truncated (the GA stopped on time, not on maxGenerations).
  const byKey = new Map(genesBase.map((g) => [`${g.piece.id}|${g.instance}`, g]));
  const placedGenes: PlacedGene[] = [];
  for (const pl of best.placements) {
    const g = byKey.get(`${pl.pieceId}|${pl.instance}`);
    if (!g) continue;
    placedGenes.push({ ...g, rot: pl.rot, x: Math.round(pl.x * SCALE), y: Math.round(pl.y * SCALE) });
  }
  if (!isCancelled() && placedGenes.length === best.placements.length && placedGenes.length > 0) {
    // No wall-clock deadline: the pass cap alone bounds the cost, and a clock-truncated
    // compaction made same-seed results machine-dependent for a ≤0.008 cm gain.
    const compacted = compactPlacements(
      placedGenes,
      config.fabricWidthCm,
      config.edgeMarginCm,
      lMax,
      nfps,
    );
    if (compacted.usedLengthCm <= best.usedLengthCm + 1e-9) {
      return toResult(compacted, generation);
    }
  }

  return toResult(best, generation);
}
