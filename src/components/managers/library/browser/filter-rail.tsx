import { isProjectTopic, useFileTopics } from 'components/managers/files/hooks/useFiles';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useMemo } from 'react';
import { Chip, ChipRow, SideRailGroup, SideRailItem } from 'ui';
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

export type FilterGroup = { key: string; label: string; options: FilterOption[] };

/**
 * The filter groups of the rail and of the phone sheet, in the mockup's order:
 * kind, usage, uploaded by, period, ratio, project, topic. Counts come from the facets, each
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

    const ratios = facets?.ratios ?? [];
    if (ratios.length) {
      groups.push({
        key: 'ratio',
        label: 'ratio',
        options: ratios.map((r) => ({
          key: r.ratio,
          label: r.ratio,
          count: r.count,
          on: filter.ratios.includes(r.ratio),
          toggle: () => set({ ratios: toggleIn(filter.ratios, r.ratio) }),
        })),
      });
    }

    if (showFileGroups) {
      const all = (topicsData ?? []).filter((t) => (t.id ?? 0) > 0);
      const projects = all.filter(isProjectTopic);
      const topics = all.filter((t) => !isProjectTopic(t));
      if (projects.length) {
        groups.push({
          key: 'project',
          label: 'project',
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
    return groups;
  }, [filter, onChange, facets, allowedKinds, showFileGroups, admins, topicsData]);
}

/** Desktop: the groups as rail rows; a zero-count row is dimmed, never hidden. */
export function FilterRail({ groups, onClear }: { groups: FilterGroup[]; onClear?: () => void }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.key}>
          <SideRailGroup>{g.label}</SideRailGroup>
          {g.options.map((o) => (
            <SideRailItem
              key={o.key}
              label={o.label}
              count={o.count}
              selected={o.on}
              onClick={o.toggle}
              className={o.count === 0 && !o.on ? 'text-borderColor' : undefined}
            />
          ))}
        </div>
      ))}
      {onClear && (
        <SideRailItem label={<span className='underline'>clear</span>} onClick={onClear} />
      )}
    </>
  );
}

/** Phone sheet body: each group as a chip row. */
export function FilterChipGroups({ groups }: { groups: FilterGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.key}>
          <SideRailGroup>{g.label}</SideRailGroup>
          <ChipRow>
            {g.options.map((o) => (
              <Chip key={o.key} selected={o.on} pressed={o.on} onClick={o.toggle}>
                {o.count !== undefined ? `${o.label} ${o.count}` : o.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      ))}
    </>
  );
}

/** Phone: the active options as removable chips under the search. */
export function ActiveFilterChips({ groups }: { groups: FilterGroup[] }) {
  const on = groups.flatMap((g) =>
    g.options.filter((o) => o.on).map((o) => ({ ...o, id: `${g.key}:${o.key}` })),
  );
  if (!on.length) return null;
  return (
    <ChipRow className='flex-nowrap overflow-x-auto'>
      {on.map((o) => (
        <Chip key={o.id} selected onRemove={o.toggle}>
          {o.label}
        </Chip>
      ))}
    </ChipRow>
  );
}
