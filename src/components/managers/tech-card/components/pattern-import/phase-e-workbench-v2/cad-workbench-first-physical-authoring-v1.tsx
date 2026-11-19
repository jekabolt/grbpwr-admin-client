import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button, Input, Select, Text } from 'ui';
import type {
  SavedV7PlacementChangeV1,
  SavedV7PlacementEditV1,
  SavedV7WorldRotationAxisV1,
} from 'components/cloth-simulation-spike/saved-generic-durable-physical-host-v1';

import {
  savedFullAssemblyFirstContourRoleV1,
  type SavedFullAssemblyGenericFirstCompileChoicesV1,
} from './saved-full-assembly-generic-first-bootstrap-v1';
import type { SavedFullAssemblyTablePiecePlacementV1 } from './saved-full-assembly-generic-first-authoring-v1';
import type { useSavedClothPhysicalHostV1 } from './use-saved-cloth-physical-host-v1';

type HostState = ReturnType<typeof useSavedClothPhysicalHostV1>;
type CompileChoices = SavedFullAssemblyGenericFirstCompileChoicesV1;

type SideDraft = {
  pieceId: string;
  contourId: string;
  start: string;
  end: string;
  direction: '' | 'forward' | 'reverse';
};
type SeamDraft = { sides: [SideDraft, SideDraft] };

const emptySide = (): SideDraft => ({
  pieceId: '',
  contourId: '',
  start: '',
  end: '',
  direction: '',
});

const finite = (value: string, positive = false): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (positive && parsed <= 0)) return null;
  return parsed === 0 ? 0 : parsed;
};

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className='mb-1 block text-labelColor text-small'>
      {children}
    </label>
  );
}

function NumberField({
  name,
  label,
  value,
  onChange,
  disabled,
  readOnly,
}: Readonly<{
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}>) {
  return (
    <div>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        name={name}
        type='number'
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        autoComplete='off'
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </div>
  );
}

