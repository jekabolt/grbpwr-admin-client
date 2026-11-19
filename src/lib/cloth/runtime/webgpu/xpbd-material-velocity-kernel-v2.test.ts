import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeClothMaterialGpuV1 } from '../../compiler/material-package';
import { compileDxfGarmentAssemblyMaterialStageV1 } from '../../domain/dxf-garment-assembly-material-compile-stage-v1';
import { createThreePanelDxfMaterialCompileFixtureV1 } from '../../domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import {
  XPBD_VELOCITY_DIAGNOSTIC_SOURCE_SHA256_V1,
  XPBD_VELOCITY_DIAGNOSTIC_WGSL,
} from './xpbd-invalid-state-kernel';
import {
  XPBD_MATERIAL_VELOCITY_ABI_V2,
  XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2,
  XPBD_MATERIAL_VELOCITY_WGSL_V2,
  createXpbdMaterialVelocityDiagnosticsV2,
  decodeXpbdMaterialVelocityParamsV2,
  deriveXpbdParticleMaterialRetentionV2,
  encodeXpbdMaterialVelocityParamsV2,
  finalizeXpbdMaterialVelocityV2ForOracle,
  getXpbdMaterialVelocityPipelineIdentityV2,
  validateXpbdMaterialVelocityBufferContractV2,
  xpbdMaterialVelocityShaderDescriptorV2,
  xpbdMaterialVelocityWorkgroupsV2,
} from './xpbd-material-velocity-kernel-v2';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const bits = (value: Float32Array) => new Uint32Array(value.buffer, value.byteOffset, value.length);
const oracleInput = () => ({
  dtS: 0.25,
  positionsMInvMassKg: new Float32Array([1, 2, 3, 2, 1, 2, 3, 4, 9, 9, 9, 7]),
  previousPositionsMInvMassKg: new Float32Array([0, 0, 0, 2, 0, 0, 0, 4, NaN, NaN, NaN, 8]),
  velocitiesMps: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, NaN, NaN, NaN, NaN]),
  restPositionsMInvMassKg: new Float32Array([0, 0, 0, 2, 0, 0, 0, 4, -0, 0.5, -0, -0]),
  velocityRetentionPerStep: new Float32Array([0.5, 0.75, NaN]),
});

