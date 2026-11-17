import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import {
  getSavedModelDisplayedTriangleBodyLifetimeV2,
  projectSavedModelDisplayedTriangleBodyV2,
  type SavedModelDisplayedTriangleBodyBindingV2,
  type SavedModelDisplayedTriangleBodyOwnerV2,
} from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { sha256Hex } from 'lib/features/sha256';
import { evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1 } from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const DXF_GARMENT_OBSERVED_BODY_INITIAL_PREFLIGHT_V1 =
  'dxf-garment-observed-body-initial-preflight/1' as const;

export type DxfGarmentObservedBodyInitialPreflightRequestV1 = Readonly<{
  schemaVersion: typeof DXF_GARMENT_OBSERVED_BODY_INITIAL_PREFLIGHT_V1;
  placementRequest: DxfGarmentAssemblyExplicitPlacementStageRequestV1;
  bodyOwner: SavedModelDisplayedTriangleBodyOwnerV2;
  bodyBinding: SavedModelDisplayedTriangleBodyBindingV2;
  hostCompileGeneration: number;
  /** Explicit interpretation of the authored transforms; no body-derived transform is applied. */
  coordinateFrame: 'rendered-world-meters';
}>;

const CLAIMS = Object.freeze({
  actualPlacementCompileExecuted: true,
  genuineSavedBodyOwnerConsumed: true,
  freshSavedBodyProjectionBeforeAndAfterDiagnostic: true,
  observedBodyAndPlacedGarmentBytesMeasured: true,
  originalMaterialRestAndMassPreserved: true,
  placementCorrectionApplied: false,
  analyticalCapsulesUsed: false,
  sourcePersistenceAuthenticated: false,
  viewportAuthorityAuthenticated: false,
  persistedModelReaderAuthenticated: false,
  garmentSelfContactQualified: false,
  supportPolicyQualifiedForWear: false,
  runtimeAuthority: false,
  productionReady: false,
  fitClaimed: false,
} as const);
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const REQUEST_KEYS = [
  'schemaVersion',
  'placementRequest',
  'bodyOwner',
  'bodyBinding',
  'hostCompileGeneration',
  'coordinateFrame',
] as const;

class PreflightBlocked extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail);
  }
}
function fail(code: string, detail: string): never {
  throw new PreflightBlocked(code, detail);
}
function data(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') fail('invalid-input', 'Expected a plain data record.');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !('value' in descriptor))
    fail('invalid-input', `${key} must be an own data property.`);
  return descriptor.value;
}
function bindingCopy(value: unknown): SavedModelDisplayedTriangleBodyBindingV2 {
  let visits = 0;
  const copy = (item: unknown, depth: number): unknown => {
    if (++visits > 512 || depth > 8) fail('invalid-input', 'Body binding exceeds its data bound.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string' && item.length <= 16_384) return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype)
      fail('invalid-input', 'Body binding must contain finite plain data.');
    const keys = Reflect.ownKeys(item);
    if (keys.some((key) => typeof key !== 'string'))
      fail('invalid-input', 'Body binding symbols are unsupported.');
    return Object.freeze(
      Object.fromEntries(
        (keys as string[]).sort().map((key) => [key, copy(data(item, key), depth + 1)]),
      ),
    );
  };
  return copy(value, 0) as SavedModelDisplayedTriangleBodyBindingV2;
}

/**
 * Executes the actual multi-piece compile/explicit placement and exact observed-body diagnostic.
 * The result is detached historical evidence, never a runtime capability or saved DXF authority.
 * The caller owns the borrowed body and the garment generation's cancellation signal.
 */
