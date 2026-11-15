import type { common_TechCard } from 'api/proto-http/admin';
import type { TechCardConstructionAuditSharedFactsV1 } from 'components/managers/tech-card/components/construction-audit-owner-v1';
import { zoneOptions } from 'components/managers/tech-card/components/operation-options';

import type { PatternImportDxfPhaseEGoldenCardObservedFactsV1 } from './golden-card-suite-profiles-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_WARNING_FACTS_V1 =
  'pattern-import-dxf-phase-e-golden-card-warning-facts/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AGGREGATE_METRICS_V1 =
  'pattern-import-dxf-phase-e-golden-card-aggregate-metrics/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AGGREGATE_METRICS_CLAIMS_V1 = Object.freeze({
  existingLoadedTechCardReused: true,
  existingConstructionAuditProjectionReused: true,
  existingAssemblyWarningOwnerRequired: true,
  countOnlyAssemblyWarningReceiptSupported: true,
  baselineProfilesUsedAsObservedOutput: false,
  detachedPiecesExcludedFromFinalGarmentCount: true,
  rawTechCardRetained: false,
  rawAuditRetained: false,
  warningTextRetained: false,
  productionReadStarted: false,
  productionWritePerformed: false,
  createsMetricAuthority: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardWarningFactsV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_WARNING_FACTS_V1;
  techCardId: number;
  warningCount: number;
}>;

/**
 * Projects the count emitted by the existing Operations header warning leaf. This is the preferred
 * production boundary: warning text stays inside the leaf that renders it and only its exact list
 * cardinality reaches card-level preflight.
 */
export function projectPatternImportDxfPhaseEGoldenCardWarningCountFactsV1(
  techCardId: number | undefined,
  warningCount: unknown,
): PatternImportDxfPhaseEGoldenCardWarningFactsV1 | null {
  if (
    !Number.isSafeInteger(techCardId) ||
    !techCardId ||
    techCardId < 1 ||
    !Number.isSafeInteger(warningCount) ||
    (warningCount as number) < 0
  )
    return null;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_WARNING_FACTS_V1,
    techCardId,
    warningCount: warningCount as number,
  });
}

/**
 * Compatibility projection for callers that still hold the rendered warning strings. Production
 * card-level preflight uses `project...WarningCountFactsV1`, so those strings never leave the
 * Operations header leaf.
 */
export function projectPatternImportDxfPhaseEGoldenCardWarningFactsV1(
  techCardId: number | undefined,
  warnings: unknown,
): PatternImportDxfPhaseEGoldenCardWarningFactsV1 | null {
  try {
    if (
      !Number.isSafeInteger(techCardId) ||
      !techCardId ||
      techCardId < 1 ||
      !Array.isArray(warnings) ||
      !warnings.every((warning) => typeof warning === 'string')
    )
      return null;
    return projectPatternImportDxfPhaseEGoldenCardWarningCountFactsV1(techCardId, warnings.length);
  } catch {
    return null;
  }
}

export type PatternImportDxfPhaseEGoldenCardAggregateStructuralFactsV1 = Readonly<
  Omit<
    PatternImportDxfPhaseEGoldenCardObservedFactsV1,
    'warningCount' | 'auditFindingCount' | 'auditUncheckedCount'
  > & {
    operationNumbers: readonly number[];
  }
>;

export type PatternImportDxfPhaseEGoldenCardAggregateCardFactsV1 = Readonly<
  PatternImportDxfPhaseEGoldenCardAggregateStructuralFactsV1 & {
    warningCount: number;
  }
>;

export type PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerCodeV1 =
  | 'tech-card-unavailable'
  | 'tech-card-identity-invalid'
  | 'operation-identity-ambiguous'
  | 'warning-facts-unavailable'
  | 'warning-identity-mismatch'
  | 'audit-facts-unavailable'
  | 'audit-identity-mismatch';

export type PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardAggregateMetricsResultV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AGGREGATE_METRICS_V1;
  status: 'complete' | 'partial' | 'blocked';
  structuralFacts: PatternImportDxfPhaseEGoldenCardAggregateStructuralFactsV1 | null;
  cardFacts: PatternImportDxfPhaseEGoldenCardAggregateCardFactsV1 | null;
  observedFacts: PatternImportDxfPhaseEGoldenCardObservedFactsV1 | null;
  blockers: readonly PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerV1[];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AGGREGATE_METRICS_CLAIMS_V1;
}>;

function blocker(
  code: PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerV1 {
  return Object.freeze({ code, detail });
}

function result(
  status: PatternImportDxfPhaseEGoldenCardAggregateMetricsResultV1['status'],
  structuralFacts: PatternImportDxfPhaseEGoldenCardAggregateStructuralFactsV1 | null,
  cardFacts: PatternImportDxfPhaseEGoldenCardAggregateCardFactsV1 | null,
  observedFacts: PatternImportDxfPhaseEGoldenCardObservedFactsV1 | null,
  blockers: readonly PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerV1[],
): PatternImportDxfPhaseEGoldenCardAggregateMetricsResultV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AGGREGATE_METRICS_V1,
    status,
    structuralFacts,
    cardFacts,
    observedFacts,
    blockers: Object.freeze([...blockers]),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_AGGREGATE_METRICS_CLAIMS_V1,
  });
}

