import type { common_Model } from 'api/proto-http/admin';
import { createModelMannequinPoseDraftOwnerV1 } from 'components/managers/model/components/model-mannequin-pose-draft-owner-v1';
import { createModelMannequinPoseSessionBindingV1 } from 'components/managers/model/components/model-mannequin-pose-session-v1';
import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import {
  ModelOpenReferencePreviewFromInput,
  type ModelOpenReferenceDirectPoseBindingV9,
} from 'components/managers/model/components/model-open-reference-preview';
import type { ModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { modelFormRevisionKeyV1 } from 'components/managers/model/components/schema';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import type {
  MeasurementSurfacePatternPieceOverlayV1,
  MeasurementSurfacePatternPieceTransformV1,
  MeasurementSurfaceViewPreset,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button, Pill, Text } from 'ui';

import type { TechCardFormData } from '../../schema';
import { BodyPicker, modelFacts, modelName } from '../../design/render/model-picker';
import {
  buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1,
  type PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1,
  type PatternImportDxfPhaseECadMannequinPatternOverlayToolV1,
} from './cad-mannequin-pattern-piece-overlay-v1';
import type {
  PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1,
  PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
} from './cad-mannequin-dxf-staging-v1';
import type { PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeV1 } from './cad-mannequin-scene-overlay-renderer-bridge-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_MODEL_PICKER_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-model-picker/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_MODEL_PICKER_CLAIMS_V1 = Object.freeze({
  techCardBaseModelFieldReused: true,
  existingModelListQueryReused: true,
  existingMeasurementPreviewReused: true,
  existingMannequinPreviewProviderReused: true,
  exactPatternPiecesUseExistingThreeScene: true,
  patternPieceTransformsRemainPresentationOnly: true,
  geometryScaleToolExposed: false,
  stagedPiecesRemainVisibleWithoutSelection: true,
  frontSideBackUseExistingRendererActions: true,
  frontSideBackUseExistingViewPreset: true,
  orbitAndZoomRemainRendererGestures: true,
  createsSecondFormOwner: false,
  createsCameraAuthority: false,
  createsModelWriteOwner: false,
  paperDollClaimsMeasurementShape: false,
  selectionPersistsThroughExistingTechCardSave: true,
  neutralPoseCreatesSessionOwner: true,
  sessionPoseNeverWritesFromAssemblyTable: true,
} as const);

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_VIEW_PRESETS_V1 = Object.freeze([
  'front',
  'side',
  'back',
] as const satisfies readonly MeasurementSurfaceViewPreset[]);

export function PatternImportDxfPhaseECadMannequinViewToolbarV1({
  viewPreset,
  onViewPreset,
  patternTool,
  onPatternTool,
  poseEditing,
  poseEditingDisabled = false,
  onPoseEditingChange,
}: Readonly<{
  viewPreset: MeasurementSurfaceViewPreset;
  onViewPreset: (preset: MeasurementSurfaceViewPreset) => void;
  patternTool?: PatternImportDxfPhaseECadMannequinPatternOverlayToolV1;
  onPatternTool?: (tool: PatternImportDxfPhaseECadMannequinPatternOverlayToolV1) => void;
  poseEditing: boolean;
  poseEditingDisabled?: boolean;
  onPoseEditingChange: (enabled: boolean) => void;
}>) {
  return (
    <nav
      className='flex shrink-0 flex-wrap items-center gap-1 border-b border-borderColor px-2 py-1'
      aria-label='Mannequin view'
      data-cad-mannequin-view-toolbar=''
    >
      {PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_VIEW_PRESETS_V1.map((preset) => {
        const selected = preset === viewPreset;
        return (
          <Button
            key={preset}
            size='xs'
            variant={selected ? 'simpleReverseWithBorder' : 'underline'}
            aria-pressed={selected}
            data-cad-mannequin-view={preset}
            onClick={() => onViewPreset(preset)}
          >
            {preset}
          </Button>
        );
      })}
      {patternTool && onPatternTool ? (
        <>
          <span className='mx-1 h-4 w-px bg-borderColor' aria-hidden />
          {(['select', 'translate', 'rotate'] as const).map((tool) => (
            <Button
              key={tool}
              size='xs'
              variant={patternTool === tool ? 'simpleReverseWithBorder' : 'underline'}
              aria-pressed={patternTool === tool}
              data-cad-mannequin-pattern-tool={tool}
              onClick={() => onPatternTool(tool)}
            >
              {tool === 'translate' ? 'move' : tool}
            </Button>
          ))}
        </>
      ) : null}
      <label className='ml-auto flex min-h-7 cursor-pointer items-center gap-1.5 px-1 text-micro font-bold'>
        <input
          type='checkbox'
          checked={poseEditing}
          disabled={poseEditingDisabled}
          aria-label='Change pose'
          data-cad-mannequin-change-pose=''
          onChange={(event) => onPoseEditingChange(event.currentTarget.checked)}
        />
        <span>Change pose</span>
      </label>
      <Text component='span' size='micro' variant='label' className='sr-only'>
        drag to orbit · wheel to zoom
      </Text>
    </nav>
  );
}

