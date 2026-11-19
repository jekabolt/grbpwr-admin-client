import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createThreePanelDxfMaterialCompileFixtureV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import {
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelDisplayedTriangleBodyV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import {
  DXF_GARMENT_OBSERVED_BODY_INITIAL_PREFLIGHT_V1,
  evaluateDxfGarmentObservedBodyInitialPreflightV1,
  type DxfGarmentObservedBodyInitialPreflightRequestV1,
} from './dxf-garment-observed-body-initial-preflight-v1';

/** Real DXF/compile/placement/body registries and collision evaluator; synthetic cube observation
 * and model reader. This suite does not qualify a real mannequin viewport or backend storage. */
describe('generic placed garment paired with the exact current observed body', () => {
  let placementRequest: DxfGarmentAssemblyExplicitPlacementStageRequestV1;
  const cleanup: (() => void)[] = [];
  beforeAll(async () => {
    const fixture = await createThreePanelDxfMaterialCompileFixtureV1();
    const source = await compileDxfGarmentAssemblyMaterialStageV1(fixture.request);
    if (!source.ok) throw new Error(JSON.stringify(source.blockers));
    placementRequest = {
      schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
      sourceRequest: fixture.request,
      sourceArtifact: source.artifact,
      expectedSourceInputSha256: source.artifact.sourceEvidence.inputSha256,
      placements: ['panel-a', 'panel-b', 'panel-c'].map((pieceId) => ({
        pieceId,
        sourceOriginM: [0, 0, 0],
        rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        translationM: [1, 0.5, 0],
      })),
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup.splice(0).forEach((dispose) => dispose());
  });
  async function fixture() {
    const body = await createObservedPlacementPairCubeBodyFixtureV1();
    cleanup.push(body.dispose);
    const request: DxfGarmentObservedBodyInitialPreflightRequestV1 = {
      schemaVersion: DXF_GARMENT_OBSERVED_BODY_INITIAL_PREFLIGHT_V1,
      placementRequest: structuredClone(placementRequest),
      bodyOwner: body.bodyOwner,
      bodyBinding: body.binding,
      hostCompileGeneration: 7,
      coordinateFrame: 'rendered-world-meters',
    };
    return { body, request };
  }
  it('executes actual three-piece placement and exact body diagnostics without altering initial geometry or material rest', async () => {
    const { body, request } = await fixture();
    const result = await evaluateDxfGarmentObservedBodyInitialPreflightV1(request);
    expect(result).toMatchObject({ ok: true, evaluated: true, bodyClear: true });
    if (!result.evaluated || !result.artifact) throw new Error(JSON.stringify(result.blockers));
    const artifact = result.artifact;
    expect(artifact.placement.placedSimulation.manifest).toMatchObject({
      particleCount: 78,
      triangleCount: 114,
      materialCount: 2,
      pinnedParticleCount: 0,
    });
    expect(artifact.diagnostic.usage).toMatchObject({
      garmentVertexCount: 78,
      garmentTriangleCount: 114,
      bodyVertexCount: 8,
      bodyTriangleCount: 12,
    });
    expect(artifact.diagnostic.clearance.minimumSignedClearanceM).toBeGreaterThan(0.8);
    expect(artifact.diagnostic.binding.garmentPositionsSha256).toBe(
      artifact.garmentPositionsSha256,
    );
    expect(artifact.body.binding).toEqual(body.binding);
    expect(artifact.placement.localSourceArtifact).toEqual(placementRequest.sourceArtifact);
    expect(artifact.placement.placedSimulation.material).toEqual(
      placementRequest.sourceArtifact.compiledSimulation.material,
    );
    expect(artifact.placement.report.placements).toEqual(placementRequest.placements);
    expect(result.claims).toMatchObject({
      actualPlacementCompileExecuted: true,
      sourcePersistenceAuthenticated: false,
      viewportAuthorityAuthenticated: false,
      runtimeAuthority: false,
      fitClaimed: false,
    });
  });
  it('preserves actual unsafe geometry and reports refused body clearance instead of correcting it', async () => {
    const { request } = await fixture();
    const result = await evaluateDxfGarmentObservedBodyInitialPreflightV1({
      ...request,
      placementRequest: {
        ...request.placementRequest,
        placements: request.placementRequest.placements.map((p) => ({
          ...p,
          translationM: [-0.05, 0.5, 0],
        })),
      },
    });
    expect(result).toMatchObject({ ok: false, evaluated: true, bodyClear: false });
    if (!result.evaluated || !result.artifact) throw new Error(JSON.stringify(result.blockers));
    expect(
      result.artifact.diagnostic.intersections.bodyGarmentTriangleIntersectionCount,
    ).toBeGreaterThan(0);
    expect(result.artifact.placement.report.placements[0].translationM).toEqual([-0.05, 0.5, 0]);
    expect(result.claims.placementCorrectionApplied).toBe(false);
  });
  it('refuses a structural body-owner lookalike and a stale exact binding', async () => {
    const { request } = await fixture();
    for (const bad of [
      { ...request, bodyOwner: { ...request.bodyOwner } },
      {
        ...request,
        bodyBinding: { ...request.bodyBinding, generation: request.bodyBinding.generation + 1 },
      },
    ]) {
      const result = await evaluateDxfGarmentObservedBodyInitialPreflightV1(bad);
      expect(result).toMatchObject({ ok: false, evaluated: false, artifact: null });
      expect(result.blockers[0].code).toBe('body-unavailable');
    }
  });
  it('captures source placement before awaits so later caller mutation does not change measured geometry', async () => {
    const { request } = await fixture();
    const pending = evaluateDxfGarmentObservedBodyInitialPreflightV1(request);
    Reflect.set(request.placementRequest.placements[0].translationM, '0', 500);
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.artifact) throw new Error(JSON.stringify(result.blockers));
    expect(result.artifact.placement.report.placements[0].translationM[0]).toBe(1);
  });
  it('publishes no artifact if the actual observed body disappears during compilation', async () => {
    const { body, request } = await fixture();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let changed = false;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      if (!changed) {
        changed = true;
        body.state.observation = null;
      }
      return digest(...args);
    });
    const result = await evaluateDxfGarmentObservedBodyInitialPreflightV1(request);
    expect(result).toMatchObject({ ok: false, evaluated: false, artifact: null });
  });
  it('rechecks the persisted model after diagnostics and refuses a newly stale model', async () => {
    const { body, request } = await fixture();
    let reads = 0;
    body.hooks.beforeReadModel = async () => {
      if (++reads === 3)
        body.state.model = { ...body.state.model!, updatedAt: '2026-11-17T00:00:01.123456Z' };
    };
    const result = await evaluateDxfGarmentObservedBodyInitialPreflightV1(request);
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(result).toMatchObject({ ok: false, evaluated: false, artifact: null });
  });
  it('refuses getters without executing them', async () => {
    const { request } = await fixture();
    let calls = 0;
    const hostile = { ...request };
    Object.defineProperty(hostile, 'bodyBinding', {
      enumerable: true,
      get() {
        calls++;
        return request.bodyBinding;
      },
    });
    const result = await evaluateDxfGarmentObservedBodyInitialPreflightV1(hostile);
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, evaluated: false, artifact: null });
  });
  it('honors pre-abort and cancellation during asynchronous work', async () => {
    const { request, body } = await fixture();
    const already = new AbortController();
    already.abort();
    expect(
      await evaluateDxfGarmentObservedBodyInitialPreflightV1(request, already.signal),
    ).toMatchObject({ ok: false, evaluated: false, artifact: null });
    const controller = new AbortController();
    const pending = evaluateDxfGarmentObservedBodyInitialPreflightV1(request, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, evaluated: false, artifact: null });
    expect(
      await projectSavedModelDisplayedTriangleBodyV2(body.bodyOwner, body.binding),
    ).toMatchObject({ status: 'projected' });
  });
  it('stops locally while a borrowed model read is pending and safely observes its late completion', async () => {
    const { request, body } = await fixture();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    body.hooks.beforeReadModel = async () => {
      reads++;
      await hold;
    };
    const controller = new AbortController();
    const pending = evaluateDxfGarmentObservedBodyInitialPreflightV1(request, controller.signal);
    expect(reads).toBe(1);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, evaluated: false, artifact: null });
    release();
    expect(
      await projectSavedModelDisplayedTriangleBodyV2(body.bodyOwner, body.binding),
    ).toMatchObject({ status: 'projected' });
  });
});
