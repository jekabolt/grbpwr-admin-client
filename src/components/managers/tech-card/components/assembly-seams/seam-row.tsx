// ONE SEAM IN THE RAIL (03-SEAMS-DESIGN §5.2 zone 3, §5.4): who meets whom, in the piece's words;
// lengths and notches; the status in words; the doors. Monochrome: weight and words carry the state,
// the blue tone only marks `check` and `stale` (DESIGN.md, the Monochrome Rule).

import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import type { StoredSeamDirection } from 'lib/seams';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { FROZEN_REFUSAL } from '../assembly-fullscreen';
import { sideOfCandidate, type ReviewItem } from './review-model';
import {
  decidedWords,
  directionWords,
  lengthWords,
  lostSideWords,
  notchCheck,
  notchWords,
  sideLen,
  sideWords,
  type RoleWords,
} from './words';

export type RowDoors = {
  select: (it: ReviewItem) => void;
  hover: (it: ReviewItem | null) => void;
  accept: (it: ReviewItem, alt?: SeamCandidate) => void;
  reject: (it: ReviewItem, note: string) => void;
  flip: (it: ReviewItem) => void;
  closure: (it: ReviewItem) => void;
  undo: (it: ReviewItem) => void;
  note: (it: ReviewItem, note: string) => void;
  reconfirm: (it: ReviewItem) => void;
  remove: (it: ReviewItem) => void;
  connectAgain: (it: ReviewItem) => void;
  /** Open (or close: null) the words field of a row: reject with words, or a note. */
  words: (it: ReviewItem | null, kind?: 'reject' | 'note') => void;
};

const KIND_WORDS: Partial<Record<SeamCandidate['kind'], string>> = {
  partial: 'partial',
  composite: 'across several edges',
  surface: 'sewn on top',
};

/** Facts line: «416 ≈ 418 mm · 2 of 2 notches match · reversed · partial». */
export function factsWords(
  a: readonly EdgeId[],
  b: readonly EdgeId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  direction: StoredSeamDirection,
  kind?: SeamCandidate['kind'] | 'closure',
): string {
  const la = sideLen(a, geoms);
  const lb = sideLen(b, geoms);
  const parts = [
    la > 0 && lb > 0 ? lengthWords(la, lb) : 'length not read',
    notchWords(notchCheck(a, b, geoms, direction)),
    directionWords(direction),
  ];
  const k = kind && kind !== 'closure' ? KIND_WORDS[kind] : undefined;
  if (k) parts.push(k);
  return parts.join(' · ');
}

/** The resolver's words without the row's own label in front («seam A ↔ B (confirmed): stale · …»). */
const tail = (w: string) => (w.includes(': ') ? w.slice(w.indexOf(': ') + 2) : w);

