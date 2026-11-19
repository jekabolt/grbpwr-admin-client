import type { common_TechCard } from 'api/proto-http/admin';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, Text } from 'ui';
import type { SeamWrites } from '../assembly-seams/use-seam-decisions';
import {
  captureExistingSeamLink,
  existingSeamLinkCandidates,
  linkReviewedExistingSeam,
  reviewExistingSeamLink,
  type ExistingSeamLinkReview,
} from './saved-existing-seam-link';

export function SavedExistingSeamLinkControl({
  card,
  operationNumber,
  historyKey,
  disabled,
  isCurrent,
  change,
  nameOf,
}: Readonly<{
  card: common_TechCard;
  operationNumber: number;
  historyKey: string;
  disabled: boolean;
  isCurrent: () => boolean;
  change: SeamWrites['change'];
  nameOf: (lineKey: string) => string;
}>) {
  const candidates = useMemo(
    () => existingSeamLinkCandidates(card, operationNumber),
    [card, operationNumber],
  );
  const { dictionary } = useDictionary();
  const names = useSizeNames();
  const order = useSizeOrdering();
  const [open, setOpen] = useState(false);
  const [key, select] = useState('');
  const [activity, setActivity] = useState<{
    scope: object;
    phase: 'verifying' | 'linking' | 'verified' | 'linked' | 'refused';
    text: string;
    review?: ExistingSeamLinkReview;
  }>();
  const candidate = candidates.find((seam) => seam.seamKey === key);
  const scope = useMemo(
    () => ({ card, operationNumber, historyKey, candidate, dictionary, disabled, open }),
    [card, operationNumber, historyKey, candidate, dictionary, disabled, open],
  );
  const shown = activity?.scope === scope && !disabled ? activity : undefined;
  const busy = shown?.phase === 'verifying' || shown?.phase === 'linking';
  const flight = useRef<AbortController | null>(null);
  const current = useRef(isCurrent);
  useLayoutEffect(() => {
    current.current = isCurrent;
  }, [isCurrent]);
  useLayoutEffect(
    () => () => {
      flight.current?.abort();
      flight.current = null;
    },
    [scope],
  );

  async function run(link: boolean) {
    if (!candidate || disabled || !dictionary?.sizes || flight.current || !current.current())
      return;
    const reviewed = shown?.review;
    if (link && !reviewed) return;
    const controller = new AbortController();
    const { signal } = controller;
    flight.current = controller;
    setActivity({
      scope,
      phase: link ? 'linking' : 'verifying',
      text: link ? 'Linking saved seam…' : 'Verifying registered stations…',
    });
    try {
      if (link && reviewed) {
        await linkReviewedExistingSeam(reviewed, change, () => current.current(), signal);
        if (!signal.aborted) setActivity({ scope, phase: 'linked', text: 'Existing seam linked.' });
      } else {
        const capture = captureExistingSeamLink(
          card,
          operationNumber,
          historyKey,
          candidate.seamKey,
        );
        const review = await reviewExistingSeamLink(
          capture,
          { sizes: dictionary.sizes, names, order },
          () => current.current(),
          signal,
        );
        if (!signal.aborted && current.current())
          setActivity({
            scope,
            phase: 'verified',
            review,
            text: `${review.stationCount} registered stations verified · ${review.sizeToken}`,
          });
      }
    } catch (error) {
      if (!signal.aborted)
        setActivity({
          scope,
          phase: 'refused',
          text: error instanceof Error ? error.message : 'The existing seam could not be linked.',
        });
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  }
  if (!candidates.length) return null;
  if (!open)
    return (
      <div className='shrink-0 border-t border-hairline px-3 py-1 md:px-5'>
        <Button
          type='button'
          size='xs'
          variant='underline'
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Link a saved seam
        </Button>
      </div>
    );
  const label = (seam: (typeof candidates)[number]) =>
    [seam.sideA!, seam.sideB!]
      .map(
        ({ parts }) =>
          `${nameOf(parts![0].pieceLineKey!)}#${parts![0].edgeHint?.split('#').at(-1)}`,
      )
      .join(' ↔ ') + ` · ${seam.anchoredSize}`;
  return (
    <div
      role='group'
      aria-label='Link an existing saved seam'
      data-saved-existing-seam-link={shown?.phase ?? 'selecting'}
      data-seam-surface-direction=''
      className='flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-3 py-1 md:px-5'
    >
      <Select
        name='existing-seam-key'
        placeholder='Existing saved seam'
        size='sm'
        className='w-auto'
        value={key}
        items={candidates.map((seam) => ({ value: seam.seamKey, label: label(seam) }))}
        onValueChange={select}
        readOnly={disabled || busy}
      />
      <Button
        type='button'
        size='xs'
        variant='underline'
        disabled={!candidate || !dictionary?.sizes || disabled || busy}
        onClick={() => void run(false)}
      >
        Verify registered stations
      </Button>
      <Button
        type='button'
        size='xs'
        variant='underline'
        disabled={!shown?.review || disabled || busy}
        onClick={() => void run(true)}
      >
        Link existing seam
      </Button>
      {candidate && (
        <Text size='micro'>
          Saved direction ·{' '}
          {candidate.direction === 'TECH_CARD_SEAM_DIRECTION_REVERSED' ? 'Reversed' : 'Same'}
        </Text>
      )}
      {shown?.review && (
        <Text size='micro'>
          Original lengths {shown.review.lengthsMm[0].toFixed(4)} mm /{' '}
          {shown.review.lengthsMm[1].toFixed(4)} mm · B/A {shown.review.ratio.toFixed(8)}. Linking
          records ownership only.
        </Text>
      )}
      {shown && (
        <Text size='micro' role='status'>
          {shown.text}
        </Text>
      )}
    </div>
  );
}
