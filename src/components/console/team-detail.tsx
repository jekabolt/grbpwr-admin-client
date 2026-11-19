import type { PlatformTeam } from 'api/proto-http/admin';
import { teamUrl } from 'lib/host';
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  ConfirmationModal,
  GroupLabel,
  Input,
  Loader,
  Pill,
  Text,
  ToggleSwitch,
} from 'ui';
import { canDelete, isReadOnly, seenWord, shortDate, usd } from './model';
import { addressOf, useDeleteTeam, useTeamDetail } from './use-console';

/**
 * The `delete team` sheet: the operator's own password confirms it. The password lives only in this
 * component's state; the sheet is mounted while open, so closing it drops the password with it.
 */
function DeleteTeamSheet({
  team,
  people,
  onClose,
}: {
  team: PlatformTeam;
  people: number;
  onClose: () => void;
}) {
  const slug = team.slug ?? '';
  const run = useDeleteTeam();
  const field = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPassword('');
    onClose();
  };

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const refusal = await run(slug, password);
    setBusy(false);
    if (!refusal) return close();
    if (refusal === 'wrong password') setPassword('');
    setError(refusal);
    field.current?.focus();
  };

  return (
    <ConfirmationModal
      open
      width='sm'
      title='delete team'
      confirmLabel='delete'
      cancelLabel='cancel'
      confirmDisabled={!password || busy}
      closeOnConfirm={false}
      cancelDisabled={busy}
      onConfirm={submit}
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        field.current?.focus();
      }}
    >
      <div className='flex flex-col gap-3'>
        <div>
          {addressOf(slug)} · {people} people
        </div>
        <div className='flex flex-col gap-1'>
          <Text
            variant='label'
            size='micro'
            tracking='label'
            component='label'
            className='uppercase'
            htmlFor='console-delete-password'
          >
            password
          </Text>
          <Input
            ref={field}
            name='console-delete-password'
            type='password'
            autoComplete='current-password'
            value={password}
            aria-invalid={!!error}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          {error && (
            <Text variant='errorLabel' role='alert'>
              {error}
            </Text>
          )}
        </div>
      </div>
    </ConfirmationModal>
  );
}

/** The unfolded team row: workspace facts, the read-only switch and who is in the team. */
export function TeamDetail({
  team,
  teamOne,
  onReadOnly,
}: {
  team: PlatformTeam;
  /** Team #1 can never go read-only or be deleted (the server refuses `team_one`). */
  teamOne: boolean;
  onReadOnly: (on: boolean) => void;
}) {
  const slug = team.slug ?? '';
  const detail = useTeamDetail(slug);
  const people = detail.data?.members ?? [];
  const ro = isReadOnly(team);
  const [deleting, setDeleting] = useState(false);
  const count = detail.data ? people.length : team.people ?? 0;

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
        {canDelete(team, teamOne) && (
          <Button variant='underline' onClick={() => setDeleting(true)}>
            delete
          </Button>
        )}
      </div>
      {deleting && (
        <DeleteTeamSheet team={team} people={count} onClose={() => setDeleting(false)} />
      )}
      <GroupLabel>people {count}</GroupLabel>
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
