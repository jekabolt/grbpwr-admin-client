import type { ModelOpenReferenceDisplayedBodySnapshotV1 } from 'components/managers/model/components/model-open-reference-displayed-body-snapshot-v1';
import {
  createCadMannequinDisplayedBodyInputSessionV1,
  type CadMannequinDisplayedBodyInputObserverV1,
  type CadMannequinDisplayedBodySourceV1,
} from './cad-mannequin-displayed-body-input-session-v1';
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
  MeasurementSurfacePatternPieceV1,
  MeasurementSurfacePatternPieceTransformV1,
  MeasurementSurfaceViewPreset,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button, CheckboxCommon, Pill, Text } from 'ui';

import type { TechCardFormData } from '../../schema';
import { BodyPicker, modelFacts, modelName } from '../../design/render/model-picker';
import { CadMannequinPatternOffsetControlsV1 } from './cad-mannequin-pattern-offset-controls-v1';
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
import type { CadWorkbenchPhysicalHostV1 } from './cad-workbench-physical-host-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_MODEL_PICKER_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-model-picker/1' as const;
const ZERO_PATTERN_OFFSET_M = [0, 0, 0] as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_MODEL_PICKER_CLAIMS_V1 = Object.freeze({
  techCardBaseModelFieldReused: true,
  existingModelListQueryReused: true,
  existingMeasurementPreviewReused: true,
  existingMannequinPreviewProviderReused: true,
  exactPatternPiecesUseExistingThreeScene: true,
  exactPatternPiecesRemainVisibleWithoutModel: true,
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
  ordinarySelectionPersistsThroughExistingTechCardSave: true,
  workbenchSelectionPersistsThroughExistingArrangementSave: true,
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
        <CheckboxCommon
          name='cad-mannequin-change-pose'
          checked={poseEditing}
          disabled={poseEditingDisabled}
          aria-label='Change pose'
          data-cad-mannequin-change-pose=''
          onChange={onPoseEditingChange}
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
  onDisplayedBodyInputV1?: CadMannequinDisplayedBodyInputObserverV1;
  onSaveMannequinArrangement?: CadWorkbenchPhysicalHostV1['onSaveMannequinArrangement'];
  onReadMannequinArrangement?: CadWorkbenchPhysicalHostV1['onReadMannequinArrangement'];
  arrangementSourceKey?: string;
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
  annotationSource?: Readonly<{ identity: string; revision: string; sha256: string }>;
  sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
  activeScopeKey?: string | null;
  selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
  swatchesByScope?: Readonly<Record<string, string | null | undefined>>;
  decorations?: readonly PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1[];
  guides?: MeasurementSurfacePatternPieceOverlayV1['guides'];
  sceneOverlay?: PatternImportDxfPhaseECadMannequinSceneOverlayCapabilityV1;
  onFocus?: (selection: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1) => void;
}>;

export type PatternImportDxfPhaseECadMannequinUnboundStageLayoutV1 = Readonly<{
  viewBox: string;
  pieces: readonly Readonly<{
    piece: MeasurementSurfacePatternPieceV1;
    fillPathD: string;
    strokePathD: string;
    transform: string;
  }>[];
}>;

function patternContourPathD(
  contour: MeasurementSurfacePatternPieceV1['contours'][number],
): string {
  const [first, ...rest] = contour.vertices;
  if (!first) return '';
  return `M ${first.pointMm.x} ${first.pointMm.y} ${rest
    .map(({ pointMm }) => `L ${pointMm.x} ${pointMm.y}`)
    .join(' ')} Z`;
}

function patternPiecePaths(piece: MeasurementSurfacePatternPieceV1): Readonly<{
  fillPathD: string;
  strokePathD: string;
}> {
  const outerRole = piece.contours.some(({ role }) => role === 'cut-boundary')
    ? 'cut-boundary'
    : 'sewing-boundary';
  const fillPathD = piece.contours
    .filter(({ role }) => role === outerRole || role === 'hole')
    .map(patternContourPathD)
    .filter(Boolean)
    .join(' ');
  const strokePathD = piece.contours.map(patternContourPathD).filter(Boolean).join(' ');
  return Object.freeze({ fillPathD, strokePathD });
}

/**
 * Fits the exact prepared contours into one model-free presentation stage. Every piece shares one
 * scale, so relative pattern dimensions remain visible while the selected model is still empty.
 */
export function layoutPatternImportDxfPhaseECadMannequinUnboundStageV1(
  overlay: MeasurementSurfacePatternPieceOverlayV1,
): PatternImportDxfPhaseECadMannequinUnboundStageLayoutV1 | null {
  const source = overlay.pieces.flatMap((piece) => {
    const points = piece.contours.flatMap((contour) =>
      contour.vertices.map(({ pointMm }) => pointMm),
    );
    if (points.length < 3) return [];
    const minX = Math.min(...points.map(({ x }) => x));
    const maxX = Math.max(...points.map(({ x }) => x));
    const minY = Math.min(...points.map(({ y }) => y));
    const maxY = Math.max(...points.map(({ y }) => y));
    if (![minX, maxX, minY, maxY].every(Number.isFinite)) return [];
    return [{ piece, minX, maxX, minY, maxY, ...patternPiecePaths(piece) }];
  });
  if (source.length === 0) return null;
  const commonSpan = Math.max(
    ...source.map(({ minX, maxX, minY, maxY }) => Math.max(maxX - minX, maxY - minY)),
  );
  if (!Number.isFinite(commonSpan) || commonSpan <= 0) return null;
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(source.length))));
  const rows = Math.ceil(source.length / columns);
  const cell = commonSpan * 1.28;
  return Object.freeze({
    viewBox: `0 0 ${columns * cell} ${rows * cell}`,
    pieces: Object.freeze(
      source.map(({ piece, minX, maxX, minY, maxY, fillPathD, strokePathD }, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const centreX = (minX + maxX) / 2;
        const centreY = (minY + maxY) / 2;
        return Object.freeze({
          piece,
          fillPathD,
          strokePathD,
          transform: `translate(${column * cell + cell / 2 - centreX} ${
            row * cell + cell / 2 - centreY
          })`,
        });
      }),
    ),
  });
}

