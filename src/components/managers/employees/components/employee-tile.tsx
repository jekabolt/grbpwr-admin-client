import { cn } from 'lib/utility';
import { type SyntheticEvent, useEffect, useRef, useState } from 'react';
import {
  CascadeList,
  Fold,
  MetaWord,
  type SelectWord,
  TileShell,
  TileTitle,
  WheelDatePicker,
} from 'ui';
import { type CostView, dateOf, fmtDate, isoOf, money } from '../utils/model';

/** The «no role» row of a role list. */
export const NO_ROLE = '__none__';

const stop = (e: SyntheticEvent) => e.stopPropagation();

type Editor = 'role' | 'start' | 'end' | null;

/** What a tile shows: one person, as the board or the open panel holds them now. */
export type TileData = {
  name: string;
  role: string;
  start: string;
  end: string;
  left: boolean;
  archived: boolean;
  tenure: string;
  cost: CostView;
  /** A salary problem, one red word (empAnomaly v1). */
  anomaly: string | null;
  /** The note, when it is pinned to the tile. */
  note?: string;
};

/** In-place header editors of a tile: a role and the employment dates. */
export type TileEdit = {
  roles: readonly string[];
  onRole: (role: string) => void;
  onStart: (iso: string) => void;
  onEnd: (iso: string) => void;
  /** A write of this tile is in flight: its editors wait. */
  busy?: boolean;
};

/**
 * ONE PERSON ON THE EMPLOYEES BOARD (the Taskboard tile): `TileShell` ground, the header words, the
 * 24px name, the cost line. Header: `Role: [ … ]` at the left, `From: date` at the right; under it
 * the tenure and `To: Now` — or `Left: date` once employment ended (the name then steps to
 * `titleMuted`). With `edit` the role and both dates are in-place editors (`CascadeList`,
 * `WheelDatePicker`, compact); a date is written once, when its picker closes. Bottom: the monthly
 * cost — `Booked` (salary templates booking this month, in base) or `Default` (the pre-fill hint).
 */
