import { cn } from 'lib/utility';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button, CascadeList, Iconoir, Input, QUIET_PRESS } from 'ui';
import type { TaskBoardEntry } from '../api/types';
import { SortableBoardRow, SortableBoards } from './board-order';

export const CLOSED_VIEW = 'closed';
/** A second click this soon makes the pair a double click: the row is renamed, not chosen. */
const DOUBLE_MS = 240;
/** One row of the list, px (the compact cascade list's row). */
export const DEPARTMENT_ROW = 24;

const WORD =
  'block max-w-full cursor-pointer truncate text-left text-textBaseSize leading-6 transition-colors duration-500 ease-soft';
const ICON =
  'grid size-5 shrink-0 cursor-pointer place-items-center transition-colors duration-500 ease-soft disabled:cursor-default';

/** One row of the list, unfolding a step after the row above it (the cascade list's motion). */
function Row({
  open,
  order,
  grip,
  children,
}: {
  open: boolean;
  order: number;
  /** The row carries a drag grip (in the gutter at its left): it shows under the pointer only. */
  grip?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'transition-[max-height,opacity,transform] duration-700 ease-soft motion-reduce:transition-none',
        open ? 'max-h-6 opacity-100' : 'max-h-0 -translate-y-2 overflow-hidden opacity-0',
        grip &&
          '-ml-4 [&_[aria-roledescription=sortable]]:opacity-0 [&_[aria-roledescription=sortable]]:transition-opacity [&_[aria-roledescription=sortable]]:duration-500 hover:[&_[aria-roledescription=sortable]]:opacity-100 [&_[aria-roledescription=sortable]]:focus-visible:opacity-100',
      )}
      style={{ transitionDelay: open ? `${order * 55}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

/** A board's name typed in place: `✓` or Enter saves, `×` gives the row back, «Delete» asks. */
function RenameRow({
  board,
  busy,
  onSubmit,
  onCancel,
  onDelete,
}: {
  board: TaskBoardEntry;
  busy?: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(board.name);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const typed = name.trim();
  const changed = !!typed && typed !== board.name.trim();
  const save = () => (changed ? onSubmit(typed) : onCancel());
  return (
    <div className='flex h-6 items-center gap-1.5'>
      <Input
        ref={field}
        name='task-board-rename'
        value={name}
        aria-label={`rename ${board.name}`}
        autoComplete='off'
        maxLength={64}
        disabled={busy}
        size={Math.max(4, name.length)}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          }
        }}
        className='h-6 min-h-0 w-auto max-w-40 min-w-0 border-0 bg-transparent p-0 text-textBaseSize text-ink focus:border-0'
      />
      <Button
        type='button'
        variant='default'
        aria-label='save'
        title='save'
        disabled={!changed || busy}
        onClick={save}
        className={cn(
          ICON,
          QUIET_PRESS,
          changed ? 'text-ink' : 'text-placeholder',
          busy && 'animate-pulse',
        )}
      >
        <Iconoir name='check' strokeWidth={1.6} className='size-3' />
      </Button>
      <Button
        type='button'
        variant='default'
        aria-label='cancel'
        title='cancel'
        onClick={onCancel}
        className={cn(ICON, QUIET_PRESS, 'text-placeholder hover:text-ink press:text-ink')}
      >
        <Iconoir name='xmark' strokeWidth={1.6} className='size-3' />
      </Button>
      {onDelete && (
        <Button
          type='button'
          variant='default'
          onClick={onDelete}
          className={cn(
            'ml-2 cursor-pointer text-textBaseSize text-placeholder transition-colors duration-500 ease-soft hover:text-ink press:text-ink',
            QUIET_PRESS,
          )}
        >
          Delete
        </Button>
      )}
    </div>
  );
}

/**
 * THE DEPARTMENT LIST of the board's sort — the compact cascade list's look (12px words under the
 * `[ Any ]` they belong to, the chosen one in brackets, rows unfolding one after another) with the
 * board tools on its rows:
 *
 * - a click chooses the department (and «Any» / «Closed» around them);
 * - a DOUBLE CLICK on a name renames it in place — `name ✓ ×`, with a quiet «Delete» on the same
 *   row (it opens the delete-board dialog);
 * - a GRIP appears at the row's left on hover and drags the row to a new place (`board-order`);
 * - «+ Add» at the end types a new board.
 */
export function DepartmentList({
  open,
  boards,
  board,
  closed,
  onBoard,
  onClosed,
  writable,
  onAdd,
  onReorder,
  renaming,
  onRenamingChange,
  onRename,
  renameBusy,
  onDelete,
}: {
  open: boolean;
  boards: TaskBoardEntry[];
  /** 0 = every department. */
  board: number;
  closed: boolean;
  onBoard: (id: number) => void;
  onClosed: () => void;
  writable: boolean;
  onAdd: (name: string) => void;
  onReorder: (ids: number[]) => void;
  renaming: number | null;
  onRenamingChange: (id: number | null) => void;
  onRename: (id: number, name: string) => void;
  renameBusy?: boolean;
  onDelete: (board: TaskBoardEntry) => void;
}) {
  const pick = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(pick.current), []);
  useEffect(() => {
    if (!open) onRenamingChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closing the list drops the rename
  }, [open]);
  const word = (on: boolean) =>
    cn(WORD, QUIET_PRESS, on ? 'text-ink' : 'text-placeholder hover:text-ink press:text-ink');
  const bracket = (on: boolean, label: string) => (on ? `[ ${label} ]` : label);
  const anyOn = !closed && !board;
  return (
    <div
      role='listbox'
      aria-label='department'
      aria-hidden={!open}
      inert={!open}
      className='flex w-max max-w-64 flex-col items-stretch'
    >
      <Row open={open} order={0}>
        <Button
          type='button'
          variant='default'
          role='option'
          aria-selected={anyOn}
          onClick={() => onBoard(0)}
          className={word(anyOn)}
        >
          {bracket(anyOn, 'Any')}
        </Button>
      </Row>
      <SortableBoards ids={boards.map((b) => b.id)} onReorder={onReorder}>
        {boards.map((b, i) => {
          const on = !closed && board === b.id;
          const handle = writable && boards.length > 1;
          return (
            <Row key={b.id} open={open} order={i + 1} grip={handle && renaming !== b.id}>
              {renaming === b.id ? (
                <RenameRow
                  board={b}
                  busy={renameBusy}
                  onSubmit={(name) => onRename(b.id, name)}
                  onCancel={() => onRenamingChange(null)}
                  onDelete={boards.length > 1 ? () => onDelete(b) : undefined}
                />
              ) : (
                <SortableBoardRow id={b.id} name={b.name} handle={handle}>
                  <Button
                    type='button'
                    variant='default'
                    role='option'
                    aria-selected={on}
                    title={writable ? 'double click to rename' : undefined}
                    onClick={(e: MouseEvent) => {
                      window.clearTimeout(pick.current);
                      if (!writable || e.detail === 0) return onBoard(b.id);
                      if (e.detail > 1) return onRenamingChange(b.id);
                      pick.current = window.setTimeout(() => onBoard(b.id), DOUBLE_MS);
                    }}
                    className={word(on)}
                  >
                    {bracket(on, b.name)}
                  </Button>
                </SortableBoardRow>
              )}
            </Row>
          );
        })}
      </SortableBoards>
      <Row open={open} order={boards.length + 1}>
        <Button
          type='button'
          variant='default'
          role='option'
          aria-selected={closed}
          onClick={onClosed}
          className={word(closed)}
        >
          {bracket(closed, 'Closed')}
        </Button>
      </Row>
      {writable && (
        <CascadeList
          label='new department'
          size='compact'
          open={open}
          options={[]}
          onChange={() => undefined}
          addLabel='Add'
          onAdd={onAdd}
        />
      )}
    </div>
  );
}
