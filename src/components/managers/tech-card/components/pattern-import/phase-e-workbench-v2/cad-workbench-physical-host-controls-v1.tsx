import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Text } from 'ui';

import type { useSavedClothPhysicalHostV1 } from './use-saved-cloth-physical-host-v1';
import { CadWorkbenchFirstPhysicalAuthoringV1 } from './cad-workbench-first-physical-authoring-v1';
import {
  createCadWorkbenchPreviewLifecycleV1,
  type CadWorkbenchPreviewStatusV1,
} from './cad-workbench-preview-lifecycle-v1';

type HostState = ReturnType<typeof useSavedClothPhysicalHostV1>;

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
  const { host } = state;
  const [lifecycle] = useState(() => createCadWorkbenchPreviewLifecycleV1());
  const [previewStatus, setPreviewStatus] = useState<
    (CadWorkbenchPreviewStatusV1 & Readonly<{ host: HostState['host'] }>) | null
  >(null);
  const localStatus = previewStatus?.host === host ? previewStatus : null;
  const pending = localStatus?.pending ?? false;
  const localError = localStatus?.error;

  useLayoutEffect(
    () => () => {
      void lifecycle.cancel(host);
    },
    [host, lifecycle],
  );

  const preview = () => {
    if (disabled || !host || !computeCanvas.current || !previewCanvas.current) return;
    void lifecycle.start(host, computeCanvas.current, previewCanvas.current, (status) =>
      setPreviewStatus({ ...status, host }),
    );
  };

  const ready = state.sourceStatus === 'ready' && state.host !== null;
  const previewReady = state.durableSnapshot?.status === 'preview-ready';
  const displayedBody = state.bodySession?.getSnapshot();
  return (
    <div
      className='pointer-events-none absolute inset-0 z-20 overflow-hidden'
      data-cad-physical-host-viewport=''
      data-cad-physical-host-status={state.sourceStatus}
      data-cad-physical-body-status={displayedBody?.status}
      data-cad-physical-body-blocker={displayedBody?.blocker?.code}
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
            onClick={preview}
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
          variant={state.sourceStatus === 'blocked' || localError ? 'errorLabel' : 'label'}
        >
          {state.sourceStatus === 'idle'
            ? 'Save the assembly to preview cloth.'
            : state.sourceStatus === 'awaiting-mannequin'
              ? state.sourceError ?? 'Select a mannequin.'
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
