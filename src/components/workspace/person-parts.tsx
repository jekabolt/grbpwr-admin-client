import type { TeamMember } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import type { ReactNode, SyntheticEvent } from 'react';
import { Avatar, Close, PersonName, Select, Text } from 'ui';
import { avatarName, ROLES, specialtiesWord } from './model';

// The parts of a person line the owner re-drew in fix mockup v4 `inline`: the identity cell
// (name or email · `you` · grey specialties) and the in-line controls (the role select of the
// invite form, the cross of an invited row). Kept apart, so the next pass (first / last name,
// @username) swaps them without touching the line or the rights grid.

/** member first, as in the invite form */
export const ROLE_ITEMS = ROLES.map((r) => ({ value: r, label: r })).reverse();

/** The kit's Select lists in uppercase; these keep the role words lowercase. */
export const ROLE_SELECT_CASE = {
  className: '[&_p]:normal-case',
  itemClassName: '[&_p]:normal-case',
};

/**
 * photo · name and quiet @username (the email when the server sends neither) · `you` · specialties. At 1440 the
 * specialties give way first and truncate; on a phone they wrap under the name.
 */
export function PersonIdentity({
  member,
  specialties,
}: {
  member: TeamMember;
  specialties?: string[];
}) {
  const sp = specialtiesWord(specialties);
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <Avatar
        name={member.name?.trim() || avatarName(member)}
        src={member.avatarUrl || undefined}
        title={member.email}
        size={20}
      />
      <span className='flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-2'>
        <span className='flex min-w-0 items-baseline gap-2'>
          <PersonName
            name={member.name}
            username={member.publicUsername}
            fallback={member.email}
            className='break-words group-hover/line:underline group-hover/line:underline-offset-2 group-aria-expanded/line:underline group-aria-expanded/line:underline-offset-2 md:truncate'
          />
          {member.you && (
            <Text component='span' variant='label' size='micro' className='flex-none'>
              you
            </Text>
          )}
        </span>
        {sp && <span className='min-w-0 text-labelColor md:shrink-[1000] md:truncate'>{sp}</span>}
      </span>
    </span>
  );
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Keeps a control's clicks and keys from toggling the line it sits in. */
export function InLine({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('min-w-0', className)} onClick={stop} onKeyDown={stop} onPointerDown={stop}>
      {children}
    </span>
  );
}

/** The role cell: the invite form's select for an editor, the bare word otherwise. */
export function PersonRole({
  member,
  canRole,
  onRole,
  className,
}: {
  member: TeamMember;
  canRole: boolean;
  onRole: (role: string) => void;
  className?: string;
}) {
  if (!canRole)
    return (
      <Text component='span' variant='label' className={cn('truncate', className)}>
        {member.role}
      </Text>
    );
  return (
    <InLine className={className}>
      <Select
        name={`role-${member.username ?? member.email ?? ''}`}
        size='sm'
        aria-label='role'
        items={ROLE_ITEMS}
        value={member.role ?? 'member'}
        onValueChange={(r) => r !== member.role && onRole(r)}
        {...ROLE_SELECT_CASE}
      />
    </InLine>
  );
}

/** The cross at the far right: remove somebody, or leave yourself. */
export function PersonCross({ member, onExit }: { member: TeamMember; onExit: () => void }) {
  return (
    <InLine className='flex justify-end'>
      <Close aria-label={member.you ? 'leave' : 'remove'} onClick={onExit} />
    </InLine>
  );
}
