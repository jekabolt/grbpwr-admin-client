import { common_TechCardRole, common_TechCardRoleAssignment } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { fieldErrorSummary } from 'utils/field-errors';
import { useAdmins, useAssignRole, useRemoveRoleAssignment, useRoleAssignments } from './useRoles';

// DELIBERATE: every control in here writes through its own RPC the moment it changes — assignments
// are keyed to a saved tech_card_id and are not part of the card's draft. Naming who is responsible
// is not a draft edit, so it is not staged behind the card's save button and never rides its
// payload. Do not "fix" this into the form.

// The four responsible roles that replace the removed free-text designer/constructor/technologist/
// approved_by header fields (Q5). Multi per role (an assignment table, not a single name).
const ROLES: { role: common_TechCardRole; label: string }[] = [
  { role: 'TECH_CARD_ROLE_DESIGNER', label: 'designer' },
  { role: 'TECH_CARD_ROLE_CONSTRUCTOR', label: 'constructor' },
  { role: 'TECH_CARD_ROLE_TECHNOLOGIST', label: 'technologist' },
  { role: 'TECH_CARD_ROLE_APPROVER', label: 'approver' },
];

function RoleRow({
  techCardId,
  role,
  label,
  assignments,
  canEdit,
}: {
  techCardId: number;
  role: common_TechCardRole;
  label: string;
  assignments: common_TechCardRoleAssignment[];
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const { data: adminsData } = useAdmins();
  const assign = useAssignRole(techCardId);
  const remove = useRemoveRoleAssignment(techCardId);
  const [addOpen, setAddOpen] = useState(false);

  const admins = adminsData?.admins ?? [];
  const mine = assignments.filter((a) => a.role === role);
  const assignedIds = new Set(mine.map((a) => a.adminId));
  const available = admins.filter((a) => a.id != null && !assignedIds.has(a.id));

  const add = (adminId: number) => {
    if (!adminId) return;
    setAddOpen(false);
    assign.mutate(
      { role, adminId },
      { onError: (e) => showMessage(fieldErrorSummary(e, 'could not assign role'), 'error') },
    );
  };
  const drop = (id?: number) => {
    if (id == null) return;
    remove.mutate(id, {
      onError: (e) => showMessage(fieldErrorSummary(e, 'could not remove assignment'), 'error'),
    });
  };

  return (
    <div className='space-y-1 border-b border-hairline pb-2 last:border-b-0 last:pb-0'>
      {/* same 10px uppercase field label the form fields render, without the form plumbing */}
      <Text size='micro' variant='label' tracking='label' className='uppercase leading-none'>
        {label}
      </Text>
      {/* Who holds the role and the way to add one are two different things, so they get a real
          column gap — as one flow at chip spacing the "+" read as another assigned person. */}
      <div className='flex flex-wrap items-center gap-x-5 gap-y-1'>
        {mine.length === 0 ? (
          <Text size='micro' variant='label' component='span'>
            — none —
          </Text>
        ) : (
          <ChipRow>
            {mine.map((a) => (
              <Chip
                key={a.id}
                selected
                title={a.assignedBy ? `assigned by ${a.assignedBy}` : undefined}
                onRemove={canEdit ? () => drop(a.id) : undefined}
              >
                {a.adminUsername || `#${a.adminId}`}
              </Chip>
            ))}
          </ChipRow>
        )}
        {canEdit && available.length > 0 && (
          // A 220px select for a list of usernames claimed a whole row and read as a field holding
          // a value. Adding a person is an act, so it's a "+" that opens the app's popover shell —
          // the same grammar as every other small picker here.
          <GenericPopover
            open={addOpen}
            onOpenChange={setAddOpen}
            title={`add ${label}`}
            className='w-[200px]'
            triggerProps={{
              disabled: assign.isPending,
              'aria-label': `add ${label}`,
            }}
            openElement={
              // A span, not a Chip button: the popover trigger is already a button.
              <Chip dashed className={assign.isPending ? 'opacity-50' : 'hover:border-textColor'}>
                {assign.isPending ? '…' : '+'}
              </Chip>
            }
          >
            <div className='flex flex-col'>
              {available.map((a) => (
                <button
                  key={a.id}
                  type='button'
                  className='border-b border-hairline py-1 text-left last:border-b-0 hover:bg-bgZebra'
                  onClick={() => add(a.id ?? 0)}
                >
                  <Text size='micro' component='span'>
                    {a.username || `#${a.id}`}
                  </Text>
                </button>
              ))}
            </div>
          </GenericPopover>
        )}
      </div>
    </div>
  );
}

// Responsible-account roles (Q5): edit-mode only — assignments are keyed to a saved tech_card_id and
// managed via their own RPCs, so they never ride the tech-card save.
// Phase 19 exception (19.5): this panel saves INSTANTLY on change and deliberately does NOT stage
// into the card's one save — assigning a person is an act, not a draft edit.
export function RolesField({ techCardId, canEdit }: { techCardId: number; canEdit: boolean }) {
  const { data, isLoading } = useRoleAssignments(techCardId);
  const assignments = data?.assignments ?? [];

  if (isLoading)
    return (
      <Text size='micro' variant='label'>
        loading…
      </Text>
    );

  return (
    <div className='flex flex-col gap-2'>
      {ROLES.map((r) => (
        <RoleRow
          key={r.role}
          techCardId={techCardId}
          role={r.role}
          label={r.label}
          assignments={assignments}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
