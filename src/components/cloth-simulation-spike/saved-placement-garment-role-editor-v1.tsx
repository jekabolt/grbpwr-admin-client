import { useMemo, useState } from 'react';
import { GroupLabel, Select, Text } from 'ui';
import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1,
  listQualifiedTwoPanelBoundaryCurvesV1,
  previewQualifiedTwoPanelBoundaryCurvesV1,
  selectQualifiedTwoPanelBoundarySpanV1,
  qualifiedTwoPanelPlacementAuthoringInternalsV1,
  type QualifiedTwoPanelBoundaryRoleV1,
  type QualifiedTwoPanelCurveSpanV1,
  type QualifiedTwoPanelGarmentRoleDraftV1,
} from './qualified-two-panel-placement-authoring-v1';

const roleLabels: Record<QualifiedTwoPanelBoundaryRoleV1, string> = {
  waist: 'Waist',
  hem: 'Hem',
  leftSeam: 'Left seam',
  rightSeam: 'Right seam',
};

export function SavedPlacementChoiceV1({
  label,
  name,
  value,
  items,
  disabled,
  onChange,
  allowEmpty = true,
}: {
  label: string;
  name: string;
  value: string;
  items: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className='flex min-w-0 flex-col gap-1' data-placement-choice={name}>
      <Text component='span' variant='label'>
        {label}
      </Text>
      <Select
        name={name}
        value={value}
        items={[...(allowEmpty ? [{ value: '', label: 'Choose…' }] : []), ...items]}
        onValueChange={onChange}
        disabled={disabled}
        fullWidth
        className='w-full min-w-0'
      />
    </label>
  );
}

function BoundaryPreview({
  projection,
  pieceId,
  spans,
  locked,
  onChoose,
}: {
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  pieceId: string;
  spans: Record<QualifiedTwoPanelBoundaryRoleV1, QualifiedTwoPanelCurveSpanV1>;
  locked: boolean;
  onChoose: (
    role: QualifiedTwoPanelBoundaryRoleV1,
    endpoint: 'firstCurveKey' | 'lastCurveKey',
    key: string,
  ) => void;
}) {
  const [role, setRole] = useState<QualifiedTwoPanelBoundaryRoleV1>('waist');
  const [endpoint, setEndpoint] = useState<'firstCurveKey' | 'lastCurveKey'>('firstCurveKey');
  const preview = useMemo(() => {
    try {
      return pieceId ? previewQualifiedTwoPanelBoundaryCurvesV1(projection, pieceId) : null;
    } catch {
      return null;
    }
  }, [projection, pieceId]);
  const highlight = new Set<string>();
  const span = spans[role];
  try {
    for (const id of selectQualifiedTwoPanelBoundarySpanV1(projection, pieceId, span)
      .sourceCurveIds)
      highlight.add(id);
  } catch {
    /* Incomplete spans still show their explicitly selected endpoint paths. */
  }
  const pick = (key: string) => {
    if (locked) return;
    onChoose(role, endpoint, key);
    if (endpoint === 'firstCurveKey') setEndpoint('lastCurveKey');
  };
  if (!preview)
    return <Text variant='label'>Choose a piece to inspect its exact source curves.</Text>;
  return (
    <div className='flex min-w-0 flex-col gap-stack'>
      <div className='grid grid-cols-1 gap-stack sm:grid-cols-2'>
        <SavedPlacementChoiceV1
          name={`${pieceId}-preview-role`}
          label='Click assigns boundary'
          value={role}
          items={QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1.map((value) => ({
            value,
            label: roleLabels[value],
          }))}
          allowEmpty={false}
          disabled={locked}
          onChange={(value) => setRole(value as QualifiedTwoPanelBoundaryRoleV1)}
        />
        <SavedPlacementChoiceV1
          name={`${pieceId}-preview-endpoint`}
          label='Click sets endpoint'
          value={endpoint}
          items={[
            { value: 'firstCurveKey', label: 'First curve' },
            { value: 'lastCurveKey', label: 'Last curve' },
          ]}
          allowEmpty={false}
          disabled={locked}
          onChange={(value) => setEndpoint(value as 'firstCurveKey' | 'lastCurveKey')}
        />
      </div>
      <svg
        viewBox={preview.viewBox}
        className='h-56 w-full bg-pageBg'
        aria-label={`${pieceId} exact boundary curves`}
      >
        {preview.paths.map((path, index) => {
          const selected =
            highlight.has(path.sourceCurveId) ||
            path.key === span.firstCurveKey ||
            path.key === span.lastCurveKey;
          return (
            <g key={path.key} className='group'>
              <path
                d={path.d}
                fill='none'
                vectorEffect='non-scaling-stroke'
                strokeWidth={selected ? 3 : 1}
                className={
                  selected
                    ? 'stroke-highlightColor'
                    : 'stroke-textColor group-hover:stroke-highlightColor'
                }
              />
              <path
                d={path.d}
                fill='none'
                stroke='transparent'
                strokeWidth={10}
                vectorEffect='non-scaling-stroke'
                data-source-curve-id={path.sourceCurveId}
                data-contour-id={path.contourId}
                role='button'
                tabIndex={locked ? -1 : 0}
                aria-disabled={locked}
                aria-label={`${index + 1}. ${path.sourceCurveId}, set ${endpoint === 'firstCurveKey' ? 'first' : 'last'} ${roleLabels[role]} curve`}
                className='cursor-pointer focus-visible:stroke-highlightColor focus-visible:outline-none'
                onClick={() => pick(path.key)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pick(path.key);
                  }
                }}
              >
                <title>{`${index + 1}. ${path.sourceCurveId}`}</title>
              </path>
            </g>
          );
        })}
      </svg>
      <Text variant='label'>
        Click a curve to set the chosen endpoint. Highlight shows {roleLabels[role].toLowerCase()}.
        Curve numbers match the lists below.
      </Text>
    </div>
  );
}

