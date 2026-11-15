// THE 3D VIEW OF THE ASSEMBLY MAP COLUMN (01-DESIGN-L0 §6, §8 q7): the doll of the read size as a
// still — the worker's last frame painted on a 2D canvas, so the 320 px column never opens a second
// WebGL context — with the state line under it («21 seams closed · 2 proposed · 1 open»). The
// still is the door into the fullscreen view; the map's 3D chip opens it too.

import { lazy, Suspense, useEffect } from 'react';
import { Chip, Text } from 'ui';

import {
  closeDoll,
  isSolving,
  openDoll,
  requestDoll,
  resetDoll,
  THUMB,
  useDollStore,
} from './doll-store';
import { dollKey, dollRequest, useDollCard } from './use-doll-card';
import { stateLine } from './words';

const DollOverlay = lazy(() => import('./doll-overlay'));

export type DollColumnSelectionFocusV1 = Readonly<{
  operationNumber: number | null;
  pieceId?: string | null;
  seamId?: string | null;
}>;

export type DollColumnProps = Readonly<{
  variant?: 'column' | 'workbench';
  /** Caller-owned workbench context. It does not mutate the doll store or claim a 3D highlight. */
  selection?: DollColumnSelectionFocusV1 | null;
}>;

export function describeDollColumnSelectionFocusV1(
  selection: DollColumnSelectionFocusV1 | null | undefined,
): string | null {
  if (!selection) return null;
  const parts = [
    Number.isSafeInteger(selection.operationNumber) && (selection.operationNumber ?? 0) > 0
      ? `operation ${selection.operationNumber}`
      : null,
    selection.pieceId?.trim() ? `piece ${selection.pieceId.trim()}` : null,
    selection.seamId?.trim() ? `seam ${selection.seamId.trim()}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(', ') : null;
}

export function DollColumn({ variant = 'column', selection = null }: DollColumnProps = {}) {
  const card = useDollCard();
  const workbench = variant === 'workbench';
  const selectionDescription = describeDollColumnSelectionFocusV1(selection);
  const open = useDollStore((s) => s.open);
  const key = card ? dollKey(card, card.baseSize, false) : null;
  const solve = useDollStore((s) => (key ? s.solves[key] : undefined));

  // The column's doll: the read size, no lining — solved while the column shows it, and at once
  // when the chip opens the fullscreen view (the view's chunk loads meanwhile). A solve the open
  // view asked for (another size) is never cancelled from here.
  useEffect(() => {
    if (!card || !key || (open && isSolving())) return;
    const req = dollRequest(card, card.baseSize, false);
    if (req) requestDoll(key, { size: card.baseSize, lining: false }, req, THUMB);
  }, [open, card, key]);

  // Another card, or the view left: workers stopped, stills released, nothing carried over.
  const cardId = card?.cardId ?? null;
  useEffect(() => () => resetDoll(), [cardId]);

  if (!card) return null;
  const words =
    !solve || solve.status === 'solving'
      ? 'closing the seams…'
      : solve.status === 'error'
        ? `the doll could not be built: ${solve.error}`
        : stateLine(solve.report!);
  return (
    <div
      className={workbench ? 'flex h-full min-h-0 flex-col gap-1.5' : 'space-y-1.5'}
      data-doll-column=''
      data-doll-workbench={workbench || undefined}
      data-doll-selection-boundary={selectionDescription ? 'context-only' : undefined}
      data-selected-operation={selection?.operationNumber ?? undefined}
      data-selected-piece={selection?.pieceId ?? undefined}
      data-selected-seam={selection?.seamId ?? undefined}
    >
      <button
        type='button'
        onClick={openDoll}
        className={`group block w-full border border-borderColor bg-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ${workbench ? 'min-h-0 flex-1' : ''}`}
        aria-label={`open the paper doll, size ${card.sizeLabel(card.baseSize)}${
          selectionDescription ? `; workbench selection ${selectionDescription}` : ''
        }`}
        data-doll-still=''
      >
        {solve?.thumbUrl ? (
          <img
            src={solve.thumbUrl}
            alt={`paper doll, size ${card.sizeLabel(card.baseSize)}, front`}
            width={240}
            height={300}
            draggable={false}
            className={`mx-auto block h-auto w-full select-none ${workbench ? 'max-h-full max-w-[560px] object-contain' : 'max-w-[240px]'}`}
          />
        ) : (
          <div
            className={`flex w-full items-center justify-center bg-pageBg ${workbench ? 'h-full min-h-[420px]' : 'aspect-[4/5]'}`}
          >
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              {solve?.status === 'error' ? 'no doll' : 'closing the seams…'}
            </Text>
          </div>
        )}
      </button>
      <div className='flex items-baseline gap-2'>
        <Text
          size='micro'
          variant='label'
          component='p'
          className='min-w-0 flex-1 tabular-nums'
          data-doll-column-state=''
        >
          {words} · size {card.sizeLabel(card.baseSize)}
        </Text>
        <Chip quiet onClick={openDoll} data-doll-door='open'>
          open 3d
        </Chip>
      </div>
      <Text size='micro' variant='label' component='p'>
        paper doll: shape approximate, measures from the pattern laid flat
      </Text>
      {open && (
        <Suspense fallback={null}>
          <DollOverlay open={open} onClose={closeDoll} />
        </Suspense>
      )}
    </div>
  );
}

// The doll's mount without the still: the assembly map's `3d` button opens the fullscreen view
// through the store, and this is what renders it. The overlay solves the size it shows itself.
export function DollDoor() {
  const card = useDollCard();
  const open = useDollStore((s) => s.open);
  const cardId = card?.cardId ?? null;
  useEffect(() => () => resetDoll(), [cardId]);
  if (!card || !open) return null;
  return (
    <Suspense fallback={null}>
      <DollOverlay open={open} onClose={closeDoll} />
    </Suspense>
  );
}
