import type { common_TechCard } from 'api/proto-http/admin';
import {
  bindingForScope,
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';

import type { CardContext } from '../client';
import { buildCardContext } from '../entry';
import {
  resolvePatternImportDxfPhaseESavedPatternRowV1,
  type PatternImportDxfPhaseESavedPatternRowResolverBlockerCodeV1,
  type PatternImportDxfPhaseESavedPatternRowResolverResultV1,
} from './saved-pattern-row-resolver-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_CARD_PRODUCTION_PROJECTION_V1 =
  'pattern-import-dxf-phase-e-saved-card-production-projection/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_CARD_PRODUCTION_PROJECTION_CLAIMS_V1 = Object.freeze({
  getTechCardProjectionRequired: true,
  localFormAssemblyUsed: false,
  optimisticSeamOverlayUsed: false,
  exactSavedOperationAndTwoSeamsRequired: true,
  exactTwoPiecePairResolvedFromSavedSeams: true,
  exactSavedRowRevisionRequired: true,
  currentBindingScopeResolutionReused: true,
  assemblyAuthorityProduced: false,
  edgeHintRangeOrSamplesUsedAsExactGeometry: false,
  uiIntegrated: true,
  productionReady: true,
} as const);

export type PatternImportDxfPhaseESavedCardProjectionBlockerV1 = Readonly<{
  code:
    | 'saved-card-unavailable'
    | 'saved-card-identity-invalid'
    | 'saved-operation-missing'
    | 'saved-operation-ambiguous'
    | 'saved-operation-not-two-seam'
    | 'saved-seam-missing'
    | 'saved-seam-ambiguous'
    | 'saved-seam-not-exact'
    | PatternImportDxfPhaseESavedPatternRowResolverBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhaseESavedCardProjectionResultV1 =
  | Readonly<{
      ok: true;
      selectedOperationNumber: number;
      pieceLineKeys: readonly [string, string];
      row: Extract<PatternImportDxfPhaseESavedPatternRowResolverResultV1, { ok: true }>['row'];
      projection: PatternImportDxfPhaseESavedRowCardProjectionV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_CARD_PRODUCTION_PROJECTION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      selectedOperationNumber: number;
      pieceLineKeys: null;
      row: null;
      projection: null;
      blockers: readonly [PatternImportDxfPhaseESavedCardProjectionBlockerV1];
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_CARD_PRODUCTION_PROJECTION_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseESavedCardProjectionRequestV1 = Readonly<{
  techCard: common_TechCard | null | undefined;
  selectedOperationNumber: number;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
}>;

function blocked(
  selectedOperationNumber: number,
  code: PatternImportDxfPhaseESavedCardProjectionBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseESavedCardProjectionResultV1 {
  return Object.freeze({
    ok: false as const,
    selectedOperationNumber,
    pieceLineKeys: null,
    row: null,
    projection: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      PatternImportDxfPhaseESavedCardProjectionBlockerV1,
    ],
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_CARD_PRODUCTION_PROJECTION_CLAIMS_V1,
  });
}

function stablePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function stableNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function exactPiecePair(
  techCard: common_TechCard,
  selectedOperationNumber: number,
):
  | Readonly<{ ok: true; pieceLineKeys: readonly [string, string] }>
  | Readonly<{
      ok: false;
      code: PatternImportDxfPhaseESavedCardProjectionBlockerV1['code'];
      detail: string;
    }> {
  const operations = techCard.techCard?.operations ?? [];
  const selected = operations.filter(
    ({ operationNumber }) => operationNumber === selectedOperationNumber,
  );
  if (selected.length === 0)
    return Object.freeze({
      ok: false as const,
      code: 'saved-operation-missing' as const,
      detail: 'The selected operation is absent from the current saved card.',
    });
  if (selected.length !== 1)
    return Object.freeze({
      ok: false as const,
      code: 'saved-operation-ambiguous' as const,
      detail: 'The current saved card contains the selected operation more than once.',
    });
  const seamKeys = (selected[0].seamKeys ?? []).map((key) => key.trim()).filter(Boolean);
  if (seamKeys.length !== 2 || seamKeys[0] === seamKeys[1])
    return Object.freeze({
      ok: false as const,
      code: 'saved-operation-not-two-seam' as const,
      detail: 'The current saved operation must own exactly two distinct ordered seams.',
    });

  const savedSeams = techCard.seams ?? [];
  const seams = seamKeys.map((seamKey) =>
    savedSeams.filter((candidate) => candidate.seamKey?.trim() === seamKey),
  );
  if (seams.some((matches) => matches.length === 0))
    return Object.freeze({
      ok: false as const,
      code: 'saved-seam-missing' as const,
      detail: 'One of the selected saved seams is absent from the current card read.',
    });
  if (seams.some((matches) => matches.length !== 1))
    return Object.freeze({
      ok: false as const,
      code: 'saved-seam-ambiguous' as const,
      detail: 'A selected seam key resolves to more than one current saved seam.',
    });

  const pairs: [string, string][] = [];
  let anchoredSize: string | null = null;
  for (const [index, matches] of seams.entries()) {
    const seam = matches[0];
    const sideA = seam.sideA?.parts ?? [];
    const sideB = seam.sideB?.parts ?? [];
    const nextSize = seam.anchoredSize?.trim() ?? '';
    const left = sideA[0]?.pieceLineKey?.trim() ?? '';
    const right = sideB[0]?.pieceLineKey?.trim() ?? '';
    if (
      seam.status !== 'TECH_CARD_SEAM_STATUS_CONFIRMED' ||
      seam.stale ||
      sideA.length !== 1 ||
      sideB.length !== 1 ||
      !left ||
      !right ||
      left === right ||
      !nextSize ||
      (index > 0 && anchoredSize !== nextSize)
    )
      return Object.freeze({
        ok: false as const,
        code: 'saved-seam-not-exact' as const,
        detail:
          'Both current saved seams must be confirmed, non-stale, single-run and bind the same anchored size.',
      });
    anchoredSize = nextSize;
    pairs.push([left, right].sort() as [string, string]);
  }
  if (pairs[0][0] !== pairs[1][0] || pairs[0][1] !== pairs[1][1] || pairs[0][0] === pairs[0][1])
    return Object.freeze({
      ok: false as const,
      code: 'saved-seam-not-exact' as const,
      detail: 'Both current saved seams must bind the same two distinct piece lines.',
    });
  return Object.freeze({
    ok: true as const,
    pieceLineKeys: Object.freeze(pairs[0]) as readonly [string, string],
  });
}

export function buildPatternImportDxfPhaseESavedCardContextV1(
  techCard: common_TechCard,
  orderSizeIds: (ids: number[]) => number[],
  sizeNameById: ReadonlyMap<number, string>,
): CardContext {
  const insert = techCard.techCard!;
  const scopes = rollGoodsScopes(insert.bomItems ?? []);
  const aliases = insert.pieceDxfAliases?.items ?? [];
  const patterns = insert.patterns ?? [];
  const aliasBindings = bindingScopes(scopes, aliases);
  const patternBindings = bindingScopes(scopes, patterns);
  const rawSizeName = (id: number) => sizeNameById.get(id);
  return buildCardContext({
    techCardId: techCard.id!,
    orderedSizeIds: orderSizeIds([...(insert.sizeIds ?? [])]),
    sizeName: (id) => rawSizeName(id) ?? `#${id}`,
    rawSizeName,
    scopes: scopes.map((scope) => ({
      key: scope.key,
      byPurpose: scope.byPurpose,
      label:
        scope.lines
          .map(({ name }) => name?.trim())
          .filter((name): name is string => !!name)
          .join(' · ') || scope.key,
      binding: bindingForScope(scope),
      sections: scope.lines.flatMap(({ section }) => (section ? [section] : [])),
    })),
    pieces: (insert.pieces ?? []).map((piece) => ({
      lineKey: piece.lineKey,
      name: piece.name,
      cutSymmetry: piece.cutSymmetry,
      piecesPerGarment: piece.piecesPerGarment,
      fused: piece.fused,
      fusingMode: piece.fusingMode,
    })),
    aliases: aliases.map((alias) => ({
      scopeKey: scopeKeyOfBinding(alias.fabricPurpose, alias.bomLineKey, aliasBindings),
      blockName: alias.blockName,
      pieceLineKey: alias.pieceLineKey,
    })),
    patterns: patterns.map((pattern) => ({
      scopeKey: scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, patternBindings),
      filename: pattern.filename,
      url: pattern.url,
      lineKey: pattern.lineKey,
      name: pattern.name,
      manifest: null,
    })),
    styleLabel: [insert.skuSeason?.code, insert.skuSeason?.year, insert.styleNumber]
      .filter(Boolean)
      .join(' · '),
    cardName: insert.name ?? '',
    styleNumber: insert.styleNumber ?? '',
  });
}

/** Builds only reprocess metadata from GetTechCard; Assembly authority still comes from snapshot. */
export function buildPatternImportDxfPhaseESavedCardProductionProjectionV1(
  request: PatternImportDxfPhaseESavedCardProjectionRequestV1,
): PatternImportDxfPhaseESavedCardProjectionResultV1 {
  const { techCard, selectedOperationNumber } = request;
  if (!techCard?.techCard)
    return blocked(
      selectedOperationNumber,
      'saved-card-unavailable',
      'The current saved card projection is not loaded.',
    );
  if (
    !stablePositiveInteger(techCard.id) ||
    !stableNonNegativeInteger(techCard.lockVersion) ||
    !stablePositiveInteger(selectedOperationNumber)
  )
    return blocked(
      selectedOperationNumber,
      'saved-card-identity-invalid',
      'A positive saved card id, non-negative lock and positive operation number are required.',
    );
  const pair = exactPiecePair(techCard, selectedOperationNumber);
  if (!pair.ok) return blocked(selectedOperationNumber, pair.code, pair.detail);
  const insert = techCard.techCard;
  const scopes = rollGoodsScopes(insert.bomItems ?? []);
  const row = resolvePatternImportDxfPhaseESavedPatternRowV1({
    techCardId: techCard.id,
    cardLockVersion: techCard.lockVersion,
    patterns: insert.patterns ?? [],
    aliases: insert.pieceDxfAliases?.items ?? [],
    scopes,
    pieceLineKeys: pair.pieceLineKeys,
  });
  if (!row.ok)
    return blocked(selectedOperationNumber, row.blockers[0].code, row.blockers[0].detail);
  const card = buildPatternImportDxfPhaseESavedCardContextV1(
    techCard,
    request.orderSizeIds,
    request.sizeNameById,
  );
  return Object.freeze({
    ok: true as const,
    selectedOperationNumber,
    pieceLineKeys: pair.pieceLineKeys,
    row: row.row,
    projection: Object.freeze({ card, cardLockVersion: techCard.lockVersion }),
    blockers: Object.freeze([]) as readonly [],
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_CARD_PRODUCTION_PROJECTION_CLAIMS_V1,
  });
}
