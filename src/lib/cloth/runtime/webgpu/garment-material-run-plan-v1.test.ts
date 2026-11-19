import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createThreePanelDxfMaterialCompileFixtureV1 } from '../../domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from '../../domain/dxf-garment-assembly-material-compile-stage-v1';
import { buildDxfAssemblyHandoffV1 } from '../../domain/dxf-assembly-handoff-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
} from '../../domain/dxf-garment-assembly-explicit-placement-stage-v1';
import { decodeClothMaterialGpuV1, decodeParticleMassGpuV1 } from '../../compiler/material-package';
import {
  sealSimulationPackageV5V1,
  type SealedSimulationPackageV5V1,
} from '../../compiler/simulation-package-v5-integrity';
import {
  buildGarmentMaterialRunPlanV1,
  garmentMaterialRunWorkgroupsV1,
  GARMENT_MATERIAL_RUN_PLAN_V1,
  type GarmentMaterialRunPlanRequestV1,
} from './garment-material-run-plan-v1';
import { decodeXpbdMaterialVelocityParamsV2 } from './xpbd-material-velocity-kernel-v2';

type Mutable<T> = T extends ArrayBuffer | ArrayBufferView
  ? T
  : { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
async function genuineFoldedPackage(isotropic: boolean) {
  const fixture = await createThreePanelDxfMaterialCompileFixtureV1('separated');
  let request = fixture.request;
  if (isotropic) {
    // Explicit NEW CPU-fixture material identities. Original visual anisotropy is not modified,
    // silently collapsed, or presented as calibrated physical fabric.
    const ids = new Map(fixture.request.materials.map((m) => [m.id, `cpu-isotropic-${m.id}`]));
    const candidate = {
      ...fixture.candidate,
      materials: fixture.candidate.materials.map((m) => ({ ...m, id: ids.get(m.id)! })),
    };
    const handoff = await buildDxfAssemblyHandoffV1(candidate);
    if (!handoff.ok) throw new Error(JSON.stringify(handoff));
    request = {
      ...request,
      handoff: handoff.value,
      materials: fixture.request.materials.map((m, i) => ({
        ...m,
        id: ids.get(m.id)!,
        label: `Explicit isotropic CPU fixture ${i}`,
        provenance: {
          ...m.provenance,
          description: 'Synthetic CPU test material; isotropic bend authored explicitly.',
          sourceReference: 'garment-material-run-plan-v1.test.ts',
        },
        bendComplianceInvNm: { warp: i === 0 ? 0.0006 : 0.0011, weft: i === 0 ? 0.0006 : 0.0011 },
      })),
      continuumMaterials: fixture.request.continuumMaterials.map((m) => ({
        ...m,
        materialId: ids.get(m.materialId)!,
        provenance: { ...m.provenance, sourceId: 'explicit-isotropic-cpu-fixture' },
      })),
    };
  }
  const compiled = await compileDxfGarmentAssemblyMaterialStageV1(request);
  if (!compiled.compiled) throw new Error(JSON.stringify(compiled.blockers));
  const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1({
    schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
    sourceRequest: request,
    sourceArtifact: compiled.artifact,
    expectedSourceInputSha256: compiled.artifact.sourceEvidence.inputSha256,
    placements: [
      {
        pieceId: 'panel-a',
        sourceOriginM: [0, 0, 0],
        rotationRowMajor: IDENTITY,
        translationM: [0, 0, 0],
      },
      {
        pieceId: 'panel-b',
        sourceOriginM: [0.2, 0, 0],
        rotationRowMajor: [0, 0, 1, 0, 1, 0, -1, 0, 0],
        translationM: [0.1, 0, 0],
      },
      {
        pieceId: 'panel-c',
        sourceOriginM: [0.4, 0, 0],
        rotationRowMajor: [-1, 0, 0, 0, 1, 0, 0, 0, -1],
        translationM: [0.1, 0, -0.1],
      },
    ],
  });
  if (!placed.ok || !placed.artifact.sealedSimulation)
    throw new Error(JSON.stringify(placed.blockers));
  return {
    sealedSimulation: placed.artifact.sealedSimulation,
    pieceRanges: placed.artifact.localSourceArtifact.refinement.mesh.pieceRanges,
  };
}
function requestFor(
  source: Awaited<ReturnType<typeof genuineFoldedPackage>>,
): GarmentMaterialRunPlanRequestV1 {
  return {
    schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
    ...source,
    expectedPackageSha256: source.sealedSimulation.seal.aggregateSha256,
    parameters: {
      dtS: 1 / 120,
      solverIterations: 8,
      frameCount: 16,
      gravityMps2Y: -9.81,
      windAccelerationMps2Z: 0,
      distanceComplianceMPerN: 2e-7,
      seamComplianceMPerN: 1e-8,
    },
    budgets: {
      maxParticles: 1000,
      maxTriangles: 2000,
      maxConstraintCount: 10000,
      maxGpuBytes: 8 * 1024 * 1024,
      maxDispatches: 100000,
      maxConstraintInvocations: 10_000_000,
      maxWorkgroupsPerDispatch: 65535,
    },
  };
}

describe('generic material run plan: CPU content consistency, no execution/authority', () => {
  let request: GarmentMaterialRunPlanRequestV1;
  beforeAll(async () => {
    request = requestFor(await genuineFoldedPackage(true));
  });
  it('plans the real folded three-panel two-material package with physical W and original per-material retention', async () => {
    const before = structuredClone(request),
      result = await buildGarmentMaterialRunPlanV1(request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    const { plan } = result,
      s = request.sealedSimulation.simulation;
    expect(plan.report.counts).toMatchObject({
      particles: 78,
      triangles: 114,
      seam: 8,
      materials: 2,
    });
    expect(plan.sourceSealedSimulation).toEqual(request.sealedSimulation);
    expect(request).toEqual(before);
    for (let i = 0; i < s.manifest.particleCount; i++) {
      expect(plan.physicalInitialPositions[i * 4 + 3]).toBe(
        decodeParticleMassGpuV1(s.material.particleMassRecords, i).inverseMassKgInv,
      );
      expect(plan.physicalInitialPositions[i * 4 + 3]).not.toBe(1);
      expect(Array.from(plan.physicalInitialPositions.subarray(i * 4, i * 4 + 3))).toEqual(
        Array.from(s.mesh.restPositionsInvMass.subarray(i * 4, i * 4 + 3)),
      );
      expect((plan.uploads.particleRetention as Float32Array)[i]).toBe(
        decodeClothMaterialGpuV1(s.material.materialRecords, plan.particleMaterialIndices[i])
          .velocityRetentionPerStep,
      );
    }
    expect(new Set(plan.uploads.particleRetention as Float32Array).size).toBe(2);
    expect(plan.uploads.restPositions).toEqual(plan.physicalInitialPositions);
    expect(plan.uploads.restPositions).not.toBe(plan.physicalInitialPositions);
    expect(plan.report.physicalInitialFloat32LeSha256).toBe(
      plan.report.physicalRestFloat32LeSha256,
    );
    expect(decodeXpbdMaterialVelocityParamsV2(plan.velocityParams)).toEqual({
      dtS: Math.fround(1 / 120),
      particleCount: 78,
    });
    expect(plan.report.claims).toMatchObject({
      gpuExecutionPerformed: false,
      runtimeAuthority: false,
      contactOrFrictionIntegrated: false,
      pieceRangesSourceAuthenticated: false,
    });
  });
  it('keeps exact original color/constraint/lambda ordering and splits only contiguous bend material runs', async () => {
    const result = await buildGarmentMaterialRunPlanV1(request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    const { plan } = result,
      bend = request.sealedSimulation.simulation.constraints.bend;
    let expected = 0;
    for (const run of plan.bend) {
      expect(run.constraintOffset).toBe(expected);
      expected += run.constraintCount;
      const colorOffset = bend.colorRanges[run.color * 2],
        colorEnd = colorOffset + bend.colorRanges[run.color * 2 + 1];
      expect(run.constraintOffset).toBeGreaterThanOrEqual(colorOffset);
      expect(expected).toBeLessThanOrEqual(colorEnd);
      for (let i = run.constraintOffset; i < expected; i++)
        for (let k = 0; k < 4; k++)
          expect(plan.particleMaterialIndices[bend.vertexQuads[i * 4 + k]]).toBe(run.materialIndex);
      const view = new DataView(run.params);
      expect(view.getUint32(0, true)).toBe(run.constraintOffset);
      expect(view.getUint32(4, true)).toBe(run.constraintCount);
      expect(view.getFloat32(8, true)).toBe(run.complianceInvNm);
      expect(view.getFloat32(12, true)).toBe(Math.fround(1 / 120));
    }
    expect(expected).toBe(bend.constraintCount);
    expect(new Set(plan.bend.map((r) => r.complianceInvNm)).size).toBe(2);
    expect(plan.uploads.bendQuads).toEqual(bend.vertexQuads);
    expect(plan.uploads.bendRestAngles).toEqual(bend.restAnglesRad);
    expect((plan.uploads.bendLambdas as Float32Array).every((v) => v === 0)).toBe(true);
    expect(plan.uploads.continuumTriangles).toEqual(
      request.sealedSimulation.simulation.constraints.continuumStrain.triangleIndices,
    );
    const seam = request.sealedSimulation.simulation.constraints.seam;
    seam.activationOrder.forEach((offset, rank) =>
      expect((plan.uploads.seamActivationRanks as Uint32Array)[offset]).toBe(rank),
    );
    for (const run of plan.continuum) {
      const v = new DataView(run.params);
      expect(v.getUint32(0, true)).toBe(run.constraintOffset);
      expect(v.getUint32(4, true)).toBe(run.constraintCount);
      expect(v.getFloat32(8, true)).toBe(Math.fround(1 / 120));
      expect(v.getUint32(12, true)).toBe(0);
    }
  });
  it('refuses the unchanged genuine anisotropic visual material package instead of taking max(warp,weft)', async () => {
    const original = requestFor(await genuineFoldedPackage(false));
    expect(await buildGarmentMaterialRunPlanV1(original)).toMatchObject({
      ok: false,
      plan: null,
      blockers: [{ code: 'anisotropic-bend-unsupported' }],
      claims: {
        sealedV5Validated: false,
        physicalInverseMassDerivedFromMaterialRecords: false,
        particleMaterialRetentionDerivedWithoutAveraging: false,
        bendMaterialRunsDoNotReorderConstraints: false,
      },
    });
  });
  it('accounts exact core storage/uniform bytes and frame/iteration work without claiming full GPU usage', async () => {
    const result = await buildGarmentMaterialRunPlanV1(request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    const { plan } = result;
    expect(plan.report.coreGpuBytes).toBe(
      Object.values(plan.uploads).reduce((n, v) => n + v.byteLength, 0) +
        plan.uniformPackets.reduce((n, v) => n + v.byteLength, 0),
    );
    expect(plan.report.dispatchCount).toBe(
      16 *
        (2 +
          plan.resets.length +
          8 *
            (plan.distance.length +
              2 * plan.seam.length +
              plan.bend.length +
              plan.continuum.length)),
    );
    expect(plan.report.budgetScope).toContain('excludes contact/body');
    expect(plan.sequence.contactSlotImplemented).toBe(false);
    expect(plan.predictionFrames).toHaveLength(16);
    expect(garmentMaterialRunWorkgroupsV1(78, 65535)).toBe(2);
  });
  async function resealed(
    edit: (simulation: Mutable<SealedSimulationPackageV5V1['simulation']>) => void,
  ) {
    const simulation = structuredClone(request.sealedSimulation.simulation) as unknown as Mutable<
      SealedSimulationPackageV5V1['simulation']
    >;
    edit(simulation);
    const result = await sealSimulationPackageV5V1(simulation);
    if (!result.ok) throw new Error(JSON.stringify(result));
    return {
      ...request,
      sealedSimulation: result.artifact,
      expectedPackageSha256: result.artifact.seal.aggregateSha256,
    };
  }
  it('initializes exact velocity diagnostics sentinels and preserves an explicitly authored zero support mask', async () => {
    const pinned = await resealed((s) => {
      s.mesh.restPositionsInvMass[3] = 0;
      s.manifest.pinnedParticleCount = 1;
      s.mesh.supportAttachments = {
        ...s.mesh.supportAttachments,
        mode: 'explicit-fixed-particles',
        provenance: { sourceId: 'cpu-explicit-pin:0', intendedUse: 'test' },
        attachmentIds: ['explicit-pin:0'],
        particleIndices: new Uint32Array([0]),
      };
    });
    const result = await buildGarmentMaterialRunPlanV1(pinned);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    expect(Array.from(result.plan.uploads.velocityDiagnostics as Uint32Array)).toEqual([
      0, 0, 0, 0xffffffff, 0xffffffff, 0xffffffff, 0, 0,
    ]);
    expect(result.plan.physicalInitialPositions[3]).toBe(0);
    expect((result.plan.uploads.restPositions as Float32Array)[3]).toBe(0);
    expect(result.plan.physicalInitialPositions[7]).toBe(
      decodeParticleMassGpuV1(pinned.sealedSimulation.simulation.material.particleMassRecords, 1)
        .inverseMassKgInv,
    );
    expect(result.plan.sourceSealedSimulation.simulation.mesh.supportAttachments).toEqual(
      pinned.sealedSimulation.simulation.mesh.supportAttachments,
    );
  });
  it('rejects immutable anchors at the V2 100m domain boundary and unrepresentable physical inverse mass', async () => {
    const outside = await resealed((s) => {
      for (let i = 0; i < s.mesh.restPositionsInvMass.length; i += 4)
        s.mesh.restPositionsInvMass[i] += 100;
      s.restBoundsM.minX += 100;
      s.restBoundsM.maxX += 100;
    });
    expect(await buildGarmentMaterialRunPlanV1(outside)).toMatchObject({
      ok: false,
      plan: null,
      blockers: [{ code: 'invalid-initial-position' }],
    });
    const mass = await resealed((s) => {
      const data = new DataView(s.material.particleMassRecords);
      data.setFloat32(0, 1e-31, true);
      data.setFloat32(4, 1e31, true);
      let total = 0;
      for (let i = 0; i < s.manifest.particleCount; i++) total += data.getFloat32(i * 8, true);
      s.manifest.totalMassKg = total;
    });
    expect(await buildGarmentMaterialRunPlanV1(mass)).toMatchObject({
      ok: false,
      plan: null,
      blockers: [{ code: 'invalid-physical-mass' }],
    });
  });
  it.each(['missing-piece', 'overlap', 'foreign-triangle', 'duplicate-piece'] as const)(
    'refuses %s coverage without selecting a material fallback',
    async (kind) => {
      const edited = structuredClone(
        request,
      ) as unknown as Mutable<GarmentMaterialRunPlanRequestV1>;
      if (kind === 'missing-piece') edited.pieceRanges.pop();
      if (kind === 'overlap') edited.pieceRanges[1].vertexOffset = 0;
      if (kind === 'foreign-triangle') edited.pieceRanges[1].triangleOffset = 0;
      if (kind === 'duplicate-piece') edited.pieceRanges[1].pieceId = edited.pieceRanges[0].pieceId;
      expect(await buildGarmentMaterialRunPlanV1(edited)).toMatchObject({
        ok: false,
        plan: null,
        blockers: [{ stage: 'material-and-coverage' }],
      });
    },
  );
  it.each(['distance', 'seam', 'bend', 'continuum'] as const)(
    'refuses tampered %s color coverage before publishing dispatches',
    async (kind) => {
      const edited = structuredClone(
        request,
      ) as unknown as Mutable<GarmentMaterialRunPlanRequestV1>;
      const constraints = edited.sealedSimulation.simulation.constraints;
      if (kind === 'distance') constraints.distance.colorRanges[0].count--;
      if (kind === 'seam') constraints.seam.colorRanges[1]--;
      if (kind === 'bend') constraints.bend.colorRanges[1]--;
      if (kind === 'continuum') constraints.continuumStrain.colorRanges[1]--;
      expect(await buildGarmentMaterialRunPlanV1(edited)).toMatchObject({
        ok: false,
        plan: null,
        blockers: [{ code: 'invalid-sealed-v5' }],
      });
    },
  );
  it('does not mint accepted zero-seam or zero-bend V5; empty-tail helper returns no dispatch', async () => {
    for (const kind of ['seam', 'bend'] as const) {
      const edited = structuredClone(
        request,
      ) as unknown as Mutable<GarmentMaterialRunPlanRequestV1>;
      const simulation = edited.sealedSimulation.simulation;
      if (kind === 'seam') {
        simulation.manifest.seamConstraintCount = 0;
        simulation.manifest.seamColorCount = 0;
        simulation.constraints.seam.constraintCount = 0;
        simulation.constraints.seam.colorCount = 0;
        simulation.constraints.seam.colorRanges = new Uint32Array();
      } else {
        simulation.manifest.bendConstraintCount = 0;
        simulation.manifest.bendColorCount = 0;
        simulation.constraints.bend.constraintCount = 0;
        simulation.constraints.bend.colorCount = 0;
        simulation.constraints.bend.colorRanges = new Uint32Array();
      }
      expect((await sealSimulationPackageV5V1(simulation)).ok).toBe(false);
      expect(await buildGarmentMaterialRunPlanV1(edited)).toMatchObject({
        ok: false,
        plan: null,
        blockers: [{ code: 'invalid-sealed-v5' }],
      });
    }
    expect(garmentMaterialRunWorkgroupsV1(0, 65535)).toBe(0);
    expect(
      [1, 63, 64, 65, 78, 128, 129].map((n) => garmentMaterialRunWorkgroupsV1(n, 65535)),
    ).toEqual([1, 1, 1, 2, 2, 2, 3]);
    expect(() => garmentMaterialRunWorkgroupsV1(65, 1)).toThrow('workgroup budget');
    expect(() => garmentMaterialRunWorkgroupsV1(-1, 65535)).toThrow();
    expect(() => garmentMaterialRunWorkgroupsV1(1.5, 65535)).toThrow();
  });
  it('enforces every material solver range and the original sealed dt/iteration contract', async () => {
    const wrong = await resealed((s) => {
      const v = new DataView(s.material.materialRecords);
      v.setFloat32(80 + 56, 0.02, true);
      v.setFloat32(80 + 60, 0.03, true);
    });
    expect(await buildGarmentMaterialRunPlanV1(wrong)).toMatchObject({
      ok: false,
      plan: null,
      blockers: [{ code: 'material-range-refused' }],
    });
    for (const parameters of [
      { ...request.parameters, dtS: 1 / 60 },
      { ...request.parameters, solverIterations: 4 },
    ])
      expect(await buildGarmentMaterialRunPlanV1({ ...request, parameters })).toMatchObject({
        ok: false,
        plan: null,
        blockers: [{ code: 'material-solver-mismatch' }],
      });
  });
  it.each([
    'maxParticles',
    'maxTriangles',
    'maxConstraintCount',
    'maxGpuBytes',
    'maxDispatches',
    'maxConstraintInvocations',
    'maxWorkgroupsPerDispatch',
  ] as const)('enforces explicit %s without partial plan output', async (key) => {
    expect(
      await buildGarmentMaterialRunPlanV1({
        ...request,
        budgets: { ...request.budgets, [key]: 1 },
      }),
    ).toMatchObject({ ok: false, plan: null });
  });
  it('captures all source buffers and parameters before validation awaits, without getters or shared memory', async () => {
    const getter = vi.fn(() => request.sealedSimulation);
    const hostile = { ...request };
    Object.defineProperty(hostile, 'sealedSimulation', { enumerable: true, get: getter });
    expect(await buildGarmentMaterialRunPlanV1(hostile)).toMatchObject({ ok: false, plan: null });
    expect(getter).not.toHaveBeenCalled();
    const shared = structuredClone(request) as unknown as Mutable<GarmentMaterialRunPlanRequestV1>;
    shared.sealedSimulation.simulation.mesh.restPositionsInvMass = new Float32Array(
      new SharedArrayBuffer(78 * 16),
    );
    expect(await buildGarmentMaterialRunPlanV1(shared)).toMatchObject({ ok: false, plan: null });
    const edited = structuredClone(request) as unknown as Mutable<GarmentMaterialRunPlanRequestV1>,
      digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      edited.parameters.frameCount = 32;
      edited.sealedSimulation.simulation.mesh.restPositionsInvMass[0] = 500;
      return digest(algorithm, data);
    });
    try {
      const result = await buildGarmentMaterialRunPlanV1(edited);
      if (!result.ok) throw new Error(JSON.stringify(result.blockers));
      expect(result.plan.report.parameters.frameCount).toBe(16);
      expect(result.plan.physicalInitialPositions[0]).toBe(
        request.sealedSimulation.simulation.mesh.restPositionsInvMass[0],
      );
    } finally {
      spy.mockRestore();
    }
  });
  it('refuses expected seal mismatch, cancellation and output buffer tampering on a future rebuild', async () => {
    expect(
      await buildGarmentMaterialRunPlanV1({ ...request, expectedPackageSha256: 'f'.repeat(64) }),
    ).toMatchObject({ ok: false, plan: null, blockers: [{ code: 'source-seal-mismatch' }] });
    const caller = new AbortController();
    caller.abort();
    expect(await buildGarmentMaterialRunPlanV1(request, caller.signal)).toMatchObject({
      ok: false,
      plan: null,
      blockers: [{ code: 'cancelled' }],
    });
    const pending = new AbortController(),
      digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      pending.abort();
      return digest(algorithm, data);
    });
    try {
      expect(await buildGarmentMaterialRunPlanV1(request, pending.signal)).toMatchObject({
        ok: false,
        plan: null,
        blockers: [{ code: 'cancelled' }],
      });
    } finally {
      spy.mockRestore();
    }
    const first = await buildGarmentMaterialRunPlanV1(request),
      second = await buildGarmentMaterialRunPlanV1(request);
    if (!first.ok || !second.ok) throw new Error('Expected genuine plans.');
    expect(first.plan.planSha256).toBe(second.plan.planSha256);
    first.plan.sourceSealedSimulation.simulation.mesh.restPositionsInvMass[0] += 1;
    expect(
      await buildGarmentMaterialRunPlanV1({
        ...request,
        sealedSimulation: first.plan.sourceSealedSimulation,
      }),
    ).toMatchObject({ ok: false, plan: null, blockers: [{ code: 'invalid-sealed-v5' }] });
    expect(second.plan.sourceSealedSimulation).toEqual(request.sealedSimulation);
  });
});
