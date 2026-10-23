import { compareSigs, shapeSigOf } from 'lib/dxf-reconcile/shape-sig';
import type { PieceDTO } from 'lib/nesting/types';

export type OrphanBlockCandidate = {
  key: string;
  scopeKey: string;
  block: string;
  piece: PieceDTO;
};

export type RankedOrphanBlock = OrphanBlockCandidate & { shapeScore: number };

export type OrphanPieceInfo = {
  kind: 'used' | 'hidden';
  operations: number;
  candidates: RankedOrphanBlock[];
};

export type OrphanBoardState = {
  pieces: ReadonlyMap<string, OrphanPieceInfo>;
  hiddenKeys: ReadonlySet<string>;
  orphanKeys: ReadonlySet<string>;
  expandedKey: string | null;
  showHidden: boolean;
  frozen: boolean;
  onTogglePiece: (lineKey: string) => void;
  onToggleHidden: () => void;
  onRelink: (lineKey: string, candidate: OrphanBlockCandidate) => void;
  onDelete: (lineKey: string) => void;
};

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Best contour first. A missing historical contour is an honest 0%, not a name-based guess. */
export function rankOrphanBlocks(
  previous: PieceDTO | null | undefined,
  candidates: readonly OrphanBlockCandidate[],
): RankedOrphanBlock[] {
  return candidates
    .map((candidate) => {
      const cost = previous
        ? compareSigs(shapeSigOf(previous), shapeSigOf(candidate.piece)).cost
        : Number.POSITIVE_INFINITY;
      const shapeScore = Number.isFinite(cost)
        ? Math.round(Math.max(0, Math.min(1, 1 - cost)) * 100)
        : 0;
      return { ...candidate, cost, shapeScore };
    })
    .sort(
      (a, b) =>
        a.cost - b.cost ||
        natural.compare(a.block, b.block) ||
        natural.compare(a.scopeKey, b.scopeKey),
    )
    .map((candidate) => ({
      key: candidate.key,
      scopeKey: candidate.scopeKey,
      block: candidate.block,
      piece: candidate.piece,
      shapeScore: candidate.shapeScore,
    }));
}
