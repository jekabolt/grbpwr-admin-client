// «SEAMS» GROUP OF A STEP CARD (assembly-schema T8, picker v2 owner OK 27.10): its own group, the
// door to the picker stands in the panel's head (`StepSeamsDoor`). Below it every stored seam is a
// step-picture tile with its two named, measured sides underneath and one quiet corner ×; removal
// deletes the card row only when no other step uses it. With nothing stored, the proposal is a dashed
// picture that opens the picker (a seam is stored only there, by hand), else red `no seam`.
// `?pick=<op number>` (a PDF-gap deep link) opens the picker on arrival.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { activeFoldRows, type StoredFold } from 'lib/folds';
import type { SidePart } from 'lib/seams';
import { cn } from 'lib/utility';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Close, GroupLabel, Text, TILE_PRESS, TILE_QUIET } from 'ui';
import { useFoldRows } from '../assembly-folds/folds-store';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { drawsStepResult } from './draws-result';
import { PairNo } from './pair-no';
import { NO_SEAM_TEXT } from './step-highlight';
import { useStepResults } from './step-result-context';
import {
  hasMultipleStepPieces,
  posesLabels,
  pieceOfTarget,
  targetsLen,
  type TargetId,
} from './step-seams-model';
import { useStepSeamActions } from './step-seams-context';
import {
  isUnitStep,
  StepPictureSvg,
  useStepScene,
  type EdgeMark,
  type StepScene,
} from './step-picture-view';
import type { SurfacePicture } from './surface-picture';

const SeamPicker = lazy(() => import('./seam-picker'));

/** Tile picture size, px: about one fifth larger than the previous 88 × 60 drawing. */
const TILE_W = 106;
const TILE_H = 72;
const SEAM_CLOSE = cn(
  'absolute top-px right-px z-10 size-7 bg-bgColor p-0 [@media(pointer:coarse)]:size-11',
  TILE_QUIET,
);

const polyLen = (points: readonly Pt2[]) =>
  points.reduce(
    (total, point, index) =>
      index
        ? total + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1])
        : total,
    0,
  );

export function seamTileSideLines(
  sides: { a: readonly SidePart[]; b: readonly SidePart[] },
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
  folds?: {
    activeFolds: readonly StoredFold[];
    grainDeg?: number | ReadonlyMap<string, number> | null;
  },
): [string, string] {
  const innerLen = (piece: string, index: number) => polyLen(innerLines.get(piece)?.[index] ?? []);
  const line = (parts: readonly SidePart[], other: readonly SidePart[]) => {
    const codes = [
      ...new Set(parts.map((part) => geoms.get(pieceOfTarget(part.target))?.name).filter(Boolean)),
    ];
    if (codes.length === 0) return '';
    const length = targetsLen(
      parts,
      geoms,
      innerLen,
      folds && {
        ...folds,
        otherSideMm: other.length ? targetsLen(other, geoms, innerLen) : null,
      },
    );
    return `${codes.join(' + ')} ${Math.round(length)}`;
  };
  return [line(sides.a, sides.b), line(sides.b, sides.a)];
}

/** The picker's state lives above both its doors: the panel head and the tiles of the group. */
export type SeamPickerRequest = { proposal: number; preselect: boolean };
const PLAIN_PICK: SeamPickerRequest = { proposal: 0, preselect: false };

/** The step's way into the seam window, with its seam count. A step of one piece has no door. */
export function StepSeamsDoor({
  index,
  onOpen,
}: {
  index: number;
  onOpen: (request: SeamPickerRequest) => void;
}) {
  const { ctx, ops, geoms, pieceKeys, stored } = useStepScene(index);
  const hasMultiplePieces = useMemo(
    () => hasMultipleStepPieces(ops, index, pieceKeys, geoms) || posesLabels(ops, index, pieceKeys),
    [ops, index, pieceKeys, geoms],
  );
  if (!ctx || !hasMultiplePieces) return null;
  return (
    <Button
      type='button'
      variant='underline'
      size='xs'
      onClick={() => onOpen(PLAIN_PICK)}
      disabled={!ctx.cardId}
      title={ctx.cardId ? undefined : 'save first'}
      data-step-seams-pick=''
    >
      seams {stored.length}
    </Button>
  );
}

