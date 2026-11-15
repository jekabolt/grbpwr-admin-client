export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILE_V1 =
  'pattern-import-dxf-phase-e-golden-card-suite-profile/1' as const;

export type PatternImportDxfPhaseEGoldenCardObservedFactsV1 = Readonly<{
  techCardId: number;
  styleNumber: string;
  name: string;
  cardVersion: number;
  listedPieceRefCount: number;
  finalGarmentPieceCount: number;
  operationCount: number;
  zonesCovered: number;
  zonesTotal: number;
  warningCount: number;
  auditFindingCount: number;
  auditUncheckedCount: number;
}>;

export type PatternImportDxfPhaseEGoldenCardSuiteProfileV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILE_V1;
  cardRef: string;
  observedAt: '2026-11-14';
  facts: PatternImportDxfPhaseEGoldenCardObservedFactsV1;
  requiredOperationFamilies: readonly string[];
}>;

/**
 * Read-only acceptance receipts selected by the product owner. These contain no DXF, operation,
 * BOM, colourway or seam payload. A version drift deliberately blocks the golden run until the
 * live baseline is captured again through the existing saved-card owners.
 */
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1 = Object.freeze([
  Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILE_V1,
    cardRef: 'prod-tech-card:6',
    observedAt: '2026-11-14',
    facts: Object.freeze({
      techCardId: 6,
      styleNumber: 'SS26-006',
      name: 'STARVATION',
      cardVersion: 612,
      listedPieceRefCount: 25,
      finalGarmentPieceCount: 25,
      operationCount: 110,
      zonesCovered: 11,
      zonesTotal: 17,
      warningCount: 1,
      auditFindingCount: 4,
      auditUncheckedCount: 2,
    }),
    requiredOperationFamilies: Object.freeze([
      'fuse',
      'join-seam',
      'press',
      'topstitch',
      'buttonhole',
      'bind-tape-edge',
      'hem',
      'button-attach',
      'attach-label',
      'final-press',
    ]),
  }),
  Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILE_V1,
    cardRef: 'prod-tech-card:11',
    observedAt: '2026-11-14',
    facts: Object.freeze({
      techCardId: 11,
      styleNumber: 'SS26-011',
      name: 'PANTS',
      cardVersion: 301,
      listedPieceRefCount: 24,
      finalGarmentPieceCount: 23,
      operationCount: 71,
      zonesCovered: 7,
      zonesTotal: 17,
      warningCount: 2,
      auditFindingCount: 27,
      auditUncheckedCount: 3,
    }),
    requiredOperationFamilies: Object.freeze([
      'fuse',
      'join-seam',
      'press',
      'bind-tape-edge',
      'buttonhole',
      'attach-elastic',
      'attach-rib',
      'button-attach',
      'attach-label',
      'final-press',
    ]),
  }),
] satisfies readonly PatternImportDxfPhaseEGoldenCardSuiteProfileV1[]);

export type PatternImportDxfPhaseEGoldenCardSuiteProfileDifferenceV1 = Readonly<{
  path: keyof PatternImportDxfPhaseEGoldenCardObservedFactsV1;
  expected: string | number;
  actual: string | number;
}>;

export type PatternImportDxfPhaseEGoldenCardSuiteProfileResultV1 = Readonly<{
  ok: boolean;
  cardRef: string;
  differences: readonly PatternImportDxfPhaseEGoldenCardSuiteProfileDifferenceV1[];
}>;

const FACT_KEYS = Object.freeze([
  'techCardId',
  'styleNumber',
  'name',
  'cardVersion',
  'listedPieceRefCount',
  'finalGarmentPieceCount',
  'operationCount',
  'zonesCovered',
  'zonesTotal',
  'warningCount',
  'auditFindingCount',
  'auditUncheckedCount',
] satisfies readonly (keyof PatternImportDxfPhaseEGoldenCardObservedFactsV1)[]);

/** Verifies that a live read still describes the exact card revision selected for the suite. */
export function verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1(
  profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  observed: PatternImportDxfPhaseEGoldenCardObservedFactsV1,
): PatternImportDxfPhaseEGoldenCardSuiteProfileResultV1 {
  const differences = FACT_KEYS.flatMap(
    (path): PatternImportDxfPhaseEGoldenCardSuiteProfileDifferenceV1[] =>
      profile.facts[path] === observed[path]
        ? []
        : [{ path, expected: profile.facts[path], actual: observed[path] }],
  );
  return Object.freeze({
    ok: differences.length === 0,
    cardRef: profile.cardRef,
    differences: Object.freeze(differences.map((difference) => Object.freeze(difference))),
  });
}