export function SeamRow({
  item,
  geoms,
  roles,
  selected,
  frozen,
  direction,
  words,
  doors,
}: {
  item: ReviewItem;
  geoms: ReadonlyMap<string, PieceGeom>;
  roles: RoleWords;
  selected: boolean;
  frozen: boolean;
  /** The direction this row will be written with (a proposal's local flip, or the row's own). */
  direction: StoredSeamDirection;
  /** The row's words field is open for this. */
  words: 'reject' | 'note' | null;
  doors: RowDoors;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const [text, setText] = useState(item.row?.note ?? '');
  useEffect(() => {
    if (words) setText(words === 'note' ? item.row?.note ?? '' : '');
  }, [words, item.row?.note]);

  const g = item.group;
  const busy = item.pending;
  const off = frozen || busy;
  const kind = item.row?.kind ?? item.candidate?.kind;
  const alts = g === 'decide' ? item.candidate?.ambiguousWith ?? [] : [];
  const [allReadings, setAllReadings] = useState(false);
  const shownAlts = allReadings ? alts : alts.slice(0, 1);
  // Readings of one role on twin edges read the same in words: name the edge as well.
  const withEdge = alts.length > 0;
  const side = (s: 'a' | 'b') => {
    const ids = s === 'a' ? item.a : item.b;
    if (ids.length || !item.row) return sideWords(ids, geoms, roles, withEdge);
    return lostSideWords(
      (s === 'a' ? item.row.sideA : item.row.sideB).map((x) => x.piece),
      geoms,
    );
  };

  let status: React.ReactNode = null;
  if (g === 'decide') {
    status = (
      <>
        <Pill tone={item.word === 'check' ? 'attention' : item.word === 'sure' ? 'ink' : 'mut'}>
          {item.word}
        </Pill>
        <Text size='micro' variant='label' component='span'>
          {item.candidate?.provenance
            ? 'decision undone · re-reading the pattern'
            : `proposed by the engine${alts.length ? ` · ${alts.length + 1} readings` : ''}`}
        </Text>
      </>
    );
  } else if (g === 'confirmed' || g === 'rejected') {
    status = (
      <Text size='micro' variant='label' component='span' data-seam-decided=''>
        {decidedWords(item.row!, busy)}
      </Text>
    );
  } else if (g === 'stale') {
    status = (
      <>
        <Pill tone='attention'>stale</Pill>
        <Text size='micro' component='span' className='text-warning'>
          {item.stale
            ? tail(item.stale.words).replace(/^stale · /, '')
            : 'the pattern changed since it was decided — re-confirm'}
        </Text>
      </>
    );
  } else {
    status = (
      <>
        <Pill tone='mut'>orphan</Pill>
        <Text size='micro' variant='label' component='span'>
          {item.orphan ? tail(item.orphan.words) : 'piece removed from the card — remove it'}
        </Text>
      </>
    );
  }

  const chip = (label: string, onClick: () => void, title: string, extra?: object) => (
    <Chip
      onClick={onClick}
      disabled={off}
      title={frozen ? FROZEN_REFUSAL : busy ? 'saving…' : title}
      className='disabled:border-hairline disabled:text-textInactiveColor'
      {...extra}
    >
      {label}
    </Chip>
  );

  return (
    <div
      ref={ref}
      role='option'
      aria-selected={selected}
      id={`seam-row-${item.n}`}
      data-seam-row={item.id}
      data-seam-group={g}
      data-seam-n={item.n}
      onClick={() => doors.select(item)}
      onMouseEnter={() => doors.hover(item)}
      onMouseLeave={() => doors.hover(null)}
      className={cn(
        'flex cursor-pointer flex-col gap-1 border-b border-hairline px-1.5 py-2 last:border-b-0',
        selected ? 'bg-bgSecondary' : 'hover:bg-bgZebra',
      )}
    >
      <div className='flex items-baseline gap-2'>
        <Text
          size='micro'
          component='span'
          className='w-6 shrink-0 text-right font-bold tabular-nums'
        >
          {item.n}
        </Text>
        <Text component='span' className='min-w-0 break-words'>
          {side('a')}
          <span className='px-1 text-labelColor'>↔</span>
          {side('b')}
        </Text>
      </div>
      <div className='flex flex-col gap-1 pl-8'>
        <Text size='micro' variant='label' component='span' className='tabular-nums'>
          {factsWords(item.a, item.b, geoms, direction, kind === 'closure' ? 'closure' : kind)}
        </Text>
        <div className='flex flex-wrap items-center gap-1.5'>{status}</div>
        {item.error && (
          <Text size='micro' component='span' variant='errorLabel' data-seam-error=''>
            ! refused: {item.error}
          </Text>
        )}
        {shownAlts.map((alt, i) => {
          const a = sideOfCandidate(alt, 'a');
          const b = sideOfCandidate(alt, 'b');
          return (
            <div key={i} className='flex flex-wrap items-center gap-1.5' data-seam-alt={i}>
              <Text size='micro' variant='label' component='span'>
                or: {sideWords(a, geoms, roles, true)} ↔ {sideWords(b, geoms, roles, true)} ·{' '}
                {lengthWords(sideLen(a, geoms), sideLen(b, geoms))}
              </Text>
              {chip(
                'accept this',
                () => doors.accept(item, alt),
                'confirm this reading instead of the first',
              )}
            </div>
          );
        })}
        {alts.length > 1 && (
          <div onClick={(e) => e.stopPropagation()}>
            <Chip dashed onClick={() => setAllReadings((v) => !v)} data-seam-readings=''>
              {allReadings ? 'fewer readings' : `${alts.length - 1} more readings`}
            </Chip>
          </div>
        )}
        {words ? (
          <div
            className='flex items-center gap-1.5'
            onClick={(e) => e.stopPropagation()}
            data-seam-words={words}
          >
            <Input
              autoFocus
              value={text}
              maxLength={255}
              placeholder={words === 'reject' ? 'why not (optional)' : 'a note for the workshop'}
              aria-label={words === 'reject' ? 'why this is not a seam' : 'note'}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (words === 'reject') doors.reject(item, text);
                  else doors.note(item, text);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  doors.words(null);
                }
              }}
            />
            <Chip
              selected
              disabled={off}
              onClick={() =>
                words === 'reject' ? doors.reject(item, text) : doors.note(item, text)
              }
            >
              {words === 'reject' ? 'reject' : 'save note'}
            </Chip>
            <Chip onClick={() => doors.words(null)}>cancel</Chip>
          </div>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <ChipRow>
              {g === 'decide' && (
                <>
                  {chip('✓ accept', () => doors.accept(item), 'confirm this seam (enter)', {
                    'data-seam-door': 'accept',
                  })}
                  {chip('✕ reject', () => doors.words(item, 'reject'), 'not a seam (backspace)', {
                    'data-seam-door': 'reject',
                  })}
                  {chip('⇄ flip', () => doors.flip(item), 'the two sides walk the same way (f)')}
                  {chip(
                    'closure',
                    () => doors.closure(item),
                    'a zip or a button front, not sewn (c)',
                  )}
                </>
              )}
              {g === 'confirmed' && (
                <>
                  {chip('⇄ flip', () => doors.flip(item), 'write the other direction (f)')}
                  {chip('note', () => doors.words(item, 'note'), 'words for the workshop')}
                  {chip(
                    'undo',
                    () => doors.undo(item),
                    'back to a proposal, the row is deleted (u)',
                    {
                      'data-seam-door': 'undo',
                    },
                  )}
                </>
              )}
              {g === 'rejected' && (
                <>
                  {chip('note', () => doors.words(item, 'note'), 'why it is not a seam')}
                  {chip(
                    'undo',
                    () => doors.undo(item),
                    'back to a proposal, the row is deleted (u)',
                  )}
                </>
              )}
              {g === 'stale' &&
                ((item.stale ? item.stale.stillFits : true)
                  ? chip(
                      're-confirm',
                      () => doors.reconfirm(item),
                      'it still fits: write it on today’s pattern',
                      {
                        'data-seam-door': 'reconfirm',
                      },
                    )
                  : chip(
                      'connect again',
                      () => doors.connectAgain(item),
                      'pick the two edges by hand; the row keeps its place',
                    ))}
              {(g === 'stale' || g === 'orphan') &&
                chip('remove', () => doors.remove(item), 'delete this decision')}
            </ChipRow>
          </div>
        )}
      </div>
    </div>
  );
}
