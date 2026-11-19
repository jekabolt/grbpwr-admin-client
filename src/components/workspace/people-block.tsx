import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { clearAuthToken } from 'api/auth-headers';
import type { TeamMember } from 'api/proto-http/admin';
import { goToUrl, rootUrl } from 'lib/host';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useCallback, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Button,
  Close,
  ConfirmationModal,
  GroupLabel,
  Input,
  Loader,
  Placeholder,
  Row,
  Section,
  Select,
  Text,
  UndoRow,
} from 'ui';
import {
  inviteErrorWord,
  inviteExpired,
  isOwnerOnly,
  type Level,
  openInvites,
  permissionsOf,
  sentWord,
  validEmail,
} from './model';
import { PersonLine } from './person-line';
import { ROLE_ITEMS, ROLE_SELECT_CASE } from './person-parts';
import { usePeople, usePeopleActions } from './use-people';

// The people block of `/workspace` (fix mockup v4 `inline`): members as lines with the role and
// the cross in the line, open invites, the invite form. Every team write is the editor's (an owner
// of a team that is not paused); your own specialties are yours unless the team is paused.

type Confirm = { kind: 'remove' | 'leave' | 'owner'; member: TeamMember };

export function WorkspacePeople({
  editor,
  paused,
  teamName,
}: {
  editor: boolean;
  paused: boolean;
  teamName: string;
}) {
  const people = usePeople();
  // specialties live on the panel-wide people list (allowlisted for any account)
  const admins = useAdmins();
  const specialtiesOf = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const a of admins.data?.admins ?? []) byName.set(a.username ?? '', a.specialties ?? []);
    return byName;
  }, [admins.data]);
  const act = usePeopleActions();
  const qc = useQueryClient();

  const [open, setOpen] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [revoking, setRevoking] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('member');
  const [err, setErr] = useState('');

  const members = people.data?.members ?? [];
  const sections = people.data?.sections ?? [];
  const invites = openInvites(people.data?.invites);
  const shownInvites = invites.filter((i) => !revoking.has(i.inviteRef ?? '')).length;

  const mark = (ref: string, on: boolean) =>
    setRevoking((cur) => {
      const next = new Set(cur);
      if (on) next.add(ref);
      else next.delete(ref);
      return next;
    });

  const setAccess = act.setAccess.mutate;
  const onAccess = useCallback(
    (m: TeamMember, levels: Record<string, Level>) =>
      setAccess({ username: m.username ?? '', permissions: permissionsOf(levels) }),
    [setAccess],
  );

  const applyRole = (m: TeamMember, role: string) =>
    act.setRole.mutate({ username: m.username ?? '', role, was: m.role ?? '' });

  // promotion asks first (`make <name> owner`); demotion applies at once
  const onRole = (m: TeamMember, role: string) =>
    role === 'owner' && m.role !== 'owner'
      ? setConfirm({ kind: 'owner', member: m })
      : applyRole(m, role);

  const leave = (m: TeamMember) =>
    act.remove.mutate(m.username ?? '', {
      onSuccess: () => {
        // no team left behind this token: sign out to the root host
        authService.SignOut({}).catch(() => undefined);
        clearAuthToken();
        qc.clear();
        goToUrl(rootUrl('/'));
      },
    });

  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    if (!validEmail(email)) return setErr('invalid email');
    if (members.some((m) => m.email?.toLowerCase() === email.trim().toLowerCase()))
      return setErr('already in team');
    setErr('');
    act.invite.mutate(
      { email, role },
      {
        onSuccess: () => setEmail(''),
        onError: (x) => !isOwnerOnly(x) && setErr(inviteErrorWord(x)),
      },
    );
  };

  return (
    <Section
      title='people'
      question={people.data ? members.length : undefined}
      headerClassName='[&_h3]:normal-case'
    >
      {people.isLoading ? (
        <Loader />
      ) : people.isError ? (
        <Placeholder label='not loaded' tone='error' />
      ) : (
        <>
          <div>
            {members.map((m) => {
              const id = m.username || m.email || '';
              return (
                <PersonLine
                  key={id}
                  member={m}
                  members={members}
                  sections={sections}
                  specialties={specialtiesOf.get(m.username ?? '')}
                  editor={editor}
                  paused={paused}
                  open={open === id}
                  onToggle={() => setOpen((cur) => (cur === id ? '' : id))}
                  onRole={onRole}
                  onExit={(x) => setConfirm({ kind: x.you ? 'leave' : 'remove', member: x })}
                  onAccess={onAccess}
                />
              );
            })}
          </div>

          {invites.length > 0 && (
            <>
              <GroupLabel className='[&>span]:normal-case'>
                invited{' '}
                <Text component='span' variant='label' size='micro' className='font-normal'>
                  {shownInvites}
                </Text>
              </GroupLabel>
              <div className='flex flex-col'>
                {invites.map((i) => {
                  const ref = i.inviteRef ?? '';
                  if (revoking.has(ref))
                    return (
                      <UndoRow
                        key={ref}
                        name={i.email}
                        onUndo={() => mark(ref, false)}
                        onCommit={() =>
                          act.revoke.mutate(ref, { onSettled: () => mark(ref, false) })
                        }
                      />
                    );
                  const expired = inviteExpired(i);
                  return (
                    <div
                      key={ref}
                      className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-4 border-hairline py-1 [&+&]:border-t'
                    >
                      <span className='flex min-w-0 items-center gap-2'>
                        <span aria-hidden='true' className='w-5 flex-none' />
                        <span className='min-w-0 truncate text-labelColor'>{i.email}</span>
                      </span>
                      <Text
                        component='span'
                        size='micro'
                        variant={expired ? 'errorLabel' : 'label'}
                        className='whitespace-nowrap'
                      >
                        {expired ? 'expired' : `sent ${sentWord(i.sentAt)}`}
                      </Text>
                      {editor ? (
                        <Close aria-label='revoke' onClick={() => mark(ref, true)} />
                      ) : (
                        <span />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {editor && (
            <form
              className='flex flex-wrap items-center gap-2 pt-1.5'
              noValidate
              onSubmit={submitInvite}
            >
              <div className='max-md:basis-full md:max-w-[22.5rem] md:flex-[1_1_13.75rem]'>
                <Input
                  name='invite-email'
                  type='email'
                  placeholder='email'
                  autoComplete='off'
                  spellCheck={false}
                  aria-label='invite email'
                  aria-invalid={err ? true : undefined}
                  className='h-[1.625rem]'
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setEmail(e.target.value);
                    if (err) setErr('');
                  }}
                />
              </div>
              <div className='max-md:flex-1 md:w-23'>
                <Select
                  name='invite-role'
                  size='sm'
                  aria-label='invite role'
                  items={ROLE_ITEMS}
                  value={role}
                  onValueChange={setRole}
                  {...ROLE_SELECT_CASE}
                />
              </div>
              <Button
                variant='main'
                type='submit'
                className='h-[1.625rem] whitespace-nowrap px-3 max-md:flex-1'
                disabled={act.invite.isPending}
              >
                invite
              </Button>
              {err && (
                <Text component='span' variant='errorLabel' size='micro' role='alert'>
                  {err}
                </Text>
              )}
            </form>
          )}
        </>
      )}

      <ConfirmationModal
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        onCancel={() => setConfirm(null)}
        title={
          confirm?.kind === 'leave'
            ? `leave ${teamName}`
            : confirm?.kind === 'owner'
              ? `make ${confirm.member.email ?? ''} owner`
              : `remove ${confirm?.member.email ?? ''}`
        }
        confirmLabel={
          confirm?.kind === 'leave' ? 'leave' : confirm?.kind === 'owner' ? 'make owner' : 'remove'
        }
        cancelLabel='cancel'
        width='sm'
        lowercase
        sheet
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'owner') applyRole(confirm.member, 'owner');
          else if (confirm.kind === 'leave') leave(confirm.member);
          else act.remove.mutate(confirm.member.username ?? '');
          if (confirm.kind !== 'owner') setOpen('');
        }}
      >
        {confirm?.kind === 'leave' ? (
          <>
            <Row label='you' value={confirm.member.email} />
            <Row label='access' value='none' tone='error' />
          </>
        ) : confirm?.kind === 'owner' ? (
          <>
            <Row label='email' value={confirm.member.email} />
            <Row label='access' value='full' />
          </>
        ) : confirm ? (
          <>
            <Row label='email' value={confirm.member.email} />
            <Row label='role' value={confirm.member.role} />
          </>
        ) : null}
      </ConfirmationModal>
    </Section>
  );
}
