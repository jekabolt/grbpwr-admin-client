import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1 as respond } from './beta-skirt-personalized-female-nonconfined-self-carrier-response-v1';
import { auditBetaSkirtObserved32StaticCarrierStateV1 as audit } from './beta-skirt-observed32-static-carrier-state-audit-v1';
import { evaluateBetaSkirtExactSweptBodyAuditV1 as swept } from './beta-skirt-exact-swept-body-audit-v1';
import { evaluateBetaSkirtCoherentEnvelopeQualityV1 as quality } from './beta-skirt-coherent-envelope-quality-evidence-v1';
import type { BetaSkirtCanonicalMediumContactPairWitnessV2 as Witness } from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';

// Synthetic fixed-profile transport states and explicit witness records, never source/body owners.
// Actual private orchestration, D419 projection, state audit, quality and swept-body math execute.
// Scripted postgate ports below exercise control flow; their success is not physical admission.
const source = ts.createSourceFile(
  'runner.ts',
  readFileSync(
    new URL(
      './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4.ts',
      import.meta.url,
    ),
    'utf8',
  ),
  ts.ScriptTarget.Latest,
  true,
);
function extract<T>(names: string[], globals: Record<string, unknown>): T {
  const declarations = source.statements.filter(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && !!node.name && names.includes(node.name.text),
  );
  expect(declarations).toHaveLength(names.length);
  const text = declarations.map((node) => node.getText(source)).join('\n');
  const javascript = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return runInNewContext(javascript + '\n({' + names.join(',') + '});', {
    CapturedFloat32Array: Float32Array,
    CapturedUint32Array: Uint32Array,
    CapturedUint8Array: Uint8Array,
    DataView,
    ...globals,
  }) as T;
}
const hash = (data: ArrayBufferView) =>
  createHash('sha256')
    .update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    .digest('hex');
const xyz = (data: Float32Array) =>
  Float32Array.from(
    { length: (data.length / 4) * 3 },
    (_, i) => data[Math.floor(i / 3) * 4 + (i % 3)]!,
  );
const realQuality = (initial: Float32Array, triangles: Uint32Array, final: Float32Array) =>
  quality({
    sourcePositionsM: xyz(initial),
    sourceTriangles: triangles.slice(),
    candidatePositionsM: xyz(final),
    candidateTriangles: triangles.slice(),
  });
