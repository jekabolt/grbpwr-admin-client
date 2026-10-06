import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import { GROUP_GAP } from './core';
import { holdFlatInput, readFlatInput, rowsWritable } from './flat-input';
import { GarmentPictogram, useCardGarmentFamily } from './garment-pictograms';
import { rememberRefChoice } from './ref-ask-model';
import { cardOnScreen, useDesignWrites } from './use-design-band';
import { ACTIVE_VIEWS, DETAIL_VIEW, viewLabel, type ActiveView } from './views';

/**
 * ═══ ASK · REFERENCES — THE MOODBOARD QUIZ'S GRID, ONE UNMARKED PICTURE AT A TIME (T70) ══════════
 *
 * Opened by GENERATE when input pictures have no role (`ref-ask-model.ts`). The picture in focus is
 * large on the left with the queue as a strip under it; on the right `picture n / N`, «what part is
 * this?», the sides as chips with the card's pictogram, `detail` (asks a name inline — a detail is a
 * named slot, as on the tile), and `figure it out ✦`. A chip advances after 150 ms (the quiz's
 * beat). The last answer hands back to the row, which starts the run with no second press.
 *   · `leave out` — not sent, remembered; `skip all ›` — every picture left goes `figure it out`;
 *   · `cancel` / Escape — closes, nothing started, answers already written stay written.
 */

type Props = {
  techCardId: number;
  /** The queue, frozen when GENERATE opened the quiz. */
  ids: readonly number[];
  thumbOf?: (mediaId: number) => string;
  /** Position in the input — the `ordinal` a role write carries. */
  ordinalOf: (mediaId: number) => number;
  disabled?: boolean;
  onDone: () => void;
  onCancel: () => void;
};

const SIDES: readonly ActiveView[] = ACTIVE_VIEWS;
const FIGURE = 'figure';

