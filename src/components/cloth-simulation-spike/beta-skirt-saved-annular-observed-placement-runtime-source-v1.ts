import { sha256Hex } from 'lib/features/sha256';
import {
  getPatternImportDxfProductSavedAnnularObservedPlacementGarmentLifetimeV1 as garmentLifetime,
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1 as projectGarment,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1 as pairLifetime,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1 as projectPair,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import {
  BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1 as WORLD,
  buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1 as replayWorld,
  disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1 as disposeWorld,
  getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1 as worldLifetime,
  projectBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1 as projectWorld,
} from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';

export const BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1 =
  'beta-skirt-saved-annular-observed-placement-runtime-source/1' as const;
type Garment = NonNullable<Awaited<ReturnType<typeof projectGarment>>>;
type Pair = NonNullable<Awaited<ReturnType<typeof projectPair>>>;
type World = NonNullable<Awaited<ReturnType<typeof projectWorld>>>;
export type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceRequestV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1;
  garmentOwner: unknown;
  pairOwner: unknown;
  worldInitialOwner: unknown;
  expected: Readonly<{
    garmentReportSha256: string;
    pairReportSha256: string;
    worldReportSha256: string;
  }>;
}>;
export type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1;
  sourceKind: 'saved-annular-observed-placement-v3';
  status: 'diagnostic-source-ready' | 'diagnostic-source-blocked';
  bindings: Readonly<{
    garmentReportSha256: string;
    pairReportSha256: string;
    worldReportSha256: string;
    observedTargetSha256: string;
    normalizedV5AggregateSha256: string;
    localRestPositionsInvMassKgSha256: string;
    worldPositionsInvMassKgSha256: string;
    sourcePositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    bodyPositions3MSha256: string;
    bodyTrianglesSha256: string;
  }>;
  hostCompileBinding: Pair['report']['hostCompileBinding'];
  counts: World['report']['counts'];
  gates: Readonly<{
    persistedObservedTargetMatched: boolean;
    sectionClear: boolean;
    exactBodyContactClear: boolean;
    signedContactSetEmpty: boolean;
    worldInitialClear: boolean;
    fixedActualBodyWorkload: boolean;
    independentWorldReplayMatched: boolean;
  }>;
  upstreamPair: Pair['report'];
  upstreamWorld: World['report'];
  blockers: readonly string[];
  claims: Readonly<{
    diagnosticGpuInputQualified: boolean;
    immutableLocalV5RestRetained: true;
    worldPinAndRollbackAnchorsSeparate: true;
    borrowedParentsDisposed: false;
    hostCompileGenerationAuthenticatedBySource: false;
    viewportAuthorityAuthenticated: false;
    framesExecuted: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  reportSha256: string;
}>;
declare const brand: unique symbol;
export type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceOwnerV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1;
  readonly [brand]: true;
}>;
export type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceProjectionV1 = Readonly<{
  report: BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1;
  normalizedV5: World['normalizedV5'];
  initialWorldPositionsInvMassKg: Float32Array;
  normalizedTriangles: Uint32Array;
  assemblyOrderSeamPairs: Uint32Array;
  waistPinVertexIndices: Uint32Array;
  collisionInput: Pair['collisionInput'];
  callerOwnedMutableCopies: true;
}>;
export type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtSavedAnnularObservedPlacementRuntimeSourceOwnerV1;
      report: BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      code: string;
      detail: string;
      report?: BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1;
    }>;
