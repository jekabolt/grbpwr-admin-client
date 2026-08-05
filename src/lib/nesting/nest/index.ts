// Orchestration: PieceDTO[] + NestConfig → prepared geometry → seeded GA → NestResult.
import type { NestConfig, NestResult, PieceDTO, RotationDeg } from '../types';
import { rdpSimplify } from '../geom/clipper';
import { bounds, ensureCCW, rotatePoly } from '../geom/polygon';
import { hashString, runGa } from './ga';
import { NfpCache, prepareTris, type PreparedPiece } from './nfp';
import type { Gene } from './place';

export type NestProgress = { generation: number; best: NestResult };

export async function nest(
  allPieces: readonly PieceDTO[],
  config: NestConfig,
  isCancelled: () => boolean,
  onProgress: (p: NestProgress) => void,
): Promise<NestResult> {
  const started = Date.now();
  const rotations: readonly RotationDeg[] = config.allowCrossGrain ? [0, 90, 180, 270] : [0, 180];

  const byId = new Map(allPieces.map((p) => [p.id, p]));
  const prepared = new Map<number, PreparedPiece>();
  const unplaced: Array<{ pieceId: number; spanCm: number }> = [];
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
      const tris0 = prepareTris(ensureCCW(rdpSimplify(dto.poly, config.rdpEpsCm)));
      prep = { id: dto.id, polyAt, boundsAt, tris0, areaCm2: dto.areaCm2 };
      prepared.set(dto.id, prep);
    }

    // The piece participates only in rotations that fit the fabric width; if none do, it
    // is reported, not silently dropped mid-placement.
    const fitting = rotations.filter((r) => {
      const b = prep!.boundsAt[r];
      return b.maxY - b.minY <= usableWidth + 1e-9;
    });
    if (fitting.length === 0) {
      const spans = rotations.map((r) => prep!.boundsAt[r].maxY - prep!.boundsAt[r].minY);
      unplaced.push({ pieceId: dto.id, spanCm: Math.min(...spans) });
      continue;
    }
    for (let inst = 0; inst < pc.quantity; inst++) {
      genesBase.push({ piece: prep, instance: inst, rot: fitting[0], allowedRots: fitting });
    }
  }

  const totalCount = config.pieces.reduce((s, pc) => s + Math.max(0, pc.quantity), 0);

  if (genesBase.length === 0) {
    return {
      placements: [],
      usedLengthCm: 0,
      efficiency: 0,
      placedCount: 0,
      totalCount,
      unplaced,
      generation: 0,
      elapsedMs: Date.now() - started,
    };
  }

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

  const nfps = new NfpCache(config.gapCm);
  const areaSum = genesBase.reduce((s, g) => s + g.piece.areaCm2, 0);

  const toResult = (placementsRes: { placements: NestResult['placements']; usedLengthCm: number }, generation: number): NestResult => {
    const used = placementsRes.usedLengthCm;
    return {
      placements: placementsRes.placements,
      usedLengthCm: used,
      efficiency: used > 0 ? areaSum / (config.fabricWidthCm * used) : 0,
      placedCount: placementsRes.placements.length,
      totalCount,
      unplaced,
      generation,
      elapsedMs: Date.now() - started,
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
    timeBudgetMs: config.timeBudgetMs,
    seed: hashString(seedString),
    isCancelled,
    onGeneration: (p) => onProgress({ generation: p.generation, best: toResult(p.best, p.generation) }),
  });

  return toResult(best, generation);
}