export function EmployeeTile({
  data,
  selected,
  minimal,
  words,
  edit,
  className,
}: {
  data: TileData;
  selected?: boolean;
  minimal?: boolean;
  words?: readonly SelectWord[];
  edit?: TileEdit;
  className?: string;
}) {
  const [editor, setEditor] = useState<Editor>(null);
  const [mounted, setMounted] = useState(false);
  const [dateDraft, setDateDraft] = useState<Date | null>(null);
  const live = useRef({ editor, dateDraft, edit, data });
  live.current = { editor, dateDraft, edit, data };

  /** Leaving a date editor writes what it held: one write per gesture, none when untouched. */
  const close = (next: Editor = null) => {
    const now = live.current;
    if (now.dateDraft && (now.editor === 'start' || now.editor === 'end') && next !== now.editor) {
      const iso = isoOf(now.dateDraft);
      if (now.editor === 'start' && iso !== now.data.start) now.edit?.onStart(iso);
      if (now.editor === 'end' && iso !== now.data.end) now.edit?.onEnd(iso);
      setDateDraft(null);
    }
    if (next && !mounted) {
      // The lists and the wheels mount on the first opening, closed, and open a frame later.
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setEditor(next)));
      return;
    }
    setEditor(next);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor) return undefined;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) closeRef.current(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current(null);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [editor]);
  const hasEdit = !!edit;
  useEffect(() => {
    if (!hasEdit) closeRef.current(null);
  }, [hasEdit]);

  const canEdit = !!edit && !edit.busy;
  const toggle = (which: Exclude<Editor, null>) => close(editor === which ? null : which);
  const dim = (which: Editor) => editor != null && editor !== which;
  const shownStart = editor === 'start' && dateDraft ? isoOf(dateDraft) : data.start;
  const shownEnd = editor === 'end' && dateDraft ? isoOf(dateDraft) : data.end;
  const ink = selected || !data.left;

  const roleWord = (
    <MetaWord
      label='Role'
      value={data.role || 'None'}
      tone={data.role ? undefined : 'quiet'}
      dim={dim('role')}
      active={editor === 'role'}
      onClick={canEdit ? () => toggle('role') : undefined}
    />
  );
  const startWord = (
    <MetaWord
      label='From'
      value={shownStart ? fmtDate(shownStart) : 'Set a Date'}
      bracket={false}
      tone={shownStart ? undefined : 'quiet'}
      dim={dim('start')}
      active={editor === 'start'}
      onClick={canEdit ? () => toggle('start') : undefined}
    />
  );
  const endWord = (
    <MetaWord
      label={data.left ? 'Left' : 'To'}
      value={shownEnd ? fmtDate(shownEnd) : 'Now'}
      bracket={false}
      tone={shownEnd ? undefined : 'quiet'}
      dim={dim('end')}
      active={editor === 'end'}
      onClick={canEdit ? () => toggle('end') : undefined}
    />
  );

  const editors = edit && mounted && (
    <div
      className={cn(
        'transition-[padding] duration-700 ease-soft motion-reduce:transition-none',
        editor ? 'py-2' : 'py-0',
      )}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <CascadeList
        label='role'
        size='compact'
        open={editor === 'role'}
        options={[
          ...edit.roles.map((r) => ({ value: r, label: r })),
          { value: NO_ROLE, label: 'No Role' },
        ]}
        value={data.role || NO_ROLE}
        onChange={(v) => {
          const next = v === NO_ROLE ? '' : v;
          if (next !== data.role) edit.onRole(next);
          setEditor(null);
        }}
        addLabel='Add'
        onAdd={(name) => {
          if (name !== data.role) edit.onRole(name);
          setEditor(null);
        }}
      />
      <WheelDatePicker
        size='compact'
        open={editor === 'start'}
        value={editor === 'start' ? dateDraft ?? dateOf(data.start) : dateOf(data.start)}
        onChange={setDateDraft}
      />
      <WheelDatePicker
        size='compact'
        open={editor === 'end'}
        value={editor === 'end' ? dateDraft ?? dateOf(data.end) : dateOf(data.end)}
        onChange={setDateDraft}
      />
    </div>
  );

  const costValue = data.cost.kind === 'none' ? 'Set' : money(data.cost.amount, data.cost.currency);

  return (
    <TileShell
      rootRef={root}
      selected={selected}
      minimal={minimal}
      faded={data.archived}
      words={words}
      className={className}
      onClick={
        editor
          ? (e) => {
              e.stopPropagation();
              close(null);
            }
          : undefined
      }
    >
      <div className='px-1'>
        <div className='flex min-h-5 items-center justify-between gap-3'>
          <span className='flex min-w-0'>{roleWord}</span>
          <span className='flex min-w-0'>{startWord}</span>
        </div>
        <Fold open={!minimal}>
          <div className='flex min-h-5 items-center justify-between gap-3 pt-1'>
            <span className='flex min-w-0 items-baseline gap-3'>
              {data.tenure && (
                <MetaWord label='Tenure' value={data.tenure} bracket={false} dim={!!editor} />
              )}
              {data.archived && (
                <span className='truncate text-micro text-labelDark'>Archived</span>
              )}
            </span>
            <span className='flex min-w-0'>{endWord}</span>
          </div>
        </Fold>
        {editors}
        <Fold open={!editor} className={minimal ? 'mt-1' : 'mt-3'}>
          <TileTitle
            minimal={minimal}
            className={cn('transition-colors', ink ? 'text-ink' : 'text-titleMuted')}
          >
            {data.name}
          </TileTitle>
          <Fold open={!minimal && !!data.note}>
            <p className='line-clamp-3 pt-2 text-textBaseSize text-labelDark'>{data.note}</p>
          </Fold>
        </Fold>
        <div
          className={cn(
            'flex min-h-5 items-baseline justify-between gap-3 transition-[padding] duration-700 ease-soft',
            minimal ? 'pt-1 pb-1.5' : 'pt-4 pb-3',
          )}
        >
          <span className='min-w-0 truncate text-micro text-alert'>{data.anomaly}</span>
          <MetaWord
            label={data.cost.kind === 'booked' ? 'Booked' : 'Default'}
            value={costValue}
            bracket={false}
            tone={data.cost.kind === 'none' ? 'quiet' : undefined}
            dim={!!editor}
          />
        </div>
      </div>
    </TileShell>
  );
}
