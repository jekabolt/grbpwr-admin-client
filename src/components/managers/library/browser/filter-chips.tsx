import { isProjectTopic, useFileTopics } from 'components/managers/files/hooks/useFiles';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useMemo, useState } from 'react';
import { Chip, ChipRow, Drawer, GenericPopover, SideRailItem } from 'ui';
import { KIND_GROUPS, type LibraryFilter, type LibraryKind } from '../api/types';
import type { LibraryFacets } from '../hooks/useLibraryFacets';
import {
  PERIODS,
  groupOn,
  periodFrom,
  periodOf,
  toggleGroup,
  toggleIn,
  visibleGroups,
} from './filters';

export type FilterOption = {
  key: string;
  label: string;
  /** Facet count; absent where the server sends none (uploader, project, topic, period). */
  count?: number;
  on: boolean;
  toggle: () => void;
};

export type FilterGroup = {
  key: string;
  label: string;
  options: FilterOption[];
  /** Every option of the group off (the chip's ×). */
  clear: () => void;
};

/**
 * The filter chips' groups, in the mockup's order: kind, usage, uploaded by, period, project,
 * topic, then ratio (picture fields need it). Counts come from the facets, each
 * computed by the server under the filter minus its own group.
 */
export function useFilterGroups({
  filter,
  onChange,
  facets,
  allowedKinds,
  showFileGroups,
}: {
  filter: LibraryFilter;
  onChange: (next: LibraryFilter) => void;
  facets: LibraryFacets | undefined;
  allowedKinds?: LibraryKind[];
  /** Project and topic live on files only; a visual-only host does not show them. */
  showFileGroups: boolean;
}): FilterGroup[] {
  const admins = useAdmins().data?.admins;
  const topicsData = useFileTopics(false, showFileGroups).data?.topics;

  return useMemo(() => {
    const set = (patch: Partial<LibraryFilter>) => onChange({ ...filter, ...patch });
    const groups: FilterGroup[] = [];

    groups.push({
      key: 'kind',
      label: 'kind',
      clear: () => set({ kinds: [] }),
      options: visibleGroups(allowedKinds).map((g) => ({
        key: g,
        label: g,
        count: facets
          ? KIND_GROUPS[g].reduce((sum, k) => sum + (facets.kinds[k] ?? 0), 0)
          : undefined,
        on: groupOn(filter.kinds, g),
        toggle: () => set({ kinds: toggleGroup(filter.kinds, g) }),
      })),
    });

    groups.push({
      key: 'usage',
      label: 'usage',
      clear: () => set({ usage: undefined }),
      options: (['used', 'free'] as const).map((u) => ({
        key: u,
        label: u,
        count: facets ? facets[u] : undefined,
        on: filter.usage === u,
        toggle: () => set({ usage: filter.usage === u ? undefined : u }),
      })),
    });

    const people = (admins ?? []).filter((a) => (a.id ?? 0) > 0);
    if (people.length) {
      groups.push({
        key: 'by',
        label: 'uploaded by',
        clear: () => set({ uploadedById: 0 }),
        options: people.map((a) => {
          const id = a.id ?? 0;
          return {
            key: String(id),
            label: (a.name || a.username || '').toLowerCase(),
            on: filter.uploadedById === id,
            toggle: () => set({ uploadedById: filter.uploadedById === id ? 0 : id }),
          };
        }),
      });
    }

    const period = periodOf(filter);
    groups.push({
      key: 'period',
      label: 'period',
      clear: () => set({ createdFrom: '', createdTo: '' }),
      options: PERIODS.map((p) => ({
        key: p.key,
        label: p.label,
        on: period === p.key,
        toggle: () =>
          set(
            period === p.key
              ? { createdFrom: '', createdTo: '' }
              : { createdFrom: periodFrom(p.key), createdTo: '' },
          ),
      })),
    });

    if (showFileGroups) {
      const all = (topicsData ?? []).filter((t) => (t.id ?? 0) > 0);
      const projects = all.filter(isProjectTopic);
      const topics = all.filter((t) => !isProjectTopic(t));
      if (projects.length) {
        groups.push({
          key: 'project',
          label: 'project',
          clear: () => set({ projectTopicId: 0 }),
          options: projects.map((t) => {
            const id = t.id ?? 0;
            return {
              key: String(id),
              label: t.name ?? '',
              on: filter.projectTopicId === id,
              toggle: () => set({ projectTopicId: filter.projectTopicId === id ? 0 : id }),
            };
          }),
        });
      }
      if (topics.length) {
        groups.push({
          key: 'topic',
          label: 'topic',
          clear: () => set({ topicIds: [] }),
          options: topics.map((t) => {
            const id = t.id ?? 0;
            return {
              key: String(id),
              label: t.name ?? '',
              on: filter.topicIds.includes(id),
              toggle: () => set({ topicIds: toggleIn(filter.topicIds, id) }),
            };
          }),
        });
      }
    }
    const ratios = facets?.ratios ?? [];
    if (ratios.length) {
      groups.push({
        key: 'ratio',
        label: 'ratio',
        clear: () => set({ ratios: [] }),
        options: ratios.map((r) => ({
          key: r.ratio,
          label: r.ratio,
          count: r.count,
          on: filter.ratios.includes(r.ratio),
          toggle: () => set({ ratios: toggleIn(filter.ratios, r.ratio) }),
        })),
      });
    }

    return groups;
  }, [filter, onChange, facets, allowedKinds, showFileGroups, admins, topicsData]);
}

