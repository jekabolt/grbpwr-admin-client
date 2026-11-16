import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { BoxMm } from 'lib/pattern-import/types';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button, Input, Select, Text } from 'ui';

import { SHEET_INK, SheetViewport, ptsAttr, vy } from '../sheet-viewport';
import { usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1 } from './cad-workbench-split-shell-v1';
import { PatternImportDxfPhaseEDraftCadTopologyOverlayV1 } from './draft-cad-topology-overlay-v1';
import {
  createPatternImportDxfPhaseEDraftCadTopologySessionV1,
  deletePatternImportDxfPhaseEDraftCadCalloutV1,
  deletePatternImportDxfPhaseEDraftCadMeasurementV1,
  formatPatternImportDxfPhaseEDraftCadMeasurementV1,
  selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1,
  selectPatternImportDxfPhaseEDraftCadTopologyToolV1,
  setPatternImportDxfPhaseEDraftCadTopologyUnitV1,
  updatePatternImportDxfPhaseEDraftCadCalloutV1,
  type PatternImportDxfPhaseEDraftCadTopologySessionV1,
  type PatternImportDxfPhaseEDraftCadTopologyToolV1,
} from './draft-cad-topology-session-v1';
import type { PatternImportDxfPhaseEVertexAnchorV1 } from './measurement-v1';
import type { PatternImportDxfPhaseETopologyAnnotationDraftV5 } from './topology-annotation-save-control-v5';
import type { PatternImportDxfPhaseETopologyAnnotationSourceV5 } from './topology-annotation-application-transaction-v5';

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_TOPOLOGY_ANNOTATION_EDITOR_V1 =
  'pattern-import-dxf-phase-e-exact-n-topology-annotation-editor/1' as const;

const TOOL_LABELS: Readonly<Record<PatternImportDxfPhaseEDraftCadTopologyToolV1, string>> =
  Object.freeze({
    'measure-point': 'Point',
    'measure-line': 'Line',
    'measure-edge': 'Edge',
    callout: 'Callout',
  });

function sequenceFromDraft(draft: PatternImportDxfPhaseETopologyAnnotationDraftV5): number {
  let maximum = draft.measurements.length + draft.callouts.length;
  for (const id of [
    ...draft.measurements.map(({ id }) => id),
    ...draft.callouts.map(({ id }) => id),
  ]) {
    const suffix = /-(\d+)$/.exec(id)?.[1];
    if (suffix) maximum = Math.max(maximum, Number(suffix));
  }
  return maximum;
}

export function createPatternImportDxfPhaseEExactNTopologyEditorSessionV1(
  sourceIdentity: string,
  draft: PatternImportDxfPhaseETopologyAnnotationDraftV5,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  const empty = createPatternImportDxfPhaseEDraftCadTopologySessionV1(sourceIdentity);
  return Object.freeze({
    ...empty,
    measurements: Object.freeze([...draft.measurements]),
    callouts: Object.freeze([...draft.callouts]),
    sequence: sequenceFromDraft(draft),
  });
}

export function projectPatternImportDxfPhaseEExactNTopologyAnnotationDraftV1(
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
): PatternImportDxfPhaseETopologyAnnotationDraftV5 {
  return Object.freeze({
    measurements: Object.freeze([...state.measurements]),
    callouts: Object.freeze([...state.callouts]),
  });
}

export function selectPatternImportDxfPhaseEExactNTopologyVertexV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  state: PatternImportDxfPhaseEDraftCadTopologySessionV1,
  anchor: PatternImportDxfPhaseEVertexAnchorV1,
): PatternImportDxfPhaseEDraftCadTopologySessionV1 {
  return selectPatternImportDxfPhaseEDraftCadTopologyAnchorV1(projection, state, anchor);
}

function draftFingerprint(draft: PatternImportDxfPhaseETopologyAnnotationDraftV5): string {
  return JSON.stringify(draft);
}

function pieceBounds(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  pieceId: string,
): BoxMm {
  const camera = projection.pieces.find((piece) => piece.pieceId === pieceId)?.cameraMm;
  return camera
    ? { minX: camera.minX, minY: camera.minY, maxX: camera.maxX, maxY: camera.maxY }
    : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
}

function vertexOptions(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  pieceId: string,
): readonly Readonly<{
  key: string;
  anchor: PatternImportDxfPhaseEVertexAnchorV1;
  pointMm: Readonly<{ x: number; y: number }>;
}>[] {
  const piece = projection.pieces.find((candidate) => candidate.pieceId === pieceId);
  if (!piece) return Object.freeze([]);
  return Object.freeze(
    piece.contours.flatMap((contour) =>
      contour.vertices.map((vertex) =>
        Object.freeze({
          key: `exact-n-annotation-vertex:${encodeURIComponent(piece.pieceId)}:${encodeURIComponent(contour.contourId)}:${encodeURIComponent(vertex.vertexId)}`,
          anchor: Object.freeze({
            pieceId: piece.pieceId,
            pieceLineKey: piece.pieceLineKey,
            contourId: contour.contourId,
            vertexId: vertex.vertexId,
          }),
          pointMm: vertex.pointMm,
        }),
      ),
    ),
  );
}

