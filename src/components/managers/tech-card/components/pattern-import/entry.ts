// The door from the Patterns tab — kept tiny so patterns-field pulls nothing heavy: the wizard
// itself is a lazy chunk.
import type { CardSize, DraftScopeTarget } from 'lib/pattern-import/types';
import { sizeTokensOf } from '../nesting/block-code';
import type { CardContext } from './client';

/**
 * Phase 1 runs on the STUB worker (fixture data, writes nothing), so the door is shown in dev
 * builds and where `VITE_PATTERN_IMPORT=1` is set — not to operators on a real card, where a
 * pretend import would read as a real one. Drop the gate when the worker client lands.
 */
export const PATTERN_IMPORT_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_PATTERN_IMPORT === '1';

const INTERLINING_PURPOSE = 'TECH_CARD_BOM_PURPOSE_INTERFACING';
const INTERLINING_SECTION = 'TECH_CARD_BOM_SECTION_INTERLINING';

/** The card as the wizard reads it: sizes in rank order, one target per fabric scope. */
export function buildCardContext(args: {
  techCardId: number;
  orderedSizeIds: number[];
  sizeName: (id: number) => string;
  rawSizeName: (id: number) => string | undefined;
  scopes: {
    key: string;
    byPurpose: boolean;
    label: string;
    binding: { fabricPurpose: string; bomLineKey: string };
    sections: string[];
  }[];
  pieces: { lineKey?: string; name?: string; cutSymmetry?: string }[];
  styleLabel: string;
}): CardContext {
  const sizes: CardSize[] = args.orderedSizeIds.map((sizeId, rank) => ({
    sizeId,
    name: args.sizeName(sizeId),
    token: (sizeTokensOf(args.rawSizeName(sizeId))[0] ?? args.sizeName(sizeId)).toUpperCase(),
    rank,
  }));
  const scopes: DraftScopeTarget[] = args.scopes.map((s) => ({
    scopeKey: s.key,
    fabricPurpose: s.binding.fabricPurpose,
    bomLineKey: s.binding.bomLineKey,
    label: s.label,
    isInterlining: s.byPurpose
      ? s.key === INTERLINING_PURPOSE
      : s.sections.includes(INTERLINING_SECTION),
  }));
  return {
    techCardId: args.techCardId,
    sizes,
    scopes,
    existingPieces: args.pieces
      .filter((p) => p.lineKey && p.name)
      .map((p) => ({ lineKey: p.lineKey!, name: p.name!, cutSymmetry: p.cutSymmetry ?? '' })),
    styleLabel: args.styleLabel,
  };
}
