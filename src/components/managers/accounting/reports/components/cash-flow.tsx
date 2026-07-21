import { AcctCashFlowSection } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { useCashFlow } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { BalancedBadge } from '../../components/balanced-badge';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

// One cash-flow grouping (operating / investing / financing): signed line rows (label · amount)
// with a bordered section subtotal. Amounts are signed — a use of cash arrives negative and
// AmountCell reddens it (§8.3). The subtotal comes from the server, never summed on the client.
function Section({ section }: { section?: AcctCashFlowSection }) {
  if (!section) return null;
  const lines = section.lines ?? [];
  return (
    <div className='flex flex-col gap-1'>
      <Text variant='uppercase' size='small' className='text-textInactiveColor'>
        {section.name}
      </Text>
      <table className='w-full border-collapse'>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className='border-b border-textInactiveColor'>
              <td className='px-2 py-1'>{l.label}</td>
              <AmountCell value={l.amount} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className='border-t border-textColor px-2 py-1 font-medium uppercase'>
              total {section.name}
            </td>
            <AmountCell value={section.subtotal} bold />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// 4.x Cash Flow: the indirect-method statement over [from, to) — operating / investing / financing
// stacked vertically, then a reconciliation footer (net change → opening → closing cash) and a
// trust row. `closingCash` is derived (opening + net change); `closingCashActual` is the real cash
// balance as at `to`; `check` = actual − derived (0 when balanced, mirrors the BS balance check).
// The client never sums anything itself (§8.6 #6) — every figure, including check, is server-sent.
export function CashFlowTab({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useCashFlow(from, to);
  const caveats = data?.caveats ?? [];
  const isEmpty = !data || (!data.operating && !data.investing && !data.financing);

  const copyRows: (string | number | undefined)[][] = [];
  const pushSection = (s?: AcctCashFlowSection) => {
    if (!s) return;
    copyRows.push([(s.name ?? '').toUpperCase()]);
    (s.lines ?? []).forEach((l) => copyRows.push([l.label, l.amount?.value]));
    copyRows.push([`total ${s.name ?? ''}`, s.subtotal?.value]);
  };
  pushSection(data?.operating);
  pushSection(data?.investing);
  pushSection(data?.financing);
  copyRows.push(['NET CHANGE IN CASH', data?.netChange?.value]);
  copyRows.push(['OPENING CASH', data?.openingCash?.value]);
  copyRows.push(['CLOSING CASH', data?.closingCash?.value]);
  copyRows.push(['CLOSING CASH (ACTUAL)', data?.closingCashActual?.value]);
  copyRows.push(['CHECK', data?.check?.value]);

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={isEmpty}
    >
      <div className='flex flex-col gap-4'>
        <CaveatsNote caveats={caveats} />
        <div className='flex justify-end'>
          <CopyTableButton headers={['line', 'amount']} rows={copyRows} filename='cash-flow' />
        </div>

        <div className='flex max-w-2xl flex-col gap-5'>
          <Section section={data?.operating} />
          <Section section={data?.investing} />
          <Section section={data?.financing} />

          <div className='flex flex-col gap-2 border-t-2 border-textColor pt-3'>
            <div className='flex items-center justify-between'>
              <Text className='font-medium uppercase'>net change in cash</Text>
              <AmountCell as='span' value={data?.netChange} className='font-medium' />
            </div>
            <div className='flex items-center justify-between'>
              <Text className='uppercase'>opening cash</Text>
              <AmountCell as='span' value={data?.openingCash} />
            </div>
            <div className='flex items-center justify-between border-t border-textColor pt-2'>
              <Text className='font-medium uppercase'>closing cash</Text>
              <AmountCell as='span' value={data?.closingCash} className='font-medium' />
            </div>
            <div className='flex items-center justify-between'>
              <Text variant='inactive' className='uppercase'>
                closing cash (actual)
              </Text>
              <AmountCell as='span' value={data?.closingCashActual} />
            </div>
            <div className='flex items-center justify-between border-t border-textColor pt-2'>
              <Text className='font-medium uppercase'>check</Text>
              <div className='flex items-center gap-3'>
                <AmountCell as='span' value={data?.check} className='font-medium' />
                <BalancedBadge balanced={data?.balanced} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ReportState>
  );
}
