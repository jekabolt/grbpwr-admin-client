// «SEAMS» GROUP OF A STEP CARD (assembly-schema T8, picker v2 owner OK 27.10): its own group, header
// «seams» with `+ seam` (the picker) at the right. Below it every stored seam as a small step picture
// — the inputs with the seam's edges ink solid — with remove and flip beside it; remove deletes the
// card row only when no other step uses it. With nothing stored, the proposal is a dashed picture
// that opens the picker (a seam is stored only there, by hand), else red `no seam`.
// `?pick=<op number>` (a PDF-gap deep link) opens the picker on arrival.

import { cn } from 'lib/utility';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, GroupLabel, Text } from 'ui';
import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { drawsStepResult } from './draws-result';
import { PairNo } from './pair-no';
import { NO_SEAM_TEXT } from './step-highlight';
import { seamOfSides, type StepLayout } from './step-picture';
import { useStepResults } from './step-result-context';
import { hasMultipleStepPieces, type TargetId } from './step-seams-model';
import { useStepSeamActions } from './step-seams-context';
import {
  focusedStepLeaves,
  frameSeamsOf,
  isUnitStepSeamPreview,
  STEP_TILE_EXPLODE,
  STEP_TILE_RASTER_MM,
  StepPictureSvg,
  useStepLayout,
  useStepScene,
  type EdgeMark,
  type StepScene,
} from './step-picture-view';

const SeamPicker = lazy(() => import('./seam-picker'));

/** Tile picture size, px (mockup «A»: the seam ~88 × 60 inside a 72px-high tile). */
const TILE_W = 88;
const TILE_H = 60;

