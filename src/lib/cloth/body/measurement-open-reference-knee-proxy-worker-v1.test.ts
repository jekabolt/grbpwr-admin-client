import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MeasurementOpenReferenceKneeProxyResultV1 } from './measurement-open-reference-knee-proxy-v1';
import type {
  MeasurementOpenReferenceKneeProxyWorkerOptionsV1,
  MeasurementOpenReferenceKneeProxyWorkerRequestV1,
  MeasurementOpenReferenceKneeProxyWorkerResponseV1,
} from './measurement-open-reference-knee-proxy-worker-protocol-v1';
import { solveMeasurementOpenReferenceKneeProxyInWorkerV1 } from './measurement-open-reference-knee-proxy-worker-v1';

class FakeWorker {
  readonly posted: Array<{
    request: MeasurementOpenReferenceKneeProxyWorkerRequestV1;
    transfer?: Transferable[];
  }> = [];
  terminateCount = 0;
  onmessage:
    | ((event: MessageEvent<MeasurementOpenReferenceKneeProxyWorkerResponseV1>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(
    request: MeasurementOpenReferenceKneeProxyWorkerRequestV1,
    transfer?: Transferable[],
  ) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminateCount += 1;
  }

  say(response: MeasurementOpenReferenceKneeProxyWorkerResponseV1) {
    this.onmessage?.({ data: response } as MessageEvent);
  }
}

const options = {
  positionsM: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  triangleIndices: new Uint16Array([0, 1, 2]),
  pose: 'A',
  targetMm: 360,
  stations: [] as unknown,
} as MeasurementOpenReferenceKneeProxyWorkerOptionsV1;
const result = { status: 'represented' } as unknown as MeasurementOpenReferenceKneeProxyResultV1;

afterEach(() => vi.unstubAllGlobals());

describe('measurement open-reference knee proxy worker v1', () => {
  it('posts a transferred copy and keeps the caller positions intact', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const pending = solveMeasurementOpenReferenceKneeProxyInWorkerV1(
      options,
      undefined,
      () => worker as unknown as Worker,
    );

    expect(worker.posted).toHaveLength(1);
    const [{ request, transfer }] = worker.posted;
    expect(request.options.positionsM).not.toBe(options.positionsM);
    expect(request.options.positionsM).toEqual(options.positionsM);
    expect(transfer).toEqual([request.options.positionsM.buffer]);
    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });

    await expect(pending).resolves.toBe(result);
    expect(worker.terminateCount).toBe(1);
  });

  it('lets abort win the race and ignores a late worker result', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = solveMeasurementOpenReferenceKneeProxyInWorkerV1(
      options,
      controller.signal,
      () => worker as unknown as Worker,
    );

    controller.abort();
    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminateCount).toBe(1);
  });

  it('surfaces a worker error as a rejection', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const pending = solveMeasurementOpenReferenceKneeProxyInWorkerV1(
      options,
      undefined,
      () => worker as unknown as Worker,
    );

    worker.say({ id: 1, type: 'error', message: 'knee failed', durationMs: 3 });

    await expect(pending).rejects.toThrow('knee failed');
    expect(worker.terminateCount).toBe(1);
  });

  it('runs inline without Worker and rejects an invalid target instead of throwing', async () => {
    vi.stubGlobal('Worker', undefined);
    await expect(
      solveMeasurementOpenReferenceKneeProxyInWorkerV1({ ...options, targetMm: Number.NaN }),
    ).rejects.toThrow(RangeError);
  });
});