function witness(a: number, b: number, triangleA: number): Witness {
  return {
    triangleA,
    triangleB: triangleA + 10,
    oracleKind: 'touching',
    featureCount: 2,
    contactLocusSha256: String(triangleA).padStart(64, '0'),
    confinedToAuthenticatedAoSeam: false,
    disposition: 'residual-touching-non-confined-feature',
    features: [
      {
        kind: 'endpoint',
        pointM: [0, 0, 0],
        onTriangleA: { kind: 'vertex', vertex: a },
        onTriangleB: { kind: 'vertex', vertex: b },
        confinedCarrier: { kind: 'direct-seam-endpoint', endpointA: a, endpointB: b },
        nonConfinedRelation: null,
        nearestIncidentAuthenticatedCarrierDistanceM: 0,
      },
      {
        kind: 'vertex-edge',
        pointM: [0, 0, 0],
        onTriangleA: { kind: 'edge', vertices: [a, a + 2] },
        onTriangleB: { kind: 'vertex', vertex: b },
        confinedCarrier: null,
        nonConfinedRelation: 'authenticated-carrier-adjacent-but-not-confined',
        nearestIncidentAuthenticatedCarrierDistanceM: 1e-7,
      },
    ],
  };
}
type Self = {
  witnesses: Witness[];
  oracle: { epsilonM: number };
  residualBlockingCount: number;
  exactRawExcludedResidualAccounting: boolean;
  passed: boolean;
  orientation: {
    sourceDegenerateTriangleCount: number;
    finalDegenerateTriangleCount: number;
    normalReversalCount: number;
  };
  seamPinParity: { exactPinMaskParity: boolean };
};
type Postgate = {
  positions4Sha256: string;
  positions3Sha256: string;
  collision: unknown;
  signed: unknown;
  quality: ReturnType<typeof quality> | null;
  self: Self | null;
  bodyClear: boolean;
  failures: { stage: string; detail: string }[];
};
function fixture() {
  const current = new Float32Array(580 * 4);
  for (let vertex = 0; vertex < 580; vertex++) {
    current.set(
      [(vertex % 20) / 100, Math.floor(vertex / 20) / 100, 0, vertex < 82 ? 0 : 1],
      vertex * 4,
    );
  }
  const seams = Uint32Array.from({ length: 68 }, (_, i) => 82 + i);
  for (let i = 0; i < seams.length; i += 2) {
    const a = seams[i]!,
      b = seams[i + 1]!;
    current.set(current.slice(a * 4, a * 4 + 3), b * 4);
  }
  const epsilonM = 2e-7;
  current[83 * 4] += epsilonM * 0.6;
  current[85 * 4] += epsilonM * 0.3;
  const previous = current.slice();
  for (let vertex = 82; vertex < 580; vertex++) previous[vertex * 4 + 1] -= 1e-5;
  const prepared = {
    physical: current.slice(),
    pins: Uint32Array.from({ length: 82 }, (_, i) => i),
    seamPairs: seams,
    triangles: new Uint32Array([150, 151, 170]),
    sourcePositions3M: xyz(current),
    bodyPositions: new Float32Array([10, 10, 10, 10.1, 10, 10, 10, 10.1, 10]),
    bodyTriangles: new Uint32Array([0, 1, 2]),
  };
  const excluded = {
    ...witness(86, 87, 3),
    confinedToAuthenticatedAoSeam: true,
    disposition: 'excluded-confined-authenticated-ao-seam-touching' as const,
  };
  const self: Self = {
    witnesses: [witness(82, 83, 1), excluded, witness(84, 85, 2)],
    oracle: { epsilonM },
    residualBlockingCount: 2,
    exactRawExcludedResidualAccounting: true,
    passed: false,
    orientation: {
      sourceDegenerateTriangleCount: 0,
      finalDegenerateTriangleCount: 0,
      normalReversalCount: 0,
    },
    seamPinParity: { exactPinMaskParity: true },
  };
  const raw: Postgate = {
    positions4Sha256: hash(current),
    positions3Sha256: hash(xyz(current)),
    collision: null,
    signed: null,
    quality: realQuality(prepared.physical, prepared.triangles, current),
    self,
    bodyClear: true,
    failures: [],
  };
  expect(raw.quality?.blockers).toEqual([]);
  return { prepared, current, previous, raw, self };
}
type Prepared = ReturnType<typeof fixture>['prepared'];
type Result = {
  accepted: boolean;
  candidateCurrent: Float32Array;
  candidatePrevious: Float32Array;
  candidatePostgate: Postgate;
  receipt: {
    status: string;
    rawCurrentSha256: string;
    rawPreviousSha256: string;
    candidateCurrentSha256: string;
    candidatePreviousSha256: string;
    response: Awaited<ReturnType<typeof respond>>['report'];
    stateAudit: ReturnType<typeof audit>;
    rawPostgate: { positionsInvMassKgSha256: string };
    candidatePostgate: { positionsInvMassKgSha256: string };
    previousToCurrentBody: ReturnType<typeof swept>;
    correctionBodyPath: ReturnType<typeof swept>;
    claims: {
      runtimeAuthority: false;
      solverContinuationQualified: false;
      sweptSelfEvaluated: false;
      freshStrainRequiredAfterCorrection: true;
    };
  };
};
type Correction = (
  prepared: Prepared,
  current: Float32Array,
  previous: Float32Array,
  raw: Postgate,
  currentCheck: () => void,
  fresh: () => Promise<void>,
) => Promise<Result>;
function harness(input = fixture()) {
  let live = true;
  const poll = vi.fn(() => {
    if (!live) throw new Error('Synthetic parent revoked.');
  });
  const fresh = vi.fn(async () => {
    poll();
  });
  const response = vi.fn(respond);
  const stateAudit = vi.fn((value: Parameters<typeof audit>[0]) => audit({ ...value }));
  const rebuild = vi.fn(
    async (
      prepared: Prepared,
      candidate: Float32Array,
      currentCheck: () => void,
    ): Promise<Postgate> => {
      currentCheck();
      return {
        ...input.raw,
        positions4Sha256: hash(candidate),
        positions3Sha256: hash(xyz(candidate)),
        quality: realQuality(prepared.physical, prepared.triangles, candidate),
        self: { ...input.self, witnesses: [], residualBlockingCount: 0, passed: true },
      };
    },
  );
  const { correctObserved32StaticCarriers: correct } = extract<{
    correctObserved32StaticCarriers: Correction;
  }>(['correctObserved32StaticCarriers', 'float32LeBytes'], {
    digestBytes: async (bytes: Uint8Array) => hash(bytes),
    createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1: response,
    auditBetaSkirtObserved32StaticCarrierStateV1: stateAudit,
    rebuildObserved32PhysicalPostgate: rebuild,
    evaluateBetaSkirtExactSweptBodyAuditV1: swept,
  });
  return {
    input,
    correct,
    response,
    stateAudit,
    rebuild,
    fresh,
    poll,
    revoke: () => {
      live = false;
    },
    run: () => correct(input.prepared, input.current, input.previous, input.raw, poll, fresh),
  };
}

