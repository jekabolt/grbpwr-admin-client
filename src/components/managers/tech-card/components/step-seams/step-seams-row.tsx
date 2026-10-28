// «SEAMS» GROUP OF A STEP CARD (assembly-schema T8, picker v2 owner OK 27.10): its own group, header
// «seams» with `+ seam` (the picker) at the right. Below it every stored seam as a small step picture
// — the inputs with the seam's edges ink solid — and a ✕ that takes the key off this step only (the
// seam stays on the card); with nothing stored, the length proposal as a dashed picture + `accept`,
// else red `no seam`. `?pick=<op number>` (a PDF-gap deep link) opens the picker on arrival.

import { cn } from 'lib/utility';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, Close, GroupLabel, Text } from 'ui';
import { rowFromHand } from '../assembly-seams/seam-actions';
import type { TechCardFormData } from '../schema';
import type { SeamCandidate } from 'lib/assembly-skeleton/types';
import { PairNo } from './pair-no';
import { focusPieces, seamOfSides } from './step-picture';
import { useAttachStepSeam } from './step-seams-context';
import { hasMultipleStepPieces, pieceOfTarget, type TargetId } from './step-seams-model';
import {
  frameSeamsOf,
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
  const { ctx, op, ops, geo, geoms, pieceKeys, keys, stored, suggestions } = scene;
  const { innerLines, innerSeams, storedSeams, crossSeams } = scene;
  const { setValue, getValues } = useFormContext<TechCardFormData>();
  const attach = useAttachStepSeam(index);
  const opNumber = op?.operationNumber;
  // The proposal the picker opens on; null = closed.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const open = openAt != null;
  const setOpen = (o: boolean) => setOpenAt(o ? 0 : null);
  const [busy, setBusy] = useState(false);

  const hasMultiplePieces = useMemo(
    () => hasMultipleStepPieces(ops, index, pieceKeys, geoms),
    [ops, index, pieceKeys, geoms],
  );
  const nameOf = scene.pieceName;
  // Each tile lays its pieces along the seam it shows (a stored one, or its own proposal).
  const storedFrame = useMemo(
    () => frameSeamsOf(innerSeams, storedSeams, null, crossSeams),
    [innerSeams, storedSeams, crossSeams],
  );
  const proposalFrames = useMemo(
    () =>
      suggestions.map((sug) =>
        frameSeamsOf(innerSeams, storedSeams, seamOfSides(sug, geoms, innerLines), crossSeams),
      ),
    [suggestions, innerSeams, storedSeams, crossSeams, geoms, innerLines],
  );

  // A deep link from the audit's PDF gaps: open on this step, then drop the param.
  const [params, setParams] = useSearchParams();
  const pick = params.get('pick');
  useEffect(() => {
    if (!ctx || !hasMultiplePieces || !pick || !opNumber || String(opNumber) !== pick) return;
    setOpenAt(0);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('pick');
        return n;
      },
      { replace: true },
    );
  }, [ctx, hasMultiplePieces, pick, opNumber, setParams]);

  const accept = useCallback(
    async (i: number) => {
      const suggestion = suggestions[i];
      if (!suggestion || !geo || ctx?.frozen || !ctx?.cardId || busy) return;
      const row = rowFromHand(
        suggestion.a,
        suggestion.b,
        geoms,
        { pieces: [...geoms.values()], grainDeg: geo.grainDeg, nameOf },
        { direction: 'reversed' },
      );
      if (!row) return;
      setBusy(true);
      await attach(row);
      setBusy(false);
    },
    [suggestions, geo, ctx?.frozen, ctx?.cardId, busy, geoms, nameOf, attach],
  );

  if (!ctx || !hasMultiplePieces) return null;
  const { cardId, frozen } = ctx;
  const pending = geo?.dep.status === 'pending';

  const drop = (key: string) => {
    const cur = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
    setValue(
      `operations.${index}.seamKeys`,
      cur.filter((k) => k !== key),
      { shouldDirty: true },
    );
  };

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
        {stored.map(({ key, row, sides }, i) => (
          <SeamTile
            key={key}
            no={i}
            scene={scene}
            seams={storedFrame}
            marks={[...sides.a, ...sides.b].map((id) => ({ id, tone: 'stored' }))}
            missing={!row}
            onRemove={frozen ? undefined : () => drop(key)}
            onOpen={cardId ? () => setOpen(true) : undefined}
            data-step-seam={key}
          />
        ))}
        {keys.length === 0 &&
          suggestions.map((sug, i) => (
            <span key={i} className='inline-flex items-center gap-2'>
              <SeamTile
                no={suggestions.length > 1 ? i : undefined}
                scene={scene}
                seams={proposalFrames[i] ?? storedFrame}
                marks={[...sug.a, ...sug.b].map((id) => ({ id, tone: 'pick' }))}
                dashed
                onOpen={cardId ? () => setOpenAt(i) : undefined}
              />
              {!frozen && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={() => void accept(i)}
                  disabled={!cardId || busy}
                  title={cardId ? undefined : 'save first'}
                  data-step-seams-accept=''
                >
                  accept
                </Button>
              )}
            </span>
          ))}
        {keys.length === 0 && !pending && suggestions.length === 0 && (
          <Text size='micro' variant='error' tracking='label' data-step-seams-status=''>
            no seam
          </Text>
        )}
      </div>
      {open && (
        <Suspense fallback={null}>
          <SeamPicker
            index={index}
            open={open}
            proposal={openAt ?? 0}
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
function SeamTile({
  scene,
  seams,
  marks,
  dashed,
  missing,
  no,
  onRemove,
  onOpen,
  ...rest
}: {
  /** The seam's number on the step — the one the picker shows beside it. */
  no?: number;
  scene: StepScene;
  /** The seams the tile lays its pieces along. */
  seams: readonly SeamCandidate[];
  marks: { id: TargetId; tone: EdgeMark['tone'] }[];
  dashed?: boolean;
  missing?: boolean;
  onRemove?: () => void;
  /** Opens the picker on this step — the tile is a way in, as `+ seam`. */
  onOpen?: () => void;
  'data-step-seam'?: string;
}) {
  const ids = marks.map((m) => m.id).join(',');
  // The seam's pieces with the pieces of their unit between them — a yoke's armhole on the back.
  const leavesRaw = useMemo(() => {
    const own = new Set(ids.split(',').filter(Boolean).map(pieceOfTarget));
    return scene.leaves
      .map((l) => focusPieces(l, own, scene.innerSeams))
      .filter((l) => l.length > 0);
  }, [scene.leaves, scene.innerSeams, ids]);
  const layout = useStepLayout(leavesRaw, seams, scene.geoms, 0.12, 4);
  return (
    <span
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? 'pick' : undefined}
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
      )}
      data-seam-tile={dashed ? 'proposal' : missing ? 'missing' : 'stored'}
      {...rest}
    >
      {missing ? (
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
          geoms={scene.geoms}
          innerLines={scene.innerLines}
          marks={marks}
        />
      )}
      {no != null && (
        <span className='absolute top-0 left-0'>
          <PairNo i={no} />
        </span>
      )}
      {onRemove && (
        <span className='absolute top-0 right-0'>
          <Close
            size='sm'
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label='remove'
          />
        </span>
      )}
    </span>
  );
}
