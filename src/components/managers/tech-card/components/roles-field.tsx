import { common_TechCardRole, common_TechCardRoleAssignment } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { fieldErrorSummary } from 'utils/field-errors';
import { useAdmins, useAssignRole, useRemoveRoleAssignment, useRoleAssignments } from './useRoles';

// The four responsible roles that replace the removed free-text designer/constructor/technologist/
// approved_by header fields (Q5). Multi per role (an assignment table, not a single name).
const ROLES: { role: common_TechCardRole; label: string }[] = [
  { role: 'TECH_CARD_ROLE_DESIGNER', label: 'designer' },
  { role: 'TECH_CARD_ROLE_CONSTRUCTOR', label: 'constructor' },
  { role: 'TECH_CARD_ROLE_TECHNOLOGIST', label: 'technologist' },
  { role: 'TECH_CARD_ROLE_APPROVER', label: 'approver' },
];

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

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

  return (
    <div className='flex flex-col gap-1.5 border-b border-textInactiveColor pb-3 last:border-b-0 last:pb-0'>
      <Text variant='label' size='small'>
        {label}
      </Text>
      <div className='flex flex-wrap items-center gap-1.5'>
        {mine.length === 0 && (
          <Text variant='inactive' size='small'>
            — none —
          </Text>
        )}
        {mine.map((a) => (
          <span
            key={a.id}
            className='flex items-center gap-1 border border-textInactiveColor px-2 py-0.5 text-textBaseSize'
            title={a.assignedBy ? `assigned by ${a.assignedBy}` : undefined}
          >
            {a.adminUsername || `#${a.adminId}`}
            {canEdit && (
              <button
                type='button'
                aria-label={`remove ${label}`}
                className='text-textInactiveColor hover:text-textColor'
                onClick={() => drop(a.id)}
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && available.length > 0 && (
        <select
          className={`${cell} max-w-xs`}
          value={0}
          disabled={assign.isPending}
          onChange={(e) => add(Number(e.target.value) || 0)}
        >
          <option value={0}>+ add {label}…</option>
          {available.map((a) => (
            <option key={a.id} value={a.id}>
              {a.username || `#${a.id}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Responsible-account roles (Q5): edit-mode only — assignments are keyed to a saved tech_card_id and
// managed via their own RPCs, so they never ride the tech-card save.
export function RolesField({ techCardId, canEdit }: { techCardId: number; canEdit: boolean }) {
  const { data, isLoading } = useRoleAssignments(techCardId);
  const assignments = data?.assignments ?? [];

  if (isLoading) return <Text size='small'>loading…</Text>;

  return (
    <div className='flex flex-col gap-3'>
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