describe('observed32 static carrier orchestration; synthetic inputs, genuine CPU kernels, no owners/GPU', () => {
  it('consumes the complete residual set once, preserves raw states and binds both corrected buffers', async () => {
    const h = harness();
    const beforeCurrent = hash(h.input.current),
      beforePrevious = hash(h.input.previous);
    const result = await h.run();
    expect(h.response).toHaveBeenCalledTimes(1);
    expect(h.response.mock.calls[0]![0].residualWitnesses).toEqual([
      h.input.self.witnesses[0],
      h.input.self.witnesses[2],
    ]);
    expect(result.receipt.response.source.residualWitnessCount).toBe(2);
    expect(result.receipt.response.source.authenticatedDirectCarrierCount).toBe(2);
    expect(result.receipt.stateAudit.passed).toBe(true);
    expect(result.receipt.stateAudit.checks).toMatchObject({
      allInverseMassBytesExact: true,
      bothPinnedStatePositionBytesExact: true,
    });
    expect(hash(h.input.current)).toBe(beforeCurrent);
    expect(hash(h.input.previous)).toBe(beforePrevious);
    expect(result.receipt.rawCurrentSha256).toBe(beforeCurrent);
    expect(result.receipt.rawPreviousSha256).toBe(beforePrevious);
    expect(result.receipt.candidateCurrentSha256).toBe(hash(result.candidateCurrent));
    expect(result.receipt.candidatePreviousSha256).toBe(hash(result.candidatePrevious));
    expect(result.receipt.candidateCurrentSha256).not.toBe(beforeCurrent);
    expect(result.receipt.candidatePreviousSha256).not.toBe(beforePrevious);
    expect(h.rebuild.mock.calls[0]![1]).toBe(result.candidateCurrent);
    expect(result.receipt.candidatePostgate.positionsInvMassKgSha256).toBe(
      hash(result.candidateCurrent),
    );
    expect(result.receipt.rawPostgate.positionsInvMassKgSha256).toBe(beforeCurrent);
    expect(result.receipt.previousToCurrentBody.status).toBe('clear');
    expect(result.receipt.correctionBodyPath.status).toBe('clear');
    expect(h.fresh).toHaveBeenCalledTimes(3);
    expect(result.accepted).toBe(true); // Only the scripted postgate orchestration branch, no owner minted.
    expect(result.receipt.claims).toMatchObject({
      runtimeAuthority: false,
      solverContinuationQualified: false,
      sweptSelfEvaluated: false,
      freshStrainRequiredAfterCorrection: true,
    });
  });
  it.each([
    [
      'body blocked',
      (r: Postgate) => {
        r.bodyClear = false;
      },
    ],
    [
      'diagnostic failure',
      (r: Postgate) => {
        r.failures.push({ stage: 'quality', detail: 'injected' });
      },
    ],
    [
      'quality absent',
      (r: Postgate) => {
        r.quality = null;
      },
    ],
    [
      'quality blocker',
      (r: Postgate) => {
        r.quality = { ...r.quality!, blockers: ['candidate-degenerate-triangle'] };
      },
    ],
    [
      'self absent',
      (r: Postgate) => {
        r.self = null;
      },
    ],
    [
      'inexact accounting',
      (r: Postgate) => {
        r.self!.exactRawExcludedResidualAccounting = false;
      },
    ],
    [
      'partial residual set',
      (r: Postgate) => {
        r.self!.residualBlockingCount = 3;
      },
    ],
    [
      'normal reversal',
      (r: Postgate) => {
        r.self!.orientation.normalReversalCount = 1;
      },
    ],
    [
      'pin parity',
      (r: Postgate) => {
        r.self!.seamPinParity.exactPinMaskParity = false;
      },
    ],
  ])('refuses %s before D419 or any corrected postgate', async (_, mutate) => {
    const h = harness();
    mutate(h.input.raw);
    await expect(h.run()).rejects.toThrow(/static response/);
    expect(h.response).not.toHaveBeenCalled();
    expect(h.rebuild).not.toHaveBeenCalled();
  });
  it('does not drop an unsupported witness when other residuals are eligible', async () => {
    const h = harness();
    h.input.self.witnesses[2] = {
      ...h.input.self.witnesses[2]!,
      disposition: 'residual-proper-crossing' as Witness['disposition'],
    };
    await expect(h.run()).rejects.toThrow('complete residual witness set');
    expect(h.response).not.toHaveBeenCalled();
  });
  it('real D419 rejects a witness whose direct endpoints are absent from exact active seam pairs', async () => {
    const h = harness();
    h.input.self.witnesses[0] = witness(200, 201, 1);
    await expect(h.run()).rejects.toThrow('non-active direct seam carrier');
    expect(h.stateAudit).not.toHaveBeenCalled();
    expect(h.rebuild).not.toHaveBeenCalled();
  });
  it.each(['W', 'pinned position', 'aliased previous'] as const)(
    'real state audit refuses %s drift before rebuilding',
    async (kind) => {
      const h = harness();
      if (kind === 'W') h.input.current[200 * 4 + 3] = 2;
      if (kind === 'pinned position') h.input.current[0] = 1e-8;
      if (kind === 'aliased previous') h.input.previous = h.input.current;
      h.input.raw.positions4Sha256 = hash(h.input.current);
      await expect(h.run()).rejects.toThrow(
        kind === 'aliased previous' ? 'distinct memory ranges' : 'state audit blocked',
      );
      expect(h.rebuild).not.toHaveBeenCalled();
    },
  );
  it('rejects stale raw and corrected hash bindings instead of borrowing a previous clear report', async () => {
    const stale = harness();
    stale.input.raw.positions4Sha256 = '0'.repeat(64);
    await expect(stale.run()).rejects.toThrow('byte binding drifted');
    expect(stale.rebuild).not.toHaveBeenCalled();
    const changed = harness();
    const rebuild = changed.rebuild.getMockImplementation()!;
    changed.rebuild.mockImplementation(async (...args) => ({
      ...(await rebuild(...args)),
      positions4Sha256: '0'.repeat(64),
    }));
    await expect(changed.run()).rejects.toThrow('candidate byte binding');
  });
  it.each(['body', 'quality', 'self', 'failure'] as const)(
    'retains blocked corrected %s evidence without accepting a static candidate',
    async (stage) => {
      const h = harness();
      const rebuild = h.rebuild.getMockImplementation()!;
      h.rebuild.mockImplementation(async (...args) => {
        const result = await rebuild(...args);
        if (stage === 'body') result.bodyClear = false;
        if (stage === 'quality') result.quality = null;
        if (stage === 'self') result.self!.passed = false;
        if (stage === 'failure')
          result.failures = [{ stage: 'self-orientation', detail: 'scripted failure' }];
        return result;
      });
      const result = await h.run();
      expect(result.accepted).toBe(false);
      expect(result.receipt.status).toBe('candidate-blocked');
      expect(result.candidatePostgate).toBe(await h.rebuild.mock.results[0]!.value);
    },
  );
  it('real swept-body audit prevents acceptance when an otherwise eligible free vertex crosses a body triangle', async () => {
    const h = harness();
    const v = 200,
      x = h.input.current[v * 4]!,
      y = h.input.current[v * 4 + 1]!;
    h.input.previous[v * 4 + 2] = -0.01;
    h.input.current[v * 4 + 2] = 0.01;
    h.input.raw.positions4Sha256 = hash(h.input.current);
    h.input.prepared.bodyPositions = new Float32Array([
      x - 0.02,
      y - 0.02,
      0,
      x + 0.02,
      y - 0.02,
      0,
      x,
      y + 0.02,
      0,
    ]);
    const result = await h.run();
    expect(result.receipt.previousToCurrentBody.status).toBe('blocked');
    expect(result.receipt.previousToCurrentBody.counts.exactCrossingCount).toBeGreaterThan(0);
    expect(result.accepted).toBe(false);
  });
  it.each([1, 2, 3])(
    'revocation at fresh boundary %i prevents publication and preserves borrowed buffers',
    async (at) => {
      const h = harness();
      let calls = 0;
      const before = [hash(h.input.current), hash(h.input.previous)];
      h.fresh.mockImplementation(async () => {
        if (++calls === at) h.revoke();
      });
      await expect(h.run()).rejects.toThrow('parent revoked');
      expect([hash(h.input.current), hash(h.input.previous)]).toEqual(before);
    },
  );
  it('revocation during real asynchronous D419 completion prevents stale candidate rebuild/publication', async () => {
    const h = harness();
    h.response.mockImplementation(async (input) => {
      const result = await respond(input);
      h.revoke();
      return result;
    });
    await expect(h.run()).rejects.toThrow('parent revoked');
    expect(h.rebuild).not.toHaveBeenCalled();
  });
});
