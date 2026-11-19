import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from './triangle-strain-render-order-v1.test-fixture.json';
import { mapTriangleStrainToRenderOrderV1 } from './triangle-strain-render-order-v1';

const hash = (value: ArrayBufferView) =>
  createHash('sha256')
    .update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    .digest('hex');
function small() {
  return {
    normalizedTopology: new Uint32Array([0, 1, 2, 2, 1, 3, 2, 3, 4]),
    continuumTriangleIndices: new Uint32Array([3, 4, 2, 0, 0, 1, 2, 0, 2, 1, 3, 0]).buffer,
    triangleValues: new Float32Array([20, 21, 22, 0.25, 0, 1, 2, 0.5, 10, 11, 12, 1.5]),
    validityFlags: new Uint32Array([2, 4, 8]),
  };
}

describe('pure strain render-order content conversion; no GPU or owner authority', () => {
  it('moves each complete value tuple and flag to its exact oriented render triangle', async () => {
    const input = small();
    const result = await mapTriangleStrainToRenderOrderV1(input);
    expect(Array.from(result.continuumToRenderTriangleIndices)).toEqual([2, 0, 1]);
    expect(Array.from(result.renderToContinuumTriangleIndices)).toEqual([1, 2, 0]);
    expect(Array.from(result.orderedTriangleValues)).toEqual([
      0, 1, 2, 0.5, 10, 11, 12, 1.5, 20, 21, 22, 0.25,
    ]);
    expect(Array.from(result.orderedValidityFlags)).toEqual([4, 8, 2]);
    expect(result.receipt).toMatchObject({
      rawTriangleValuesSha256: hash(input.triangleValues),
      rawValidityFlagsSha256: hash(input.validityFlags),
      orderedTriangleValuesSha256: hash(result.orderedTriangleValues),
      orderedValidityFlagsSha256: hash(result.orderedValidityFlags),
      continuumToRenderTriangleIndicesSha256: hash(result.continuumToRenderTriangleIndices),
      authority: 'content-only-no-owner-or-runtime-admission',
    });
    expect(result.receipt.rawTriangleValuesSha256).not.toBe(
      result.receipt.orderedTriangleValuesSha256,
    );
  });

  it('reproduces actual captured912-triangle mapping with only2 identity ordinals', async () => {
    const topology = new Uint32Array(fixture.normalizedTopology.values);
    const continuum = new Uint32Array(fixture.continuumTriangleIndices.values);
    expect(hash(topology)).toBe(fixture.normalizedTopology.sha256);
    expect(hash(continuum)).toBe(fixture.continuumTriangleIndices.sha256);
    const values = new Float32Array(912 * 4);
    const flags = new Uint32Array(912);
    for (let i = 0; i < 912; i++) {
      values.set([i, -i, i + 0.25, i / 912], i * 4);
      flags[i] = i;
    }
    const result = await mapTriangleStrainToRenderOrderV1({
      normalizedTopology: topology,
      continuumTriangleIndices: continuum.buffer,
      triangleValues: values,
      validityFlags: flags,
    });
    expect(result.receipt.continuumToRenderTriangleIndicesSha256).toBe(
      fixture.expectedContinuumToRenderSha256,
    );
    expect(
      Array.from(result.continuumToRenderTriangleIndices).filter((v, i) => v === i),
    ).toHaveLength(2);
    expect(new Set(result.continuumToRenderTriangleIndices).size).toBe(912);
    for (let i = 0; i < 912; i++) {
      const render = result.continuumToRenderTriangleIndices[i]!;
      expect(Array.from(result.orderedTriangleValues.slice(render * 4, render * 4 + 4))).toEqual(
        Array.from(values.slice(i * 4, i * 4 + 4)),
      );
      expect(result.orderedValidityFlags[render]).toBe(i);
    }
    expect([2, 456, 114, 571].map((i) => result.renderToContinuumTriangleIndices[i])).toEqual([
      345, 90, 213, 431,
    ]);
  });

  it('captures all input bytes before the first await and returns independent copies', async () => {
    const input = small(),
      original = new Float32Array(input.triangleValues);
    const pending = mapTriangleStrainToRenderOrderV1(input);
    input.triangleValues.fill(99);
    input.normalizedTopology.fill(99);
    input.validityFlags.fill(99);
    new Uint32Array(input.continuumTriangleIndices).fill(99);
    const result = await pending;
    expect(result.receipt.rawTriangleValuesSha256).toBe(hash(original));
    expect(result.orderedTriangleValues[3]).toBe(0.5);
    result.orderedTriangleValues.fill(-1);
    result.continuumToRenderTriangleIndices.fill(0);
    expect(Array.from(input.triangleValues)).toEqual(Array(12).fill(99));
    expect((await mapTriangleStrainToRenderOrderV1(small())).orderedTriangleValues[3]).toBe(0.5);
  });

  it.each([
    'reversed',
    'missing',
    'duplicate-continuum',
    'duplicate-render',
    'degenerate',
    'reserved',
  ] as const)(
    'refuses %s topology instead of falling back to ordinal or coordinate matching',
    async (kind) => {
      const input = small(),
        continuum = new Uint32Array(input.continuumTriangleIndices);
      if (kind === 'reversed') continuum.set([4, 3, 2], 0);
      if (kind === 'missing') continuum[0] = 9;
      if (kind === 'duplicate-continuum') continuum.set(continuum.slice(0, 4), 4);
      if (kind === 'duplicate-render') input.normalizedTopology.set([1, 2, 0], 3);
      if (kind === 'degenerate') input.normalizedTopology[1] = 0;
      if (kind === 'reserved') continuum[3] = 1;
      await expect(mapTriangleStrainToRenderOrderV1(input)).rejects.toThrow();
    },
  );

  it.each([
    'short-topology',
    'short-continuum',
    'short-values',
    'short-flags',
    'nonfinite',
    'empty',
    'alias',
  ] as const)('refuses %s content before publishing a receipt', async (kind) => {
    const input = small();
    if (kind === 'short-topology') input.normalizedTopology = input.normalizedTopology.slice(1);
    if (kind === 'short-continuum')
      input.continuumTriangleIndices = input.continuumTriangleIndices.slice(4);
    if (kind === 'short-values') input.triangleValues = input.triangleValues.slice(1);
    if (kind === 'short-flags') input.validityFlags = input.validityFlags.slice(1);
    if (kind === 'nonfinite') input.triangleValues[2] = Infinity;
    if (kind === 'empty') input.normalizedTopology = new Uint32Array();
    if (kind === 'alias')
      input.validityFlags = new Uint32Array(input.normalizedTopology.buffer, 0, 3);
    await expect(mapTriangleStrainToRenderOrderV1(input)).rejects.toThrow();
  });

  it('rejects accessor requests without invoking the getter and refuses structural/proxy buffers', async () => {
    let calls = 0;
    const input = small();
    Object.defineProperty(input, 'triangleValues', {
      get() {
        calls++;
        throw new Error('not called');
      },
    });
    await expect(mapTriangleStrainToRenderOrderV1(input)).rejects.toThrow(/own data/);
    expect(calls).toBe(0);
    const proxy = small();
    proxy.normalizedTopology = new Proxy(proxy.normalizedTopology, {
      get() {
        calls++;
        throw new Error('not called');
      },
    });
    await expect(mapTriangleStrainToRenderOrderV1(proxy)).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it('rejects oversized, shared and detached storage before copying or hashing it', async () => {
    const oversized = small();
    oversized.normalizedTopology = new Uint32Array(3 * 1_000_001);
    await expect(mapTriangleStrainToRenderOrderV1(oversized)).rejects.toThrow(/dimensions/);
    const shared = { ...small(), normalizedTopology: new Uint32Array(new SharedArrayBuffer(36)) };
    await expect(mapTriangleStrainToRenderOrderV1(shared)).rejects.toThrow();
    const detached = small();
    structuredClone(detached.triangleValues.buffer, { transfer: [detached.triangleValues.buffer] });
    await expect(mapTriangleStrainToRenderOrderV1(detached)).rejects.toThrow(/dimensions/);
  });

  it('preserves the raw Float32 bit values including negative zero through the permutation', async () => {
    const input = small();
    input.triangleValues[4] = -0;
    const result = await mapTriangleStrainToRenderOrderV1(input);
    expect(Object.is(result.orderedTriangleValues[0], -0)).toBe(true);
    expect(new Uint32Array(result.orderedTriangleValues.buffer)[0]).toBe(0x80000000);
    expect(result.receipt.rawTriangleValuesSha256).toBe(hash(input.triangleValues));
  });
});
