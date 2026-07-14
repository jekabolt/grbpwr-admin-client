import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { MonthlyTab } from './components/monthly-tab';
import { RecurringTab } from './components/recurring-tab';

// OPEX v2 (NF-08): monthly fixed-cost lines + recurring templates. Replaces the analytics blind-write
// modal. View lives in the URL (R-1) so a tab is shareable.
export function OpexPage() {
  const { canReadCosting } = usePermissions();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'recurring' ? 'recurring' : 'monthly';
  const setView = (v: 'monthly' | 'recurring') =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v === 'recurring') p.set('view', 'recurring');
        else p.delete('view');
        return p;
      },
      { replace: true },
    );

  const toggle = 'border px-3 py-1.5 text-textBaseSize uppercase transition-colors';
  return (
    <div className='flex flex-col gap-6 pb-16'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <Text variant='uppercase' size='large'>
          opex
        </Text>
        <div className='flex items-center'>
          <button
            type='button'
            onClick={() => setView('monthly')}
            className={`${toggle} ${
              view === 'monthly'
                ? 'border-textColor text-textColor'
                : 'border-textInactiveColor text-textInactiveColor hover:text-textColor'
            }`}
          >
            monthly
          </button>
          <button
            type='button'
            onClick={() => setView('recurring')}
            className={`${toggle} -ml-px ${
              view === 'recurring'
                ? 'border-textColor text-textColor'
                : 'border-textInactiveColor text-textInactiveColor hover:text-textColor'
            }`}
          >
            recurring
          </button>
        </div>
      </div>

      {/* OPEX is money-only: without costing:read the backend nulls every amount and the page
          would render rows that read as zero cost — say so instead of faking numbers. */}
      {!canReadCosting ? (
        <Text variant='inactive' size='small'>
          OPEX amounts require costing access — ask an admin for the costing section.
        </Text>
      ) : view === 'recurring' ? (
        <RecurringTab />
      ) : (
        <MonthlyTab />
      )}
    </div>
  );
}
