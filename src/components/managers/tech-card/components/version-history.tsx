import { useInfiniteQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { TechCardSnapshotListItem } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, useRef, useState } from 'react';
import { Button, GroupLabel, Text } from 'ui';

const PAGE_SIZE = 24;
const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

export type CurrentTechCardVersion = {
  createdAt?: string;
  authorLabel?: string;
};

export function useTechCardSnapshots(techCardId: number | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...techCardKeys.detail(techCardId!), 'snapshots'],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      adminService.ListTechCardSnapshots({
        techCardId: techCardId!,
        pageSize: PAGE_SIZE,
        beforeSnapshotId: pageParam || undefined,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBeforeSnapshotId || undefined,
    enabled: !!techCardId && enabled,
    staleTime: 30_000,
  });
}

function validDate(value: string | undefined, fallback: Date): Date {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date, now: Date): string {
  if (dayKey(date) === dayKey(now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLocaleLowerCase();
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function authorLabel(value: string | undefined): string {
  const label = value?.trim() || 'you';
  return label.includes('@') ? label.slice(0, label.indexOf('@')) : label;
}

/** Server labels stay server labels; the chip merely enforces its three-word visual budget. */
export function shortVersionChanges(values: readonly string[] | undefined, fallback = 'saved') {
  const out: string[] = [];
  let words = 0;
  for (const raw of values ?? []) {
    const label = raw.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    if (!label) continue;
    const parts = label.split(' ');
    if (out.length === 0 && parts.length > 3) return parts.slice(0, 3).join(' ');
    if (words + parts.length > 3) break;
    out.push(label);
    words += parts.length;
  }
  if (out.length > 0) return out.join(' · ');
  const clean = fallback.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return clean.split(' ').slice(0, 3).join(' ') || 'saved';
}

type VersionRow = {
  key: string;
  snapshotId?: number;
  date: Date;
  author: string;
  changes: string;
  pinned: boolean;
  current: boolean;
};

function restoredLabel(reason: string | undefined, items: TechCardSnapshotListItem[]) {
  const match = /^restore:(\d+)$/i.exec(reason?.trim() ?? '');
  if (!match) return null;
  const target = items.find((item) => item.snapshotId === Number(match[1]));
  if (!target?.createdAt) return `restored ${match[1]}`;
  const date = validDate(target.createdAt, new Date());
  const numeric = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  return `restored ${numeric} ${timeLabel(date)}`;
}

function rowsOf(
  items: TechCardSnapshotListItem[],
  current: CurrentTechCardVersion,
  now: Date,
): VersionRow[] {
  const currentDate = validDate(current.createdAt, now);
  return [
    {
      key: 'current',
      date: currentDate,
      author: authorLabel(current.authorLabel),
      changes: 'saved',
      pinned: false,
      current: true,
    },
    ...items.map((item, index) => ({
      key: `snapshot-${item.snapshotId ?? index}`,
      snapshotId: item.snapshotId,
      date: validDate(item.createdAt, currentDate),
      author: authorLabel(item.authorLabel),
      changes:
        restoredLabel(item.reason, items) ??
        shortVersionChanges(item.changes, item.reason || 'saved'),
      pinned: !!item.pinned,
      current: false,
    })),
  ];
}

export function VersionHistoryList({
  items,
  current,
  canRestore,
  loading,
  failed,
  hasMore,
  loadingMore,
  onMore,
  onRestore,
  now = new Date(),
}: {
  items: TechCardSnapshotListItem[];
  current: CurrentTechCardVersion;
  canRestore: boolean;
  loading: boolean;
  failed: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onRestore: (snapshotId: number) => Promise<void>;
  now?: Date;
}) {
  const restoring = useRef(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const groups = useMemo(() => {
    const grouped = new Map<string, VersionRow[]>();
    for (const row of rowsOf(items, current, now)) {
      const label = dayLabel(row.date, now);
      grouped.set(label, [...(grouped.get(label) ?? []), row]);
    }
    return [...grouped.entries()].map(([day, rows]) => ({ day, rows }));
  }, [current, items, now]);

  const restore = async (row: VersionRow) => {
    if (!row.snapshotId || restoring.current || !canRestore) return;
    restoring.current = true;
    setRestoringId(row.snapshotId);
    try {
      await onRestore(row.snapshotId);
    } finally {
      restoring.current = false;
      setRestoringId(null);
    }
  };

  return (
    <div data-version-list>
      {groups.map((group, groupIndex) => (
        <div key={group.day}>
          <GroupLabel flush={groupIndex === 0}>{group.day}</GroupLabel>
          <ol>
            {group.rows.map((row) => (
              <li
                key={row.key}
                tabIndex={row.current ? undefined : 0}
                className={`group flex min-w-0 items-center gap-2 border-b border-hairline py-1 last:border-b-0 ${FOCUS}`}
                data-version-row={row.current ? 'current' : row.snapshotId}
              >
                <Text size='micro' component='span' className='w-10 shrink-0 tabular-nums'>
                  {timeLabel(row.date)}
                </Text>
                <Text
                  size='micro'
                  variant='label'
                  component='span'
                  className='w-12 shrink-0 truncate'
                  title={row.author}
                >
                  {row.author}
                </Text>
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  {row.changes}
                </Text>
                {row.pinned ? (
                  <Text size='nano' variant='label' component='span' className='shrink-0'>
                    pinned
                  </Text>
                ) : null}
                {row.current ? (
                  <Text size='nano' variant='label' component='span' className='shrink-0'>
                    current
                  </Text>
                ) : (
                  <Button
                    type='button'
                    variant='underline'
                    size='xs'
                    className='shrink-0 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100'
                    disabled={!canRestore || restoringId !== null}
                    onClick={() => void restore(row)}
                    data-restore-version={row.snapshotId}
                  >
                    restore
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}

      {loading ? (
        <Text size='micro' variant='label' component='p' className='py-1' data-versions-loading>
          loading versions
        </Text>
      ) : failed ? (
        <Text size='micro' variant='label' component='p' className='py-1' data-versions-error>
          versions unavailable
        </Text>
      ) : null}

      {hasMore ? (
        <Button
          type='button'
          variant='underline'
          size='xs'
          className='mt-1'
          disabled={loadingMore}
          onClick={onMore}
          data-versions-more
        >
          more
        </Button>
      ) : null}
    </div>
  );
}
