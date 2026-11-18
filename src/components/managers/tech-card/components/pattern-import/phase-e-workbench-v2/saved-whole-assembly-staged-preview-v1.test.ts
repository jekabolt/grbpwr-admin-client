import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSavedWholeAssemblyStagedPreviewV1 } from './saved-whole-assembly-staged-preview-v1';

const calls = vi.hoisted(() => ({
  start: vi.fn(),
  advance: vi.fn(),
  resume: vi.fn(),
  projectBody: vi.fn(),
}));

vi.mock('components/cloth-simulation-spike/model-displayed-triangle-body-input-v1', () => ({
  projectCurrentModelDisplayedTriangleBodyInputV1: calls.projectBody,
}));
vi.mock('components/cloth-simulation-spike/run-staged-source-cut-frames-v1', () => ({
  runStagedSourceCutFramesV1: calls.start,
  continueStagedSourceCutFramesV1: calls.advance,
  resumeStagedSourceCutFramesV1: calls.resume,
}));
vi.mock('lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1', () => ({
  snapshotGarmentStagedSourceCutCoreV1: () => ({ cut: {} }),
}));
vi.mock('lib/cloth/runtime/cpu/source-cut-surface-projection-v1', () => ({
  prepareSourceCutSurfaceProjectionV1: () => ({
    drawRanges: [{ pieceId: 'piece', triangleOffset: 0, triangleCount: 1 }],
    project: (positions: Float32Array) => positions.slice(),
  }),
}));

type Request = Parameters<typeof runSavedWholeAssemblyStagedPreviewV1>[0];
const hashes = {
  bodyPositionsFloat32LeSha256: 'body-positions',
  bodyTrianglesUint32LeSha256: 'body-triangles',
};
const frame = (number: number) => ({
  positionsMInvMass: new Float32Array([number, 0, 0, 1]),
  validated: [{ frame: number, activeSeams: [{ maximumGapM: number / 1000 }] }],
});

function fixture() {
  const source = {
    sourceSha256: 'exact-complete',
    serverAssemblyRevision: 'revision',
    sizeId: 58,
    savedCarrier: { mediaType: 'v10', sidecarSha256: 'exact-placement' },
    unavailable: [],
  } as unknown as Request['source'];
  const body = { isCurrent: () => true } as Request['body'];
  const commands = [
    { operationOrder: 30, action: 'activate' },
    { operationOrder: 80, action: 'activate' },
    { operationOrder: 80, action: 'contract-active' },
  ];
  const prepare = vi.fn().mockResolvedValue({
    source,
    observedBody: hashes,
    frame: { material: {}, seams: { stages: [{}, {}] } },
    options: {},
    commands,
    pieceColors: new Map([['piece', 0x296dc3]]),
    maxSurfaceTriangles: 20,
  });
  const request = {
    source,
    body,
    prepare,
    ownedLease: { run: 1 } as unknown as Request['ownedLease'],
    isCurrent: () => true,
    verifySource: vi.fn(async () => {}),
    onAccepted: vi.fn(),
  };
  return { request, commands };
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.projectBody.mockReturnValue({
    hashes,
    bodyPositionsM: new Float32Array(0),
    bodyTriangles: new Uint32Array(0),
  });
});

describe('same Workbench staged checkpoint', () => {
  it('keeps the accepted frame after the old signal is aborted and continues on a different lease', async () => {
    const first = frame(1);
    calls.start.mockResolvedValue(first);
    calls.resume.mockResolvedValue(frame(2));
    calls.advance.mockResolvedValue(frame(3));
    const { request, commands } = fixture();
    const firstTurn = new AbortController();
    const paused = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, pauseAfterAccepted: () => true },
      firstTurn.signal,
    );
    expect(paused.paused?.lastAcceptedFrame).toBe(1);
    expect(calls.advance).not.toHaveBeenCalled();
    const originalGuard = calls.start.mock.calls[0]?.[0].assertCurrentSource;
    firstTurn.abort();
    expect(originalGuard()).toBe(true);
    expect(paused.cloth.isCurrent()).toBe(true);

    const resumed = new AbortController();
    const freshLease = { run: 2 } as unknown as Request['ownedLease'];
    const final = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, ownedLease: freshLease, resume: paused.paused },
      resumed.signal,
    );
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(request.prepare).toHaveBeenCalledTimes(1);
    expect(calls.resume).toHaveBeenCalledExactlyOnceWith(
      first,
      commands[1],
      freshLease,
      resumed.signal,
    );
    expect(calls.advance).toHaveBeenCalledTimes(1);
    expect(final.cloth.frameNumber).toBe(3);
    expect(final.action).toBe('contract-active');
    await expect(
      runSavedWholeAssemblyStagedPreviewV1(
        { ...request, ownedLease: freshLease, resume: paused.paused },
        resumed.signal,
      ),
    ).rejects.toThrow('no longer resumable');
  });

  it('refuses a changed saved carrier before using the paused engine receipt', async () => {
    calls.start.mockResolvedValue(frame(1));
    const { request } = fixture();
    const signal = new AbortController().signal;
    const paused = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, pauseAfterAccepted: () => true },
      signal,
    );
    const source = {
      ...request.source,
      savedCarrier: { mediaType: 'v10', sidecarSha256: 'changed-placement' },
    } as Request['source'];
    await expect(
      runSavedWholeAssemblyStagedPreviewV1({ ...request, source, resume: paused.paused }, signal),
    ).rejects.toThrow('different source or mannequin');
    expect(calls.resume).not.toHaveBeenCalled();
  });
});
