import { AdminRef, common_TechCardRole, common_TechCardRoleAssignment } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { fieldErrorSummary } from 'utils/field-errors';
import { Counter } from './design/core';
import { useAdmins, useAssignRole, useRemoveRoleAssignment } from './useRoles';

// DELIBERATE: every control in here writes through its own RPC the moment it changes — assignments
// are keyed to a saved tech_card_id and are not part of the card's draft. Naming who is responsible
// is not a draft edit, so it is not staged behind the card's save button and never rides its
// payload. Do not "fix" this into the form.

/**
 * The four responsible roles (Q5) — FOUR FIXED ROWS, in this order, each holding a LIST of people
 * (an assignment table, not a single name). `required` is the asterisk on the label: the first
 * three are what a card needs to be worked on, the approver is not (the prototype's `req:false`).
 */
export const ROLES: { role: common_TechCardRole; label: string; required: boolean }[] = [
  { role: 'TECH_CARD_ROLE_DESIGNER', label: 'designer', required: true },
  { role: 'TECH_CARD_ROLE_CONSTRUCTOR', label: 'constructor', required: true },
  { role: 'TECH_CARD_ROLE_TECHNOLOGIST', label: 'technologist', required: true },
  { role: 'TECH_CARD_ROLE_APPROVER', label: 'approver', required: false },
];

/**
 * One row: `LABEL *` · the people as chips (✕ in the chip takes them off) · `NONE` while empty ·
 * `+ assign`, which opens the picker.
 *
 * ONE GESTURE FOR BOTH SIDES. A chip in the row removes; a chip in the picker puts on or takes off,
 * filled while the person holds the role. The picker does NOT close on a choice — two people are
 * usually assigned at once — and its search is its own, dying with the popover.
 *
 * The row is `flex-1 … justify-center` on purpose (prototype `.brow.even`): the four rows share the
 * column's height equally, and the column is stretched to the tiles beside it.
 */
function RoleRow({
  techCardId,
  role,
  label,
  required,
  assignments,
  canEdit,
}: {
  techCardId?: number;
  role: common_TechCardRole;
  label: string;
  required: boolean;
  assignments: common_TechCardRoleAssignment[];
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  // Options only — never captions: a disabled account drops out of this list, and whoever holds
  // the role is named from the assignment itself (`adminUsername`), see useRoles.
  const { data: adminsData } = useAdmins(canEdit && !!techCardId);
  const assign = useAssignRole(techCardId ?? 0);
  const remove = useRemoveRoleAssignment(techCardId ?? 0);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const admins = adminsData?.admins ?? [];
  const mine = assignments.filter((a) => a.role === role);
  const held = new Map<number, common_TechCardRoleAssignment>();
  for (const a of mine) if (a.adminId != null) held.set(a.adminId, a);
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? admins.filter((a) => (a.username ?? '').toLowerCase().includes(needle))
    : admins;
  const busy = assign.isPending || remove.isPending;

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
  const toggle = (a: AdminRef) => {
    const id = a.id ?? 0;
    const has = held.get(id);
    if (has) drop(has.id);
    else add(id);
  };

  return (
    <div
      className='flex flex-1 flex-col justify-center border-b border-hairline pb-1.5'
      data-role-row={label}
    >
      <div className='flex flex-wrap items-center gap-2'>
        {/* the same 10px uppercase label the form fields render, on a fixed 104px track so the
            chips of four rows start on one line */}
        <Text
          size='micro'
          variant='label'
          tracking='label'
          component='span'
          className='w-[104px] shrink-0 uppercase leading-none'
        >
          {label}
          {required && <span className='font-bold text-textColor'> *</span>}
        </Text>
        <ChipRow className='min-w-0 flex-1'>
          {mine.map((a) => (
            <Chip
              key={a.id}
              title={a.assignedBy ? `assigned by ${a.assignedBy}` : undefined}
              onRemove={canEdit && techCardId ? () => drop(a.id) : undefined}
              aria-label={canEdit ? `remove ${a.adminUsername || `#${a.adminId}`} from ${label}` : undefined}
            >
              {a.adminUsername || `#${a.adminId}`}
            </Chip>
          ))}
          {/* A gap, not a fault: a dashed pill says «nobody yet» without painting the approver —
              who is not even required — red. */}
          {mine.length === 0 && (
            <Pill tone='mut' className='border-dashed'>
              none
            </Pill>
          )}
          {canEdit && techCardId ? (
            <GenericPopover
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setQ('');
              }}
              title={`assign ${label}`}
              className='w-[280px]'
              triggerProps={{
                disabled: busy && !open,
                'aria-label': `assign somebody to ${label}`,
              }}
              openElement={
                // A span, not a Chip button: the popover trigger is already a button.
                <Chip dashed className='hover:border-textColor'>
                  + assign
                </Chip>
              }
            >
              <Input
                value={q}
                autoFocus
                autoComplete='off'
                placeholder={`search ${admins.length} admins`}
                aria-label={`search people for ${label}`}
                className='mb-1.5'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
              />
              {hits.length === 0 ? (
                <Text size='micro' variant='label'>
                  {admins.length === 0 ? 'no admins to pick from' : 'nobody matches'}
                </Text>
              ) : (
                <ChipRow>
                  {hits.map((a) => {
                    const on = held.has(a.id ?? 0);
                    const who = a.username || `#${a.id}`;
                    return (
                      <Chip
                        key={a.id}
                        selected={on}
                        pressed={on}
                        disabled={busy}
                        onClick={() => toggle(a)}
                        aria-label={on ? `take ${who} off ${label}` : `put ${who} on ${label}`}
                      >
                        {who}
                      </Chip>
                    );
                  })}
                </ChipRow>
              )}
              <div className='mt-1.5 flex items-center'>
                <Counter n={hits.length} noun='admin' total={admins.length} />
              </div>
            </GenericPopover>
          ) : null}
        </ChipRow>
      </div>
    </div>
  );
}

/**
 * Responsible-account roles (Q5). Assignments are keyed to a saved tech_card_id and managed via
 * their own RPCs, so they never ride the tech-card save — this panel saves INSTANTLY on change
 * (phase 19 exception, 19.5). On a card that is not saved yet the four rows still stand, empty and
 * without the door, and say why.
 *
 * `assignments` is handed in rather than read here: the caller already reads the assignment list
 * for the card, and one read feeds one panel — the rows cannot disagree with anything above them.
 *
 * СЧЁТЧИКА «N OF 4 ROLES» НАД ЭТИМ ПАНЕЛЕМ БОЛЬШЕ НЕТ (владелец, r3 п.2: «и так видно»); вместе с
 * ним ушёл и экспорт `rolesFilled` — его читал только тот счётчик.
 */
export function RolesField({
  techCardId,
  canEdit,
  assignments,
}: {
  /** The SAVED card's id — undefined on a card that does not exist yet. */
  techCardId?: number;
  canEdit: boolean;
  assignments: common_TechCardRoleAssignment[];
}) {
  return (
    <div className='flex flex-1 flex-col gap-1.5' data-roles=''>
      {ROLES.map((r) => (
        <RoleRow
          key={r.role}
          techCardId={techCardId}
          role={r.role}
          label={r.label}
          required={r.required}
          assignments={assignments}
          canEdit={canEdit}
        />
      ))}
      {!techCardId && (
        <Text size='micro' variant='label'>
          save this tech card first — people are assigned to a saved card, and the assignment
          is written the moment it is made.
        </Text>
      )}
    </div>
  );
}
