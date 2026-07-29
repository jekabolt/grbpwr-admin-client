import { common_TechCardRole, common_TechCardRoleAssignment } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Chip, ChipRow } from 'ui/components/chip';
import Select from 'ui/components/select';
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

// Radix Select forbids an empty-string item value, so the "pick someone" row needs the same '0'
// sentinel the category browser uses — and re-pinning the value to it after every pick keeps the
// control reading as an action ("+ add designer…") rather than as a filled field.
const NONE = '0';

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

  const admins = adminsData?.admins ?? [];
  const mine = assignments.filter((a) => a.role === role);
  const assignedIds = new Set(mine.map((a) => a.adminId));
  const available = admins.filter((a) => a.id != null && !assignedIds.has(a.id));

  const add = (adminId: number) => {
    if (!adminId) return;
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

  const items = [
    { value: NONE, label: `+ add ${label}…` },
    ...available.map((a) => ({ value: String(a.id), label: a.username || `#${a.id}` })),
  ];

  return (
    <div className='space-y-px border-b border-hairline pb-2 last:border-b-0 last:pb-0'>
      {/* same 10px uppercase field label the form fields render, without the form plumbing */}
      <Text size='micro' variant='label' tracking='label' className='uppercase leading-none'>
        {label}
      </Text>
      <div className='flex flex-wrap items-center gap-1'>
        {mine.length === 0 && (
          <Text size='micro' variant='label' component='span'>
            — none —
          </Text>
        )}
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
      </div>
      {canEdit && available.length > 0 && (
        <Select
          name={`role-${role}`}
          className='max-w-[220px]'
          items={items}
          value={NONE}
          placeholder={`+ add ${label}…`}
          disabled={assign.isPending}
          onValueChange={(v?: string) => add(Number(v) || 0)}
        />
      )}
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
