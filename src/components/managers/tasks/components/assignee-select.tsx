import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';

// Radix Select forbids an empty-string item value, so "unassigned" uses a sentinel.
const NONE = '__none__';

// Assignee picker sourced from ListAdmins (identity = username, same string the task carries).
//
// It used to read ListAccounts, which is gated on the accounts section: a person with the tasks
// section and without accounts:read got a refusal here and an empty picker on a screen that was
// open to them — they could not assign anybody at all. ListAdmins is allowlisted for any
// authenticated account and answers with names only, no permissions, which is exactly what a
// picker needs.
//
// A saved assignee who is NOT in the list is kept as its own option: ListAdmins excludes disabled
// accounts, so the person a task was assigned to before they left would otherwise read as
// "unassigned" in this select — a lie about a task that has an owner, and one keystroke away from
// being made true by the next save. The task's own captions (card and detail) print `assignee`
// straight off the record and never consult this list.
export function AssigneeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (username: string) => void;
}) {
  const { data, isError } = useAdmins();
  const admins = (data?.admins ?? []).filter(
    (a): a is typeof a & { username: string } => !!a.username,
  );

  // Only a failed request drops to free text now — not a refusal, which can no longer happen.
  // Losing the ability to name an owner because a list call timed out would be worse than a
  // typed username, and the field is a plain string on the wire either way.
  if (isError) {
    return (
      <Input
        name='assignee'
        placeholder='username (unassigned if empty)'
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  }

  const known = new Set(admins.map((a) => a.username));
  const items = [
    { value: NONE, label: 'unassigned' },
    ...admins.map((a) => ({ value: a.username, label: a.username })),
    ...(value && !known.has(value) ? [{ value, label: value }] : []),
  ];

  return (
    <SelectComponent
      name='assignee'
      value={value === '' ? NONE : value}
      onValueChange={(v: string) => onChange(v === NONE ? '' : v)}
      placeholder='unassigned'
      items={items}
      fullWidth
    />
  );
}
