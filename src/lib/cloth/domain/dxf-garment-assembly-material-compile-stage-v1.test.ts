import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createThreePanelDxfMaterialCompileFixtureV1 } from './dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import {
  compileDxfGarmentAssemblyMaterialStageV1,
  type DxfGarmentAssemblyMaterialCompileStageRequestV1,
} from './dxf-garment-assembly-material-compile-stage-v1';
import {
  buildDxfAssemblyHandoffV1,
  type DxfAssemblyHandoffCandidateV1,
} from './dxf-assembly-handoff-v1';
import { validateSealedSimulationPackageV5V1 } from '../compiler/simulation-package-v5-integrity';

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
type MutableRequest = Mutable<DxfGarmentAssemblyMaterialCompileStageRequestV1>;

describe('generic exact DXF + AO material compiler stage (CPU, no product authority)', () => {
  let fixture: Awaited<ReturnType<typeof createThreePanelDxfMaterialCompileFixtureV1>>;
  beforeAll(async () => {
    fixture = await createThreePanelDxfMaterialCompileFixtureV1();
  });
  it('compiles three decoded DXF panels and two explicit AO operations to actual refined multi-material V5', async () => {
    const result = await compileDxfGarmentAssemblyMaterialStageV1(fixture.request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    expect(result.artifact.assembly.pieces).toHaveLength(3);
    expect(result.artifact.assembly.operations.map((op) => op.id)).toEqual(['ao-10', 'ao-20']);
    expect(result.artifact.sealedSimulation.simulation.manifest).toMatchObject({
      materialCount: 2,
      pinnedParticleCount: 0,
    });
    expect(
      result.artifact.refinement.pieceEvidence.every((piece) => piece.interiorVertexCount > 0),
    ).toBe(true);
    expect(result.artifact.sealedSimulation.simulation.manifest.triangleCount).toBeGreaterThan(6);
    expect(
      result.artifact.sealedSimulation.simulation.manifest.seamConstraintCount,
    ).toBeGreaterThan(4);
    expect(result.artifact.sourceEvidence.handoff).toEqual(fixture.request.handoff);
    expect(result.artifact.sourceEvidence.samplingRequest).toEqual(fixture.request.samplingRequest);
    expect(result.artifact.claims).toMatchObject({
      nativeEdgeDescriptorsAuthenticated: false,
      productAuthority: false,
      runtimeAuthority: false,
      assemblyOperationScheduleExecuted: false,
      supportAttachmentPolicy: 'none',
    });
    expect((await validateSealedSimulationPackageV5V1(result.artifact.sealedSimulation)).ok).toBe(
      true,
    );
  });
  it('retains real compiled output for separated source panels, while unchanged V5 preactivation refuses the seal', async () => {
    const separated = await createThreePanelDxfMaterialCompileFixtureV1('separated');
    const result = await compileDxfGarmentAssemblyMaterialStageV1(separated.request);
    expect(result).toMatchObject({ ok: false, compiled: true, sealed: false });
    if (!result.compiled || result.ok)
      throw new Error('Expected the actual compiled-but-unsealed diagnostic artifact.');
    expect(result.artifact.sealedSimulation).toBeNull();
    expect(result.blockers[0]).toMatchObject({ stage: 'seal', code: 'package-invalid-package' });
    expect(result.blockers[0].detail).toContain('incoherent-rest-pair');
    expect(result.artifact.compiledSimulation.manifest.materialCount).toBe(2);
    expect(result.artifact.assembly.pieces[1].contours[0].pointsMm[0][0]).toBe(200);
    expect(result.artifact.sourceEvidence.handoff).toEqual(separated.request.handoff);
    expect(result.artifact.claims.runtimeAuthority).toBe(false);
  });

  it('rebuilds deterministically with exact seam-side directions, grain and material provenance', async () => {
    const [first, second] = await Promise.all([
      compileDxfGarmentAssemblyMaterialStageV1(fixture.request),
      compileDxfGarmentAssemblyMaterialStageV1(fixture.request),
    ]);
    if (!first.ok || !second.ok) throw new Error('Expected both independent compiles to pass.');
    expect(first.artifact.sealedSimulation.seal).toEqual(second.artifact.sealedSimulation.seal);
    expect(first.artifact.sourceEvidence.inputSha256).toBe(
      second.artifact.sourceEvidence.inputSha256,
    );
    expect(first.artifact.assembly.pieces.map((piece) => piece.grainDegrees)).toEqual([90, 0, 45]);
    expect(first.artifact.refinement.mesh.seams.map((seam) => seam.seamId)).toEqual([
      'ao-10-stitch',
      'ao-20-stitch',
    ]);
    expect(
      first.artifact.sourceEvidence.handoff.seams.map((seam) =>
        seam.sides.map((side) => side.direction),
      ),
    ).toEqual([
      ['forward', 'reverse'],
      ['forward', 'reverse'],
    ]);
    expect(first.artifact.compiledSimulation.material.materialKeys).toEqual([
      'visual-light-woven@1',
      'visual-medium-woven@1',
    ]);
    expect(
      first.artifact.sourceEvidence.materials.every(
        (material) => material.provenance.calibrationStatus === 'uncalibrated-visual',
      ),
    ).toBe(true);
    first.artifact.sealedSimulation.simulation.mesh.restPositionsInvMass[0] += 1;
    expect((await validateSealedSimulationPackageV5V1(first.artifact.sealedSimulation)).ok).toBe(
      false,
    );
    expect((await validateSealedSimulationPackageV5V1(second.artifact.sealedSimulation)).ok).toBe(
      true,
    );
  });

  it.each([
    [
      'source hash',
      (request: MutableRequest) => {
        request.handoff.source.sourceSha256 = 'a'.repeat(64);
      },
      'handoff-seal-mismatch',
    ],
    [
      'native source ID',
      (request: MutableRequest) => {
        request.samplingRequest.pieces[0].edges[0].native.sourceCurveId = 'foreign-curve';
      },
      'native-edge-binding-mismatch',
    ],
    [
      'same-position substituted vertex ID',
      (request: MutableRequest) => {
        request.samplingRequest.pieces[0].input.shell.vertices[0].id = 'substitute';
      },
      'boundary-binding-mismatch',
    ],
    [
      'side direction',
      (request: MutableRequest) => {
        request.samplingRequest.equalSeams[0].sides[0].direction = 'reverse';
      },
      'seam-binding-mismatch',
    ],
    [
      'edge identity',
      (request: MutableRequest) => {
        request.samplingRequest.equalSeams[0].sides[0].edgeId = 'panel-a/edge-2';
      },
      'seam-binding-mismatch',
    ],
    [
      'grain',
      (request: MutableRequest) => {
        request.samplingRequest.pieces[1].input.grainDegrees = 45;
      },
      'piece-binding-mismatch',
    ],
    [
      'extra native occurrence',
      (request: MutableRequest) => {
        request.samplingRequest.pieces[0].edges.push({
          ...request.samplingRequest.pieces[0].edges[0],
          edgeId: 'extra',
        });
      },
      'native-edge-binding-mismatch',
    ],
  ])('rejects %s drift before a mesh is published', async (_name, mutate, code) => {
    const request = structuredClone(fixture.request) as MutableRequest;
    mutate(request);
    const result = await compileDxfGarmentAssemblyMaterialStageV1(request);
    expect(result).toMatchObject({
      ok: false,
      compiled: false,
      artifact: null,
      blockers: [{ code }],
    });
  });

  async function resealed(
    edit: (candidate: DxfAssemblyHandoffCandidateV1) => DxfAssemblyHandoffCandidateV1,
  ) {
    const handoff = await buildDxfAssemblyHandoffV1(edit(structuredClone(fixture.candidate)));
    if (!handoff.ok) throw new Error(JSON.stringify(handoff));
    return { ...fixture.request, handoff: handoff.value };
  }
  it('refuses implicit cut-count expansion before source or instance IDs can be invented', async () => {
    const request = await resealed((candidate) => ({
      ...candidate,
      pieces: candidate.pieces.map((piece, index) =>
        index === 0 ? { ...piece, cutCount: 2 } : piece,
      ),
    }));
    expect(await compileDxfGarmentAssemblyMaterialStageV1(request)).toMatchObject({
      ok: false,
      compiled: false,
      blockers: [{ code: 'unsupported-cut-count' }],
    });
  });
  it.each(['eased', 'gathered'] as const)(
    'refuses the explicit unsupported %s mapping',
    async (mapping) => {
      const request = await resealed((candidate) => ({
        ...candidate,
        seams: candidate.seams.map((seam, index) => (index === 0 ? { ...seam, mapping } : seam)),
      }));
      expect(await compileDxfGarmentAssemblyMaterialStageV1(request)).toMatchObject({
        ok: false,
        compiled: false,
        blockers: [{ code: 'unsupported-seam-mapping' }],
      });
    },
  );
  it('refuses nonstitch operation semantics even with a valid new handoff seal', async () => {
    const request = await resealed((candidate) => ({
      ...candidate,
      operations: [
        ...candidate.operations,
        { id: 'ao-30-place', stage: 30, order: 2, kind: 'place', seamIds: [] },
      ],
    }));
    expect(await compileDxfGarmentAssemblyMaterialStageV1(request)).toMatchObject({
      ok: false,
      compiled: false,
      blockers: [{ code: 'unsupported-operation' }],
    });
  });
  it('refuses missing sides without inventing an AO partner', async () => {
    const request = structuredClone(fixture.request);
    (request.handoff.seams[0].sides as unknown as unknown[]).pop();
    expect(await compileDxfGarmentAssemblyMaterialStageV1(request)).toMatchObject({
      ok: false,
      compiled: false,
      artifact: null,
    });
  });
  it('retains material revision validation and the existing exact 10–50mm refinement profile', async () => {
    const wrongMaterial = structuredClone(fixture.request);
    Object.assign(wrongMaterial.materials[0], { revision: 'wrong' });
    const result = await compileDxfGarmentAssemblyMaterialStageV1(wrongMaterial);
    expect(result).toMatchObject({ ok: false, compiled: false, blockers: [{ stage: 'material' }] });
    expect(result.blockers[0].detail).toContain('material');
    const wrongRange = {
      ...fixture.request,
      materialPolicy: { ...fixture.request.materialPolicy, minEdgeMm: 12, maxEdgeMm: 40 },
    };
    expect(await compileDxfGarmentAssemblyMaterialStageV1(wrongRange)).toMatchObject({
      ok: false,
      compiled: false,
      blockers: [
        {
          stage: 'refinement',
          detail: 'G0B V1 supports only the exact visual 10–50 mm material range.',
        },
      ],
    });
  });
  it('does not widen material SI edge limits when a 50mm boundary rounds outside them', async () => {
    const request = {
      ...fixture.request,
      samplingRequest: { ...fixture.request.samplingRequest, targetEdgeMm: 50 },
    };
    const result = await compileDxfGarmentAssemblyMaterialStageV1(request);
    expect(result).toMatchObject({ ok: false, compiled: false, blockers: [{ stage: 'material' }] });
    expect(result.blockers[0].detail).toContain('solver-range-rejection');
  });
  it('captures all input before the first asynchronous digest, without reading accessors', async () => {
    const get = vi.fn(() => fixture.request.handoff);
    const hostile = { ...fixture.request };
    Object.defineProperty(hostile, 'handoff', { get, enumerable: true });
    expect(await compileDxfGarmentAssemblyMaterialStageV1(hostile)).toMatchObject({
      ok: false,
      compiled: false,
      blockers: [{ code: 'invalid-input' }],
    });
    expect(get).not.toHaveBeenCalled();
    const request = structuredClone(fixture.request);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      Object.assign(request.handoff.source, { revision: 'changed-after-capture' });
      return digest(algorithm, data);
    });
    try {
      const result = await compileDxfGarmentAssemblyMaterialStageV1(request);
      if (!result.ok) throw new Error(JSON.stringify(result.blockers));
      expect(result.artifact.sourceEvidence.handoff.source.revision).toBe('1');
    } finally {
      spy.mockRestore();
    }
  });
  it('rejects invalid/pre-aborted signals and cancellation during digest without publishing output', async () => {
    expect(
      await compileDxfGarmentAssemblyMaterialStageV1(fixture.request, {
        aborted: false,
      } as AbortSignal),
    ).toMatchObject({ ok: false, compiled: false, artifact: null });
    const caller = new AbortController();
    caller.abort();
    expect(
      await compileDxfGarmentAssemblyMaterialStageV1(fixture.request, caller.signal),
    ).toMatchObject({ ok: false, compiled: false, blockers: [{ code: 'aborted' }] });
    const pending = new AbortController();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      pending.abort();
      return digest(algorithm, data);
    });
    try {
      expect(
        await compileDxfGarmentAssemblyMaterialStageV1(fixture.request, pending.signal),
      ).toMatchObject({
        ok: false,
        compiled: false,
        artifact: null,
        blockers: [{ code: 'aborted' }],
      });
    } finally {
      spy.mockRestore();
    }
  });
});