export function PatternImportDxfPhaseECadMannequinUnboundPatternStageV1({
  overlay,
}: Readonly<{ overlay: MeasurementSurfacePatternPieceOverlayV1 }>) {
  const layout = useMemo(
    () => layoutPatternImportDxfPhaseECadMannequinUnboundStageV1(overlay),
    [overlay],
  );
  if (!layout) return null;
  return (
    <div
      className='absolute inset-0 min-h-0 overflow-hidden bg-pageBg p-3'
      data-cad-mannequin-unbound-pattern-stage=''
      data-cad-mannequin-unbound-pattern-count={layout.pieces.length}
    >
      <svg
        className='h-full w-full text-textColor'
        viewBox={layout.viewBox}
        preserveAspectRatio='xMidYMid meet'
        aria-label='Prepared pattern pieces'
      >
        {layout.pieces.map(({ piece, fillPathD, strokePathD, transform }) => (
          <g
            key={piece.pieceKey}
            transform={transform}
            role='button'
            tabIndex={0}
            aria-label={piece.pieceLineKey}
            data-cad-mannequin-unbound-pattern-piece={piece.pieceKey}
            data-selected={piece.selected || undefined}
            className='cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            onClick={() => overlay.onSelectPiece?.(piece)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              overlay.onSelectPiece?.(piece);
            }}
          >
            <path
              d={fillPathD}
              fill={piece.swatchCss ?? 'white'}
              fillOpacity={piece.selected ? 0.72 : 0.46}
              fillRule='evenodd'
              stroke='none'
            />
            <path
              d={strokePathD}
              fill='none'
              stroke='currentColor'
              strokeWidth={piece.selected ? 3 : 1.25}
              vectorEffect='non-scaling-stroke'
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

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
  onDisplayedBodyInputV1,
  onSaveMannequinArrangement,
  onReadMannequinArrangement,
  arrangementSourceKey,
}: PatternImportDxfPhaseECadMannequinModelPickerViewPropsV1) {
  const selected = selectedCadWorkbenchModelV1(models, modelId);
  const selectedRevision = selected ? modelFormRevisionKeyV1(selected) : null;
  const observesBody = onDisplayedBodyInputV1 !== undefined;
  const currentBodySourceRef = useRef<CadMannequinDisplayedBodySourceV1 | null>(null);
  currentBodySourceRef.current =
    observesBody &&
    selected &&
    selectedRevision &&
    poseBinding &&
    !loading &&
    !error &&
    !poseLoading &&
    !poseError
      ? {
          modelId: `tech-card-base-model:${selected.id ?? 0}`,
          modelContentRevision: selectedRevision,
          poseDocumentCanonicalKey: poseBinding.canonicalKey,
        }
      : null;
  const bodySourceKey = currentBodySourceRef.current
    ? JSON.stringify(currentBodySourceRef.current)
    : null;
  const bodyInputCallbackRef = useRef(onDisplayedBodyInputV1);
  // Inline consumer callback changes do not rebuild/copy the same accepted body.
  // Retain the last observer so removing it still receives its final null revocation.
  if (onDisplayedBodyInputV1) bodyInputCallbackRef.current = onDisplayedBodyInputV1;
  const bodyInputSessionRef = useRef<ReturnType<
    typeof createCadMannequinDisplayedBodyInputSessionV1
  > | null>(null);
  const latestDisplayedBodyRef = useRef<ModelOpenReferenceDisplayedBodySnapshotV1 | null>(null);
  const handleDisplayedBodySnapshot = useCallback(
    (snapshot: ModelOpenReferenceDisplayedBodySnapshotV1 | null) => {
      latestDisplayedBodyRef.current = snapshot;
      void bodyInputSessionRef.current?.observe(snapshot);
    },
    [],
  );
  useEffect(() => {
    const source = currentBodySourceRef.current;
    if (!source) {
      latestDisplayedBodyRef.current = null;
      return;
    }
    const session = createCadMannequinDisplayedBodyInputSessionV1({
      source,
      readCurrentSource: () => currentBodySourceRef.current,
      onInput: (input) => bodyInputCallbackRef.current?.(input),
    });
    bodyInputSessionRef.current = session;
    // Child acceptance effects may run first; consume their actual latest observation once.
    void session.observe(latestDisplayedBodyRef.current);
    return () => {
      if (bodyInputSessionRef.current === session) bodyInputSessionRef.current = null;
      session.dispose();
    };
  }, [bodySourceKey]);
  const [viewPreset, setViewPreset] = useState<MeasurementSurfaceViewPreset>('front');
  const [patternTool, setPatternTool] =
    useState<PatternImportDxfPhaseECadMannequinPatternOverlayToolV1>('select');
  const [poseEditing, setPoseEditing] = useState(false);
  const [patternTransforms, setPatternTransforms] = useState<
    Readonly<Record<string, MeasurementSurfacePatternPieceTransformV1>>
  >({});
  const [arrangementSaving, setArrangementSaving] = useState(false);
  const [arrangementMessage, setArrangementMessage] = useState<string | null>(null);
  const arrangementSource =
    patternPieceScene?.sources.find(
      ({ scopeKey }) => scopeKey === patternPieceScene.activeScopeKey,
    ) ?? (patternPieceScene?.sources.length === 1 ? patternPieceScene.sources[0] : null);
  const arrangementExpected =
    arrangementSource && selected?.id && selectedRevision && poseBinding
      ? {
          scopeKey: arrangementSource.scopeKey,
          projection: arrangementSource.projection,
          mannequin: {
            baseModelId: selected.id,
            modelFormRevisionKeyV1: selectedRevision,
            poseBinding: { canonicalKey: poseBinding.canonicalKey },
          },
        }
      : null;
  const arrangementKey = arrangementExpected
    ? JSON.stringify([
        arrangementSourceKey,
        arrangementExpected.scopeKey,
        arrangementExpected.projection.sourceFileId,
        arrangementExpected.projection.expectedCatalogCanonicalSha256,
        arrangementExpected.projection.sizeSelectionCanonicalSha256,
        arrangementExpected.projection.sizeToken,
        arrangementExpected.mannequin,
      ])
    : null;
  const arrangementCurrent = useRef({
    key: arrangementKey,
    expected: arrangementExpected,
    read: onReadMannequinArrangement,
  });
  arrangementCurrent.current = {
    key: arrangementKey,
    expected: arrangementExpected,
    read: onReadMannequinArrangement,
  };
  const arrangementEdits = useRef(0);
  const arrangementSaveController = useRef<AbortController | null>(null);
  useEffect(() => {
    arrangementSaveController.current?.abort();
    const controller = new AbortController();
    const current = arrangementCurrent.current;
    const edits = arrangementEdits.current;
    setPatternTransforms({});
    setArrangementMessage(null);
    setArrangementSaving(false);
    if (current.expected && current.read) {
      void current
        .read(current.expected, controller.signal)
        .then((pieces) => {
          if (
            !controller.signal.aborted &&
            arrangementCurrent.current.key === current.key &&
            arrangementEdits.current === edits &&
            pieces
          ) {
            setPatternTransforms(
              Object.fromEntries(pieces.map(({ pieceKey, transform }) => [pieceKey, transform])),
            );
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && arrangementCurrent.current.key === current.key)
            setArrangementMessage(
              error instanceof Error ? error.message : 'Saved arrangement could not be read.',
            );
        });
    }
    return () => {
      controller.abort();
      arrangementSaveController.current?.abort();
    };
  }, [arrangementKey]);
  const saveArrangement = async () => {
    const source = arrangementSource;
    const key = arrangementKey;
    const editGeneration = arrangementEdits.current;
    if (
      !source ||
      !selected?.id ||
      !selectedRevision ||
      !poseBinding ||
      !onSaveMannequinArrangement
    )
      return;
    setArrangementSaving(true);
    setArrangementMessage(null);
    const controller = new AbortController();
    arrangementSaveController.current = controller;
    try {
      await onSaveMannequinArrangement(
        {
          annotationSource: patternPieceScene?.annotationSource,
          scopeKey: source.scopeKey,
          projection: source.projection,
          mannequin: {
            baseModelId: selected.id,
            modelFormRevisionKeyV1: selectedRevision,
            poseBinding: { canonicalKey: poseBinding.canonicalKey },
          },
          pieces: source.projection.pieces.map(({ pieceId, pieceLineKey }) => {
            const pieceKey = `${source.scopeKey}:${pieceId}:${pieceLineKey}`;
            const transform = patternTransforms[pieceKey];
            return {
              pieceKey,
              scopeKey: source.scopeKey,
              pieceId,
              pieceLineKey,
              transform: transform
                ? {
                    offsetM: [...transform.offsetM] as [number, number, number],
                    rotationRad: transform.rotationRad,
                  }
                : { offsetM: [0, 0, 0] as const, rotationRad: 0 },
            };
          }),
        },
        controller.signal,
      );
      if (!controller.signal.aborted && arrangementCurrent.current.key === key)
        setArrangementMessage(
          arrangementEdits.current === editGeneration
            ? 'Placement saved. Cloth preview is unchanged.'
            : 'Earlier placement saved. Cloth preview is unchanged. Current changes are not saved.',
        );
    } catch (error) {
      if (!controller.signal.aborted && arrangementCurrent.current.key === key)
        setArrangementMessage(
          error instanceof Error ? error.message : 'Arrangement could not be saved.',
        );
    } finally {
      if (arrangementCurrent.current.key === key) setArrangementSaving(false);
    }
  };
  const handlePatternTransform = useCallback(
    (pieceKey: string, transform: MeasurementSurfacePatternPieceTransformV1) => {
      arrangementEdits.current += 1;
      setPatternTransforms((current) => Object.freeze({ ...current, [pieceKey]: transform }));
    },
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
  const offsetPiece =
    patternTool === 'translate' &&
    patternOverlayResult?.ok &&
    arrangementKey &&
    onSaveMannequinArrangement &&
    !loading &&
    !error &&
    !poseLoading &&
    !poseError &&
    !poseEditing &&
    !disabled
      ? patternOverlayResult.overlay.pieces.find(
          ({ selected, scopeKey }) => selected && scopeKey === arrangementSource?.scopeKey,
        )
      : undefined;
  const sceneOverlayBridge =
    patternPieceScene?.sceneOverlay?.status === 'available'
      ? patternPieceScene.sceneOverlay.bridge
      : null;
  const correspondenceGuides =
    sceneOverlayBridge?.guides.filter(({ kind }) => kind === 'correspondence') ?? [];
  const threadGuides = sceneOverlayBridge?.guides.filter(({ kind }) => kind === 'thread') ?? [];
  const unboundPatternStage =
    patternOverlayResult?.ok && patternOverlayResult.overlay.visibility.pieces ? (
      <PatternImportDxfPhaseECadMannequinUnboundPatternStageV1
        overlay={patternOverlayResult.overlay}
      />
    ) : (
      stagedPieces
    );

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
      data-cad-mannequin-scene-overlay-seam-ordinals={
        sceneOverlayBridge?.decorations.length
          ? JSON.stringify(
              sceneOverlayBridge.decorations.map(({ seamId, side, operationSeam }) => ({
                seamId,
                side,
                ...operationSeam,
              })),
            )
          : undefined
      }
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
      {offsetPiece ? (
        <CadMannequinPatternOffsetControlsV1
          key={JSON.stringify([
            arrangementKey,
            offsetPiece.pieceKey,
            offsetPiece.lane,
            offsetPiece.laneIndex,
          ])}
          offsetM={offsetPiece.transform?.offsetM ?? ZERO_PATTERN_OFFSET_M}
          onApply={(axis, valueM) => {
            if (arrangementCurrent.current.key !== arrangementKey) return;
            const offsetM: [number, number, number] = [
              ...(offsetPiece.transform?.offsetM ?? ZERO_PATTERN_OFFSET_M),
            ];
            offsetM[axis] = valueM;
            handlePatternTransform(offsetPiece.pieceKey, {
              offsetM,
              rotationRad: offsetPiece.transform?.rotationRad ?? 0,
            });
          }}
        />
      ) : null}
      {onSaveMannequinArrangement && selected && patternPieceScene ? (
        <div className='flex shrink-0 items-center gap-2 px-2 py-1'>
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={
              disabled ||
              arrangementSaving ||
              !arrangementSource ||
              !poseBinding ||
              poseLoading ||
              Boolean(poseError)
            }
            onClick={() => void saveArrangement()}
          >
            {arrangementSaving ? 'Saving…' : 'Save arrangement'}
          </Button>
          {arrangementMessage ? (
            <Text component='span' size='micro' role='status'>
              {arrangementMessage}
            </Text>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className='relative min-h-[20rem] flex-1 overflow-hidden'>
          {unboundPatternStage}
          <div className='absolute bottom-2 left-2 z-10 space-y-1 bg-bgColor/90 px-2 py-1'>
            <Pill tone='warn'>models unavailable</Pill>
          </div>
        </div>
      ) : !selected ? (
        <div className='relative min-h-[20rem] flex-1 overflow-hidden'>
          {unboundPatternStage}
          <div className='absolute bottom-2 left-2 z-10 flex items-center gap-2 bg-bgColor/90 px-2 py-1'>
            <Pill tone={loading ? 'attention' : 'ink'}>
              {loading ? 'loading models' : 'no model selected'}
            </Pill>
            <Text component='p' size='micro' variant='label'>
              Select a model to place these pieces around it.
            </Text>
          </div>
        </div>
      ) : poseError ? (
        <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 text-center'>
          <div className='relative z-10 space-y-2'>
            <Text component='p' size='micro' variant='errorLabel' role='alert'>
              Pose session could not be prepared.
            </Text>
            {onRetryPose ? (
              <Button type='button' size='xs' variant='underline' onClick={onRetryPose}>
                Retry pose
              </Button>
            ) : null}
          </div>
          {unboundPatternStage}
        </div>
      ) : poseLoading || !poseBinding ? (
        <div className='relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 text-center'>
          <Text component='p' size='micro' variant='label' role='status' className='relative z-10'>
            Preparing pose session…
          </Text>
          {unboundPatternStage}
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
              onDisplayedBodySnapshotV1={observesBody ? handleDisplayedBodySnapshot : undefined}
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
 * A saved Workbench arrangement owns its preview model. Beyond that context, model selection
 * continues to use the ordinary TechCard form.
 */
export function PatternImportDxfPhaseECadMannequinModelPickerV1({
  disabled = false,
  paperDoll = null,
  stagedPieces = null,
  patternPieceScene = null,
  onDisplayedBodyInputV1,
  onSaveMannequinArrangement,
  onReadMannequinArrangement,
  onReadSavedMannequinModelId,
  arrangementSourceKey,
}: Readonly<{
  disabled?: boolean;
  paperDoll?: ReactNode;
  stagedPieces?: ReactNode;
  patternPieceScene?: PatternImportDxfPhaseECadMannequinPatternPieceSceneV1 | null;
  onDisplayedBodyInputV1?: CadMannequinDisplayedBodyInputObserverV1;
  onSaveMannequinArrangement?: CadWorkbenchPhysicalHostV1['onSaveMannequinArrangement'];
  onReadMannequinArrangement?: CadWorkbenchPhysicalHostV1['onReadMannequinArrangement'];
  onReadSavedMannequinModelId?: CadWorkbenchPhysicalHostV1['onReadSavedMannequinModelId'];
  arrangementSourceKey?: string;
}>) {
  const form = useFormContext<TechCardFormData>();
  const cardModelId =
    (useWatch({ control: form.control, name: 'baseModelId' }) as number | undefined) ?? 0;
  const sourceKey = onReadSavedMannequinModelId ? arrangementSourceKey ?? null : null;
  const [pickedModel, setPickedModel] = useState<{ sourceKey: string; modelId: number } | null>(
    null,
  );
  const [savedModel, setSavedModel] = useState<{
    sourceKey: string;
    modelId: number | null;
  } | null>(null);
  useEffect(() => {
    if (sourceKey === null || !onReadSavedMannequinModelId) return;
    const controller = new AbortController();
    const settle = (modelId: number | null) => {
      if (!controller.signal.aborted) setSavedModel({ sourceKey, modelId });
    };
    void onReadSavedMannequinModelId(controller.signal).then(settle, () => settle(null));
    return () => controller.abort();
  }, [onReadSavedMannequinModelId, sourceKey]);
  const modelId =
    sourceKey === null
      ? cardModelId
      : pickedModel?.sourceKey === sourceKey
        ? pickedModel.modelId
        : savedModel?.sourceKey === sourceKey
          ? savedModel.modelId ?? cardModelId
          : 0;
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
      onModelChange={(nextModelId) => {
        if (sourceKey !== null) {
          setPickedModel({ sourceKey, modelId: nextModelId });
          return;
        }
        form.setValue('baseModelId', nextModelId, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }}
      paperDoll={paperDoll}
      stagedPieces={stagedPieces}
      patternPieceScene={patternPieceScene}
      poseBinding={poseSession.binding}
      poseLoading={poseSession.loading}
      poseError={poseSession.error}
      onRetryPose={poseSession.retry}
      onDisplayedBodyInputV1={onDisplayedBodyInputV1}
      onSaveMannequinArrangement={onSaveMannequinArrangement}
      onReadMannequinArrangement={onReadMannequinArrangement}
      arrangementSourceKey={arrangementSourceKey}
    />
  );
}
