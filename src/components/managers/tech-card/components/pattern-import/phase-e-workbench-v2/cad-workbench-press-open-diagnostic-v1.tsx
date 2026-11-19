import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ModelDisplayedTriangleBodyOwnedInputV1 } from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { Button, Text } from 'ui';
import type { CadWorkbenchSavedPatternScopeV1 } from './cad-workbench-physical-host-v1';
import {
  createCadWorkbenchPreviewLifecycleV1,
  type CadWorkbenchBoundedClothPreviewHostV1,
  type CadWorkbenchPreviewStatusV1,
} from './cad-workbench-preview-lifecycle-v1';
import {
  prepareSavedPressOpenDiagnosticV1,
  runSavedPressOpenDiagnosticV1,
  SAVED_PRESS_OPEN_DIAGNOSTIC_DEGREES_V1,
} from './saved-press-open-diagnostic-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

type Prepared = Awaited<ReturnType<typeof prepareSavedPressOpenDiagnosticV1>>;
type Comparison = Awaited<ReturnType<typeof runSavedPressOpenDiagnosticV1>>;
type DisplayCut = Readonly<{
  positionsM: Float32Array;
  drawRanges: readonly Readonly<{ triangleOffset: number; triangleCount: number }>[];
}>;

function displayCut(geometry: DisplayCut, frameNumber: number, isCurrent: () => boolean) {
  return {
    positionsM: geometry.positionsM,
    frameNumber,
    ranges: geometry.drawRanges.map(({ triangleOffset, triangleCount }, index) => ({
      triangleOffset,
      triangleCount,
      color: index === 0 ? 0x8ba2b1 : 0xb3a287,
    })),
    isCurrent,
  } satisfies MeasurementSurfaceAcceptedClothV1;
}

