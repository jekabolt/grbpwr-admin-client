import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  subscribeModelDisplayedTriangleBodyInputInvalidationV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import { MEASUREMENT_SURFACE_PRINCIPAL_STRAIN_SCALE_V1 as principalStrainScale } from 'components/shared/measurement-surface-principal-strain-scale-v1';
import type {
  MeasurementSurfaceAcceptedClothPointV1,
  MeasurementSurfaceAcceptedClothV1,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import type { SourceCutPrincipalStrainV1 } from 'lib/cloth/runtime/cpu/source-cut-principal-strain-v1';
import { Button, Input, Text } from 'ui';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from './cad-workbench-seam-colors-v1';
import {
  useCadWorkbenchRetainMannequinPreviewV1,
  usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1,
} from './cad-workbench-split-shell-v1';
import {
  createCadWorkbenchPreviewLifecycleV1,
  type CadWorkbenchBoundedClothPreviewHostV1,
  type CadWorkbenchPreviewStatusV1,
} from './cad-workbench-preview-lifecycle-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import { formatPatternImportDxfPhaseEMeasurementValueV1 } from './measurement-units-v1';
import type { SavedCrossMaterialReviewForPreviewV8 } from './saved-complete-assembly-native-review-action-v8';
import { matchesSavedNeutralPlacementBodyV1 as matchesSavedBody } from './saved-cross-material-placement-model-binding-v1';
import type {
  SavedWholeAssemblyPreviewProgressV1,
  SavedWholeAssemblyResumeV1,
} from './saved-whole-assembly-staged-preview-v1';

type PreviewKind = 'seam' | 'whole';

const signedStrainPercent = new Intl.NumberFormat('en', {
  style: 'percent',
  signDisplay: 'exceptZero',
  maximumFractionDigits: 2,
});

export default function SavedCompleteAssemblyNativePreviewControlsV8({
  review,
  body,
  disabled,
  onAcceptedCloth,
  onReturnToFlat,
}: {
  review: SavedCrossMaterialReviewForPreviewV8;
  body: ModelDisplayedTriangleBodyOwnedInputV1 | null;
  disabled: boolean;
  onAcceptedCloth: (frame: MeasurementSurfaceAcceptedClothV1 | undefined) => void;
  onReturnToFlat?: () => void;
}) {
  const id = useId();
  const computeCanvas = useRef<HTMLCanvasElement>(null);
  const placementSave = useRef<AbortController | null>(null);
  const previewKind = useRef<PreviewKind>('seam');
  const pauseRequested = useRef(false);
  const resumeRequested = useRef(false);
  const stepRequested = useRef(false);
  const pausedCheckpoint = useRef<SavedWholeAssemblyResumeV1 | null>(null);
  const activeWholeCloth = useRef<MeasurementSurfaceAcceptedClothV1 | null>(null);
  const [showStrain, setShowStrain] = useState(false);
  const [strainReading, setStrainReading] = useState<Readonly<{
    cloth: MeasurementSurfaceAcceptedClothV1;
    value: SourceCutPrincipalStrainV1 | null;
  }> | null>(null);
  const [tape, setTape] = useState<Readonly<{
    cloth: MeasurementSurfaceAcceptedClothV1;
    first?: MeasurementSurfaceAcceptedClothPointV1;
    second?: MeasurementSurfaceAcceptedClothPointV1;
    lengthM?: number | null;
  }> | null>(null);
  const unit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1()?.unit ?? 'mm';
  const [pausing, setPausing] = useState(false);
  const [lifecycle] = useState(() => createCadWorkbenchPreviewLifecycleV1());
  const [status, setStatus] = useState<CadWorkbenchPreviewStatusV1>({
    pending: false,
    error: null,
  });
  const [placementStatus, setPlacementStatus] = useState<CadWorkbenchPreviewStatusV1>({
    pending: false,
    error: null,
  });
  const [acceptedFrame, setAcceptedFrame] = useState<{
    number: number;
    kind: PreviewKind;
  } | null>(null);
  const [wholeProgress, setWholeProgress] = useState<SavedWholeAssemblyPreviewProgressV1 | null>(
    null,
  );
  const retainPreview = useCadWorkbenchRetainMannequinPreviewV1(
    !disabled && (status.pending || acceptedFrame !== null),
  );
  const savedCenter = review.placement?.placement.centerMm;
  const savedBody = review.placement?.body;
  const savedWhole = review.wholeAssembly?.saved;
  const bodyMatchesPlacement = useMemo(
    () => !savedBody || matchesSavedBody(body?.project() ?? null, savedBody),
    [body, savedBody],
  );
  const bodyMatchesWhole = useMemo(
    () => !savedWhole || matchesSavedBody(body?.project() ?? null, savedWhole.body),
    [body, savedWhole],
  );
  const [editing, setEditing] = useState(false);
  const [x, setX] = useState(() => String(savedCenter?.[0] ?? 0));
  const [y, setY] = useState(() => String(savedCenter?.[1] ?? 1010));
  const [z, setZ] = useState(() => String(savedCenter?.[2] ?? 220));
  const current = useRef<Readonly<{ review: typeof review; body: typeof body; disabled: boolean }>>(
    {
      review,
      body,
      disabled,
    },
  );
  current.current = { review, body, disabled };

  const validCenter = [x, y, z].every(
    (coordinate) =>
      coordinate.trim() &&
      Number.isFinite(Number(coordinate)) &&
      Math.abs(Number(coordinate)) <= 10_000,
  );
  const host = useMemo<CadWorkbenchBoundedClothPreviewHostV1>(() => {
    type Run = CadWorkbenchBoundedClothPreviewHostV1['runBounded'];
    let work: ReturnType<Run> | null = null;
    const execute: Run = async (lease, signal) => {
      const displayed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
      const isCurrentSource = () =>
        current.current.review === review &&
        current.current.body === body &&
        !current.current.disabled &&
        body?.isCurrent() === true;
      const isCurrent = () => !signal.aborted && isCurrentSource();
      if (!displayed || !isCurrent())
        throw new Error('Choose a current displayed mannequin and three placement coordinates.');
      const wholeRequested = previewKind.current === 'whole';
      const expectedBody = wholeRequested ? savedWhole?.body : savedBody;
      if (expectedBody && !matchesSavedBody(displayed, expectedBody))
        throw new Error('The displayed mannequin differs from the saved placement.');
      if (wholeRequested) {
        const stepOnce = stepRequested.current;
        stepRequested.current = false;
        const whole = review.wholeAssembly;
        if (!whole || !body) throw new Error('The saved assembly layout is unavailable.');
        const resume = resumeRequested.current ? pausedCheckpoint.current : null;
        if (resumeRequested.current && !resume)
          throw new Error('The saved whole-assembly checkpoint is no longer available.');
        const [runSource, { runSavedWholeAssemblyStagedPreviewV1 }] = await Promise.all([
          resume ? { resume } : whole.load(signal).then((source) => ({ source })),
          import('./saved-whole-assembly-staged-preview-v1'),
        ]);
        const accepted = await runSavedWholeAssemblyStagedPreviewV1(
          {
            ...runSource,
            body,
            ownedLease: lease,
            prepare: whole.prepare,
            savedPlacement: whole.saved,
            isCurrent,
            pauseAfterAccepted: () => stepOnce || pauseRequested.current,
            async verifySource(verifiedSource, active) {
              if (
                verifiedSource.cardId !== review.cardId ||
                verifiedSource.cardLockVersion !== review.lockVersion ||
                verifiedSource.savedCarrier?.sidecarSha256 !== review.sha256
              )
                throw new Error('The accepted source no longer matches this saved assembly.');
              await review.verify(active, verifiedSource.authoredFoldSourceSha256);
            },
            onAccepted(progress) {
              activeWholeCloth.current = progress.cloth;
              setAcceptedFrame({ number: progress.cloth.frameNumber, kind: 'whole' });
              setWholeProgress(progress);
            },
          },
          signal,
        );
        if (!isCurrent()) throw new Error('The displayed mannequin or saved assembly changed.');
        pausedCheckpoint.current = accepted.paused ?? null;
        pauseRequested.current = false;
        setPausing(false);
        setWholeProgress(accepted);
        return { ok: true, releaseDevice: true };
      }
      if (!validCenter) throw new Error('Enter three valid placement coordinates.');
      const load = review.load(signal);
      const source = await load;
      if (review.placement && body) {
        const { prepareCurrentSavedCrossMaterialPlacementV9 } = await import(
          './saved-cross-material-placement-prepare-v9'
        );
        const restored = await prepareCurrentSavedCrossMaterialPlacementV9(
          {
            loadReview: () => load,
            body,
            centerMm: [Number(x), Number(y), Number(z)],
            isCurrent,
          },
          signal,
        );
        if (canonical(restored.placement) !== canonical(review.placement))
          throw new Error(
            'The current mannequin and cuts could not reproduce the saved placement.',
          );
      }
      const [
        { runDirectedSourceCutPreviewV1 },
        { buildSavedCrossMaterialDiagnosticInputsV1, SAVED_CROSS_MATERIAL_DIAGNOSTIC_SCHEDULE_V1 },
      ] = await Promise.all([
        import('components/cloth-simulation-spike/run-directed-source-cut-preview-v1'),
        import('./saved-complete-assembly-native-preview-v8'),
      ]);
      const result = await runDirectedSourceCutPreviewV1(
        {
          source: buildSavedCrossMaterialDiagnosticInputsV1(
            source,
            {
              centerM: [Number(x) / 1000, Number(y) / 1000, Number(z) / 1000],
              depthOffsetsM: [0.004, 0],
            },
            isCurrent,
          ),
          ownedLease: lease,
          body: {
            positionsM: displayed.bodyPositionsM,
            triangles: displayed.bodyTriangles,
            positionsSha256: displayed.hashes.bodyPositionsFloat32LeSha256,
            trianglesSha256: displayed.hashes.bodyTrianglesUint32LeSha256,
            outwardSign: 1,
          },
          schedule: SAVED_CROSS_MATERIAL_DIAGNOSTIC_SCHEDULE_V1,
        },
        signal,
      );
      await review.verify(signal);
      if (!isCurrent()) throw new Error('The displayed mannequin or saved review changed.');
      const frameNumber = result.frame.frame;
      if (frameNumber !== 4 * SAVED_CROSS_MATERIAL_DIAGNOSTIC_SCHEDULE_V1.length)
        throw new Error('The final bounded cloth checkpoint was not accepted.');
      const palette = [CAD_WORKBENCH_SEAM_SIDE_COLORS.A, CAD_WORKBENCH_SEAM_SIDE_COLORS.B];
      onAcceptedCloth(
        Object.freeze({
          positionsM: result.positionsM,
          frameNumber,
          ranges: Object.freeze(
            result.drawRanges.map(({ triangleCount, triangleOffset }, index) =>
              Object.freeze({
                triangleCount,
                triangleOffset,
                color: Number.parseInt(palette[index]!.slice(1), 16),
              }),
            ),
          ),
          isCurrent,
        }),
      );
      setAcceptedFrame({ number: frameNumber, kind: 'seam' });
      return { ok: true };
    };
    return {
      runBounded(lease, signal) {
        if (work) return Promise.resolve({ ok: false, detail: 'Cloth is already computing.' });
        const active = execute(lease, signal);
        work = active;
        return active.finally(() => {
          if (work === active) work = null;
        });
      },
      async stopPreview() {
        pausedCheckpoint.current = null;
        activeWholeCloth.current = null;
        setShowStrain(false);
        setStrainReading(null);
        setTape(null);
        pauseRequested.current = false;
        setPausing(false);
        onAcceptedCloth(undefined);
        setAcceptedFrame(null);
        setWholeProgress(null);
        await work?.catch(() => {});
      },
    };
  }, [body, onAcceptedCloth, review, savedBody, savedWhole, validCenter, x, y, z]);

  useLayoutEffect(() => {
    const cancel = () => {
      placementSave.current?.abort();
      placementSave.current = null;
      setPlacementStatus({ pending: false, error: null });
      activeWholeCloth.current = null;
      setShowStrain(false);
      setStrainReading(null);
      setTape(null);
      onAcceptedCloth(undefined);
      setAcceptedFrame(null);
      setWholeProgress(null);
      setStatus({ pending: false, error: null });
      void lifecycle.cancel(host);
    };
    const unsubscribe = subscribeModelDisplayedTriangleBodyInputInvalidationV1(body, cancel);
    if (disabled) cancel();
    return () => {
      unsubscribe?.();
      cancel();
    };
  }, [body, disabled, host, lifecycle, onAcceptedCloth]);

  const wholeCloth = wholeProgress?.cloth;
  const readPrincipalStrain = wholeProgress?.readPrincipalStrain;
  const measureSurfaceTape = wholeProgress?.measureSurfaceTape;
  const canMeasureTape = !disabled && !status.pending && wholeCloth?.isCurrent() === true;
  const activeTape = canMeasureTape && tape?.cloth === wholeCloth ? tape : null;
  const tapeEnabled = activeTape !== null;
  const pickTapePoint = useMemo(() => {
    if (!tapeEnabled || !wholeCloth) return undefined;
    return (point: MeasurementSurfaceAcceptedClothPointV1) => {
      if (activeWholeCloth.current !== wholeCloth || !wholeCloth.isCurrent()) return;
      setTape((current) => {
        if (current?.cloth !== wholeCloth) return current;
        return current.first && !current.second
          ? { ...current, second: point }
          : { cloth: wholeCloth, first: point };
      });
    };
  }, [tapeEnabled, wholeCloth]);
  useEffect(() => {
    if (
      !measureSurfaceTape ||
      !activeTape?.first ||
      !activeTape.second ||
      activeTape.lengthM !== undefined
    )
      return;
    const controller = new AbortController();
    const publish = (lengthM: number | null) => {
      if (
        !controller.signal.aborted &&
        activeWholeCloth.current === activeTape.cloth &&
        activeTape.cloth.isCurrent()
      )
        setTape((current) => (current === activeTape ? { ...current, lengthM } : current));
    };
    void measureSurfaceTape(activeTape.first, activeTape.second, controller.signal).then(
      publish,
      () => publish(null),
    );
    return () => controller.abort();
  }, [activeTape, measureSurfaceTape]);
  const currentStrainReading =
    showStrain && strainReading?.cloth === wholeCloth ? strainReading : null;
  const displayedStrain = currentStrainReading?.value;
  useLayoutEffect(() => {
    if (!wholeCloth?.isCurrent() || activeWholeCloth.current !== wholeCloth) return;
    onAcceptedCloth(
      displayedStrain || pickTapePoint
        ? Object.freeze({
            ...wholeCloth,
            onMeasurePoint: pickTapePoint,
            ...(displayedStrain && {
              principalStrain: Object.freeze({
                frameNumber: wholeCloth.frameNumber,
                positionsM: wholeCloth.positionsM,
                valuesInDrawOrder: displayedStrain.valuesInDrawOrder,
              }),
            }),
          })
        : wholeCloth,
    );
  }, [displayedStrain, onAcceptedCloth, pickTapePoint, wholeCloth]);

  useEffect(() => {
    if (!showStrain || !readPrincipalStrain || !wholeCloth?.isCurrent()) return;
    const controller = new AbortController();
    const publish = (value: SourceCutPrincipalStrainV1 | null) => {
      if (
        !controller.signal.aborted &&
        activeWholeCloth.current === wholeCloth &&
        wholeCloth.isCurrent()
      )
        setStrainReading({ cloth: wholeCloth, value });
    };
    void readPrincipalStrain(controller.signal).then(publish, () => publish(null));
    return () => controller.abort();
  }, [readPrincipalStrain, showStrain, wholeCloth]);

  const preview = (kind: PreviewKind, options: { resume?: boolean; step?: boolean } = {}) => {
    const resumeSuspended = options.resume === true;
    if (
      disabled ||
      review.placementRebuild ||
      editing ||
      placementSave.current ||
      status.pending ||
      (kind === 'seam'
        ? !validCenter || !bodyMatchesPlacement
        : !review.wholeAssembly || !bodyMatchesWhole) ||
      !body?.isCurrent() ||
      !computeCanvas.current
    )
      return;
    if (resumeSuspended && (kind !== 'whole' || !pausedCheckpoint.current)) return;
    setTape(null);
    previewKind.current = kind;
    pauseRequested.current = false;
    resumeRequested.current = resumeSuspended;
    stepRequested.current = options.step === true;
    setPausing(false);
    void lifecycle.start(
      host,
      computeCanvas.current,
      null,
      (next) => {
        if (next.pending) retainPreview(true);
        setStatus(next);
      },
      resumeSuspended,
    );
  };

  function resetWholePreview() {
    if (disabled || placementSave.current) return;
    stepRequested.current = false;
    setStatus({ pending: false, error: null });
    void lifecycle.cancel(host);
  }

  async function savePlacement(kind: PreviewKind) {
    const save = kind === 'whole' ? review.wholeAssembly?.save : review.savePlacement;
    if (
      !save ||
      disabled ||
      status.pending ||
      placementSave.current ||
      (kind === 'seam' ? !canSave || !bodyMatchesPlacement : editing || !bodyMatchesWhole) ||
      !body?.isCurrent()
    )
      return;
    const controller = new AbortController();
    placementSave.current = controller;
    setPlacementStatus({ pending: true, error: null });
    const isCurrent = () =>
      placementSave.current === controller &&
      !controller.signal.aborted &&
      current.current.review === review &&
      current.current.body === body &&
      !current.current.disabled &&
      body.isCurrent();
    try {
      const input = { body, centerMm: [Number(x), Number(y), Number(z)] as const, isCurrent };
      await save(input, controller.signal);
      if (isCurrent()) setPlacementStatus({ pending: false, error: null });
    } catch (error) {
      if (isCurrent())
        setPlacementStatus({
          pending: false,
          error: error instanceof Error ? error.message : 'The placement could not be saved.',
        });
    } finally {
      if (placementSave.current === controller) placementSave.current = null;
    }
  }

  const busy = disabled || status.pending || placementStatus.pending;
  const canSave =
    validCenter &&
    (!savedCenter ||
      (editing && [x, y, z].some((value, index) => Number(value) !== savedCenter[index])));

  function cancelEdit() {
    if (!savedCenter) return;
    setX(String(savedCenter[0]));
    setY(String(savedCenter[1]));
    setZ(String(savedCenter[2]));
    setEditing(false);
    setPlacementStatus({ pending: false, error: null });
  }

  return (
    <section
      aria-label='Cross-material cloth preview'
      className='space-y-2 border border-borderColor bg-bgColor px-2.5 py-2'
    >
      <div className='flex flex-wrap items-end gap-2'>
        {!review.placementRebuild &&
          (
            [
              ['X', x, setX],
              ['Y', y, setY],
              ['Z', z, setZ],
            ] as const
          ).map(([axis, value, setValue]) => (
            <label key={axis} htmlFor={`${id}-${axis}`} className='w-16 text-micro'>
              {axis} mm
              <Input
                name={`${id}-${axis}`}
                value={value}
                inputMode='decimal'
                disabled={busy}
                readOnly={!!review.placement && !editing}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
              />
            </label>
          ))}
        {!review.placementRebuild && (
          <Button
            type='button'
            variant='main'
            size='xs'
            disabled={
              busy || editing || !validCenter || !bodyMatchesPlacement || !body?.isCurrent()
            }
            onClick={() => preview('seam')}
          >
            {status.pending
              ? 'Computing cloth…'
              : acceptedFrame?.kind !== 'seam'
                ? 'Preview cloth'
                : 'Refresh cloth'}
          </Button>
        )}
        {review.wholeAssembly && !review.placementRebuild && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy || editing || !bodyMatchesWhole || !body?.isCurrent()}
            onClick={() => preview('whole')}
          >
            Preview full layout
          </Button>
        )}
        {status.pending && previewKind.current === 'whole' && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={pausing || !!wholeProgress?.paused}
            onClick={() => {
              pauseRequested.current = true;
              setPausing(true);
            }}
          >
            {pausing || wholeProgress?.paused ? 'Pausing…' : 'Pause after frame'}
          </Button>
        )}
        {!status.pending && wholeProgress?.paused && (
          <Button
            type='button'
            variant='main'
            size='xs'
            disabled={busy || !bodyMatchesWhole || !body?.isCurrent()}
            onClick={() => preview('whole', { resume: true })}
          >
            Resume full layout
          </Button>
        )}
        {review.wholeAssembly &&
          !review.placementRebuild &&
          (!acceptedFrame || wholeProgress?.paused) && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={busy || editing || !bodyMatchesWhole || !body?.isCurrent()}
              onClick={() => preview('whole', { resume: !!wholeProgress?.paused, step: true })}
            >
              Step one frame
            </Button>
          )}
        {wholeCloth?.isCurrent() && (
          <Button
            type='button'
            variant={showStrain ? 'main' : 'secondary'}
            size='xs'
            aria-pressed={showStrain}
            data-whole-assembly-strain-toggle=''
            onClick={() => {
              setShowStrain(!showStrain);
              if (showStrain) setStrainReading(null);
            }}
          >
            Principal strain
          </Button>
        )}
        {canMeasureTape && wholeCloth && (
          <Button
            type='button'
            variant={tapeEnabled ? 'main' : 'secondary'}
            size='xs'
            aria-pressed={tapeEnabled}
            data-whole-assembly-tape-toggle=''
            onClick={() => setTape(tapeEnabled ? null : { cloth: wholeCloth })}
          >
            Surface tape
          </Button>
        )}
        {(wholeProgress || (status.pending && previewKind.current === 'whole')) && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={disabled || placementStatus.pending}
            onClick={resetWholePreview}
          >
            Reset preview
          </Button>
        )}
        {onReturnToFlat && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={placementStatus.pending}
            onClick={() => {
              if (!placementSave.current) onReturnToFlat();
            }}
          >
            Back to flat patterns
          </Button>
        )}
        {review.wholeAssembly?.save && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy || editing || !bodyMatchesWhole || !body?.isCurrent()}
            onClick={() => void savePlacement('whole')}
          >
            {review.placementRebuild ? 'Rebuild 3D placement' : 'Save full placement'}
          </Button>
        )}
        {review.savePlacement && (!review.placement || editing) && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy || !canSave || !bodyMatchesPlacement || !body?.isCurrent()}
            onClick={() => void savePlacement('seam')}
          >
            {placementStatus.pending ? 'Saving placement…' : 'Save placement'}
          </Button>
        )}
        {review.savePlacement && review.placement && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy || (!editing && !bodyMatchesPlacement)}
            onClick={editing ? cancelEdit : () => setEditing(true)}
          >
            {editing ? 'Cancel placement edit' : 'Edit placement'}
          </Button>
        )}
      </div>
      {review.placement && (
        <Text component='p' size='micro' role='status'>
          Saved initial placement · mannequin #{review.placement.body.modelId}
        </Text>
      )}
      {savedWhole && (
        <Text
          component='p'
          size='micro'
          role='status'
          data-whole-placement-xyz-sha={savedWhole.positionsSha256}
          data-whole-placement-body-sha={savedWhole.body.observed.bodyPositionsFloat32LeSha256}
        >
          Saved full placement · mannequin #{savedWhole.body.modelId}
        </Text>
      )}
      {placementStatus.error && (
        <Text component='p' size='micro' role='alert'>
          {placementStatus.error}
        </Text>
      )}
      <Text component='p' size='micro' role={status.error ? 'alert' : 'status'}>
        {status.error ??
          (acceptedFrame === null
            ? savedWhole && !bodyMatchesWhole
              ? `Choose mannequin #${savedWhole.body.modelId} and its saved pose to preview the full layout.`
              : !body?.isCurrent()
                ? 'Choose a mannequin to preview this saved seam.'
                : !bodyMatchesPlacement
                  ? `Choose the mannequin and pose saved for this placement (#${savedBody?.modelId}).`
                  : 'Medium diagnostic cloth · 4 mm starting layer separation'
            : acceptedFrame.kind === 'whole'
              ? `Full layout visible · frame ${acceptedFrame.number}`
              : `Cloth visible · frame ${acceptedFrame.number} · medium diagnostic material`)}
      </Text>
      {!status.pending && wholeProgress?.paused && (
        <Text component='p' size='micro' role='status'>
          Paused after accepted frame {wholeProgress.paused.lastAcceptedFrame}.
        </Text>
      )}
      {activeTape && (
        <Text component='p' size='micro' role='status' data-whole-assembly-tape=''>
          {typeof activeTape.lengthM === 'number'
            ? `Surface distance · ${formatPatternImportDxfPhaseEMeasurementValueV1(activeTape.lengthM * 1000, unit).formatted}`
            : activeTape.lengthM === null
              ? 'No verified surface path between these points.'
              : activeTape.second
                ? 'Measuring surface path…'
                : activeTape.first
                  ? 'Pick a second point on the same piece.'
                  : 'Pick a first point on the garment.'}
        </Text>
      )}
      {wholeProgress?.cloth.isCurrent() && (
        <div
          className='space-y-1'
          data-whole-assembly-frame={wholeProgress.cloth.frameNumber}
          data-whole-assembly-action={wholeProgress.action}
          data-whole-assembly-seams={JSON.stringify(wholeProgress.activeSeams)}
          data-whole-assembly-frame-work={JSON.stringify(wholeProgress.frameWork)}
          data-whole-assembly-maximum-gap-mm={
            wholeProgress.rmsGapMm !== null ? wholeProgress.maximumGapMm : undefined
          }
          data-whole-assembly-rms-gap-mm={wholeProgress.rmsGapMm ?? undefined}
          data-whole-assembly-contact={JSON.stringify(wholeProgress.contact)}
          data-whole-assembly-draw-winding={JSON.stringify(wholeProgress.drawWinding)}
          data-whole-assembly-maximum-gap-operation={
            wholeProgress.maximumGapOperationNumber ?? undefined
          }
          data-whole-assembly-refused-operation={wholeProgress.stopped?.operationNumber}
        >
          <Text component='p' size='micro' role='status'>
            {wholeProgress.action === 'activate' ? 'Activation' : 'Stitch contraction'} · frame{' '}
            {wholeProgress.cloth.frameNumber} · {wholeProgress.activeSeams.length} of{' '}
            {wholeProgress.totalStages} stages active
            {wholeProgress.rmsGapMm === null ? (
              ' · No active stitch stations'
            ) : (
              <>
                {' · Maximum gap '}
                {wholeProgress.maximumGapMm.toFixed(2)} mm
                {wholeProgress.maximumGapOperationNumber !== null &&
                  ` at operation ${wholeProgress.maximumGapOperationNumber}`}
                {' · RMS gap '}
                {wholeProgress.rmsGapMm.toFixed(2)} mm
              </>
            )}
          </Text>
          <Text component='p' size='micro'>
            Contact check passed · Cloth self-intersections{' '}
            {wholeProgress.contact.clothIntersections} · Cloth–mannequin intersections{' '}
            {wholeProgress.contact.bodyIntersections} · Pairs with unproved body clearance{' '}
            {wholeProgress.contact.bodyPairsWithoutClearance}
          </Text>
          <Text component='p' size='micro'>
            Cut triangles opposite their carrier winding{' '}
            {wholeProgress.drawWinding.oppositeTriangleCount} of{' '}
            {wholeProgress.drawWinding.comparedTriangleCount} compared · Indeterminate{' '}
            {wholeProgress.drawWinding.indeterminateTriangleCount}
          </Text>
          {showStrain &&
            (displayedStrain ? (
              <div
                className='space-y-1'
                data-whole-assembly-strain-frame={wholeProgress.cloth.frameNumber}
                data-strain-minimum={displayedStrain.summary.minimum}
                data-strain-maximum={displayedStrain.summary.maximum}
                data-strain-triangles={displayedStrain.summary.triangleCount}
              >
                <Text component='p' size='micro'>
                  Maximum principal engineering strain · dimensionless
                </Text>
                <div className='flex flex-wrap gap-x-2 gap-y-1'>
                  {[
                    [
                      principalStrainScale.compression,
                      `≤${signedStrainPercent.format(-principalStrainScale.clampMagnitude)}`,
                    ],
                    [principalStrainScale.neutral, '0%'],
                    [
                      principalStrainScale.extension,
                      `≥${signedStrainPercent.format(principalStrainScale.clampMagnitude)}`,
                    ],
                  ].map(([color, label]) => (
                    <span key={label} className='inline-flex items-center gap-1'>
                      <span
                        aria-hidden='true'
                        className='h-2 w-2 border border-borderColor'
                        style={{ backgroundColor: color }}
                      />
                      <Text component='span' size='micro'>
                        {label}
                      </Text>
                    </span>
                  ))}
                </div>
                <Text component='p' size='micro'>
                  Color clamped at ±{principalStrainScale.clampMagnitude * 100}% · Measured range{' '}
                  {signedStrainPercent.format(displayedStrain.summary.minimum)} to{' '}
                  {signedStrainPercent.format(displayedStrain.summary.maximum)}
                </Text>
              </div>
            ) : (
              <Text component='p' size='micro' role='status'>
                {currentStrainReading
                  ? 'Principal strain is unavailable for this accepted frame.'
                  : 'Measuring principal strain…'}
              </Text>
            ))}
          {wholeProgress.stopped && (
            <>
              <Text component='p' size='micro' role='alert'>
                Operation {wholeProgress.stopped.operationNumber} refused. Showing the last accepted
                frame.
              </Text>
              <details>
                <summary className='cursor-pointer text-micro'>Technical details</summary>
                <Text
                  component='p'
                  size='micro'
                  className='max-h-32 overflow-auto whitespace-pre-wrap break-all'
                >
                  {wholeProgress.stopped.detail}
                </Text>
              </details>
            </>
          )}
        </div>
      )}
      <canvas ref={computeCanvas} width={1} height={1} hidden aria-hidden='true' />
    </section>
  );
}