export function modelPreviewInputFromSavedModelV1(
  model: common_Model,
): ModelOpenReferencePreviewInputV1 {
  return Object.freeze({
    gender: model.model?.gender,
    measurements: Object.freeze(
      Object.fromEntries(
        (model.model?.measurements ?? []).flatMap((measurement) =>
          measurement.name &&
          typeof measurement.valueMm === 'number' &&
          Number.isFinite(measurement.valueMm) &&
          measurement.valueMm > 0
            ? [[measurement.name, measurement.valueMm] as const]
            : [],
        ),
      ),
    ),
  });
}

export function selectedCadWorkbenchModelV1(
  models: readonly common_Model[] | undefined,
  modelId: number,
): common_Model | null {
  if (!Number.isSafeInteger(modelId) || modelId <= 0) return null;
  return models?.find((model) => model.id === modelId) ?? null;
}

export type PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1 = Readonly<{
  models: readonly common_Model[] | undefined;
  loading?: boolean;
  error?: boolean;
  modelId: number;
  disabled?: boolean;
  sizeName: (id: number) => string;
  onModelChange: (modelId: number) => void;
  paperDoll?: ReactNode;
  stagedPieces?: ReactNode;
  patternPieceScene?: PatternImportDxfPhaseECadMannequinPatternPieceSceneV1 | null;
  poseBinding?: ModelOpenReferenceDirectPoseBindingV9;
  poseLoading?: boolean;
  poseError?: unknown;
  onRetryPose?: () => void;
}>;

export type PatternImportDxfPhaseECadMannequinPoseSessionV1 = Readonly<{
  binding: ModelOpenReferenceDirectPoseBindingV9 | undefined;
  loading: boolean;
  error: unknown;
  retry: () => void;
}>;

/**
 * Creates a neutral, session-only pose draft for the selected measurement model. Changing models
 * creates a new owner, so Assembly Table never reads or writes a persisted Model pose.
 */
export function usePatternImportDxfPhaseECadMannequinPoseSessionV1(
  modelId: number,
): PatternImportDxfPhaseECadMannequinPoseSessionV1 {
  const validModelId = Number.isSafeInteger(modelId) && modelId > 0 ? modelId : undefined;
  const owner = useMemo(() => {
    if (!validModelId) return undefined;
    const nextOwner = createModelMannequinPoseDraftOwnerV1({
      modelId: validModelId,
      neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    });
    // `absent` is a synchronous local initialization path even though the shared owner API is
    // Promise-shaped for the Models page's persisted transport.
    void nextOwner.loadRemote({ kind: 'absent' });
    return nextOwner;
  }, [validModelId]);
  const [snapshotState, setSnapshotState] = useState(() => ({
    owner,
    snapshot: owner?.getSnapshot() ?? null,
  }));
  const snapshot =
    snapshotState.owner === owner ? snapshotState.snapshot : owner?.getSnapshot() ?? null;
  useEffect(() => {
    if (!owner) return;
    setSnapshotState({ owner, snapshot: owner.getSnapshot() });
    return owner.subscribe(() => setSnapshotState({ owner, snapshot: owner.getSnapshot() }));
  }, [owner]);
  const binding = useMemo(
    () =>
      owner && snapshot && snapshot.phase !== 'unloaded'
        ? createModelMannequinPoseSessionBindingV1(owner, snapshot)
        : undefined,
    [owner, snapshot],
  );
  return Object.freeze({
    binding,
    loading: Boolean(validModelId) && !binding,
    error: null,
    retry: () => undefined,
  });
}

