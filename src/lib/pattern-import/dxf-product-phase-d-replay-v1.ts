import {
  type DxfPieceSpecContourBoundaryV1,
  type DxfPieceSpecProvenanceSourceV1,
} from './dxf-piece-spec-provenance-bridge-v1';
import {
  attachDxfPipelineContentBindingV1,
  bridgeDxfPipelineProvenanceV1,
  computeDxfPipelineContentBindingV1,
  dxfPipelineBlockerV1,
  type DxfPipelineProvenanceBlockerV1,
  type DxfPipelineProvenanceStageOutputV1,
} from './dxf-pipeline-provenance-v1';
import type { PieceSpec } from './types';

export const DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1 =
  'dxf-product-phase-d-replay-request/1' as const;
export const DXF_PRODUCT_PHASE_D_REPLAY_V1 = 'dxf-product-phase-d-replay/1' as const;

export type DxfProductPhaseDReplayRequestV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1;
}>;

export type DxfProductPhaseDReplayCarrierV1 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_PHASE_D_REPLAY_V1;
  source: DxfPieceSpecProvenanceSourceV1;
  contours: readonly DxfPieceSpecContourBoundaryV1[];
  sourceSha256: string;
  sourceFileId: string;
  selectedGeometrySha256: string;
  includesRawDxf: false;
  includesTags: false;
  includesAst: false;
  productionReady: false;
}>;

export const DXF_PRODUCT_PHASE_D_REPLAY_CLAIMS_V1 = Object.freeze({
  exactPhaseCSourceRetained: true,
  exactProjectedContoursRetained: true,
  freshPublicCarrierRebuilt: true,
  publicContentBindingExactMatched: true,
  rawDxfRetained: false,
  g4f1V2InputComplete: false,
  phaseEAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  exactPhaseCSourceRetained: false as const,
  exactProjectedContoursRetained: false as const,
  freshPublicCarrierRebuilt: false as const,
  publicContentBindingExactMatched: false as const,
  rawDxfRetained: false as const,
  g4f1V2InputComplete: false as const,
  phaseEAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export type DxfProductPhaseDReplayStageOutputV1 =
  | Readonly<{
      schemaVersion: typeof DXF_PRODUCT_PHASE_D_REPLAY_V1;
      replayReady: true;
      carrier: DxfProductPhaseDReplayCarrierV1;
      blockers: readonly [];
      claims: typeof DXF_PRODUCT_PHASE_D_REPLAY_CLAIMS_V1;
    }>
  | Readonly<{
      schemaVersion: typeof DXF_PRODUCT_PHASE_D_REPLAY_V1;
      replayReady: false;
      carrier: null;
      blockers: readonly DxfPipelineProvenanceBlockerV1[];
      claims: typeof BLOCKED_CLAIMS;
    }>;

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
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('non-data value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

export function blockedDxfProductPhaseDReplayV1(
  blockers: readonly DxfPipelineProvenanceBlockerV1[],
): DxfProductPhaseDReplayStageOutputV1 {
  return deepFreeze({
    schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_V1,
    replayReady: false as const,
    carrier: null,
    blockers: blockers.length
      ? [...blockers]
      : [
          dxfPipelineBlockerV1(
            'clone-contract-invalid',
            'Phase-D replay failed without a blocker.',
          ),
        ],
    claims: BLOCKED_CLAIMS,
  });
}

let requestClaimed = false;

export function validateDxfProductPhaseDReplayRequestV1(
  value: unknown,
): DxfPipelineProvenanceBlockerV1 | null {
  if (requestClaimed)
    return dxfPipelineBlockerV1('invalid-input', 'reentrant Phase-D replay request was refused.');
  requestClaimed = true;
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError();
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const schema = descriptors.schemaVersion;
    if (
      keys.length !== 1 ||
      keys[0] !== 'schemaVersion' ||
      !schema ||
      !schema.enumerable ||
      !Object.prototype.hasOwnProperty.call(schema, 'value') ||
      schema.value !== DXF_PRODUCT_PHASE_D_REPLAY_REQUEST_V1
    )
      throw new TypeError();
    return null;
  } catch {
    return dxfPipelineBlockerV1(
      'invalid-input',
      'Phase-D replay request must be an exact descriptor-safe V1 record.',
    );
  } finally {
    requestClaimed = false;
  }
}

/**
 * Detaches only the source/contour data G4F1 V2 must fresh-replay. The existing public Phase-D
 * output remains unchanged and path-id-free; this separate opt-in carrier is accepted only after a
 * fresh public rebuild exact-matches its content binding.
 */
export async function buildDxfProductPhaseDReplayV1(
  source: DxfPieceSpecProvenanceSourceV1,
  contours: readonly DxfPieceSpecContourBoundaryV1[],
  pieces: readonly PieceSpec[],
  expected: DxfPipelineProvenanceStageOutputV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductPhaseDReplayStageOutputV1> {
  if (
    !expected.pipelineIntegrated ||
    !expected.carrier ||
    !expected.contentBinding ||
    expected.blockers.length
  )
    return blockedDxfProductPhaseDReplayV1([
      dxfPipelineBlockerV1(
        'clone-contract-invalid',
        'A successful content-bound public Phase-D result is required before replay export.',
      ),
    ]);

  const fresh = bridgeDxfPipelineProvenanceV1(source, contours);
  if (!fresh.pipelineIntegrated || !fresh.carrier)
    return blockedDxfProductPhaseDReplayV1(fresh.blockers);
  const binding = await computeDxfPipelineContentBindingV1(
    fresh.carrier,
    pieces,
    expected.contentBinding.sourceSha256,
    crypto,
  );
  if (!binding.ok) return blockedDxfProductPhaseDReplayV1([binding.blocker]);
  const rebound = attachDxfPipelineContentBindingV1(fresh, binding.value);
  try {
    if (canonical(rebound) !== canonical(expected))
      return blockedDxfProductPhaseDReplayV1([
        dxfPipelineBlockerV1(
          'clone-contract-invalid',
          'Fresh Phase-D replay does not exact-match the retained public content binding.',
        ),
      ]);
  } catch {
    return blockedDxfProductPhaseDReplayV1([
      dxfPipelineBlockerV1('clone-contract-invalid', 'Phase-D replay contains non-canonical data.'),
    ]);
  }

  try {
    const detached = structuredClone({ source, contours });
    const carrier = deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_V1,
      source: detached.source,
      contours: detached.contours,
      sourceSha256: expected.contentBinding.sourceSha256,
      sourceFileId: expected.contentBinding.sourceFileId,
      selectedGeometrySha256: expected.contentBinding.selectedGeometrySha256,
      includesRawDxf: false as const,
      includesTags: false as const,
      includesAst: false as const,
      productionReady: false as const,
    });
    return deepFreeze({
      schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_V1,
      replayReady: true as const,
      carrier,
      blockers: [] as const,
      claims: DXF_PRODUCT_PHASE_D_REPLAY_CLAIMS_V1,
    });
  } catch {
    return blockedDxfProductPhaseDReplayV1([
      dxfPipelineBlockerV1(
        'clone-contract-invalid',
        'Phase-D replay inputs could not be detached through structured clone.',
      ),
    ]);
  }
}

function exactTransportRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    return false;
  return keys.every((key) => {
    const descriptor = descriptors[key];
    return (
      !!descriptor &&
      descriptor.enumerable &&
      Object.prototype.hasOwnProperty.call(descriptor, 'value')
    );
  });
}

