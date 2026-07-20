import { cn } from 'lib/utility';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import { useAcctAccounts, useAcctPeriods } from '../../utils/hooks';
import {
  monthsForAsOf,
  monthsInRange,
  presetLastMonth,
  presetThisMonth,
  presetYTD,
  rangePeriodStatus,
} from './report-utils';

export type ControlsMode = 'range' | 'asOf' | 'ledger';

type Patch = Partial<{ from: string; to: string; asOf: string; code: string }>;

type Props = {
  mode: ControlsMode;
  from: string;
  to: string;
  asOf: string;
  code: string;
  onChange: (patch: Patch) => void;
};

// Shared date/account bar above every report (04): from/to date inputs + this month · last month ·
// YTD presets (range & ledger modes), a single as-of date (BS), a non-archived account select
// (ledger), and — always — an OPEN/CLOSED period badge next to the dates so an analyst can tell
// preliminary figures from final at a glance (§8.5). All state lives in searchParams via onChange,
// so any view is a shareable link.
export function RangeControls({ mode, from, to, asOf, code, onChange }: Props) {
  const isRange = mode === 'range' || mode === 'ledger';
  const showPresets = isRange;

  const { data: accountsData } = useAcctAccounts(false);
  const { data: periodsData } = useAcctPeriods();
  const periods = periodsData?.periods ?? [];

  const accountItems = (accountsData?.accounts ?? [])
    .filter((a) => !a.archived && a.code)
    .map((a) => ({ value: a.code as string, label: `${a.code} — ${a.name ?? ''}` }));

  const months = mode === 'asOf' ? monthsForAsOf(asOf) : monthsInRange(from, to);
  const status = rangePeriodStatus(months, periods);

  const presetBtn =
    'border border-textInactiveColor px-2 py-1 text-textBaseSize uppercase hover:bg-textColor hover:text-bgColor transition-colors';

  return (
    <div className='flex flex-wrap items-end justify-between gap-4 border-b border-textInactiveColor pb-3'>
      <div className='flex flex-wrap items-end gap-4'>
        {mode === 'asOf' ? (
          <label className='flex flex-col gap-1'>
            <Text size='small' variant='inactive'>
              as of
            </Text>
            <Input
              type='date'
              name='asOf'
              value={asOf}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onChange({ asOf: e.target.value })
              }
              className='w-40'
            />
          </label>
        ) : (
          <>
            <label className='flex flex-col gap-1'>
              <Text size='small' variant='inactive'>
                from
              </Text>
              <Input
                type='date'
                name='from'
                value={from}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange({ from: e.target.value })
                }
                className='w-40'
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small' variant='inactive'>
                to
              </Text>
              <Input
                type='date'
                name='to'
                value={to}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onChange({ to: e.target.value })
                }
                className='w-40'
              />
            </label>
          </>
        )}

        {showPresets && (
          <div className='flex items-center gap-2 pb-0.5'>
            <button type='button' className={presetBtn} onClick={() => onChange(presetThisMonth())}>
              this month
            </button>
            <button type='button' className={presetBtn} onClick={() => onChange(presetLastMonth())}>
              last month
            </button>
            <button type='button' className={presetBtn} onClick={() => onChange(presetYTD())}>
              YTD
            </button>
          </div>
        )}

        {mode === 'ledger' && (
          <label className='flex min-w-64 flex-col gap-1'>
            <Text size='small' variant='inactive'>
              account
            </Text>
            <Select
              name='ledger-account'
              placeholder='select account'
              fullWidth
              value={code || undefined}
              items={accountItems}
              onValueChange={(v: string) => onChange({ code: v })}
            />
          </label>
        )}
      </div>

      <div
        className='flex items-center gap-1.5 pb-0.5'
        title={
          status === 'closed'
            ? 'every month in this range is closed — figures are final'
            : 'this range includes an open month — figures may still change'
        }
      >
        <Text size='small' variant='inactive'>
          period
        </Text>
        <span
          className={cn(
            'whitespace-nowrap text-textBaseSize uppercase',
            status === 'closed' ? 'text-textInactiveColor' : 'text-textColor',
          )}
        >
          {status === 'closed' ? 'closed' : 'open'}
        </span>
      </div>
    </div>
  );
}
