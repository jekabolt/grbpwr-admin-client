import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createThreePanelDxfMaterialCompileFixtureV1 } from './dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from './dxf-garment-assembly-material-compile-stage-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from './dxf-garment-assembly-explicit-placement-stage-v1';
import { validateSealedSimulationPackageV5V1 } from '../compiler/simulation-package-v5-integrity';

type Mutable<T> = T extends ArrayBuffer | ArrayBufferView
  ? T
  : { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
describe('explicit per-piece local-frame placement of a real generic material compile (CPU only)', () => {
  let request: DxfGarmentAssemblyExplicitPlacementStageRequestV1;
  beforeAll(async () => {
    const fixture = await createThreePanelDxfMaterialCompileFixtureV1('separated');
    const source = await compileDxfGarmentAssemblyMaterialStageV1(fixture.request);
    if (!source.compiled || source.sealed)
      throw new Error('Expected genuine separated DXF to compile without a runtime-eligible seal.');
    request = {
      schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
      sourceRequest: fixture.request,
      sourceArtifact: source.artifact,
      expectedSourceInputSha256: source.artifact.sourceEvidence.inputSha256,
      placements: [
        {
          pieceId: 'panel-a',
          sourceOriginM: [0, 0, 0],
          rotationRowMajor: I,
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
    };
  });
  it('seals authored 90°/180° folds from separated source without changing any local material or constraint bytes', async () => {
    const before = structuredClone(request);
    const result = await buildDxfGarmentAssemblyExplicitPlacementStageV1(request);
    if (!result.ok || !result.artifact.sealedSimulation)
      throw new Error(JSON.stringify(result.blockers));
    const local = result.artifact.localSourceArtifact.compiledSimulation,
      placed = result.artifact.placedSimulation;
    expect(result).toMatchObject({ ok: true, placed: true, sealed: true });
    expect(placed.constraints).toEqual(local.constraints);
    expect(placed.material).toEqual(local.material);
    expect(placed.manifest).toEqual(local.manifest);
    expect(placed.mesh.triangles).toEqual(local.mesh.triangles);
    expect(placed.mesh.supportAttachments).toEqual(local.mesh.supportAttachments);
    expect(placed.manifest).toMatchObject({
      particleCount: 78,
      triangleCount: 114,
      seamConstraintCount: 8,
      materialCount: 2,
      pinnedParticleCount: 0,
    });
    expect(result.artifact.localSourceArtifact).toEqual(request.sourceArtifact);
    expect(request).toEqual(before);
    const localW = new Uint32Array(local.mesh.restPositionsInvMass.buffer),
      placedW = new Uint32Array(placed.mesh.restPositionsInvMass.buffer);
    for (let i = 3; i < localW.length; i += 4) expect(placedW[i]).toBe(localW[i]);
    expect(placed.mesh.restPositionsInvMass).not.toEqual(local.mesh.restPositionsInvMass);
    expect(result.artifact.report.worldBoundsM.min[2]).toBeCloseTo(-0.1, 6);
    expect(result.artifact.report.metrics.maximumGreenStrainDelta).toBeLessThan(1e-5);
    expect(result.artifact.report.metrics.maximumEdgeLengthDeltaM).toBeLessThan(1e-7);
    expect(result.artifact.report.claims).toMatchObject({
      runtimeAuthority: false,
      bodyPlacementQualified: false,
      automaticSeamClosingUsed: false,
      materialRestAndConstraintBytesPreserved: true,
    });
    expect((await validateSealedSimulationPackageV5V1(result.artifact.sealedSimulation)).ok).toBe(
      true,
    );
  });
  it('keeps unapplied/incorrect authored placement as real output and refuses the unchanged all-at-once seam gate', async () => {
    const identity = {
      ...request,
      placements: request.placements.map((p) => ({
        ...p,
        sourceOriginM: [0, 0, 0] as const,
        rotationRowMajor: I,
        translationM: [0, 0, 0] as const,
      })),
    };
    const result = await buildDxfGarmentAssemblyExplicitPlacementStageV1(identity);
    expect(result).toMatchObject({ ok: false, placed: true, sealed: false });
    if (!result.placed) throw new Error('Expected actual placed-but-unsealed diagnostic artifact.');
    expect(result.artifact.sealedSimulation).toBeNull();
    expect(result.artifact.placedSimulation.mesh.restPositionsInvMass).toEqual(
      request.sourceArtifact.compiledSimulation.mesh.restPositionsInvMass,
    );
    expect(result.blockers[0].detail).toContain('incoherent-rest-pair');
    const mismatch = structuredClone(
      request,
    ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
    mismatch.placements[1].translationM[0] += 1e-5;
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(mismatch)).toMatchObject({
      ok: false,
      placed: true,
      sealed: false,
      blockers: [{ code: 'package-invalid-package' }],
    });
  });
  it.each([
    ['reflection', [-1, 0, 0, 0, 1, 0, 0, 0, 1]],
    ['scale', [1.01, 0, 0, 0, 1, 0, 0, 0, 1]],
    ['shear', [1, 0.01, 0, 0, 1, 0, 0, 0, 1]],
    ['zero matrix', [0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ])('rejects explicit %s instead of normalizing or repairing it', async (_name, rotation) => {
    const edited = structuredClone(
      request,
    ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
    edited.placements[0].rotationRowMajor = rotation as Mutable<
      (typeof request.placements)[number]['rotationRowMajor']
    >;
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited)).toMatchObject({
      ok: false,
      placed: false,
      artifact: null,
      blockers: [{ code: 'non-rigid-transform' }],
    });
  });
  it.each(['missing', 'duplicate', 'unknown'] as const)(
    'requires exact %s-free per-piece coverage',
    async (kind) => {
      const edited = structuredClone(
        request,
      ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
      if (kind === 'missing') edited.placements.pop();
      else if (kind === 'duplicate') edited.placements[1].pieceId = edited.placements[0].pieceId;
      else edited.placements[1].pieceId = 'foreign-piece';
      expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited)).toMatchObject({
        ok: false,
        placed: false,
        blockers: [{ code: 'piece-coverage-mismatch' }],
      });
    },
  );
  it('does not infer a source-frame origin or tolerate a collapsed Float32 placement', async () => {
    const edited = structuredClone(request) as unknown as { placements: Record<string, unknown>[] };
    delete edited.placements[0].sourceOriginM;
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited)).toMatchObject({
      ok: false,
      placed: false,
      blockers: [{ code: 'invalid-placement' }],
    });
    const far = {
      ...request,
      placements: request.placements.map((p) => ({
        ...p,
        translationM: [1e20, 1e20, 1e20] as const,
      })),
    };
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(far)).toMatchObject({
      ok: false,
      placed: false,
      blockers: [{ code: 'degenerate-placement' }],
    });
  });
  it.each([
    'material-frame',
    'material-record',
    'distance-rest',
    'inverse-mass',
    'seam-id',
    'refinement-rest',
  ] as const)('independently rejects tampered %s source bytes/identity', async (kind) => {
    const edited = structuredClone(
      request,
    ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
    const simulation = edited.sourceArtifact.compiledSimulation;
    if (kind === 'material-frame') new Uint8Array(simulation.material.triangleRestFrames)[0] ^= 1;
    if (kind === 'material-record') new Uint8Array(simulation.material.materialRecords)[0] ^= 1;
    if (kind === 'distance-rest') simulation.constraints.distance.restLengthsM[0] *= 2;
    if (kind === 'inverse-mass') simulation.mesh.restPositionsInvMass[3] *= 2;
    if (kind === 'seam-id') simulation.constraints.seam.seamIds[0] = 'forged-seam';
    if (kind === 'refinement-rest') edited.sourceArtifact.refinement.mesh.restPositions2Mm[0] += 1;
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited)).toMatchObject({
      ok: false,
      placed: false,
      artifact: null,
      blockers: [{ code: 'source-artifact-mismatch' }],
    });
  });
  it('rejects stale expected SHA and changed source request rather than trusting a historical artifact', async () => {
    expect(
      await buildDxfGarmentAssemblyExplicitPlacementStageV1({
        ...request,
        expectedSourceInputSha256: 'a'.repeat(64),
      }),
    ).toMatchObject({ ok: false, placed: false, blockers: [{ code: 'source-artifact-mismatch' }] });
    const edited = structuredClone(
      request,
    ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
    edited.sourceRequest.handoff.source.revision = 'changed';
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited)).toMatchObject({
      ok: false,
      placed: false,
      blockers: [{ code: 'source-compile-blocked' }],
    });
  });
  it('captures transform and source bytes before the first digest await', async () => {
    const edited = structuredClone(
      request,
    ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      edited.placements[1].translationM[0] = 100;
      edited.sourceArtifact.compiledSimulation.constraints.distance.restLengthsM[0] = 100;
      return digest(algorithm, data);
    });
    try {
      const result = await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited);
      if (!result.ok) throw new Error(JSON.stringify(result.blockers));
      expect(result.artifact.report.placements).toEqual(request.placements);
      expect(
        result.artifact.localSourceArtifact.compiledSimulation.constraints.distance.restLengthsM,
      ).toEqual(request.sourceArtifact.compiledSimulation.constraints.distance.restLengthsM);
    } finally {
      spy.mockRestore();
    }
  });
  it('refuses hidden/accessor and shared-buffer carriers without invoking getter or iterator hooks', async () => {
    const getter = vi.fn(() => request.placements);
    const hostile = { ...request };
    Object.defineProperty(hostile, 'placements', { get: getter, enumerable: true });
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(hostile)).toMatchObject({
      ok: false,
      placed: false,
      blockers: [{ code: 'invalid-input' }],
    });
    const edited = structuredClone(request);
    Object.defineProperty(
      edited.sourceArtifact.compiledSimulation.mesh.restPositionsInvMass,
      Symbol.iterator,
      { get: getter },
    );
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(edited)).toMatchObject({
      ok: false,
      placed: false,
      blockers: [{ code: 'invalid-input' }],
    });
    expect(getter).not.toHaveBeenCalled();
    const shared = structuredClone(
      request,
    ) as Mutable<DxfGarmentAssemblyExplicitPlacementStageRequestV1>;
    shared.sourceArtifact.compiledSimulation.mesh.restPositionsInvMass = new Float32Array(
      new SharedArrayBuffer(4 * 78 * 4),
    );
    expect(await buildDxfGarmentAssemblyExplicitPlacementStageV1(shared)).toMatchObject({
      ok: false,
      placed: false,
      blockers: [{ code: 'invalid-input' }],
    });
  });
  it('handles native caller cancellation before, during and after source replay without borrowed mutation', async () => {
    const before = structuredClone(request);
    const cancelled = new AbortController();
    cancelled.abort();
    expect(
      await buildDxfGarmentAssemblyExplicitPlacementStageV1(request, cancelled.signal),
    ).toMatchObject({ ok: false, placed: false, artifact: null, blockers: [{ code: 'aborted' }] });
    const pending = new AbortController();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      pending.abort();
      return digest(algorithm, data);
    });
    try {
      expect(
        await buildDxfGarmentAssemblyExplicitPlacementStageV1(request, pending.signal),
      ).toMatchObject({
        ok: false,
        placed: false,
        artifact: null,
        blockers: [{ code: 'aborted' }],
      });
    } finally {
      spy.mockRestore();
    }
    const caller = new AbortController();
    const get = vi.fn(() => {
      throw new Error('poisoned signal getter');
    });
    Object.defineProperty(caller.signal, 'aborted', { get });
    const result = await buildDxfGarmentAssemblyExplicitPlacementStageV1(request, caller.signal);
    expect(result.ok).toBe(true);
    expect(get).not.toHaveBeenCalled();
    caller.abort();
    // No lifetime capability is issued: already returned historical data stays inspectable.
    expect(result.ok).toBe(true);
    expect(request).toEqual(before);
  });
  it('binds deterministic placement receipts and independent sealed buffers', async () => {
    const a = await buildDxfGarmentAssemblyExplicitPlacementStageV1(request);
    const b = await buildDxfGarmentAssemblyExplicitPlacementStageV1(request);
    if (!a.ok || !b.ok || !a.artifact.sealedSimulation || !b.artifact.sealedSimulation)
      throw new Error('Expected sealed placements.');
    expect(a.artifact.report).toEqual(b.artifact.report);
    expect(a.artifact.sealedSimulation.seal).toEqual(b.artifact.sealedSimulation.seal);
    a.artifact.sealedSimulation.simulation.mesh.restPositionsInvMass[0] += 1;
    expect((await validateSealedSimulationPackageV5V1(a.artifact.sealedSimulation)).ok).toBe(false);
    expect((await validateSealedSimulationPackageV5V1(b.artifact.sealedSimulation)).ok).toBe(true);
    expect(Object.isFrozen(b.artifact.report.placements[0].rotationRowMajor)).toBe(true);
  });
});