/**
 * A worker/postMessage structured clone keeps exact data but intentionally drops local freeze
 * descriptors. Re-own and freeze that data only after the normal fresh Phase-D rebuild proves the
 * complete source, contours, public carrier and content binding still exact-match.
 */
export async function rehydrateDxfProductPhaseDReplayV1(
  value: unknown,
  pieces: readonly PieceSpec[],
  expected: DxfPipelineProvenanceStageOutputV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<DxfProductPhaseDReplayStageOutputV1> {
  try {
    const detached = structuredClone(value) as DxfProductPhaseDReplayStageOutputV1;
    if (
      !exactTransportRecord(detached, [
        'schemaVersion',
        'replayReady',
        'carrier',
        'blockers',
        'claims',
      ]) ||
      detached.schemaVersion !== DXF_PRODUCT_PHASE_D_REPLAY_V1 ||
      !detached.replayReady ||
      !detached.carrier ||
      !Array.isArray(detached.blockers) ||
      detached.blockers.length !== 0 ||
      !exactTransportRecord(detached.claims, Object.keys(DXF_PRODUCT_PHASE_D_REPLAY_CLAIMS_V1)) ||
      !exactTransportRecord(detached.carrier, [
        'schemaVersion',
        'source',
        'contours',
        'sourceSha256',
        'sourceFileId',
        'selectedGeometrySha256',
        'includesRawDxf',
        'includesTags',
        'includesAst',
        'productionReady',
      ])
    )
      throw new TypeError('invalid Phase-D transport record');

    const transportedCanonical = canonical(detached);
    const source = deepFreeze(detached.carrier.source);
    const contours = deepFreeze(detached.carrier.contours);
    const rebuilt = await buildDxfProductPhaseDReplayV1(source, contours, pieces, expected, crypto);
    if (!rebuilt.replayReady || !rebuilt.carrier) return rebuilt;
    if (canonical(rebuilt) !== transportedCanonical)
      return blockedDxfProductPhaseDReplayV1([
        dxfPipelineBlockerV1(
          'clone-contract-invalid',
          'Rehydrated Phase-D replay does not exact-match its transported carrier.',
        ),
      ]);
    return rebuilt;
  } catch {
    return blockedDxfProductPhaseDReplayV1([
      dxfPipelineBlockerV1(
        'clone-contract-invalid',
        'Phase-D replay transport is not an exact descriptor-safe clone.',
      ),
    ]);
  }
}
