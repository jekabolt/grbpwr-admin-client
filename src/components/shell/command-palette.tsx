import { usePermissions } from 'components/managers/accounts/utils/permissions';
import type { Task } from 'components/managers/tasks/api/types';
import { TaskPageShell } from 'components/managers/tasks/components/task-form-shell';
import { Marked } from 'components/managers/tasks/components/task-search';
import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import {
  boardNameOf,
  useTaskBoards,
  useTaskSearch,
} from 'components/managers/tasks/hooks/useTasks';
import { STATUS_LABEL } from 'components/managers/tasks/utils/meta';
import { normalizeQuery, searchTasks, TaskHit } from 'components/managers/tasks/utils/search';
import { ADMIN_GROUP, NAV_GROUPS, ROUTES, SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ConfirmationModal, Input, Pill, Text } from 'ui';

/**
 * ⌘K «EVERYTHING» (owner pick 21.10): one field over tasks (every board + archive, the same
 * ListTasks query as the tasks search) and pages (the nav). ↑↓ move, ↵ opens, esc closes.
 * Desktop: a modal; phone: a full-screen page. Mounted once in the shell.
 */

const TASK_LIMIT = 8;
const DEBOUNCE_MS = 200;

type PageRow = { label: string; group: string; route: string };
type Row = { kind: 'task'; hit: TaskHit } | ({ kind: 'page' } & PageRow);

/** `true` on a Mac: the hint says ⌘K there and ctrl K elsewhere. */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const PALETTE_KEY_HINT = IS_MAC ? '⌘K' : 'ctrl K';