/**
 * Projects aggregate golden facts from already-owned card, Assembly-warning and construction-audit
 * reads. No baseline value is consulted here: the pinned profile remains a separate comparator.
 */
export function buildPatternImportDxfPhaseEGoldenCardAggregateMetricsV1(input: {
  techCard: common_TechCard | undefined;
  warningFacts: PatternImportDxfPhaseEGoldenCardWarningFactsV1 | null;
  auditFacts: TechCardConstructionAuditSharedFactsV1 | null;
}): PatternImportDxfPhaseEGoldenCardAggregateMetricsResultV1 {
  try {
    const techCard = input.techCard;
    if (!techCard?.techCard)
      return result('blocked', null, null, null, [
        blocker('tech-card-unavailable', 'The already-loaded tech card is unavailable.'),
      ]);
    const techCardId = techCard.id;
    const cardVersion = techCard.lockVersion;
    if (
      !Number.isSafeInteger(techCardId) ||
      !techCardId ||
      techCardId < 1 ||
      !Number.isSafeInteger(cardVersion) ||
      cardVersion == null ||
      cardVersion < 0
    )
      return result('blocked', null, null, null, [
        blocker('tech-card-identity-invalid', 'The loaded card id or lock version is invalid.'),
      ]);

    const operations = techCard.techCard.operations ?? [];
    const operationNumbers = operations.map(({ operationNumber }) => operationNumber ?? 0);
    if (
      operationNumbers.some((number) => !Number.isSafeInteger(number) || number < 1) ||
      new Set(operationNumbers).size !== operationNumbers.length
    )
      return result('blocked', null, null, null, [
        blocker(
          'operation-identity-ambiguous',
          'Every loaded Assembly operation requires one unique positive operation number.',
        ),
      ]);

    const pieces = techCard.techCard.pieces ?? [];
    const zonesCovered = new Set(
      operations
        .map(({ zone }) => zone)
        .filter(
          (zone): zone is NonNullable<typeof zone> =>
            !!zone && zone !== 'TECH_CARD_GARMENT_ZONE_UNKNOWN',
        ),
    ).size;
    const structuralFacts = Object.freeze({
      techCardId,
      styleNumber: techCard.techCard.styleNumber ?? '',
      name: techCard.techCard.name ?? '',
      cardVersion,
      listedPieceRefCount: pieces.length,
      finalGarmentPieceCount: pieces.filter(({ detached }) => detached !== true).length,
      operationCount: operations.length,
      operationNumbers: Object.freeze([...operationNumbers]),
      zonesCovered,
      zonesTotal: zoneOptions.length - 1,
    });

    const blockers: PatternImportDxfPhaseEGoldenCardAggregateMetricsBlockerV1[] = [];
    if (!input.warningFacts)
      blockers.push(
        blocker(
          'warning-facts-unavailable',
          'The existing Assembly warning owner has not produced a count-only receipt.',
        ),
      );
    else if (input.warningFacts.techCardId !== techCardId)
      blockers.push(
        blocker(
          'warning-identity-mismatch',
          'The Assembly warning receipt belongs to a different card.',
        ),
      );
    if (!input.auditFacts)
      blockers.push(
        blocker(
          'audit-facts-unavailable',
          'The shared construction-audit owner has not produced count-only facts.',
        ),
      );
    else if (input.auditFacts.techCardId !== techCardId)
      blockers.push(
        blocker(
          'audit-identity-mismatch',
          'The construction-audit receipt belongs to a different card.',
        ),
      );

    const warningFacts = input.warningFacts?.techCardId === techCardId ? input.warningFacts : null;
    const cardFacts = warningFacts
      ? Object.freeze({ ...structuralFacts, warningCount: warningFacts.warningCount })
      : null;
    if (blockers.length > 0) return result('partial', structuralFacts, cardFacts, null, blockers);
    const auditFacts = input.auditFacts!;
    return result(
      'complete',
      structuralFacts,
      cardFacts,
      Object.freeze({
        techCardId: cardFacts!.techCardId,
        styleNumber: cardFacts!.styleNumber,
        name: cardFacts!.name,
        cardVersion: cardFacts!.cardVersion,
        listedPieceRefCount: cardFacts!.listedPieceRefCount,
        finalGarmentPieceCount: cardFacts!.finalGarmentPieceCount,
        operationCount: cardFacts!.operationCount,
        zonesCovered: cardFacts!.zonesCovered,
        zonesTotal: cardFacts!.zonesTotal,
        warningCount: cardFacts!.warningCount,
        auditFindingCount: auditFacts.auditFindingCount,
        auditUncheckedCount: auditFacts.auditUncheckedCount,
      }),
      [],
    );
  } catch {
    return result('blocked', null, null, null, [
      blocker('tech-card-unavailable', 'The loaded card could not be inspected safely.'),
    ]);
  }
}