export default function CadWorkbenchPressOpenDiagnosticV1({
  pattern,
  operationNumber,
  authority,
  orderSizeIds,
  sizeNameById,
  body,
  disabled,
  onAcceptedCloth,
}: Readonly<{
  pattern?: CadWorkbenchSavedPatternScopeV1;
  operationNumber: number;
  authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  body: ModelDisplayedTriangleBodyOwnedInputV1 | null;
  disabled: boolean;
  onAcceptedCloth: (cloth: MeasurementSurfaceAcceptedClothV1 | undefined) => void;
}>) {
  const { dictionary, loading } = useDictionary();
  const patternKey = pattern ? JSON.stringify([pattern.row, pattern.sizeToken]) : null;
  const computeCanvas = useRef<HTMLCanvasElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  const [lifecycle] = useState(createCadWorkbenchPreviewLifecycleV1);
  const preparedRef = useRef<Prepared | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [visibleVariant, setVisibleVariant] = useState<'control' | 'pressed'>('pressed');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<CadWorkbenchPreviewStatusV1>({
    pending: false,
    error: null,
  });
  const host = useMemo<CadWorkbenchBoundedClothPreviewHostV1>(
    () => ({
      async runBounded(lease, signal) {
        const current = preparedRef.current;
        if (!current?.isCurrent()) return { ok: false, detail: 'Check the saved Press again.' };
        const result = await runSavedPressOpenDiagnosticV1(current, lease, signal);
        signal.throwIfAborted();
        if (preparedRef.current !== current || !result.isCurrent())
          return { ok: false, detail: 'The current Press comparison changed.' };
        setComparison(result);
        setVisibleVariant('pressed');
        onAcceptedCloth(displayCut(result.pressed, result.pressed.frame.frame, result.isCurrent));
        return { ok: true, releaseDevice: true };
      },
      async stopPreview() {
        onAcceptedCloth(undefined);
        setComparison(null);
      },
    }),
    [onAcceptedCloth],
  );

  useLayoutEffect(() => {
    setPrepared(null);
    setComparison(null);
    setChecking(false);
    setStatus({ pending: false, error: null });
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      preparedRef.current = null;
      onAcceptedCloth(undefined);
      void lifecycle.cancel(host);
    };
  }, [patternKey, operationNumber, body, authority, disabled, host, lifecycle, onAcceptedCloth]);

  async function checkPress() {
    if (
      !pattern ||
      pattern.row.scopeKey !== 'main' ||
      !body ||
      !dictionary?.sizes ||
      inFlight.current ||
      disabled ||
      !lifecycle.isIdle()
    )
      return;
    const controller = new AbortController();
    inFlight.current = controller;
    setChecking(true);
    setStatus({ pending: false, error: null });
    try {
      const current = await prepareSavedPressOpenDiagnosticV1(
        {
          pattern,
          operationNumber,
          authority,
          dictionary: dictionary.sizes,
          orderSizeIds,
          sizeNameById,
          body,
          isCurrent: () => inFlight.current === controller,
        },
        controller.signal,
      );
      if (!current.isCurrent()) return;
      preparedRef.current = current;
      setPrepared(current);
      onAcceptedCloth(displayCut(current.initial, 0, current.isCurrent));
    } catch (error) {
      if (inFlight.current === controller && !controller.signal.aborted) {
        setStatus({
          pending: false,
          error: error instanceof Error ? error.message : 'The saved Press could not be checked.',
        });
      }
    } finally {
      if (inFlight.current === controller) {
        if (!preparedRef.current) inFlight.current = null;
        setChecking(false);
      }
    }
  }

  function clear() {
    inFlight.current?.abort();
    inFlight.current = null;
    preparedRef.current = null;
    setPrepared(null);
    setComparison(null);
    setStatus({ pending: false, error: null });
    onAcceptedCloth(undefined);
    void lifecycle.cancel(host);
  }

  function chooseVariant(variant: 'control' | 'pressed') {
    if (!comparison?.isCurrent()) return;
    setVisibleVariant(variant);
    const frame = comparison[variant];
    onAcceptedCloth(displayCut(frame, frame.frame.frame, comparison.isCurrent));
  }

  const canCheck = !disabled && !loading && pattern?.row.scopeKey === 'main' && !!body;
  return (
    <section
      aria-label='Physical Press Open diagnostic'
      className='grid gap-1 border-b border-hairline px-2 py-1'
      data-cad-press-open-preview={
        comparison ? 'accepted' : prepared ? 'ready' : checking ? 'checking' : 'idle'
      }
      data-cad-press-open-operation={operationNumber}
      data-cad-press-open-producer={prepared?.target.producerOperationNumber}
      data-cad-press-open-source={prepared?.target.sourceSha256}
      data-cad-press-open-initial={prepared?.initialPositionsSha256}
      data-cad-press-open-faces={prepared?.initialCutFaces}
      data-cad-press-open-control-rest={prepared?.baselineRest}
      data-cad-press-open-pressed-rest={prepared?.pressedRest}
      data-cad-press-open-displacement-mm={comparison?.maximumNormalDisplacementMm}
    >
      <canvas ref={computeCanvas} width={64} height={64} hidden aria-hidden='true' />
      <Text size='micro' component='p'>
        Press Open · diagnostic {SAVED_PRESS_OPEN_DIAGNOSTIC_DEGREES_V1}°
      </Text>
      <div className='flex flex-wrap items-center gap-1'>
        {!comparison && (
          <Button
            type='button'
            size='xs'
            variant='main'
            disabled={!canCheck || checking || status.pending}
            onClick={() => {
              if (prepared && computeCanvas.current)
                void lifecycle.start(host, computeCanvas.current, null, setStatus);
              else void checkPress();
            }}
          >
            {checking
              ? 'Checking Press…'
              : status.pending
                ? 'Comparing…'
                : prepared
                  ? 'Compare Press'
                  : 'Check saved Press'}
          </Button>
        )}
        {comparison && (
          <>
            <Button
              type='button'
              size='xs'
              variant='secondary'
              aria-pressed={visibleVariant === 'control'}
              onClick={() => chooseVariant('control')}
            >
              No press
            </Button>
            <Button
              type='button'
              size='xs'
              variant='secondary'
              aria-pressed={visibleVariant === 'pressed'}
              onClick={() => chooseVariant('pressed')}
            >
              Press 30°
            </Button>
          </>
        )}
        {prepared && (
          <Button type='button' size='xs' variant='secondary' onClick={clear}>
            Return to saved layout
          </Button>
        )}
      </div>
      {status.error && (
        <Text size='micro' component='p' role='alert'>
          {status.error}
        </Text>
      )}
      {!canCheck && !disabled && (
        <Text size='micro' component='p'>
          Select the saved Main pattern and mannequin.
        </Text>
      )}
      {prepared && (
        <Text size='micro' component='p' role='status'>
          {comparison
            ? `${comparison.maximumNormalDisplacementMm.toFixed(3)} mm maximum normal displacement`
            : `Saved seam #${prepared.target.producerOperationNumber} · prepared comparison layout`}
        </Text>
      )}
    </section>
  );
}
