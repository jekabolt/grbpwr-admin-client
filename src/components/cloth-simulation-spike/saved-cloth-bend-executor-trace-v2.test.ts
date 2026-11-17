import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  actualExecutorCallSites,
  TRACE_BASELINE,
  TRACE_RUNNERS,
  currentTraceDeclarations,
  declarationsDigest,
  recordExecutorTrace,
  tracePositionSentinel,
  type TraceRunnerName,
} from './saved-cloth-bend-executor-trace-v2.test-fixture';
import { XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1 } from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v1';
import { XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2 } from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';

// These pin the original pre-edit extraction, not the new implementation. The archived functions
// are actually executed below with a CPU recorder; no GPU execution or physics acceptance occurs.
const OLD = {
  'beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2.ts': {
    sourceSha256: 'df13fe6900204576ea877b53324af946192b7741fac5c1c16d484deecc8c9c7d',
    extractedSha256: '5201c7f43dc6777ab594caabe8d6c1196d0e433621e800c5f804e52be59eb332',
  },
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4.ts': {
    sourceSha256: '09e39bc9631a840f6a9b024ebde041fcf34c43273ae016d9f17ded92c8d91c85',
    extractedSha256: 'f6e9dc5587d0b178bc774865654c72f3850546574ea6aa0730353a6d02c20711',
  },
};
function oldCoreReturned(value: Record<string, unknown> | null, frame32: boolean) {
  if (!value) throw new Error('Expected a recorded executor return.');
  if (frame32) {
    const checkpoint = value.checkpoint as Record<string, unknown>;
    const final = value.final as Record<string, unknown>;
    expect(checkpoint.bendLimitedStepCount).toBe(0);
    expect(final.bendLimitedStepCount).toBe(0);
    const oldCheckpoint = { ...checkpoint };
    delete oldCheckpoint.bendLimitedStepCount;
    const oldFinal = { ...final };
    delete oldFinal.bendLimitedStepCount;
    return { ...value, checkpoint: oldCheckpoint, final: oldFinal };
  }
  expect(value.bendLimitedStepCount).toBe(0);
  const oldReturn = { ...value };
  delete oldReturn.bendLimitedStepCount;
  return oldReturn;
}
function assertArchivedInput(name: TraceRunnerName) {
  const input = TRACE_BASELINE.runners[name];
  expect(input.sourceSha256).toBe(OLD[name].sourceSha256);
  expect(input.extractedSha256).toBe(OLD[name].extractedSha256);
  expect(declarationsDigest(input.declarations)).toBe(OLD[name].extractedSha256);
  expect(
    input.declarations
      .filter((entry) => TRACE_BASELINE.functionNames.includes(entry.name))
      .map((entry) => entry.name)
      .sort(),
  ).toEqual([...TRACE_BASELINE.functionNames].sort());
  // No changed support helper can be concealed by the fake device: both archived/current helpers execute.
  const current = currentTraceDeclarations(name);
  expect(current.map((entry) => entry.name).sort()).toEqual(
    input.declarations.map((entry) => entry.name).sort(),
  );
}

