import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import type { GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import {
  disposeSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  readSavedFullAssemblySnapshotV1,
} from './saved-full-assembly-snapshot-production-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 } from './saved-assembly-topology-hash-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
const canonical = canonicalizePatternImportDxfPhaseESavedAssemblyValueV1;
const digest = async (bytes: Uint8Array) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)).toString('hex');
const bytes = (s: string) => new TextEncoder().encode(s);
const row = {
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-line',
  revision: 3,
  cardLockVersion: 7,
  url: '/three-panels.dxf',
  sizeBytes: 713,
  sha256: 'a'.repeat(64),
};
const revision = `asm:v1:${'1'.repeat(32)}:9`;
const operation = (n: number, keys: string[]) => ({
  operationNumber: n,
  work: 'join_lockstitch',
  inputKeys: ['piece-a', 'piece-b'],
  outputUnitKey: `unit-${n}`,
  outputUnitName: `unit ${n}`,
  seamKeys: keys,
});
const allOperations = [operation(10, ['seam-1']), operation(20, ['seam-2', 'seam-3'])];
const anchor = (line: string) => ({
  pieceLineKey: line,
  edgeHint: 'explicit-edge',
  rangeFrom: 0,
  rangeTo: 1,
  lenMm: 100,
  contourSig: 'echo-only',
  samples: [0, 0.25, 0.5, 0.75, 1].map((u) => ({ u, v: 0 })),
});
const seam = (key: string) => ({
  seamKey: key,
  status: 'TECH_CARD_SEAM_STATUS_CONFIRMED',
  stale: false,
  kind: 'TECH_CARD_SEAM_KIND_EDGE',
  direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
  source: 'TECH_CARD_SEAM_SOURCE_MANUAL',
  anchoredSize: 'M',
  sideA: { parts: [anchor(key === 'seam-1' ? 'piece-a' : 'piece-b')] },
  sideB: { parts: [anchor(key === 'seam-1' ? 'piece-b' : 'piece-c')] },
});
type Wire = Awaited<ReturnType<typeof wire>>;
async function reseal(w: {
  operations: typeof allOperations;
  selectedSeams: ReturnType<typeof seam>[];
  selectedOperationNumber: number;
  topologyCanonicalJson: string;
  assemblyTopologySha256: string;
}) {
  const a = (v: ReturnType<typeof anchor>) => ({
    contourSig: v.contourSig,
    edgeHint: v.edgeHint,
    lenMm: v.lenMm,
    pieceLineKey: v.pieceLineKey,
    range: [v.rangeFrom, v.rangeTo],
    samples: v.samples.map((p) => [p.u, p.v]),
  });
  const value = {
    operations: w.operations.map((o) => ({
      authoringOperationId: null,
      number: o.operationNumber,
      work: o.work,
      phaseEKind: o.work === 'join_lockstitch' ? 'stitch' : null,
      inputKeys: o.inputKeys,
      outputUnitKey: o.outputUnitKey,
      outputUnitName: o.outputUnitName,
      seamKeys: o.seamKeys,
    })),
    seams: w.selectedSeams.map((s) => ({
      anchoredSize: s.anchoredSize,
      direction: s.direction === 'TECH_CARD_SEAM_DIRECTION_REVERSED' ? 'reversed' : 'same',
      kind: 'edge',
      confirmed: s.status === 'TECH_CARD_SEAM_STATUS_CONFIRMED',
      seamKey: s.seamKey,
      sideA: s.sideA.parts.map(a),
      sideB: s.sideB.parts.map(a),
      source: 'manual',
      stale: s.stale,
    })),
    selectedOperationNumber: w.selectedOperationNumber,
  };
  const json = canonical(value);
  w.topologyCanonicalJson = Buffer.from(json).toString('base64');
  w.assemblyTopologySha256 = await digest(
    bytes(`pattern-import-dxf-phase-e-saved-row-server-topology/1\0${json}`),
  );
}
async function wire(selected: number, outerByte = 1) {
  const outer = Uint8Array.of(outerByte, 2, 3);
  const w = {
    row: { ...row, savedRowRevision: row.revision, downloadUrl: '/download.dxf' },
    selectedOperationNumber: selected,
    operations: structuredClone(allOperations),
    selectedSeams: allOperations.find((o) => o.operationNumber === selected)!.seamKeys.map(seam),
    serverAssemblyRevision: revision,
    topologyCanonicalJson: '',
    assemblyTopologySha256: '',
    semanticSidecar: {
      techCardId: row.techCardId,
      patternLineKey: row.patternLineKey,
      dxfSha256: row.sha256,
      cardLockVersion: row.cardLockVersion,
      savedRowRevision: row.revision,
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
      sidecarSha256: await digest(outer),
      byteLength: outer.length,
      sidecarBytes: Buffer.from(outer).toString('base64'),
    },
  };
  await reseal(w);
  return w;
}
function transport(edit?: (w: Wire, call: number) => void | Promise<void>) {
  let calls = 0;
  const rpc = vi.fn(async (r: GetTechCardSavedAssemblySnapshotRequest) => {
    const w = await wire(r.selectedOperationNumber!);
    await edit?.(w, ++calls);
    return w;
  });
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({ GetTechCardSavedAssemblySnapshot: rpc }) as unknown as ReturnType<
        typeof abortableAdminService
      >,
  );
  return rpc;
}
beforeEach(() => vi.clearAllMocks());

