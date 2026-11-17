import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench/assembly-order-entry';
import { createPatternImportDxfProductCompositePlacementProductionReaderV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1';
import { createPatternImportDxfProductCompositePlacementProductionSaverV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-save-v1';
import { createPatternImportDxfProductSavedPlacementProductionContextV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-placement-context-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PatternImportDxfProductConfirmedAnnularIntentV1 } from 'lib/cloth/domain/pattern-import-dxf-product-confirmed-annular-intent-v1';
import { Button, GroupLabel, Text } from 'ui';

import {
  isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2,
  projectBetaSkirtCanonicalMediumDisplayedBodyV2,
  type BetaSkirtCanonicalMediumDisplayedBodyOwnerV2,
} from './beta-skirt-canonical-medium-displayed-body-admission-v2';
import { BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1 } from './beta-skirt-strain-utilization-legend-v1';
import type { PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1 } from './pattern-import-dxf-product-saved-physical-beta-preview-v1';
import { SavedPhysicalCanonicalStageV1 } from './saved-physical-canonical-stage-v1';
import { SavedPhysicalPlacementAuthoringV1 } from './saved-physical-placement-authoring-v1';
import { qualifiedTwoPanelPlacementBodyTargetV1 } from './qualified-two-panel-placement-authoring-v1';

type Props = Readonly<{
  owner: PatternImportDxfPhaseESavedGarmentMeshProductionOwnerV1;
  row: DxfProductSavedRowIdentityV1;
}>;
type Compiled = NonNullable<ReturnType<Props['owner']['latestCompile']>>;
type PlacementContext = ReturnType<
  typeof createPatternImportDxfProductSavedPlacementProductionContextV1
>;
type PlacementState = 'loading' | 'ready' | 'missing' | 'blocked';
type RunState = 'idle' | 'checking' | 'placing' | 'running' | 'complete' | 'stopped' | 'blocked';
const missingPlacement =
  'No confirmed placement is saved for this assembly. Confirm garment roles and placement before running the preview.';
const restartHint = 'Reconfirm the saved assembly to start a fresh simulation.';

/** Value identity only: owner.version() also changes when the physical preview publishes. */
export function savedPhysicalPreviewCompileKeyV1(row: Props['row'], compiled: Compiled) {
  return JSON.stringify([
    row.techCardId,
    row.scopeKey,
    row.patternLineKey,
    row.revision,
    row.cardLockVersion,
    row.url,
    row.sizeBytes,
    row.sha256,
    compiled.generation,
    compiled.composerSnapshot.seal.canonicalSha256,
  ]);
}

/** This module is lazy-loaded by the table only after a genuine saved compile succeeds. */
export function SavedPhysicalPreviewPanelV1({ owner, row }: Props) {
  useSyncExternalStore(owner.subscribe, owner.version, owner.version);
  const compiled = owner.latestCompile();
  if (!compiled) return null;
  return (
    <SavedPhysicalPreviewCurrentV1
      key={savedPhysicalPreviewCompileKeyV1(row, compiled)}
      owner={owner}
      row={row}
      compiled={compiled}
    />
  );
}

function SavedPhysicalPreviewCurrentV1({ owner, row, compiled }: Props & { compiled: Compiled }) {
  // The outer value key remounts this scope on source changes. Detached compile clones and
  // physical-stage notifications must not dispose/recreate the context or the displayed body.
  const [binding] = useState(() => ({ row, compiled }));
  const [canonical, setCanonical] = useState(false);
  const [body, setBody] = useState<BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 | null>(null);
  const [placement, setPlacement] = useState<PlacementState>('loading');
  const [placementError, setPlacementError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [run, setRun] = useState<RunState>('idle');
  const [runError, setRunError] = useState<string | null>(null);
  const [runtimeAttempted, setRuntimeAttempted] = useState(false);
  const consumed = runtimeAttempted || owner.physicalStage()?.runtimeSourceConsumed === true;
  const [receipts, setReceipts] =
    useState<PatternImportDxfProductSavedPhysicalBetaPreviewReceiptsV1 | null>(null);
  const context = useRef<PlacementContext | null>(null);
  const currentBody = useRef(body);
  const activeRun = useRef<AbortController | null>(null);
  const activeSave = useRef<AbortController | null>(null);
  const previewVisible = useRef(false);
  const mounted = useRef(false);
  const computeCanvas = useRef<HTMLCanvasElement>(null);
  const displayCanvas = useRef<HTMLCanvasElement>(null);

  const stop = useCallback(() => {
    const hadWork = Boolean(activeRun.current || previewVisible.current);
    activeRun.current?.abort();
    owner.stopBetaPreview();
    previewVisible.current = false;
    if (mounted.current) {
      setReceipts(null);
      if (hadWork) setRun('stopped');
    }
  }, [owner]);

  const onBody = useCallback(
    (next: BetaSkirtCanonicalMediumDisplayedBodyOwnerV2 | null) => {
      if (currentBody.current && currentBody.current !== next) {
        activeSave.current?.abort();
        stop();
        owner.invalidateActualBody(binding.compiled.generation);
      }
      currentBody.current = next;
      if (mounted.current) setBody(next);
    },
    [stop, owner, binding],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeRun.current?.abort();
      activeSave.current?.abort();
      owner.stopBetaPreview();
      owner.invalidateActualBody(binding.compiled.generation);
      currentBody.current = null;
    };
  }, [owner, binding]);

  useEffect(() => {
    const controller = new AbortController();
    let current: PlacementContext | null = null;
    setPlacement('loading');
    setPlacementError(null);
    void (async () => {
      try {
        current = createPatternImportDxfProductSavedPlacementProductionContextV1({
          row: binding.row,
          compiled: binding.compiled,
          readCurrentSession: () =>
            owner.snapshot() ?? {
              generation: 0,
              disposed: true,
              composerCanonicalSha256: null,
            },
        });
        context.current = current;
        const restored = await readSavedPlacement(current, controller.signal);
        if (!controller.signal.aborted) {
          setPlacement(restored ? 'ready' : 'missing');
          setEditing(!restored);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setPlacement('blocked');
          setPlacementError(errorMessage(cause, 'Saved placement could not be verified.'));
        }
      }
    })();
    return () => {
      controller.abort();
      current?.dispose();
      if (context.current === current) context.current = null;
    };
  }, [owner, binding, reload]);

  const bodyTarget = useMemo(() => {
    const display = projectBetaSkirtCanonicalMediumDisplayedBodyV2(body);
    return display ? qualifiedTwoPanelPlacementBodyTargetV1(display.binding) : null;
  }, [body]);
  const projection = useMemo(() => owner.projectLatest(), [owner, binding]);

  const invalidatePlacement = () => {
    stop();
    owner.invalidateActualBody(binding.compiled.generation);
    setRun('idle');
    setRunError(null);
  };
  const reloadPlacement = () => {
    invalidatePlacement();
    setPlacement('loading');
    setEditing(false);
    setReload((value) => value + 1);
  };

  const savePlacement = async (intent: PatternImportDxfProductConfirmedAnnularIntentV1) => {
    const savedContext = context.current;
    const displayedBody = currentBody.current;
    if (activeRun.current || activeSave.current || consumed || !savedContext || !displayedBody)
      throw new Error('A current displayed body and saved assembly are required.');
    invalidatePlacement();
    const controller = new AbortController();
    const previousPlacement = placement;
    let storageAttempted = false;
    activeSave.current = controller;
    setSaving(true);
    setPlacement('loading');
    setPlacementError(null);
    const requireCurrent = () => {
      const session = owner.snapshot();
      const display = projectBetaSkirtCanonicalMediumDisplayedBodyV2(displayedBody);
      if (
        controller.signal.aborted ||
        !mounted.current ||
        context.current !== savedContext ||
        currentBody.current !== displayedBody ||
        !display ||
        !session ||
        session.disposed ||
        session.generation !== binding.compiled.generation ||
        session.composerCanonicalSha256 !==
          binding.compiled.composerSnapshot.seal.canonicalSha256 ||
        JSON.stringify(intent.body) !==
          JSON.stringify(qualifiedTwoPanelPlacementBodyTargetV1(display.binding))
      )
        throw new DOMException('The displayed body or saved assembly changed.', 'AbortError');
    };
    try {
      requireCurrent();
      const produced = await owner.buildLatestConfirmedPlacementSidecar(
        {
          ...intent,
          expectedGeneration: binding.compiled.generation,
          readCurrentEvidence: savedContext.readCurrentEvidence,
        },
        controller.signal,
      );
      requireCurrent();
      if (!produced.ok) throw new Error(produced.blocker.detail);
      const bound = savedContext.bindConfirmedPlacement(produced.owner);
      storageAttempted = true;
      const saved = await createPatternImportDxfProductCompositePlacementProductionSaverV1(
        savedContext.readSaveCurrent,
      ).save(
        {
          confirmed: true,
          placementOwner: produced.owner,
          expectedPreviousOuterSha256: bound.expectedPreviousOuterSha256,
          current: {
            authority: bound.authority,
            placementBindings: bound.placementBindings,
            exactNCurrent: bound.exactNCurrent,
          },
        },
        controller.signal,
      );
      requireCurrent();
      if (!saved.ok) {
        const detail = saved.blockers.map((blocker) => blocker.detail).join(' ');
        throw new Error(
          `Placement save was not verified. Reload saved placement before retrying. ${detail}`,
        );
      }
      // The existing saver returns a genuine fresh-read owner only after exact CAS/readback.
      // No writer success or caller DTO alone can enable Run; Run reads this durable owner again.
      setPlacement('ready');
      setEditing(false);
    } catch (cause) {
      if (mounted.current && context.current === savedContext) {
        // A rejected authoring choice can be corrected in place. Once storage was attempted,
        // only a fresh read can establish whether a cancelled/unverified write took effect.
        setPlacement(
          storageAttempted ? 'blocked' : previousPlacement === 'ready' ? 'ready' : 'missing',
        );
        setPlacementError(
          storageAttempted
            ? 'Placement save was not verified. Reload saved placement before retrying.'
            : null,
        );
      }
      throw new Error(errorMessage(cause, 'Placement save was not verified.'));
    } finally {
      if (activeSave.current === controller) activeSave.current = null;
      if (mounted.current) setSaving(false);
    }
  };

  const runPreview = async () => {
    const savedContext = context.current;
    const displayedBody = currentBody.current;
    const compute = computeCanvas.current;
    const display = displayCanvas.current;
    if (
      activeRun.current ||
      activeSave.current ||
      editing ||
      consumed ||
      !savedContext ||
      !displayedBody ||
      !compute ||
      !display
    )
      return;
    const controller = new AbortController();
    activeRun.current = controller;
    setRun('checking');
    setRunError(null);
    const requireCurrent = () => {
      const session = owner.snapshot();
      if (
        controller.signal.aborted ||
        !mounted.current ||
        context.current !== savedContext ||
        currentBody.current !== displayedBody ||
        !isBetaSkirtCanonicalMediumDisplayedBodyCurrentV2(displayedBody) ||
        !session ||
        session.disposed ||
        session.generation !== binding.compiled.generation ||
        session.composerCanonicalSha256 !== binding.compiled.composerSnapshot.seal.canonicalSha256
      )
        throw new DOMException('The displayed body or saved assembly changed.', 'AbortError');
    };
    try {
      requireCurrent();
      // A prior ready label is not a fresh storage read. Recheck exact AO/row bindings and GET
      // the persisted component immediately before handing its verified owner to actual-body.
      const placementReadOwner = await readSavedPlacement(savedContext, controller.signal);
      requireCurrent();
      if (!placementReadOwner) {
        setPlacement('missing');
        throw new Error(missingPlacement);
      }
      setRun('placing');
      const actual = await owner.advanceActualBody(
        {
          expectedGeneration: binding.compiled.generation,
          placementReadOwner,
          canonicalDisplayedBodyOwner: displayedBody,
        },
        controller.signal,
      );
      requireCurrent();
      if (!actual.ok) throw new Error(actual.blockers.map((blocker) => blocker.detail).join(' '));
      setRuntimeAttempted(true);
      setRun('running');
      const result = await owner.runBetaPreview(
        binding.compiled.generation,
        compute,
        display,
        controller.signal,
      );
      requireCurrent();
      if (!result.ok) throw new Error(result.detail);
      previewVisible.current = true;
      setReceipts(result.receipts);
      setRun('complete');
    } catch (cause) {
      if (mounted.current && context.current === savedContext) owner.stopBetaPreview();
      previewVisible.current = false;
      if (mounted.current) {
        setReceipts(null);
        if (controller.signal.aborted || (cause instanceof Error && cause.name === 'AbortError')) {
          setRun('stopped');
        } else {
          setRun('blocked');
          setRunError(errorMessage(cause, 'The bounded cloth preview could not finish.'));
        }
      }
    } finally {
      if (activeRun.current === controller) activeRun.current = null;
    }
  };

  const busy = run === 'checking' || run === 'placing' || run === 'running';
  const physical = owner.physicalStage();
  const compileBlocked =
    physical?.status === 'blocked' && physical.stage === 'saved-local-frame-refinement';
  const canRun = Boolean(
    canonical &&
    body &&
    placement === 'ready' &&
    !editing &&
    !saving &&
    !busy &&
    !consumed &&
    !compileBlocked,
  );
  const progress =
    run === 'checking'
      ? 'Checking saved placement…'
      : run === 'placing'
        ? 'Placing garment on the displayed body…'
        : run === 'running'
          ? 'Running 16 → 32 frames and corrected strain map…'
          : run === 'complete'
            ? '32 frames complete · corrected strain map'
            : run === 'stopped'
              ? 'Preview stopped.'
              : null;

  return (
    <div className='flex min-w-0 flex-col gap-stack' aria-label='Saved cloth preview'>
      <GroupLabel>Cloth preview · beta</GroupLabel>
      <div className='flex flex-wrap items-center gap-stack'>
        <Button
          variant='secondary'
          size='sm'
          aria-pressed={canonical}
          onClick={() => {
            if (canonical) {
              onBody(null);
              stop();
            }
            setCanonical(!canonical);
          }}
        >
          {canonical ? 'Remove canonical medium' : 'Use canonical medium'}
        </Button>
        <Text variant='label'>Explicit reference body · A-rest</Text>
      </div>
      {placement === 'loading' ? (
        <Text role='status'>
          {saving ? 'Saving and verifying placement…' : 'Reading saved placement…'}
        </Text>
      ) : null}
      {placement === 'ready' ? (
        <div className='flex flex-wrap items-center gap-stack'>
          <Text variant='label'>Saved placement verified</Text>
          {!editing ? (
            <Button
              variant='underline'
              size='sm'
              disabled={busy || saving || consumed}
              onClick={() => {
                invalidatePlacement();
                setEditing(true);
              }}
            >
              Edit garment roles
            </Button>
          ) : null}
        </div>
      ) : null}
      {placement === 'missing' || placement === 'blocked' ? (
        <div className='flex flex-col items-start gap-stack'>
          <Text role='status' className='max-w-prose break-words'>
            {placement === 'missing' ? missingPlacement : placementError}
          </Text>
          <Button
            variant='underline'
            size='sm'
            disabled={busy || saving || consumed}
            onClick={reloadPlacement}
          >
            Reload saved placement
          </Button>
        </div>
      ) : null}
      {canonical ? <SavedPhysicalCanonicalStageV1 onBody={onBody} /> : null}
      {canonical && !body ? <Text role='status'>Waiting for the displayed body…</Text> : null}
      {editing && projection ? (
        <div className='flex min-w-0 flex-col items-start gap-stack'>
          <SavedPhysicalPlacementAuthoringV1
            composerSnapshot={binding.compiled.composerSnapshot}
            composerProjection={projection}
            bodyTarget={bodyTarget}
            onConfirmedIntent={savePlacement}
            disabled={busy || saving || consumed || placement === 'blocked'}
          />
          {placement === 'ready' ? (
            <Button variant='underline' size='sm' disabled={saving} onClick={reloadPlacement}>
              Cancel editing
            </Button>
          ) : null}
        </div>
      ) : null}
      {!editing ? (
        <div className='flex flex-wrap items-center gap-stack'>
          <Button variant='main' size='sm' disabled={!canRun} onClick={() => void runPreview()}>
            Run 32 frames
          </Button>
          {busy || receipts ? (
            <Button variant='underline' size='sm' onClick={stop}>
              {busy ? 'Cancel run' : 'Close strain map'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {progress ? <Text role='status'>{progress}</Text> : null}
      {runError ? (
        <Text role='alert' className='max-w-prose break-words'>
          Preview blocked: {runError}
        </Text>
      ) : null}
      {compileBlocked ? (
        <Text role='status' className='max-w-prose break-words'>
          {errorMessage(
            new Error(physical.blockers.map((blocker) => blocker.detail).join(' ')),
            'The saved geometry is not compatible with the canonical medium preview.',
          )}
        </Text>
      ) : null}
      {consumed ? <Text variant='label'>{restartHint}</Text> : null}
      <canvas ref={computeCanvas} width={640} height={480} hidden aria-hidden='true' />
      <div hidden={!busy && !receipts} className='min-w-0'>
        <canvas
          ref={displayCanvas}
          width={640}
          height={480}
          className='aspect-[4/3] w-full bg-pageBg'
          role='img'
          aria-label='Corrected dimensionless strain utilization on the garment and actual canonical body'
          aria-busy={busy}
        />
      </div>
      {receipts ? (
        <div className='flex flex-col gap-stack'>
          <Text>{BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.legend.title} · dimensionless</Text>
          <div className='flex flex-wrap gap-stack' aria-label='Strain utilization color scale'>
            {BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.stops.map((stop) => (
              <span key={stop.utilization} className='inline-flex items-center gap-1'>
                <span
                  className='inline-block h-3 w-3'
                  style={{ backgroundColor: stop.color }}
                  aria-hidden='true'
                />
                <Text component='span'>{stop.utilization === 2 ? '≥2' : stop.utilization}</Text>
              </span>
            ))}
          </div>
          <Text variant='label'>
            {BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1.legend.thresholdLabel}.
          </Text>
          <Text variant='label' className='max-w-prose'>
            Provisional, uncalibrated strain map. Physical stress (Pa), material failure and fit are
            not evaluated.
          </Text>
          <Text variant='label' className='tabular-nums'>
            Range {receipts.heatmap.report.visualization.minimumUtilization.toFixed(3)}–
            {receipts.heatmap.report.visualization.maximumUtilization.toFixed(3)} ·{' '}
            {receipts.heatmap.report.visualization.triangleCountAtOrAboveDisplayClamp} triangles ≥2
          </Text>
        </div>
      ) : null}
    </div>
  );
}

async function readSavedPlacement(context: PlacementContext, signal: AbortSignal) {
  const bound = await context.bindExistingPlacement(signal);
  if (!bound) return null;
  const read = await createPatternImportDxfProductCompositePlacementProductionReaderV1(
    context.readPlacementCurrent,
  ).read(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
      expectedRow: bound.authority.row,
      expectedBindings: bound.placementBindings,
    },
    bound.authority.serverAssemblyRevision,
    signal,
  );
  if (!read.ok) throw new Error(read.blockers.map((blocker) => blocker.detail).join(' '));
  return read.compatibility === 'placement-v2' ? read.owner : null;
}

function errorMessage(cause: unknown, fallback: string) {
  let message = cause instanceof Error ? cause.message : fallback;
  // Some existing session failures carry a JSON blocker list. Show its human explanation,
  // never the transport dump, owner fingerprint or raw evidence digest in the product pane.
  if (message.startsWith('[') || message.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(message);
      if (!Array.isArray(parsed)) return fallback;
      message = parsed
        .flatMap((blocker: unknown) =>
          blocker &&
          typeof blocker === 'object' &&
          'detail' in blocker &&
          typeof blocker.detail === 'string'
            ? [blocker.detail]
            : [],
        )
        .join(' ');
    } catch {
      return fallback;
    }
  }
  return message && !/\b[0-9a-f]{64}\b/i.test(message) ? message.slice(0, 600) : fallback;
}