export async function evaluateDxfGarmentObservedBodyInitialPreflightV1(
  input: unknown,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const unsubscribe: (() => void)[] = [];
  let stage = 'capture';
  const check = () => {
    if (nativeAborted.call(controller.signal) || (signal && nativeAborted.call(signal)))
      fail('cancelled', 'The garment generation or observed body was revoked.');
  };
  const link = (source: AbortSignal) => {
    if (nativeAborted.call(source)) controller.abort();
    const abort = () => controller.abort();
    nativeAdd.call(source, 'abort', abort, { once: true });
    unsubscribe.push(() => nativeRemove.call(source, 'abort', abort));
  };
  // A child cancellation must not revoke the borrowed saved-body owner. Its genuine projector
  // keeps checking its own lifetime; observe any late completion while stopping this consumer.
  const waitLocally = <T>(work: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () =>
        reject(new PreflightBlocked('cancelled', 'This preflight was cancelled.'));
      nativeAdd.call(controller.signal, 'abort', abort, { once: true });
      work.then(
        (value) => {
          nativeRemove.call(controller.signal, 'abort', abort);
          resolve(value);
        },
        (error: unknown) => {
          nativeRemove.call(controller.signal, 'abort', abort);
          reject(error);
        },
      );
      if (nativeAborted.call(controller.signal)) abort();
    });
  try {
    check();
    if (
      !input ||
      typeof input !== 'object' ||
      Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).length !== REQUEST_KEYS.length ||
      REQUEST_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(input, key))
    )
      fail('invalid-input', 'Exactly the versioned preflight request fields are required.');
    const request = Object.fromEntries(REQUEST_KEYS.map((key) => [key, data(input, key)]));
    if (
      request.schemaVersion !== DXF_GARMENT_OBSERVED_BODY_INITIAL_PREFLIGHT_V1 ||
      request.coordinateFrame !== 'rendered-world-meters' ||
      !Number.isSafeInteger(request.hostCompileGeneration) ||
      (request.hostCompileGeneration as number) < 1
    )
      fail(
        'invalid-input',
        'A positive generation and explicit rendered-world metre frame are required.',
      );
    const binding = bindingCopy(request.bodyBinding);
    const owner = request.bodyOwner as SavedModelDisplayedTriangleBodyOwnerV2;
    const lifetime = getSavedModelDisplayedTriangleBodyLifetimeV2(owner, binding);
    if (!lifetime)
      fail('body-unavailable', 'The genuine body owner and exact binding must be current.');
    if (signal) link(signal);
    link(lifetime);
    check();
    stage = 'placement-and-body';
    // Placement snapshots the complete source DTO synchronously before its first await.
    const placementWork = buildDxfGarmentAssemblyExplicitPlacementStageV1(
      request.placementRequest,
      controller.signal,
    );
    const [placement, body] = await Promise.all([
      placementWork,
      waitLocally(projectSavedModelDisplayedTriangleBodyV2(owner, binding)),
    ]);
    check();
    if (!placement.ok)
      fail(
        'placement-blocked',
        placement.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (body.status !== 'projected')
      fail(
        'body-unavailable',
        body.status === 'blocked' ? body.detail : 'Fresh body projection required.',
      );
    const simulation = placement.artifact.placedSimulation;
    const positions = new Float32Array(simulation.manifest.particleCount * 3);
    for (let i = 0; i < simulation.manifest.particleCount; i++)
      for (let axis = 0; axis < 3; axis++)
        positions[i * 3 + axis] = simulation.mesh.restPositionsInvMass[i * 4 + axis];
    const positionsSha256 = await sha256Hex(positions.buffer);
    check();
    if (!positionsSha256)
      fail('sha256-unavailable', 'Exact placed XYZ must have a SHA-256 digest.');
    stage = 'body-diagnostic';
    const diagnostic = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1({
      binding: {
        compositionGeneration: request.hostCompileGeneration as number,
        snapshotGeneration: binding.generation,
        modelId: binding.displayedIdentity.modelId,
        modelContentRevision: binding.displayedIdentity.modelContentRevision,
        inputFingerprint: binding.displayedIdentity.inputFingerprint,
        canonicalContentFingerprint: binding.canonicalContentFingerprint,
        basisKind: binding.displayedIdentity.basisKind,
        posePresetId: 'accepted-pose;sha256=' + binding.poseDocumentSha256,
        bodySourceRevision:
          'saved-model-host-observed-body/v2;sha256=' + binding.observedBodyContentSha256,
        garmentPositionsSha256: positionsSha256,
      },
      bodyPositionsM: body.snapshot.bodyPositionsM,
      bodyTriangles: body.snapshot.bodyTriangles,
      garmentPositionsM: positions,
      garmentTriangles: simulation.mesh.triangles,
      garmentUniformScale: 1,
      garmentTranslationM: [0, 0, 0],
    });
    check();
    stage = 'fresh-body-readback';
    const current = await waitLocally(projectSavedModelDisplayedTriangleBodyV2(owner, binding));
    check();
    if (current.status !== 'projected')
      fail('body-became-stale', 'The observed body changed during the diagnostic.');
    const bodyClear =
      diagnostic.status === 'signed-clearance-measured' &&
      diagnostic.blockers.length === 0 &&
      diagnostic.clearance.penetratingVertexCount === 0 &&
      diagnostic.clearance.unsafeVertexCount === 0 &&
      diagnostic.clearance.ambiguousSignVertexCount === 0 &&
      diagnostic.intersections.bodySelfIntersectionCount === 0 &&
      diagnostic.intersections.bodyGarmentTriangleIntersectionCount === 0;
    return Object.freeze({
      ok: bodyClear,
      evaluated: true as const,
      bodyClear,
      artifact: Object.freeze({
        placement: placement.artifact,
        body: current.snapshot,
        diagnostic,
        garmentPositionsSha256: positionsSha256,
        coordinateFrame: 'rendered-world-meters' as const,
      }),
      blockers: bodyClear
        ? []
        : [
            {
              stage: 'body-diagnostic',
              code: 'body-clearance-blocked',
              detail:
                'Exact body clearance or topology/intersection checks refused this explicit placement.',
            },
          ],
      claims: CLAIMS,
    });
  } catch (error) {
    return Object.freeze({
      ok: false as const,
      evaluated: false as const,
      bodyClear: false as const,
      artifact: null,
      blockers: [
        {
          stage,
          code: error instanceof PreflightBlocked ? error.code : 'preflight-rejected',
          detail: error instanceof Error ? error.message : 'Initial preflight rejected.',
        },
      ],
      claims: Object.freeze({
        ...CLAIMS,
        actualPlacementCompileExecuted: false,
        genuineSavedBodyOwnerConsumed: false,
        freshSavedBodyProjectionBeforeAndAfterDiagnostic: false,
        observedBodyAndPlacedGarmentBytesMeasured: false,
        originalMaterialRestAndMassPreserved: false,
      }),
    });
  } finally {
    unsubscribe.forEach((remove) => remove());
  }
}

export type DxfGarmentObservedBodyInitialPreflightResultV1 = Awaited<
  ReturnType<typeof evaluateDxfGarmentObservedBodyInitialPreflightV1>
>;