export function AskReferences({
  techCardId,
  ids,
  thumbOf,
  ordinalOf,
  disabled,
  onDone,
  onCancel,
}: Props): JSX.Element | null {
  const card = techCardId;
  const family = useCardGarmentFamily();
  const { setReferenceRole, setBenchSlot } = useDesignWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const busy = writing || !!disabled;
  const id = ids[at];

  const next = () => {
    setChosen(null);
    setNaming(null);
    if (at >= ids.length - 1) onDone();
    else setAt(at + 1);
  };

  /** A role, written NOW and awaited: the row starts the run only after the last write landed. */
  const writeRole = async (role: string, detailName?: string): Promise<boolean> => {
    if (!rowsWritable(readFlatInput(card))) {
      showMessage('the input is busy — the role was not changed', 'error');
      return false;
    }
    const release = holdFlatInput(card);
    setWriting(true);
    try {
      let detailSlotId: number | undefined;
      if (role === DETAIL_VIEW) {
        const created = await setBenchSlot.mutateAsync({
          slot: { viewKey: DETAIL_VIEW, kind: 'flat', colorwayId: 0 },
          pictureId: 0,
          expectedSlotRev: 0,
          newDetailName: detailName ?? '',
        });
        detailSlotId = created?.slot?.id ?? 0;
      }
      await setReferenceRole.mutateAsync({
        mediaId: id,
        role,
        ordinal: ordinalOf(id),
        detailSlotId,
      });
      rememberRefChoice(card, id, null);
      return true;
    } catch {
      // Said by the write's own `onError`; the question stays for another answer.
      return false;
    } finally {
      release();
      if (cardOnScreen(card)) setWriting(false);
    }
  };

  const pick = (value: string) => {
    if (busy || id == null) return;
    if (value === DETAIL_VIEW) {
      setChosen(value);
      setNaming('');
      return;
    }
    setChosen(value);
    setNaming(null);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (value === FIGURE) {
        rememberRefChoice(card, id, 'figure');
        next();
        return;
      }
      if (await writeRole(value)) next();
      else setChosen(null);
    }, 150);
  };

  const nameDetail = async () => {
    const name = (naming ?? '').trim();
    if (!name || busy) return;
    if (await writeRole(DETAIL_VIEW, name)) next();
  };

  const leaveOut = () => {
    if (busy || id == null) return;
    rememberRefChoice(card, id, 'out');
    next();
  };

  const skipAll = () => {
    if (busy) return;
    for (const rest of ids.slice(at)) rememberRefChoice(card, rest, 'figure');
    onDone();
  };

  const options: { value: string; label: string; view?: ActiveView }[] = [
    ...SIDES.map((v) => ({ value: v as string, label: viewLabel(v), view: v })),
    { value: DETAIL_VIEW, label: viewLabel(DETAIL_VIEW) },
    { value: FIGURE, label: 'figure it out ✦' },
  ];

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const i = Number(e.key) - 1;
    if (!Number.isInteger(i) || i < 0 || i >= options.length) return;
    e.preventDefault();
    pick(options[i].value);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (id == null) return null;
  const url = thumbOf?.(id) ?? '';

  return (
    <div data-ask-references={ids.length} data-ask-ref-at={at} data-ask-ref={id}>
      <GroupLabel flush className={GROUP_GAP}>
        ask · references
      </GroupLabel>
      <div className='grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-start gap-4 py-1'>
        <div className='min-w-0 space-y-2'>
          <div className='flex aspect-square w-full items-center justify-center border border-textColor bg-bgColor'>
            {url ? (
              <img src={url} alt={`picture ${id}`} className='size-full object-contain' />
            ) : (
              <Text size='micro' variant='label' component='span'>
                #{id}
              </Text>
            )}
          </div>
          {ids.length > 1 && (
            <div className='flex flex-wrap gap-1' aria-label='the pictures asked about'>
              {ids.map((other, i) => {
                const u = thumbOf?.(other) ?? '';
                return (
                  <span
                    key={other}
                    data-ask-ref-strip={other}
                    aria-current={i === at ? 'true' : undefined}
                    className={cn(
                      'flex size-7 items-center justify-center border bg-bgColor',
                      i === at ? 'border-textColor' : 'border-borderColor',
                      i < at && 'opacity-30',
                      i > at && 'opacity-60',
                    )}
                  >
                    {u ? <img src={u} alt='' className='size-full object-contain' /> : null}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className='min-w-0 space-y-2'>
          <Text size='micro' variant='label' tracking='label' component='p' className='uppercase'>
            picture {at + 1} / {ids.length} · no role yet
          </Text>
          <Text component='p' className='text-pretty' data-ask-ref-question=''>
            what part is this?
          </Text>
          <ChipRow>
            {options.map((o) => (
              <Chip
                key={o.value}
                data-ask-ref-option={o.value}
                selected={chosen === o.value}
                disabled={busy}
                onClick={() => pick(o.value)}
                title={
                  o.value === FIGURE
                    ? 'send it without a role — the model works out what it shows'
                    : o.value === DETAIL_VIEW
                      ? 'a close-up of one part — name it next'
                      : `the ${o.label} of the garment`
                }
                className='whitespace-normal text-left'
              >
                {o.view && family ? (
                  <GarmentPictogram family={family} view={o.view} className='h-4 w-3 shrink-0' />
                ) : null}
                {o.label}
              </Chip>
            ))}
          </ChipRow>
          {naming !== null && (
            <div className='flex items-start gap-2'>
              <span className='block min-w-0 flex-1'>
                <Input
                  autoFocus
                  aria-label='detail name'
                  placeholder='name the detail · collar · cuff · pocket'
                  value={naming}
                  disabled={busy}
                  className='min-h-[22px] py-0.5'
                  data-ask-ref-detail-name=''
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNaming(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && naming.trim()) {
                      e.preventDefault();
                      void nameDetail();
                    }
                  }}
                />
              </span>
              {naming.trim() !== '' && (
                <Button
                  variant='underline'
                  size='xs'
                  className='mt-1'
                  disabled={busy}
                  data-ask-ref-next=''
                  onClick={() => void nameDetail()}
                >
                  next ›
                </Button>
              )}
            </div>
          )}
          <div className='flex flex-wrap items-start gap-3'>
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              data-ask-ref-out=''
              disabled={busy}
              title='not sent to the model — not asked again'
              onClick={leaveOut}
            >
              leave out
            </Button>
            {ids.length - at > 1 && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                data-ask-ref-skip-all=''
                disabled={busy}
                title='the model works out every picture left'
                onClick={skipAll}
              >
                skip all ›
              </Button>
            )}
            <Button
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              data-ask-ref-cancel=''
              disabled={writing}
              title='close · nothing is started (esc)'
              onClick={onCancel}
            >
              cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
