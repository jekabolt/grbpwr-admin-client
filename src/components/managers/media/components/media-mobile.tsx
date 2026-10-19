import { cn } from 'lib/utility';
import { Button, Chip, ChipRow, Close, Drawer, GroupLabel, Input, Text, ViewSwitch } from 'ui';
import { FilterType, OTHER_RATIO, SortOrder, UsageShelf } from '../utils/useFilter';

/** Phone segments: full width, every segment a 44px target. */
const SEGMENTS =
  'flex w-full flex-wrap [&>span]:min-h-11 [&>span]:flex-auto [&>span]:justify-center';

const ratioName = (key: string) => (key === OTHER_RATIO ? 'other' : key);

type Facets = {
  type: FilterType;
  ratio: string | null;
  usageShelf: UsageShelf | null;
  typeCounts: { all: number; image: number; video: number };
  ratioCounts: { key: string; count: number }[];
  usageCounts: { free: number; used: number; unknown: number };
  onType: (t: FilterType) => void;
  onRatio: (r: string | null) => void;
  onUsage: (u: UsageShelf | null) => void;
};

/** How many of the three filter groups are set (search is visible on its own). */
export function activeFilterCount({
  type,
  ratio,
  usageShelf,
}: Pick<Facets, 'type' | 'ratio' | 'usageShelf'>) {
  return (type !== 'all' ? 1 : 0) + (ratio !== null ? 1 : 0) + (usageShelf !== null ? 1 : 0);
}

/** Library header on a phone (frame 1). */
export function MobileLibraryHead({
  loaded,
  shown,
  search,
  order,
  facets,
  onSearch,
  onOrder,
  onOpenFilters,
  onSelect,
}: {
  loaded: number;
  shown: number;
  search: string;
  order: SortOrder;
  facets: Facets;
  onSearch: (s: string) => void;
  onOrder: (o: SortOrder) => void;
  onOpenFilters: () => void;
  onSelect: () => void;
}) {
  const { type, ratio, usageShelf, onType, onRatio, onUsage } = facets;
  const active = activeFilterCount(facets);
  return (
    <div className='-mx-2.5 flex flex-col gap-2 border-b border-borderColor bg-bgColor px-2.5 py-2.5'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large'>
            Media
          </Text>
          {loaded > 0 && (
            <Text variant='label'>{shown === loaded ? loaded : `${shown} / ${loaded}`}</Text>
          )}
        </div>
        <Button variant='underline' size='sm' className='min-h-11' onClick={onSelect}>
          select
        </Button>
      </div>
      <Input
        name='mediaSearch'
        type='text'
        value={search}
        placeholder='id or url'
        aria-label='search the media library'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
      />
      <div className='flex gap-2'>
        <Button variant='secondary' size='sm' className='min-h-11 flex-1' onClick={onOpenFilters}>
          filters{active > 0 ? ` · ${active}` : ''}
        </Button>
        <Button
          variant='secondary'
          size='sm'
          className='min-h-11 flex-1'
          onClick={() => onOrder(order === 'desc' ? 'asc' : 'desc')}
        >
          {order === 'desc' ? 'newest ↓' : 'oldest ↑'}
        </Button>
      </div>
      {active > 0 && (
        <ChipRow>
          {type !== 'all' && (
            <Chip onRemove={() => onType('all')}>{type === 'image' ? 'photo' : 'video'}</Chip>
          )}
          {ratio !== null && <Chip onRemove={() => onRatio(null)}>{ratioName(ratio)}</Chip>}
          {usageShelf !== null && (
            <Chip onRemove={() => onUsage(null)}>{usageShelf === 'free' ? 'free' : 'in use'}</Chip>
          )}
        </ChipRow>
      )}
    </div>
  );
}

/** Filters bottom sheet (frame 1a). Every tap applies at once; `show N` only closes. */
export function MediaFiltersSheet({
  open,
  onOpenChange,
  shown,
  facets,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shown: number;
  facets: Facets;
  onReset: () => void;
}) {
  const { type, ratio, usageShelf, typeCounts, ratioCounts, usageCounts } = facets;
  return (
    <Drawer
      side='bottom'
      open={open}
      onOpenChange={onOpenChange}
      title='filters'
      footer={
        <>
          <Button variant='underline' size='sm' className='min-h-11' onClick={onReset}>
            reset
          </Button>
          <Button
            variant='main'
            size='sm'
            className='min-h-11 flex-1'
            disabled={shown === 0}
            onClick={() => onOpenChange(false)}
          >
            {shown === 0 ? 'nothing found' : `show ${shown}`}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-2.5'>
        <div>
          <GroupLabel flush>type</GroupLabel>
          <ViewSwitch
            label='type'
            className={SEGMENTS}
            value={type}
            onChange={facets.onType}
            options={[
              { value: 'all', label: `all ${typeCounts.all}` },
              { value: 'image', label: `photo ${typeCounts.image}` },
              { value: 'video', label: `video ${typeCounts.video}` },
            ]}
          />
        </div>
        {ratioCounts.length > 0 && (
          <div>
            <GroupLabel flush>ratio</GroupLabel>
            <ViewSwitch
              label='ratio'
              className={SEGMENTS}
              value={ratio ?? 'all'}
              onChange={(v) => facets.onRatio(v === 'all' ? null : v)}
              options={[
                { value: 'all', label: 'all' },
                ...ratioCounts.map(({ key }) => ({ value: key, label: ratioName(key) })),
              ]}
            />
          </div>
        )}
        <div>
          <GroupLabel flush>usage</GroupLabel>
          <ViewSwitch
            label='usage'
            className={SEGMENTS}
            value={usageShelf ?? 'all'}
            onChange={(v) => facets.onUsage(v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'all' },
              { value: 'free', label: `free ${usageCounts.free}` },
              { value: 'used', label: `in use ${usageCounts.used}` },
            ]}
          />
        </div>
      </div>
    </Drawer>
  );
}

/** Select-mode header (frame 1b). Filters stay as they were; only the view switch is here. */
export function MobileSelectHead({
  count,
  view,
  allCount,
  onView,
  onExit,
  onDeselectAll,
}: {
  count: number;
  view: 'all' | 'selected';
  allCount: number;
  onView: (v: 'all' | 'selected') => void;
  onExit: () => void;
  onDeselectAll: () => void;
}) {
  return (
    <div className='-mx-2.5 flex flex-col gap-2 border-b border-borderColor bg-bgColor px-2.5 py-2.5'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-1'>
          <Close aria-label='exit select' onClick={onExit} />
          <Text variant='uppercase' className='tabular-nums'>
            {count} selected
          </Text>
        </div>
        <Button
          variant='underline'
          size='sm'
          className='min-h-11'
          disabled={!count}
          onClick={onDeselectAll}
        >
          deselect all
        </Button>
      </div>
      <ViewSwitch
        label='select view'
        className={SEGMENTS}
        value={view}
        onChange={onView}
        options={[
          { value: 'all', label: `all · ${allCount}` },
          { value: 'selected', label: `selected · ${count}` },
        ]}
      />
    </div>
  );
}

/** Sticky phone bar at the bottom of the viewport: `+ upload`, or the select-mode actions. */
export function MobileBottomBar({ dark, children }: { dark?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex items-center gap-2 border-t px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        dark ? 'border-textColor bg-textColor text-bgColor' : 'border-borderColor bg-bgColor',
      )}
    >
      {children}
    </div>
  );
}
