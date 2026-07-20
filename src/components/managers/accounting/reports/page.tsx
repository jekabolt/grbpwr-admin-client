import { cn } from 'lib/utility';
import { useSearchParams } from 'react-router-dom';
import { AcctSectionHeader } from '../components/section-header';
import { BalanceSheetTab } from './components/balance-sheet';
import { LedgerTab } from './components/ledger';
import { ProfitLossTab } from './components/profit-loss';
import { RangeControls, type ControlsMode } from './components/range-controls';
import { ReconciliationTab } from './components/reconciliation';
import { defaultAsOf, defaultRange } from './components/report-utils';
import { TrialBalanceTab } from './components/trial-balance';
import { VatTab } from './components/vat';

// Reports screen (04): one page, five tabs in ?tab (opex pattern — plain buttons + useSearchParams,
// not Radix Tabs). The whole selection — tab, from/to, asOf, account code — lives in searchParams,
// so every view is a shareable link and the TB/BS/P&L drill-downs, recon and dashboard alerts can
// deep-link into an exact report state (§8.2). searchParams contract:
// ?tab=tb|pl|bs|ledger|recon|vat & from & to & asOf & code.
const TABS = [
  { id: 'tb', label: 'trial balance' },
  { id: 'pl', label: 'p&l' },
  { id: 'bs', label: 'balance sheet' },
  { id: 'ledger', label: 'ledger' },
  { id: 'recon', label: 'reconciliation' },
  { id: 'vat', label: 'vat' },
] as const;

type TabId = (typeof TABS)[number]['id'];

type ParamPatch = Partial<{
  tab: TabId;
  from: string;
  to: string;
  asOf: string;
  code: string;
}>;

export function AcctReportsPage() {
  const [params, setParams] = useSearchParams();

  const rawTab = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'tb';

  // Naked links use current-month / today defaults; a shared link with explicit dates keeps them.
  const def = defaultRange();
  const from = params.get('from') || def.from;
  const to = params.get('to') || def.to;
  const asOf = params.get('asOf') || defaultAsOf();
  const code = params.get('code') || '';

  const patch = (next: ParamPatch) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        (Object.entries(next) as [string, string | undefined][]).forEach(([k, v]) => {
          if (v == null || v === '') p.delete(k);
          else p.set(k, v);
        });
        return p;
      },
      { replace: true },
    );

  // Drill from a TB/P&L row: same range, switch to ledger. From a BS row: there's no range, so scope
  // the ledger to everything up to the as-of date (from cleared, to=asOf) — the history that built
  // that balance.
  const drillToLedger = (accountCode: string, fromBalanceSheet = false) =>
    patch(
      fromBalanceSheet
        ? { tab: 'ledger', code: accountCode, from: undefined, to: asOf }
        : { tab: 'ledger', code: accountCode, from, to },
    );

  const mode: ControlsMode = tab === 'bs' ? 'asOf' : tab === 'ledger' ? 'ledger' : 'range';

  const tabBtn = 'border px-3 py-1.5 text-textBaseSize uppercase transition-colors';

  return (
    <div className='flex flex-col gap-4 px-2.5 pb-16'>
      <AcctSectionHeader />

      <div className='flex flex-wrap items-center gap-1'>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type='button'
              onClick={() => patch({ tab: t.id })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                tabBtn,
                active
                  ? 'border-textColor text-textColor'
                  : 'border-textInactiveColor text-textInactiveColor hover:text-textColor',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <RangeControls
        mode={mode}
        from={from}
        to={to}
        asOf={asOf}
        code={code}
        onChange={(c) => patch(c)}
      />

      {tab === 'tb' && <TrialBalanceTab from={from} to={to} onDrill={(c) => drillToLedger(c)} />}
      {tab === 'pl' && <ProfitLossTab from={from} to={to} onDrill={(c) => drillToLedger(c)} />}
      {tab === 'bs' && <BalanceSheetTab asOf={asOf} onDrill={(c) => drillToLedger(c, true)} />}
      {tab === 'ledger' && <LedgerTab code={code} from={from} to={to} />}
      {tab === 'recon' && <ReconciliationTab from={from} to={to} />}
      {tab === 'vat' && <VatTab from={from} />}
    </div>
  );
}
