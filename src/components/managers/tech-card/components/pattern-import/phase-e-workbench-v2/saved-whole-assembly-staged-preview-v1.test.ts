import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSavedWholeAssemblyStagedPreviewV1 } from './saved-whole-assembly-staged-preview-v1';

const calls = vi.hoisted(() => ({
  start: vi.fn(),
  advance: vi.fn(),
  resume: vi.fn(),
  projectBody: vi.fn(),
  prepareStrain: vi.fn(),
  evaluateStrain: vi.fn(),
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
    project: (positions: Float32Array) => Float32Array.of(positions[0], 0, 0, 0, 1, 0, 0, 0, 1),
  }),
}));

vi.mock('lib/cloth/runtime/cpu/source-cut-principal-strain-v1', () => ({
  prepareSourceCutPrincipalStrainV1: calls.prepareStrain,
}));

type Request = Parameters<typeof runSavedWholeAssemblyStagedPreviewV1>[0];
const hashes = {
  bodyPositionsFloat32LeSha256: 'body-positions',
  bodyTrianglesUint32LeSha256: 'body-triangles',
};
const frame = (number: number) => ({
  positionsMInvMass: new Float32Array([number, 0, 0, 1]),
  validated: [
    {
      frame: number,
      contact: {
        passed: true,
        bodyIntersections: 0,
        clothIntersections: 0,
        bodyPairsWithoutClearance: 0,
      },
      activeSeams: [
        {
          constraintCount: 1,
          maximumGapM: number / 1000,
          rmsGapM: number / 1000,
          operationOrder: 80,
        },
        {
          constraintCount: 3,
          maximumGapM: number / 2000,
          rmsGapM: number / 3000,
          operationOrder: 30,
        },
      ],
    },
  ],
  safeguardedSteps: [
    {
      frame: number,
      trialCount: 2,
      scale: 0.5,
      proposedDisplacementM: 0.0005,
      acceptedDisplacementM: 0.00025,
      heldParticleCount: 2,
      repairedCutPairs: [[1, 2]],
      firstCappedTrialContact: {
        bodyIntersections: 0,
        bodyPairsWithoutClearance: 0,
        clothIntersections: 1,
        contactWitnesses: ['private solver detail'],
      },
    },
  ],
  bodyQueryWork: [{ frame: number, visits: 7, maximumVisitsPerQuery: 3 }],
});

