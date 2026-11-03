import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKER_READY, WorkerLoadError } from 'lib/worker-load';
import type { NestConfig } from '../types';
import { NestingWorkerClient } from './client';

const recovery = vi.hoisted(() => ({ workerLoadFailed: vi.fn() }));
vi.mock('lib/stale-reload', () => recovery);

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: { id: number; type: string }[] = [];
  terminated = false;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: { id: number; type: string }) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  fail(message?: string) {
    this.onerror?.((message ? { message } : {}) as ErrorEvent);
  }
  say(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const config = {} as NestConfig;
const workers = () => FakeWorker.all;

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
  recovery.workerLoadFailed.mockReset().mockImplementation(() => new WorkerLoadError());
});
afterEach(() => vi.unstubAllGlobals());

describe('NestingWorkerClient: a worker that did not load', () => {
  it('sends the same requests to one recreated worker, and the answer lands', async () => {
    const client = new NestingWorkerClient();
    const first = client.nest(1, config, () => {});
    const second = client.nest(2, config, () => {});
    const sent = workers()[0].posted;

    workers()[0].fail();

    expect(workers()).toHaveLength(2);
    expect(workers()[0].terminated).toBe(true);
    expect(workers()[1].posted).toEqual(sent);
    expect(recovery.workerLoadFailed).not.toHaveBeenCalled();

    workers()[1].say(WORKER_READY);
    const result = { placed: 1 };
    workers()[1].say({ type: 'result', id: first.id, result });
    workers()[1].say({ type: 'result', id: second.id, result });
    await expect(first.done).resolves.toBe(result);
    await expect(second.done).resolves.toBe(result);
  });

  it('after the one retry the job fails as a load failure and the tab recovers', async () => {
    const client = new NestingWorkerClient();
    const { done } = client.nest(1, config, () => {});

    workers()[0].fail();
    workers()[1].fail();

    await expect(done).rejects.toBeInstanceOf(WorkerLoadError);
    expect(recovery.workerLoadFailed).toHaveBeenCalledTimes(1);
    expect(workers()).toHaveLength(2);
  });

  it('a retry that loaded leaves the next incident its own retry', async () => {
    const client = new NestingWorkerClient();
    const { id, done } = client.nest(1, config, () => {});
    workers()[0].fail();
    workers()[1].say(WORKER_READY);
    workers()[1].say({ type: 'result', id, result: {} });
    await done;
    client.terminate();

    const next = client.nest(1, config, () => {});
    workers()[2].fail();
    expect(workers()).toHaveLength(4);
    expect(recovery.workerLoadFailed).not.toHaveBeenCalled();
    client.terminate();
    await expect(next.done).rejects.toThrow('nesting worker terminated');
  });
});

describe('NestingWorkerClient: a real worker error', () => {
  it('a throw inside the worker shows as before: its message, no retry, no recovery', async () => {
    const client = new NestingWorkerClient();
    const { done } = client.nest(1, config, () => {});

    workers()[0].fail('out of memory');

    await expect(done).rejects.toThrow('out of memory');
    await expect(done).rejects.not.toBeInstanceOf(WorkerLoadError);
    expect(workers()).toHaveLength(1);
    expect(recovery.workerLoadFailed).not.toHaveBeenCalled();
  });

  it('a wordless failure after the script ran is a crash, not a load failure', async () => {
    const client = new NestingWorkerClient();
    const { done } = client.nest(1, config, () => {});

    workers()[0].say(WORKER_READY);
    workers()[0].fail();

    await expect(done).rejects.toThrow('worker error');
    await expect(done).rejects.not.toBeInstanceOf(WorkerLoadError);
    expect(workers()).toHaveLength(1);
    expect(recovery.workerLoadFailed).not.toHaveBeenCalled();
  });
});