function CompileAuthoring({ state, disabled }: { state: HostState; disabled: boolean }) {
  const authoring = state.firstAuthoring;
  const bootstrap = authoring.bootstrap;
  const [seams, setSeams] = useState<Record<string, SeamDraft>>({});
  const [profileKey, setProfileKey] = useState('');
  const [confirmedPressSource, setConfirmedPressSource] = useState<string>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bootstrap) return;
    setSeams(
      Object.fromEntries(
        bootstrap.seams.map(({ seamKey }) => {
          const existing = bootstrap.existingExactSeamChoices.find(
            (choice) => choice.sourceSeamKey === seamKey,
          );
          const fromExisting = (index: 0 | 1): SideDraft => ({
            pieceId: existing!.sides[index].pieceId,
            contourId: existing!.sides[index].contourId,
            start: existing!.sides[index].anchors[0],
            end: existing!.sides[index].anchors[1],
            direction: existing!.sides[index].direction,
          });
          const sides: [SideDraft, SideDraft] = existing
            ? [fromExisting(0), fromExisting(1)]
            : [emptySide(), emptySide()];
          return [seamKey, { sides }];
        }),
      ),
    );
    setProfileKey('');
    setConfirmedPressSource(undefined);
    setError(null);
  }, [bootstrap]);

  if (!bootstrap) return null;
  const busy = disabled || authoring.status === 'compiling';

  const setSide = (seamKey: string, index: 0 | 1, next: SideDraft) =>
    setSeams((current) => ({
      ...current,
      [seamKey]: {
        ...current[seamKey]!,
        sides:
          index === 0 ? [next, current[seamKey]!.sides[1]] : [current[seamKey]!.sides[0], next],
      },
    }));

  const submit = () => {
    try {
      const profile = bootstrap.diagnosticProfiles.find(
        ({ id, revision }) => `${id}@${revision}` === profileKey,
      );
      if (!profile) throw new Error('Choose a diagnostic preview profile.');
      const seamChoices = bootstrap.seams.map(({ seamKey, pieceLineKeys }) => {
        const draft = seams[seamKey];
        const side = (side: SideDraft, index: 0 | 1) => {
          if (
            !side.pieceId ||
            !side.contourId ||
            !side.start ||
            !side.end ||
            side.start === side.end ||
            !side.direction
          )
            throw new Error(`Seam ${seamKey} side ${index + 1} is incomplete.`);
          return {
            pieceId: side.pieceId,
            pieceLineKey: pieceLineKeys[index]!,
            contourId: side.contourId,
            anchors: [side.start, side.end] as const,
            direction: side.direction,
          };
        };
        const sides: CompileChoices['seamChoices'][number]['sides'] = [
          side(draft.sides[0], 0),
          side(draft.sides[1], 1),
        ];
        return { sourceSeamKey: seamKey, sides };
      });
      setError(null);
      void state.compileFirstAuthoring({
        seamChoices,
        ...(confirmedPressSource ? { confirmedPressSource } : {}),
        diagnosticProfile: { id: profile.id, revision: profile.revision },
      });
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Physical authoring is incomplete.',
      );
    }
  };

  return (
    <div className='space-y-stack' data-cad-first-compile-authoring=''>
      <Text component='p' size='micro' variant='label'>
        Exact DXF + Assembly Order · confirm every sewing edge, then choose a diagnostic preview.
      </Text>

      {bootstrap.recordedOrder && (
        <div className='space-y-stack'>
          {bootstrap.recordedPressNote && <Text>{bootstrap.recordedPressNote}</Text>}
          <Button
            type='button'
            size='xs'
            variant={confirmedPressSource ? 'main' : 'secondary'}
            aria-pressed={!!confirmedPressSource}
            disabled={busy}
            onClick={() =>
              setConfirmedPressSource(
                confirmedPressSource
                  ? undefined
                  : bootstrap.recordedOrder![1].canonicalSourceOperation,
              )
            }
          >
            Keep press #{bootstrap.recordedOrder[1].sourceOperationNumber} in the production order
            only
          </Button>
        </div>
      )}
      {bootstrap.seams.map(({ seamKey, pieceLineKeys }) => {
        const draft = seams[seamKey];
        return (
          <div key={seamKey} className='space-y-2 border-t border-hairline pt-2'>
            <Text component='p' size='micro'>
              {seamKey}
              {bootstrap.existingExactSeamChoices.some((choice) => choice.sourceSeamKey === seamKey)
                ? ' · restored exact edges'
                : ''}
            </Text>
            {([0, 1] as const).map((index) => {
              const side = draft?.sides[index] ?? emptySide();
              const pieces = bootstrap.catalog.pieces.filter(
                ({ pieceLineKey }) => pieceLineKey === pieceLineKeys[index],
              );
              const piece = pieces.find(({ pieceId }) => pieceId === side.pieceId);
              const contours =
                piece?.contours.filter(
                  ({ role }) =>
                    role === savedFullAssemblyFirstContourRoleV1(bootstrap.sourceSurface),
                ) ?? [];
              const contour = contours.find(({ contourId }) => contourId === side.contourId);
              const vertices = contour?.boundaryVertices ?? [];
              return (
                <div key={index} className='grid grid-cols-2 gap-2'>
                  <div className='col-span-2'>
                    <Text component='span' size='nano' variant='label'>
                      Side {index + 1} · {pieceLineKeys[index]}
                    </Text>
                  </div>
                  <Select
                    name={`physical-piece-${seamKey}-${index}`}
                    aria-label={`${seamKey} side ${index + 1} piece`}
                    placeholder='piece'
                    value={side.pieceId || undefined}
                    items={pieces.map(({ pieceId }) => ({ value: pieceId, label: pieceId }))}
                    readOnly={busy}
                    onValueChange={(pieceId) =>
                      setSide(seamKey, index, { ...emptySide(), pieceId })
                    }
                  />
                  <Select
                    name={`physical-contour-${seamKey}-${index}`}
                    aria-label={`${seamKey} side ${index + 1} contour`}
                    placeholder='sewing contour'
                    value={side.contourId || undefined}
                    items={contours.map(({ contourId }) => ({
                      value: contourId,
                      label: contourId,
                    }))}
                    readOnly={busy || !piece}
                    onValueChange={(contourId) =>
                      setSide(seamKey, index, { ...side, contourId, start: '', end: '' })
                    }
                  />
                  <Select
                    name={`physical-start-${seamKey}-${index}`}
                    aria-label={`${seamKey} side ${index + 1} start vertex`}
                    placeholder='start vertex'
                    value={side.start || undefined}
                    items={vertices.map(({ vertexId }) => ({ value: vertexId, label: vertexId }))}
                    readOnly={busy || !contour}
                    onValueChange={(start) => setSide(seamKey, index, { ...side, start })}
                  />
                  <Select
                    name={`physical-end-${seamKey}-${index}`}
                    aria-label={`${seamKey} side ${index + 1} end vertex`}
                    placeholder='end vertex'
                    value={side.end || undefined}
                    items={vertices.map(({ vertexId }) => ({ value: vertexId, label: vertexId }))}
                    readOnly={busy || !contour}
                    onValueChange={(end) => setSide(seamKey, index, { ...side, end })}
                  />
                  <Select
                    name={`physical-direction-${seamKey}-${index}`}
                    aria-label={`${seamKey} side ${index + 1} direction`}
                    placeholder='direction'
                    value={side.direction || undefined}
                    items={[
                      { value: 'forward', label: 'forward' },
                      { value: 'reverse', label: 'reverse' },
                    ]}
                    readOnly={busy}
                    onValueChange={(direction) =>
                      setSide(seamKey, index, {
                        ...side,
                        direction: direction as SideDraft['direction'],
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        );
      })}

      <div className='space-y-1 border-t border-hairline pt-2'>
        <FieldLabel htmlFor='physical-diagnostic-profile'>Preview material</FieldLabel>
        <Select
          name='physical-diagnostic-profile'
          aria-label='Diagnostic preview profile'
          placeholder='choose diagnostic profile'
          value={profileKey || undefined}
          items={bootstrap.diagnosticProfiles.map(({ id, revision, label }) => ({
            value: `${id}@${revision}`,
            label: `${label} · v${revision}`,
          }))}
          readOnly={busy}
          onValueChange={setProfileKey}
        />
        <Text component='p' size='nano' variant='label'>
          {bootstrap.diagnosticProfiles.find(
            ({ id, revision }) => `${id}@${revision}` === profileKey,
          )?.description ?? 'Visual diagnostic only — not measured fabric or fit approval.'}
        </Text>
      </div>
      {error ? (
        <Text component='p' size='micro' variant='errorLabel'>
          {error}
        </Text>
      ) : null}
      <Button
        type='button'
        size='xs'
        variant='main'
        disabled={
          busy ||
          (!!bootstrap.recordedOrder &&
            confirmedPressSource !== bootstrap.recordedOrder[1].canonicalSourceOperation)
        }
        onClick={submit}
      >
        {authoring.status === 'compiling' ? 'Compiling…' : 'Compile exact assembly'}
      </Button>
    </div>
  );
}

type PlacementDraft = {
  contourId: string;
  vertexId: string;
  rx: string;
  ry: string;
  rz: string;
  x: string;
  y: string;
  z: string;
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const clean = (value: number) => (Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value);
function rotation(rxDegrees: number, ryDegrees: number, rzDegrees: number) {
  const [x, y, z] = [radians(rxDegrees), radians(ryDegrees), radians(rzDegrees)];
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x),
    Math.sin(x),
    Math.cos(y),
    Math.sin(y),
    Math.cos(z),
    Math.sin(z),
  ];
  return [
    clean(cz * cy),
    clean(cz * sy * sx - sz * cx),
    clean(cz * sy * cx + sz * sx),
    clean(sz * cy),
    clean(sz * sy * sx + cz * cx),
    clean(sz * sy * cx - cz * sx),
    clean(-sy),
    clean(cy * sx),
    clean(cy * cx),
  ] as SavedFullAssemblyTablePiecePlacementV1['rotationRowMajor'];
}

function PlacementAuthoring({ state, disabled }: { state: HostState; disabled: boolean }) {
  const authoring = state.firstAuthoring;
  const geometry = authoring.sourceGeometry;
  const [drafts, setDrafts] = useState<Record<string, PlacementDraft>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!geometry) return;
    setDrafts(
      Object.fromEntries(
        geometry.pieces.map(({ pieceId }) => [
          pieceId,
          { contourId: '', vertexId: '', rx: '', ry: '', rz: '', x: '', y: '', z: '' },
        ]),
      ),
    );
    setError(null);
  }, [geometry]);
  if (!geometry) return null;
  const saving = authoring.status === 'saving';
  const retrying = authoring.status === 'save-retry';
  const busy = disabled || saving || retrying;
  const submit = () => {
    try {
      const placements = geometry.pieces.map((piece) => {
        const draft = drafts[piece.pieceId];
        const contour = piece.contours.find(({ contourId }) => contourId === draft?.contourId);
        const pivot = contour?.vertices.find(({ vertexId }) => vertexId === draft?.vertexId);
        const values = [draft?.rx, draft?.ry, draft?.rz, draft?.x, draft?.y, draft?.z].map(
          (value) => finite(value ?? ''),
        );
        if (!pivot || values.some((value) => value === null))
          throw new Error(`Complete pivot, rotation, and translation for ${piece.pieceId}.`);
        return {
          pieceId: piece.pieceId,
          pieceLineKey: piece.pieceLineKey,
          pivot: {
            contourId: contour!.contourId,
            vertexId: pivot.vertexId,
            positionMm: pivot.positionMm,
            positionM: pivot.positionM,
          },
          rotationRowMajor: rotation(values[0]!, values[1]!, values[2]!),
          translationM: [values[3]!, values[4]!, values[5]!] as const,
        };
      });
      setError(null);
      void state.saveFirstAuthoring(placements);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Placement authoring is incomplete.',
      );
    }
  };
  return (
    <div className='space-y-stack' data-cad-first-placement-authoring=''>
      <Text component='p' size='micro' variant='label'>
        Select an exact source pivot. Enter rotation in degrees and world position in metres. +X
        points to the mannequin’s left, +Y up and +Z forward.
      </Text>
      {geometry.pieces.map((piece) => {
        const draft = drafts[piece.pieceId] ?? {
          contourId: '',
          vertexId: '',
          rx: '',
          ry: '',
          rz: '',
          x: '',
          y: '',
          z: '',
        };
        const contour = piece.contours.find(({ contourId }) => contourId === draft.contourId);
        const update = (change: Partial<PlacementDraft>) =>
          setDrafts((current) => ({ ...current, [piece.pieceId]: { ...draft, ...change } }));
        return (
          <div key={piece.pieceId} className='space-y-2 border-t border-hairline pt-2'>
            <Text component='p' size='micro'>
              {piece.pieceId} · {piece.pieceLineKey}
            </Text>
            <div className='grid grid-cols-2 gap-2'>
              <Select
                name={`placement-contour-${piece.pieceId}`}
                aria-label={`${piece.pieceId} pivot contour`}
                placeholder='pivot contour'
                value={draft.contourId || undefined}
                items={piece.contours.map(({ contourId }) => ({
                  value: contourId,
                  label: contourId,
                }))}
                readOnly={busy}
                onValueChange={(contourId) => update({ contourId, vertexId: '' })}
              />
              <Select
                name={`placement-vertex-${piece.pieceId}`}
                aria-label={`${piece.pieceId} pivot vertex`}
                placeholder='pivot vertex'
                value={draft.vertexId || undefined}
                items={(contour?.vertices ?? []).map(({ vertexId }) => ({
                  value: vertexId,
                  label: vertexId,
                }))}
                readOnly={busy || !contour}
                onValueChange={(vertexId) => update({ vertexId })}
              />
              <NumberField
                name={`placement-rx-${piece.pieceId}`}
                label='Rotate X °'
                value={draft.rx}
                onChange={(rx) => update({ rx })}
                disabled={busy}
              />
              <NumberField
                name={`placement-ry-${piece.pieceId}`}
                label='Rotate Y °'
                value={draft.ry}
                onChange={(ry) => update({ ry })}
                disabled={busy}
              />
              <NumberField
                name={`placement-rz-${piece.pieceId}`}
                label='Rotate Z °'
                value={draft.rz}
                onChange={(rz) => update({ rz })}
                disabled={busy}
              />
              <div />
              <NumberField
                name={`placement-x-${piece.pieceId}`}
                label='Translate X m'
                value={draft.x}
                onChange={(x) => update({ x })}
                disabled={busy}
              />
              <NumberField
                name={`placement-y-${piece.pieceId}`}
                label='Translate Y m'
                value={draft.y}
                onChange={(y) => update({ y })}
                disabled={busy}
              />
              <NumberField
                name={`placement-z-${piece.pieceId}`}
                label='Translate Z m'
                value={draft.z}
                onChange={(z) => update({ z })}
                disabled={busy}
              />
            </div>
          </div>
        );
      })}
      {error ?? authoring.error ? (
        <Text component='p' size='micro' variant='errorLabel'>
          {error ?? authoring.error}
        </Text>
      ) : null}
      <Button
        type='button'
        size='xs'
        variant='main'
        disabled={disabled || saving}
        onClick={retrying ? state.retryFirstPlacementSave : submit}
      >
        {saving ? 'Saving…' : retrying ? 'Retry save placement' : 'Save placement'}
      </Button>
    </div>
  );
}

/** Explicit first-V7 authoring, shown only after the operator opens it from the compact control. */
export function CadWorkbenchFirstPhysicalAuthoringV1({
  state,
  disabled = false,
}: {
  state: HostState;
  disabled?: boolean;
}) {
  const authoring = state.firstAuthoring;
  if (authoring.status === 'idle') return null;
  return (
    <div
      className='pointer-events-auto absolute top-10 right-2 bottom-2 w-[min(28rem,calc(100%-1rem))] overflow-y-auto border border-borderColor bg-bgColor p-3'
      data-cad-first-physical-authoring={authoring.status}
    >
      <div className='mb-2 flex items-center justify-between gap-2'>
        <Text component='p' size='small'>
          Physical setup
        </Text>
        <Button
          type='button'
          size='xs'
          variant='secondary'
          disabled={
            disabled ||
            authoring.status === 'preparing' ||
            authoring.status === 'compiling' ||
            authoring.status === 'saving'
          }
          onClick={state.retry}
        >
          Close
        </Button>
      </div>
      {authoring.status === 'preparing' ? (
        <Text component='p' size='micro' variant='label'>
          Reading exact DXF and Assembly Order…
        </Text>
      ) : null}
      {authoring.status === 'compile-required' || authoring.status === 'compiling' ? (
        <CompileAuthoring state={state} disabled={disabled} />
      ) : null}
      {authoring.status === 'placement-required' ||
      authoring.status === 'saving' ||
      authoring.status === 'save-retry' ? (
        <PlacementAuthoring state={state} disabled={disabled} />
      ) : null}
      {authoring.status === 'blocked' ? (
        <div className='space-y-2'>
          <Text component='p' size='micro' variant='errorLabel'>
            {authoring.error}
          </Text>
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={disabled}
            onClick={() => void state.startFirstAuthoring()}
          >
            Restart setup
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const SAVED_ASSEMBLY_TURNS = [
  { label: 'Rotate assembly +90° about world Y', change: { kind: 'quarter-turn-world-y' } },
  {
    label: 'Rotate assembly +90° about world X',
    change: { kind: 'rotate-assembly-world', axis: 'X', degrees: 90 },
  },
  {
    label: 'Flip assembly front to back',
    change: { kind: 'rotate-assembly-world', axis: 'Y', degrees: 180 },
  },
] as const satisfies readonly { label: string; change: SavedV7PlacementChangeV1 }[];

function SavedPlacementFields({
  draft,
  state,
  disabled,
  status,
}: {
  draft: SavedV7PlacementEditV1;
  state: HostState;
  disabled: boolean;
  status: 'editing' | 'saving' | 'save-retry' | 'blocked';
}) {
  const [values, setValues] = useState(() =>
    draft.pieces.map(({ translationM }) => translationM.map(String)),
  );
  const [assemblyTurn, setAssemblyTurn] = useState<(typeof SAVED_ASSEMBLY_TURNS)[number] | null>(
    null,
  );
  const rotate = assemblyTurn !== null;
  const [pieceId, setPieceId] = useState('');
  const [axis, setAxis] = useState<SavedV7WorldRotationAxisV1 | ''>('');
  const [angle, setAngle] = useState('');
  const parsed = values.map((entry) => entry.map((value) => finite(value)));
  const complete = parsed.every((entry) => entry.every((value) => value !== null));
  const translationChanged = parsed.some((entry, index) =>
    entry.some((value, axis) => value !== draft.pieces[index]!.translationM[axis]),
  );
  const piece = draft.pieces.find((entry) => entry.pieceId === pieceId);
  const degrees = finite(angle);
  const hasAngle = angle.trim() !== '';
  let change: SavedV7PlacementChangeV1 | null = null;
  if (assemblyTurn) change = assemblyTurn.change;
  else if (!translationChanged && piece && axis && degrees !== null && degrees % 360 !== 0)
    change = {
      kind: 'rotate-piece-world',
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      axis,
      degrees,
    };
  else if (!hasAngle && complete && translationChanged)
    change = {
      kind: 'translate',
      pieces: draft.pieces.map((entry, index) => ({
        ...entry,
        translationM: [parsed[index]![0]!, parsed[index]![1]!, parsed[index]![2]!],
      })),
    };
  const saving = status === 'saving';
  const busy = disabled || saving;
  const readOnly = status !== 'editing';
  const rotationReadOnly = busy || readOnly || rotate || translationChanged;
  return (
    <div className='space-y-stack'>
      <Text component='p' size='micro' variant='label'>
        World translation in metres.
      </Text>
      <div className='space-y-2'>
        <div className='flex flex-wrap gap-2'>
          {SAVED_ASSEMBLY_TURNS.map((turn) => (
            <Button
              key={turn.label}
              type='button'
              size='xs'
              variant={assemblyTurn === turn ? 'main' : 'secondary'}
              aria-pressed={assemblyTurn === turn}
              disabled={busy || readOnly || translationChanged || hasAngle}
              onClick={() => {
                if (busy || readOnly || translationChanged || hasAngle) return;
                setAssemblyTurn((selected) => (selected === turn ? null : turn));
              }}
            >
              {turn.label}
            </Button>
          ))}
        </div>
        <Text component='p' size='micro' variant='label'>
          Rotation pivot: {draft.pieces[0]?.pieceId}
        </Text>
      </div>
      <div className='space-y-2 border-t border-hairline pt-2'>
        <Text component='p' size='micro'>
          Rotate one piece at its saved pivot
        </Text>
        <div className='grid grid-cols-2 gap-2'>
          <Select
            name='saved-placement-rotate-piece'
            aria-label='Piece to rotate'
            placeholder='Choose piece'
            value={pieceId || undefined}
            items={draft.pieces.map((entry) => ({ value: entry.pieceId, label: entry.pieceId }))}
            readOnly={rotationReadOnly}
            onValueChange={(next) => {
              if (!rotationReadOnly) setPieceId(next);
            }}
          />
          <Select
            name='saved-placement-rotate-axis'
            aria-label='World rotation axis'
            placeholder='World axis'
            value={axis || undefined}
            items={(['X', 'Y', 'Z'] as const).map((value) => ({ value, label: value }))}
            readOnly={rotationReadOnly}
            onValueChange={(next) => {
              if (!rotationReadOnly && (next === 'X' || next === 'Y' || next === 'Z'))
                setAxis(next);
            }}
          />
        </div>
        <NumberField
          name='saved-placement-rotate-degrees'
          label='Rotation change (°)'
          value={angle}
          readOnly={rotationReadOnly}
          onChange={(next) => {
            if (!rotationReadOnly) setAngle(next);
          }}
        />
        <Text component='p' size='micro' variant='label'>
          Sewn edges must stay aligned.
        </Text>
      </div>
      {draft.pieces.map(({ pieceId, pieceLineKey }, index) => (
        <div key={pieceId} className='space-y-2 border-t border-hairline pt-2'>
          <Text component='p' size='micro'>
            {pieceId} · {pieceLineKey}
          </Text>
          <div className='grid grid-cols-3 gap-2'>
            {(['X', 'Y', 'Z'] as const).map((axis, component) => (
              <NumberField
                key={axis}
                name={`saved-placement-${pieceId}-${axis}`}
                label={`${pieceId} ${axis} (m)`}
                value={values[index]![component]!}
                disabled={busy}
                readOnly={readOnly || rotate || hasAngle}
                onChange={(value) => {
                  if (readOnly || rotate || hasAngle) return;
                  setValues((current) =>
                    current.map((entry, i) =>
                      i === index
                        ? entry.map((previous, j) => (j === component ? value : previous))
                        : entry,
                    ),
                  );
                }}
              />
            ))}
          </div>
        </div>
      ))}
      {status !== 'blocked' ? (
        <Button
          type='button'
          size='xs'
          variant='main'
          disabled={busy || !change}
          onClick={() => {
            if (!busy && change) void state.saveSavedPlacementEdit(draft, change);
          }}
        >
          {saving ? 'Saving…' : status === 'save-retry' ? 'Retry save placement' : 'Save placement'}
        </Button>
      ) : null}
    </div>
  );
}

export function CadWorkbenchSavedPlacementEditorV1({
  state,
  disabled,
}: {
  state: HostState;
  disabled: boolean;
}) {
  const editor = state.placementEditor;
  if (!editor || editor.status === 'idle') return null;
  return (
    <section
      aria-label='Saved physical placement'
      className='pointer-events-auto absolute top-10 right-2 bottom-2 w-[min(28rem,calc(100%-1rem))] overflow-y-auto border border-borderColor bg-bgColor p-3'
      data-cad-saved-placement-editor={editor.status}
    >
      <div className='mb-2 flex items-center justify-between gap-2'>
        <Text component='p' size='small'>
          Saved placement
        </Text>
        <Button
          type='button'
          size='xs'
          variant='secondary'
          disabled={editor.status === 'saving'}
          onClick={state.cancelSavedPlacementEdit}
        >
          Close
        </Button>
      </div>
      {editor.status === 'preparing' ? (
        <Text component='p' size='micro' role='status'>
          Verifying saved placement…
        </Text>
      ) : null}
      {editor.error ? (
        <Text component='p' size='micro' role='alert' variant='errorLabel'>
          {editor.error}
        </Text>
      ) : null}
      {editor.draft ? (
        <SavedPlacementFields
          key={editor.draft.binding.outerSha256}
          state={state}
          draft={editor.draft}
          disabled={disabled}
          status={editor.status}
        />
      ) : null}
      {editor.status === 'blocked' || editor.status === 'save-retry' ? (
        <Button type='button' size='xs' variant='secondary' onClick={state.retry}>
          Reload saved cloth
        </Button>
      ) : null}
    </section>
  );
}
