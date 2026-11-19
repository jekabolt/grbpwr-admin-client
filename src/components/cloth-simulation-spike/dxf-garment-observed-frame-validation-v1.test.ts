import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createThreePanelDxfMaterialCompileFixtureV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import { decodeParticleMassGpuV1 } from 'lib/cloth/compiler/material-package';
import { projectSavedModelDisplayedTriangleBodyV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import {
  DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1,
  evaluateDxfGarmentObservedFrameValidationV1,
  type DxfGarmentObservedFrameValidationRequestV1,
} from './dxf-garment-observed-frame-validation-v1';

/** Actual DXF/AO/compile/placement and geometric evaluators; explicitly synthetic cube observation.
 * Pure state mutations below test validation, not new source authority or physical execution. */
describe('generic observed frame content validation', () => {
  let request: DxfGarmentObservedFrameValidationRequestV1;
  let dispose: () => void;
  beforeAll(async () => {
    const fixture = await createThreePanelDxfMaterialCompileFixtureV1();
    const compiled = await compileDxfGarmentAssemblyMaterialStageV1(fixture.request);
    if (!compiled.compiled) throw new Error(JSON.stringify(compiled.blockers));
    const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1({
      schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
      sourceRequest: fixture.request,
      sourceArtifact: compiled.artifact,
      expectedSourceInputSha256: compiled.artifact.sourceEvidence.inputSha256,
      placements: ['panel-a', 'panel-b', 'panel-c'].map((pieceId) => ({
        pieceId,
        sourceOriginM: [0, 0, 0],
        rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        translationM: [1, 0.5, 0],
      })),
    });
    if (!placed.ok) throw new Error(JSON.stringify(placed.blockers));
    const s = placed.artifact.placedSimulation,
      initial = new Float32Array(s.mesh.restPositionsInvMass);
    for (let i = 0; i < s.manifest.particleCount; i++)
      initial[i * 4 + 3] = decodeParticleMassGpuV1(
        s.material.particleMassRecords,
        i,
      ).inverseMassKgInv;
    const body = await createObservedPlacementPairCubeBodyFixtureV1();
    dispose = body.dispose;
    const projection = await projectSavedModelDisplayedTriangleBodyV2(body.bodyOwner, body.binding);
    if (projection.status !== 'projected') throw new Error('Body fixture failed.');
    const b = body.binding,
      xyz = new Float32Array(s.manifest.particleCount * 3);
    for (let i = 0; i < s.manifest.particleCount; i++)
      for (let a = 0; a < 3; a++) xyz[3 * i + a] = initial[4 * i + a];
    request = {
      schemaVersion: DXF_GARMENT_OBSERVED_FRAME_VALIDATION_V1,
      frame: 0,
      initialPositions4: initial,
      currentPositions4: initial.slice(),
      previousPositions4: initial.slice(),
      triangles: s.mesh.triangles.slice(),
      seamPairs: s.constraints.seam.vertexPairs.slice(),
      pins: new Uint32Array(),
      collisionInput: {
        binding: {
          compositionGeneration: 7,
          snapshotGeneration: b.generation,
          modelId: b.displayedIdentity.modelId,
          modelContentRevision: b.displayedIdentity.modelContentRevision,
          inputFingerprint: b.displayedIdentity.inputFingerprint,
          canonicalContentFingerprint: b.canonicalContentFingerprint,
          basisKind: b.displayedIdentity.basisKind,
          posePresetId: 'accepted-pose;sha256=' + b.poseDocumentSha256,
          bodySourceRevision:
            'saved-model-host-observed-body/v2;sha256=' + b.observedBodyContentSha256,
          garmentPositionsSha256: '0'.repeat(64),
        },
        bodyPositionsM: projection.snapshot.bodyPositionsM,
        bodyTriangles: projection.snapshot.bodyTriangles,
        garmentPositionsM: xyz,
        garmentTriangles: s.mesh.triangles.slice(),
        garmentUniformScale: 1,
        garmentTranslationM: [0, 0, 0],
      },
    };
  });
  afterAll(() => dispose?.());
  it('runs actual generic self/confined witness, orientation and body signed geometry at78/114/8, preserving all input bytes', async () => {
    const before = structuredClone(request);
    const r = await evaluateDxfGarmentObservedFrameValidationV1(request);
    expect(r).toMatchObject({ ok: true, evaluated: true });
    if (!r.report) throw new Error(JSON.stringify(r.blockers));
    expect(r.report.parity).toMatchObject({
      particleCount: 78,
      pinnedCount: 0,
      freeCount: 78,
      inverseMassBitMismatchCount: 0,
    });
    expect(r.report.self.residualBlockingCount).toBe(0);
    expect(r.report.self.exactAccounting).toBe(true);
    expect(r.report.self.excludedConfinedExplicitSeamCount).toBeGreaterThan(0);
    expect(r.report.orientation.comparedTriangleCount).toBe(114);
    expect(r.report.collision.usage.bodyVertexCount).toBe(8);
    expect(r.report.signed?.contacts).toHaveLength(0);
    expect(r.report.claims).toMatchObject({
      runtimeAuthority: false,
      sourcePersistenceAuthenticated: false,
    });
    expect(request).toEqual(before);
  });
  it('preserves the complete final diagnostic with a real seam-gap failure', async () => {
    const input = structuredClone(request);
    input.currentPositions4[input.seamPairs[0] * 4] += 0.01;
    const r = await evaluateDxfGarmentObservedFrameValidationV1({ ...input, frame: 16 });
    expect(r.ok).toBe(false);
    expect(r.evaluated).toBe(true);
    expect(r.blockers).toContain('seam-gap-exceeded');
  });
  it.each(['currentPositions4', 'previousPositions4'] as const)(
    'checks exact W bytes in %s',
    async (field) => {
      const input = structuredClone(request);
      input[field][3] = 1;
      const r = await evaluateDxfGarmentObservedFrameValidationV1(input);
      expect(r.ok).toBe(false);
      expect(r.blockers).toContain('exact-state-parity-failed');
    },
  );
  it('checks explicit pinned current and previous XYZ independently, with no inferred pin selection', async () => {
    const input = structuredClone(request);
    for (const field of ['initialPositions4', 'currentPositions4', 'previousPositions4'] as const)
      input[field][3] = 0;
    const pinned = { ...input, pins: new Uint32Array([0]) };
    expect((await evaluateDxfGarmentObservedFrameValidationV1(pinned)).ok).toBe(true);
    pinned.previousPositions4[0] += 0.001;
    const r = await evaluateDxfGarmentObservedFrameValidationV1(pinned);
    expect(r.report?.parity.pinnedPreviousBitMismatchCount).toBe(1);
    expect(r.ok).toBe(false);
    expect(
      (await evaluateDxfGarmentObservedFrameValidationV1({ ...pinned, pins: new Uint32Array() }))
        .evaluated,
    ).toBe(false);
  });
  it('retains real intersecting-body failure without correction', async () => {
    const input = structuredClone(request);
    for (const field of ['initialPositions4', 'currentPositions4', 'previousPositions4'] as const)
      for (let i = 0; i < 78; i++) input[field][4 * i] -= 1.05;
    for (let i = 0; i < 78; i++) input.collisionInput.garmentPositionsM[3 * i] -= 1.05;
    const r = await evaluateDxfGarmentObservedFrameValidationV1(input);
    expect(r.ok).toBe(false);
    expect(r.report?.collision.intersections.bodyGarmentTriangleIntersectionCount).toBeGreaterThan(
      0,
    );
    expect(r.blockers).toContain('actual-body-contact-or-topology-blocked');
  });
  it('refuses multiway seam endpoints, topology drift and nonfinite state', async () => {
    const duplicate = structuredClone(request);
    duplicate.seamPairs[2] = duplicate.seamPairs[0];
    const topology = structuredClone(request);
    topology.triangles[0] = 77;
    const numeric = structuredClone(request);
    numeric.previousPositions4[0] = NaN;
    for (const input of [duplicate, topology, numeric])
      expect(await evaluateDxfGarmentObservedFrameValidationV1(input)).toMatchObject({
        ok: false,
        evaluated: false,
        report: null,
      });
  });
  it('captures bytes before hashing and rejects hostile getters/shared arrays without invoking them', async () => {
    const input = structuredClone(request),
      pending = evaluateDxfGarmentObservedFrameValidationV1(input);
    input.currentPositions4.fill(55);
    expect((await pending).ok).toBe(true);
    let invoked = 0;
    const hostile = { ...request };
    Object.defineProperty(hostile, 'triangles', {
      enumerable: true,
      get() {
        invoked++;
        return request.triangles;
      },
    });
    expect((await evaluateDxfGarmentObservedFrameValidationV1(hostile)).evaluated).toBe(false);
    expect(invoked).toBe(0);
    expect(
      (
        await evaluateDxfGarmentObservedFrameValidationV1({
          ...request,
          currentPositions4: new Float32Array(new SharedArrayBuffer(78 * 16)),
        })
      ).evaluated,
    ).toBe(false);
  });
  it('returns no report after caller abort', async () => {
    const c = new AbortController();
    const pending = evaluateDxfGarmentObservedFrameValidationV1(request, c.signal);
    c.abort();
    expect(await pending).toMatchObject({ ok: false, evaluated: false, report: null });
  });
});
