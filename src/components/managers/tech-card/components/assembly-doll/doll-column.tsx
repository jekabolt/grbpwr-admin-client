// THE 3D VIEW OF THE ASSEMBLY MAP COLUMN (01-DESIGN-L0 §6, §8 q7): the doll of the read size as a
// still — the worker's last frame painted on a 2D canvas, so the 320 px column never opens a second
// WebGL context — with the state line under it («21 seams closed · 2 proposed · 1 open»). The
// still is the door into the fullscreen view; the map's 3D chip opens it too.

import { lazy, Suspense, useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../schema';
import { closeDoll, openDoll, requestDoll, THUMB, useDollStore } from './doll-store';
import { dollKey, dollRequest, useDollCard } from './use-doll-card';
import { stateLine } from './words';

const DollOverlay = lazy(() => import('./doll-overlay'));

export function DollColumn() {
  const card = useDollCard();
  const open = useDollStore((s) => s.open);
  const approval = useWatch<TechCardFormData>({ name: 'approvalState' }) as string | undefined;
  const frozen = approval === 'TECH_CARD_APPROVAL_STATE_RELEASED';
  const key = card ? dollKey(card, card.baseSize, false) : null;
  const solve = useDollStore((s) => (key ? s.solves[key] : undefined));

  // The column's doll: the read size, no lining — solved while the column shows it.
  useEffect(() => {
    if (open || !card || !key) return;
    const req = dollRequest(card, card.baseSize, false);
    if (req) requestDoll(key, { size: card.baseSize, lining: false }, req, THUMB);
  }, [open, card, key]);

  useEffect(() => () => closeDoll(), []);

  if (!card) return null;
  const words =
    !solve || solve.status === 'solving'
      ? 'closing the seams…'
      : solve.status === 'error'
        ? `the doll could not be built: ${solve.error}`
        : stateLine(solve.report!);
  return (
    <div className='space-y-1.5' data-doll-column=''>
      <button
        type='button'
        onClick={openDoll}
        className='group block w-full border border-borderColor bg-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        aria-label={`open the paper doll, size ${card.baseSize}`}
        data-doll-still=''
      >
        {solve?.thumbUrl ? (
          <img
            src={solve.thumbUrl}
            alt={`paper doll, size ${card.baseSize}, front`}
            width={240}
            height={300}
            draggable={false}
            className='mx-auto block h-auto w-full max-w-[240px] select-none'
          />
        ) : (
          <div className='flex aspect-[4/5] w-full items-center justify-center bg-bgZebra'>
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
          {words} · size {card.baseSize}
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
          <DollOverlay open={open} onClose={closeDoll} frozen={frozen} />
        </Suspense>
      )}
    </div>
  );
}