type Request = BetaSkirtSavedAnnularObservedPlacementRuntimeSourceRequestV1;
type Report = BetaSkirtSavedAnnularObservedPlacementRuntimeSourceReportV1;
type Projection = BetaSkirtSavedAnnularObservedPlacementRuntimeSourceProjectionV1;
type Work = {
  request: Request;
  owner: object | null;
  parents: readonly AbortSignal[];
  controller: AbortController;
  unlink: () => void;
  disposed: boolean;
  report: Report | null;
  retained: Projection | null;
};
const owners = new WeakMap<object, Work>();
const clone = structuredClone;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;
const aborted = (signal: AbortSignal) => Reflect.apply(nativeAborted, signal, []) as boolean;
const error = (detail: string): never => {
  throw new Error(detail);
};
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return error('An exact plain request is required.');
  const ds = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(ds).length !== keys.length) return error('Unexpected request fields.');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const d = ds[key];
    if (!d?.enumerable || !('value' in d)) return error('Own request data fields are required.');
    result[key] = d.value;
  }
  return result;
}
function captureRequest(value: unknown): Request {
  const r = record(value, [
    'schemaVersion',
    'garmentOwner',
    'pairOwner',
    'worldInitialOwner',
    'expected',
  ]);
  if (r.schemaVersion !== BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1)
    return error('Unsupported observed runtime-source version.');
  const expected = record(r.expected, [
    'garmentReportSha256',
    'pairReportSha256',
    'worldReportSha256',
  ]);
  for (const value of Object.values(expected))
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
      return error('Exact expected SHA-256 is required.');
  return { ...r, expected: { ...expected } } as Request;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function destroy(work: Work): void {
  if (work.disposed) return;
  work.disposed = true;
  if (work.owner) owners.delete(work.owner);
  work.owner = null;
  work.controller.abort();
  work.unlink();
  work.unlink = () => undefined;
  if (work.retained) {
    work.retained.initialWorldPositionsInvMassKg.fill(0);
    work.retained.collisionInput.bodyPositionsM.fill(0);
    work.retained.collisionInput.bodyTriangles.fill(0);
    work.retained.collisionInput.garmentPositionsM.fill(0);
    work.retained.collisionInput.garmentTriangles.fill(0);
  }
  work.retained = null;
}
function parentSignals(r: Request): readonly AbortSignal[] {
  const lives = [
    garmentLifetime(r.garmentOwner),
    pairLifetime(r.pairOwner),
    worldLifetime(r.worldInitialOwner),
  ];
  if (lives.some((life) => !life || aborted(life)))
    return error('A genuine current garment/pair/world owner is required.');
  return lives as AbortSignal[];
}
function current(work: Work): void {
  if (work.disposed || aborted(work.controller.signal))
    return error('Observed runtime source was revoked.');
  const parents = parentSignals(work.request);
  if (
    parents.some((p, i) => p !== work.parents[i]) ||
    work.disposed ||
    aborted(work.controller.signal) ||
    parents.some(aborted)
  )
    return error('Observed runtime source parent changed or was revoked.');
}
function waitLocal<T>(read: Promise<T>, signal: AbortSignal): Promise<T> {
  if (aborted(signal)) {
    void read.catch(() => undefined);
    return Promise.reject(new Error('Observed runtime read cancelled.'));
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      remove.call(signal, 'abort', cancel);
      fn();
    };
    const cancel = () => finish(() => reject(new Error('Observed runtime read cancelled.')));
    add.call(signal, 'abort', cancel, { once: true });
    if (aborted(signal)) cancel();
    read.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
  });
}
async function fresh(work: Work): Promise<{ garment: Garment; pair: Pair; world: World }> {
  current(work);
  const garment = await waitLocal(
    projectGarment(work.request.garmentOwner),
    work.controller.signal,
  );
  current(work);
  const pair = await waitLocal(projectPair(work.request.pairOwner), work.controller.signal);
  current(work);
  const world = await waitLocal(
    projectWorld(work.request.worldInitialOwner),
    work.controller.signal,
  );
  current(work);
  if (!garment || !pair || !world) return error('A borrowed source is no longer current.');
  const e = work.request.expected;
  if (
    garment.report.canonicalSha256 !== e.garmentReportSha256 ||
    pair.report.reportSha256 !== e.pairReportSha256 ||
    world.report.reportSha256 !== e.worldReportSha256 ||
    world.report.bindings.garmentReportSha256 !== e.garmentReportSha256 ||
    world.report.bindings.pairReportSha256 !== e.pairReportSha256 ||
    pair.report.source.garmentReportSha256 !== e.garmentReportSha256 ||
    JSON.stringify(world.report.upstreamPair) !== JSON.stringify(pair.report)
  )
    return error('Exact source/pair/world receipts disagree.');
  return { garment, pair, world };
}
async function hash(work: Work, data: ArrayBufferView | string): Promise<string> {
  current(work);
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  const digest = await sha256Hex(bytes);
  current(work);
  return digest;
}
function gates(pair: Pair, world: World) {
  const p = pair.report,
    w = world.report,
    c = p.collisionReport,
    s = p.signedRefresh;
  return {
    persistedObservedTargetMatched:
      p.source.persistedTargetDisposition === 'fresh-observed-target-matched' &&
      w.claims.persistedObservedTargetMatched &&
      p.source.observedTarget.canonicalSha256.length === 64,
    sectionClear:
      p.sectionCompatibility.ok &&
      p.sectionCompatibility.status === 'compatible-with-authored-clearance' &&
      p.sectionCompatibility.summary.initialClearanceQualified &&
      p.sectionCompatibility.summary.sizeCompatibleWithinStretchBudget,
    exactBodyContactClear:
      !!c &&
      !p.collisionFailure &&
      c.status === 'signed-clearance-measured' &&
      c.claims.signedClassificationDefensible &&
      c.intersections.bodySelfIntersectionCount === 0 &&
      c.intersections.bodyGarmentTriangleIntersectionCount === 0 &&
      c.clearance.penetratingVertexCount === 0 &&
      c.clearance.unsafeVertexCount === 0 &&
      c.clearance.ambiguousSignVertexCount === 0 &&
      c.clearance.minimumSignedClearanceM !== null &&
      c.clearance.minimumSignedClearanceM >= c.clearance.unsafeClearanceMarginM &&
      c.binding.garmentPositionsSha256 === w.bindings.worldPositionsFloat32LeSha256,
    signedContactSetEmpty:
      !!s &&
      !p.signedRefreshFailure &&
      s.contacts.length === 0 &&
      s.receipt.counts.contactCount === 0 &&
      s.receipt.terminal.collisionReportSha256 === p.collisionReportSha256 &&
      s.receipt.terminal.collisionInputSha256 === c?.contentFingerprintSha256 &&
      s.receipt.geometry.candidatePositionsSha256 === w.bindings.worldPositionsFloat32LeSha256 &&
      s.receipt.counts.penetratingVertexCount === 0 &&
      s.receipt.counts.unsafeVertexCount === 0 &&
      s.receipt.counts.ambiguousSignVertexCount === 0,
    worldInitialClear:
      w.worldInitialChecksPassed &&
      ('boundedRadialInitialization' in p.candidate
        ? w.rigidPlacement === null &&
          !!w.boundedRadialPlacement?.float32RecipeReplayedByteExactly &&
          w.boundedRadialPlacement.recipe.passed &&
          p.candidate.boundedRadialInitialization.passed &&
          JSON.stringify(w.boundedRadialPlacement.recipe) ===
            JSON.stringify(p.candidate.boundedRadialInitialization)
        : w.rigidPlacement?.float32TranslationReplayedByteExactly === true &&
          !w.boundedRadialPlacement) &&
      w.selfIntersection.passed &&
      w.selfIntersection.exactRawExcludedResidualAccounting &&
      w.selfIntersection.residualBlockingCount === 0 &&
      w.selfIntersection.excludedConfinedAuthenticatedAoSeamCount === 182 &&
      w.selfIntersection.oracle?.intersectionCount === 182 &&
      w.orientation.passed &&
      w.orientation.normalReversalCount === 0 &&
      w.orientation.candidateDegenerateTriangleCount === 0 &&
      w.envelope?.blockers.length === 0 &&
      w.physicalState.maximumWorldSeamGapM === 0 &&
      w.physicalState.localPackageSealValidated &&
      w.physicalState.localRestAndMaterialUnchanged,
    fixedActualBodyWorkload:
      pair.collisionInput.bodyPositionsM.length === 13_380 * 3 &&
      pair.collisionInput.bodyTriangles.length === 26_756 * 3,
    independentWorldReplayMatched: false,
  };
}