describe('observed safeguarded bend executor transport; CPU fake GPU, no physics admission', () => {
  for (const runner of TRACE_RUNNERS) {
    const frame32 = runner.includes('32-frame');
    const frames = frame32 ? 32 : 16;
    it(`${frames}: actual private callers bind observed selection while preserving canonical default`, () => {
      const calls = actualExecutorCallSites(runner);
      if (!frame32) {
        expect(calls).toEqual([
          {
            parent: 'runBound16',
            callee: 'resolvePipelineIdentities',
            arguments: ['observed !== undefined'],
          },
          {
            parent: 'runBound16',
            callee: 'executeGpuRun',
            arguments: [
              'lease.device',
              'trackedBuffers',
              'prepared',
              'pipelineIdentities',
              'options.signal',
              'observed?.current',
              'observed !== undefined',
            ],
          },
        ]);
      } else {
        expect(calls).toEqual([
          {
            parent: 'runBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4',
            callee: 'resolvePipelineIdentities',
            arguments: [],
          },
          {
            parent: 'runBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4',
            callee: 'executeGpuRun',
            arguments: [
              'lease.device',
              'trackedBuffers',
              'prepared',
              'pipelineIdentities',
              'options.signal',
            ],
          },
          {
            parent: 'executeObserved32Gpu',
            callee: 'resolvePipelineIdentities',
            arguments: ['true'],
          },
          {
            parent: 'executeObserved32Gpu',
            callee: 'executeGpuRun',
            arguments: [
              'lease.device',
              'buffers',
              'prepared',
              'identities',
              'options.signal',
              'current',
              'true',
            ],
          },
        ]);
      }
    });
    it(`${frames}: canonical default and explicit false preserve the original complete GPU command/byte trace`, async () => {
      assertArchivedInput(runner);
      expect(XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1).toBe(
        '31b0d2166ee27847a85fa68e1fd7f40ed0f5c203f76c4d79e40a1671b1cef796',
      );
      const old = await recordExecutorTrace({ runner, revision: 'baseline' });
      expect(old.error).toBeNull();
      for (const safeguardedBend of [undefined, false]) {
        const current = await recordExecutorTrace({ runner, revision: 'current', safeguardedBend });
        expect(current.error).toBeNull();
        // Compare every recorded shader, allocation, binding, data write, ordered dispatch, copy,
        // submit, wait and map/unmap command. There is no new expected trace hash to bless.
        expect(current.trace).toEqual(old.trace);
        expect(current.tracked).toEqual(old.tracked);
        expect(current.returned).not.toHaveProperty('finalPreviousPositionsInvMassKg');
        expect(oldCoreReturned(current.returned, frame32)).toEqual(old.returned);
      }
      expect(old.trace.filter((event) => event.op === 'dispatchWorkgroups')).toHaveLength(
        frames * 319,
      );
      expect(old.trace.filter((event) => event.op === 'submit')).toHaveLength(frames + 1);
    });
    it(`${frames}: observed true selects V2 and transports independent invalid/limited counters through exact readback offsets`, async () => {
      const current = await recordExecutorTrace({
        runner,
        revision: 'current',
        safeguardedBend: true,
      });
      expect(current.error).toBeNull();
      const shaders = current.trace.filter((event) => event.op === 'createShaderModule');
      expect(
        shaders.some((event) => event.codeSha256 === XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2),
      ).toBe(true);
      expect(
        shaders.some((event) => event.codeSha256 === XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V1),
      ).toBe(false);
      const buffer = current.tracked.find(
        (item) => item.label === 'canonical-medium bend invalid counter',
      );
      expect(buffer?.size).toBe(8);
      const copies = current.trace.filter(
        (event) => event.op === 'copyBufferToBuffer' && event.source === buffer?.id,
      );
      expect(copies).toHaveLength(frame32 ? 2 : 1);
      expect(copies.every((event) => event.size === 8)).toBe(true);
      expect(copies[0]!.targetOffset).toBe(580 * 16 + 32);
      const snapshotBytes = 580 * 16 + 32 + 8 + 912 * 4 + 40;
      const returned = current.returned!;
      if (frame32) {
        expect(returned.snapshotBytes).toBe(snapshotBytes);
        expect(returned.totalReadbackBytes).toBe(snapshotBytes * 2 + 580 * 16);
        expect((returned.checkpoint as Record<string, unknown>).bendInvalidCount).toBe(116);
        expect((returned.checkpoint as Record<string, unknown>).bendLimitedStepCount).toBe(1272);
        expect((returned.final as Record<string, unknown>).bendInvalidCount).toBe(132);
        expect((returned.final as Record<string, unknown>).bendLimitedStepCount).toBe(1544);
        expect(copies[1]!.targetOffset).toBe(snapshotBytes + 580 * 16 + 32);
      } else {
        expect(returned.bendInvalidCount).toBe(116);
        expect(returned.bendLimitedStepCount).toBe(1272);
        expect(returned).not.toHaveProperty('finalPreviousPositionsInvMassKg');
      }
      expect(current.tracked.at(-1)?.size).toBe(
        frame32 ? snapshotBytes * 2 + 580 * 16 : snapshotBytes,
      );
      expect(current.trace.filter((event) => event.op === 'dispatchWorkgroups')).toHaveLength(
        frames * 319,
      );
    });
    it(`${frames}: cancellation after map preserves original canonical cleanup and observed unmaps its larger readback`, async () => {
      // Three setup polls + one per frame + pre-map poll + post-map poll.
      const abortOnPoll = frames + 5;
      const old = await recordExecutorTrace({ runner, revision: 'baseline', abortOnPoll });
      const current = await recordExecutorTrace({ runner, revision: 'current', abortOnPoll });
      const observed = await recordExecutorTrace({
        runner,
        revision: 'current',
        safeguardedBend: true,
        abortOnPoll,
      });
      expect(old.error).toBe('Synthetic source revoked.');
      expect(current.error).toBe(old.error);
      expect(current.trace).toEqual(old.trace);
      expect(observed.error).toBe(old.error);
      expect(old.trace.at(-1)?.op).toBe('unmap');
      expect(current.trace.at(-1)?.op).toBe('unmap');
      expect(observed.trace.at(-1)?.op).toBe('unmap');
      expect(observed.trace.filter((event) => event.op === 'getMappedRange')).toHaveLength(0);
      expect(observed.tracked.at(-1)?.size).toBe(frame32 ? 35_296 : 13_008);
      expect([old.returned, current.returned, observed.returned]).toEqual([null, null, null]);
    });
  }
  it('32: observed previous XYZ/W is copied from its own final buffer after both snapshots', async () => {
    const current = await recordExecutorTrace({
      runner: 'beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4.ts',
      revision: 'current',
      safeguardedBend: true,
      seedPositionSnapshots: true,
    });
    expect(current.error).toBeNull();
    const previous = current.tracked.find(
      (item) => item.label === 'canonical-medium previous positions',
    );
    const readback = current.tracked.at(-1)!;
    expect(previous).toBeDefined();
    expect(previous!.usage & 0x0004).toBe(0x0004);
    expect(readback.usage & 0x0008).toBe(0x0008);
    expect(readback.size).toBe(35_296);
    const copies = current.trace.filter((event) => event.op === 'copyBufferToBuffer');
    const previousCopies = copies.filter((event) => event.source === previous!.id);
    expect(previousCopies).toHaveLength(1);
    expect(previousCopies[0]).toMatchObject({
      sourceOffset: 0,
      target: readback.id,
      targetOffset: 26_016,
      size: 9_280,
    });
    expect(copies.at(-1)).toEqual(previousCopies[0]);
    const expected = (frame: number, previousState: boolean) => {
      const data = tracePositionSentinel(frame, previousState);
      return {
        type: 'Float32Array',
        bytes: 9_280,
        sha256: createHash('sha256').update(new Uint8Array(data.buffer)).digest('hex'),
      };
    };
    expect(current.returned?.finalPreviousPositionsInvMassKg).toEqual(expected(32, true));
    expect((current.returned?.checkpoint as Record<string, unknown>).positions).toEqual(
      expected(16, false),
    );
    expect((current.returned?.final as Record<string, unknown>).positions).toEqual(
      expected(32, false),
    );
    expect(expected(32, true)).not.toEqual(expected(32, false));
    expect(expected(32, true)).not.toEqual(expected(16, false));
    expect(current.returned?.snapshotBytes).toBe(13_008);
    expect(current.returned?.totalReadbackBytes).toBe(35_296);
    expect(current.trace.filter((event) => event.op === 'unmap')).toHaveLength(1);
  });
});
