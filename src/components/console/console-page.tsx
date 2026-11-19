import { type ChangeEvent, useMemo, useState } from 'react';
import {
  Input,
  Loader,
  Placeholder,
  Section,
  SectionStack,
  Text,
  Toolbar,
  ToolbarSpacer,
  Button,
} from 'ui';
import { Matrix } from './matrix';
import {
  type Sort,
  splitBoard,
  type Tab,
  tabCounts,
  teamOneSlug,
  usd,
  visibleDeleted,
  visibleTeams,
} from './model';
import { useConsoleData } from './use-console';

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
  const { rows, total, catalog, loading, error } = useConsoleData();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [open, setOpen] = useState('');

  const board = useMemo(() => splitBoard(rows), [rows]);
  const counts = tabCounts(board.teams);
  const list = useMemo(
    () => visibleTeams(board.teams, { q, tab, sort }),
    [board.teams, q, tab, sort],
  );
  const deleted = useMemo(() => visibleDeleted(board.deleted, { q, tab }), [board.deleted, q, tab]);
  const teamOne = teamOneSlug(board.teams, catalog);
  // sign-ups wait above the teams, only on the unfiltered view
  const requests = tab === 'all' && !q.trim() ? board.requests : [];
  const empty = !board.teams.length && !board.requests.length && !board.deleted.length;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'all', label: `all ${counts.all}` },
    { value: 'active', label: `active ${counts.active}` },
    { value: 'read_only', label: `read only ${counts.read_only}` },
  ];

  return (
    <SectionStack>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-borderColor pb-3'>
        <Text component='h1' size='large'>
          teams · {board.teams.length}
        </Text>
        <Text variant='label' className='tabular-nums'>
          ai spend {usd(total)}
        </Text>
      </div>

      {loading ? (
        <Loader />
      ) : error ? (
        <Section>
          <Placeholder label='not loaded' tone='error' />
        </Section>
      ) : empty ? (
        <Section>
          <Placeholder label='no teams yet' />
        </Section>
      ) : (
        <>
          <Toolbar className='gap-x-3.5'>
            <div className='w-56 max-w-full'>
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
            <Words label='team status' value={tab} options={tabs} onChange={setTab} />
            <ToolbarSpacer />
            <Words label='team order' value={sort} options={SORTS} onChange={setSort} />
          </Toolbar>
          <Section className='p-0'>
            {list.length || requests.length || deleted.length ? (
              <Matrix
                teams={list}
                requests={requests}
                deleted={deleted}
                catalog={catalog}
                teamOne={teamOne}
                open={open}
                onOpen={(slug) => setOpen((cur) => (cur === slug ? '' : slug))}
              />
            ) : (
              <div className='p-4'>
                <Placeholder label='no match' />
              </div>
            )}
          </Section>
        </>
      )}
    </SectionStack>
  );
}
