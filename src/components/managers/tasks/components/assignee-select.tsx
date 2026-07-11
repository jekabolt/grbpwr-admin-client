import { useAccounts } from 'components/managers/accounts/utils/hooks';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';

// Radix Select forbids an empty-string item value, so "unassigned" uses a sentinel.
const NONE = '__none__';

// Assignee picker sourced from ListAccounts (identity = AdminAccount.username).
// Falls back to a free-text username when the account list is unavailable (e.g.
// the current user lacks the accounts-read permission).
export function AssigneeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (username: string) => void;
}) {
  const { data } = useAccounts(true);
  const accounts = (data?.accounts ?? []).filter((a) => !a.disabled);

  if (accounts.length === 0) {
    return (
      <Input
        name='assignee'
        placeholder='username (unassigned if empty)'
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  }

  const items = [
    { value: NONE, label: 'unassigned' },
    ...accounts.map((a) => ({ value: a.username as string, label: a.username as string })),
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
