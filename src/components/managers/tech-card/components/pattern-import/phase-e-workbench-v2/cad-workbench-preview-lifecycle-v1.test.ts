import type {
  CreateXpbdDeviceSessionOptions,
  XpbdDeviceLease,
  XpbdRuntimeIdentity,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { describe, expect, it, vi } from 'vitest';

import {
  createCadWorkbenchPreviewLifecycleV1,
  type CadWorkbenchBoundedClothPreviewHostV1,
  type CadWorkbenchPreviewStatusV1,
} from './cad-workbench-preview-lifecycle-v1';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const computeCanvas = {} as HTMLCanvasElement;
const previewCanvas = {} as HTMLCanvasElement;
const ok = { ok: true };

function host() {
  type Checkpoint = (
    resource: unknown,
    signal: AbortSignal,
  ) => Promise<{
    ok: boolean;
    detail?: string;
  }>;
  return {
    stopPreview: vi.fn(async () => {}),
    run16: vi.fn<Checkpoint>().mockResolvedValue(ok),
    run32: vi.fn<Checkpoint>().mockResolvedValue(ok),
    mountPreview: vi.fn<Checkpoint>().mockResolvedValue(ok),
  };
}

function device() {
  const release = vi.fn();
  const drain = vi.fn(async () => {});
  const lease = {
    release,
    device: { queue: { onSubmittedWorkDone: drain } },
  } as unknown as XpbdDeviceLease;
  return {
    lease,
    drain,
    acquireExclusive: vi.fn(() => lease),
    dispose: vi.fn(async () => ({
      contextUnconfigured: true as const,
      deviceDestroyed: true as const,
      releasedLeaseCount: release.mock.calls.length,
    })),
  };
}

const pause = { ok: true, releaseDevice: true } as const;

function boundedHost() {
  let accepted: AbortSignal | undefined;
  return {
    runBounded: vi.fn<CadWorkbenchBoundedClothPreviewHostV1['runBounded']>(async (_, signal) => {
      accepted = signal;
      return pause;
    }),
    stopPreview: vi.fn(async () => {
      accepted = undefined;
    }),
    hasAcceptedFrame: () => accepted?.aborted === false,
  };
}

describe('workbench preview lifecycle', () => {
  it('reserves the first click before stopping and waits for each checkpoint on one lease', async () => {
    const physicalHost = host();
    const session = device();
    const initialStop = deferred<void>();
    const first = deferred<typeof ok>();
    const second = deferred<typeof ok>();
    const mount = deferred<typeof ok>();
    physicalHost.stopPreview.mockReturnValueOnce(initialStop.promise);
    physicalHost.run16.mockReturnValueOnce(first.promise);
    physicalHost.run32.mockReturnValueOnce(second.promise);
    physicalHost.mountPreview.mockReturnValueOnce(mount.promise);
    const create = vi.fn(async () => session);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();
    const duplicate = vi.fn();

    expect(lifecycle.isIdle()).toBe(true);
    const started = lifecycle.start(physicalHost, computeCanvas, previewCanvas, publish);
    expect(lifecycle.isIdle()).toBe(false);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ pending: true, error: null });
    await lifecycle.start(physicalHost, computeCanvas, previewCanvas, duplicate);
    expect(duplicate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    initialStop.resolve();
    await vi.waitFor(() => expect(physicalHost.run16).toHaveBeenCalledTimes(1));
    const signal = physicalHost.run16.mock.calls[0]![1];
    expect(physicalHost.run16).toHaveBeenCalledWith(session.lease, signal);
    expect(physicalHost.run32).not.toHaveBeenCalled();
    first.resolve(ok);
    await vi.waitFor(() =>
      expect(physicalHost.run32).toHaveBeenCalledExactlyOnceWith(session.lease, signal),
    );
    expect(physicalHost.mountPreview).not.toHaveBeenCalled();
    second.resolve(ok);
    await vi.waitFor(() =>
      expect(physicalHost.mountPreview).toHaveBeenCalledExactlyOnceWith(previewCanvas, signal),
    );
    expect(publish).toHaveBeenCalledTimes(1);
    mount.resolve(ok);
    await started;
    expect(lifecycle.isIdle()).toBe(false);
    expect(publish).toHaveBeenLastCalledWith({ pending: false, error: null });
    expect(create).toHaveBeenCalledTimes(1);
    expect(session.dispose).not.toHaveBeenCalled();

    // Refresh lets the host retire the retained frames before aborting their caller.
    const replacement = device();
    physicalHost.stopPreview.mockImplementationOnce(async () => {
      expect(signal.aborted).toBe(false);
      expect(session.lease.release).not.toHaveBeenCalled();
    });
    create.mockResolvedValueOnce(replacement);
    await lifecycle.start(physicalHost, computeCanvas, previewCanvas, publish);
    expect(signal.aborted).toBe(true);
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(physicalHost.run16.mock.lastCall?.[0]).toBe(replacement.lease);
    await lifecycle.cancel(physicalHost);
    expect(lifecycle.isIdle()).toBe(true);
  });

  it('aborts and drains a bounded cloth turn before releasing its one lease', async () => {
    const session = device();
    const drained = deferred<typeof ok>();
    const publish = vi.fn();
    let runSignal: AbortSignal | undefined;
    const bounded = {
      runBounded: vi.fn(async (_lease: XpbdDeviceLease, signal: AbortSignal) => {
        runSignal = signal;
        return drained.promise;
      }),
      stopPreview: vi.fn(async () => {
        if (!runSignal) return;
        expect(runSignal.aborted).toBe(true);
        await drained.promise;
      }),
    };
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(async () => session);
    const started = lifecycle.start(bounded, computeCanvas, null, publish);
    await vi.waitFor(() => expect(bounded.runBounded).toHaveBeenCalledOnce());
    expect(bounded.runBounded).toHaveBeenCalledWith(session.lease, runSignal);
    const stopped = lifecycle.cancel(bounded);
    await vi.waitFor(() => expect(runSignal?.aborted).toBe(true));
    expect(session.lease.release).not.toHaveBeenCalled();
    expect(session.dispose).not.toHaveBeenCalled();
    drained.resolve(ok);
    await Promise.all([started, stopped]);
    expect(session.lease.release).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledExactlyOnceWith({ pending: true, error: null });
  });

  it('disposes a device returned after a host change before reusing its compute canvas', async () => {
    const previousHost = host();
    const nextHost = host();
    const outstandingDevice = deferred<ReturnType<typeof device>>();
    const previousDevice = device();
    const nextDevice = device();
    const create = vi
      .fn(async () => nextDevice)
      .mockReturnValueOnce(outstandingDevice.promise)
      .mockImplementationOnce(async () => {
        expect(previousDevice.dispose).toHaveBeenCalledTimes(1);
        return nextDevice;
      });
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const stale = vi.fn();
    const current = vi.fn();
    const previous = lifecycle.start(previousHost, computeCanvas, previewCanvas, stale);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const cancelled = lifecycle.cancel(previousHost);
    expect(lifecycle.isIdle()).toBe(false);
    const next = lifecycle.start(nextHost, computeCanvas, previewCanvas, current);
    expect(nextHost.stopPreview).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    outstandingDevice.resolve(previousDevice);
    await Promise.all([previous, next, cancelled]);

    expect(previousDevice.acquireExclusive).not.toHaveBeenCalled();
    expect(previousDevice.dispose).toHaveBeenCalledTimes(1);
    expect(previousHost.run16).not.toHaveBeenCalled();
    expect(stale).toHaveBeenCalledExactlyOnceWith({ pending: true, error: null });
    expect(current).toHaveBeenLastCalledWith({ pending: false, error: null });
    expect(nextHost.run16.mock.lastCall?.[0]).toBe(nextDevice.lease);
    await lifecycle.cancel(nextHost);
  });

  it('waits for a cancelled viewport device to finish disposal before a new viewport requests one', async () => {
    const previousHost = boundedHost();
    const nextHost = boundedHost();
    const previousDevice = device();
    const nextDevice = device();
    const outstandingDevice = deferred<ReturnType<typeof device>>();
    const disposing = deferred<void>();
    const disposed = deferred<void>();
    const order: string[] = [];
    previousDevice.dispose.mockImplementationOnce(async () => {
      order.push('previous disposal started');
      disposing.resolve();
      await disposed.promise;
      order.push('previous disposed');
      return { contextUnconfigured: true, deviceDestroyed: true, releasedLeaseCount: 0 };
    });
    const createPrevious = vi.fn(() => outstandingDevice.promise);
    const createNext = vi.fn(async () => {
      order.push('next requested');
      return nextDevice;
    });
    const previousLifecycle = createCadWorkbenchPreviewLifecycleV1(createPrevious);
    const nextLifecycle = createCadWorkbenchPreviewLifecycleV1(createNext);
    const stale = vi.fn();
    const current = vi.fn();

    const previous = previousLifecycle.start(previousHost, computeCanvas, null, stale);
    await vi.waitFor(() => expect(createPrevious).toHaveBeenCalledOnce());
    const cancelled = previousLifecycle.cancel(previousHost);
    const next = nextLifecycle.start(nextHost, {} as HTMLCanvasElement, null, current);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const requestsBeforePreviousConstruction = createNext.mock.calls.length;
    outstandingDevice.resolve(previousDevice);
    await disposing.promise;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    disposed.resolve();
    await Promise.all([previous, next, cancelled]);
    await nextLifecycle.cancel(nextHost);

    expect(requestsBeforePreviousConstruction).toBe(0);
    expect(order).toEqual(['previous disposal started', 'previous disposed', 'next requested']);
    expect(previousDevice.acquireExclusive).not.toHaveBeenCalled();
    expect(previousHost.runBounded).not.toHaveBeenCalled();
    expect(previousDevice.dispose).toHaveBeenCalledOnce();
    expect(stale).toHaveBeenCalledExactlyOnceWith({ pending: true, error: null });
    expect(nextDevice.acquireExclusive).toHaveBeenCalledOnce();
    expect(nextHost.runBounded).toHaveBeenCalledOnce();
    expect(nextDevice.drain).toHaveBeenCalledOnce();
    expect(nextDevice.lease.release).toHaveBeenCalledOnce();
    expect(nextDevice.dispose).toHaveBeenCalledOnce();
    expect(current).toHaveBeenLastCalledWith({ pending: false, error: null });
  });

  it.each(['run16', 'run32', 'mountPreview'] as const)(
    'stops the captured host before releasing resources when cancelled during %s',
    async (stage) => {
      const physicalHost = host();
      const session = device();
      const result = deferred<typeof ok>();
      const stopped = deferred<void>();
      const lifecycle = createCadWorkbenchPreviewLifecycleV1(async () => session);
      const publish = vi.fn();
      physicalHost[stage].mockReturnValueOnce(result.promise);
      const started = lifecycle.start(physicalHost, computeCanvas, previewCanvas, publish);
      await vi.waitFor(() => expect(physicalHost[stage]).toHaveBeenCalledTimes(1));
      physicalHost.stopPreview.mockReturnValueOnce(stopped.promise);
      const cancelled = lifecycle.cancel(physicalHost);
      await vi.waitFor(() => expect(physicalHost.stopPreview).toHaveBeenCalledTimes(2));
      const signal = physicalHost[stage].mock.calls[0]![1];
      expect(session.lease.release).not.toHaveBeenCalled();
      result.resolve(ok);
      await started;
      if (stage === 'run16') expect(physicalHost.run32).not.toHaveBeenCalled();
      if (stage !== 'mountPreview') expect(physicalHost.mountPreview).not.toHaveBeenCalled();
      expect(publish).toHaveBeenCalledExactlyOnceWith({ pending: true, error: null });
      stopped.resolve();
      await cancelled;
      expect(signal.aborted).toBe(true);
      expect(session.lease.release).toHaveBeenCalledTimes(1);
      expect(session.dispose).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['run16', 'run32'] as const)(
    'reports a refused %s checkpoint and disposes even if the host stop fails',
    async (stage) => {
      const physicalHost = host();
      const session = device();
      const lifecycle = createCadWorkbenchPreviewLifecycleV1(async () => session);
      const publish = vi.fn();
      physicalHost[stage].mockResolvedValueOnce({ ok: false, detail: `Rejected ${stage}` });
      physicalHost.stopPreview
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Stop failed'));
      await lifecycle.start(physicalHost, computeCanvas, previewCanvas, publish);
      if (stage === 'run16') expect(physicalHost.run32).not.toHaveBeenCalled();
      expect(physicalHost.mountPreview).not.toHaveBeenCalled();
      expect(session.lease.release).toHaveBeenCalledTimes(1);
      expect(session.dispose).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenLastCalledWith({ pending: false, error: `Rejected ${stage}` });
    },
  );

  it('reports late device loss on a mounted preview and cleans up its existing lease', async () => {
    const physicalHost = host();
    const session = device();
    const create = vi
      .fn<
        (
          canvas: HTMLCanvasElement,
          options: CreateXpbdDeviceSessionOptions,
        ) => Promise<typeof session>
      >()
      .mockResolvedValue(session);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn<(status: CadWorkbenchPreviewStatusV1) => void>();
    await lifecycle.start(physicalHost, computeCanvas, previewCanvas, publish);

    create.mock.calls[0]![1].onDeviceLost?.(
      { __brand: 'GPUDeviceLostInfo', message: 'Test device lost', reason: 'unknown' },
      {} as XpbdRuntimeIdentity,
    );
    await vi.waitFor(() =>
      expect(publish).toHaveBeenLastCalledWith({
        pending: false,
        error: 'WebGPU device lost: Test device lost',
      }),
    );
    expect(physicalHost.stopPreview).toHaveBeenCalledTimes(2);
    expect(session.lease.release).toHaveBeenCalledTimes(1);
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it('exposes runtime unavailability and never enters the first frame', async () => {
    const physicalHost = host();
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(async () => {
      throw new Error('WebGPU is unavailable in this browser.');
    });
    const publish = vi.fn();
    await lifecycle.start(physicalHost, computeCanvas, previewCanvas, publish);
    expect(physicalHost.run16).not.toHaveBeenCalled();
    expect(publish).toHaveBeenLastCalledWith({
      pending: false,
      error: 'WebGPU is unavailable in this browser.',
    });
  });
  it('drains the paused lease before releasing and retains the same display through explicit resume', async () => {
    const bounded = boundedHost();
    const first = device();
    const second = device();
    const completed = deferred<void>();
    const dispose = deferred<Awaited<ReturnType<typeof first.dispose>>>();
    first.drain.mockReturnValueOnce(completed.promise);
    first.dispose.mockReturnValueOnce(dispose.promise);
    const finished = deferred<typeof ok>();
    const original = bounded.runBounded.getMockImplementation()!;
    bounded.runBounded.mockImplementationOnce(original).mockReturnValueOnce(finished.promise);
    const create = vi.fn(async () => second).mockResolvedValueOnce(first);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();
    const paused = lifecycle.start(bounded, computeCanvas, null, publish);
    await vi.waitFor(() => expect(first.drain).toHaveBeenCalledOnce());
    const checkpoint = bounded.runBounded.mock.lastCall![1];

    expect(bounded.hasAcceptedFrame()).toBe(true);
    expect(first.lease.release).not.toHaveBeenCalled();
    expect(first.dispose).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledExactlyOnceWith({ pending: true, error: null });
    await lifecycle.start(bounded, computeCanvas, null, publish, true);
    expect(create).toHaveBeenCalledTimes(1);

    completed.resolve();
    await vi.waitFor(() => expect(first.dispose).toHaveBeenCalledOnce());
    expect(first.lease.release).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledTimes(1);
    dispose.resolve({ contextUnconfigured: true, deviceDestroyed: true, releasedLeaseCount: 1 });
    await paused;
    expect(publish).toHaveBeenLastCalledWith({ pending: false, error: null });
    expect(bounded.stopPreview).toHaveBeenCalledTimes(1);
    expect(checkpoint.aborted).toBe(false);

    const resumed = lifecycle.start(bounded, computeCanvas, null, publish, true);
    await vi.waitFor(() => expect(second.acquireExclusive).toHaveBeenCalledOnce());
    expect(bounded.runBounded.mock.lastCall).toEqual([second.lease, checkpoint]);
    expect(bounded.hasAcceptedFrame()).toBe(true);
    expect(bounded.stopPreview).toHaveBeenCalledTimes(1);
    finished.resolve(ok);
    await resumed;

    await lifecycle.cancel(bounded);
    expect(bounded.hasAcceptedFrame()).toBe(false);
    expect(checkpoint.aborted).toBe(true);
    expect(bounded.stopPreview).toHaveBeenCalledTimes(2);
    expect(first.lease.release).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.lease.release).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.isIdle()).toBe(true);
  });

  it('takes no replacement device for a stale explicit resume or for resume after cancellation', async () => {
    const bounded = boundedHost();
    const stale = boundedHost();
    const first = device();
    const second = device();
    const create = vi.fn(async () => second).mockResolvedValueOnce(first);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();
    const ignored = vi.fn();
    await lifecycle.start(bounded, computeCanvas, previewCanvas, publish);
    await lifecycle.start(stale, computeCanvas, previewCanvas, ignored, true);
    await lifecycle.start(bounded, {} as HTMLCanvasElement, previewCanvas, ignored, true);
    await lifecycle.start(bounded, computeCanvas, null, ignored, true);
    expect(bounded.hasAcceptedFrame()).toBe(true);
    expect(ignored).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    expect(await lifecycle.cancel(stale)).toBeUndefined();
    expect(bounded.hasAcceptedFrame()).toBe(true);

    await lifecycle.cancel(bounded);
    await lifecycle.start(bounded, computeCanvas, previewCanvas, ignored, true);
    expect(bounded.hasAcceptedFrame()).toBe(false);
    expect(create).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(first.lease.release).toHaveBeenCalledOnce();
    expect(lifecycle.isIdle()).toBe(true);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('stops a paused host on ordinary start and waits for cancelled pause drainage before allowing the next viewport', async () => {
    const bounded = boundedHost();
    const other = boundedHost();
    const first = device();
    const next = device();
    const recovered = device();
    const drained = deferred<void>();
    next.drain.mockReturnValueOnce(drained.promise);
    const create = vi
      .fn(async () => recovered)
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(async () => {
        expect(bounded.hasAcceptedFrame()).toBe(false);
        return next;
      })
      .mockImplementationOnce(async () => {
        expect(next.dispose).toHaveBeenCalledOnce();
        return recovered;
      });
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();
    await lifecycle.start(bounded, computeCanvas, null, publish);
    const originalSignal = bounded.runBounded.mock.lastCall![1];
    const second = lifecycle.start(bounded, computeCanvas, null, publish);
    await vi.waitFor(() => expect(next.drain).toHaveBeenCalledOnce());
    expect(originalSignal.aborted).toBe(true);
    expect(bounded.runBounded.mock.lastCall![1]).not.toBe(originalSignal);
    expect(bounded.hasAcceptedFrame()).toBe(true);
    const cancelled = lifecycle.cancel(bounded);
    const replacement = lifecycle.start(other, computeCanvas, null, publish);
    await vi.waitFor(() => expect(bounded.hasAcceptedFrame()).toBe(false));
    expect(create).toHaveBeenCalledTimes(2);
    expect(next.lease.release).not.toHaveBeenCalled();

    drained.resolve();
    await Promise.all([second, cancelled, replacement]);
    expect(next.lease.release).toHaveBeenCalledOnce();
    expect(next.dispose).toHaveBeenCalledOnce();
    expect(bounded.stopPreview).toHaveBeenCalledTimes(3);
    expect(other.hasAcceptedFrame()).toBe(true);
    await lifecycle.cancel(other);
  });

  it('keeps a paused checkpoint on missing resume adapter and ignores destruction of the old device', async () => {
    const bounded = boundedHost();
    const first = device();
    const second = device();
    const create = vi
      .fn<
        (
          canvas: HTMLCanvasElement,
          options: CreateXpbdDeviceSessionOptions,
        ) => Promise<typeof first>
      >()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('No resume adapter is available.'))
      .mockResolvedValueOnce(second);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();
    await lifecycle.start(bounded, computeCanvas, null, publish);
    create.mock.calls[0]![1].onDeviceLost?.(
      { __brand: 'GPUDeviceLostInfo', message: 'Released device', reason: 'destroyed' },
      {} as XpbdRuntimeIdentity,
    );
    expect(publish).toHaveBeenLastCalledWith({ pending: false, error: null });
    await lifecycle.start(bounded, computeCanvas, null, publish, true);
    expect(publish).toHaveBeenLastCalledWith({
      pending: false,
      error: 'No resume adapter is available.',
    });
    expect(bounded.stopPreview).toHaveBeenCalledTimes(1);
    expect(bounded.runBounded).toHaveBeenCalledOnce();
    expect(bounded.hasAcceptedFrame()).toBe(true);

    await lifecycle.start(bounded, computeCanvas, null, publish, true);
    expect(second.acquireExclusive).toHaveBeenCalledOnce();
    expect(bounded.hasAcceptedFrame()).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({ pending: false, error: null });
    await lifecycle.cancel(bounded);
  });

  it('disposes a lost resume device returned after its loss callback before allowing a retry', async () => {
    const bounded = boundedHost();
    const first = device();
    const lost = device();
    const late = deferred<typeof lost>();
    const replacement = device();
    const create = vi
      .fn<
        (
          canvas: HTMLCanvasElement,
          options: CreateXpbdDeviceSessionOptions,
        ) => Promise<typeof first>
      >()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(async (_canvas, options) => {
        options.onDeviceLost?.(
          { __brand: 'GPUDeviceLostInfo', message: 'Lost during resume', reason: 'unknown' },
          {} as XpbdRuntimeIdentity,
        );
        return late.promise;
      })
      .mockResolvedValueOnce(replacement);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();
    await lifecycle.start(bounded, computeCanvas, null, publish);
    const resumed = lifecycle.start(bounded, computeCanvas, null, publish, true);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(publish).toHaveBeenLastCalledWith({ pending: true, error: null });
    expect(bounded.hasAcceptedFrame()).toBe(true);
    late.resolve(lost);
    await resumed;
    expect(publish).toHaveBeenLastCalledWith({
      pending: false,
      error: 'WebGPU device lost: Lost during resume',
    });
    expect(lost.acquireExclusive).not.toHaveBeenCalled();
    expect(lost.dispose).toHaveBeenCalledOnce();
    expect(bounded.hasAcceptedFrame()).toBe(true);
    await lifecycle.start(bounded, computeCanvas, null, publish, true);
    expect(replacement.acquireExclusive).toHaveBeenCalledOnce();
    await lifecycle.cancel(bounded);
  });
  it('revokes a checkpoint if the paused device queue cannot drain', async () => {
    const bounded = boundedHost();
    const session = device();
    session.drain.mockRejectedValueOnce(new Error('Queue did not drain.'));
    const create = vi.fn(async () => session);
    const lifecycle = createCadWorkbenchPreviewLifecycleV1(create);
    const publish = vi.fn();

    await lifecycle.start(bounded, computeCanvas, null, publish);
    expect(bounded.hasAcceptedFrame()).toBe(false);
    expect(bounded.stopPreview).toHaveBeenCalledTimes(2);
    expect(session.lease.release).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.isIdle()).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({ pending: false, error: 'Queue did not drain.' });
    await lifecycle.start(bounded, computeCanvas, null, publish, true);
    expect(create).toHaveBeenCalledOnce();
  });
});