describe('fixed full AO production reader — mocked RPC, no backend or DXF authority claim', () => {
  it('joins distinct N1/N2 operations at one revision and identical outer bytes, then rereads the seed', async () => {
    const rpc = transport();
    const owner = await readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 });
    try {
      const p = projectSavedFullAssemblySnapshotV1(owner);
      expect(
        rpc.mock.calls.map(([r]) => [r.selectedOperationNumber, r.expectedServerAssemblyRevision]),
      ).toEqual([
        [10, undefined],
        [20, revision],
        [10, revision],
      ]);
      expect(p.operations.map((o) => o.seamKeys.length)).toEqual([1, 2]);
      expect(p.seams.map((s) => [s.sourceOperationNumber, s.seamKey])).toEqual([
        [10, 'seam-1'],
        [20, 'seam-2'],
        [20, 'seam-3'],
      ]);
      expect(p.selectedTopologyReceipts[0].sha256).not.toBe(p.selectedTopologyReceipts[1].sha256);
      expect(p.claims).toMatchObject({
        exactDxfTopologyAuthority: false,
        durableFullGraphAvailable: false,
        runtimeAuthority: false,
      });
      expect(p.rpcReadCount).toBe(3);
      if (p.outer.status !== 'present') throw new Error('outer expected');
      p.outer.bytes[0] = 99;
      expect((projectSavedFullAssemblySnapshotV1(owner).outer as typeof p.outer).bytes[0]).toBe(1);
      expect(() => projectSavedFullAssemblySnapshotV1({ ...owner })).toThrow('unavailable');
    } finally {
      disposeSavedFullAssemblySnapshotV1(owner);
    }
    expect(() => projectSavedFullAssemblySnapshotV1(owner)).toThrow('unavailable');
  });
  it.each([
    [
      'revision',
      async (w: Wire) => {
        w.serverAssemblyRevision = `asm:v1:${'1'.repeat(32)}:10`;
      },
      'revision moved',
    ],
    [
      'lineage',
      async (w: Wire) => {
        w.serverAssemblyRevision = `asm:v1:${'2'.repeat(32)}:9`;
      },
      'revision moved',
    ],
    [
      'row',
      async (w: Wire) => {
        w.row.url = '/replacement.dxf';
      },
      'row/operation differs',
    ],
    [
      'complete AO',
      async (w: Wire) => {
        w.operations[0].outputUnitName = 'changed';
        await reseal(w);
      },
      'Complete AO',
    ],
    [
      'outer bytes under unchanged revision',
      async (w: Wire) => {
        w.semanticSidecar = (await wire(20, 4)).semanticSidecar;
      },
      'outer sidecar changed',
    ],
    [
      'outer metadata',
      async (w: Wire) => {
        w.semanticSidecar.cardLockVersion--;
      },
      'outer sidecar changed',
    ],
  ] as const)('refuses %s drift between selected reads', async (_name, edit, message) => {
    transport(async (w, call) => {
      if (call === 2) await edit(w);
    });
    await expect(readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 })).rejects.toThrow(
      message,
    );
  });
  it('refuses final seed content drift even when a hostile server repeats its revision', async () => {
    transport(async (w, call) => {
      if (call === 3) {
        w.selectedSeams[0].sideA.parts[0].lenMm = 101;
        await reseal(w);
      }
    });
    await expect(readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 })).rejects.toThrow(
      'Seed selected seams changed',
    );
  });
  it('compares complete operation wire fields even when topology V1 excludes them', async () => {
    transport((w, call) => {
      if (call === 2) Object.assign(w.operations[0], { draft: true, review: 'remapped' });
    });
    await expect(readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 })).rejects.toThrow(
      'Complete AO',
    );
  });
  it.each([
    'duplicate-owner',
    'missing-seam',
    'stale-seam',
    'bound',
    'wrong-canonical',
    'wrong-outer-sha',
  ] as const)('fails closed on %s', async (kind) => {
    transport(async (w) => {
      if (kind === 'duplicate-owner') w.operations[1].seamKeys.push('seam-1');
      if (kind === 'missing-seam') w.selectedSeams.pop();
      if (kind === 'stale-seam') w.selectedSeams[0].stale = true;
      if (kind === 'bound')
        w.operations[0].seamKeys = Array.from({ length: 65 }, (_, i) => `seam-${i}`);
      await reseal(w);
      if (kind === 'wrong-canonical')
        w.topologyCanonicalJson = Buffer.from('{}').toString('base64');
      if (kind === 'wrong-outer-sha') w.semanticSidecar.sidecarSha256 = 'f'.repeat(64);
    });
    await expect(
      readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 }),
    ).rejects.toThrow();
  });
  it('retains historical outer lock as staleness evidence without claiming a current durable graph', async () => {
    transport((w) => {
      w.semanticSidecar.cardLockVersion = 3;
    });
    const owner = await readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 });
    expect(projectSavedFullAssemblySnapshotV1(owner).outer).toMatchObject({
      currentRowBound: false,
      persistedCardLockVersion: 3,
    });
    disposeSavedFullAssemblySnapshotV1(owner);
  });
  it('admits Composite V7 only as opaque outer bytes; durable authority stays false here', async () => {
    transport((wire) => {
      wire.semanticSidecar.mediaType =
        'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json';
    });
    const owner = await readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 });
    const projection = projectSavedFullAssemblySnapshotV1(owner);
    expect(projection.outer).toMatchObject({
      status: 'present',
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
      currentRowBound: true,
    });
    expect(projection.claims.durableFullGraphAvailable).toBe(false);
    disposeSavedFullAssemblySnapshotV1(owner);
  });
  it('captures request before await and rejects getters without calling them', async () => {
    const get = vi.fn(() => row);
    const input = { seedOperationNumber: 10 };
    Object.defineProperty(input, 'row', { get, enumerable: true });
    transport();
    await expect(readSavedFullAssemblySnapshotV1(input as never)).rejects.toThrow('accessors');
    expect(get).not.toHaveBeenCalled();
    const mutable = { row: { ...row }, seedOperationNumber: 10 };
    transport(() => {
      mutable.row.url = '/mutated.dxf';
      mutable.seedOperationNumber = 20;
    });
    const owner = await readSavedFullAssemblySnapshotV1(mutable);
    expect(projectSavedFullAssemblySnapshotV1(owner).row.url).toBe(row.url);
    disposeSavedFullAssemblySnapshotV1(owner);
  });
  it('cancels a pending read through native signal links and revokes a returned receipt', async () => {
    const c = new AbortController();
    const trap = vi.fn(() => {
      throw new Error('own override must not run');
    });
    Object.defineProperty(c.signal, 'addEventListener', { get: trap });
    transport((_w, call) => {
      if (call === 2) c.abort();
    });
    await expect(
      readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 }, c.signal),
    ).rejects.toThrow('cancelled');
    expect(trap).not.toHaveBeenCalled();
    transport();
    const live = new AbortController();
    const owner = await readSavedFullAssemblySnapshotV1(
      { row, seedOperationNumber: 10 },
      live.signal,
    );
    live.abort();
    expect(() => projectSavedFullAssemblySnapshotV1(owner)).toThrow('unavailable');
  });
  it('does not issue a request for a pre-aborted or forged signal', async () => {
    const rpc = transport();
    const c = new AbortController();
    c.abort();
    await expect(
      readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 }, c.signal),
    ).rejects.toThrow('cancelled');
    await expect(
      readSavedFullAssemblySnapshotV1({ row, seedOperationNumber: 10 }, {} as AbortSignal),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