function guidance(state: PatternImportDxfPhaseEDraftCadTopologySessionV1): string {
  if (!state.activeTool) return 'Choose a tool, then pick exact vertices.';
  if (state.activeTool === 'measure-point') return 'Pick one exact vertex.';
  if (state.activeTool === 'callout') return 'Pick one exact vertex for the leader.';
  if (state.pendingAnchors.length === 1) return 'Pick the second exact vertex.';
  return state.activeTool === 'measure-edge'
    ? 'Pick two adjacent vertices on one contour.'
    : 'Pick two vertices on one piece.';
}

export function PatternImportDxfPhaseEExactNTopologyAnnotationEditorV1({
  source,
  draft,
  onDraftChange,
  disabled = false,
}: Readonly<{
  source: PatternImportDxfPhaseETopologyAnnotationSourceV5;
  draft: PatternImportDxfPhaseETopologyAnnotationDraftV5;
  onDraftChange: (draft: PatternImportDxfPhaseETopologyAnnotationDraftV5) => void;
  disabled?: boolean;
}>) {
  const measurementUnit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1();
  const [state, setState] = useState(() =>
    createPatternImportDxfPhaseEExactNTopologyEditorSessionV1(source.identity, draft),
  );
  const [activePieceId, setActivePieceId] = useState(source.projection.pieces[0]?.pieceId ?? '');
  const publishedFingerprint = useRef(draftFingerprint(draft));
  const incomingFingerprint = draftFingerprint(draft);

  useEffect(() => {
    if (
      state.sourceIdentity === source.identity &&
      incomingFingerprint === publishedFingerprint.current
    )
      return;
    publishedFingerprint.current = incomingFingerprint;
    setState(createPatternImportDxfPhaseEExactNTopologyEditorSessionV1(source.identity, draft));
    setActivePieceId(source.projection.pieces[0]?.pieceId ?? '');
  }, [draft, incomingFingerprint, source.identity, source.projection.pieces, state.sourceIdentity]);

  useEffect(() => {
    if (!measurementUnit?.unit || state.unit === measurementUnit.unit) return;
    setState((current) =>
      setPatternImportDxfPhaseEDraftCadTopologyUnitV1(current, measurementUnit.unit),
    );
  }, [measurementUnit?.unit, state.unit]);

  const activePiece = source.projection.pieces.find(({ pieceId }) => pieceId === activePieceId);
  const vertices = useMemo(
    () => vertexOptions(source.projection, activePieceId),
    [activePieceId, source.projection],
  );
  const vertexByKey = useMemo(
    () => new Map(vertices.map((option) => [option.key, option.anchor])),
    [vertices],
  );
  const bounds = useMemo(
    () => pieceBounds(source.projection, activePieceId),
    [activePieceId, source.projection],
  );

  const update = (
    reducer: (
      current: PatternImportDxfPhaseEDraftCadTopologySessionV1,
    ) => PatternImportDxfPhaseEDraftCadTopologySessionV1,
  ) => {
    setState((current) => {
      const next = reducer(current);
      const nextDraft = projectPatternImportDxfPhaseEExactNTopologyAnnotationDraftV1(next);
      const nextFingerprint = draftFingerprint(nextDraft);
      if (nextFingerprint !== publishedFingerprint.current) {
        publishedFingerprint.current = nextFingerprint;
        onDraftChange(nextDraft);
      }
      return next;
    });
  };

  return (
    <section
      className='min-h-0 border-t border-borderColor'
      aria-label='Pattern annotations'
      data-exact-n-topology-annotation-editor-v1=''
      data-topology-source-identity={source.identity}
    >
      <header className='flex min-h-9 flex-wrap items-center gap-1 border-b border-hairline px-2 py-1'>
        <Text component='span' size='micro' className='mr-1 font-bold'>
          Annotations
        </Text>
        <Select
          name='exact-n-annotation-piece'
          size='sm'
          value={activePieceId}
          items={source.projection.pieces.map((piece) => ({
            value: piece.pieceId,
            label: piece.pieceLineKey,
          }))}
          onValueChange={setActivePieceId}
          readOnly={disabled}
        />
        <div
          className='ml-auto flex items-center gap-1'
          role='toolbar'
          aria-label='Annotation tools'
        >
          {(Object.keys(TOOL_LABELS) as PatternImportDxfPhaseEDraftCadTopologyToolV1[]).map(
            (tool) => (
              <Button
                key={tool}
                type='button'
                size='xs'
                variant={state.activeTool === tool ? 'main' : 'secondary'}
                aria-pressed={state.activeTool === tool}
                disabled={disabled}
                onClick={() =>
                  setState((current) =>
                    selectPatternImportDxfPhaseEDraftCadTopologyToolV1(
                      current,
                      current.activeTool === tool ? null : tool,
                    ),
                  )
                }
              >
                {TOOL_LABELS[tool]}
              </Button>
            ),
          )}
        </div>
      </header>

      <Text
        component='p'
        size='micro'
        variant={state.blocker ? 'errorLabel' : 'label'}
        className='px-2 py-1'
      >
        {state.blocker ?? guidance(state)}
      </Text>

      <div className='h-64 min-h-0 border-y border-hairline bg-bgColor'>
        <SheetViewport
          bbox={bounds}
          tool={state.activeTool && !disabled ? 'point' : 'pan'}
          onPick={(key) => {
            if (disabled || !state.activeTool) return;
            const anchor = vertexByKey.get(key);
            if (!anchor) return;
            update((current) =>
              selectPatternImportDxfPhaseEExactNTopologyVertexV1(
                source.projection,
                current,
                anchor,
              ),
            );
          }}
        >
          {({ unit }) => (
            <>
              {activePiece?.contours.map((contour) => {
                const points = contour.vertices.map(({ pointMm }) => pointMm);
                const line = contour.closed && points.length ? [...points, points[0]!] : points;
                return (
                  <polyline
                    key={contour.contourId}
                    data-exact-n-annotation-contour={contour.contourId}
                    points={ptsAttr(line)}
                    fill='none'
                    stroke={contour.role === 'sewing-boundary' ? SHEET_INK.ink : SHEET_INK.mut}
                    strokeWidth={1.1}
                    strokeDasharray={
                      contour.role === 'cut-boundary' ? `${unit * 6} ${unit * 3}` : undefined
                    }
                    vectorEffect='non-scaling-stroke'
                    pointerEvents='none'
                  />
                );
              })}
              {state.activeTool && !disabled
                ? vertices.map((option) => {
                    const selected = state.pendingAnchors.some(
                      (anchor) =>
                        anchor.pieceId === option.anchor.pieceId &&
                        anchor.contourId === option.anchor.contourId &&
                        anchor.vertexId === option.anchor.vertexId,
                    );
                    return (
                      <g key={option.key}>
                        <circle
                          cx={option.pointMm.x}
                          cy={vy(option.pointMm.y)}
                          r={unit * 4.5}
                          fill={selected ? SHEET_INK.red : 'var(--color-bgColor)'}
                          stroke={selected ? SHEET_INK.red : SHEET_INK.ink}
                          strokeWidth={1.25}
                          vectorEffect='non-scaling-stroke'
                          pointerEvents='none'
                        />
                        <circle
                          data-key={option.key}
                          data-exact-n-topology-vertex={option.anchor.vertexId}
                          cx={option.pointMm.x}
                          cy={vy(option.pointMm.y)}
                          r={unit * 10}
                          fill='transparent'
                          pointerEvents='all'
                        />
                      </g>
                    );
                  })
                : null}
              {activePiece ? (
                <PatternImportDxfPhaseEDraftCadTopologyOverlayV1
                  projection={source.projection}
                  state={state}
                  pieceId={activePiece.pieceId}
                  unit={unit}
                />
              ) : null}
            </>
          )}
        </SheetViewport>
      </div>

      {state.measurements.length || state.callouts.length ? (
        <div className='divide-y divide-hairline px-2'>
          {state.measurements.map((measurement, index) => (
            <div key={measurement.id} className='flex min-h-8 items-center gap-2 py-1'>
              <Text component='span' size='micro' className='font-bold'>
                {index + 1} · {measurement.kind}
              </Text>
              <Text
                component='span'
                size='micro'
                variant='label'
                className='min-w-0 flex-1 truncate'
              >
                {formatPatternImportDxfPhaseEDraftCadMeasurementV1(
                  source.projection,
                  measurement,
                  state.unit,
                )}
              </Text>
              <Button
                type='button'
                size='xs'
                variant='underline'
                disabled={disabled}
                aria-label={`Delete annotation measurement ${index + 1}`}
                onClick={() =>
                  update((current) =>
                    deletePatternImportDxfPhaseEDraftCadMeasurementV1(current, measurement.id),
                  )
                }
              >
                Delete
              </Button>
            </div>
          ))}
          {state.callouts.map((callout, index) => (
            <div key={callout.id} className='flex min-h-8 items-center gap-1 py-1'>
              <Text component='span' size='micro' className='w-5 flex-none text-center font-bold'>
                {index + 1}
              </Text>
              <Input
                type='text'
                aria-label={`Annotation callout ${index + 1} text`}
                className='min-w-0 flex-1 text-micro'
                value={callout.text}
                disabled={disabled}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  update((current) =>
                    updatePatternImportDxfPhaseEDraftCadCalloutV1(
                      source.projection,
                      current,
                      callout.id,
                      event.target.value,
                    ),
                  )
                }
              />
              <Button
                type='button'
                size='xs'
                variant='underline'
                disabled={disabled}
                aria-label={`Delete annotation callout ${index + 1}`}
                onClick={() =>
                  update((current) =>
                    deletePatternImportDxfPhaseEDraftCadCalloutV1(
                      source.projection,
                      current,
                      callout.id,
                    ),
                  )
                }
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