/** Exact source IDs are selected by the operator. Coordinates serve the SVG only. */
export function SavedPlacementGarmentRoleEditorV1({
  composerSnapshot,
  composerProjection,
  draft,
  locked,
  onChange,
  description = 'Choose the exact pieces, Assembly seams and source-curve spans. The reviewed annular profile supports FRONT and BACK with 40 waist curves, 50 hem curves and one curve per side seam.',
}: Readonly<{
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  composerProjection: PatternImportDxfProductGarmentMeshComposerProjectionV2;
  draft: QualifiedTwoPanelGarmentRoleDraftV1;
  locked: boolean;
  onChange: (
    update: (previous: QualifiedTwoPanelGarmentRoleDraftV1) => QualifiedTwoPanelGarmentRoleDraftV1,
  ) => void;
  description?: string;
}>) {
  const choices = useMemo(() => {
    try {
      return {
        front: draft.frontPieceId
          ? listQualifiedTwoPanelBoundaryCurvesV1(composerProjection, draft.frontPieceId)
          : [],
        back: draft.backPieceId
          ? listQualifiedTwoPanelBoundaryCurvesV1(composerProjection, draft.backPieceId)
          : [],
        error: null,
      };
    } catch (cause) {
      return {
        front: [],
        back: [],
        error: cause instanceof Error ? cause.message : 'Exact boundary curves are unavailable.',
      };
    }
  }, [composerProjection, draft.frontPieceId, draft.backPieceId]);
  const choosePiece = (side: 'front' | 'back', value: string) => {
    onChange((previous) => ({
      ...previous,
      [side === 'front' ? 'frontPieceId' : 'backPieceId']: value,
      boundaries: {
        ...previous.boundaries,
        [side]: qualifiedTwoPanelPlacementAuthoringInternalsV1.createRoleDraft(
          previous.composerCanonicalSha256,
        ).boundaries[side],
      },
    }));
  };
  const chooseSpan = (
    side: 'front' | 'back',
    role: QualifiedTwoPanelBoundaryRoleV1,
    patch: Partial<QualifiedTwoPanelCurveSpanV1>,
  ) => {
    onChange((previous) => ({
      ...previous,
      boundaries: {
        ...previous.boundaries,
        [side]: {
          ...previous.boundaries[side],
          [role]: { ...previous.boundaries[side][role], ...patch },
        },
      },
    }));
  };
  const pieceItems = composerSnapshot.assembly.pieceIds.map((value) => ({ value, label: value }));
  const seamItems = composerSnapshot.assembly.seamIds.map((value) => ({ value, label: value }));
  return (
    <>
      <GroupLabel>Garment roles</GroupLabel>
      <Text variant='label'>{description}</Text>
      <div className='grid grid-cols-1 gap-stack sm:grid-cols-2'>
        <SavedPlacementChoiceV1
          name='placement-front'
          label='Front piece'
          value={draft.frontPieceId}
          items={pieceItems}
          disabled={locked}
          onChange={(value) => choosePiece('front', value)}
        />
        <SavedPlacementChoiceV1
          name='placement-back'
          label='Back piece'
          value={draft.backPieceId}
          items={pieceItems}
          disabled={locked}
          onChange={(value) => choosePiece('back', value)}
        />
        <SavedPlacementChoiceV1
          name='placement-left'
          label='Left Assembly seam'
          value={draft.leftSeamId}
          items={seamItems}
          disabled={locked}
          onChange={(leftSeamId) => onChange((previous) => ({ ...previous, leftSeamId }))}
        />
        <SavedPlacementChoiceV1
          name='placement-right'
          label='Right Assembly seam'
          value={draft.rightSeamId}
          items={seamItems}
          disabled={locked}
          onChange={(rightSeamId) => onChange((previous) => ({ ...previous, rightSeamId }))}
        />
      </div>
      {(['front', 'back'] as const).map((side) => (
        <div key={side} className='min-w-0'>
          <GroupLabel>{side === 'front' ? 'Front boundaries' : 'Back boundaries'}</GroupLabel>
          <BoundaryPreview
            projection={composerProjection}
            pieceId={side === 'front' ? draft.frontPieceId : draft.backPieceId}
            spans={draft.boundaries[side]}
            locked={locked}
            onChoose={(role, endpoint, key) => chooseSpan(side, role, { [endpoint]: key })}
          />
          <div className='flex flex-col gap-stack'>
            {QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1.map((role) => {
              const span = draft.boundaries[side][role];
              const pieceId = side === 'front' ? draft.frontPieceId : draft.backPieceId;
              const items = choices[side].map((curve, index) => ({
                value: curve.key,
                label: `${index + 1}. ${curve.sourceCurveId}`,
              }));
              let selected = '';
              if (pieceId && span.firstCurveKey && span.lastCurveKey) {
                try {
                  const value = selectQualifiedTwoPanelBoundarySpanV1(
                    composerProjection,
                    pieceId,
                    span,
                  );
                  selected = `${value.sourceCurveIds.length} curves · ${value.boundaryVertexIndices.length} boundary vertices`;
                } catch (cause) {
                  selected = cause instanceof Error ? cause.message : 'Invalid span';
                }
              }
              return (
                <div key={role} className='flex min-w-0 flex-col gap-1'>
                  <Text>
                    {roleLabels[role]}
                    {selected ? ` · ${selected}` : ''}
                  </Text>
                  <div className='grid min-w-0 grid-cols-1 gap-stack sm:grid-cols-3'>
                    <SavedPlacementChoiceV1
                      name={`placement-${side}-${role}-first`}
                      label='First curve'
                      value={span.firstCurveKey}
                      items={items}
                      disabled={locked || !pieceId}
                      onChange={(firstCurveKey) => chooseSpan(side, role, { firstCurveKey })}
                    />
                    <SavedPlacementChoiceV1
                      name={`placement-${side}-${role}-last`}
                      label='Last curve'
                      value={span.lastCurveKey}
                      items={items}
                      disabled={locked || !pieceId}
                      onChange={(lastCurveKey) => chooseSpan(side, role, { lastCurveKey })}
                    />
                    <SavedPlacementChoiceV1
                      name={`placement-${side}-${role}-direction`}
                      label='Contour traversal'
                      allowEmpty={false}
                      value={span.traversal}
                      items={[
                        { value: 'forward', label: 'Forward' },
                        { value: 'reverse', label: 'Reverse' },
                      ]}
                      disabled={locked || !pieceId}
                      onChange={(value) => {
                        if (value === 'forward' || value === 'reverse')
                          chooseSpan(side, role, { traversal: value });
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {choices.error ? (
        <Text variant='errorLabel' role='alert'>
          {choices.error}
        </Text>
      ) : null}
    </>
  );
}

export function SavedAnnularPlacementProfileDetailsV1() {
  return (
    <>
      <Text variant='label'>
        Held at the waist, with 8 mm body clearance and 2 mm cloth thickness.
      </Text>
      <details className='max-w-prose'>
        <summary className='cursor-pointer'>Placement profile details</summary>
        <Text variant='label'>
          Waist / hem slant radii: 700 / 900 mm. Sector: 0.64 rad per piece. Local apex: (0, 0) mm.
          Front start ray: (cos 0.64, sin 0.64); back ray: its negative. Angular direction: −1. Left
          seam body anchor: 0 rad. Piece order: front, back, clockwise from above.
        </Text>
        <Text variant='label'>
          Parameter residuals: 0.01 mm / 0.000001 rad. Conical residual: 0.00000001 m. Stretch:
          0.01; area: 0.02; orientation: 0.999; warp / weft / shear: 0.01.
        </Text>
      </details>
    </>
  );
}
