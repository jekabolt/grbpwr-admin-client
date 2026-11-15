import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
  type PatternImportDxfProductPhaseEAssemblyProposalV1,
  type PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  type PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type React from 'react';
import {
  Button,
  CalloutBox,
  CheckboxCommon,
  Chip,
  ChipRow,
  GroupLabel,
  HeaderNote,
  Input,
  Pill,
  Row,
  Section,
  Select,
  Text,
} from 'ui';

import {
  derivePatternImportDxfProductPhaseEWorkbenchResultV1,
  type PatternImportDxfProductPhaseEProposalSourceStatusV1,
  type PatternImportDxfProductPhaseEWorkbenchResultV1,
} from './contract';

type WorkbenchState = PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1;
type SideState = WorkbenchState['sides'][number];
type MaterialSelection = WorkbenchState['materialSelections'][number];
export type PatternImportDxfProductPhaseEInspectorSideV1 = 'A' | 'B';

export type PatternImportDxfProductPhaseEWorkbenchPropsV1 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
  proposalSource: PatternImportDxfProductPhaseEProposalSourceStatusV1;
  state: WorkbenchState;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  activeSide: PatternImportDxfProductPhaseEInspectorSideV1;
  onActiveSideChange: (side: PatternImportDxfProductPhaseEInspectorSideV1) => void;
  onStateChange: (next: WorkbenchState) => void;
  /** Emits deliberate choices only. It never invokes a producer, runtime, or save. */
  onConfirm: (result: PatternImportDxfProductPhaseEWorkbenchResultV1) => void;
  disabled?: boolean;
}>;

function replaceSide(state: WorkbenchState, index: 0 | 1, side: SideState): WorkbenchState {
  return {
    ...state,
    sides: index === 0 ? [side, state.sides[1]] : [state.sides[0], side],
  };
}

function replaceMaterial(
  state: WorkbenchState,
  index: 0 | 1,
  selection: MaterialSelection,
): WorkbenchState {
  return {
    ...state,
    materialSelections:
      index === 0
        ? [selection, state.materialSelections[1]]
        : [state.materialSelections[0], selection],
  };
}

export function selectPatternImportDxfProductPhaseECanvasContourV1(
  state: WorkbenchState,
  index: 0 | 1,
  contourId: string,
): WorkbenchState {
  const side = state.sides[index];
  return replaceSide(state, index, {
    ...side,
    contourId,
    startBoundaryVertexId: side.contourId === contourId ? side.startBoundaryVertexId : null,
    endBoundaryVertexId: side.contourId === contourId ? side.endBoundaryVertexId : null,
    confirmed: false,
  });
}

export function selectPatternImportDxfProductPhaseECanvasVertexV1(
  state: WorkbenchState,
  index: 0 | 1,
  contourId: string,
  vertexId: string,
): WorkbenchState {
  const side = state.sides[index];
  if (side.contourId !== contourId || !side.startBoundaryVertexId)
    return replaceSide(state, index, {
      ...side,
      contourId,
      startBoundaryVertexId: vertexId,
      endBoundaryVertexId: null,
      confirmed: false,
    });
  if (!side.endBoundaryVertexId && vertexId !== side.startBoundaryVertexId)
    return replaceSide(state, index, {
      ...side,
      endBoundaryVertexId: vertexId,
      confirmed: false,
    });
  return replaceSide(state, index, {
    ...side,
    startBoundaryVertexId: vertexId,
    endBoundaryVertexId: null,
    confirmed: false,
  });
}

function parseFiniteNumber(value: string): number | null {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Text
      component='label'
      htmlFor={htmlFor}
      size='micro'
      variant='label'
      tracking='label'
      className='mb-1 block uppercase'
    >
      {children}
    </Text>
  );
}

function ConfirmLine({
  id,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className='flex cursor-pointer items-start gap-2 py-1'>
      <CheckboxCommon name={id} checked={checked} disabled={disabled} onChange={onChange} />
      <Text component='span' size='micro' variant={disabled ? 'inactive' : 'label'}>
        {children}
      </Text>
    </label>
  );
}

