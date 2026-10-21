import { cn } from 'lib/utility';
import { Fragment } from 'react';
import { Button, Chip, ChipRow, Input, Pill, Text } from 'ui';
import type { Task } from '../api/types';
import { boardNameOf, useTaskBoards } from '../hooks/useTasks';
import { STATUS_LABEL } from '../utils/meta';
import { groupByBoard, highlightParts, idQuery, TaskHit } from '../utils/search';

/**
 * TASK SEARCH «IN THE ROW» (owner OK 2026-10-19, mockup variant 1). The field sits at the right
 * end of the filters row; a non-empty query swaps the board for a flat list grouped by board.
 * Search spans every board and the archive — that is what the board alone cannot answer.
 */

/** The field + its `clear` chip. Esc clears. Phone: full width, 44px, 16px type (no iOS zoom). */
export function TaskSearchField({
  value,
  onChange,
  onClear,
  name = 'task-search',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  /** Also the element id — the phone and desktop copies need different ones. */
  name?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <Input
        name={name}
        type='text'
        value={value}
        placeholder='search'
        autoComplete='off'
        aria-label='search tasks'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') onClear();
        }}
        className='min-h-11 min-w-0 flex-1 max-sm:text-reading sm:min-h-0'
      />
      {value && (
        <Chip onClick={onClear} className='min-h-11 shrink-0 sm:min-h-0'>
          clear
        </Chip>
      )}
    </div>
  );
}

/** `all boards` / `<current board>` + the result count. */
export function TaskSearchScope({
  allBoards,
  onScope,
  boardName,
  count,
  className,
}: {
  allBoards: boolean;
  onScope: (allBoards: boolean) => void;
  boardName: string;
  count: number | undefined;
  className?: string;
}) {
  return (
    <ChipRow className={cn('items-center gap-1.5', className)}>
      <Chip
        selected={allBoards}
        pressed={allBoards}
        onClick={() => onScope(true)}
        className='min-h-11 sm:min-h-0'
      >
        all boards
      </Chip>
      <Chip
        selected={!allBoards}
        pressed={!allBoards}
        onClick={() => onScope(false)}
        className='min-h-11 sm:min-h-0'
      >
        {boardName}
      </Chip>
      {count !== undefined && (
        <Text size='micro' variant='label' component='span' className='tabular-nums'>
          {count}
        </Text>
      )}
    </ChipRow>
  );
}

/** Match in the brand highlight: #311eee ground, white type. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className='bg-highlightColor text-bgColor'>
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

function ResultRow({
  hit,
  query,
  boardName,
  onOpen,
}: {
  hit: TaskHit;
  query: string;
  /** Set = the row names its board (a flat list); grouped results leave it out. */
  boardName?: string;
  onOpen: (task: Task) => void;
}) {
  const { task, field, snippet } = hit;
  const archived = !!task.archivedAt;
  const idQ = field === 'id' ? idQuery(query.trim()) ?? '' : '';
  return (
    <Button
      onClick={() => onOpen(task)}
      className={cn(
        'flex w-full flex-wrap items-start gap-x-2.5 gap-y-1 border-b border-hairline bg-bgColor px-4 py-2.5 text-left last:border-b-0 hover:bg-pageBg sm:flex-nowrap sm:px-2.5 sm:py-2',
        'min-h-11 sm:min-h-0',
      )}
    >
      <Text size='micro' variant='label' component='span' className='shrink-0 tabular-nums sm:w-11'>
        #{idQ ? <Marked text={String(task.id)} query={idQ} /> : task.id}
      </Text>
      <span className='order-last flex min-w-0 basis-full flex-col gap-0.5 sm:order-none sm:flex-1 sm:basis-auto'>
        <Text
          component='span'
          variant={archived ? 'label' : 'default'}
          className='font-bold sm:truncate'
        >
          {field === 'title' ? <Marked text={task.task.title} query={query} /> : task.task.title}
        </Text>
        {snippet && field && (
          <Text
            variant='label'
            component='span'
            className='line-clamp-2 sm:line-clamp-none sm:truncate'
          >
            <span className='mr-1.5 text-nano uppercase tracking-pill text-textColor'>{field}</span>
            <Marked text={snippet} query={query} />
          </Text>
        )}
      </span>
      <span className='ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1'>
        {!!boardName && <Pill>{boardName}</Pill>}
        {archived ? <Pill tone='ink'>archived</Pill> : <Pill>{STATUS_LABEL[task.status]}</Pill>}
      </span>
    </Button>
  );
}

/** Results grouped by board (header: board + count). Archived rows dim; active come first. */
export function TaskSearchResults({
  hits,
  query,
  onOpen,
}: {
  hits: TaskHit[];
  query: string;
  onOpen: (task: Task) => void;
}) {
  const { data: boards } = useTaskBoards();
  if (hits.length === 0) {
    return (
      <div className='border border-borderColor bg-bgColor px-2.5 py-6 text-center max-sm:border-x-0'>
        <Text size='micro' variant='label' component='span'>
          nothing for “{query.trim()}”
        </Text>
      </div>
    );
  }
  return (
    <div className='border border-borderColor bg-pageBg max-sm:border-x-0'>
      {groupByBoard(hits).map((g) => (
        <section key={g.boardId} aria-label={boardNameOf(boards, g.boardId)}>
          <div className='flex justify-between px-4 pb-1 pt-3 sm:px-2.5 sm:pt-2.5'>
            <Text
              size='nano'
              variant='uppercase'
              tracking='label'
              component='span'
              className='text-labelColor'
            >
              {boardNameOf(boards, g.boardId)}
            </Text>
            <Text size='nano' variant='label' component='span' className='tabular-nums'>
              {g.hits.length}
            </Text>
          </div>
          {g.hits.map((h) => (
            <ResultRow key={h.task.id} hit={h} query={query} onOpen={onOpen} />
          ))}
        </section>
      ))}
    </div>
  );
}