function fixture() {
  const source = {
    sourceSha256: 'exact-complete',
    serverAssemblyRevision: 'revision',
    sizeId: 58,
    sizeToken: 'M',
    sourceCuts: [],
    savedCarrier: { mediaType: 'v10', sidecarSha256: 'exact-placement' },
    unavailable: [],
  } as unknown as NonNullable<Request['source']>;
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
  it('publishes the native cut occurrence only for an unambiguous cut draw range', async () => {
    const { request } = fixture();
    const cut = {
      row: {
        techCardId: 11,
        scopeKey: 'main',
        patternLineKey: 'saved-main',
        revision: 2,
        cardLockVersion: 7,
        url: 'https://saved.example/fixture.dxf',
        sizeBytes: 1234,
        sha256: 'a'.repeat(64),
      },
      pieceId: 'exact-native-dxf-piece',
      pieceLineKey: 'piece',
      sizeToken: 'M',
      blockName: 'fixture_M',
      contourId: 'native-cut',
      nativePathId: 1,
      sourceInstancePath: ['insert-a'],
      nativePointsMm: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      grain: null,
      nativeNotchPoints: [],
    } satisfies NonNullable<Request['source']>['sourceCuts'][number];
    calls.start.mockResolvedValue(frame(1));
    for (const sourceCuts of [[cut], [cut, { ...cut, sourceInstancePath: ['insert-b'] }], []]) {
      const source = { ...request.source, sourceCuts };
      request.prepare.mockResolvedValue({
        ...(await request.prepare()),
        source,
      });
      const accepted = await runSavedWholeAssemblyStagedPreviewV1(
        { ...request, source, pauseAfterAccepted: () => true },
        new AbortController().signal,
      );
      const [range] = accepted.cloth.ranges;
      expect(range).toMatchObject({ color: 0x296dc3, triangleOffset: 0, triangleCount: 1 });
      const { row, sizeToken, pieceId, pieceLineKey, sourceInstancePath } = cut;
      expect(range.sourcePiece).toEqual(
        sourceCuts.length === 1
          ? { row, sizeToken, pieceId, pieceLineKey, sourceInstancePath }
          : undefined,
      );
    }
  });

  it('lazily measures exact accepted poses and reuses the source operator on a new lease', async () => {
    const first = frame(1);
    const next = frame(2);
    calls.start.mockResolvedValue(first);
    calls.resume.mockResolvedValue(next);
    calls.prepareStrain.mockReturnValue({ evaluate: calls.evaluateStrain });
    calls.evaluateStrain.mockImplementation((positions: Float32Array) => ({
      valuesInDrawOrder: Float32Array.of(positions[0] / 10),
    }));
    const { request } = fixture();
    let bodyCurrent = true;
    const body = { ...request.body, isCurrent: () => bodyCurrent };
    const run = new AbortController();
    const paused = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, body, pauseAfterAccepted: () => true },
      run.signal,
    );
    run.abort();
    expect(calls.prepareStrain).not.toHaveBeenCalled();
    expect(calls.evaluateStrain).not.toHaveBeenCalled();

    const canceled = new AbortController();
    const discarded = paused.readPrincipalStrain(canceled.signal);
    canceled.abort();
    await expect(discarded).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.evaluateStrain).not.toHaveBeenCalled();

    const rendered = new AbortController();
    const measured = await paused.readPrincipalStrain(rendered.signal);
    await expect(paused.readPrincipalStrain(rendered.signal)).resolves.toBe(measured);
    expect(calls.evaluateStrain).toHaveBeenCalledExactlyOnceWith(first.positionsMInvMass);
    expect(calls.advance).not.toHaveBeenCalled();
    expect(measured?.valuesInDrawOrder[0]).toBeCloseTo(0.1);

    const { source: _source, ...resumeRequest } = request;
    const accepted = await runSavedWholeAssemblyStagedPreviewV1(
      { ...resumeRequest, body, resume: paused.paused!, pauseAfterAccepted: () => true },
      new AbortController().signal,
    );
    const newer = await accepted.readPrincipalStrain(rendered.signal);
    expect(accepted.cloth.frameNumber).toBe(2);
    expect(newer?.valuesInDrawOrder[0]).toBeCloseTo(0.2);
    expect(calls.evaluateStrain).toHaveBeenNthCalledWith(2, next.positionsMInvMass);
    expect(calls.prepareStrain).toHaveBeenCalledTimes(1);
    expect(calls.start).toHaveBeenCalledTimes(1);
    expect(calls.resume).toHaveBeenCalledTimes(1);

    bodyCurrent = false;
    await expect(accepted.readPrincipalStrain(rendered.signal)).resolves.toBeNull();
    expect(calls.evaluateStrain).toHaveBeenCalledTimes(2);
  });

  it('refuses a mismatched strain draw order without discarding the accepted cloth', async () => {
    calls.start.mockResolvedValue(frame(1));
    calls.prepareStrain.mockReturnValue({ evaluate: calls.evaluateStrain });
    calls.evaluateStrain.mockReturnValue({ valuesInDrawOrder: Float32Array.of(0, 0) });
    const { request } = fixture();
    const signal = new AbortController().signal;
    const accepted = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, pauseAfterAccepted: () => true },
      signal,
    );

    await expect(accepted.readPrincipalStrain(signal)).rejects.toThrow('different triangle counts');
    await expect(accepted.readPrincipalStrain(signal)).rejects.toThrow('different triangle counts');
    expect(accepted.cloth.isCurrent()).toBe(true);
    expect(accepted.cloth.frameNumber).toBe(1);
    expect(request.onAccepted).toHaveBeenCalledTimes(1);
  });

  it('honors a queued pause after presenting a frame and before advancing', async () => {
    calls.start.mockResolvedValue(frame(1));
    calls.advance.mockResolvedValue(frame(2));
    const { request } = fixture();
    let pausedByOperator = false;

    const result = await runSavedWholeAssemblyStagedPreviewV1(
      {
        ...request,
        onAccepted() {
          setTimeout(() => {
            pausedByOperator = true;
          }, 0);
        },
        pauseAfterAccepted: () => pausedByOperator,
      },
      new AbortController().signal,
    );

    expect(result.paused?.lastAcceptedFrame).toBe(1);
    expect(calls.advance).not.toHaveBeenCalled();
  });

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
    const { source, ...resumeRequest } = request;
    const final = await runSavedWholeAssemblyStagedPreviewV1(
      { ...resumeRequest, ownedLease: freshLease, resume: paused.paused! },
      resumed.signal,
    );
    expect(request.verifySource).toHaveBeenCalledWith(source, resumed.signal);
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
    expect(final.maximumGapMm).toBe(3);
    expect(final.maximumGapOperationNumber).toBe(80);
    expect(final.rmsGapMm).toBeCloseTo(Math.sqrt(3));
    expect(paused.rmsGapMm).toBeCloseTo(Math.sqrt(1 / 3));
    expect(final.contact).toEqual({
      passed: true,
      bodyIntersections: 0,
      clothIntersections: 0,
      bodyPairsWithoutClearance: 0,
    });
    expect(final.frameWork).toEqual({
      safeguard: {
        scale: 0.5,
        trialCount: 2,
        proposedDisplacementM: 0.0005,
        acceptedDisplacementM: 0.00025,
        heldParticleCount: 2,
        repairedCutPairCount: 1,
        firstCappedTrial: {
          bodyIntersections: 0,
          bodyPairsWithoutClearance: 0,
          clothIntersections: 1,
        },
      },
      bodyQuery: { frame: 3, visits: 7, maximumVisitsPerQuery: 3 },
    });
    await expect(
      runSavedWholeAssemblyStagedPreviewV1(
        { ...request, ownedLease: freshLease, resume: paused.paused },
        resumed.signal,
      ),
    ).rejects.toThrow('no longer resumable');
  });

  it('publishes accepted contact with no seam gap before any stitch station is active', async () => {
    const accepted = frame(1);
    accepted.validated[0]!.activeSeams = [];
    calls.start.mockResolvedValue(accepted);
    const { request } = fixture();

    const paused = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, pauseAfterAccepted: () => true },
      new AbortController().signal,
    );

    expect(paused.activeSeams).toEqual([]);
    expect(paused.maximumGapOperationNumber).toBeNull();
    expect(paused.rmsGapMm).toBeNull();
    expect(paused.contact).toEqual(accepted.validated[0]!.contact);
    expect(paused.contact.clothIntersections).toBe(0);
    expect(paused.frameWork.safeguard?.firstCappedTrial?.clothIntersections).toBe(1);
  });

  it('rechecks current saved authority before resuming from the retained native source', async () => {
    calls.start.mockResolvedValue(frame(1));
    const { request } = fixture();
    const signal = new AbortController().signal;
    const paused = await runSavedWholeAssemblyStagedPreviewV1(
      { ...request, pauseAfterAccepted: () => true },
      signal,
    );
    const { source, ...resumeRequest } = request;
    const verifySource = vi.fn().mockRejectedValue(new Error('The saved source changed.'));
    await expect(
      runSavedWholeAssemblyStagedPreviewV1(
        { ...resumeRequest, verifySource, resume: paused.paused! },
        signal,
      ),
    ).rejects.toThrow('The saved source changed.');
    expect(verifySource).toHaveBeenCalledExactlyOnceWith(source, signal);
    expect(calls.resume).not.toHaveBeenCalled();
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
    } as NonNullable<Request['source']>;
    await expect(
      runSavedWholeAssemblyStagedPreviewV1({ ...request, source, resume: paused.paused }, signal),
    ).rejects.toThrow('different source or mannequin');
    expect(calls.resume).not.toHaveBeenCalled();
  });
});