function cameraViewBox(
  camera: PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number]['cameraMm'],
): string | null {
  const values = [camera.minX, camera.minY, camera.maxX, camera.maxY, camera.padding];
  if (
    !values.every(Number.isFinite) ||
    camera.maxX < camera.minX ||
    camera.maxY < camera.minY ||
    camera.padding < 0
  )
    return null;
  const minX = camera.minX - camera.padding;
  const minY = camera.minY - camera.padding;
  const width = Math.max(camera.maxX - camera.minX + camera.padding * 2, 1);
  const height = Math.max(camera.maxY - camera.minY + camera.padding * 2, 1);
  return `${minX} ${minY} ${width} ${height}`;
}

function ProjectedPiece({
  index,
  projection,
  proposal,
  state,
  active,
  onSelect,
  onStateChange,
  disabled,
}: {
  index: 0 | 1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
  state: WorkbenchState;
  active: boolean;
  onSelect: () => void;
  onStateChange: (next: WorkbenchState) => void;
  disabled?: boolean;
}) {
  const piece = projection.pieces[index];
  const side = state.sides[index];
  const proposed = proposal.sides[index];
  const viewBox = piece ? cameraViewBox(piece.cameraMm) : null;
  if (!piece || !proposed || !viewBox) return null;

  const exactVertices = new Set(
    [side?.startBoundaryVertexId, side?.endBoundaryVertexId].filter(
      (value): value is string => !!value,
    ),
  );
  const expectedRole =
    state.physicalSurface?.mode === 'sewing-surface'
      ? 'sewing-boundary'
      : state.physicalSurface?.mode === 'cut-surface'
        ? 'cut-boundary'
        : null;
  const [from, to] = proposed.evidence.range;
  const proposalLength = Math.max(0.001, to - from);
  const proposalGap = Math.max(0.001, 1 - proposalLength);
  const x = index === 0 ? 0 : 500;

  return (
    <svg
      x={x}
      y='0'
      width='500'
      height='500'
      viewBox={viewBox}
      preserveAspectRatio='xMidYMid meet'
      role='group'
      aria-label={`Side ${proposed.sourceSide} geometry for piece ${piece.pieceId}`}
      data-canvas-side={proposed.sourceSide}
      data-canvas-active={active}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      className='cursor-pointer'
    >
      <title>{`Piece ${piece.pieceId}. The proposed seam and selected edge anchors are marked separately.`}</title>
      {piece.contours.map((contour) => {
        const coordinatesValid = contour.vertices.every(
          ({ pointMm }) => Number.isFinite(pointMm.x) && Number.isFinite(pointMm.y),
        );
        if (!coordinatesValid) return null;
        const raw = contour.vertices.map(({ pointMm }) => `${pointMm.x},${pointMm.y}`);
        const points = contour.closed && raw.length ? [...raw, raw[0]].join(' ') : raw.join(' ');
        const exactContour = contour.contourId === side?.contourId;
        const proposalCandidate =
          contour.role !== 'hole' &&
          (!expectedRole || contour.role === expectedRole) &&
          (!side?.contourId || exactContour);
        const exactTargetEnabled = !disabled && !!expectedRole && contour.role === expectedRole;
        const selectContour = () => {
          if (!exactTargetEnabled) return;
          onSelect();
          onStateChange(
            selectPatternImportDxfProductPhaseECanvasContourV1(state, index, contour.contourId),
          );
        };
        return (
          <g key={contour.contourId} data-contour-id={contour.contourId}>
            <polyline
              points={points}
              fill='none'
              stroke='currentColor'
              strokeWidth={exactContour ? 2 : 1}
              opacity={exactContour ? 1 : 0.42}
              vectorEffect='non-scaling-stroke'
            />
            <polyline
              points={points}
              fill='none'
              stroke='transparent'
              strokeWidth='12'
              vectorEffect='non-scaling-stroke'
              pointerEvents='stroke'
              role='button'
              tabIndex={exactTargetEnabled ? 0 : -1}
              aria-disabled={!exactTargetEnabled}
              aria-label={`Select exact contour ${contour.contourId} for side ${proposed.sourceSide}`}
              data-exact-contour-id={contour.contourId}
              onClick={(event) => {
                event.stopPropagation();
                selectContour();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  selectContour();
                }
              }}
              className={exactTargetEnabled ? 'cursor-crosshair' : undefined}
            />
            {proposalCandidate && (
              <polyline
                points={points}
                pathLength='1'
                fill='none'
                stroke='var(--color-warning)'
                strokeWidth='3'
                strokeDasharray={`${proposalLength} ${proposalGap}`}
                strokeDashoffset={-from}
                vectorEffect='non-scaling-stroke'
                pointerEvents='none'
                data-proposal-highlight={proposed.sourceSide}
              />
            )}
            {exactContour
              ? contour.vertices.map(({ vertexId, pointMm }) => {
                  const selected = exactVertices.has(vertexId);
                  const selectVertex = () => {
                    if (!exactTargetEnabled) return;
                    onSelect();
                    onStateChange(
                      selectPatternImportDxfProductPhaseECanvasVertexV1(
                        state,
                        index,
                        contour.contourId,
                        vertexId,
                      ),
                    );
                  };
                  return (
                    <circle
                      key={vertexId}
                      cx={pointMm.x}
                      cy={pointMm.y}
                      r='2.5%'
                      fill='var(--color-bgColor)'
                      stroke={selected ? 'var(--color-error)' : 'currentColor'}
                      strokeWidth={selected ? '2' : '1'}
                      opacity={selected ? 1 : 0.72}
                      vectorEffect='non-scaling-stroke'
                      role='button'
                      tabIndex={exactTargetEnabled ? 0 : -1}
                      aria-disabled={!exactTargetEnabled}
                      aria-label={`Select exact vertex ${vertexId} on contour ${contour.contourId}`}
                      data-exact-vertex-id={vertexId}
                      data-exact-vertex-contour-id={contour.contourId}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectVertex();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          selectVertex();
                        }
                      }}
                      className={exactTargetEnabled ? 'cursor-crosshair' : undefined}
                    />
                  );
                })
              : null}
          </g>
        );
      })}
    </svg>
  );
}