export type PatternImportDxfPhaseECadMannequinPatternPieceSceneV1 = Readonly<{
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  activeScopeKey?: string | null;
  selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
  swatchesByScope?: Readonly<Record<string, string | null | undefined>>;
  decorations?: readonly PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1[];
  guides?: MeasurementSurfacePatternPieceOverlayV1['guides'];
  sceneOverlay?: PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1;
  onFocus?: (selection: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1) => void;
}>;

export type PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1 =
  | Readonly<{
      status: 'available';
      bridge: PatternImportDxfPhaseECadMannequinSceneOverlayRendererBridgeV1;
      blocker: null;
    }>
  | Readonly<{
      status: 'blocked';
      bridge: null;
      blocker: Readonly<{
        code:
          | 'authoritative-full-exact-graph-unavailable'
          | 'authoritative-saved-exact-binding-invalid'
          | 'authoritative-scene-overlay-invalid';
        detail: string;
      }>;
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PRODUCTION_SCENE_OVERLAY_BLOCKED_V1 =
  Object.freeze({
    status: 'blocked' as const,
    bridge: null,
    blocker: Object.freeze({
      code: 'authoritative-full-exact-graph-unavailable' as const,
      detail:
        'The current Assembly Order mount has no caller-supplied full exact capture graph; exact seam and thread scene layers stay hidden.',
    }),
  });

export function PatternImportDxfPhaseECadMannequinModelPickerViewV1({
  models,
  loading = false,
  error = false,
  modelId,
  disabled = false,
  sizeName,
  onModelChange,
  paperDoll = null,
  stagedPieces = null,
  patternPieceScene = null,
  poseBinding,
  poseLoading = false,
  poseError = null,
  onRetryPose,
}: PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1) {
  const selected = selectedCadWorkbenchModelV1(models, modelId);
  const selectedRevision = selected ? modelFormRevisionKeyV1(selected) : null;
  const [viewPreset, setViewPreset] = useState<MeasurementSurfaceViewPreset>('front');
  const [patternTool, setPatternTool] =
    useState<PatternImportDxfPhaseECadMannequinPatternOverlayToolV1>('select');
  const [poseEditing, setPoseEditing] = useState(false);
  const [patternTransforms, setPatternTransforms] = useState<
    Readonly<Record<string, MeasurementSurfacePatternPieceTransformV1>>
  >({});
  const handlePatternTransform = useCallback(
    (pieceKey: string, transform: MeasurementSurfacePatternPieceTransformV1) =>
      setPatternTransforms((current) => Object.freeze({ ...current, [pieceKey]: transform })),
    [],
  );
  const patternOverlayResult = useMemo(
    () =>
      patternPieceScene
        ? buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1({
            ...patternPieceScene,
            decorations:
              patternPieceScene.sceneOverlay?.status === 'available'
                ? patternPieceScene.sceneOverlay.bridge.decorations
                : patternPieceScene.decorations,
            guides:
              patternPieceScene.sceneOverlay?.status === 'available'
                ? patternPieceScene.sceneOverlay.bridge.guides
                : patternPieceScene.guides,
            tool: patternTool,
            transformsByPieceKey: patternTransforms,
            onTransform: handlePatternTransform,
          })
        : null,
    [handlePatternTransform, patternPieceScene, patternTool, patternTransforms],
  );
  const sceneOverlayBridge =
    patternPieceScene?.sceneOverlay?.status === 'available'
      ? patternPieceScene.sceneOverlay.bridge
      : null;
  const correspondenceGuides =
    sceneOverlayBridge?.guides.filter(({ kind }) => kind === 'correspondence') ?? [];
  const threadGuides = sceneOverlayBridge?.guides.filter(({ kind }) => kind === 'thread') ?? [];

  useEffect(() => setPoseEditing(false), [modelId, selectedRevision]);

  return (
    <section
      className='flex h-full min-h-0 flex-col gap-2'
      aria-label='Mannequin model'
      data-cad-mannequin-model-picker=''
      data-cad-mannequin-model-id={selected?.id ?? undefined}
      data-cad-mannequin-model-state={
        loading ? 'loading' : error ? 'error' : selected ? 'selected' : 'empty'
      }
      data-cad-mannequin-scene-overlay-status={
        patternPieceScene?.sceneOverlay?.status ?? 'not-requested'
      }
      data-cad-mannequin-scene-overlay-blocker={
        patternPieceScene?.sceneOverlay?.status === 'blocked'
          ? patternPieceScene.sceneOverlay.blocker.code
          : undefined
      }
      data-cad-mannequin-scene-overlay-edge-count={sceneOverlayBridge?.decorations.length}
      data-cad-mannequin-scene-overlay-correspondence-count={
        correspondenceGuides.length || undefined
      }
      data-cad-mannequin-scene-overlay-thread-count={threadGuides.length || undefined}
      data-cad-mannequin-scene-overlay-edges={sceneOverlayBridge?.decorations
        .map(({ seamId, side, semanticColorCss }) => `${seamId}:${side}:${semanticColorCss}`)
        .join('|')}
      data-cad-mannequin-scene-overlay-correspondences={
        sceneOverlayBridge
          ? correspondenceGuides
              .map(({ seamId, from, to }) => `${seamId}:${from.vertexId}->${to.vertexId}`)
              .join('|')
          : undefined
      }
      data-cad-mannequin-scene-overlay-threads={
        sceneOverlayBridge
          ? threadGuides
              .map(
                ({ seamId, thread }) =>
                  `${seamId}:${thread?.bomLineKey ?? ''}:${thread?.colorCss ?? ''}`,
              )
              .join('|')
          : undefined
      }
    >
      <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-borderColor bg-bgColor p-2'>
        {error ? (
          <Text
            component='p'
            size='micro'
            variant='label'
            className='min-w-[14rem] flex-1'
            data-cad-model-picker-unavailable=''
          >
            Model picker unavailable
          </Text>
        ) : (
          <BodyPicker
            models={models}
            loading={loading}
            modelId={modelId}
            bodyType=''
            sizeName={sizeName}
            disabled={disabled}
            modelsOnly
            name='cad-mannequin-base-model'
            className='min-w-[14rem] flex-1'
            onModel={onModelChange}
            onBodyType={() => undefined}
          />
        )}
        {!selected ? (
          <Link
            to={ROUTES.addModel}
            className='shrink-0 text-micro font-bold uppercase underline underline-offset-2'
          >
            Create from measurements
          </Link>
        ) : null}
      </div>

      {selected && !error ? (
        <PatternImportDxfPhaseECadMannequinViewToolbarV1
          viewPreset={viewPreset}
          onViewPreset={setViewPreset}
          patternTool={patternOverlayResult?.ok ? patternTool : undefined}
          onPatternTool={patternOverlayResult?.ok ? setPatternTool : undefined}
          poseEditing={poseEditing}
          poseEditingDisabled={!poseBinding || Boolean(poseError)}
          onPoseEditingChange={setPoseEditing}
        />
      ) : null}

      {error ? (
        <div className='relative flex min-h-[20rem] flex-1 items-center justify-center overflow-hidden p-4 text-center'>
          <div className='space-y-1'>
            <Pill tone='warn'>models unavailable</Pill>
            <Text component='p' size='micro' variant='label'>
              The existing model list could not be loaded. Prepared DXF pieces remain staged when
              available.
            </Text>
          </div>
          {stagedPieces}
        </div>
      ) : !selected ? (
        <div className='relative flex min-h-[20rem] flex-1 items-center justify-center overflow-hidden p-4 text-center'>
          <div className='max-w-xs space-y-2'>
            <Pill tone={loading ? 'attention' : 'ink'}>
              {loading ? 'loading models' : 'no model selected'}
            </Pill>
            <Text component='p' size='micro' variant='label'>
              Select an existing measurement model or create one from body measurements.
            </Text>
          </div>
          {stagedPieces}
        </div>
      ) : poseError ? (
        <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 text-center'>
          <div className='space-y-2'>
            <Text component='p' size='micro' variant='errorLabel' role='alert'>
              Pose session could not be prepared.
            </Text>
            {onRetryPose ? (
              <Button type='button' size='xs' variant='underline' onClick={onRetryPose}>
                Retry pose
              </Button>
            ) : null}
          </div>
          {stagedPieces}
        </div>
      ) : poseLoading || !poseBinding ? (
        <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 text-center'>
          <Text component='p' size='micro' variant='label' role='status'>
            Preparing pose session…
          </Text>
          {stagedPieces}
        </div>
      ) : (
        <div
          className='relative flex min-h-0 flex-1 flex-col overflow-hidden p-2'
          data-cad-measurement-model-preview=''
        >
          <div className='mb-2 flex flex-wrap items-baseline justify-between gap-2'>
            <Text component='p' size='micro' className='font-bold'>
              {modelName(selected)}
            </Text>
            <Text component='p' size='micro' variant='label'>
              {modelFacts(selected, sizeName) || 'measurement model'}
            </Text>
          </div>
          <div className={`min-h-0 flex-1 ${stagedPieces ? 'px-24' : ''}`}>
            <ModelOpenReferencePreviewFromInput
              key={selectedRevision}
              input={modelPreviewInputFromSavedModelV1(selected)}
              modelId={`tech-card-base-model:${selected.id ?? 0}`}
              modelContentRevision={selectedRevision ?? 'tech-card-base-model:unbound'}
              poseControls='full-body-v9'
              directPoseBindingV9={poseBinding}
              directPoseViewportEditingEnabledV9={poseEditing}
              hideDirectPoseControlV9
              variant='workbench'
              viewPreset={viewPreset}
              patternPieceOverlay={
                patternOverlayResult?.ok ? patternOverlayResult.overlay : undefined
              }
            />
          </div>
          {stagedPieces}
        </div>
      )}

      {paperDoll ? (
        <details className='shrink-0 border-t border-borderColor bg-bgColor' data-cad-paper-doll=''>
          <summary className='cursor-pointer px-2 py-1.5 text-micro font-bold uppercase'>
            Pattern paper doll
          </summary>
          <div className='max-h-[26rem] overflow-auto border-t border-hairline p-2'>
            {paperDoll}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/**
 * Production adapter. `baseModelId` remains the existing TechCard RHF field and is persisted by the
 * ordinary card save; the picker owns neither another form nor a model mutation.
 */
export function PatternImportDxfPhaseECadMannequinModelPickerV1({
  disabled = false,
  paperDoll = null,
  stagedPieces = null,
  patternPieceScene = null,
}: Readonly<{
  disabled?: boolean;
  paperDoll?: ReactNode;
  stagedPieces?: ReactNode;
  patternPieceScene?: PatternImportDxfPhaseECadMannequinPatternPieceSceneV1 | null;
}>) {
  const form = useFormContext<TechCardFormData>();
  const modelId =
    (useWatch({ control: form.control, name: 'baseModelId' }) as number | undefined) ?? 0;
  const { data: models, isLoading, isError } = useAllModels();
  const poseSession = usePatternImportDxfPhaseECadMannequinPoseSessionV1(modelId);
  const { dictionary } = useDictionary();
  const sizeNames = useMemo(
    () =>
      new Map(
        (dictionary?.sizes ?? []).flatMap((size) =>
          size.id == null ? [] : ([[size.id, size.name ?? `#${size.id}`]] as const),
        ),
      ),
    [dictionary?.sizes],
  );

  return (
    <PatternImportDxfPhaseECadMannequinModelPickerViewV1
      models={models}
      loading={isLoading}
      error={isError}
      modelId={modelId}
      disabled={disabled}
      sizeName={(id) => sizeNames.get(id) ?? `#${id}`}
      onModelChange={(nextModelId) =>
        form.setValue('baseModelId', nextModelId, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        })
      }
      paperDoll={paperDoll}
      stagedPieces={stagedPieces}
      patternPieceScene={patternPieceScene}
      poseBinding={poseSession.binding}
      poseLoading={poseSession.loading}
      poseError={poseSession.error}
      onRetryPose={poseSession.retry}
    />
  );
}
