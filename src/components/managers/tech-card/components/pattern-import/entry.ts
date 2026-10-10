// The door from the Patterns tab — kept tiny so patterns-field pulls nothing heavy: the wizard
// itself is a lazy chunk.
import type { CardSize, ConversionManifest, DraftScopeTarget } from 'lib/pattern-import/types';
import { sizeTokensOf } from '../nesting/block-code';
import type { CardContext } from './client';

/**
 * The door is open by default (beta shows it with no env change); `VITE_PATTERN_IMPORT=0` at build
 * time closes it on a contour. Fixture mode stays off unless `VITE_PATTERN_IMPORT_STUB=1`
 * (import-wizard.tsx).
 */
export const PATTERN_IMPORT_ENABLED = import.meta.env.VITE_PATTERN_IMPORT !== '0';

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
  pieces: {
    lineKey?: string;
    name?: string;
    cutSymmetry?: string;
    piecesPerGarment?: number;
    fused?: boolean;
    fusingMode?: string;
  }[];
  /** Live block → piece links, scope key already resolved (bom-purpose `aliasScopeKey`). */
  aliases?: { scopeKey: string; blockName?: string; pieceLineKey?: string }[];
  /** Live pattern rows, scope key already resolved (`fabricScopeKey`). */
  patterns?: {
    scopeKey: string;
    filename?: string;
    url?: string;
    lineKey?: string;
    name?: string;
    /** MF-C: the conversion manifest the card's parse read off this sheet (null = none / unread). */
    manifest?: ConversionManifest | null;
  }[];
  styleLabel: string;
}): CardContext {
  const sizes: CardSize[] = args.orderedSizeIds.map((sizeId, rank) => {
    // The card's own reader of the dictionary name (xs_44ta_m → xs, 44): the worker's size map
    // matches the file's labels against exactly these spellings.
    const spellings = sizeTokensOf(args.rawSizeName(sizeId));
    return {
      sizeId,
      name: args.sizeName(sizeId),
      token: (spellings[0] ?? args.sizeName(sizeId)).toUpperCase(),
      rank,
      spellings: spellings.map((t) => t.toUpperCase()),
    };
  });
  const scopes: DraftScopeTarget[] = args.scopes.map((s) => ({
    scopeKey: s.key,
    fabricPurpose: s.binding.fabricPurpose,
    bomLineKey: s.binding.bomLineKey,
    label: s.label,
    isInterlining: s.byPurpose
      ? s.key === INTERLINING_PURPOSE
      : s.sections.includes(INTERLINING_SECTION),
    sections: [...new Set(s.sections)],
  }));
  return {
    techCardId: args.techCardId,
    sizes,
    scopes,
    existingPieces: args.pieces
      .filter((p) => p.lineKey && p.name)
      .map((p) => ({
        lineKey: p.lineKey!,
        name: p.name!,
        cutSymmetry: p.cutSymmetry ?? '',
        piecesPerGarment: p.piecesPerGarment ?? 1,
        fused: !!p.fused,
        fusingMode: p.fusingMode ?? '',
      })),
    existingAliases: (args.aliases ?? []).flatMap((a) =>
      a.scopeKey && a.blockName && a.pieceLineKey
        ? [{ scopeKey: a.scopeKey, blockName: a.blockName, pieceLineKey: a.pieceLineKey }]
        : [],
    ),
    existingPatterns: (args.patterns ?? []).flatMap((p) =>
      p.scopeKey && p.filename
        ? [
            {
              scopeKey: p.scopeKey,
              filename: p.filename,
              url: p.url ?? '',
              lineKey: p.lineKey ?? '',
              name: p.name ?? '',
              manifest: p.manifest ?? null,
            },
          ]
        : [],
    ),
    styleLabel: args.styleLabel,
  };
}