export function StepSeamsRow({
  index,
  picker,
  onPicker,
}: {
  index: number;
  picker: SeamPickerRequest | null;
  onPicker: (request: SeamPickerRequest | null) => void;
}) {
  const scene = useStepScene(index);
  const foldRows = useFoldRows();
  const results = useStepResults();
  const result = drawsStepResult(results, index) ? results?.[index] : undefined;
  const { ctx, op, ops, geo, geoms, pieceKeys, keys, stored, suggestions } = scene;
  const unitStep = isUnitStep(scene.groups);
  const seamActions = useStepSeamActions(index);
  const pendingWrites = useSeamsStore((state) => state.pending);
  const opNumber = op?.operationNumber;
  // A suggestion tile carries its pair into the picker; the door and stored tiles start empty.
  const open = picker != null;
  const setOpen = (next: boolean) => onPicker(next ? PLAIN_PICK : null);

  const hasMultiplePieces = useMemo(
    () => hasMultipleStepPieces(ops, index, pieceKeys, geoms) || posesLabels(ops, index, pieceKeys),
    [ops, index, pieceKeys, geoms],
  );
  // A deep link from the audit's PDF gaps: open on this step, then drop the param.
  const [params, setParams] = useSearchParams();
  const pick = params.get('pick');
  useEffect(() => {
    if (!ctx || !hasMultiplePieces || !pick || !opNumber || String(opNumber) !== pick) return;
    onPicker(PLAIN_PICK);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('pick');
        return n;
      },
      { replace: true },
    );
  }, [ctx, hasMultiplePieces, pick, opNumber, setParams, onPicker]);

  if (!ctx || !hasMultiplePieces) return null;
  const { cardId, frozen } = ctx;
  const pending = geo?.dep.status === 'pending';
  const activeFolds = activeFoldRows(ops, index, foldRows);

  return (
    <div className='flex flex-col' data-step-seams={opNumber ?? ''}>
      <GroupLabel>seams</GroupLabel>
      <div className='flex flex-wrap items-start gap-x-4 gap-y-2'>
        {stored.map(({ key, row, parts }, i) => {
          const writing = !!pendingWrites[key];
          const sideLines = seamTileSideLines(parts, geoms, scene.innerLines, {
            activeFolds,
            grainDeg: geo?.grainDeg,
          });
          return (
            <div key={key} className='group relative w-30 flex-none'>
              <SeamTile
                no={i}
                scene={scene}
                picture={result}
                marks={[...parts.a, ...parts.b].map((part) => ({
                  id: part.target,
                  ...(part.range ? { range: part.range } : {}),
                  tone: 'stored',
                }))}
                ownMarksOnly={unitStep}
                missing={!row}
                onOpen={cardId ? () => setOpen(true) : undefined}
                data-step-seam={key}
              />
              <Close
                aria-label={`remove seam ${i + 1}`}
                disabled={frozen || writing}
                onClick={() => void seamActions.remove(key, row)}
                className={SEAM_CLOSE}
              />
              <div className='mt-1 flex flex-col'>
                {sideLines.map((line, sideIndex) => (
                  <Text
                    key={sideIndex}
                    size='micro'
                    component='span'
                    className='min-h-4 break-words'
                    data-seam-side={sideIndex + 1}
                  >
                    {line}
                  </Text>
                ))}
              </div>
            </div>
          );
        })}
        {(keys.length === 0 || unitStep) &&
          suggestions.map((sug, i) => (
            <SeamTile
              key={i}
              no={stored.length + suggestions.length > 1 ? stored.length + i : undefined}
              scene={scene}
              picture={result}
              marks={[...sug.a, ...sug.b].map((id) => ({ id, tone: 'proposal' }))}
              ownMarksOnly={unitStep}
              dashed
              onOpen={cardId ? () => onPicker({ proposal: i, preselect: true }) : undefined}
            />
          ))}
        {keys.length === 0 && !pending && suggestions.length === 0 && !scene.seamless && (
          <Text size='micro' variant='error' tracking='label' data-step-seams-status=''>
            {NO_SEAM_TEXT}
          </Text>
        )}
      </div>
      {open && (
        <Suspense fallback={null}>
          <SeamPicker
            index={index}
            open={open}
            proposal={picker?.proposal ?? 0}
            preselectProposal={picker?.preselect ?? false}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * One seam tile: only the pieces that carry its edges, laid along the step's seams between them,
 * the joined edges marked and its number at the corner.
 */
export function SeamTile({
  scene,
  picture,
  marks,
  ownMarksOnly,
  dashed,
  missing,
  no,
  onOpen,
  current,
  status,
  emptyLabel,
  caption,
  ...rest
}: {
  /** The seam's number on the step — the one the picker shows beside it. */
  no?: number;
  scene: StepScene;
  /** The step's one picture; nothing is drawn until it exists. */
  picture?: SurfacePicture | null;
  marks: { id: TargetId; tone: EdgeMark['tone'] }[];
  /** A seam inside a unit shows only its own marks, not the step's highlight. */
  ownMarksOnly?: boolean;
  dashed?: boolean;
  missing?: boolean;
  /** Opens the picker on this step — the tile is a way in, as `+ seam`. */
  onOpen?: () => void;
  current?: boolean;
  status?: 'done' | 'skipped';
  emptyLabel?: string;
  /** A word under the pieces: «pick» on a step with no guess, chosen by hand. */
  caption?: string;
  'data-step-seam'?: string;
}) {
  return (
    <span
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? 'pick' : undefined}
      aria-current={current ? 'step' : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onOpen();
            }
          : undefined
      }
      className={cn(
        'relative inline-flex h-22 w-30 flex-none items-center justify-center border bg-bgColor px-1.5',
        onOpen && cn('cursor-pointer hover:border-textColor', TILE_PRESS),
        dashed ? 'border-dashed border-textColor' : missing ? 'border-error' : 'border-borderColor',
        current && 'border-2 border-solid border-textColor',
        status === 'skipped' && 'opacity-40',
      )}
      data-seam-tile={dashed ? 'proposal' : missing ? 'missing' : 'stored'}
      {...rest}
    >
      {emptyLabel ? (
        <Text size='nano' variant='error'>
          {emptyLabel}
        </Text>
      ) : missing ? (
        <Text size='nano' variant='error'>
          missing
        </Text>
      ) : picture ? (
        <StepPictureSvg
          w={TILE_W}
          h={TILE_H}
          pad={2}
          look='tile'
          layout={picture.layout}
          layers={picture.layers}
          geoms={scene.geoms}
          innerLines={scene.innerLines}
          marks={marks}
          stepEdges={ownMarksOnly ? undefined : scene.stepEdges}
          seamless={scene.seamless}
          stepParts={ownMarksOnly ? undefined : scene.stepParts}
        />
      ) : null}
      {no != null && (
        <span className='absolute top-0 left-0'>
          <PairNo i={no} />
        </span>
      )}
      {caption && (
        <Text size='nano' variant='label' component='span' className='absolute bottom-0.5 left-1'>
          {caption}
        </Text>
      )}
      {status === 'done' && (
        <Text size='nano' component='span' className='absolute right-1 bottom-0.5'>
          ✓
        </Text>
      )}
    </span>
  );
}
