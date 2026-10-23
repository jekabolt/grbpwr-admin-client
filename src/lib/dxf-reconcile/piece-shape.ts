import { aliasIdentity } from 'components/managers/tech-card/components/nesting/split-pieces';
import { pieceNameMatches } from 'components/managers/tech-card/components/nesting/piece-name-match';
import { bareToken } from 'components/managers/tech-card/components/nesting/block-code';

import { byName, comparePair, indexSheet, mirrorSidesConflict, type SheetEntry } from './match';
import type { CardPiece, ParsedSheetLite } from './types';

export const SHAPE_PROPOSAL_THRESHOLDS = {
  areaRel: 0.02,
  perimeterRel: 0.02,
  aspectLog: 0.02,
  outline: 0.025,
  cost: 0.08,
  lead: 0.02,
} as const;

export type PieceShapeReference = {
  pieceLineKey: string;
  pieceName: string;
  /** Identity of the source DXF block; used by the L/R chirality guard. */
  identity: string;
  entry: SheetEntry;
};

export type PieceShapeProposal = {
  basis: 'shape';
  pieceLineKey: string;
  pieceName: string;
  sourceIdentity: string;
  cost: number;
  areaRel: number;
  perimeterRel: number;
  aspectLog: number;
  outline: number;
};

type ShapeBinding = { blockName?: string; pieceLineKey?: string };

/**
 * Attach parsed DXF geometry to live card pieces. Stored aliases win; an entry with no surviving
 * alias may still be recovered by the same exact/loose piece-name rules used by the matcher.
 */
export function pieceShapeReferences<P extends CardPiece>(args: {
  parse: ParsedSheetLite;
  bindings: readonly ShapeBinding[];
  pieces: readonly P[];
  sizeTokens: readonly string[];
}): PieceShapeReference[] {
  const dict = new Set(args.sizeTokens.map(bareToken).filter(Boolean));
  const idx = indexSheet(args.parse, dict);
  const liveByKey = new Map(
    args.pieces
      .filter((piece) => piece.lineKey.trim() && piece.name.trim())
      .map((piece) => [piece.lineKey.trim().toLowerCase(), piece]),
  );
  const out: PieceShapeReference[] = [];
  const seen = new Set<string>();
  for (const entry of [...idx.entries.values()].sort((a, b) => byName(a.key, b.key))) {
    const mapped = new Map<string, P>();
    for (const binding of args.bindings) {
      const piece = liveByKey.get((binding.pieceLineKey ?? '').trim().toLowerCase());
      const identity = aliasIdentity(binding.blockName ?? '', idx.split).toLowerCase();
      if (piece && identity === entry.key) mapped.set(piece.lineKey.trim().toLowerCase(), piece);
    }
    if (mapped.size === 0) {
      const named = pieceNameMatches([entry.identity], args.pieces);
      if (named.matches.length === 1) {
        const piece = named.matches[0];
        mapped.set(piece.lineKey.trim().toLowerCase(), piece);
      }
    }
    for (const piece of mapped.values()) {
      const key = `${piece.lineKey.trim().toLowerCase()}|${entry.key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        pieceLineKey: piece.lineKey.trim(),
        pieceName: piece.name.trim(),
        identity: entry.identity,
        entry,
      });
    }
  }
  return out;
}

/**
 * Strong, unique shape-only proposals. Any name candidate suppresses geometry entirely. Distinct
 * pieces with equally good geometry remain unresolved, as do opposite hands of an explicit L/R
 * pair. Returned keys are lower-cased target identities.
 */
export function proposePieceShapes<P extends CardPiece>(args: {
  target: ParsedSheetLite;
  references: readonly PieceShapeReference[];
  pieces: readonly P[];
  sizeTokens: readonly string[];
  preferredSizeTokens?: readonly string[];
}): Map<string, PieceShapeProposal> {
  const dict = new Set(args.sizeTokens.map(bareToken).filter(Boolean));
  const preferredSizes = new Set((args.preferredSizeTokens ?? []).map(bareToken).filter(Boolean));
  const target = indexSheet(args.target, dict);
  const liveKeys = new Set(args.pieces.map((piece) => piece.lineKey.trim().toLowerCase()));
  const out = new Map<string, PieceShapeProposal>();
  for (const entry of [...target.entries.values()].sort((a, b) => byName(a.key, b.key))) {
    if (pieceNameMatches([entry.identity], args.pieces).matches.length > 0) continue;
    const byPiece = new Map<string, PieceShapeProposal>();
    for (const ref of args.references) {
      const pieceKey = ref.pieceLineKey.trim().toLowerCase();
      if (!pieceKey || !liveKeys.has(pieceKey)) continue;
      if (
        mirrorSidesConflict(entry.identity, ref.identity) ||
        mirrorSidesConflict(entry.identity, ref.pieceName)
      )
        continue;
      const compared = comparePair(ref.entry, entry, 1, false, preferredSizes);
      if (!compared) continue;
      const c = compared.cmp;
      const proposal: PieceShapeProposal = {
        basis: 'shape',
        pieceLineKey: ref.pieceLineKey,
        pieceName: ref.pieceName,
        sourceIdentity: ref.identity,
        cost: c.cost + 0.1 * compared.aspect,
        areaRel: Math.abs(c.dArea),
        perimeterRel: Math.abs(c.dPerim),
        aspectLog: compared.aspect,
        outline: c.form,
      };
      const previous = byPiece.get(pieceKey);
      if (!previous || proposal.cost < previous.cost) byPiece.set(pieceKey, proposal);
    }
    const ranked = [...byPiece.values()].sort(
      (a, b) => a.cost - b.cost || byName(a.pieceLineKey, b.pieceLineKey),
    );
    const best = ranked[0];
    if (!best) continue;
    if (
      best.areaRel > SHAPE_PROPOSAL_THRESHOLDS.areaRel ||
      best.perimeterRel > SHAPE_PROPOSAL_THRESHOLDS.perimeterRel ||
      best.aspectLog > SHAPE_PROPOSAL_THRESHOLDS.aspectLog ||
      best.outline > SHAPE_PROPOSAL_THRESHOLDS.outline ||
      best.cost > SHAPE_PROPOSAL_THRESHOLDS.cost
    )
      continue;
    if (ranked[1] && ranked[1].cost - best.cost < SHAPE_PROPOSAL_THRESHOLDS.lead) continue;
    out.set(entry.key, best);
  }
  return out;
}
