import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { Button, Text } from 'ui';

import type { CadWorkbenchPhysicalPreviewInteractionV1 } from './cad-workbench-physical-host-v1';
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
  interaction = null,
}: Readonly<{
  state: HostState;
  disabled?: boolean;
  interaction?: CadWorkbenchPhysicalPreviewInteractionV1 | null;
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
  const receipt = state.durableSnapshot?.numeric.previewReceipt;
  useLayoutEffect(() => {
    const canvas = previewCanvas.current;
    if (!host || !canvas || !previewReady || !receipt) return;
    host.setPreviewSelectedPiece(
      canvas,
      interaction?.scope ?? null,
      interaction?.selectedPiece ?? null,
    );
  }, [host, interaction, previewReady, receipt]);
  const physicalPointer = useRef<{
    id: number;
    x: number;
    y: number;
    host: HostState['host'];
    receipt: typeof receipt;
    interaction: CadWorkbenchPhysicalPreviewInteractionV1;
  } | null>(null);
  const startPick = (event: PointerEvent<HTMLCanvasElement>) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !host ||
      !receipt ||
      !previewReady ||
      !interaction
    )
      return;
    physicalPointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      host,
      receipt,
      interaction,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const cancelPick = (event: PointerEvent<HTMLCanvasElement>) => {
    if (physicalPointer.current?.id === event.pointerId) physicalPointer.current = null;
  };
  const movePick = (event: PointerEvent<HTMLCanvasElement>) => {
    const start = physicalPointer.current;
    if (
      start?.id === event.pointerId &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4
    )
      cancelPick(event);
  };
  const finishPick = (event: PointerEvent<HTMLCanvasElement>) => {
    movePick(event);
    const start = physicalPointer.current;
    if (start?.id !== event.pointerId) return;
    cancelPick(event);
    if (
      !previewReady ||
      !host ||
      start.host !== host ||
      start.receipt !== receipt ||
      start.interaction !== interaction
    )
      return;
    const hit = host.pickPreview(
      event.currentTarget,
      interaction.scope,
      event.clientX,
      event.clientY,
    );
    if (hit) interaction.onPick(hit);
  };
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
        className={`absolute inset-0 h-full w-full bg-transparent object-contain ${
          previewReady ? 'pointer-events-auto block' : 'pointer-events-none hidden'
        }`}
        aria-label='Cloth simulation on the selected mannequin'
        onPointerDown={startPick}
        onPointerMove={movePick}
        onPointerUp={finishPick}
        onPointerCancel={cancelPick}
        onLostPointerCapture={cancelPick}
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
