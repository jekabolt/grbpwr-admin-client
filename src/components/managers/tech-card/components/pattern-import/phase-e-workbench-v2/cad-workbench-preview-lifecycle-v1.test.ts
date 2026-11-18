import type {
  CreateXpbdDeviceSessionOptions,
  XpbdDeviceLease,
  XpbdRuntimeIdentity,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { describe, expect, it, vi } from 'vitest';

import {
  createCadWorkbenchPreviewLifecycleV1,
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
  const lease = { release } as unknown as XpbdDeviceLease;
  return {
    lease,
    acquireExclusive: vi.fn(() => lease),
    dispose: vi.fn(async () => ({
      contextUnconfigured: true as const,
      deviceDestroyed: true as const,
      releasedLeaseCount: release.mock.calls.length,
    })),
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
});
