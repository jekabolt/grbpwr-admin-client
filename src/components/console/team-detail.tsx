import type { PlatformTeam } from 'api/proto-http/admin';
import { teamUrl } from 'lib/host';
import { Avatar, GroupLabel, Loader, Pill, Text, ToggleSwitch } from 'ui';
import { isReadOnly, seenWord, shortDate, usd } from './model';
import { addressOf, useTeamDetail } from './use-console';

/** The unfolded team row: workspace facts, the read-only switch and who is in the team. */
export function TeamDetail({
  team,
  teamOne,
  onReadOnly,
}: {
  team: PlatformTeam;
  /** Team #1 can never go read-only (the server refuses `team_one`). */
  teamOne: boolean;
  onReadOnly: (on: boolean) => void;
}) {
  const slug = team.slug ?? '';
  const detail = useTeamDetail(slug);
  const people = detail.data?.members ?? [];
  const ro = isReadOnly(team);

  return (
    <div className='sticky left-0 flex w-[min(68.75rem,100cqw)] flex-col gap-1.5 px-3 pb-3.5 pt-2.5'>
      <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1'>
        <span className='whitespace-nowrap'>
          <Text variant='label' component='span'>
            workspace{' '}
          </Text>
          <a className='underline' href={teamUrl(slug, '/')}>
            {addressOf(slug)}
          </a>
        </span>
        <span className='whitespace-nowrap'>
          <Text variant='label' component='span'>
            since{' '}
          </Text>
          {shortDate(team.createdAt)}
        </span>
        <span className='whitespace-nowrap tabular-nums'>
          <Text variant='label' component='span'>
            ai spend{' '}
          </Text>
          {usd(team.aiSpendMonthUsd)}
        </span>
        {ro && <Pill tone='warn'>read only</Pill>}
        <ToggleSwitch
          label='read only'
          checked={ro}
          disabled={teamOne}
          onCheckedChange={onReadOnly}
        />
      </div>
      <GroupLabel>people {detail.data ? people.length : team.people ?? 0}</GroupLabel>
      {detail.isLoading ? (
        <Loader />
      ) : (
        <div className='grid grid-cols-[repeat(auto-fill,minmax(15.625rem,1fr))] gap-x-6'>
          {people.map((p) => (
            <div
              key={p.handle || p.email}
              className='flex min-w-0 items-center gap-2 border-b border-hairline py-1'
            >
              <Avatar name={p.handle || p.email || ''} size={20} />
              <span className='min-w-0 flex-1 truncate'>{p.handle || p.email}</span>
              <Text variant='label' size='micro' className='whitespace-nowrap'>
                {p.role}
              </Text>
              <Text variant='label' size='micro' className='whitespace-nowrap'>
                {seenWord(p.lastSeenAt)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