// These tests inspect CPU arithmetic/packing. They neither compile WGSL on a GPU nor qualify a run.
describe('material velocity V2 CPU contract, no GPU/runtime admission', () => {
  it('derives different per-particle retention from genuine three-panel DXF + exact two-material compile', async () => {
    const fixture = await createThreePanelDxfMaterialCompileFixtureV1();
    const compiled = await compileDxfGarmentAssemblyMaterialStageV1(fixture.request);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled));
    const { material } = compiled.artifact.compiledSimulation;
    const ranges = compiled.artifact.refinement.mesh.pieceRanges;
    const originalRecords = new Uint8Array(material.materialRecords.slice(0));
    const result = deriveXpbdParticleMaterialRetentionV2(material, ranges);
    expect(result.velocityRetentionPerStep).toHaveLength(78);
    expect(material.manifest).toMatchObject({ triangleCount: 114, materialCount: 2 });
    expect(new Set(result.particleMaterialIndices)).toEqual(new Set([0, 1]));
    const light = decodeClothMaterialGpuV1(material.materialRecords, 0).velocityRetentionPerStep;
    const medium = decodeClothMaterialGpuV1(material.materialRecords, 1).velocityRetentionPerStep;
    expect(light).toBe(Math.fround(0.995));
    expect(medium).toBe(Math.fround(0.992));
    for (const range of ranges) {
      const expected = range.pieceId === 'panel-b' ? light : medium;
      expect(
        [
          ...result.velocityRetentionPerStep.slice(
            range.vertexOffset,
            range.vertexOffset + range.vertexCount,
          ),
        ].every((value) => value === expected),
      ).toBe(true);
    }
    const count = material.manifest.particleCount;
    const rest = new Float32Array(count * 4);
    const next = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      rest[i * 4 + 3] = next[i * 4 + 3] = 1;
      next[i * 4] = 0.25;
    }
    const output = finalizeXpbdMaterialVelocityV2ForOracle({
      dtS: 0.25,
      positionsMInvMassKg: next,
      previousPositionsMInvMassKg: rest,
      restPositionsMInvMassKg: rest,
      velocitiesMps: new Float32Array(count * 4),
      velocityRetentionPerStep: result.velocityRetentionPerStep,
    });
    for (let i = 0; i < count; i++)
      expect(output.velocitiesMps[i * 4]).toBe(result.velocityRetentionPerStep[i]);
    expect(output.diagnostics).toEqual(createXpbdMaterialVelocityDiagnosticsV2());
    expect(new Uint8Array(material.materialRecords)).toEqual(originalRecords);
    result.velocityRetentionPerStep.fill(0);
    expect(
      new Set(
        deriveXpbdParticleMaterialRetentionV2(
          material,
          [...ranges].reverse(),
        ).velocityRetentionPerStep,
      ),
    ).toEqual(new Set([light, medium]));

    const swappedRecords = material.materialRecords.slice(0);
    const swappedBytes = new Uint8Array(swappedRecords);
    swappedBytes.set(originalRecords.subarray(80), 0);
    swappedBytes.set(originalRecords.subarray(0, 80), 80);
    const swappedIndices = material.triangleMaterialIndices.slice(0);
    const view = new DataView(swappedIndices);
    for (let i = 0; i < material.manifest.triangleCount; i++)
      view.setUint32(i * 4, 1 - view.getUint32(i * 4, true), true);
    expect(
      deriveXpbdParticleMaterialRetentionV2(
        { ...material, materialRecords: swappedRecords, triangleMaterialIndices: swappedIndices },
        ranges,
      ).velocityRetentionPerStep,
    ).toEqual(deriveXpbdParticleMaterialRetentionV2(material, ranges).velocityRetentionPerStep);

    const changed = material.triangleMaterialIndices.slice(0);
    const changedView = new DataView(changed);
    changedView.setUint32(4, 1 - changedView.getUint32(0, true), true);
    expect(() =>
      deriveXpbdParticleMaterialRetentionV2(
        { ...material, triangleMaterialIndices: changed },
        ranges,
      ),
    ).toThrow(/mixed/);
    expect(() => deriveXpbdParticleMaterialRetentionV2(material, ranges.slice(1))).toThrow(
      /incomplete/,
    );
    expect(() => deriveXpbdParticleMaterialRetentionV2(material, [...ranges, ranges[0]])).toThrow(
      /unique/,
    );
    expect(() =>
      deriveXpbdParticleMaterialRetentionV2(
        material,
        ranges.map((range, i) =>
          i === 1 ? { ...range, vertexOffset: ranges[0].vertexOffset } : range,
        ),
      ),
    ).toThrow(/overlap/);
    const crossPiece = material.triangleIndices.slice(0);
    new DataView(crossPiece).setUint32(0, ranges[1].vertexOffset, true);
    expect(() =>
      deriveXpbdParticleMaterialRetentionV2({ ...material, triangleIndices: crossPiece }, ranges),
    ).toThrow(/different piece/);
    const badRetention = material.materialRecords.slice(0);
    new DataView(badRetention).setFloat32(28, NaN, true);
    expect(() =>
      deriveXpbdParticleMaterialRetentionV2({ ...material, materialRecords: badRetention }, ranges),
    ).toThrow(/retention/);
    const badIndex = material.triangleMaterialIndices.slice(0);
    new DataView(badIndex).setUint32(0, 2, true);
    expect(() =>
      deriveXpbdParticleMaterialRetentionV2(
        { ...material, triangleMaterialIndices: badIndex },
        ranges,
      ),
    ).toThrow(/invalid/);
    expect(() =>
      deriveXpbdParticleMaterialRetentionV2(
        { ...material, triangleIndices: material.triangleIndices.slice(16) },
        ranges,
      ),
    ).toThrow(/extent/);
  });

  it('uses distinct retention, preserves W, exactly resets signed-zero pins, and does not mutate inputs', () => {
    const input = oracleInput();
    const before = Object.values(input)
      .filter((value): value is Float32Array<ArrayBuffer> => value instanceof Float32Array)
      .map((value) => new Uint32Array(bits(value)));
    const result = finalizeXpbdMaterialVelocityV2ForOracle(input);
    expect([...result.velocitiesMps]).toEqual([2, 4, 6, 0, 3, 6, 9, 0, 0, 0, 0, 0]);
    expect(result.positionsMInvMassKg[3]).toBe(2);
    expect(result.positionsMInvMassKg[7]).toBe(4);
    expect(bits(result.positionsMInvMassKg.subarray(8))).toEqual(
      bits(input.restPositionsMInvMassKg.subarray(8)),
    );
    expect(result.diagnostics).toEqual(createXpbdMaterialVelocityDiagnosticsV2());
    expect(result).toMatchObject({ arithmetic: 'f32-per-operation', gpuExecutionClaimed: false });
    expect(
      Object.values(input)
        .filter((value): value is Float32Array<ArrayBuffer> => value instanceof Float32Array)
        .map(bits),
    ).toEqual(before);
  });

  it.each([
    [
      'previous NaN',
      (input: ReturnType<typeof oracleInput>) => {
        input.previousPositionsMInvMassKg[0] = NaN;
      },
    ],
    [
      'incoming velocity infinity',
      (input: ReturnType<typeof oracleInput>) => {
        input.velocitiesMps[1] = Infinity;
      },
    ],
    [
      'velocity W',
      (input: ReturnType<typeof oracleInput>) => {
        input.velocitiesMps[3] = 1;
      },
    ],
    [
      'current W drift',
      (input: ReturnType<typeof oracleInput>) => {
        input.positionsMInvMassKg[3] = 1;
      },
    ],
    [
      'previous W drift',
      (input: ReturnType<typeof oracleInput>) => {
        input.previousPositionsMInvMassKg[3] = 1;
      },
    ],
    [
      'retention negative',
      (input: ReturnType<typeof oracleInput>) => {
        input.velocityRetentionPerStep[0] = -0.1;
      },
    ],
    [
      'retention above one',
      (input: ReturnType<typeof oracleInput>) => {
        input.velocityRetentionPerStep[0] = 1.1;
      },
    ],
    [
      'retention NaN',
      (input: ReturnType<typeof oracleInput>) => {
        input.velocityRetentionPerStep[0] = NaN;
      },
    ],
    [
      'derived velocity overflow',
      (input: ReturnType<typeof oracleInput>) => {
        input.dtS = 1e-40;
      },
    ],
  ])('rejects %s, diagnoses it and rolls back the affected free particle', (_label, change) => {
    const input = oracleInput();
    change(input);
    const output = finalizeXpbdMaterialVelocityV2ForOracle(input);
    expect(output.diagnostics[0]).toBeGreaterThanOrEqual(1);
    expect(output.diagnostics[1]).toBe(output.diagnostics[0]);
    expect(output.diagnostics[2]).toBe(0);
    expect(output.diagnostics[3]).toBe(0);
    expect(output.diagnostics[4]).toBe(0);
    expect(output.diagnostics[5]).toBe(0xffff_ffff);
    expect(output.diagnostics[7]).toBe(0);
    expect(output.positionsMInvMassKg.subarray(0, 4)).toEqual(
      input.restPositionsMInvMassKg.subarray(0, 4),
    );
    expect([...output.velocitiesMps.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  it('distinguishes exact domain boundary failures in current/previous from numeric errors', () => {
    const input = oracleInput();
    input.positionsMInvMassKg[0] = 100;
    input.previousPositionsMInvMassKg[5] = -125;
    const result = finalizeXpbdMaterialVelocityV2ForOracle(input);
    expect([...result.diagnostics]).toEqual([
      2,
      0,
      2,
      0,
      0xffff_ffff,
      0,
      new Uint32Array(new Float32Array([125]).buffer)[0],
      0,
    ]);
    expect(result.positionsMInvMassKg).toEqual(input.restPositionsMInvMassKg);
  });

  it('never rolls back into an invalid immutable anchor', () => {
    const input = oracleInput();
    input.restPositionsMInvMassKg[0] = NaN;
    input.restPositionsMInvMassKg[5] = 100;
    const result = finalizeXpbdMaterialVelocityV2ForOracle(input);
    expect(result.positionsMInvMassKg.subarray(0, 8)).toEqual(
      input.positionsMInvMassKg.subarray(0, 8),
    );
    expect([...result.velocitiesMps.subarray(0, 8)]).toEqual(new Array(8).fill(0));
    expect([...result.diagnostics.subarray(0, 6)]).toEqual([2, 1, 1, 0, 0, 1]);
  });

  it('admits exact retention endpoints and checks f32 intermediate rounding', () => {
    const input = oracleInput();
    input.velocityRetentionPerStep[0] = 0;
    input.velocityRetentionPerStep[1] = 1;
    expect([
      ...finalizeXpbdMaterialVelocityV2ForOracle(input).velocitiesMps.subarray(0, 8),
    ]).toEqual([0, 0, 0, 0, 4, 8, 12, 0]);
    input.dtS = 1 / 120;
    input.positionsMInvMassKg[0] = 0.037;
    input.previousPositionsMInvMassKg[0] = 0.004;
    input.velocityRetentionPerStep[0] = 0.992;
    const expected = Math.fround(
      Math.fround(
        Math.fround(input.positionsMInvMassKg[0] - input.previousPositionsMInvMassKg[0]) /
          Math.fround(input.dtS),
      ) * input.velocityRetentionPerStep[0],
    );
    expect(finalizeXpbdMaterialVelocityV2ForOracle(input).velocitiesMps[0]).toBe(expected);
  });

  it('packs exact params, rejects invalid dt/count/padding and bounds exact dispatch', () => {
    const params = encodeXpbdMaterialVelocityParamsV2({ dtS: 1 / 120, particleCount: 78 });
    expect(params.byteLength).toBe(16);
    expect(decodeXpbdMaterialVelocityParamsV2(params)).toEqual({
      dtS: Math.fround(1 / 120),
      particleCount: 78,
    });
    for (const dtS of [0, -1, NaN, Infinity, 1e40, 1e-50])
      expect(() => encodeXpbdMaterialVelocityParamsV2({ dtS, particleCount: 78 })).toThrow();
    for (const count of [0, -1, 1.5, 0x1_0000_0000])
      expect(() => xpbdMaterialVelocityWorkgroupsV2(count)).toThrow();
    expect(xpbdMaterialVelocityWorkgroupsV2(1)).toBe(1);
    expect(xpbdMaterialVelocityWorkgroupsV2(64)).toBe(1);
    expect(xpbdMaterialVelocityWorkgroupsV2(78)).toBe(2);
    expect(xpbdMaterialVelocityWorkgroupsV2(65535 * 64)).toBe(65535);
    expect(() => xpbdMaterialVelocityWorkgroupsV2(65535 * 64 + 1)).toThrow(/limit/);
    expect(() => xpbdMaterialVelocityWorkgroupsV2(78, 1)).toThrow(/limit/);
    new DataView(params).setUint32(12, 1, true);
    expect(() => decodeXpbdMaterialVelocityParamsV2(params)).toThrow(/padding/);
    expect(() => decodeXpbdMaterialVelocityParamsV2(new ArrayBuffer(32))).toThrow(/16-byte/);
    const input = oracleInput();
    input.velocityRetentionPerStep = new Float32Array(2);
    expect(() => finalizeXpbdMaterialVelocityV2ForOracle(input)).toThrow(/extent/);
  });

  it('validates exact per-buffer memory/usage and actual device dispatch limits', () => {
    const data = () => ({ size: 78 * 16, usage: 0x88 });
    const resources = {
      positionsMInvMassKg: data(),
      previousPositionsMInvMassKg: data(),
      velocitiesMps: data(),
      restPositionsMInvMassKg: data(),
      params: { size: 16, usage: 0x48 },
      diagnostics: { size: 32, usage: 0x88 },
      velocityRetentionPerStep: { size: 78 * 4, usage: 0x88 },
    };
    const limits = {
      maxBufferSize: 2048,
      maxStorageBufferBindingSize: 2048,
      maxComputeWorkgroupsPerDimension: 2,
    };
    expect(() => validateXpbdMaterialVelocityBufferContractV2(resources, 78, limits)).not.toThrow();
    for (const key of Object.keys(resources) as (keyof typeof resources)[]) {
      expect(() =>
        validateXpbdMaterialVelocityBufferContractV2(
          { ...resources, [key]: { ...resources[key], size: resources[key].size + 4 } },
          78,
          limits,
        ),
      ).toThrow();
      expect(() =>
        validateXpbdMaterialVelocityBufferContractV2(
          { ...resources, [key]: { ...resources[key], usage: 0 } },
          78,
          limits,
        ),
      ).toThrow();
    }
    expect(() =>
      validateXpbdMaterialVelocityBufferContractV2(resources, 78, {
        ...limits,
        maxStorageBufferBindingSize: 1024,
      }),
    ).toThrow();
    expect(() =>
      validateXpbdMaterialVelocityBufferContractV2(resources, 78, {
        ...limits,
        maxComputeWorkgroupsPerDimension: 1,
      }),
    ).toThrow();
    expect(XPBD_MATERIAL_VELOCITY_ABI_V2).toMatchObject({
      paramsByteLength: 16,
      diagnosticsByteLength: 32,
      bindingCounts: { storage: 6, uniform: 1, total: 7 },
      runtimeAuthority: false,
    });
    expect(XPBD_MATERIAL_VELOCITY_ABI_V2.diagnosticsOffsets).toEqual({
      invalidStateCount: 0,
      numericInvalidStateCount: 4,
      outOfDomainStateCount: 8,
      minimumInvalidParticleIndex: 12,
      minimumNumericInvalidParticleIndex: 16,
      minimumOutOfDomainParticleIndex: 20,
      maxOutOfDomainAbsPositionBits: 24,
      reservedZero: 28,
    });
  });

  it('pins the exact additive WGSL source while leaving legacy V1 bytes and identity unchanged', async () => {
    expect(sha(XPBD_MATERIAL_VELOCITY_WGSL_V2)).toBe(XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2);
    expect(
      await getXpbdMaterialVelocityPipelineIdentityV2({ crypto: webcrypto as unknown as Crypto }),
    ).toMatchObject({
      sha256: XPBD_MATERIAL_VELOCITY_SOURCE_SHA256_V2,
      entryPoint: 'finalizeMaterialVelocityV2',
    });
    await expect(getXpbdMaterialVelocityPipelineIdentityV2({ crypto: null })).rejects.toThrow(
      /Crypto/,
    );
    expect(xpbdMaterialVelocityShaderDescriptorV2().code).toBe(XPBD_MATERIAL_VELOCITY_WGSL_V2);
    expect(XPBD_MATERIAL_VELOCITY_WGSL_V2).not.toContain('ptr<storage');
    expect(XPBD_MATERIAL_VELOCITY_WGSL_V2).toContain(
      'arrayLength(&retention) == params.particleCount',
    );
    expect(XPBD_MATERIAL_VELOCITY_WGSL_V2).toContain('all(groups == vec3<u32>(expectedX, 1u, 1u))');
    expect(sha(XPBD_VELOCITY_DIAGNOSTIC_WGSL)).toBe(XPBD_VELOCITY_DIAGNOSTIC_SOURCE_SHA256_V1);
    expect(sha(readFileSync(new URL('./xpbd-invalid-state-kernel.ts', import.meta.url)))).toBe(
      '4824045bc9f95e75893297634db38f7ea58965be0f1c085b85ae14cf3f467b8c',
    );
  });
});