function GeometryCanvas({
  projection,
  proposal,
  state,
  activeSide,
  onActiveSideChange,
  onStateChange,
  disabled,
}: {
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
  state: WorkbenchState;
  activeSide: PatternImportDxfProductPhaseEInspectorSideV1;
  onActiveSideChange: (side: PatternImportDxfProductPhaseEInspectorSideV1) => void;
  onStateChange: (next: WorkbenchState) => void;
  disabled?: boolean;
}) {
  return (
    <div className='flex min-h-0 flex-col' data-phase-e-canvas=''>
      <div className='flex flex-wrap items-center gap-2 border-b border-hairline pb-2'>
        <Pill tone='ink'>seam {proposal.seam.id}</Pill>
        <Pill tone='attention'>Proposed seam</Pill>
        <Text component='p' size='micro' variant='label'>
          Select a piece to inspect its exact edge IDs.
        </Text>
      </div>
      <div className='relative min-h-80 flex-1 bg-pageBg'>
        <svg
          viewBox='0 0 1000 500'
          role='group'
          aria-label='Two-piece DXF geometry view'
          className='h-full min-h-80 w-full text-textColor'
          preserveAspectRatio='xMidYMid meet'
        >
          <rect
            x={activeSide === 'A' ? 1 : 501}
            y='1'
            width='498'
            height='498'
            fill='none'
            stroke='var(--color-warning)'
            strokeWidth='2'
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
          />
          <ProjectedPiece
            index={0}
            projection={projection}
            proposal={proposal}
            state={state}
            active={activeSide === 'A'}
            onSelect={() => onActiveSideChange('A')}
            onStateChange={onStateChange}
            disabled={disabled}
          />
          <ProjectedPiece
            index={1}
            projection={projection}
            proposal={proposal}
            state={state}
            active={activeSide === 'B'}
            onSelect={() => onActiveSideChange('B')}
            onStateChange={onStateChange}
            disabled={disabled}
          />
        </svg>
      </div>
      <div className='flex flex-wrap items-center gap-3 border-t border-hairline pt-2'>
        <ChipRow>
          {(['A', 'B'] as const).map((side) => {
            const index = side === 'A' ? 0 : 1;
            return (
              <Chip
                key={side}
                selected={activeSide === side}
                pressed={activeSide === side}
                onClick={() => onActiveSideChange(side)}
              >
                side {side} · {proposal.sides[index]?.pieceId ?? 'missing'}
              </Chip>
            );
          })}
        </ChipRow>
        <Text component='p' size='micro' variant='label'>
          Proposed seam · click an exact contour, then choose the start and end edge points. A later
          point click starts a new span.
        </Text>
      </div>
    </div>
  );
}

