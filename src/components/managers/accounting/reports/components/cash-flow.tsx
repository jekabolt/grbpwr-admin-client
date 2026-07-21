import { googletype_Decimal } from 'api/proto-http/admin';
import { useCashFlow } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { CheckStrip, Verdict, Waterfall, WaterfallRow } from '../../components/kit';
import { formatBase } from '../../utils/format';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

function num(d?: googletype_Decimal): number {
  const n = parseFloat(d?.value ?? '');
  return Number.isFinite(n) ? n : 0;
}
function signed(n: number): string {
  const mag = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '−' : '+'}${mag}`;
}

// 4.x Cash Flow — "Waterfall" (the owner's pick): the indirect-method statement told as one running
// story, opening cash → the three activity subtotals (running the shop / buying kit / owner & loans)
// → closing cash, each a floating bar. Every figure is server-sent (§8.6 #6); the ONLY arithmetic
// here is the bar geometry (a display proportion of those figures). The Check strip mirrors the
// Balance Sheet's balance check — derived closing vs the real bank balance as at `to`.
export function CashFlowTab({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useCashFlow(from, to);
  const caveats = data?.caveats ?? [];
  const isEmpty = !data || (!data.operating && !data.investing && !data.financing);

  const opening = num(data?.openingCash);
  const closing = num(data?.closingCash);
  const flows: { label: string; amount: number }[] = [
    { label: 'From running the shop (operating)', amount: num(data?.operating?.subtotal) },
    { label: 'From buying/selling kit (investing)', amount: num(data?.investing?.subtotal) },
    { label: 'Owner & loans (financing)', amount: num(data?.financing?.subtotal) },
  ];

  // Scale the bars to the largest cash level the story reaches (opening, closing, any running peak).
  let run = opening;
  const peaks = [0, opening, closing];
  flows.forEach((f) => {
    run += f.amount;
    peaks.push(run);
  });
  const scale = Math.max(1, ...peaks.map((p) => Math.abs(p)));
  const pct = (v: number) => (v / scale) * 100;

  const netChange = num(data?.netChange);
  const grew = netChange >= 0;

  const copyRows: (string | number | undefined)[][] = [
    ['Opening cash', data?.openingCash?.value],
    ['Operating', data?.operating?.subtotal?.value],
    ['Investing', data?.investing?.subtotal?.value],
    ['Financing', data?.financing?.subtotal?.value],
    ['Net change', data?.netChange?.value],
    ['Closing cash', data?.closingCash?.value],
    ['Closing cash (actual)', data?.closingCashActual?.value],
    ['Check', data?.check?.value],
  ];

  return (
    <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()} isEmpty={isEmpty}>
      <div className='flex flex-col gap-4'>
        <CaveatsNote caveats={caveats} />
        <Verdict>
          {`Cash ${grew ? 'grew' : 'fell'} ${Math.abs(netChange).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} — you ended the period with ${formatBase(data?.closingCash)}.`}
        </Verdict>
        <div className='flex justify-end'>
          <CopyTableButton headers={['line', 'amount']} rows={copyRows} filename='cash-flow' />
        </div>

        <div className='max-w-2xl'>
          <Waterfall>
            <WaterfallRow
              label='Opening cash'
              value={formatBase(data?.openingCash)}
              left={0}
              width={pct(opening)}
              kind='pos'
              keyRow
            />
            {(() => {
              let r = opening;
              return flows.map((f) => {
                const start = r;
                const end = r + f.amount;
                r = end;
                return (
                  <WaterfallRow
                    key={f.label}
                    label={f.label}
                    value={signed(f.amount)}
                    left={pct(Math.min(start, end))}
                    width={pct(Math.abs(f.amount))}
                    kind={f.amount >= 0 ? 'fin' : 'neg'}
                    negValue={f.amount < 0}
                  />
                );
              });
            })()}
            <WaterfallRow
              label='Closing cash'
              value={formatBase(data?.closingCash)}
              left={0}
              width={pct(closing)}
              kind='pos'
              keyRow
            />
          </Waterfall>

          <div className='mt-4 flex flex-col gap-2 border-t border-textColor pt-3'>
            <div className='flex items-center justify-between'>
              <span className='uppercase text-labelColor'>closing cash (actual bank)</span>
              <AmountCell as='span' value={data?.closingCashActual} />
            </div>
            <CheckStrip
              tone={data?.balanced ? 'ok' : 'bad'}
              label={data?.balanced ? 'Matches the bank' : 'Off vs the actual bank balance'}
              value={data?.balanced ? '✓ €0 difference' : formatBase(data?.check)}
            />
          </div>
        </div>
      </div>
    </ReportState>
  );
}
