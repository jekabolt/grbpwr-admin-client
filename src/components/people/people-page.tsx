import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { clearAuthToken } from 'api/auth-headers';
import type { TeamInvite, TeamMember } from 'api/proto-http/admin';
import { seenWord } from 'components/console/model';
import { goToUrl, rootUrl } from 'lib/host';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import {
  Avatar,
  Button,
  ConfirmationModal,
  Input,
  Loader,
  Pill,
  Placeholder,
  Row,
  Section,
  SectionStack,
  Select,
  Text,
  UndoRow,
} from 'ui';
import {
  inviteErrorWord,
  inviteExpired,
  isLastOwner,
  isOwnerOnly,
  me,
  memberName,
  openInvites,
  ROLES,
  validEmail,
} from './model';
import { usePeople, usePeopleActions } from './use-people';

// Table grammar; below md every row folds into a wrapped line (person on top, the rest under it).
const TH =
  'border-b border-borderColor px-1.5 py-1 text-left align-bottom text-micro font-normal tracking-label text-labelColor whitespace-nowrap';
const TR =
  'hover:[&>td]:bg-pageBg max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:border-b max-md:border-hairline max-md:py-1.5';
const TD =
  'border-b border-hairline px-1.5 py-1 align-middle max-md:block max-md:border-0 max-md:p-0';
const FIRST = 'max-md:basis-full';
const LAST = 'text-right max-md:ml-auto';
const GROUP =
  'border-b border-borderColor px-1.5 pb-1 pt-3.5 text-left text-micro font-bold tracking-group text-labelColor max-md:block max-md:basis-full';

type Confirm = { kind: 'remove'; member: TeamMember } | { kind: 'leave'; member: TeamMember };

const ROLE_ITEMS = ROLES.map((r) => ({ value: r, label: r }));

