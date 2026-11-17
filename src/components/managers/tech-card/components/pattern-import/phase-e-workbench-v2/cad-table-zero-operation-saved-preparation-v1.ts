import type { common_TechCard } from 'api/proto-http/admin';
import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import {
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import {
  createDxfProductSavedForeignReprocessOwnerV1,
  DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-foreign-reprocess-owner-v1';
import {
  createDxfProductSavedReprocessOwnerV1,
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  projectPatternImportDxfProductPhaseEAssemblyV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { CardDraft } from 'lib/pattern-import/types';

import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1 } from './foreign-saved-dxf-reprocess-host-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import {
  isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1,
  type PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1,
} from './cad-table-zero-operation-generation-owner-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import {
  capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';
import { resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1 } from './zero-operation-saved-dxf-capability-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SAVED_PREPARATION_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-saved-preparation/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SAVED_PREPARATION_CLAIMS_V1 =
  Object.freeze({
    currentGetTechCardProjectionRequired: true,
    operationIndependentRowAuthorityRequired: true,
    exactDownloadedBytesVerified: true,
    freshAuthoritativeRowSeedsReprocess: true,
    savedRowRevalidatedAfterReprocess: true,
    explicitMaterialScopeRequired: true,
    explicitSizeTokenRequired: true,
    selectedOperationRequired: false,
    syntheticOperationCreated: false,
    exactPhaseDSelectionBuilt: true,
    exactAuthoringCatalogBuilt: true,
    exactAssemblyProjectionBuilt: true,
    manifestAbsentForeignDxfFallback: true,
    privateZeroConnectAuthoringAuthorityRetained: true,
    monotonicPreparationGenerationRequired: true,
    genuineImportGenerationBound: true,
    rawDxfReturned: false,
    productionReady: true,
  } as const);

export type PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1 = Readonly<{
  code:
    | 'saved-card-invalid'
    | 'saved-pattern-unavailable'
    | 'material-scope-unavailable'
    | 'size-token-unavailable'
    | 'saved-row-authority-unavailable'
    | 'saved-row-reprocess-blocked'
    | 'phase-d-selection-unavailable'
    | 'authoring-catalog-unavailable'
    | 'preparation-binding-stale'
    | 'projection-unavailable'
    | 'saved-preparation-cancelled'
    | 'saved-preparation-generation-stale'
    | 'saved-preparation-failed';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 =
  | Readonly<{
      ok: true;
      techCardId: number;
      choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      techCardId: number | null;
      choices: readonly [];
      blocker: PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 =
  | Readonly<{
      ok: true;
      techCardId: number;
      scopeKey: string;
      sizeToken: string;
      preparationGeneration: number;
      importGeneration: number;
      choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
      catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
      projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
      authoringAuthority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
      blocker: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SAVED_PREPARATION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      techCardId: number | null;
      scopeKey: string | null;
      sizeToken: string | null;
      preparationGeneration: number | null;
      importGeneration: number | null;
      choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[];
      catalog: null;
      projection: null;
      authoringAuthority: null;
      blocker: PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SAVED_PREPARATION_CLAIMS_V1;
    }>;

type Request = Readonly<{
  techCard: common_TechCard | null | undefined;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  scopeKey: string;
  sizeToken: string;
  authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  generation: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
}>;

function blocker(
  code: PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1 {
  return Object.freeze({ code, detail });
}

function blockedChoices(
  techCard: common_TechCard | null | undefined,
  issue: PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1,
): PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 {
  return Object.freeze({
    ok: false as const,
    techCardId: techCard?.id ?? null,
    choices: Object.freeze([]) as readonly [],
    blocker: issue,
  });
}

export function listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
  techCard: common_TechCard | null | undefined,
  orderSizeIds: (ids: number[]) => number[],
  sizeNameById: ReadonlyMap<number, string>,
): PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 {
  if (
    !techCard?.techCard ||
    !Number.isSafeInteger(techCard.id) ||
    Number(techCard.id) <= 0 ||
    !Number.isSafeInteger(techCard.lockVersion) ||
    Number(techCard.lockVersion) < 0
  )
    return blockedChoices(
      techCard,
      blocker('saved-card-invalid', 'A current saved card id and optimistic lock are required.'),
    );
  const card = buildPatternImportDxfPhaseESavedCardContextV1(techCard, orderSizeIds, sizeNameById);
  if (!card.sizes.length)
    return blockedChoices(
      techCard,
      blocker('size-token-unavailable', 'The saved card has no current pattern size run.'),
    );
  const insert = techCard.techCard;
  const scopes = rollGoodsScopes(insert.bomItems ?? []);
  const patterns = insert.patterns ?? [];
  const bindings = bindingScopes(scopes, patterns);
  const choices = card.scopes.flatMap((scope) => {
    const rows = patterns.filter(
      (pattern) =>
        scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, bindings) === scope.scopeKey &&
        Boolean(pattern.lineKey && pattern.url && pattern.downloadUrl),
    );
    if (rows.length !== 1) return [];
    return [
      Object.freeze({
        scopeKey: scope.scopeKey,
        label: scope.label,
        fabricPurpose: scope.fabricPurpose,
        bomLineKey: scope.bomLineKey,
        isInterlining: scope.isInterlining,
        sizes: Object.freeze(
          card.sizes.map((size) =>
            Object.freeze({
              sizeToken: size.token,
              sizeId: size.sizeId,
              label: size.name,
              rank: size.rank,
            }),
          ),
        ),
      }),
    ];
  });
  if (!choices.length)
    return blockedChoices(
      techCard,
      blocker(
        'saved-pattern-unavailable',
        'No material scope has one exact current saved DXF row with a server download URL.',
      ),
    );
  return Object.freeze({
    ok: true as const,
    techCardId: techCard.id!,
    choices: Object.freeze(choices),
    blocker: null,
  });
}

function blockedPreparation(
  request: Request,
  choices: readonly PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1[],
  issue: PatternImportDxfPhaseECadTableZeroOperationSavedBlockerV1,
): PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 {
  return Object.freeze({
    ok: false as const,
    techCardId: request.techCard?.id ?? null,
    scopeKey: request.scopeKey || null,
    sizeToken: request.sizeToken || null,
    preparationGeneration: isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(
      request.generation,
    )
      ? request.generation.preparationGeneration
      : null,
    importGeneration: isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(
      request.generation,
    )
      ? request.generation.importGeneration
      : null,
    choices: Object.freeze([...choices]),
    catalog: null,
    projection: null,
    authoringAuthority: null,
    blocker: issue,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SAVED_PREPARATION_CLAIMS_V1,
  });
}

export async function preparePatternImportDxfPhaseECadTableZeroOperationSavedV1(
  request: Request,
  signal?: AbortSignal,
): Promise<PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1> {
  if (!isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(request.generation))
    return blockedPreparation(
      request,
      [],
      blocker(
        'saved-preparation-generation-stale',
        'A current monotonic saved-row preparation generation is required.',
      ),
    );
  const choices = listPatternImportDxfPhaseECadTableZeroOperationSavedChoicesV1(
    request.techCard,
    request.orderSizeIds,
    request.sizeNameById,
  );
  if (!choices.ok) return blockedPreparation(request, [], choices.blocker);
  if (!request.techCard?.techCard)
    return blockedPreparation(
      request,
      choices.choices,
      blocker('saved-card-invalid', 'The current saved card projection is unavailable.'),
    );
  const scope = choices.choices.find(({ scopeKey }) => scopeKey === request.scopeKey);
  if (!scope)
    return blockedPreparation(
      request,
      choices.choices,
      blocker('material-scope-unavailable', 'The selected saved material scope is not current.'),
    );
  if (!scope.sizes.some(({ sizeToken }) => sizeToken === request.sizeToken))
    return blockedPreparation(
      request,
      choices.choices,
      blocker('size-token-unavailable', 'The selected saved pattern size is not current.'),
    );

  const insert = request.techCard.techCard;
  const capability = resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1(
    {
      techCardId: request.techCard.id!,
      cardLockVersion: request.techCard.lockVersion!,
      patterns: insert.patterns ?? [],
      scopes: rollGoodsScopes(insert.bomItems ?? []),
      scopeKey: request.scopeKey,
      sizeToken: request.sizeToken,
      availableSizeTokens: scope.sizes.map(({ sizeToken }) => sizeToken),
    },
    request.authority.authority,
  );
  if (!capability.ok)
    return blockedPreparation(
      request,
      choices.choices,
      blocker(
        'saved-row-authority-unavailable',
        capability.blockers[0]?.detail ?? 'The saved DXF row authority is unavailable.',
      ),
    );

  const hostDeps = {
    resolveCard: request.authority.resolveCard,
    readAuthoritativeRow: capability.authority.readAuthoritativeRow,
  };
  const exactOwner = createDxfProductSavedReprocessOwnerV1(
    createPatternImportDxfPhaseESavedDxfReprocessHostV1(hostDeps),
  );
  let foreignOwner: ReturnType<typeof createDxfProductSavedForeignReprocessOwnerV1> | null = null;
  const cancel = () => {
    exactOwner.cancel();
    foreignOwner?.cancel();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted)
      return blockedPreparation(
        request,
        choices.choices,
        blocker('saved-preparation-cancelled', 'Exact saved DXF preparation was cancelled.'),
      );
    // The cached card projection chooses the stable row (card lock + scope + line key), but its
    // output-only file metadata can lag a fresh GetTechCard projection. Seed the exact-byte owner
    // with that fresh authority; all subsequent reads still fail closed if this full identity moves.
    const authoritative = await request.authority.resolveCurrentRow(
      capability.row,
      signal ?? new AbortController().signal,
    );
    const reprocessed = await exactOwner.run({
      schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
      row: authoritative.row,
    });
    if (signal?.aborted)
      return blockedPreparation(
        request,
        choices.choices,
        blocker('saved-preparation-cancelled', 'Exact saved DXF preparation was cancelled.'),
      );
    let draft: CardDraft;
    if (reprocessed.ok) {
      draft = reprocessed.draft;
    } else if (reprocessed.blockers[0]?.code === 'foreign-saved-dxf-detected') {
      foreignOwner = createDxfProductSavedForeignReprocessOwnerV1(
        createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1(hostDeps),
      );
      const foreign = await foreignOwner.run({
        schemaVersion: DXF_PRODUCT_SAVED_FOREIGN_REPROCESS_REQUEST_V1,
        row: authoritative.row,
      });
      if (signal?.aborted)
        return blockedPreparation(
          request,
          choices.choices,
          blocker('saved-preparation-cancelled', 'Foreign saved DXF preparation was cancelled.'),
        );
      if (!foreign.ok)
        return blockedPreparation(
          request,
          choices.choices,
          blocker(
            'saved-row-reprocess-blocked',
            foreign.blockers[0]?.detail ?? 'The foreign saved DXF could not be reconstructed.',
          ),
        );
      draft = foreign.draft;
    } else {
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'saved-row-reprocess-blocked',
          reprocessed.blockers[0]?.detail ?? 'The exact saved DXF could not be reconstructed.',
        ),
      );
    }
    const [selection, catalogResult] = await Promise.all([
      selectPatternImportDxfProductDraftPhaseDSizeV1(draft, request.scopeKey, request.sizeToken),
      buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
        draft,
        request.scopeKey,
        request.sizeToken,
      ),
    ]);
    if (!selection.ok)
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'phase-d-selection-unavailable',
          selection.blockers[0]?.detail ?? 'Exact saved Phase-D size selection is unavailable.',
        ),
      );
    if (!catalogResult.ok)
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'authoring-catalog-unavailable',
          catalogResult.blockers[0]?.detail ?? 'Exact saved authoring catalog is unavailable.',
        ),
      );
    const selected = selection.selection.selection;
    const binding = selection.selection.pipeline.contentBinding;
    if (
      selected.scopeKey !== request.scopeKey ||
      selected.sizeToken !== request.sizeToken ||
      binding?.sourceSha256 !== authoritative.row.sha256 ||
      catalogResult.catalog.sourceFileId !== selection.selection.phaseD.source.sourceFileId ||
      catalogResult.catalog.sourceFileId !== binding?.sourceFileId ||
      catalogResult.catalog.sizeSelectionCanonicalSha256 !== selected.canonicalSha256
    )
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'preparation-binding-stale',
          'Saved Phase-D selection and authoring catalog do not share the verified row, scope and size.',
        ),
      );
    const projection = projectPatternImportDxfProductPhaseEAssemblyV1(
      catalogResult.catalog,
      selection.selection,
    );
    if (!projection.ok)
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'projection-unavailable',
          projection.blockers[0]?.detail ?? 'Exact saved Assembly projection is unavailable.',
        ),
      );
    if (!isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(request.generation))
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'saved-preparation-generation-stale',
          'A newer zero-operation preparation superseded this saved-row generation.',
        ),
      );
    const authoringAuthority = capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
      row: authoritative.row,
      draft,
      selection: selection.selection,
      catalog: catalogResult.catalog,
      generation: request.generation,
    });
    if (!authoringAuthority)
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'preparation-binding-stale',
          'Saved row, replay draft, Phase-D selection and authoring catalog no longer share one exact authority.',
        ),
      );
    if (!isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(request.generation))
      return blockedPreparation(
        request,
        choices.choices,
        blocker(
          'saved-preparation-generation-stale',
          'A newer zero-operation preparation superseded this saved-row generation.',
        ),
      );
    return Object.freeze({
      ok: true as const,
      techCardId: request.techCard.id!,
      scopeKey: request.scopeKey,
      sizeToken: request.sizeToken,
      preparationGeneration: request.generation.preparationGeneration,
      importGeneration: request.generation.importGeneration,
      choices: choices.choices,
      catalog: catalogResult.catalog,
      projection: projection.projection,
      authoringAuthority,
      blocker: null,
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SAVED_PREPARATION_CLAIMS_V1,
    });
  } catch (error) {
    if (signal?.aborted)
      return blockedPreparation(
        request,
        choices.choices,
        blocker('saved-preparation-cancelled', 'Exact saved DXF preparation was cancelled.'),
      );
    const reason = error instanceof Error && error.message.trim() ? ` ${error.message.trim()}` : '';
    return blockedPreparation(
      request,
      choices.choices,
      blocker('saved-preparation-failed', `Exact saved DXF preparation failed.${reason}`),
    );
  } finally {
    signal?.removeEventListener('abort', cancel);
    exactOwner.dispose();
    foreignOwner?.dispose();
  }
}
