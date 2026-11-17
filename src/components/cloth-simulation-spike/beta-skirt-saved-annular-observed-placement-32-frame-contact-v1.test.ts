import { createHash } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  runBetaSkirtSavedAnnularObservedPlacement32FrameContactV1 as run,
  projectBetaSkirtSavedAnnularObservedPlacement32FrameContactV1 as project,
  getBetaSkirtSavedAnnularObservedPlacement32FrameContactLifetimeV1 as lifetime,
  disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1 as dispose,
} from './beta-skirt-saved-annular-observed-placement-32-frame-contact-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4 as canonicalProject,
  disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4 as canonicalDispose,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';
import { evaluateBetaSkirtCoherentEnvelopeQualityV1 } from './beta-skirt-coherent-envelope-quality-evidence-v1';
import { betaSkirtSaved32SelfOrientationValidationV1 as physicalValidators } from './beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-v1';

import { withObservedPlacementDisplayedBodyPairSourceV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import * as pairApi from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1';
import * as worldApi from './beta-skirt-saved-annular-observed-placement-displayed-body-world-initial-preflight-v1';
import * as sourceApi from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';

// Only nominal station assets, transport and cube host observation are fixtures.
// Composer, garment, observed target, pair, world and runtime-source owners/diagnostics execute genuinely.
vi.mock('lib/cloth/body/measurement-open-reference-display-v1', async (original) => ({
  ...(await original<typeof import('lib/cloth/body/measurement-open-reference-display-v1')>()),
  loadMakeHumanOpenReferenceBasisV1: async () => ({ kind: 'female' }),
}));
vi.mock('lib/cloth/body/makehuman-torso-shape-delta-bundle-v1', () => ({
  loadMakeHumanTorsoShapeDeltaBundleV1: async () => ({}),
}));
vi.mock('lib/cloth/body/makehuman-uniform-waist-hip-modes-v1', () => ({
  createMakeHumanUniformWaistHipModesV1: () => ({
    basisKind: 'female',
    modes: [
      { measurementKey: 'waistCircumferenceMm', stationOriginM: [0, 1.2, 0] },
      { measurementKey: 'hipCircumferenceMm', stationOriginM: [0, 1, 0] },
    ],
  }),
}));

// Captured BEFORE edits from SHA55aa46f8… /59ae5883… /0bb7d58d… .
// These tests prove compatibility/negative admission and pure diagnostics, never positive GPU authority.
const BASELINE: Record<string, string> = {
  runBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4:
    '2c85ffb61f1601f58b45f7aa498a2d12002d32ce7af195451465eefab885ef77',
  canonicalReportPayload: '63a55512026cfa45374cf888e5fe58a6e0d580b0960cc6ed306ae9fc0ade28e0',
  prepareRun: '16523aa69f809d2d8dce4139603076615a16ffd3ae70b131b56fee8f5a79ac29',
  inspectFinalState: '0cf97c6bf17c55dc8d028c4d795d68f938114cf7b8a5db7776d0f9e6f94ccb78',
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4:
    'be19db141cb3d742ec183f1c20bab2e63c41da2e04eb19b44ac36cd1a1a60994',
  disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4:
    'a2e21488e19cc09e50c273d5f33fcad7c651fa1b916f81bf42983cbd8eb6b45c',
  reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4:
    '86e621be242e2862a36646b77513200e8127bfa19ac3c84c41d0c3e9a059250d',
  hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4:
    '5a740d0a681ecb5f195084c9ce4d7ad7c97b0d37776f4059cd3ca194da08d7d2',
  orientation: 'b2fc951192582a89210d186da3a8075ee9162d8d36d25795b905506dc49c31ca',
  seamPinParity: '0a626a651d2254737220b3f1a5209058bb8ca3ce88410b0b9762bbc1191a5a08',
  evaluateBetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationV1:
    'aacba5a1bf74d7a4da6d315ac096cf2f58bb9f45f46a63a405fc938ce9c87cea',
};
const runnerFile = './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4.ts';
function sourceFile(path = runnerFile) {
  return ts.createSourceFile(
    path,
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}
function coreHashes() {
  const hashes: Record<string, string> = {};
  for (const path of [
    runnerFile,
    './beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-contract-v4.ts',
    './beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-v1.ts',
  ]) {
    const source = sourceFile(path);
    const printer = ts.createPrinter({ removeComments: true });
    const hash = (node: ts.Node, stripLifecycle = false) => {
      const printed = printer.printNode(ts.EmitHint.Unspecified, node, source);
      return createHash('sha256')
        .update(stripLifecycle ? printed.replace(/^\s*currentSource\?\.\(\);\n/gm, '') : printed)
        .digest('hex');
    };
    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.body &&
        Object.hasOwn(BASELINE, node.name.text)
      )
        hashes[node.name.text] = hash(node.body, node.name.text === 'executeGpuRun');
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'reportWithoutSeal' &&
        node.initializer
      )
        hashes.canonicalReportPayload = hash(node.initializer);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return hashes;
}
/** Execute only exact private pure helpers, with no owner registry/GPU success stub. */
function privateHelpers(names: string[], globals: Record<string, unknown> = {}) {
  const source = sourceFile(),
    declarations: ts.FunctionDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text))
      declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(declarations).toHaveLength(names.length);
  const text = declarations
    .map((node) => ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, source))
    .join('\n');
  const script = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
  }).outputText;
  return runInNewContext(script + '\n({' + names.join(',') + '});', globals);
}

