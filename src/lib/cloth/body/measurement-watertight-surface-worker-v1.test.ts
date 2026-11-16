import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  createMeasurementWatertightSurfaceInWorkerV1,
  type MeasurementWatertightSurfaceWorkerRequestV1,
  type MeasurementWatertightSurfaceWorkerResponseV1,
} from './measurement-watertight-surface-worker-v1';
import type { MeasurementWatertightSurfaceArtifactV1 } from './measurement-watertight-surface-v1';

class FakeWorker {
  readonly posted: MeasurementWatertightSurfaceWorkerRequestV1[] = [];
  terminateCount = 0;
  onmessage: ((event: MessageEvent<MeasurementWatertightSurfaceWorkerResponseV1>) => void) | null =
    null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(request: MeasurementWatertightSurfaceWorkerRequestV1) {
    this.posted.push(request);
  }

  terminate() {
    this.terminateCount += 1;
  }

  say(response: MeasurementWatertightSurfaceWorkerResponseV1) {
    this.onmessage?.({ data: response } as MessageEvent);
  }
}

const options = {
  measurements: {} as CanonicalBodyMeasurementsMm,
  sourceRevision: 'surface-worker-test',
  pose: 'A' as const,
};
const artifact = { version: 'test-artifact' } as unknown as MeasurementWatertightSurfaceArtifactV1;

afterEach(() => vi.unstubAllGlobals());

describe('measurement watertight surface worker v1', () => {
  it('lets abort win the race and ignores a late worker result', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = createMeasurementWatertightSurfaceInWorkerV1(
      { ...options, signal: controller.signal },
      () => worker as unknown as Worker,
    );

    controller.abort();
    worker.say({ id: 1, type: 'result', artifact, durationMs: 12 });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminateCount).toBe(1);
  });

  it('lets the first worker result win and removes the abort listener', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = createMeasurementWatertightSurfaceInWorkerV1(
      { ...options, signal: controller.signal },
      () => worker as unknown as Worker,
    );

    worker.say({ id: 1, type: 'result', artifact, durationMs: 12 });
    controller.abort();

    await expect(pending).resolves.toBe(artifact);
    expect(worker.terminateCount).toBe(1);
  });
});
