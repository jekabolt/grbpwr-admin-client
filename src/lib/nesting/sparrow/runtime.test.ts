import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inWorker, type WorkerLike, type WorkerOut } from './runtime';

// A worker that never finishes on its own: it only reports what the test tells it to.
function fakeWorker() {
  const w: WorkerLike & { terminated: boolean; report(json: string): void } = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage() {},
    terminate() {
      w.terminated = true;
    },
    report(json: string) {
      w.onmessage?.({ data: { type: 'report', json } as WorkerOut } as MessageEvent<WorkerOut>);
    },
  };
  return w;
}

describe('sparrow worker runtime: deadline and watchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const module = {} as WebAssembly.Module;

  it('ends the run at the operator deadline when a checked layout is in hand', async () => {
    const w = fakeWorker();
    let hasLayout = false;
    const p = inWorker(module, () => w).solve(
      '{}',
      19,
      1,
      () => (hasLayout = true),
      () => false,
      { deadlineMs: 23_000, hasLayout: () => hasLayout },
    );
    w.report('{}');
    await vi.advanceTimersByTimeAsync(22_999);
    expect(w.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await p;
    expect(w.terminated).toBe(true);
    expect(out).toEqual({ resultJson: null, cancelled: false, stoppedAtDeadline: true });
  });

  it('without a checked layout waits for the first one up to the watchdog, then errors', async () => {
    const w = fakeWorker();
    let settled = false;
    const p = inWorker(module, () => w)
      .solve(
        '{}',
        19,
        1,
        () => {},
        () => false,
        { deadlineMs: 23_000, hasLayout: () => false },
      )
      .then((o) => {
        settled = true;
        return o;
      });
    await vi.advanceTimersByTimeAsync(23_000);
    expect(settled).toBe(false);
    expect(w.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(19_000 + 8_000 - 23_000);
    const out = await p;
    expect(w.terminated).toBe(true);
    expect(out.cancelled).toBe(false);
    expect(out.stoppedAtDeadline).toBeUndefined();
    expect(out.error).toContain('did not stop in time');
  });

  it('past the deadline, the first checked layout ends the run at once', async () => {
    const w = fakeWorker();
    let hasLayout = false;
    const p = inWorker(module, () => w).solve(
      '{}',
      19,
      1,
      () => (hasLayout = true),
      () => false,
      { deadlineMs: 23_000, hasLayout: () => hasLayout },
    );
    await vi.advanceTimersByTimeAsync(24_000);
    expect(w.terminated).toBe(false);
    w.report('{}');
    const out = await p;
    expect(w.terminated).toBe(true);
    expect(out.stoppedAtDeadline).toBe(true);
  });
});
