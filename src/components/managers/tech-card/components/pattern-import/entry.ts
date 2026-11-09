// The door from the Patterns tab — kept tiny so patterns-field pulls nothing heavy: the wizard
// itself is a lazy chunk.
import type { PieceShapeReference } from 'lib/dxf-reconcile';
import type {
  AssemblyContext,
  CardSize,
  ConversionManifest,
  DraftScopeTarget,
  DraftShapeRef,
} from 'lib/pattern-import/types';
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
  /** Live block → piece links, scope key already resolved (bom-purpose `scopeKeyOfBinding`). */
  aliases?: { scopeKey: string; blockName?: string; pieceLineKey?: string }[];
  /** Live pattern rows, scope key already resolved (bom-purpose `scopeKeyOfBinding`). */
  patterns?: {
    scopeKey: string;
    filename?: string;
    url?: string;
    lineKey?: string;
    name?: string;
    /** MF-C: the conversion manifest the card's parse read off this sheet (null = none / unread). */
    manifest?: ConversionManifest | null;
    /** System-owned generated-sheet row, never inferred from its filename. */
    generatedFusing?: boolean;
  }[];
  /** Each card piece's current outline per scope, sheet and size (`shapeRefsOf`). */
  shapes?: DraftShapeRef[];
  /** The card has sheets and their parse is not read yet (`CardContext.shapesPending`). */
  shapesPending?: boolean;
  styleLabel: string;
  /** A10: the card's name and style number (the autopilot's model / sheet match). */
  cardName?: string;
  styleNumber?: string;
  /** T4: the card's ops and seams (apply step: what the re-import does to the assembly). */
  assembly?: AssemblyContext | null;
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
      p.scopeKey && (p.filename || p.url)
        ? [
            {
              scopeKey: p.scopeKey,
              filename: p.filename ?? '',
              url: p.url ?? '',
              lineKey: p.lineKey ?? '',
              name: p.name ?? '',
              manifest: p.manifest ?? null,
              ...(p.generatedFusing ? { generatedFusing: true } : {}),
            },
          ]
        : [],
    ),
    generatedFusingSources: (args.patterns ?? []).flatMap((pattern) =>
      pattern.generatedFusing && pattern.filename?.trim() ? [pattern.filename.trim()] : [],
    ),
    existingShapes: args.shapes ?? [],
    ...(args.shapesPending ? { shapesPending: true } : {}),
    styleLabel: args.styleLabel,
    cardName: args.cardName ?? '',
    styleNumber: args.styleNumber ?? '',
    ...(args.assembly ? { assembly: args.assembly } : {}),
  };
}

/**
 * Source identities already proven by this card in the active fabric scope. A stored alias is
 * itself an identity (not an `IDENTITY_SIZE` block), so a trailing `L` must remain intact. The
 * worker maps these source names to the semantic identities written for the same piece seed.
 */
export function cardPresegmentedIdentities(card: CardContext, pinScopeKey?: string): string[] {
  const inScope = (scopeKey: string) => !pinScopeKey || scopeKey === pinScopeKey;
  const identities = new Set<string>();
  for (const shape of card.existingShapes ?? [])
    if (inScope(shape.scopeKey) && shape.identity.trim()) identities.add(shape.identity.trim());
  for (const pattern of card.existingPatterns ?? []) {
    if (!inScope(pattern.scopeKey)) continue;
    for (const piece of pattern.manifest?.pieces ?? [])
      if (piece.identity.trim()) identities.add(piece.identity.trim());
  }
  for (const alias of card.existingAliases ?? [])
    if (inScope(alias.scopeKey) && alias.blockName.trim()) identities.add(alias.blockName.trim());
  return [...identities].sort((a, b) => a.localeCompare(b));
}

/**
 * The card's piece outlines per scope and sheet (`pieceShapeReferences` of one sheet's contour
 * pieces) as the import draft reads them: mm, per bare size token. PieceDTO carries cm.
 */
export function shapeRefsOf(
  sheets: readonly { scopeKey: string; url?: string; refs: readonly PieceShapeReference[] }[],
): DraftShapeRef[] {
  return sheets.flatMap(({ scopeKey, url, refs }) =>
    refs.map((ref) => ({
      scopeKey,
      pieceLineKey: ref.pieceLineKey,
      identity: ref.identity,
      ...(url ? { url } : {}),
      ...(ref.acceptedGate?.length ? { acceptedGate: [...ref.acceptedGate] } : {}),
      sizes: Object.fromEntries(
        [...ref.entry.bySize].map(([size, p]) => [
          size,
          { areaMm2: p.areaCm2 * 100, wMm: p.bboxW * 10, hMm: p.bboxH * 10 },
        ]),
      ),
      ...outlineOf(ref.entry.sizes.flatMap((z) => ref.entry.bySize.get(z) ?? [])),
    })),
  );
}

/** T4: the middle size's contour, mm — the piece tile's picture at the apply step. */
function outlineOf(bySize: readonly { poly?: { x: number; y: number }[] }[]) {
  const mid = bySize[Math.floor(bySize.length / 2)];
  const poly = mid?.poly ?? [];
  return poly.length >= 3
    ? { outline: poly.map((q) => [q.x * 10, q.y * 10] as [number, number]) }
    : {};
}
