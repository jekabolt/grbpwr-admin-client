import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerResultV1,
} from './measurement-open-reference-limb-final-closure-worker-protocol-v1';
import { solveMeasurementOpenReferenceLimbFinalClosureInWorkerV1 } from './measurement-open-reference-limb-final-closure-worker-v1';

class FakeWorker {
  readonly posted: MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1[] = [];
  terminateCount = 0;
  onmessage:
    | ((event: MessageEvent<MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: MeasurementOpenReferenceLimbFinalClosureWorkerRequestV1) {
    this.posted.push(request);
  }

  terminate() {
    this.terminateCount += 1;
  }

  say(response: MeasurementOpenReferenceLimbFinalClosureWorkerResponseV1) {
    this.onmessage?.({ data: response } as MessageEvent);
  }
}

const options = {} as MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1;
const result = {
  result: { version: 'test-result' },
  contentRevision: 'test-content-revision',
} as unknown as MeasurementOpenReferenceLimbFinalClosureWorkerResultV1;

afterEach(() => vi.unstubAllGlobals());

describe('measurement open-reference limb final-closure worker v1', () => {
  it('lets abort win the race and ignores a late worker result', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = solveMeasurementOpenReferenceLimbFinalClosureInWorkerV1(
      options,
      controller.signal,
      () => worker as unknown as Worker,
    );

    controller.abort();
    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminateCount).toBe(1);
  });

  it('lets the first worker result win and removes the abort listener', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = solveMeasurementOpenReferenceLimbFinalClosureInWorkerV1(
      options,
      controller.signal,
      () => worker as unknown as Worker,
    );

    worker.say({ id: 1, type: 'result', value: result, durationMs: 12 });
    controller.abort();

    await expect(pending).resolves.toBe(result);
    expect(worker.terminateCount).toBe(1);
  });
});
