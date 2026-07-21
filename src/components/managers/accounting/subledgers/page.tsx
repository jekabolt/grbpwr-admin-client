import { AcctPayableRow, AcctReceivableRow, googletype_Decimal } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { AmountCell } from '../components/amount-cell';
import { Note, Pill } from '../components/kit';
import { AcctSectionHeader } from '../components/section-header';
import { ReportState } from '../reports/components/report-utils';
import { formatAcctDate, formatBase } from '../utils/format';
import { usePayables, useReceivables, useSuppliers } from '../utils/hooks';
import { CreateSupplierModal } from './components/create-supplier-modal';

// Sub-tab within the AP/AR screen. Kept in local state (not the URL) — unlike Reports these are
// operational lists, not shareable report states. The approved layout shows payables and
// receivables TOGETHER ("owed & owing"), so the former separate tabs collapse into one.
const TABS = [
  { id: 'owed', label: 'owed & owing' },
  { id: 'suppliers', label: 'suppliers' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// Control total for a subledger: sum the row balances client-side. The backend ships no total (the
// AP/AR responses are just row lists), and this is the one display-arithmetic exception the UX
// guidelines allow (§8.6 #6, same as the manual-entry balance preview) — never a recomputed report
// figure. Returned as a decimal-shaped value so AmountCell renders it with the same red/tabular rules.
function sumBalances(values: (googletype_Decimal | undefined)[]): googletype_Decimal {
  const total = values.reduce((acc, v) => {
    const n = parseFloat(v?.value ?? '');
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return { value: total.toFixed(2) };
}

export function AcctSubledgersPage() {
  const [tab, setTab] = useState<TabId>('owed');

  return (
    <div className='px-2.5'>
      <AcctSectionHeader />

      <div className='flex flex-col gap-4 py-6'>
        <div className='flex flex-wrap items-center gap-1'>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type='button'
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border px-3 py-1.5 text-textBaseSize uppercase transition-colors',
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

        {tab === 'owed' && <OwedOwingSection />}
        {tab === 'suppliers' && <SuppliersSection />}
      </div>
    </div>
  );
}

// Payables and Receivables together — the approved "Two tables" variant. Left: what we owe
// suppliers (open 2010 per supplier, accrued − paid; supplier_id 0 is an untagged 2010 position,
// labelled so it's never mistaken for a named counterparty). Right: what bank-invoice orders owe
// us (open 1040 per order, invoiced − received; ORD- refs deep-link to the order). Headline totals
// and the net-position note reuse the sanctioned client-side control sums; the AP/AR subledger is
// base-currency, hence the € on those figures. "pay" routes to the bank inbox — that's where an
// outgoing payment actually gets booked; there is no payment mutation on this screen.
function OwedOwingSection() {
  const pay = usePayables();
  const rec = useReceivables();

  const payRows = pay.data?.rows ?? [];
  const recRows = rec.data?.rows ?? [];
  const payTotal = sumBalances(payRows.map((r) => r.balance));
  const recTotal = sumBalances(recRows.map((r) => r.balance));

  const payReady = !pay.isLoading && !pay.isError;
  const recReady = !rec.isLoading && !rec.isError;

  const payN = parseFloat(payTotal.value ?? '0');
  const recN = parseFloat(recTotal.value ?? '0');
  const diff = formatBase({ value: Math.abs(payN - recN).toFixed(2) });

  return (
    <div className='flex flex-col gap-4'>
      <div className='grid gap-6 xl:grid-cols-2'>
        {/* You owe — Accounts Payable (2010). */}
        <section className='flex flex-col gap-2'>
          <div className='flex items-baseline justify-between gap-2 border-b border-textColor pb-1'>
            <Text className='font-bold uppercase'>you owe</Text>
            {payReady && (
              <span className='font-bold tabular-nums text-error'>€{formatBase(payTotal)}</span>
            )}
          </div>
          <Text variant='inactive' size='small'>
            open Accounts-Payable balance per supplier (accrued − paid)
          </Text>
          <ReportState
            isLoading={pay.isLoading}
            isError={pay.isError}
            onRetry={() => pay.refetch()}
            isEmpty={payRows.length === 0}
            emptyHint='no open payables — you owe nothing right now'
          >
            <div className='overflow-x-auto'>
              <table className='w-full min-w-max border-collapse'>
                <thead>
                  <tr className='border-b border-textColor'>
                    <th className='px-2 py-1 text-left text-textBaseSize uppercase'>supplier</th>
                    <th className='px-2 py-1 text-right text-textBaseSize uppercase'>accrued</th>
                    <th className='px-2 py-1 text-right text-textBaseSize uppercase'>paid</th>
                    <th className='px-2 py-1 text-right text-textBaseSize uppercase'>balance</th>
                    <th className='px-2 py-1' aria-label='action' />
                  </tr>
                </thead>
                <tbody>
                  {payRows.map((r: AcctPayableRow, i) => (
                    <tr key={r.supplierId ?? i} className='border-b border-textInactiveColor'>
                      <td className='px-2 py-1.5'>
                        <Text size='small' className={r.supplierId ? undefined : 'italic'}>
                          {r.supplierName ||
                            (r.supplierId ? `supplier #${r.supplierId}` : 'untagged')}
                        </Text>
                      </td>
                      <AmountCell value={r.accrued} className='px-2 py-1.5' />
                      <AmountCell value={r.paid} className='px-2 py-1.5' />
                      <AmountCell value={r.balance} className='px-2 py-1.5' />
                      <td className='px-2 py-1.5 text-right'>
                        <Link
                          to={ROUTES.accountingBank}
                          title='book the payment from the bank inbox'
                          className='inline-flex hover:opacity-70'
                        >
                          <Pill tone='warn'>pay</Pill>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className='border-t border-textColor px-2 py-1.5 font-medium uppercase'>
                      total you owe
                    </td>
                    <td />
                    <td />
                    <AmountCell value={payTotal} bold className='px-2 py-1.5' />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </ReportState>
        </section>

        {/* Owed to you — Accounts Receivable (1040). */}
        <section className='flex flex-col gap-2'>
          <div className='flex items-baseline justify-between gap-2 border-b border-textColor pb-1'>
            <Text className='font-bold uppercase'>owed to you</Text>
            {recReady && (
              <span className='font-bold tabular-nums'>€{formatBase(recTotal)}</span>
            )}
          </div>
          <Text variant='inactive' size='small'>
            open Accounts-Receivable balance per bank-invoice order (invoiced − received)
          </Text>
          <ReportState
            isLoading={rec.isLoading}
            isError={rec.isError}
            onRetry={() => rec.refetch()}
            isEmpty={recRows.length === 0}
            emptyHint='no open receivables — nothing is owed to you right now'
          >
            <div className='overflow-x-auto'>
              <table className='w-full min-w-max border-collapse'>
                <thead>
                  <tr className='border-b border-textColor'>
                    <th className='px-2 py-1 text-left text-textBaseSize uppercase'>order</th>
                    <th className='px-2 py-1 text-right text-textBaseSize uppercase'>invoiced</th>
                    <th className='px-2 py-1 text-right text-textBaseSize uppercase'>received</th>
                    <th className='px-2 py-1 text-right text-textBaseSize uppercase'>balance</th>
                    <th className='px-2 py-1' aria-label='action' />
                  </tr>
                </thead>
                <tbody>
                  {recRows.map((r: AcctReceivableRow, i) => {
                    const ref = r.ref ?? '';
                    const linkable = ref.startsWith('ORD-');
                    return (
                      <tr key={ref || i} className='border-b border-textInactiveColor'>
                        <td className='px-2 py-1.5'>
                          {linkable ? (
                            <Link
                              to={`${ROUTES.orders}/${ref}`}
                              className='text-small underline underline-offset-2 hover:opacity-70'
                            >
                              {ref}
                            </Link>
                          ) : (
                            <Text size='small'>{ref || '—'}</Text>
                          )}
                        </td>
                        <AmountCell value={r.invoiced} className='px-2 py-1.5' />
                        <AmountCell value={r.received} className='px-2 py-1.5' />
                        <AmountCell value={r.balance} className='px-2 py-1.5' />
                        <td className='px-2 py-1.5 text-right'>
                          {linkable ? (
                            <Link
                              to={`${ROUTES.orders}/${ref}`}
                              title='open the order to chase the payment'
                              className='inline-flex hover:opacity-70'
                            >
                              <Pill>chase</Pill>
                            </Link>
                          ) : (
                            <Pill tone='muted'>chase</Pill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className='border-t border-textColor px-2 py-1.5 font-medium uppercase'>
                      total owed to you
                    </td>
                    <td />
                    <td />
                    <AmountCell value={recTotal} bold className='px-2 py-1.5' />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </ReportState>
        </section>
      </div>

      {payReady && recReady && (
        <Note>
          {payN === 0 && recN === 0
            ? 'net position: nothing owed either way'
            : payN === recN
              ? 'net position: you owe exactly what you’re owed'
              : payN > recN
                ? `net position: you owe €${diff} more than you’re owed`
                : `net position: you’re owed €${diff} more than you owe`}
        </Note>
      )}
    </div>
  );
}

// The supplier catalog: create + list. A supplier tags a 2010 payable position so Payables can
// group by counterparty; it's also the picker source on material receive. Card grid (approved
// variant): name / VAT id / open balance per card — the balance is looked up from the same
// GetPayables rows the "you owe" table shows (a display join by supplier_id, no new arithmetic).
function SuppliersSection() {
  const { data, isLoading, isError, refetch } = useSuppliers();
  const { data: payData } = usePayables();
  const [createOpen, setCreateOpen] = useState(false);
  const suppliers = data?.suppliers ?? [];

  const balanceBySupplier = new Map<number, googletype_Decimal | undefined>();
  for (const r of payData?.rows ?? []) {
    if (r.supplierId) balanceBySupplier.set(r.supplierId, r.balance);
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-2'>
        <Text variant='inactive' size='small'>
          purchase-side counterparties — used to tag payables and on material receive
        </Text>
        <Button variant='main' size='lg' onClick={() => setCreateOpen(true)}>
          new supplier
        </Button>
      </div>
      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={suppliers.length === 0}
        emptyHint='no suppliers yet — create one to tag payables'
      >
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {suppliers.map((s) => {
            const balance = s.id != null ? balanceBySupplier.get(s.id) : undefined;
            const owes = parseFloat(balance?.value ?? '') > 0;
            return (
              <div key={s.id} className='flex flex-col gap-1 border border-textInactiveColor p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <Text className='font-bold'>{s.name || `supplier #${s.id}`}</Text>
                  {owes && <Pill tone='warn'>open</Pill>}
                </div>
                {s.vatId ? (
                  <Text size='small' variant='inactive'>
                    VAT {s.vatId}
                  </Text>
                ) : null}
                {s.notes ? (
                  <Text size='small' variant='inactive' className='break-words'>
                    {s.notes}
                  </Text>
                ) : null}
                {s.createdAt ? (
                  <Text size='small' variant='inactive'>
                    added {formatAcctDate(s.createdAt)}
                  </Text>
                ) : null}
                <div className='mt-auto flex items-baseline justify-between gap-2 border-t border-textInactiveColor pt-1.5'>
                  <span className='text-[10px] uppercase tracking-wide text-labelColor'>
                    open balance
                  </span>
                  {balance ? (
                    <span className={cn('font-bold tabular-nums', owes && 'text-error')}>
                      {formatBase(balance)}
                    </span>
                  ) : (
                    <span className='text-[10px] uppercase text-labelColor'>none</span>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type='button'
            onClick={() => setCreateOpen(true)}
            className='flex min-h-24 items-center justify-center border border-textInactiveColor p-3 text-textBaseSize uppercase text-labelColor transition-colors hover:text-textColor'
          >
            + new supplier
          </button>
        </div>
      </ReportState>

      <CreateSupplierModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
