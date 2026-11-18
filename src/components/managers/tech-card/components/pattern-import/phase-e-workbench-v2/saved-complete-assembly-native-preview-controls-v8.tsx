import { useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  subscribeModelDisplayedTriangleBodyInputInvalidationV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
  type ModelDisplayedTriangleBodyInputProjectionV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import type { MeasurementSurfaceAcceptedClothV1 } from 'components/shared/measurement-watertight-surface-v1-stage';
import { Button, Input, Text } from 'ui';
import { CAD_WORKBENCH_SEAM_SIDE_COLORS } from './cad-workbench-seam-colors-v1';
import {
  createCadWorkbenchPreviewLifecycleV1,
  type CadWorkbenchBoundedClothPreviewHostV1,
  type CadWorkbenchPreviewStatusV1,
} from './cad-workbench-preview-lifecycle-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import type { SavedCrossMaterialReviewForPreviewV8 } from './saved-complete-assembly-native-review-action-v8';

type PreviewKind = 'seam' | 'whole';

function matchesSavedBody(
  displayed: ModelDisplayedTriangleBodyInputProjectionV1 | null,
  saved: NonNullable<SavedCrossMaterialReviewForPreviewV8['placement']>['body'],
) {
  return (
    displayed?.identity.modelId === `tech-card-base-model:${saved.modelId}` &&
    displayed.hashes.bodyPositionsFloat32LeSha256 === saved.observed.bodyPositionsFloat32LeSha256 &&
    displayed.hashes.bodyTrianglesUint32LeSha256 === saved.observed.bodyTrianglesUint32LeSha256
  );
}

export default function SavedCompleteAssemblyNativePreviewControlsV8({
  review,
  body,
  disabled,
  onAcceptedCloth,
}: {
  review: SavedCrossMaterialReviewForPreviewV8;
  body: ModelDisplayedTriangleBodyOwnedInputV1 | null;
  disabled: boolean;
  onAcceptedCloth: (frame: MeasurementSurfaceAcceptedClothV1 | undefined) => void;
}) {
  const id = useId();
  const computeCanvas = useRef<HTMLCanvasElement>(null);
  const placementSave = useRef<AbortController | null>(null);
  const previewKind = useRef<PreviewKind>('seam');
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
  const savedCenter = review.placement?.placement.centerMm;
  const savedBody = review.placement?.body;
  const bodyMatchesPlacement = useMemo(
    () => !savedBody || matchesSavedBody(body?.project() ?? null, savedBody),
    [body, savedBody],
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
      const isCurrent = () =>
        !signal.aborted &&
        current.current.review === review &&
        current.current.body === body &&
        !current.current.disabled &&
        body?.isCurrent() === true;
      if (!displayed || !isCurrent())
        throw new Error('Choose a current displayed mannequin and three placement coordinates.');
      if (savedBody && !matchesSavedBody(displayed, savedBody))
        throw new Error('The displayed mannequin differs from the saved placement.');
      if (previewKind.current === 'whole') {
        const whole = review.wholeAssembly;
        if (!whole || !body) throw new Error('The saved assembly layout is unavailable.');
        const [source, { runSavedWholeAssemblyStagedPreviewV1 }] = await Promise.all([
          whole.load(signal),
          import('./saved-whole-assembly-staged-preview-v1'),
        ]);
        const accepted = await runSavedWholeAssemblyStagedPreviewV1(
          {
            source,
            body,
            ownedLease: lease,
            prepare: whole.prepare,
            isCurrent,
            verifySource: (_source, active) => review.verify(active),
          },
          signal,
        );
        if (!isCurrent()) throw new Error('The displayed mannequin or saved assembly changed.');
        onAcceptedCloth(accepted);
        setAcceptedFrame({ number: accepted.frameNumber, kind: 'whole' });
        return { ok: true };
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
        onAcceptedCloth(undefined);
        setAcceptedFrame(null);
        await work?.catch(() => {});
      },
    };
  }, [body, onAcceptedCloth, review, savedBody, validCenter, x, y, z]);

  useLayoutEffect(() => {
    const cancel = () => {
      placementSave.current?.abort();
      placementSave.current = null;
      setPlacementStatus({ pending: false, error: null });
      onAcceptedCloth(undefined);
      setAcceptedFrame(null);
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

  const preview = (kind: PreviewKind) => {
    if (
      disabled ||
      editing ||
      placementSave.current ||
      status.pending ||
      (kind === 'seam' ? !validCenter : !review.wholeAssembly) ||
      !bodyMatchesPlacement ||
      !body?.isCurrent() ||
      !computeCanvas.current
    )
      return;
    previewKind.current = kind;
    void lifecycle.start(host, computeCanvas.current, null, setStatus);
  };

  async function savePlacement() {
    if (
      disabled ||
      status.pending ||
      placementSave.current ||
      !canSave ||
      !bodyMatchesPlacement ||
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
      await review.savePlacement(
        { body, centerMm: [Number(x), Number(y), Number(z)], isCurrent },
        controller.signal,
      );
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
        {(
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
        <Button
          type='button'
          variant='main'
          size='xs'
          disabled={busy || editing || !validCenter || !bodyMatchesPlacement || !body?.isCurrent()}
          onClick={() => preview('seam')}
        >
          {status.pending
            ? 'Computing cloth…'
            : acceptedFrame?.kind !== 'seam'
              ? 'Preview cloth'
              : 'Refresh cloth'}
        </Button>
        {review.wholeAssembly && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy || editing || !bodyMatchesPlacement || !body?.isCurrent()}
            onClick={() => preview('whole')}
          >
            Preview full layout
          </Button>
        )}
        {(!review.placement || editing) && (
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy || !canSave || !bodyMatchesPlacement || !body?.isCurrent()}
            onClick={() => void savePlacement()}
          >
            {placementStatus.pending ? 'Saving placement…' : 'Save placement'}
          </Button>
        )}
        {review.placement && (
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
      {placementStatus.error && (
        <Text component='p' size='micro' role='alert'>
          {placementStatus.error}
        </Text>
      )}
      <Text component='p' size='micro' role={status.error ? 'alert' : 'status'}>
        {status.error ??
          (acceptedFrame === null
            ? !body?.isCurrent()
              ? 'Choose a mannequin to preview this saved seam.'
              : !bodyMatchesPlacement
                ? `Choose the mannequin and pose saved for this placement (#${savedBody?.modelId}).`
                : 'Medium diagnostic cloth · 4 mm starting layer separation'
            : acceptedFrame.kind === 'whole'
              ? `Full layout visible · frame ${acceptedFrame.number} · first sewing stage`
              : `Cloth visible · frame ${acceptedFrame.number} · medium diagnostic material`)}
      </Text>
      <canvas ref={computeCanvas} width={1} height={1} hidden aria-hidden='true' />
    </section>
  );
}
