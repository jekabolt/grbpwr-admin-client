import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 } from 'components/cloth-simulation-spike/beta-skirt-strain-utilization-legend-v1';
import type { SavedModelDisplayedTriangleBodySessionSnapshotV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-session-v2';
import { Button, Text } from 'ui';

import type { CadWorkbenchPhysicalPreviewInteractionV1 } from './cad-workbench-physical-host-v1';
import type { useSavedClothPhysicalHostV1 } from './use-saved-cloth-physical-host-v1';
import { CadWorkbenchFirstPhysicalAuthoringV1 } from './cad-workbench-first-physical-authoring-v1';
import {
  createCadWorkbenchPreviewLifecycleV1,
  type CadWorkbenchPreviewStatusV1,
} from './cad-workbench-preview-lifecycle-v1';

type HostState = ReturnType<typeof useSavedClothPhysicalHostV1>;
const strainScale = BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1;

function currentPreviewFrame(
  { host, durableSnapshot: snapshot }: HostState,
  displayedBody: SavedModelDisplayedTriangleBodySessionSnapshotV2 | undefined,
) {
  if (
    snapshot?.status !== 'preview-ready' ||
    host?.getSnapshot() !== snapshot ||
    displayedBody?.status !== 'observed-body-bound'
  )
    return null;
  const { binding, numeric } = snapshot;
  const { frame32Report: frame, previewReceipt: receipt } = numeric;
  const frameBody = frame?.bodyBinding;
  const body = displayedBody.binding;
  if (
    !binding ||
    numeric.status !== 'preview-ready' ||
    numeric.sourceGeneration !== binding.sourceGeneration ||
    numeric.initializationSha256 !== binding.physicalInitializationCanonicalSha256 ||
    frame?.status !== 'diagnostic-completed' ||
    !receipt ||
    frame.frameCount !== 32 ||
    receipt.frames !== frame.frameCount ||
    receipt.frameReportSha256 !== frame.reportSha256 ||
    receipt.sourceBindingSha256 !== frame.sourceBindingSha256 ||
    receipt.finalStateSha256 !== frame.finalStateSha256 ||
    receipt.strainRenderMappingSha256 !== frame.strain?.renderMappingSha256 ||
    receipt.quantity !== 'normalized-green-strain-utilization' ||
    receipt.units !== strainScale.legend.units ||
    receipt.displayClampMaximum !== strainScale.clamp.maximum ||
    !frameBody ||
    !body ||
    frameBody.generation !== body.generation ||
    frameBody.persistedModel.id !== body.persistedModel.id ||
    frameBody.persistedModel.revision !== body.persistedModel.revision ||
    frameBody.persistedModel.updatedAt !== body.persistedModel.updatedAt ||
    frameBody.observedBodyContentSha256 !== body.observedBodyContentSha256
  )
    return null;
  return { receipt, frame };
}

function frameMeasurements({
  receipt,
  frame,
}: NonNullable<ReturnType<typeof currentPreviewFrame>>) {
  const validation = frame.finalValidation;
  if (!validation?.ok || !validation.evaluated || validation.report?.frame !== receipt.frames)
    return [];

  const { parity, collision, orientation } = validation.report;
  const measurements: [label: string, value: string][] = [];
  const seamGapM = parity?.currentMaximumSeamGapM;
  if (
    (frame.layout?.counts?.seam ?? 0) > 0 &&
    typeof seamGapM === 'number' &&
    Number.isFinite(seamGapM) &&
    seamGapM >= 0
  ) {
    const gapMm = seamGapM * 1000;
    const label = gapMm > 0 && gapMm < 0.001 ? '<0.001' : gapMm.toFixed(3);
    measurements.push(['Maximum seam gap', `${label} mm`]);
  }
  const penetratingVertices = collision?.clearance?.penetratingVertexCount;
  if (
    collision?.status === 'signed-clearance-measured' &&
    collision.claims?.signedClassificationDefensible &&
    typeof penetratingVertices === 'number' &&
    Number.isSafeInteger(penetratingVertices) &&
    penetratingVertices >= 0
  )
    measurements.push(['Penetrating garment vertices', String(penetratingVertices)]);
  const normalReversals = orientation?.normalReversalCount;
  if (
    (orientation?.comparedTriangleCount ?? 0) > 0 &&
    typeof normalReversals === 'number' &&
    Number.isSafeInteger(normalReversals) &&
    normalReversals >= 0
  )
    measurements.push(['Reversed triangle normals', String(normalReversals)]);
  return measurements;
}

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
  const displayedBody = state.bodySession?.getSnapshot();
  const currentFrame = ready ? currentPreviewFrame(state, displayedBody) : null;
  const receipt = currentFrame?.receipt ?? null;
  const previewReady = receipt !== null;
  const measurements = currentFrame ? frameMeasurements(currentFrame) : [];
  useLayoutEffect(() => {
    const canvas = previewCanvas.current;
    if (!host || !canvas || !previewReady || !receipt) return;
    host.setPreviewSelectedPiece(
      canvas,
      interaction?.scope ?? null,
      interaction?.selectedPiece ?? null,
      interaction?.selectedSide,
      interaction?.selectedEdge,
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
      interaction.savedSeam,
    );
    if (hit) interaction.onPick(hit);
  };
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
                    (receipt ? `Cloth preview · frame ${receipt.frames}` : 'Cloth ready')}
        </Text>
      </div>
      {receipt ? (
        <aside
          aria-label={`Cloth frame ${receipt.frames}`}
          className='absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-col gap-1 border border-borderColor bg-bgColor/95 px-2 py-1'
        >
          <section aria-label='Strain utilization legend' className='flex flex-col gap-1'>
            <Text component='span' size='micro'>
              {strainScale.legend.title} · {strainScale.legend.units}
            </Text>
            <div className='flex flex-wrap gap-x-2 gap-y-1'>
              {strainScale.stops.map(({ utilization, color }) => (
                <span className='inline-flex items-center gap-1' key={utilization}>
                  <span className='size-2' style={{ backgroundColor: color }} aria-hidden='true' />
                  <Text component='span' size='micro' className='tabular-nums'>
                    {utilization === strainScale.clamp.maximum ? `≥${utilization}` : utilization}
                  </Text>
                </span>
              ))}
            </div>
            <Text component='span' size='micro' variant='label'>
              {strainScale.legend.thresholdLabel} · uncalibrated
            </Text>
            <Text component='span' size='micro' variant='label' className='tabular-nums'>
              Range {receipt.minimumUtilization.toFixed(3)}–{receipt.maximumUtilization.toFixed(3)}
            </Text>
          </section>
          {measurements.length > 0 ? (
            <section
              aria-label='Current frame measurements'
              className='flex flex-wrap gap-x-2 gap-y-1'
            >
              {measurements.map(([label, value]) => (
                <Text
                  component='span'
                  size='micro'
                  variant='label'
                  className='tabular-nums'
                  key={label}
                >
                  {label} {value}
                </Text>
              ))}
            </section>
          ) : null}
        </aside>
      ) : null}
      <CadWorkbenchFirstPhysicalAuthoringV1 state={state} disabled={disabled} />
    </div>
  );
}