function SideInspector({
  index,
  catalog,
  proposal,
  state,
  materialOptions,
  disabled,
  onChange,
}: {
  index: 0 | 1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
  state: WorkbenchState;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
  disabled?: boolean;
  onChange: (next: WorkbenchState) => void;
}) {
  const sideName = index === 0 ? 'A' : 'B';
  const proposed = proposal.sides[index];
  const side = state.sides[index];
  const material = state.materialSelections[index];
  const piece = catalog.pieces.find(
    ({ pieceId, pieceLineKey }) =>
      pieceId === proposed?.pieceId && pieceLineKey === proposed?.pieceLineKey,
  );
  const expectedRole =
    state.physicalSurface?.mode === 'sewing-surface'
      ? 'sewing-boundary'
      : state.physicalSurface?.mode === 'cut-surface'
        ? 'cut-boundary'
        : null;
  const contours = piece?.contours.filter(({ role }) => role === expectedRole) ?? [];
  const contour = contours.find(({ contourId }) => contourId === side?.contourId);
  const vertices = contour?.boundaryVertices ?? [];
  const exactFieldsPresent =
    !!contour &&
    !!side.startBoundaryVertexId &&
    !!side.endBoundaryVertexId &&
    side.startBoundaryVertexId !== side.endBoundaryVertexId &&
    vertices.some(({ vertexId }) => vertexId === side.startBoundaryVertexId) &&
    vertices.some(({ vertexId }) => vertexId === side.endBoundaryVertexId) &&
    !!side.direction;

  if (!proposed || !side || !piece || !material)
    return (
      <div data-context-inspector={sideName}>
        <Text component='p' variant='errorLabel'>
          ! Exact side binding is unavailable.
        </Text>
      </div>
    );

  const setSide = (next: SideState) => onChange(replaceSide(state, index, next));
  const setMaterial = (next: MaterialSelection) => onChange(replaceMaterial(state, index, next));
  const surfaceReady = !!state.physicalSurface;

  return (
    <div className='min-w-0' data-context-inspector={sideName}>
      <GroupLabel flush>
        Context inspector · side {sideName} · {proposed.pieceId}
      </GroupLabel>
      <div className='mb-2'>
        <Row label='piece line' value={proposed.pieceLineKey} />
        <Row label='proposed edge' value={proposed.evidence.edgeHint} />
        <Row
          label='proposed span'
          value={`${proposed.evidence.range[0]} → ${proposed.evidence.range[1]}`}
        />
        <Row label='stored length' value={`${proposed.evidence.lenMm} mm`} />
        <Row label='contour signature' value={proposed.evidence.contourSig} />
      </div>

      <div className='space-y-stack'>
        <div>
          <FieldLabel htmlFor='phase-e-physical-surface'>Physical surface</FieldLabel>
          <Select
            name='phase-e-physical-surface'
            aria-label='Explicit physical surface'
            placeholder='select physical surface'
            value={state.physicalSurface?.mode ?? undefined}
            items={[
              { value: 'sewing-surface', label: 'sewing surface · seam allowance excluded' },
              { value: 'cut-surface', label: 'cut surface · seam allowance physical' },
            ]}
            readOnly={disabled}
            onValueChange={(value) => {
              const physicalSurface =
                value === 'sewing-surface'
                  ? ({ mode: 'sewing-surface', seamAllowancePhysical: false } as const)
                  : ({ mode: 'cut-surface', seamAllowancePhysical: true } as const);
              onChange({
                ...state,
                physicalSurface,
                physicalSurfaceConfirmed: false,
                sides: [
                  {
                    ...state.sides[0],
                    contourId: null,
                    startBoundaryVertexId: null,
                    endBoundaryVertexId: null,
                    confirmed: false,
                  },
                  {
                    ...state.sides[1],
                    contourId: null,
                    startBoundaryVertexId: null,
                    endBoundaryVertexId: null,
                    confirmed: false,
                  },
                ],
              });
            }}
          />
          <ConfirmLine
            id='phase-e-surface-confirm'
            checked={state.physicalSurfaceConfirmed}
            disabled={disabled || (!state.physicalSurfaceConfirmed && !surfaceReady)}
            onChange={(physicalSurfaceConfirmed) =>
              onChange({
                ...state,
                physicalSurfaceConfirmed: physicalSurfaceConfirmed && surfaceReady,
              })
            }
          >
            Confirm the physical surface and seam-allowance meaning.
          </ConfirmLine>
        </div>

        <div>
          <FieldLabel htmlFor={`phase-e-contour-${sideName}`}>Exact contour ID</FieldLabel>
          <Select
            name={`phase-e-contour-${sideName}`}
            aria-label={`Side ${sideName} exact contour ID`}
            placeholder={expectedRole ? 'select exact contour' : 'select physical surface first'}
            value={side.contourId ?? undefined}
            items={contours.map(({ contourId, role }) => ({
              value: contourId,
              label: `${contourId} · ${role}`,
            }))}
            readOnly={disabled || !expectedRole}
            onValueChange={(contourId) =>
              setSide({
                ...side,
                contourId,
                startBoundaryVertexId: null,
                endBoundaryVertexId: null,
                confirmed: false,
              })
            }
          />
        </div>
        <div className='grid gap-stack sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'>
          <div>
            <FieldLabel htmlFor={`phase-e-start-${sideName}`}>Start vertex ID</FieldLabel>
            <Select
              name={`phase-e-start-${sideName}`}
              aria-label={`Side ${sideName} exact start vertex ID`}
              placeholder='select exact start'
              value={side.startBoundaryVertexId ?? undefined}
              items={vertices.map(({ vertexId, ordinal }) => ({
                value: vertexId,
                label: `${vertexId} · ordinal ${ordinal}`,
              }))}
              readOnly={disabled || !contour}
              onValueChange={(startBoundaryVertexId) =>
                setSide({ ...side, startBoundaryVertexId, confirmed: false })
              }
            />
          </div>
          <div>
            <FieldLabel htmlFor={`phase-e-end-${sideName}`}>End vertex ID</FieldLabel>
            <Select
              name={`phase-e-end-${sideName}`}
              aria-label={`Side ${sideName} exact end vertex ID`}
              placeholder='select exact end'
              value={side.endBoundaryVertexId ?? undefined}
              items={vertices.map(({ vertexId, ordinal }) => ({
                value: vertexId,
                label: `${vertexId} · ordinal ${ordinal}`,
              }))}
              readOnly={disabled || !contour}
              onValueChange={(endBoundaryVertexId) =>
                setSide({ ...side, endBoundaryVertexId, confirmed: false })
              }
            />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor={`phase-e-direction-${sideName}`}>Explicit direction</FieldLabel>
          <Select
            name={`phase-e-direction-${sideName}`}
            aria-label={`Side ${sideName} explicit direction`}
            placeholder='select direction'
            value={side.direction ?? undefined}
            items={[
              { value: 'forward', label: 'forward' },
              { value: 'reverse', label: 'reverse' },
            ]}
            readOnly={disabled}
            onValueChange={(direction) =>
              setSide({
                ...side,
                direction: direction as SideState['direction'],
                confirmed: false,
              })
            }
          />
          <Text component='p' size='nano' variant='label' className='mt-1'>
            Prefilled assembly direction: {proposed.suggestedDirection ?? 'none'}. Confirm or
            replace it explicitly.
          </Text>
        </div>
        <ConfirmLine
          id={`phase-e-side-confirm-${sideName}`}
          checked={side.confirmed}
          disabled={disabled || (!side.confirmed && !exactFieldsPresent)}
          onChange={(confirmed) => setSide({ ...side, confirmed: confirmed && exactFieldsPresent })}
        >
          Confirm exact contour, vertex IDs, and direction for side {sideName}.
        </ConfirmLine>

        <div>
          <FieldLabel htmlFor={`phase-e-material-${sideName}`}>
            Immutable material revision
          </FieldLabel>
          <Select
            name={`phase-e-material-${sideName}`}
            aria-label={`Side ${sideName} immutable material revision`}
            placeholder='select immutable revision'
            value={material.optionId ?? undefined}
            items={materialOptions.map((option) => ({
              value: option.id,
              label: `${option.label} · ${option.materialRevision}`,
            }))}
            readOnly={disabled}
            onValueChange={(optionId) => setMaterial({ ...material, optionId, confirmed: false })}
          />
          <ConfirmLine
            id={`phase-e-material-confirm-${sideName}`}
            checked={material.confirmed}
            disabled={disabled || (!material.confirmed && !material.optionId)}
            onChange={(confirmed) =>
              setMaterial({ ...material, confirmed: confirmed && !!material.optionId })
            }
          >
            Confirm this exact material revision for side {sideName}.
          </ConfirmLine>
        </div>
      </div>
    </div>
  );
}

