import { TierConfigEntry } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useTierConfig, useUpdateTierConfig } from '../utils/hooks';
import { formatTierLabel } from '../utils/tier-utils';

export function TierConfig() {
  const { data, isLoading, isError, error } = useTierConfig();
  const update = useUpdateTierConfig();
  const [entries, setEntries] = useState<TierConfigEntry[]>([]);
  const { canWrite } = usePermissions();

  useEffect(() => {
    if (data?.entries) setEntries(data.entries.map((e) => ({ ...e })));
  }, [data]);

  const patchEntry = (index: number, patch: Partial<TierConfigEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const dirty = JSON.stringify(entries) !== JSON.stringify(data?.entries ?? []);

  const numberOrZero = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div className='flex flex-col w-full gap-6 pb-24'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          tier configuration
        </Text>
        <Button variant='secondary' size='lg' className='uppercase' asChild>
          <Link to={ROUTES.members}>← members</Link>
        </Button>
      </div>

      <Text variant='inactive' size='small'>
        Changing thresholds does not auto-rebalance existing memberships. Changes are logged to the
        config audit log.
      </Text>

      {isLoading && (
        <Text variant='inactive' className='animate-pulse'>
          loading…
        </Text>
      )}
      {isError && (
        <Text variant='error'>{error instanceof Error ? error.message : 'Failed to load'}</Text>
      )}

      <div className='flex flex-col gap-4'>
        {entries.map((entry, index) => (
          <div
            key={entry.tierCode ?? index}
            className='flex flex-col gap-3 border border-textColor p-4'
          >
            <div className='flex items-center gap-2'>
              <Text variant='uppercase' size='default'>
                {formatTierLabel(entry.tierCode, entry.displayName)}
              </Text>
              {entry.isInviteOnly && (
                <span className='inline-block px-1.5 py-0.5 bg-black text-white'>
                  <Text className='!text-white'>invite-only</Text>
                </span>
              )}
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
              <div className='flex flex-col gap-1'>
                <Text variant='inactive' size='small'>
                  Display name
                </Text>
                <Input
                  name={`display-${index}`}
                  type='text'
                  value={entry.displayName ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    patchEntry(index, { displayName: e.target.value })
                  }
                />
              </div>

              {entry.hasMinSpend && (
                <div className='flex flex-col gap-1'>
                  <Text variant='inactive' size='small'>
                    Min spend (€ / 12mo)
                  </Text>
                  <Input
                    name={`spend-${index}`}
                    type='number'
                    value={entry.minSpendEur ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patchEntry(index, { minSpendEur: numberOrZero(e.target.value) })
                    }
                  />
                </div>
              )}

              <div className='flex flex-col gap-1'>
                <Text variant='inactive' size='small'>
                  Expiration (days)
                </Text>
                <Input
                  name={`exp-${index}`}
                  type='number'
                  value={entry.expirationDays ?? 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    patchEntry(index, { expirationDays: numberOrZero(e.target.value) })
                  }
                />
              </div>

              <div className='flex flex-col gap-1'>
                <Text variant='inactive' size='small'>
                  Reminder (days before)
                </Text>
                <Input
                  name={`rem-${index}`}
                  type='number'
                  value={entry.reminderDaysBefore ?? 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    patchEntry(index, { reminderDaysBefore: numberOrZero(e.target.value) })
                  }
                />
              </div>

              {entry.hasWelcomePackSlots && (
                <div className='flex flex-col gap-1'>
                  <Text variant='inactive' size='small'>
                    Welcome-pack slots left
                  </Text>
                  <Input
                    name={`wp-${index}`}
                    type='number'
                    value={entry.welcomePackSlots ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      patchEntry(index, { welcomePackSlots: numberOrZero(e.target.value) })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {canWrite(SECTION.members) && entries.length > 0 && (
        <div className='fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-textColor bg-bgColor px-3 py-2'>
          <Text variant='inactive' size='small'>
            {dirty ? 'unsaved changes' : ' '}
          </Text>
          <div className='flex items-center gap-2'>
            <Button
              variant='secondary'
              size='lg'
              className='uppercase cursor-pointer'
              onClick={() => setEntries((data?.entries ?? []).map((e) => ({ ...e })))}
              disabled={!dirty}
            >
              reset
            </Button>
            <Button
              variant='main'
              size='lg'
              className='uppercase cursor-pointer'
              onClick={() => update.mutate(entries)}
              disabled={!dirty}
              loading={update.isPending}
            >
              save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