/** ⌘K / Ctrl+K anywhere opens the palette. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onOpen]);
}

function usePages(): PageRow[] {
  const { canRead, isSuper } = usePermissions();
  return useMemo(
    () => [
      ...[...NAV_GROUPS, ADMIN_GROUP].flatMap((g) =>
        g.items
          .filter((i) => (isSuper || !i.superOnly) && canRead(i.section))
          .map((i) => ({ label: i.label, group: g.label, route: i.route })),
      ),
      { label: 'my profile', group: 'account', route: ROUTES.me },
    ],
    [canRead, isSuper],
  );
}

function useDebounced(value: string): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);
  return v;
}

function RowView({
  row,
  query,
  active,
  boardName,
  onPick,
  onHover,
}: {
  row: Row;
  query: string;
  active: boolean;
  boardName: string;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <Button
      type='button'
      onClick={onPick}
      onMouseMove={onHover}
      aria-selected={active}
      role='option'
      className={cn(
        'flex min-h-11 w-full items-start gap-2.5 border-b border-hairline px-4 py-2 text-left last:border-b-0 sm:min-h-0 sm:px-2.5',
        'border-l-2',
        active ? 'border-l-textColor bg-pageBg' : 'border-l-transparent bg-bgColor',
      )}
    >
      {row.kind === 'task' ? (
        <>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='w-9 shrink-0 pt-px tabular-nums'
          >
            #{row.hit.task.id}
          </Text>
          <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
            <Text component='span' className='truncate font-bold'>
              <Marked text={row.hit.task.task.title} query={query} />
            </Text>
            {row.hit.snippet && row.hit.field && (
              <Text variant='label' component='span' className='truncate'>
                <span className='mr-1.5 text-nano uppercase tracking-pill text-textColor'>
                  {row.hit.field}
                </span>
                <Marked text={row.hit.snippet} query={query} />
              </Text>
            )}
          </span>
          <span className='flex shrink-0 gap-1'>
            {!!boardName && <Pill className='max-sm:hidden'>{boardName}</Pill>}
            {row.hit.task.archivedAt ? (
              <Pill tone='ink'>archived</Pill>
            ) : (
              <Pill>{STATUS_LABEL[row.hit.task.status]}</Pill>
            )}
          </span>
        </>
      ) : (
        <>
          <Text component='span' className='flex-1'>
            <Marked text={row.label} query={query} />
          </Text>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {row.group}
          </Text>
        </>
      )}
    </Button>
  );
}

function PaletteBody({
  onTask,
  onPage,
}: {
  onTask: (t: Task) => void;
  onPage: (route: string) => void;
}) {
  const { canRead } = usePermissions();
  const tasksReadable = canRead(SECTION.tasks);
  const [draft, setDraft] = useState('');
  const query = normalizeQuery(useDebounced(draft));
  const typed = normalizeQuery(draft);
  const found = useTaskSearch(tasksReadable ? query : '');
  const { data: boards } = useTaskBoards(tasksReadable);
  const pages = usePages();
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const out: { label: string; rows: Row[] }[] = [];
    if (query && found.data) {
      const hits = searchTasks(found.data.tasks, query, found.data.matches).slice(0, TASK_LIMIT);
      if (hits.length)
        out.push({ label: 'tasks', rows: hits.map((hit) => ({ kind: 'task', hit })) });
    }
    const needle = typed.toLowerCase();
    const pageRows = pages.filter((p) => !needle || p.label.includes(needle));
    if (pageRows.length)
      out.push({ label: 'pages', rows: pageRows.map((p) => ({ kind: 'page', ...p })) });
    return out;
  }, [query, typed, found.data, pages]);
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => setIndex(0), [flat]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const pick = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === 'task') onTask(r.hit.task);
    else onPage(r.route);
  };
  const loading = !!query && tasksReadable && found.isFetching && !found.data;

  return (
    <div className='flex min-h-0 flex-col'>
      <div className='flex items-center gap-2 border-b border-borderColor p-2.5 max-sm:px-4'>
        <Input
          name='command-palette'
          type='text'
          value={draft}
          autoFocus
          autoComplete='off'
          placeholder='search'
          aria-label='search'
          role='combobox'
          aria-expanded
          aria-controls='command-palette-list'
          className='min-h-11 flex-1 max-sm:text-reading sm:min-h-8'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((x) => Math.min(flat.length - 1, x + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((x) => Math.max(0, x - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              pick(flat[index]);
            }
          }}
        />
      </div>
      <div
        ref={list}
        id='command-palette-list'
        role='listbox'
        className='min-h-0 flex-1 overflow-y-auto sm:max-h-105'
      >
        {flat.length === 0 ? (
          <div className='px-2.5 py-6 text-center'>
            <Text size='micro' variant='label' component='span'>
              {loading ? 'searching' : `nothing for “${typed}”`}
            </Text>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <Text
                size='nano'
                variant='uppercase'
                tracking='label'
                component='p'
                className='bg-pageBg px-4 pb-1 pt-2.5 text-labelColor sm:px-2.5'
              >
                {g.label}
              </Text>
              {g.rows.map((r) => {
                const i = flat.indexOf(r);
                return (
                  <div key={r.kind === 'task' ? `t${r.hit.task.id}` : `p${r.route}`} data-row={i}>
                    <RowView
                      row={r}
                      query={typed}
                      active={i === index}
                      boardName={r.kind === 'task' ? boardNameOf(boards, r.hit.task.boardId) : ''}
                      onPick={() => pick(r)}
                      onHover={() => setIndex(i)}
                    />
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
      <div className='flex gap-4 border-t border-borderColor bg-pageBg px-2.5 py-1.5 max-sm:hidden'>
        {['↑↓ move', '↵ open', 'esc close'].map((k) => (
          <Text key={k} size='nano' variant='label' component='span' className='uppercase'>
            {k}
          </Text>
        ))}
      </div>
    </div>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const phone = useMediaQuery(PHONE_QUERY);
  const close = () => onOpenChange(false);
  const onTask = (t: Task) => {
    close();
    navigate(`${ROUTES.tasks}/${t.id}`);
  };
  const onPage = (route: string) => {
    close();
    navigate(route);
  };
  // The body mounts per opening, so the field starts empty every time.
  const body = open && <PaletteBody onTask={onTask} onPage={onPage} />;
  return phone ? (
    <TaskPageShell open={open} onRequestClose={close} title='search' footer={null}>
      <div className='-m-4'>{body}</div>
    </TaskPageShell>
  ) : (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => {}}
      hideActions
      width='md'
    >
      {body}
    </ConfirmationModal>
  );
}
