import { AcctPayableRow, AcctReceivableRow, googletype_Decimal } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { AmountCell } from '../components/amount-cell';
import { AcctSectionHeader } from '../components/section-header';
import { ReportState } from '../reports/components/report-utils';
import { formatAcctDate } from '../utils/format';
import { usePayables, useReceivables, useSuppliers } from '../utils/hooks';
import { CreateSupplierModal } from './components/create-supplier-modal';

// Sub-tab within the AP/AR screen. Kept in local state (not the URL) — unlike Reports these are
// operational lists, not shareable report states.
const TABS = [
  { id: 'payables', label: 'payables' },
  { id: 'receivables', label: 'receivables' },
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
  const [tab, setTab] = useState<TabId>('payables');

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

        {tab === 'payables' && <PayablesSection />}
        {tab === 'receivables' && <ReceivablesSection />}
        {tab === 'suppliers' && <SuppliersSection />}
      </div>
    </div>
  );
}

// Accounts Payable (2010) open balance per supplier: accrued − paid. supplier_id 0 is an untagged
// 2010 position (a payable with no supplier attached) — labelled so it's never mistaken for a named
// counterparty.
function PayablesSection() {
  const { data, isLoading, isError, refetch } = usePayables();
  const rows = data?.rows ?? [];
  const total = sumBalances(rows.map((r) => r.balance));

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='inactive' size='small'>
        open Accounts-Payable balance per supplier (accrued − paid)
      </Text>
      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={rows.length === 0}
        emptyHint='no open payables'
      >
        <div className='max-w-2xl overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr className='border-b border-textColor'>
                <th className='px-2 py-1 text-left text-textBaseSize uppercase'>supplier</th>
                <th className='px-2 py-1 text-right text-textBaseSize uppercase'>accrued</th>
                <th className='px-2 py-1 text-right text-textBaseSize uppercase'>paid</th>
                <th className='px-2 py-1 text-right text-textBaseSize uppercase'>balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: AcctPayableRow, i) => (
                <tr key={r.supplierId ?? i} className='border-b border-textInactiveColor'>
                  <td className='px-2 py-1.5'>
                    <Text size='small' className={r.supplierId ? undefined : 'italic'}>
                      {r.supplierName || (r.supplierId ? `supplier #${r.supplierId}` : 'untagged')}
                    </Text>
                  </td>
                  <AmountCell value={r.accrued} className='px-2 py-1.5' />
                  <AmountCell value={r.paid} className='px-2 py-1.5' />
                  <AmountCell value={r.balance} className='px-2 py-1.5' />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className='border-t border-textColor px-2 py-1.5 font-medium uppercase'>
                  total owed
                </td>
                <td />
                <td />
                <AmountCell value={total} bold className='px-2 py-1.5' />
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportState>
    </div>
  );
}

// Accounts Receivable (1040) open balance per bank-invoice order: invoiced − received. The ref is
// the order uuid — deep-linked to the order when it carries the ORD- prefix (matching the recon
// screen's link rule).
function ReceivablesSection() {
  const { data, isLoading, isError, refetch } = useReceivables();
  const rows = data?.rows ?? [];
  const total = sumBalances(rows.map((r) => r.balance));

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='inactive' size='small'>
        open Accounts-Receivable balance per bank-invoice order (invoiced − received)
      </Text>
      <ReportState
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        isEmpty={rows.length === 0}
        emptyHint='no open receivables'
      >
        <div className='max-w-2xl overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr className='border-b border-textColor'>
                <th className='px-2 py-1 text-left text-textBaseSize uppercase'>order</th>
                <th className='px-2 py-1 text-right text-textBaseSize uppercase'>invoiced</th>
                <th className='px-2 py-1 text-right text-textBaseSize uppercase'>received</th>
                <th className='px-2 py-1 text-right text-textBaseSize uppercase'>balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: AcctReceivableRow, i) => {
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
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className='border-t border-textColor px-2 py-1.5 font-medium uppercase'>
                  total due
                </td>
                <td />
                <td />
                <AmountCell value={total} bold className='px-2 py-1.5' />
              </tr>
            </tfoot>
          </table>
        </div>
      </ReportState>
    </div>
  );
}

// The supplier catalog: create + list. A supplier tags a 2010 payable position so Payables can
// group by counterparty; it's also the picker source on material receive.
function SuppliersSection() {
  const { data, isLoading, isError, refetch } = useSuppliers();
  const [createOpen, setCreateOpen] = useState(false);
  const suppliers = data?.suppliers ?? [];

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
          {suppliers.map((s) => (
            <div
              key={s.id}
              className='flex flex-col gap-1 border border-textInactiveColor p-3'
            >
              <Text className='font-medium'>{s.name || `supplier #${s.id}`}</Text>
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
            </div>
          ))}
        </div>
      </ReportState>

      <CreateSupplierModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
