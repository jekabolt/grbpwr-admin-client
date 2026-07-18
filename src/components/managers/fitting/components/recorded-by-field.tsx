import { useCurrentAccount } from 'components/managers/accounts/utils/hooks';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useEffect } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { FittingFormData } from './schema';

// Radix <Select.Item> can't carry an empty-string value (same constraint the outcome field
// works around elsewhere in this form) — use a sentinel for "nobody picked" and translate it
// back to '' at the field boundary, since the wire contract (recordedBy) is a plain string.
const UNSET = '__unset__';

// "recorded by" used to be free text — typos and inconsistent spellings meant the same person
// showed up as several different strings across fittings. Pick from the same admin-account
// list the tech-card roles picker uses (Q5) so it resolves to one canonical username; a
// pre-existing free-text value still round-trips as its own selectable option instead of
// silently vanishing when an old fitting is opened.
export function RecordedByField({ isEditMode }: { isEditMode: boolean }) {
  const { control, setValue } = useFormContext<FittingFormData>();
  const value = (useWatch({ control, name: 'recordedBy' }) as string) || '';
  const { data: adminsData } = useAdmins();
  const { data: currentAccountData } = useCurrentAccount();

  const admins = adminsData?.admins ?? [];
  const currentUsername = currentAccountData?.account?.username;

  // Default a brand-new fitting to whoever is filling it in. Never touches an existing one —
  // an empty recordedBy there was actually recorded that way.
  useEffect(() => {
    if (!isEditMode && !value && currentUsername) {
      setValue('recordedBy', currentUsername);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, currentUsername]);

  const knownUsernames = new Set(admins.map((a) => a.username).filter(Boolean));
  const items = [
    { value: UNSET, label: '— unset —' },
    ...admins
      .filter((a): a is typeof a & { username: string } => !!a.username)
      .map((a) => ({ value: a.username, label: a.username })),
    ...(value && !knownUsernames.has(value) ? [{ value, label: `${value} (legacy)` }] : []),
  ];

  return (
    <Controller
      control={control}
      name='recordedBy'
      render={({ field }) => (
        <label className='flex flex-col gap-1'>
          <Text variant='uppercase' size='small' component='span'>
            recorded by (optional)
          </Text>
          <Select
            name='recordedBy'
            items={items}
            value={field.value ? String(field.value) : UNSET}
            onValueChange={(val?: string) => field.onChange(val === UNSET ? '' : (val ?? ''))}
            fullWidth
          />
        </label>
      )}
    />
  );
}
