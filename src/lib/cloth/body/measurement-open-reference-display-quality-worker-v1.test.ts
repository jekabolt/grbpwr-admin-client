import { afterEach, describe, expect, it, vi } from 'vitest';

import { WORKER_READY } from 'lib/worker-load';

import { evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1 } from './measurement-open-reference-display-quality-gate-v1';
import {
  evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1,
  MeasurementOpenReferenceDisplayQualityWorkerClientV1,
} from './measurement-open-reference-display-quality-worker-v1';
import type {
  MeasurementOpenReferenceDisplayQualityWorkerRequestV1,
  MeasurementOpenReferenceDisplayQualityWorkerResponseV1,
} from './measurement-open-reference-display-quality-worker-protocol-v1';

const UNIFORM = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const TRIANGLE = Uint16Array.from([0, 1, 2]);

class FakeWorker {
  readonly posted: Array<{
    request: MeasurementOpenReferenceDisplayQualityWorkerRequestV1;
    transfer: Transferable[];
  }> = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(
    request: MeasurementOpenReferenceDisplayQualityWorkerRequestV1,
    transfer: Transferable[],
  ) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  say(data: MeasurementOpenReferenceDisplayQualityWorkerResponseV1 | string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  fail(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('measurement open-reference display quality worker v1', () => {
  it('transfers private typed-array copies and returns the exact gate result', async () => {
    const worker = new FakeWorker();
    const client = new MeasurementOpenReferenceDisplayQualityWorkerClientV1(
      () => worker as unknown as Worker,
    );
    const candidate = UNIFORM.slice();
    const expected = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: UNIFORM,
      personalizedPositionsM: candidate,
      triangleIndices: TRIANGLE,
    });
    const pending = client.evaluate({
      uniformPositionsM: UNIFORM,
      personalizedPositionsM: candidate,
      triangleIndices: TRIANGLE,
    });

    expect(worker.posted).toHaveLength(1);
    const posted = worker.posted[0];
    expect(posted.transfer).toHaveLength(3);
    expect(posted.request.options.uniformPositionsM).not.toBe(UNIFORM);
    expect(posted.request.options.personalizedPositionsM).not.toBe(candidate);
    expect(posted.request.options.triangleIndices).not.toBe(TRIANGLE);
    expect(UNIFORM.byteLength).toBeGreaterThan(0);
    expect(candidate.byteLength).toBeGreaterThan(0);
    expect(TRIANGLE.byteLength).toBeGreaterThan(0);

    worker.say(WORKER_READY);
    worker.say({ id: posted.request.id, type: 'result', result: expected, durationMs: 12 });
    await expect(pending).resolves.toEqual(expected);
  });

  it('drops an aborted stale waiter without accepting its later result', async () => {
    const worker = new FakeWorker();
    const client = new MeasurementOpenReferenceDisplayQualityWorkerClientV1(
      () => worker as unknown as Worker,
    );
    const controller = new AbortController();
    const admitted = UNIFORM.slice();
    const candidate = UNIFORM.slice();
    const indices = TRIANGLE.slice();
    const pending = client.evaluate(
      {
        uniformPositionsM: admitted,
        personalizedPositionsM: candidate,
        triangleIndices: indices,
      },
      controller.signal,
    );
    const request = worker.posted[0].request;

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(admitted).toEqual(UNIFORM);
    expect(candidate).toEqual(UNIFORM);
    expect(indices).toEqual(TRIANGLE);
    expect(admitted.byteLength).toBe(UNIFORM.byteLength);
    expect(candidate.byteLength).toBe(UNIFORM.byteLength);
    expect(indices.byteLength).toBe(TRIANGLE.byteLength);
    worker.say({
      id: request.id,
      type: 'result',
      result: evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
        uniformPositionsM: UNIFORM,
        personalizedPositionsM: UNIFORM.slice(),
        triangleIndices: TRIANGLE,
      }),
      durationMs: 12,
    });
  });

  it('turns a worker crash into the typed fail-closed gate result', async () => {
    vi.stubGlobal('Worker', class {});
    const worker = new FakeWorker();
    const client = new MeasurementOpenReferenceDisplayQualityWorkerClientV1(
      () => worker as unknown as Worker,
    );
    const pending = evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1(
      {
        uniformPositionsM: UNIFORM,
        personalizedPositionsM: UNIFORM.slice(),
        triangleIndices: TRIANGLE,
      },
      client,
    );

    worker.fail('worker crashed');

    await expect(pending).resolves.toMatchObject({
      safe: false,
      reasons: ['self-intersection-evaluation-failed'],
      claims: { selfIntersectionEvaluated: false },
    });
  });

  it('keeps the synchronous evaluator only for runtimes without Web Worker support', async () => {
    vi.stubGlobal('Worker', undefined);
    const expected = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: UNIFORM,
      personalizedPositionsM: UNIFORM.slice(),
      triangleIndices: TRIANGLE,
    });

    await expect(
      evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1({
        uniformPositionsM: UNIFORM,
        personalizedPositionsM: UNIFORM.slice(),
        triangleIndices: TRIANGLE,
      }),
    ).resolves.toEqual(expected);
  });
});