/** Strict diagnostic GPU admission. A blocked physical report is retained, but never gets an owner. */
export async function buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(
  value: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularObservedPlacementRuntimeSourceResultV1> {
  let work: Work | null = null;
  let published = false;
  try {
    if (signal !== undefined && aborted(signal)) return error('Runtime-source build cancelled.');
    const request = captureRequest(value);
    const parents = parentSignals(request);
    work = {
      request,
      owner: null,
      parents,
      controller: new AbortController(),
      unlink: () => undefined,
      disposed: false,
      report: null,
      retained: null,
    };
    const state = work;
    const links = [...parents, ...(signal ? [signal] : [])];
    const attached: AbortSignal[] = [];
    const cancel = () => destroy(state);
    state.unlink = () => {
      for (const parent of attached) remove.call(parent, 'abort', cancel);
      attached.length = 0;
    };
    for (const parent of links) {
      add.call(parent, 'abort', cancel, { once: true });
      attached.push(parent);
    }
    if (links.some(aborted)) destroy(state);
    const sources = await fresh(state);
    current(state);
    const { pair, world } = sources;
    const checks = gates(pair, world);
    // Only these two historical diagnostic blockers have explicit independent discharge paths.
    const permitted = new Set([
      'garment-self-contact-requires-seam-aware-admission',
      'solver-source-admission-not-issued',
    ]);
    const blockers = [
      ...new Set([
        ...world.report.blockers.filter((b) => !permitted.has(b)),
        ...Object.entries(checks)
          .filter(([k, v]) => k !== 'independentWorldReplayMatched' && !v)
          .map(([k]) => 'observed-runtime-' + k + '-not-qualified'),
      ]),
    ];
    if (blockers.length === 0) {
      // Independently execute the SAME genuine world validator/kernel, without duplicating policy.
      const replay = await replayWorld(
        {
          schemaVersion: WORLD,
          savedAnnularObservedPlacementGarmentOwner: request.garmentOwner,
          observedPairOwner: request.pairOwner,
          expected: {
            garmentReportSha256: request.expected.garmentReportSha256,
            pairReportSha256: request.expected.pairReportSha256,
          },
        },
        state.controller.signal,
      );
      try {
        current(state);
        checks.independentWorldReplayMatched =
          replay.ok && replay.report.reportSha256 === world.report.reportSha256;
        if (!checks.independentWorldReplayMatched)
          blockers.push('independent-world-replay-mismatch');
      } finally {
        if (replay.ok) disposeWorld(replay.owner);
      }
    }
    const binding = world.report.bindings;
    const [localRest, worldPhysical, bodyPositions, bodyTriangles] = await Promise.all([
      hash(state, world.normalizedV5.simulation.mesh.restPositionsInvMass),
      hash(state, world.initialWorldPositionsInvMassKg),
      hash(state, pair.collisionInput.bodyPositionsM),
      hash(state, pair.collisionInput.bodyTriangles),
    ]);
    current(state);
    if (
      localRest !== binding.localPhysicalPositionsInvMassKgFloat32LeSha256 ||
      worldPhysical !== binding.worldPhysicalPositionsInvMassKgFloat32LeSha256 ||
      bodyPositions !== pair.report.bodyBinding.rawBodyPositionsFloat32LeSha256 ||
      bodyTriangles !== pair.report.bodyBinding.rawBodyTrianglesUint32LeSha256
    )
      return error('Independent local/world/body bytes differ from source receipts.');
    await fresh(state);
    current(state);
    const payload = {
      version: BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1,
      sourceKind: 'saved-annular-observed-placement-v3' as const,
      status: blockers.length
        ? ('diagnostic-source-blocked' as const)
        : ('diagnostic-source-ready' as const),
      bindings: {
        ...request.expected,
        observedTargetSha256: pair.report.source.observedTarget.canonicalSha256,
        normalizedV5AggregateSha256: binding.normalizedV5AggregateSha256,
        localRestPositionsInvMassKgSha256: localRest,
        worldPositionsInvMassKgSha256: worldPhysical,
        sourcePositions3MSha256: binding.worldPositionsFloat32LeSha256,
        normalizedTopologySha256: binding.normalizedTopologyUint32LeSha256,
        seamPairsSha256: binding.assemblyOrderSeamsUint32LeSha256,
        pinnedVertexIndicesSha256: binding.waistPinsUint32LeSha256,
        bodyPositions3MSha256: bodyPositions,
        bodyTrianglesSha256: bodyTriangles,
      },
      hostCompileBinding: pair.report.hostCompileBinding,
      counts: world.report.counts,
      gates: checks,
      upstreamPair: pair.report,
      upstreamWorld: world.report,
      blockers,
      claims: {
        diagnosticGpuInputQualified: blockers.length === 0,
        immutableLocalV5RestRetained: true as const,
        worldPinAndRollbackAnchorsSeparate: true as const,
        borrowedParentsDisposed: false as const,
        hostCompileGenerationAuthenticatedBySource: false as const,
        viewportAuthorityAuthenticated: false as const,
        framesExecuted: false as const,
        runtimeAuthority: false as const,
        fitAuthority: false as const,
        productionAuthority: false as const,
      },
    };
    const reportSha256 = await hash(state, JSON.stringify([payload.version, payload]));
    await fresh(state);
    current(state);
    const report: Report = freeze(clone({ ...payload, reportSha256 }));
    if (blockers.length)
      return Object.freeze({
        ok: false,
        owner: null,
        code: 'source-physical-gate-blocked',
        detail: blockers.join('; '),
        report,
      });
    state.report = report;
    state.retained = {
      report,
      normalizedV5: clone(world.normalizedV5),
      initialWorldPositionsInvMassKg: world.initialWorldPositionsInvMassKg.slice(),
      normalizedTriangles: world.normalizedTriangles.slice(),
      assemblyOrderSeamPairs: world.assemblyOrderSeamPairs.slice(),
      waistPinVertexIndices: world.waistPinVertexIndices.slice(),
      collisionInput: clone(pair.collisionInput),
      callerOwnedMutableCopies: true,
    };
    current(state);
    const owner = Object.freeze({
      version: BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1,
    }) as BetaSkirtSavedAnnularObservedPlacementRuntimeSourceOwnerV1;
    state.owner = owner;
    owners.set(owner, state);
    published = true;
    return Object.freeze({ ok: true, owner, report });
  } catch (e) {
    return Object.freeze({
      ok: false,
      owner: null,
      code: 'source-binding-unavailable',
      detail: e instanceof Error ? e.message : 'Observed runtime source rejected.',
    });
  } finally {
    if (work && !published) destroy(work);
  }
}
export async function projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<Projection | null> {
  if (signal !== undefined) {
    try {
      if (aborted(signal)) return null;
    } catch {
      return null;
    }
  }
  const work = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!work) return null;
  try {
    const pending = fresh(work).catch((error) => {
      // A real late source failure still revokes this source even if its caller stopped waiting.
      destroy(work);
      throw error;
    });
    await (signal ? waitLocal(pending, signal) : pending);
    current(work);
    if (signal !== undefined && aborted(signal)) return null;
    return work.retained ? clone(work.retained) : null;
  } catch {
    if (!signal || !aborted(signal)) destroy(work);
    return null;
  }
}
export function getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  const work = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!work) return null;
  try {
    current(work);
    return work.controller.signal;
  } catch {
    destroy(work);
    return null;
  }
}
export function disposeBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1(
  owner: unknown,
): boolean {
  const work = owner && typeof owner === 'object' ? owners.get(owner) : undefined;
  if (!work || work.disposed) return false;
  owners.delete(owner as object);
  destroy(work);
  return true;
}
