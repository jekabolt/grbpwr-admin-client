import {
  createXpbdDeviceSession,
  type CreateXpbdDeviceSessionOptions,
  type XpbdDeviceLease,
  type XpbdDeviceSession,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';

type PreviewResult = Readonly<{ ok: boolean; detail?: string }>;
type BoundedPreviewResult =
  | (PreviewResult & Readonly<{ releaseDevice?: never }>)
  | Readonly<{ ok: true; releaseDevice?: true; detail?: string }>;
export type CadWorkbenchBoundedClothPreviewHostV1 = Readonly<{
  runBounded(lease: XpbdDeviceLease, signal: AbortSignal): Promise<BoundedPreviewResult>;
  stopPreview(): Promise<void>;
}>;

type PreviewHost =
  | Readonly<{
      run16(lease: XpbdDeviceLease, signal: AbortSignal): Promise<PreviewResult>;
      run32(lease: XpbdDeviceLease, signal: AbortSignal): Promise<PreviewResult>;
      mountPreview(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<PreviewResult>;
      stopPreview(): Promise<void>;
    }>
  | CadWorkbenchBoundedClothPreviewHostV1;
type PreviewDevice = Pick<XpbdDeviceSession, 'acquireExclusive' | 'dispose'>;
type CreatePreviewDevice = (
  canvas: HTMLCanvasElement,
  options: Pick<CreateXpbdDeviceSessionOptions, 'onDeviceLost'>,
) => Promise<PreviewDevice>;
export type CadWorkbenchPreviewStatusV1 = Readonly<{ pending: boolean; error: string | null }>;

type PreviewTurn = {
  host: PreviewHost;
  computeCanvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement | null;
  controller: AbortController;
  publish(status: CadWorkbenchPreviewStatusV1): void;
  pending: boolean;
  initialStop?: Promise<void>;
  device?: Promise<PreviewDevice>;
  lease?: XpbdDeviceLease;
  retainsCheckpoint?: true;
  suspended?: true;
  deviceCleanup?: Promise<void>;
  cleanup?: Promise<void>;
};

function requireSuccessful(result: PreviewResult) {
  if (!result.ok) throw new Error(result.detail || 'The cloth preview could not complete.');
}

// A viewport can unmount before its device has opened or drained. Its replacement must still
// wait for that disposal, even when React creates a new lifecycle for the replacement.
const closingPreviewTurns = new Set<Promise<void>>();

async function waitForClosingPreviewTurns(signal: AbortSignal) {
  while (closingPreviewTurns.size > 0) {
    await Promise.allSettled(closingPreviewTurns);
    signal.throwIfAborted();
  }
}

/** Owns one viewport's preview request, borrowed lease, and underlying device session. */
export function createCadWorkbenchPreviewLifecycleV1(
  createDevice: CreatePreviewDevice = createXpbdDeviceSession,
) {
  let current: PreviewTurn | null = null;
  let cleanupCount = 0;

  const isCurrent = (turn: PreviewTurn) =>
    current === turn && !turn.cleanup && !turn.controller.signal.aborted;

  function releaseDevice(turn: PreviewTurn, drain = false) {
    if (turn.deviceCleanup) return turn.deviceCleanup;
    const { device, lease } = turn;
    turn.deviceCleanup = Promise.resolve()
      .then(async () => {
        try {
          if (drain) await lease?.device.queue.onSubmittedWorkDone();
        } finally {
          const opened = await device?.catch(() => null);
          try {
            lease?.release();
          } finally {
            await opened?.dispose();
          }
        }
      })
      .finally(() => {
        turn.lease = undefined;
        turn.device = undefined;
      });
    return turn.deviceCleanup;
  }

  async function suspend(turn: PreviewTurn, drain: boolean, error: string | null = null) {
    turn.retainsCheckpoint = true;
    await releaseDevice(turn, drain);
    if (!isCurrent(turn)) return;
    turn.suspended = true;
    turn.pending = false;
    turn.publish({ pending: false, error });
  }

  function close(turn: PreviewTurn) {
    if (turn.cleanup) return turn.cleanup;
    cleanupCount += 1;
    const cleanup = Promise.resolve().then(async () => {
      if (!turn.device && !turn.retainsCheckpoint) {
        await turn.initialStop;
        return;
      }
      try {
        if (turn.lease || turn.retainsCheckpoint) {
          if ('runBounded' in turn.host) turn.controller.abort();
          await turn.host.stopPreview();
        }
      } finally {
        // Let the observed frame host release its retained bridges before aborting their caller.
        // A bounded host uses the abort to drain an active run before it clears the frame.
        turn.controller.abort();
        await releaseDevice(turn);
      }
    });
    turn.cleanup = cleanup;
    closingPreviewTurns.add(cleanup);
    const settled = () => {
      cleanupCount -= 1;
      closingPreviewTurns.delete(cleanup);
    };
    void cleanup.then(settled, settled);
    if (!turn.lease) turn.controller.abort();
    return cleanup;
  }

  async function fail(turn: PreviewTurn, error: unknown) {
    if (!isCurrent(turn)) return;
    const detail =
      (error instanceof Error ? error.message.slice(0, 600) : null) || 'Cloth preview failed.';
    turn.pending = true;
    if (turn.retainsCheckpoint && !turn.lease && !turn.deviceCleanup) {
      try {
        // No resumed run has used the new device. The previous accepted frame can be retried.
        await suspend(turn, false, detail);
        return;
      } catch {
        if (!isCurrent(turn)) return;
      }
    }
    const cleanup = close(turn);
    turn.publish({ pending: true, error: detail });
    await cleanup.catch(() => {});
    if (current !== turn) return;
    current = null;
    turn.publish({ pending: false, error: detail });
  }

  return {
    isIdle: () => current === null && cleanupCount === 0,
    async start(
      host: PreviewHost,
      computeCanvas: HTMLCanvasElement,
      previewCanvas: HTMLCanvasElement | null,
      publish: PreviewTurn['publish'],
      resumeSuspended = false,
    ) {
      if (current?.pending) return;
      const previous = current;
      const suspended =
        resumeSuspended &&
        previous?.suspended &&
        previous.host === host &&
        previous.computeCanvas === computeCanvas &&
        previous.previewCanvas === previewCanvas
          ? previous
          : null;
      if (resumeSuspended && !suspended) return;
      const turn: PreviewTurn = {
        host,
        computeCanvas,
        previewCanvas,
        // The accepted canvas still checks the host's original signal on every display update.
        controller: suspended?.controller ?? new AbortController(),
        ...(suspended && { retainsCheckpoint: true }),
        pending: true,
        publish,
      };
      current = turn;
      publish({ pending: true, error: null });
      const { signal } = turn.controller;
      let deviceLost: Promise<void> | undefined;

      try {
        if (previous && !suspended) await close(previous);
        await waitForClosingPreviewTurns(signal);
        if (!isCurrent(turn)) return;
        if (!suspended && previous?.host !== host) {
          turn.initialStop = host.stopPreview();
          await turn.initialStop;
          await waitForClosingPreviewTurns(signal);
          if (!isCurrent(turn)) return;
        }
        turn.device = Promise.resolve().then(() => {
          signal.throwIfAborted();
          return createDevice(computeCanvas, {
            onDeviceLost: ({ message }) => {
              if (turn.deviceCleanup) return;
              deviceLost ??= fail(
                turn,
                new Error(message ? `WebGPU device lost: ${message}` : 'WebGPU device lost.'),
              );
            },
          });
        });
        const device = await turn.device;
        if (deviceLost) {
          await deviceLost;
          return;
        }
        if (!isCurrent(turn)) return;
        const lease = device.acquireExclusive();
        turn.lease = lease;

        if ('runBounded' in host) {
          const staged = await host.runBounded(lease, signal);
          if (!isCurrent(turn)) return;
          requireSuccessful(staged);
          if (staged.releaseDevice === true) {
            await suspend(turn, true);
            return;
          }
        } else {
          if (!previewCanvas) throw new Error('The cloth preview display is unavailable.');
          const frame16 = await host.run16(lease, signal);
          if (!isCurrent(turn)) return;
          requireSuccessful(frame16);
          const frame32 = await host.run32(lease, signal);
          if (!isCurrent(turn)) return;
          requireSuccessful(frame32);
          const mounted = await host.mountPreview(previewCanvas, signal);
          if (!isCurrent(turn)) return;
          requireSuccessful(mounted);
        }

        turn.pending = false;
        publish({ pending: false, error: null });
      } catch (error) {
        await (deviceLost ?? fail(turn, error));
      }
    },

    cancel(host: PreviewHost | null) {
      const turn = current;
      if (!turn || turn.host !== host) return;
      current = null;
      return close(turn).catch(() => {});
    },
  };
}
