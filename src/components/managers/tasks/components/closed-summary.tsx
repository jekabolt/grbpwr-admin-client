import {
  addDays,
  addMonths,
  addWeeks,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useMemo, useState } from 'react';
import {
  Button,
  Chip,
  ChipRow,
  DatePicker,
  GroupLabel,
  Row,
  Section,
  SkeletonLine,
  Text,
} from 'ui';
import type { Task, TaskBoardEntry, TaskClosed } from '../api/types';
import { useClosedTasks } from '../hooks/useTasks';

export const PERIODS = ['this week', 'last week', 'month', 'custom'] as const;
export type ClosedPeriod = (typeof PERIODS)[number];

const WEEK = { weekStartsOn: 1 } as const;

/** Half-open [from, to) of a period; `custom` days are inclusive, so `to` is the day after. */
export function periodRange(
  period: ClosedPeriod,
  custom: { from: Date; to: Date },
  now = new Date(),
): { from: Date; to: Date } {
  const week = startOfWeek(now, WEEK);
  switch (period) {
    case 'this week':
      return { from: week, to: addWeeks(week, 1) };
    case 'last week':
      return { from: addWeeks(week, -1), to: week };
    case 'month': {
      const month = startOfMonth(now);
      return { from: month, to: addMonths(month, 1) };
    }
    case 'custom': {
      const from = startOfDay(custom.from);
      const last = startOfDay(custom.to) < from ? from : startOfDay(custom.to);
      return { from, to: addDays(last, 1) };
    }
  }
}

interface ClosedRow {
  task: Task;
  closed?: TaskClosed;
}

function closedWhen(c?: TaskClosed): string {
  if (!c?.closedAt) return '';
  const at = new Date(c.closedAt);
  return c.approximate ? `≈ ${format(at, 'PP')}` : format(at, 'PP, HH:mm');
}

export function ClosedSummary({
  boards,
  onOpen,
}: {
  /** The rail's ListTaskBoards answer: group order and labels. */
  boards: TaskBoardEntry[];
  onOpen: (task: Task) => void;
}) {
  const [period, setPeriod] = useState<ClosedPeriod>('this week');
  const [custom, setCustom] = useState(() => ({
    from: startOfMonth(new Date()),
    to: startOfDay(new Date()),
  }));
  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const { data, isLoading, isError, error, refetch } = useClosedTasks(range.from, range.to);

  const groups = useMemo(() => {
    const byId = new Map((data?.closed ?? []).map((c) => [c.taskId, c]));
    const rows: ClosedRow[] = (data?.tasks ?? []).map((task) => ({
      task,
      closed: byId.get(task.id),
    }));
    rows.sort((a, b) => (b.closed?.closedAt ?? '').localeCompare(a.closed?.closedAt ?? ''));
    const m = new Map<number, ClosedRow[]>();
    for (const r of rows) m.set(r.task.boardId, [...(m.get(r.task.boardId) ?? []), r]);
    // Rail order first; a board id the list does not know yet still shows, last, by its id.
    const known = boards.filter((b) => m.has(b.id)).map((b) => ({ id: b.id, label: b.name }));
    const seen = new Set(known.map((g) => g.id));
    const rest = [...m.keys()].filter((id) => !seen.has(id)).map((id) => ({ id, label: `#${id}` }));
    return [...known, ...rest].map((g) => ({ ...g, rows: m.get(g.id) ?? [] }));
  }, [data, boards]);

  const count = data?.tasks.length ?? 0;
  const span = `${format(range.from, 'MMM d')} – ${format(addDays(range.to, -1), 'MMM d')}`;

  return (
    <Section
      title={data ? `closed · ${count}` : 'closed'}
      className='min-w-0'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
          {span}
        </Text>
      }
    >
      <div className='flex flex-col gap-3'>
        <ChipRow className='gap-1.5'>
          {PERIODS.map((p) => (
            <Chip
              key={p}
              selected={p === period}
              pressed={p === period}
              onClick={() => setPeriod(p)}
              className='min-h-11 sm:min-h-0'
            >
              {p}
            </Chip>
          ))}
        </ChipRow>
        {period === 'custom' && (
          <div className='grid grid-cols-2 gap-3 sm:max-w-80'>
            <DatePicker
              compact
              value={custom.from}
              placeholder='from'
              onChange={(d) => d && setCustom((c) => ({ ...c, from: d }))}
            />
            <DatePicker
              compact
              value={custom.to}
              placeholder='to'
              onChange={(d) => d && setCustom((c) => ({ ...c, to: d }))}
            />
          </div>
        )}

        {isLoading ? (
          <div aria-busy className='flex flex-col gap-3'>
            <SkeletonLine width='60%' />
            <SkeletonLine width='45%' />
            <SkeletonLine width='70%' />
          </div>
        ) : isError && !data ? (
          <div className='flex items-center gap-3'>
            <Text size='micro' variant='error' tracking='label' component='span'>
              {error instanceof Error ? error.message : 'failed to load'}
            </Text>
            <Button variant='underline' size='xs' onClick={() => refetch()}>
              retry
            </Button>
          </div>
        ) : count === 0 ? (
          <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
            nothing closed
          </Text>
        ) : (
          <div>
            {groups.map((g, i) => (
              <section key={g.id} aria-label={g.label}>
                <GroupLabel flush={i === 0}>
                  {g.label} · {g.rows.length}
                </GroupLabel>
                <div>
                  {g.rows.map(({ task, closed }) => (
                    <Button
                      key={task.id}
                      onClick={() => onOpen(task)}
                      className='block w-full border-b border-hairline text-left last:border-b-0 hover:bg-pageBg'
                    >
                      <Row
                        className='min-h-11 items-center border-b-0 max-sm:flex-wrap max-sm:gap-y-0.5 max-sm:py-1.5 sm:min-h-10'
                        label={
                          <span className='block sm:truncate'>
                            {task.task.title || `#${task.id}`}
                          </span>
                        }
                        value={
                          <Text
                            size='micro'
                            variant='label'
                            component='span'
                            className='uppercase tracking-label'
                          >
                            {[closed?.closedBy, closedWhen(closed)].filter(Boolean).join(' · ')}
                          </Text>
                        }
                      />
                    </Button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