export function StepSeamsRow({ index }: { index: number }) {
  const scene = useStepScene(index);
  const results = useStepResults();
  const result = drawsStepResult(results, index) ? results?.[index] : undefined;
  const ownedLayout = result?.layout;
  const ownedLayers = result?.layers;
  const { ctx, op, ops, geo, geoms, pieceKeys, keys, stored, suggestions } = scene;
  const { innerLines, innerSeams, storedSeams, crossSeams } = scene;
  const unitStepPreview = isUnitStepSeamPreview(scene.groups);
  const seamActions = useStepSeamActions(index);
  const pendingWrites = useSeamsStore((state) => state.pending);
  const opNumber = op?.operationNumber;
  // A suggestion tile carries its pair into the picker; + seam and stored tiles start empty.
  const [picker, setPicker] = useState<{ proposal: number; preselect: boolean } | null>(null);
  const open = picker != null;
  const setOpen = (next: boolean) => setPicker(next ? { proposal: 0, preselect: false } : null);

  const hasMultiplePieces = useMemo(
    () => hasMultipleStepPieces(ops, index, pieceKeys, geoms),
    [ops, index, pieceKeys, geoms],
  );
  // Each tile lays its pieces along the seam it shows (a stored one, or its own proposal).
  const storedFrame = useMemo(
    () => frameSeamsOf(innerSeams, storedSeams, [], crossSeams),
    [innerSeams, storedSeams, crossSeams],
  );
  const proposalFrames = useMemo(
    () =>
      suggestions.map((sug) => {
        const own = seamOfSides(sug, geoms, innerLines);
        return frameSeamsOf(innerSeams, storedSeams, own ? [own] : [], crossSeams);
      }),
    [suggestions, innerSeams, storedSeams, crossSeams, geoms, innerLines],
  );

  // A deep link from the audit's PDF gaps: open on this step, then drop the param.
  const [params, setParams] = useSearchParams();
  const pick = params.get('pick');
  useEffect(() => {
    if (!ctx || !hasMultiplePieces || !pick || !opNumber || String(opNumber) !== pick) return;
    setPicker({ proposal: 0, preselect: false });
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('pick');
        return n;
      },
      { replace: true },
    );
  }, [ctx, hasMultiplePieces, pick, opNumber, setParams]);

  if (!ctx || !hasMultiplePieces) return null;
  const { cardId, frozen } = ctx;
  const pending = geo?.dep.status === 'pending';

  return (
    <div className='flex flex-col' data-step-seams={opNumber ?? ''}>
      <GroupLabel
        action={
          <Button
            type='button'
            variant='underline'
            size='xs'
            onClick={() => setOpen(true)}
            disabled={!cardId}
            title={cardId ? undefined : 'save first'}
            data-step-seams-pick=''
          >
            + seam
          </Button>
        }
      >
        seams
      </GroupLabel>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
        {stored.map(({ key, row, parts }, i) => {
          const writing = !!pendingWrites[key];
          return (
            <div key={key} className='flex flex-none items-center gap-2'>
              <SeamTile
                no={i}
                scene={scene}
                seams={storedFrame}
                layout={unitStepPreview ? undefined : ownedLayout}
                layers={unitStepPreview ? undefined : ownedLayers}
                marks={[...parts.a, ...parts.b].map((part) => ({
                  id: part.target,
                  ...(part.range ? { range: part.range } : {}),
                  tone: 'stored',
                }))}
                localSeamPreview={unitStepPreview}
                missing={!row}
                onOpen={cardId ? () => setOpen(true) : undefined}
                data-step-seam={key}
              />
              <div className='flex items-center gap-1.5'>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  disabled={frozen || writing}
                  onClick={() => void seamActions.remove(key, row)}
                >
                  remove
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  disabled={frozen || writing || !row}
                  onClick={() => row && void seamActions.flip(row)}
                >
                  flip
                </Button>
              </div>
            </div>
          );
        })}
        {(keys.length === 0 || unitStepPreview) &&
          suggestions.map((sug, i) => (
            <SeamTile
              key={i}
              no={stored.length + suggestions.length > 1 ? stored.length + i : undefined}
              scene={scene}
              seams={proposalFrames[i] ?? storedFrame}
              layout={unitStepPreview ? undefined : ownedLayout}
              layers={unitStepPreview ? undefined : ownedLayers}
              marks={[...sug.a, ...sug.b].map((id) => ({ id, tone: 'proposal' }))}
              localSeamPreview={unitStepPreview}
              dashed
              onOpen={cardId ? () => setPicker({ proposal: i, preselect: true }) : undefined}
            />
          ))}
        {keys.length === 0 && !pending && suggestions.length === 0 && (
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
 * One seam as a 72px tile: only the pieces that carry its edges, laid along the step's seams between
 * them, the joined edges marked, its number at the corner (✕
 * when it can be taken off).
 */
export function SeamTile({
  scene,
  seams,
  layout: suppliedLayout,
  layers,
  marks,
  localSeamPreview,
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
  /** The seams the tile lays its pieces along. */
  seams: readonly SeamCandidate[];
  /** An owner result bypasses tile focus, crop, proposal and inferred placement. */
  layout?: StepLayout;
  /** Authoritative bottom-to-top order for an owner result. */
  layers?: readonly string[];
  marks: { id: TargetId; tone: EdgeMark['tone'] }[];
  /** A local unit preview draws its own seam instead of the shared step highlight. */
  localSeamPreview?: boolean;
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
  const ids = marks.map((m) => m.id).join(',');
  // The seam's pieces with the pieces of their unit between them — a yoke's armhole on the back.
  const leavesRaw = useMemo(
    () =>
      focusedStepLeaves(
        scene.leaves,
        ids.split(',').filter(Boolean),
        scene.innerSeams,
        scene.hands.pose,
      ),
    [scene.leaves, scene.innerSeams, ids, scene.hands.pose],
  );
  const inferredLayout = useStepLayout(
    leavesRaw,
    seams,
    scene.geoms,
    STEP_TILE_EXPLODE,
    STEP_TILE_RASTER_MM,
    scene.hands,
  );
  const layout = suppliedLayout ?? inferredLayout;
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
        'relative inline-flex h-18 min-w-24 flex-none items-center justify-center border bg-bgColor px-1.5',
        onOpen && 'cursor-pointer hover:border-textColor',
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
      ) : (
        <StepPictureSvg
          w={TILE_W}
          h={TILE_H}
          pad={2}
          look='tile'
          layout={layout}
          layers={layers}
          geoms={scene.geoms}
          innerLines={scene.innerLines}
          marks={marks}
          stepEdges={localSeamPreview ? undefined : scene.stepEdges}
          stepParts={localSeamPreview ? undefined : scene.stepParts}
        />
      )}
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
