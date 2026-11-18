import {
  createXpbdDeviceSession,
  type CreateXpbdDeviceSessionOptions,
  type XpbdDeviceLease,
  type XpbdDeviceSession,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';

type PreviewResult = Readonly<{ ok: boolean; detail?: string }>;
type PreviewHost = Readonly<{
  run16(lease: XpbdDeviceLease, signal: AbortSignal): Promise<PreviewResult>;
  run32(lease: XpbdDeviceLease, signal: AbortSignal): Promise<PreviewResult>;
  mountPreview(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<PreviewResult>;
  stopPreview(): Promise<void>;
}>;
type PreviewDevice = Pick<XpbdDeviceSession, 'acquireExclusive' | 'dispose'>;
type CreatePreviewDevice = (
  canvas: HTMLCanvasElement,
  options: Pick<CreateXpbdDeviceSessionOptions, 'onDeviceLost'>,
) => Promise<PreviewDevice>;
export type CadWorkbenchPreviewStatusV1 = Readonly<{ pending: boolean; error: string | null }>;

type PreviewTurn = {
  host: PreviewHost;
  controller: AbortController;
  publish(status: CadWorkbenchPreviewStatusV1): void;
  pending: boolean;
  initialStop?: Promise<void>;
  device?: Promise<PreviewDevice>;
  lease?: XpbdDeviceLease;
  cleanup?: Promise<void>;
};

function requireSuccessful(result: PreviewResult) {
  if (!result.ok) throw new Error(result.detail || 'The cloth preview could not complete.');
}

/** Owns one viewport's preview request, borrowed lease, and underlying device session. */
export function createCadWorkbenchPreviewLifecycleV1(
  createDevice: CreatePreviewDevice = createXpbdDeviceSession,
) {
  let current: PreviewTurn | null = null;
  let closing = Promise.resolve();
  let cleanupCount = 0;

  const isCurrent = (turn: PreviewTurn) =>
    current === turn && !turn.cleanup && !turn.controller.signal.aborted;

  function close(turn: PreviewTurn) {
    if (turn.cleanup) return turn.cleanup;
    cleanupCount += 1;
    const cleanup = Promise.resolve().then(async () => {
      if (!turn.device) {
        await turn.initialStop;
        return;
      }
      try {
        if (turn.lease) await turn.host.stopPreview();
      } finally {
        // Let the host release its retained frame bridges before aborting their caller signal.
        // An abort on a still-retained frame is a source invalidation, not a preview refresh.
        turn.controller.abort();
        const device = await turn.device.catch(() => null);
        try {
          turn.lease?.release();
        } finally {
          await device?.dispose();
        }
      }
    });
    turn.cleanup = cleanup;
    const settled = () => {
      cleanupCount -= 1;
    };
    void cleanup.then(settled, settled);
    // A late create can configure the shared canvas before resolving. Wait for its disposal
    // before a subsequent turn attempts to configure that canvas.
    closing = Promise.allSettled([closing, cleanup]).then(() => undefined);
    if (!turn.lease) turn.controller.abort();
    return cleanup;
  }

  async function fail(turn: PreviewTurn, error: unknown) {
    if (!isCurrent(turn)) return;
    const detail =
      (error instanceof Error ? error.message.slice(0, 600) : null) || 'Cloth preview failed.';
    turn.pending = true;
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
      previewCanvas: HTMLCanvasElement,
      publish: PreviewTurn['publish'],
    ) {
      if (current?.pending) return;
      const previous = current;
      const turn: PreviewTurn = { host, controller: new AbortController(), pending: true, publish };
      current = turn;
      publish({ pending: true, error: null });
      const { signal } = turn.controller;

      try {
        await (previous ? close(previous) : closing);
        if (!isCurrent(turn)) return;
        if (previous?.host !== host) {
          turn.initialStop = host.stopPreview();
          await turn.initialStop;
          if (!isCurrent(turn)) return;
        }
        turn.device = createDevice(computeCanvas, {
          onDeviceLost: ({ message }) => {
            void fail(
              turn,
              new Error(message ? `WebGPU device lost: ${message}` : 'WebGPU device lost.'),
            );
          },
        });
        const device = await turn.device;
        if (!isCurrent(turn)) return;
        const lease = device.acquireExclusive();
        turn.lease = lease;

        const frame16 = await host.run16(lease, signal);
        if (!isCurrent(turn)) return;
        requireSuccessful(frame16);
        const frame32 = await host.run32(lease, signal);
        if (!isCurrent(turn)) return;
        requireSuccessful(frame32);
        const mounted = await host.mountPreview(previewCanvas, signal);
        if (!isCurrent(turn)) return;
        requireSuccessful(mounted);

        turn.pending = false;
        publish({ pending: false, error: null });
      } catch (error) {
        await fail(turn, error);
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
