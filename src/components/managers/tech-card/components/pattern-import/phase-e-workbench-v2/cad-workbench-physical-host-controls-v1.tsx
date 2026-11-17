import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createXpbdDeviceSession,
  type XpbdDeviceLease,
} from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { Button, Text } from 'ui';

import type { useSavedClothPhysicalHostV1 } from './use-saved-cloth-physical-host-v1';
import { CadWorkbenchFirstPhysicalAuthoringV1 } from './cad-workbench-first-physical-authoring-v1';

type HostState = ReturnType<typeof useSavedClothPhysicalHostV1>;
type ActivePreview = Readonly<{
  controller: AbortController;
  lease: XpbdDeviceLease;
  session: Awaited<ReturnType<typeof createXpbdDeviceSession>>;
}>;

function resultDetail(result: Readonly<{ ok: boolean; detail?: string }>): string {
  return result.ok ? '' : result.detail?.slice(0, 600) || 'The cloth preview could not complete.';
}

/** Compact viewport-only controls. The underlying mannequin remains mounted and visible. */
export function CadWorkbenchPhysicalHostControlsV1({
  state,
  disabled = false,
}: Readonly<{
  state: HostState;
  disabled?: boolean;
}>) {
  const computeCanvas = useRef<HTMLCanvasElement>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<ActivePreview | null>(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const current = active.current;
    active.current = null;
    current?.controller.abort();
    await state.host?.stopPreview();
    current?.lease.release();
    if (current) await current.session.dispose();
  }, [state.host]);

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  const preview = async () => {
    if (pending || disabled || !state.host || !computeCanvas.current || !previewCanvas.current)
      return;
    await stop();
    const controller = new AbortController();
    setPending(true);
    setLocalError(null);
    try {
      const session = await createXpbdDeviceSession(computeCanvas.current);
      const lease = session.acquireExclusive();
      active.current = { controller, lease, session };
      const frame16 = await state.host.run16(lease, controller.signal);
      if (!frame16.ok) throw new Error(resultDetail(frame16));
      const frame32 = await state.host.run32(lease, controller.signal);
      if (!frame32.ok) throw new Error(resultDetail(frame32));
      const mounted = await state.host.mountPreview(previewCanvas.current, controller.signal);
      if (!mounted.ok) throw new Error(resultDetail(mounted));
    } catch (error) {
      if (!controller.signal.aborted)
        setLocalError(
          error instanceof Error ? error.message.slice(0, 600) : 'Cloth preview failed.',
        );
      await stop();
    } finally {
      setPending(false);
    }
  };

  const ready = state.sourceStatus === 'ready' && state.host !== null;
  const previewReady = state.durableSnapshot?.status === 'preview-ready';
  return (
    <div
      className='pointer-events-none absolute inset-0 z-20 overflow-hidden'
      data-cad-physical-host-viewport=''
      data-cad-physical-host-status={state.sourceStatus}
    >
      <canvas ref={computeCanvas} width={64} height={64} hidden aria-hidden='true' />
      <canvas
        ref={previewCanvas}
        width={640}
        height={720}
        className={`pointer-events-none absolute inset-0 h-full w-full bg-transparent object-contain ${
          previewReady ? 'block' : 'hidden'
        }`}
        aria-label='Cloth simulation on the selected mannequin'
      />
      <div className='pointer-events-auto absolute top-2 right-2 flex max-w-[min(24rem,calc(100%-1rem))] items-center gap-2 border border-borderColor bg-bgColor/95 px-2 py-1'>
        {ready ? (
          <Button
            type='button'
            size='xs'
            variant='main'
            disabled={disabled || pending}
            onClick={() => void preview()}
          >
            {pending ? 'Preparing…' : previewReady ? 'Refresh preview' : 'Preview'}
          </Button>
        ) : state.sourceStatus === 'placement-required' ? (
          <Button
            type='button'
            size='xs'
            variant='main'
            disabled={disabled || state.firstAuthoring.status === 'preparing'}
            onClick={() => void state.startFirstAuthoring()}
          >
            {state.firstAuthoring.status === 'preparing' ? 'Opening…' : 'Place pieces'}
          </Button>
        ) : state.sourceStatus === 'blocked' ? (
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={disabled}
            onClick={state.retry}
          >
            Retry
          </Button>
        ) : null}
        <Text
          component='span'
          size='micro'
          variant={state.sourceStatus === 'blocked' ? 'errorLabel' : 'label'}
        >
          {state.sourceStatus === 'idle'
            ? 'Save the assembly to preview cloth.'
            : state.sourceStatus === 'awaiting-mannequin'
              ? 'Select a mannequin.'
              : state.sourceStatus === 'loading'
                ? 'Restoring cloth…'
                : state.sourceStatus === 'placement-required'
                  ? 'Place pieces on mannequin.'
                  : localError ??
                    state.sourceError ??
                    (previewReady ? 'Cloth preview' : 'Cloth ready')}
        </Text>
      </div>
      <CadWorkbenchFirstPhysicalAuthoringV1 state={state} disabled={disabled} />
    </div>
  );
}