describe('observed32 fixed source/16 boundary, shared kernel compatibility; CPU only', () => {
  it('preserves canonical run/report/project/dispose, preparation, checkpoint ABI and validators; executor trace covered separately', () => {
    expect(coreHashes()).toEqual(BASELINE);
  });
  it('rejects every structural/cross-kind owner before GPU provider access and without invoking getters', async () => {
    let touches = 0;
    const hostile = Object.defineProperty({}, 'report', {
      get() {
        touches++;
        throw new Error('owner getters forbidden');
      },
    });
    const options = Object.defineProperty({}, 'gpu', {
      get() {
        touches++;
        throw new Error('GPU allocation forbidden');
      },
    });
    for (const value of [
      hostile,
      {},
      null,
      { version: 'beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner/4' },
    ]) {
      expect(await run({} as HTMLCanvasElement, value, value, options)).toMatchObject({
        ok: false,
        code: 'observed-source-or16-owner-unavailable',
      });
      expect(await project(value)).toBeNull();
      expect(lifetime(value)).toBeNull();
      expect(dispose(value)).toBe(false);
      expect(canonicalProject(value)).toBeNull();
      expect(canonicalDispose(value)).toBe(false);
    }
    expect(touches).toBe(0);
  });
  it('native caller signal brand rejects structural signal; pre-abort allocates nothing', async () => {
    let touches = 0;
    const options = Object.defineProperty({}, 'gpu', {
      get() {
        touches++;
        throw new Error('GPU allocation forbidden');
      },
    });
    const controller = new AbortController();
    controller.abort();
    expect(
      await run({} as HTMLCanvasElement, {}, {}, {
        ...Object.getOwnPropertyDescriptors(options),
        signal: controller.signal,
      } as never),
    ).toMatchObject({ ok: false, code: 'aborted' });
    const invalid = Object.create(null);
    Object.defineProperty(invalid, 'aborted', {
      get() {
        touches++;
        return false;
      },
    });
    expect(await run({} as HTMLCanvasElement, {}, {}, { signal: invalid })).toMatchObject({
      ok: false,
      code: 'observed32-input-or-execution-blocked',
    });
    expect(await project({}, invalid)).toBeNull();
    expect(touches).toBe(0);
  });
  it('compares all 9280 vec4 bytes,6960 vec3 bytes and3728 ABI bytes including signed zero and final words', () => {
    const { observed32CheckpointMatches: matches } = privateHelpers(
      ['observed32CheckpointMatches', 'bytesEqual'],
      { PARTICLE_COUNT: 580, CapturedUint8Array: Uint8Array },
    ) as {
      observed32CheckpointMatches: (
        a: ReturnType<typeof tuple>,
        b: ReturnType<typeof tuple>,
      ) => boolean;
    };
    function tuple() {
      return {
        positions4: new Float32Array(580 * 4),
        positions3: new Float32Array(580 * 3),
        diagnostics: new Uint8Array(3728),
      };
    }
    const expected = tuple();
    expect(matches(tuple(), expected)).toBe(true);
    const w = tuple();
    w.positions4[w.positions4.length - 1] = 1;
    expect(matches(w, expected)).toBe(false);
    const xyz = tuple();
    xyz.positions3[xyz.positions3.length - 1] = -0;
    expect(matches(xyz, expected)).toBe(false);
    const abi = tuple();
    abi.diagnostics[3727] = 1;
    expect(matches(abi, expected)).toBe(false);
    expect(matches({ ...tuple(), diagnostics: new Uint8Array(3727) }, expected)).toBe(false);
    expect(matches({ ...tuple(), positions4: new Float32Array(2319) }, expected)).toBe(false);
  });
  it('rejects saturated, out-of-workload and decreasing cumulative bend limiter counts', () => {
    const { observed32BendCountersValid: valid } = privateHelpers(['observed32BendCountersValid'], {
      BEND_COUNT: 1246,
      FIXED_ITERATIONS: 8,
      FRAME_16_CHECKPOINT_COUNT: 16,
      FRAME_COUNT: 32,
    }) as { observed32BendCountersValid: (checkpoint: number, final: number) => boolean };
    expect(valid(0, 0)).toBe(true);
    expect(valid(159488, 318976)).toBe(true);
    expect(valid(1272, 1544)).toBe(true);
    for (const [checkpoint, final] of [
      [1, 0],
      [159489, 159489],
      [0, 318977],
      [0, 0xffffffff],
      [NaN, 0],
      [-1, 0],
      [0.5, 1],
    ])
      expect(valid(checkpoint!, final!)).toBe(false);
  });
  it('copies source and candidate topology separately for the real non-aliasing quality diagnostic', () => {
    const { evaluateObserved32Quality: evaluate } = privateHelpers(['evaluateObserved32Quality'], {
      CapturedFloat32Array: Float32Array,
      CapturedUint32Array: Uint32Array,
      // The private helper runs in a VM realm; only normalize its outer record prototype.
      // Its actual arrays are passed unchanged to the genuine strict diagnostic.
      evaluateBetaSkirtCoherentEnvelopeQualityV1: (
        input: Parameters<typeof evaluateBetaSkirtCoherentEnvelopeQualityV1>[0],
      ) => evaluateBetaSkirtCoherentEnvelopeQualityV1({ ...input }),
    }) as {
      evaluateObserved32Quality: (
        source: Float32Array,
        triangles: Uint32Array,
        final: Float32Array,
      ) => ReturnType<typeof evaluateBetaSkirtCoherentEnvelopeQualityV1>;
    };
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const triangles = new Uint32Array([0, 1, 2]);
    expect(() =>
      evaluateBetaSkirtCoherentEnvelopeQualityV1({
        sourcePositionsM: positions,
        sourceTriangles: triangles,
        candidatePositionsM: positions,
        candidateTriangles: triangles,
      }),
    ).toThrow('must not alias storage');
    const before = [...positions],
      topologyBefore = [...triangles];
    const report = evaluate(positions, triangles, positions);
    expect(report.blockers).toEqual([]);
    expect(report.triangle?.normalReversalCount).toBe(0);
    expect([...positions]).toEqual(before);
    expect([...triangles]).toEqual(topologyBefore);
  });
  it('deeply freezes receipt claims and nested actual-body/self/strain reports while keeping binary outside the seal', () => {
    const { freezeObserved32: seal } = privateHelpers(['freezeObserved32']) as {
      freezeObserved32: <T>(v: T) => T;
    };
    const value = seal({
      claims: { runtimeAuthority: false },
      postgate: {
        signedRefresh: { contacts: [{ vertexIndex: 17 }] },
        selfOrientation: { witnesses: [{ disposition: 'blocked' }] },
        strain: { units: 'dimensionless', calibrated: false },
      },
      blockers: ['physical'],
    });
    expect(Reflect.set(value.claims, 'runtimeAuthority', true)).toBe(false);
    expect(Reflect.set(value.postgate.strain, 'units', 'Pa')).toBe(false);
    expect(Reflect.set(value.postgate.signedRefresh.contacts[0], 'vertexIndex', 0)).toBe(false);
    expect(() => value.postgate.selfOrientation.witnesses.push({ disposition: 'fake' })).toThrow();
    expect(() => value.blockers.pop()).toThrow();
    expect(() => seal({ bad: new Float32Array(1) })).toThrow('mutable binary carriers');
  });
  it('local read cancellation removes its listener and observes late failure without cancelling borrowed work', async () => {
    const controller = new AbortController(),
      borrowed = new AbortController();
    const { waitObserved32: wait } = privateHelpers(['waitObserved32'], {
      aborted32: (s: AbortSignal) =>
        Reflect.apply(
          Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!,
          s,
          [],
        ),
      add32: EventTarget.prototype.addEventListener,
      remove32: EventTarget.prototype.removeEventListener,
      RunnerAbortError: Error,
    }) as { waitObserved32: <T>(p: Promise<T>, s: AbortSignal) => Promise<T> };
    let reject!: (reason: Error) => void;
    const late = new Promise<never>((_, r) => {
      reject = r;
    });
    const pending = wait(late, controller.signal);
    const rejection = expect(pending).rejects.toThrow('cancelled');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
    controller.abort();
    await rejection;
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(borrowed.signal.aborted).toBe(false);
    reject(new Error('late source failure'));
    await Promise.resolve();
    await Promise.resolve();
    const success = new AbortController();
    await expect(wait(Promise.resolve(7), success.signal)).resolves.toBe(7);
    expect(getEventListeners(success.signal, 'abort')).toHaveLength(0);
  });
  it('shared pure physical validators catch orientation reversal, exact W and82 pin drift (not owner admission)', () => {
    const original = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      reversed = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]);
    expect(
      physicalValidators.orientation(original, original, new Uint32Array([0, 1, 2])),
    ).toMatchObject({
      normalReversalCount: 0,
      sourceDegenerateTriangleCount: 0,
      finalDegenerateTriangleCount: 0,
    });
    expect(
      physicalValidators.orientation(original, reversed, new Uint32Array([0, 1, 2]))
        .normalReversalCount,
    ).toBe(1);
    const world = new Float32Array(580 * 4);
    for (let i = 82; i < 580; i++) world[i * 4 + 3] = 2;
    const input = {
      sourcePositions4: world,
      finalPositions4: world.slice(),
      seamPairs: new Uint32Array(68),
      pins: Uint32Array.from({ length: 82 }, (_, i) => i),
      runnerFinalMaximumSeamGapM: 0,
    };
    expect(physicalValidators.seamPinParity(input)).toMatchObject({
      zeroInverseMassVertexCount: 82,
      positiveInverseMassVertexCount: 498,
      inverseMassBitMismatchCount: 0,
      pinnedPositionBitMismatchCount: 0,
    });
    input.finalPositions4[83 * 4 + 3] = 3;
    expect(() => physicalValidators.seamPinParity(input)).toThrow('parity');
    input.finalPositions4 = world.slice();
    input.finalPositions4[0] = -0;
    expect(() => physicalValidators.seamPinParity(input)).toThrow('parity');
  });
  it('real saved V3 garment/pair/world with declared synthetic cube stays blocked before any32 GPU allocation', async () => {
    await withObservedPlacementDisplayedBodyPairSourceV1(async (input) => {
      const pair =
        await pairApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
          input.pairRequest,
        );
      if (!pair.ok) throw new Error(JSON.stringify(pair));
      const world =
        await worldApi.buildBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
          {
            schemaVersion:
              worldApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_DISPLAYED_BODY_WORLD_INITIAL_PREFLIGHT_V1,
            savedAnnularObservedPlacementGarmentOwner: input.garmentOwner,
            observedPairOwner: pair.owner,
            expected: {
              garmentReportSha256: input.garmentOwner.report.canonicalSha256,
              pairReportSha256: pair.report.reportSha256,
            },
          },
        );
      try {
        if (!world.ok) throw new Error(JSON.stringify(world));
        const result = await sourceApi.buildBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1({
          schemaVersion: sourceApi.BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_RUNTIME_SOURCE_V1,
          garmentOwner: input.garmentOwner,
          pairOwner: pair.owner,
          worldInitialOwner: world.owner,
          expected: {
            garmentReportSha256: input.garmentOwner.report.canonicalSha256,
            pairReportSha256: pair.report.reportSha256,
            worldReportSha256: world.report.reportSha256,
          },
        });
        expect(result.ok).toBe(false);
        expect(result.owner).toBeNull();
        if (result.ok || !result.report) throw new Error(JSON.stringify(result));
        expect(result.report.gates).toMatchObject({
          persistedObservedTargetMatched: true,
          worldInitialClear: true,
          sectionClear: false,
          exactBodyContactClear: false,
          signedContactSetEmpty: false,
          fixedActualBodyWorkload: false,
        });
        expect(result.report.counts).toEqual({
          vertices: 580,
          triangles: 912,
          assemblyOrderSeamPairs: 34,
          zeroInverseMassPins: 82,
          positiveInverseMassParticles: 498,
        });
        expect(result.report.upstreamWorld.selfIntersection).toMatchObject({
          excludedConfinedAuthenticatedAoSeamCount: 182,
          residualBlockingCount: 0,
          passed: true,
        });
        let allocations = 0;
        const options = Object.defineProperty({}, 'gpu', {
          get() {
            allocations++;
            throw new Error('blocked physics cannot allocate GPU');
          },
        });
        // Historical blocked receipt and genuine pair/world owners cannot impersonate the distinct source/16 kinds.
        for (const [source, checkpoint] of [
          [result.report, result.report],
          [pair.owner, world.owner],
          [world.owner, pair.owner],
        ]) {
          expect(await run({} as HTMLCanvasElement, source, checkpoint, options)).toMatchObject({
            ok: false,
            code: 'observed-source-or16-owner-unavailable',
          });
        }
        expect(allocations).toBe(0);
        expect(
          pairApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementLifetimeV1(
            pair.owner,
          ),
        ).not.toBeNull();
        expect(
          worldApi.getBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightLifetimeV1(
            world.owner,
          ),
        ).not.toBeNull();
      } finally {
        if (world.ok)
          worldApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyWorldInitialPreflightV1(
            world.owner,
          );
        pairApi.disposeBetaSkirtSavedAnnularObservedPlacementDisplayedBodyProductPlacementV1(
          pair.owner,
        );
      }
    });
  });
});