/** The chip's words: the group name, or the chosen value (`pictures`, `pictures +1`). */
function chipLabel(g: FilterGroup): string {
  const on = g.options.filter((o) => o.on);
  if (!on.length) return g.label;
  return on.length > 1 ? `${on[0].label} +${on.length - 1}` : on[0].label;
}

/** The option rows of one group: label, count at the right, the chosen ones in ink. */
function OptionRows({ group }: { group: FilterGroup }) {
  return (
    <>
      {group.options.map((o) => (
        <SideRailItem
          key={o.key}
          label={<span className='truncate'>{o.label}</span>}
          count={o.count}
          selected={o.on}
          onClick={o.toggle}
          className={o.count === 0 && !o.on ? 'text-borderColor' : undefined}
        />
      ))}
    </>
  );
}

/** One group as a chip: empty, it names the group; chosen, it is filled with the value and ×. */
function groupChipProps(group: FilterGroup) {
  const on = group.options.some((o) => o.on);
  return {
    selected: on,
    onRemove: on ? group.clear : undefined,
    className: 'shrink-0',
    children: chipLabel(group),
  };
}

/** Desktop: the groups as chips in the toolbar; a chip opens its options under it. */
export function FilterChips({ groups }: { groups: FilterGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <GenericPopover
          key={g.key}
          noTail
          triggerProps={{ asChild: true }}
          openElement={<Chip {...groupChipProps(g)} />}
        >
          <OptionRows group={g} />
        </GenericPopover>
      ))}
    </>
  );
}

/**
 * Phone: the groups as one horizontally scrolling chip row, then the sort and view chips. A chip
 * opens its options as a bottom sheet titled with the group's name.
 */
export function PhoneFilterChips<S extends string, V extends string>({
  groups,
  sort,
  sorts,
  onSort,
  view,
  views,
  onView,
}: {
  groups: FilterGroup[];
  sort?: S;
  sorts?: { value: S; label: string }[];
  onSort?: (s: S) => void;
  view?: V;
  views?: { value: V; label: string }[];
  onView?: (v: V) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const group = groups.find((g) => g.key === open);
  const nextView = views?.find((v) => v.value !== view);
  const sortGroup: FilterGroup | undefined =
    sorts && onSort
      ? {
          key: 'sort',
          label: 'sort',
          clear: () => undefined,
          options: sorts.map((s) => ({
            key: s.value,
            label: s.label,
            on: s.value === sort,
            toggle: () => {
              onSort(s.value);
              setOpen(null);
            },
          })),
        }
      : undefined;
  const sheet = open === 'sort' ? sortGroup : group;
  return (
    <>
      <ChipRow className='flex-nowrap overflow-x-auto [scrollbar-width:none]'>
        {groups.map((g) => (
          <Chip key={g.key} {...groupChipProps(g)} onClick={() => setOpen(g.key)} />
        ))}
        {sortGroup && (
          <Chip className='shrink-0' onClick={() => setOpen('sort')}>
            {sorts?.find((s) => s.value === sort)?.label ?? sort}
          </Chip>
        )}
        {nextView && onView && (
          <Chip className='shrink-0' onClick={() => onView(nextView.value)}>
            {nextView.label}
          </Chip>
        )}
      </ChipRow>
      <Drawer
        open={!!sheet}
        onOpenChange={(next) => !next && setOpen(null)}
        title={sheet?.label ?? ''}
        side='bottom'
      >
        {sheet && <OptionRows group={sheet} />}
      </Drawer>
    </>
  );
}
