import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKER_READY, WorkerLoadError } from 'lib/worker-load';
import { ImportWorkerClient, ImportWorkerError } from './client';

const recovery = vi.hoisted(() => ({ workerLoadFailed: vi.fn() }));
vi.mock('lib/stale-reload', () => recovery);

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: { msg: { id: number; type: string }; transfer?: Transferable[] }[] = [];
  terminated = false;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: { id: number; type: string }, transfer?: Transferable[]) {
    this.posted.push({ msg, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  fail(message?: string) {
    this.onerror?.({ message, preventDefault: () => {} } as ErrorEvent);
  }
  say(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const file = () => ({ name: 'a.dxf', bytes: new ArrayBuffer(8) });
const workers = () => FakeWorker.all;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
  recovery.workerLoadFailed.mockReset().mockImplementation(() => new WorkerLoadError());
});
afterEach(() => vi.unstubAllGlobals());

describe('ImportWorkerClient: the bytes of `open` go out once', () => {
  it('nothing is transferred before the worker proves it loaded', async () => {
    const client = new ImportWorkerClient();
    const opening = client.open([file()]);
    await tick();
    expect(workers()[0].posted).toHaveLength(0);

    workers()[0].fail();
    await tick();
    expect(workers()).toHaveLength(2);
    expect(workers()[1].posted).toHaveLength(0);

    workers()[1].say(WORKER_READY);
    await tick();
    expect(workers()[1].posted).toHaveLength(1);
    const { msg, transfer } = workers()[1].posted[0];
    expect(msg.type).toBe('open');
    expect(transfer).toHaveLength(1);

    workers()[1].say({ type: 'opened', id: msg.id, sessionId: 7, files: [] });
    await expect(opening).resolves.toMatchObject({ sessionId: 7 });
  });

  it('after the one retry `open` fails as a load failure and the tab recovers', async () => {
    const client = new ImportWorkerClient();
    const opening = client.open([file()]);
    workers()[0].fail();
    workers()[1].fail();

    await expect(opening).rejects.toBeInstanceOf(WorkerLoadError);
    expect(recovery.workerLoadFailed).toHaveBeenCalledTimes(1);
    expect(workers()[1].posted).toHaveLength(0);
  });

  it('a crash keeps its words and the code the wizard branches on', async () => {
    const client = new ImportWorkerClient();
    const opening = client.open([file()]);
    workers()[0].say(WORKER_READY);
    await tick();

    workers()[0].fail('out of memory');

    await expect(opening).rejects.toBeInstanceOf(ImportWorkerError);
    await expect(opening).rejects.toMatchObject({ code: 'crashed' });
    await expect(opening).rejects.toThrow('out of memory');
    expect(workers()).toHaveLength(1);
    expect(recovery.workerLoadFailed).not.toHaveBeenCalled();
  });
});
