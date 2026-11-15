import type { PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 } from './draft-cad-geometry-compile-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-cad-command-compiled-reimport-handoff/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_CLAIMS_V1 =
  Object.freeze({
    existingImportWizardReused: true,
    existingCardApplyWriterReused: true,
    explicitUserActionRequired: true,
    opensReviewBeforeApply: true,
    performsNetworkWrite: false,
    createsPersistenceAuthority: false,
    artifactRemainsSessionOnlyUntilReview: true,
  } as const);

export type PatternImportDxfPhaseECadCommandCompiledReimportHandoffRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1;
  artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;
  confirmedImportGenerationAtCompile: number;
  cadSessionCursorAtCompile: number;
}>;

export type PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 =
  | Readonly<{
      ok: true;
      status: 'review-opened';
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      blocker: Readonly<{
        code:
          | 'reimport-owner-unavailable'
          | 'reimport-request-invalid'
          | 'reimport-card-mismatch'
          | 'reimport-generation-stale'
          | 'reimport-source-stale'
          | 'reimport-scope-unavailable'
          | 'reimport-review-already-open';
        detail: string;
      }>;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_CLAIMS_V1;
    }>;

export type PatternImportDxfPhaseECadCommandCompiledReimportOwnerV1 = Readonly<{
  techCardId: number;
  request: (
    request: PatternImportDxfPhaseECadCommandCompiledReimportHandoffRequestV1,
  ) => PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1;
}>;

export type PatternImportDxfPhaseECadCommandCompiledReimportOwnerInputV1 = Readonly<{
  techCardId: number;
  /** Reads the already-confirmed card import generation at the instant the handoff is requested. */
  readConfirmedImportGeneration: () => number;
  scopeAvailable: (scopeKey: string) => boolean;
  reviewAlreadyOpen: () => boolean;
  /** Opens the existing import wizard. It does not apply or write anything by itself. */
  openExistingImportReview: (
    artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
  ) => void;
}>;

export type PatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1 = Readonly<{
  revision: number;
  available: boolean;
}>;

const owners = new Map<number, PatternImportDxfPhaseECadCommandCompiledReimportOwnerV1>();
const revisions = new Map<number, number>();
const snapshots = new Map<number, PatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1>();
const listeners = new Map<number, Set<() => void>>();

function validCardId(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}

function publish(techCardId: number): void {
  const revision = (revisions.get(techCardId) ?? 0) + 1;
  revisions.set(techCardId, revision);
  snapshots.set(techCardId, Object.freeze({ revision, available: owners.has(techCardId) }));
  for (const listener of listeners.get(techCardId) ?? []) listener();
}

export function registerPatternImportDxfPhaseECadCommandCompiledReimportOwnerV1(
  owner: PatternImportDxfPhaseECadCommandCompiledReimportOwnerV1,
): () => void {
  if (!validCardId(owner.techCardId)) return () => {};
  const token = owner;
  owners.set(owner.techCardId, owner);
  publish(owner.techCardId);
  return () => {
    if (owners.get(owner.techCardId) !== token) return;
    owners.delete(owner.techCardId);
    publish(owner.techCardId);
  };
}

export function subscribePatternImportDxfPhaseECadCommandCompiledReimportOwnerV1(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!validCardId(techCardId)) return () => {};
  const current = listeners.get(techCardId) ?? new Set<() => void>();
  current.add(listener);
  listeners.set(techCardId, current);
  return () => {
    current.delete(listener);
    if (!current.size) listeners.delete(techCardId);
  };
}

const UNAVAILABLE = Object.freeze({ revision: 0, available: false });

export function readPatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1(
  techCardId: number | undefined,
): PatternImportDxfPhaseECadCommandCompiledReimportCapabilityV1 {
  if (!validCardId(techCardId)) return UNAVAILABLE;
  return snapshots.get(techCardId) ?? UNAVAILABLE;
}

function blocked(
  code: Extract<
    PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1,
    { ok: false }
  >['blocker']['code'],
  detail: string,
): PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    blocker: Object.freeze({ code, detail }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_CLAIMS_V1,
  });
}

export function refusePatternImportDxfPhaseECadCommandCompiledReimportV1(
  code: Extract<
    PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1,
    { ok: false }
  >['blocker']['code'],
  detail: string,
): PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 {
  return blocked(code, detail);
}

