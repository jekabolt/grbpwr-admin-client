import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import type {
  MakeHumanArmSideSeamAssistWorkerRequestV1,
  MakeHumanArmSideSeamAssistWorkerResponseV1,
  MakeHumanArmSideSeamAssistWorkerResultV1,
} from './makehuman-arm-side-seam-assist-worker-protocol-v1';
import { createMakeHumanArmSideSeamAssistsInWorkerV1 } from './makehuman-arm-side-seam-assist-worker-v1';

class FakeWorker {
  readonly posted: Array<{
    request: MakeHumanArmSideSeamAssistWorkerRequestV1;
    transfer: Transferable[];
  }> = [];
  terminated = false;
  onmessage: ((event: MessageEvent<MakeHumanArmSideSeamAssistWorkerResponseV1>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: MakeHumanArmSideSeamAssistWorkerRequestV1, transfer: Transferable[]) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  say(response: MakeHumanArmSideSeamAssistWorkerResponseV1) {
    this.onmessage?.({ data: response } as MessageEvent);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('MakeHuman arm side-seam assist worker v1', () => {
  it('keeps live-session anchors attached while transferring private copies', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const heads = Float32Array.from([0, 1, 2]);
    const tails = Float32Array.from([3, 4, 5]);
    const rollDirections = Float32Array.from([0, 0, 1]);
    const pending = createMakeHumanArmSideSeamAssistsInWorkerV1(
      {
        bundle: {} as MakeHumanCoreRigBundleV1,
        basisKind: 'female',
        heads,
        tails,
        rollDirections,
      },
      () => worker as unknown as Worker,
    );

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0].transfer).toHaveLength(3);
    expect(worker.posted[0].request.options.heads).not.toBe(heads);
    expect(worker.posted[0].request.options.tails).not.toBe(tails);
    expect(worker.posted[0].request.options.rollDirections).not.toBe(rollDirections);
    expect(heads.byteLength).toBeGreaterThan(0);
    expect(tails.byteLength).toBeGreaterThan(0);
    expect(rollDirections.byteLength).toBeGreaterThan(0);

    const result = {
      left: { side: 'left' },
      right: { side: 'right' },
    } as unknown as MakeHumanArmSideSeamAssistWorkerResultV1;
    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });

    await expect(pending).resolves.toBe(result);
    expect(worker.terminated).toBe(true);
  });

  it('terminates an aborted stale calibration', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = createMakeHumanArmSideSeamAssistsInWorkerV1(
      {
        bundle: {} as MakeHumanCoreRigBundleV1,
        basisKind: 'female',
        heads: Float32Array.from([0, 1, 2]),
        tails: Float32Array.from([3, 4, 5]),
        rollDirections: Float32Array.from([0, 0, 1]),
        signal: controller.signal,
      },
      () => worker as unknown as Worker,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });
});