function AuthorityStrip({
  proposal,
  state,
  disabled,
  onChange,
}: {
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
  state: WorkbenchState;
  disabled?: boolean;
  onChange: (next: WorkbenchState) => void;
}) {
  const documentReady = !!state.documentId && !!state.revision;
  const operationReady =
    !!proposal.operation.authoringOperationId &&
    Number.isSafeInteger(state.operationStage) &&
    (state.operationStage ?? -1) >= 0;
  const toleranceReady =
    state.tolerance.endpointMm !== null &&
    state.tolerance.endpointMm >= 0 &&
    state.tolerance.endpointMm <= 1_000 &&
    state.tolerance.fullLengthMm !== null &&
    state.tolerance.fullLengthMm >= 0 &&
    state.tolerance.fullLengthMm <= 1_000_000 &&
    state.tolerance.fullLengthRelative !== null &&
    state.tolerance.fullLengthRelative >= 0 &&
    state.tolerance.fullLengthRelative <= 1;
  return (
    <div>
      <GroupLabel>Assembly setup</GroupLabel>
      <div className='grid gap-gutter lg:grid-cols-3'>
        <div className='space-y-stack'>
          <div>
            <FieldLabel htmlFor='phase-e-document-id'>Document ID</FieldLabel>
            <Input
              name='phase-e-document-id'
              value={state.documentId}
              disabled={disabled}
              autoComplete='off'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onChange({
                  ...state,
                  documentId: event.target.value,
                  documentRevisionConfirmed: false,
                })
              }
            />
          </div>
          <div>
            <FieldLabel htmlFor='phase-e-revision'>Document revision</FieldLabel>
            <Input
              name='phase-e-revision'
              value={state.revision}
              disabled={disabled}
              autoComplete='off'
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onChange({
                  ...state,
                  revision: event.target.value,
                  documentRevisionConfirmed: false,
                })
              }
            />
          </div>
          <ConfirmLine
            id='phase-e-document-confirm'
            checked={state.documentRevisionConfirmed}
            disabled={disabled || (!state.documentRevisionConfirmed && !documentReady)}
            onChange={(documentRevisionConfirmed) =>
              onChange({
                ...state,
                documentRevisionConfirmed: documentRevisionConfirmed && documentReady,
              })
            }
          >
            Confirm the active DXF version.
          </ConfirmLine>
        </div>

        <div className='space-y-stack' data-assembly-order-readonly='true'>
          <Row label='existing operation' value={`#${proposal.operation.sourceOperationNumber}`} />
          <Row
            label='authoring operation ID'
            value={proposal.operation.authoringOperationId ?? '! unavailable'}
          />
          <Row label='existing order' value={proposal.operation.order} />
          <Row label='work' value={proposal.operation.work} />
          <Row label='output' value={proposal.operation.outputUnitName} />
          <div>
            <FieldLabel htmlFor='phase-e-operation-stage'>Assembly stage</FieldLabel>
            <Input
              name='phase-e-operation-stage'
              type='number'
              min={0}
              step={1}
              value={state.operationStage ?? ''}
              disabled={disabled}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onChange({
                  ...state,
                  operationStage: parseFiniteNumber(event.target.value),
                  operationConfirmed: false,
                })
              }
            />
          </div>
          <ConfirmLine
            id='phase-e-operation-confirm'
            checked={state.operationConfirmed}
            disabled={disabled || !operationReady}
            onChange={(operationConfirmed) =>
              onChange({ ...state, operationConfirmed: operationConfirmed && operationReady })
            }
          >
            Confirm this operation and its assembly stage. Order cannot be edited here.
          </ConfirmLine>
        </div>

        <div className='space-y-stack'>
          {(
            [
              ['endpointMm', 'Endpoint tolerance (mm)', 1_000],
              ['fullLengthMm', 'Full-length tolerance (mm)', 1_000_000],
              ['fullLengthRelative', 'Relative tolerance (0…1)', 1],
            ] as const
          ).map(([field, label, maximum]) => (
            <div key={field}>
              <FieldLabel htmlFor={`phase-e-${field}`}>{label}</FieldLabel>
              <Input
                name={`phase-e-${field}`}
                type='number'
                min={0}
                max={maximum}
                step='any'
                value={state.tolerance[field] ?? ''}
                disabled={disabled}
                aria-invalid={
                  state.tolerance[field] !== null &&
                  (state.tolerance[field] < 0 || state.tolerance[field] > maximum)
                }
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  onChange({
                    ...state,
                    tolerance: {
                      ...state.tolerance,
                      [field]: parseFiniteNumber(event.target.value),
                      confirmed: false,
                    },
                  })
                }
              />
            </div>
          ))}
          <ConfirmLine
            id='phase-e-tolerance-confirm'
            checked={state.tolerance.confirmed}
            disabled={disabled || (!state.tolerance.confirmed && !toleranceReady)}
            onChange={(confirmed) =>
              onChange({
                ...state,
                tolerance: { ...state.tolerance, confirmed: confirmed && toleranceReady },
              })
            }
          >
            Confirm all three tolerances. Mapping is equal with ratio 1 in V1.
          </ConfirmLine>
        </div>
      </div>
    </div>
  );
}

