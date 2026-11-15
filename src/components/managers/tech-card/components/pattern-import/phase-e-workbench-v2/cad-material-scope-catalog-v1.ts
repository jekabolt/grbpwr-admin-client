import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
} from 'lib/pattern-import/types';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_V1 =
  'pattern-import-dxf-phase-e-cad-material-scope-catalog/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1 = Object.freeze({
  existingDraftScopesReused: true,
  existingBomScopeIdentityReused: true,
  existingAliasPieceBindingReused: true,
  rawDxfExposed: false,
  crossScopeSeamsInferred: false,
  createsMaterialAuthority: false,
  createsPieceAuthority: false,
  writerReplayRequired: true,
  verifiedSavedPreparedScopeAccepted: true,
} as const);

export type PatternImportDxfPhaseECadMaterialScopeV1 = Readonly<{
  scopeKey: string;
  label: string;
  fabricPurpose: string;
  bomLineKey: string;
  isInterlining: boolean;
  filename: string;
  pieceLineKeys: readonly string[];
  blockNames: readonly string[];
}>;

export type PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 =
  | Readonly<{
      ok: true;
      techCardId: number;
      scopes: readonly PatternImportDxfPhaseECadMaterialScopeV1[];
      pieceScopeKeys: Readonly<Record<string, readonly string[]>>;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      techCardId: null;
      scopes: readonly [];
      pieceScopeKeys: Readonly<Record<string, never>>;
      blocker: Readonly<{
        code:
          | 'invalid-card-draft'
          | 'duplicate-material-scope'
          | 'material-scope-writer-unavailable'
          | 'material-scope-alias-unavailable'
          | 'orphan-material-alias';
        detail: string;
      }>;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1;
    }>;

function blocked(
  code: Extract<
    PatternImportDxfPhaseECadMaterialScopeCatalogResultV1,
    { ok: false }
  >['blocker']['code'],
  detail: string,
): PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 {
  return Object.freeze({
    ok: false as const,
    techCardId: null,
    scopes: Object.freeze([]) as readonly [],
    pieceScopeKeys: Object.freeze({}) as Readonly<Record<string, never>>,
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
  });
}

function stableText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Builds the material-slot index for the table from the already prepared import draft. It retains
 * the card's BOM scope and alias identities verbatim and never parses replacement DXF bytes.
 */
export function buildPatternImportDxfPhaseECadMaterialScopeCatalogV1(
  draft: CardDraft | null | undefined,
): PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 {
  if (!draft || !Number.isSafeInteger(draft.techCardId) || draft.techCardId <= 0)
    return blocked('invalid-card-draft', 'A current positive tech-card draft is required.');

  const scopeKeys = draft.scopes.map(({ target }) => target.scopeKey.trim());
  if (scopeKeys.some((scopeKey) => !scopeKey) || new Set(scopeKeys).size !== scopeKeys.length)
    return blocked(
      'duplicate-material-scope',
      'Every imported material slot must have one distinct current scope identity.',
    );

  const retainedScopeKeys = new Set(scopeKeys);
  const orphan = draft.aliases.find(
    ({ scopeKey, pieceLineKey, blockName }) =>
      !retainedScopeKeys.has(scopeKey) || !stableText(pieceLineKey) || !stableText(blockName),
  );
  if (orphan)
    return blocked(
      'orphan-material-alias',
      'Every DXF block alias must retain one current material slot, block and piece identity.',
    );

  const scopes: PatternImportDxfPhaseECadMaterialScopeV1[] = [];
  for (const scope of draft.scopes) {
    if (scope.writerReplay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1)
      return blocked(
        'material-scope-writer-unavailable',
        `Material slot ${scope.target.scopeKey} has no exact writer replay carrier.`,
      );
    const aliases = draft.aliases.filter(({ scopeKey }) => scopeKey === scope.target.scopeKey);
    if (!aliases.length)
      return blocked(
        'material-scope-alias-unavailable',
        `Material slot ${scope.target.scopeKey} has no exact DXF-block to card-piece binding.`,
      );
    scopes.push(
      Object.freeze({
        scopeKey: scope.target.scopeKey,
        label: scope.target.label.trim() || scope.target.scopeKey,
        fabricPurpose: scope.target.fabricPurpose,
        bomLineKey: scope.target.bomLineKey,
        isInterlining: scope.target.isInterlining,
        filename: scope.filename,
        pieceLineKeys: Object.freeze([...new Set(aliases.map(({ pieceLineKey }) => pieceLineKey))]),
        blockNames: Object.freeze([...new Set(aliases.map(({ blockName }) => blockName))]),
      }),
    );
  }

  const pieceScopeKeys = Object.freeze(
    Object.fromEntries(
      [...new Set(scopes.flatMap(({ pieceLineKeys }) => pieceLineKeys))].map((pieceLineKey) => [
        pieceLineKey,
        Object.freeze(
          scopes
            .filter(({ pieceLineKeys }) => pieceLineKeys.includes(pieceLineKey))
            .map(({ scopeKey }) => scopeKey),
        ),
      ]),
    ),
  );
  return Object.freeze({
    ok: true as const,
    techCardId: draft.techCardId,
    scopes: Object.freeze(scopes),
    pieceScopeKeys,
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
  });
}

/** Raw-free single-scope adapter for a verified saved-row preparation after a card reload. */
export function buildPatternImportDxfPhaseECadSavedPreparedMaterialScopeCatalogV1(
  input: Readonly<{
    techCardId: number;
    scope: Readonly<{
      scopeKey: string;
      label: string;
      fabricPurpose: string;
      bomLineKey: string;
      isInterlining: boolean;
      writerReplaySchemaVersion: string | null;
    }>;
    pieces: readonly Readonly<{ pieceId: string; pieceLineKey: string }>[];
  }>,
): PatternImportDxfPhaseECadMaterialScopeCatalogResultV1 {
  if (!Number.isSafeInteger(input.techCardId) || input.techCardId <= 0)
    return blocked(
      'invalid-card-draft',
      'A current positive saved tech-card identity is required.',
    );
  if (
    !stableText(input.scope.scopeKey) ||
    input.scope.writerReplaySchemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1
  )
    return blocked(
      'material-scope-writer-unavailable',
      'The verified saved material slot has no exact writer replay carrier.',
    );
  if (
    !input.pieces.length ||
    input.pieces.some(
      ({ pieceId, pieceLineKey }) => !stableText(pieceId) || !stableText(pieceLineKey),
    )
  )
    return blocked(
      'material-scope-alias-unavailable',
      'The verified saved material slot has no exact DXF-piece to card-piece binding.',
    );
  const pieceLineKeys = Object.freeze([
    ...new Set(input.pieces.map(({ pieceLineKey }) => pieceLineKey)),
  ]);
  const scope = Object.freeze({
    scopeKey: input.scope.scopeKey,
    label: input.scope.label.trim() || input.scope.scopeKey,
    fabricPurpose: input.scope.fabricPurpose,
    bomLineKey: input.scope.bomLineKey,
    isInterlining: input.scope.isInterlining,
    filename: '',
    pieceLineKeys,
    blockNames: Object.freeze([...new Set(input.pieces.map(({ pieceId }) => pieceId))]),
  });
  return Object.freeze({
    ok: true as const,
    techCardId: input.techCardId,
    scopes: Object.freeze([scope]),
    pieceScopeKeys: Object.freeze(
      Object.fromEntries(
        pieceLineKeys.map((pieceLineKey) => [pieceLineKey, Object.freeze([scope.scopeKey])]),
      ),
    ),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
  });
}
