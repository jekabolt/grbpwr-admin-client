import type { PlatformTeam } from 'api/proto-http/admin';
import { type ChangeEvent, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Loader,
  Placeholder,
  Section,
  SectionStack,
  Text,
  Toolbar,
} from 'ui';
import { Matrix } from './matrix';
import {
  keptWord,
  shownTab,
  type Sort,
  splitBoard,
  type Tab,
  tabCounts,
  teamOneSlug,
  visibleDeleted,
  visibleRequests,
  visibleTeams,
} from './model';
import { useConsoleActions, useConsoleData } from './use-console';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'newest' },
  { value: 'name', label: 'name a–z' },
  { value: 'people', label: 'most people' },
];

/** Exclusive words: the current one in ink, the others underlined (the mockup's tabs). */
function Words<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role='group' aria-label={label} className='flex flex-wrap gap-x-3 gap-y-1'>
      {options.map((o) =>
        o.value === value ? (
          <Button key={o.value} aria-pressed className='whitespace-nowrap text-control'>
            {o.label}
          </Button>
        ) : (
          <Button
            key={o.value}
            variant='underline'
            aria-pressed={false}
            className='whitespace-nowrap text-control text-labelColor underline-offset-2 hover:text-textColor'
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ),
      )}
    </div>
  );
}

/** The console's home: every team as one row of feature switches. */
export default function ConsolePage() {
  const { rows, catalog, loading, error } = useConsoleData();
  const [q, setQ] = useState('');
  const [picked, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [open, setOpen] = useState('');

  const board = useMemo(() => splitBoard(rows), [rows]);
  const counts = tabCounts(board);
  const tab = shownTab(picked, counts);
  const list = useMemo(
    () => visibleTeams(board.teams, { q, tab, sort }),
    [board.teams, q, tab, sort],
  );
  const deleted = useMemo(() => visibleDeleted(board.deleted, q), [board.deleted, q]);
  const requests = visibleRequests(board.requests, tab);
  const teamOne = teamOneSlug(board.teams, catalog);
  const empty = !board.teams.length && !board.requests.length && !board.deleted.length;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'all', label: `all ${counts.all}` },
    { value: 'active', label: `active ${counts.active}` },
    { value: 'read_only', label: `read only ${counts.read_only}` },
    ...(counts.requests
      ? [{ value: 'requests' as const, label: `requests ${counts.requests}` }]
      : []),
    { value: 'deleted', label: `deleted ${counts.deleted}` },
  ];
  const pickTab = (v: Tab) => {
    setTab(v);
    setOpen('');
  };

  if (loading) return <Loader />;
  if (error)
    return (
      <Section>
        <Placeholder label='not loaded' tone='error' />
      </Section>
    );
  if (empty)
    return (
      <Section>
        <Placeholder label='no teams yet' />
      </Section>
    );

  return (
    <SectionStack className='gap-4 md:gap-gutter'>
      <Toolbar className='gap-x-3.5'>
        <div className='w-full md:w-[17.5rem]'>
          <Input
            name='team-search'
            type='text'
            placeholder='search'
            autoComplete='off'
            aria-label='search teams'
            value={q}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
          />
        </div>
        <Words label='team status' value={tab} options={tabs} onChange={pickTab} />
        {tab !== 'deleted' && (
          <div className='md:ml-auto'>
            <Words label='team order' value={sort} options={SORTS} onChange={setSort} />
          </div>
        )}
      </Toolbar>
      {tab === 'deleted' ? (
        <DeletedList teams={deleted} anyDeleted={board.deleted.length > 0} />
      ) : list.length || requests.length ? (
        <Section className='p-0!'>
          <Matrix
            teams={list}
            requests={requests}
            withTeams={tab !== 'requests'}
            catalog={catalog}
            teamOne={teamOne}
            open={open}
            onOpen={(slug) => setOpen((cur) => (cur === slug ? '' : slug))}
          />
        </Section>
      ) : (
        <Section>
          <Placeholder label='no match' />
        </Section>
      )}
    </SectionStack>
  );
}

/** The `deleted` tab: quiet rows, the wipe date as words, `restore` in one click. */
function DeletedList({ teams, anyDeleted }: { teams: PlatformTeam[]; anyDeleted: boolean }) {
  const act = useConsoleActions();
  if (!teams.length)
    return (
      <Section>
        <Placeholder label={anyDeleted ? 'no match' : 'nothing deleted'} />
      </Section>
    );
  return (
    <Section className='px-3! py-0! md:px-4!'>
      {teams.map((t) => {
        const slug = t.slug ?? '';
        const name = t.name || slug;
        return (
          <div
            key={slug}
            className='grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-hairline py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-x-6'
          >
            <Text variant='label' component='span' className='break-words [overflow-wrap:anywhere]'>
              {name}
            </Text>
            <Text
              variant='label'
              size='micro'
              tracking='label'
              component='span'
              className='col-start-1 row-start-2 md:col-start-auto md:row-start-auto'
            >
              {keptWord(t.purgeAt)}
            </Text>
            <Button
              variant='underline'
              className='col-start-2 row-span-2 row-start-1 self-center md:col-start-auto md:row-span-1 md:row-start-auto'
              aria-label={`restore ${name}`}
              disabled={act.restoring(slug)}
              onClick={() => act.restore(slug)}
            >
              restore
            </Button>
          </div>
        );
      })}
    </Section>
  );
}