export function PatternImportDxfProductPhaseEWorkbenchV1({
  catalog,
  projection,
  proposal,
  proposalSource,
  state,
  materialOptions,
  activeSide,
  onActiveSideChange,
  onStateChange,
  onConfirm,
  disabled,
}: PatternImportDxfProductPhaseEWorkbenchPropsV1) {
  const result = derivePatternImportDxfProductPhaseEWorkbenchResultV1({
    catalog,
    projection,
    proposal,
    proposalSource,
    state,
    materialOptions,
  });
  const sourceCurrent = proposalSource.confirmed && !proposalSource.stale;
  const activeIndex = activeSide === 'A' ? 0 : 1;
  return (
    <Section
      title='Assembly workbench'
      question='Inspect the selected seam and confirm exact edge IDs.'
      action={
        <HeaderNote tone={result.ok ? 'ok' : 'warn'}>
          {result.ok ? 'ready to save' : `${result.blockers.length} blocking`}
        </HeaderNote>
      }
      className='min-w-0'
    >
      <div className='flex flex-wrap items-center gap-2' aria-label='existing assembly selection'>
        <Pill tone={sourceCurrent ? 'ok' : 'attention'}>
          {sourceCurrent ? '✓ confirmed current seam' : '! source confirmation required'}
        </Pill>
        <Pill tone='ink'>op #{proposal.operation.sourceOperationNumber}</Pill>
        <Text component='p' size='micro'>
          {proposal.operation.work} · seam {proposal.seam.id} · size {proposal.seam.anchoredSize}
        </Text>
        <Text component='p' size='micro' variant='label'>
          Existing topology and order are read only. V1: 2 pieces, 1 equal seam.
        </Text>
      </div>

      <div className='grid min-h-120 gap-gutter lg:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)]'>
        <GeometryCanvas
          projection={projection}
          proposal={proposal}
          state={state}
          activeSide={activeSide}
          onActiveSideChange={onActiveSideChange}
          onStateChange={onStateChange}
          disabled={disabled}
        />
        <aside className='min-w-0 lg:border-l lg:border-hairline lg:pl-block'>
          <SideInspector
            index={activeIndex}
            catalog={catalog}
            proposal={proposal}
            state={state}
            materialOptions={materialOptions}
            disabled={disabled}
            onChange={onStateChange}
          />
        </aside>
      </div>

      <AuthorityStrip
        proposal={proposal}
        state={state}
        disabled={disabled}
        onChange={onStateChange}
      />

      {!result.ok && (
        <div id='phase-e-workbench-blockers' role='status' aria-live='polite'>
          <CalloutBox tone='error'>
            <Text component='p' className='font-bold'>
              ! Assembly update blocked
            </Text>
            <ul className='mt-1 list-square space-y-1 pl-4'>
              {result.blockers.map((blocker, index) => (
                <li key={`${blocker.code}:${index}`}>
                  <Text component='span' size='micro'>
                    {blocker.detail} [{blocker.code}]
                  </Text>
                </li>
              ))}
            </ul>
          </CalloutBox>
        </div>
      )}

      <div className='flex flex-wrap items-center justify-between gap-2 border-t border-textColor pt-2'>
        <Text component='p' size='micro' variant={result.ok ? 'label' : 'errorLabel'}>
          {result.ok
            ? '✓ Exact edge choices are ready. Nothing has been saved.'
            : '! Resolve every blocker before saving the assembly update.'}
        </Text>
        <Button
          type='button'
          variant='main'
          size='lg'
          disabled={disabled || !result.ok}
          aria-describedby={!result.ok ? 'phase-e-workbench-blockers' : undefined}
          onClick={() => {
            if (result.ok) onConfirm(result);
          }}
        >
          Confirm assembly update
        </Button>
      </div>
    </Section>
  );
}