/** `/people` on a team host: who is in the team, who is invited, and the invite form. */
export default function PeoplePage() {
  const { name: teamName, readOnly } = useWorkspace();
  const people = usePeople();
  const act = usePeopleActions();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [revoking, setRevoking] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('member');
  const [err, setErr] = useState('');

  const members = people.data?.members ?? [];
  const invites = openInvites(people.data?.invites);
  const self = me(members);
  // people changes are owner only: a member sees the list without any action
  const owner = self?.role === 'owner';
  const cols = owner ? 4 : 3;
  const shownInvites =
    invites.length - invites.filter((i) => revoking.has(i.inviteRef ?? '')).length;

  const mark = (set: typeof setRevoking, ref: string, on: boolean) =>
    set((cur) => {
      const next = new Set(cur);
      if (on) next.add(ref);
      else next.delete(ref);
      return next;
    });

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
    if (readOnly) return;
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

  const changeInviteRole = (i: TeamInvite, next: string) =>
    act.invite.mutate(
      { email: i.email ?? '', role: next },
      { onError: (x) => !isOwnerOnly(x) && showMessage(inviteErrorWord(x), 'error') },
    );

  const resend = (ref: string) =>
    act.resend.mutate(ref, { onSuccess: () => mark(setSent, ref, true) });

  return (
    <SectionStack>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-borderColor pb-3'>
        <Text component='h1' size='large'>
          people · {members.length}
        </Text>
        {readOnly && <Pill tone='warn'>read only</Pill>}
      </div>

      {people.isLoading ? (
        <Loader />
      ) : people.isError ? (
        <Section>
          <Placeholder label='not loaded' tone='error' />
        </Section>
      ) : (
        <Section>
          <div className='relative w-full overflow-x-auto'>
            <table className='w-full border-collapse tabular-nums'>
              <thead className='max-md:hidden'>
                <tr>
                  <th className={TH}>person</th>
                  <th className={TH}>role</th>
                  <th className={TH}>seen</th>
                  {owner && <th className={TH} aria-label='actions' />}
                </tr>
              </thead>
              <tbody className='max-md:block'>
                {members.map((m) => {
                  const last = isLastOwner(m, members);
                  const name = memberName(m);
                  return (
                    <tr key={m.username || m.email} className={TR}>
                      <td className={cn(TD, FIRST)}>
                        <div className='flex min-w-0 items-center gap-2'>
                          <Avatar name={name} size={24} />
                          <div className='flex min-w-0 flex-col'>
                            <span className='flex flex-wrap items-center gap-x-1.5'>
                              {name}
                              {m.you && (
                                <Text component='span' variant='label' size='micro'>
                                  you
                                </Text>
                              )}
                              {last && <Pill tone='ink'>last owner</Pill>}
                            </span>
                            <Text variant='label' size='micro' className='break-all'>
                              {m.email}
                            </Text>
                          </div>
                        </div>
                      </td>
                      <td className={TD}>
                        {owner ? (
                          <div className='w-28'>
                            <Select
                              name={`role-${m.username}`}
                              size='sm'
                              aria-label={`role · ${name}`}
                              items={ROLE_ITEMS}
                              value={m.role}
                              disabled={readOnly || last}
                              onValueChange={(v) =>
                                v !== m.role &&
                                act.setRole.mutate({
                                  username: m.username ?? '',
                                  role: v,
                                  was: m.role ?? '',
                                })
                              }
                            />
                          </div>
                        ) : (
                          m.role
                        )}
                      </td>
                      <td className={TD}>
                        <Text variant='label' size='micro'>
                          {seenWord(m.lastSeenAt)}
                        </Text>
                      </td>
                      {owner && (
                        <td className={cn(TD, LAST)}>
                          <span className='inline-flex justify-end'>
                            <Button
                              variant='underline'
                              disabled={readOnly || (m.you && last)}
                              onClick={() =>
                                setConfirm({ kind: m.you ? 'leave' : 'remove', member: m })
                              }
                            >
                              {m.you ? 'leave' : 'remove'}
                            </Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {invites.length > 0 && (
                <tbody className='max-md:block'>
                  <tr className='max-md:flex'>
                    <td colSpan={cols} className={GROUP}>
                      invited {shownInvites}
                    </td>
                  </tr>
                  {invites.map((i) => {
                    const ref = i.inviteRef ?? '';
                    if (revoking.has(ref))
                      return (
                        <UndoRow
                          key={ref}
                          colSpan={cols}
                          name={i.email}
                          onUndo={() => mark(setRevoking, ref, false)}
                          onCommit={() =>
                            act.revoke.mutate(ref, {
                              onSettled: () => mark(setRevoking, ref, false),
                            })
                          }
                        />
                      );
                    const expired = inviteExpired(i);
                    const done = sent.has(ref);
                    return (
                      <tr key={ref} className={TR}>
                        <td className={cn(TD, FIRST)}>
                          <div className='flex min-w-0 items-center gap-2'>
                            <Avatar size={24} />
                            <div className='flex min-w-0 flex-col'>
                              <span className='break-all'>{i.email}</span>
                              <Text variant='label' size='micro'>
                                sent {seenWord(i.sentAt)}
                              </Text>
                            </div>
                          </div>
                        </td>
                        <td className={TD}>
                          {owner ? (
                            <div className='w-28'>
                              <Select
                                name={`invite-role-${ref}`}
                                size='sm'
                                aria-label={`role · ${i.email}`}
                                items={ROLE_ITEMS}
                                value={i.role}
                                disabled={readOnly}
                                onValueChange={(v) => v !== i.role && changeInviteRole(i, v)}
                              />
                            </div>
                          ) : (
                            i.role
                          )}
                        </td>
                        <td className={TD}>
                          {expired ? (
                            <Pill tone='warn'>expired</Pill>
                          ) : (
                            <Pill tone='attention'>invited</Pill>
                          )}
                        </td>
                        {owner && (
                          <td className={cn(TD, LAST)}>
                            <span className='inline-flex flex-wrap justify-end gap-3'>
                              <Button
                                variant='underline'
                                disabled={readOnly || done || act.resend.isPending}
                                onClick={() => resend(ref)}
                              >
                                {done ? 'sent' : 'resend'}
                              </Button>
                              <Button
                                variant='underline'
                                disabled={readOnly}
                                onClick={() => mark(setRevoking, ref, true)}
                              >
                                revoke
                              </Button>
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>

          {owner && (
            <form
              className='mt-1.5 flex flex-wrap items-center gap-2'
              noValidate
              onSubmit={submitInvite}
            >
              <div className='max-w-[22.5rem] flex-[1_1_13.75rem]'>
                <Input
                  name='invite-email'
                  type='email'
                  placeholder='email'
                  autoComplete='off'
                  aria-label='invite email'
                  aria-invalid={err ? true : undefined}
                  disabled={readOnly}
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setEmail(e.target.value);
                    if (err) setErr('');
                  }}
                />
              </div>
              <div className='w-28'>
                <Select
                  name='invite-role'
                  size='sm'
                  aria-label='invite role'
                  items={ROLE_ITEMS}
                  value={role}
                  disabled={readOnly}
                  onValueChange={setRole}
                />
              </div>
              <Button
                variant='main'
                className='whitespace-nowrap px-3 py-0.5'
                type='submit'
                disabled={readOnly || act.invite.isPending}
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
        </Section>
      )}

      <ConfirmationModal
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        onCancel={() => setConfirm(null)}
        title={
          confirm?.kind === 'leave'
            ? `leave ${teamName}`
            : `remove ${confirm ? memberName(confirm.member) : ''}`
        }
        confirmLabel={confirm?.kind === 'leave' ? 'leave' : 'remove'}
        cancelLabel='cancel'
        width='sm'
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'leave') leave(confirm.member);
          else act.remove.mutate(confirm.member.username ?? '');
        }}
      >
        {confirm?.kind === 'leave' ? (
          <>
            <Row label='you' value={confirm.member.email} />
            <Row label='access' value='none' tone='error' />
          </>
        ) : confirm ? (
          <>
            <Row label='email' value={confirm.member.email} />
            <Row label='role' value={confirm.member.role} />
          </>
        ) : null}
      </ConfirmationModal>
    </SectionStack>
  );
}
