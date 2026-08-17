import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useState } from 'react';
import { Avatar } from 'ui/components/avatar';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { useSetFulfillmentAssignee } from '../hooks/useFulfillment';

// ffAssign v2 — the assignee is an Avatar on the card that opens a Popover to
// pick or clear the owner. Reuses the existing SetFulfillmentAssignee RPC via the
// annotation hook (keyed by the order uuid); the board refetches on settle so the
// face updates in place. The wrapping span stops the click bubbling to the card's
// open handler, so tapping the face never also opens the detail.
//
// The candidates come from ListAdmins, not ListAccounts: the latter is gated on the accounts
// section, so a packer with fulfillment:write and without accounts:read opened this popover onto
// an empty list — "there is nobody to assign" where the truth was "you may not read accounts".
//
// The face on the card is drawn from the `assignee` PROP, i.e. from the order's own annotation,
// and never resolved through the list — ListAdmins omits disabled accounts, so a card owned by
// somebody who has since left keeps its face and its name. That same owner is also pinned into
// the rows below, otherwise the popover would show no tick anywhere and read as unassigned.
export function CardAssignee({
  orderUuid,
  assignee,
  canWrite,
}: {
  orderUuid: string;
  assignee: string;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const setAssignee = useSetFulfillmentAssignee(orderUuid);
  const { data } = useAdmins(canWrite);
  const candidates = (data?.admins ?? [])
    .map((a) => a.username)
    .filter((u): u is string => !!u);
  const usernames =
    assignee && !candidates.includes(assignee) ? [assignee, ...candidates] : candidates;

  // Read-only viewers just see the face, never the picker.
  if (!canWrite) {
    return <Avatar name={assignee} />;
  }

  const pick = (username: string) => {
    if (username !== assignee) setAssignee.mutate(username);
    setOpen(false);
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <GenericPopover
        open={open}
        onOpenChange={setOpen}
        title='assignee'
        triggerProps={{ 'aria-label': assignee ? `assigned to ${assignee}` : 'assign someone' }}
        openElement={<Avatar name={assignee} />}
      >
        <div className='flex flex-col'>
          <AssigneeRow
            label='unassigned'
            name=''
            selected={assignee === ''}
            onClick={() => pick('')}
          />
          {usernames.map((u) => (
            <AssigneeRow
              key={u}
              label={u}
              name={u}
              selected={assignee === u}
              onClick={() => pick(u)}
            />
          ))}
          {usernames.length === 0 && (
            <Text size='micro' variant='label' component='span' className='px-1 py-1.5'>
              nobody to assign
            </Text>
          )}
        </div>
      </GenericPopover>
    </span>
  );
}

function AssigneeRow({
  label,
  name,
  selected,
  onClick,
}: {
  label: string;
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={selected}
      className={
        'flex items-center gap-2 px-1 py-1 text-left transition-colors hover:bg-bgZebra ' +
        (selected ? 'text-textColor' : 'text-labelColor')
      }
    >
      <Avatar name={name} />
      <Text size='micro' component='span' className='uppercase tracking-label'>
        {label}
      </Text>
      {selected && (
        <Text size='micro' component='span' className='ml-auto'>
          ✓
        </Text>
      )}
    </button>
  );
}
