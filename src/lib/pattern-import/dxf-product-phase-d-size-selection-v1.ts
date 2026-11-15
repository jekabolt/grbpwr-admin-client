import {
  rehydrateDxfProductPhaseDReplayV1,
  type DxfProductPhaseDReplayStageOutputV1,
} from './dxf-product-phase-d-replay-v1';
import {
  attachDxfPipelineContentBindingV1,
  bridgeDxfPipelineProvenanceV1,
  computeDxfPipelineContentBindingV1,
  type DxfPipelineProvenanceStageOutputV1,
} from './dxf-pipeline-provenance-v1';
import type { PieceSpec } from './types';

export const DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1 =
  'dxf-product-phase-d-size-selection/1' as const;

export type DxfProductPhaseDSizeSelectionBlockerV1 = Readonly<{
  code:
    | 'invalid-input'
    | 'full-phase-d-replay-blocked'
    | 'size-selection-empty'
    | 'size-selection-ambiguous'
    | 'selected-phase-d-rebuild-blocked'
    | 'selected-public-carrier-mismatch'
    | 'sha256-unavailable';
  detail: string;
}>;

export const DXF_PRODUCT_PHASE_D_SIZE_SELECTION_CLAIMS_V1 = Object.freeze({
  fullPhaseDReplayFreshVerified: true,
  oneSizeSelectedExplicitly: true,
  selectedPublicCarrierFreshRebuilt: true,
  selectedContentBindingProduced: true,
  fullContentBindingRetained: true,
  rawDxfAccepted: false,
  g4f1PhaseDInputReady: true,
  phaseEAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  fullPhaseDReplayFreshVerified: false as const,
  oneSizeSelectedExplicitly: false as const,
  selectedPublicCarrierFreshRebuilt: false as const,
  selectedContentBindingProduced: false as const,
  fullContentBindingRetained: false as const,
  rawDxfAccepted: false as const,
  g4f1PhaseDInputReady: false as const,
  phaseEAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export type DxfProductPhaseDSizeSelectionResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1;
      selection: Readonly<{
        scopeKey: string;
        sizeToken: string;
        pieceIds: readonly string[];
        fullSelectedGeometrySha256: string;
        selectedGeometrySha256: string;
        canonicalSha256: string;
      }>;
      pipeline: DxfPipelineProvenanceStageOutputV1;
      phaseD: Readonly<{
        source: NonNullable<DxfProductPhaseDReplayStageOutputV1['carrier']>['source'];
        contours: NonNullable<DxfProductPhaseDReplayStageOutputV1['carrier']>['contours'];
        sourceSha256: string;
      }>;
      blockers: readonly [];
      claims: typeof DXF_PRODUCT_PHASE_D_SIZE_SELECTION_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1;
      selection: null;
      pipeline: null;
      phaseD: null;
      blockers: readonly [DxfProductPhaseDSizeSelectionBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const STABLE = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function blocked(
  code: DxfProductPhaseDSizeSelectionBlockerV1['code'],
  detail: string,
): DxfProductPhaseDSizeSelectionResultV1 {
  return deepFreeze({
    ok: false as const,
    schemaVersion: DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1,
    selection: null,
    pipeline: null,
    phaseD: null,
    blockers: [{ code, detail }] as const,
    claims: BLOCKED_CLAIMS,
  });
}

async function sha256(
  value: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    );
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Derives one exact simulation size without weakening the full multi-size Phase-D binding. This is
 * the missing adapter between a graded product import and current one-size G4F1 fixtures; Phase-E
 * seams/materials remain an independent explicit authority.
 */
export async function selectDxfProductPhaseDSizeV1(
  input: Readonly<{
    scopeKey: string;
    sizeToken: string;
    pieces: readonly PieceSpec[];
    pipeline: DxfPipelineProvenanceStageOutputV1;
    replay: DxfProductPhaseDReplayStageOutputV1;
  }>,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductPhaseDSizeSelectionResultV1> {
  if (
    !input ||
    !STABLE.test(input.scopeKey) ||
    !STABLE.test(input.sizeToken) ||
    !Array.isArray(input.pieces) ||
    !input.pieces.length ||
    !input.replay?.replayReady ||
    !input.replay.carrier ||
    !input.pipeline?.pipelineIntegrated ||
    !input.pipeline.carrier ||
    !input.pipeline.contentBinding
  )
    return blocked('invalid-input', 'Scope, size and successful Phase-D inputs are required.');

  const freshFull = await rehydrateDxfProductPhaseDReplayV1(
    input.replay,
    input.pieces,
    input.pipeline,
    crypto,
  );
  if (!freshFull.replayReady || !freshFull.carrier)
    return blocked(
      'full-phase-d-replay-blocked',
      freshFull.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );

  const selectedPublicPieces = input.pipeline.carrier.pieces.filter(
    ({ sizeToken }) => sizeToken === input.sizeToken,
  );
  const selectedContours = Object.freeze(
    freshFull.carrier.contours.filter(({ sizeToken }) => sizeToken === input.sizeToken),
  );
  if (!selectedPublicPieces.length || !selectedContours.length)
    return blocked('size-selection-empty', 'The requested size has no exact Phase-D contours.');
  const pieceIds = selectedPublicPieces.map(({ pieceId }) => pieceId).sort();
  if (
    new Set(pieceIds).size !== pieceIds.length ||
    selectedPublicPieces.some(
      ({ pieceId }) => !input.pieces.some((piece) => piece.identity === pieceId),
    )
  )
    return blocked(
      'size-selection-ambiguous',
      'The requested size must identify every selected piece exactly once.',
    );

  const selected = bridgeDxfPipelineProvenanceV1(freshFull.carrier.source, selectedContours);
  if (!selected.pipelineIntegrated || !selected.carrier)
    return blocked(
      'selected-phase-d-rebuild-blocked',
      selected.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );
  const binding = await computeDxfPipelineContentBindingV1(
    selected.carrier,
    input.pieces,
    freshFull.carrier.sourceSha256,
    crypto,
  );
  if (!binding.ok) return blocked('selected-phase-d-rebuild-blocked', binding.blocker.detail);
  const selectedPipeline = attachDxfPipelineContentBindingV1(selected, binding.value);
  try {
    if (canonical(selectedPipeline.carrier?.pieces) !== canonical(selectedPublicPieces))
      return blocked(
        'selected-public-carrier-mismatch',
        'Fresh selected carrier does not equal the exact subset of the full public carrier.',
      );
  } catch {
    return blocked('invalid-input', 'Selected Phase-D data is not canonical.');
  }

  const canonicalSha256 = await sha256(
    `dxf-product-phase-d-size-selection-v1\0${canonical({
      scopeKey: input.scopeKey,
      sizeToken: input.sizeToken,
      pieceIds,
      fullSelectedGeometrySha256: input.pipeline.contentBinding.selectedGeometrySha256,
      selectedGeometrySha256: binding.value.selectedGeometrySha256,
    })}`,
    crypto,
  );
  if (!canonicalSha256) return blocked('sha256-unavailable', 'SHA-256 is unavailable.');

  return deepFreeze({
    ok: true as const,
    schemaVersion: DXF_PRODUCT_PHASE_D_SIZE_SELECTION_V1,
    selection: {
      scopeKey: input.scopeKey,
      sizeToken: input.sizeToken,
      pieceIds,
      fullSelectedGeometrySha256: input.pipeline.contentBinding.selectedGeometrySha256,
      selectedGeometrySha256: binding.value.selectedGeometrySha256,
      canonicalSha256,
    },
    pipeline: selectedPipeline,
    phaseD: {
      source: freshFull.carrier.source,
      contours: selectedContours,
      sourceSha256: freshFull.carrier.sourceSha256,
    },
    blockers: [] as const,
    claims: DXF_PRODUCT_PHASE_D_SIZE_SELECTION_CLAIMS_V1,
  });
}