export function guardPatternImportDxfPhaseECadCommandCompiledReimportCurrentV1(
  request: PatternImportDxfPhaseECadCommandCompiledReimportHandoffRequestV1,
  current: Readonly<{
    techCardId: number;
    confirmedImportGeneration: number;
    cadSessionCursor: number;
    sourceRevision: number;
    sourceFileId: string;
    sourceSha256: string;
    selectedGeometrySha256: string;
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
    scopeKey: string;
    sizeToken: string;
  }>,
): PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 | null {
  if (current.confirmedImportGeneration !== request.confirmedImportGenerationAtCompile)
    return blocked(
      'reimport-generation-stale',
      'The confirmed card import generation changed after compile. Compile the current source again.',
    );
  const { artifact } = request;
  if (
    current.techCardId !== artifact.scope.techCardId ||
    current.cadSessionCursor !== request.cadSessionCursorAtCompile ||
    current.sourceRevision !== artifact.source.revision ||
    current.sourceFileId !== artifact.source.sourceFileId ||
    current.sourceSha256 !== artifact.source.sourceSha256 ||
    current.selectedGeometrySha256 !== artifact.source.selectedGeometrySha256 ||
    current.catalogCanonicalSha256 !== artifact.source.catalogCanonicalSha256 ||
    current.sizeSelectionCanonicalSha256 !== artifact.source.sizeSelectionCanonicalSha256 ||
    current.scopeKey !== artifact.scope.scopeKey ||
    current.sizeToken !== artifact.scope.sizeToken
  )
    return blocked(
      'reimport-source-stale',
      'The CAD source, selection, or material scope changed after compile. Compile the current source again.',
    );
  return null;
}

export function createPatternImportDxfPhaseECadCommandCompiledReimportOwnerV1(
  input: PatternImportDxfPhaseECadCommandCompiledReimportOwnerInputV1,
): PatternImportDxfPhaseECadCommandCompiledReimportOwnerV1 {
  return Object.freeze({
    techCardId: input.techCardId,
    request: (request) => {
      if (request.artifact.scope.techCardId !== input.techCardId)
        return blocked('reimport-card-mismatch', 'Compiled DXF belongs to another Tech Card.');
      const currentImportGeneration = input.readConfirmedImportGeneration();
      if (
        !Number.isSafeInteger(currentImportGeneration) ||
        currentImportGeneration < 0 ||
        currentImportGeneration !== request.confirmedImportGenerationAtCompile
      )
        return blocked(
          'reimport-generation-stale',
          'The confirmed card import generation changed after compile. Compile the current source again.',
        );
      if (!input.scopeAvailable(request.artifact.scope.scopeKey))
        return blocked(
          'reimport-scope-unavailable',
          'The compiled material scope is no longer available on this Tech Card.',
        );
      if (input.reviewAlreadyOpen())
        return blocked(
          'reimport-review-already-open',
          'A pattern import review is already open for this Tech Card.',
        );
      input.openExistingImportReview(request.artifact);
      return Object.freeze({
        ok: true as const,
        status: 'review-opened' as const,
        claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_CLAIMS_V1,
      });
    },
  });
}

export function requestPatternImportDxfPhaseECadCommandCompiledReimportV1(
  request: PatternImportDxfPhaseECadCommandCompiledReimportHandoffRequestV1,
): PatternImportDxfPhaseECadCommandCompiledReimportHandoffResultV1 {
  const techCardId = request.artifact?.scope?.techCardId;
  if (
    request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_COMMAND_COMPILED_REIMPORT_HANDOFF_V1 ||
    !validCardId(techCardId) ||
    !Number.isSafeInteger(request.confirmedImportGenerationAtCompile) ||
    request.confirmedImportGenerationAtCompile < 0 ||
    !Number.isSafeInteger(request.cadSessionCursorAtCompile) ||
    request.cadSessionCursorAtCompile < 0 ||
    request.artifact.status !== 'compiled-reimport-required' ||
    !request.artifact.dxfText.trim()
  )
    return blocked('reimport-request-invalid', 'Compiled DXF re-import request is invalid.');
  const owner = owners.get(techCardId);
  if (!owner)
    return blocked(
      'reimport-owner-unavailable',
      'The card Patterns import owner is not mounted for this Tech Card.',
    );
  if (owner.techCardId !== techCardId)
    return blocked('reimport-card-mismatch', 'Compiled DXF belongs to another Tech Card.');
  return owner.request(request);
}
