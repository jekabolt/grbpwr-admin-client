import { AcctCashFlowSection, googletype_Decimal } from 'api/proto-http/admin';
import { useCashFlow } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { CheckStrip, Verdict, Waterfall, WaterfallRow } from '../../components/kit';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { formatBase } from '../../utils/format';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
  // Drill a cash-flow line into the account ledger for the same range (mirrors P&L rows).
  onDrill?: (accountCode: string) => void;
  // "Net profit for the period" has no single account — its story is the P&L tab.
  onOpenPnl?: () => void;
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

// The backend now ships an explicit `codes` field per line (AcctCashFlowLine.codes) — read it off
// the runtime object until `make proto` regenerates the client types, and keep the label parser
// ("Change in VAT (2070/2080)") as the fallback for a backend that predates the field. The
// inventory label names a RANGE, so the fallback expands it to the real account set.
const CODE_RANGE_EXPANSIONS: Record<string, string[]> = {
  '1110–1140': ['1110', '1120', '1130', '1140'],
};
function codesFromLabel(label: string): string[] {
  for (const [range, codes] of Object.entries(CODE_RANGE_EXPANSIONS)) {
    if (label.includes(range)) return codes;
  }
  return Array.from(new Set(label.match(/\d{4}/g) ?? []));
}
function codesOfLine(l: { label?: string }, label: string): string[] {
  const server = (l as { codes?: string[] }).codes;
  return server && server.length > 0 ? server : codesFromLabel(label);
}

// One activity's per-line breakdown: label · account chips (each drills into that ledger for the
// same range) · signed amount, closed by the section subtotal. This is the "переход внутрь
// операций" the waterfall alone was missing — the bars stay the story, this is the receipts.
function SectionBreakdown({
  section,
  title,
  onDrill,
  onOpenPnl,
}: {
  section?: AcctCashFlowSection;
  title: string;
  onDrill?: (code: string) => void;
  onOpenPnl?: () => void;
}) {
  const lines = section?.lines ?? [];
  if (lines.length === 0) return null;
  return (
    <section className='flex flex-col'>
      <Text className='border-b border-textColor pb-1 font-bold uppercase'>{title}</Text>
      {lines.map((l) => {
        const label = l.label ?? '';
        const isNetProfit = label.toLowerCase().startsWith('net profit');
        const codes = isNetProfit ? [] : codesOfLine(l, label);
        return (
          <div
            key={label}
            className='flex items-center justify-between gap-3 border-b border-textInactiveColor py-1.5'
          >
            <span className='flex min-w-0 flex-wrap items-center gap-2'>
              <Text size='small' className='min-w-0'>
                {label}
              </Text>
              {isNetProfit && onOpenPnl ? (
                <button
                  type='button'
                  onClick={onOpenPnl}
                  title='the profit story lives in the p&l tab'
                  className='text-[10px] uppercase tracking-wide text-labelColor underline underline-offset-2 hover:text-textColor'
                >
                  p&amp;l →
                </button>
              ) : null}
              {onDrill
                ? codes.map((code) => (
                    <button
                      key={code}
                      type='button'
                      onClick={() => onDrill(code)}
                      title={`open the ${code} ledger for this range`}
                      className='border border-textInactiveColor px-1 text-[10px] uppercase tabular-nums tracking-wide text-labelColor hover:border-textColor hover:text-textColor'
                    >
                      {code}
                    </button>
                  ))
                : null}
            </span>
            <AmountCell as='span' value={l.amount} className='shrink-0 text-small' />
          </div>
        );
      })}
      <div className='flex items-center justify-between gap-3 py-1.5'>
        <Text size='small' className='font-bold uppercase'>
          {title} subtotal
        </Text>
        <AmountCell as='span' value={section?.subtotal} bold className='shrink-0 text-small' />
      </div>
    </section>
  );
}

// 4.x Cash Flow — "Waterfall" (the owner's pick): the indirect-method statement told as one running
// story, opening cash → the three activity subtotals (running the shop / buying kit / owner & loans)
// → closing cash, each a floating bar — followed by the per-line breakdown of each activity
// (net profit + depreciation add-back + the working-capital deltas), every line drillable to its
// account ledger. Every figure is server-sent (§8.6 #6); the ONLY arithmetic here is the bar
// geometry (a display proportion of those figures). The Check strip mirrors the Balance Sheet's
// balance check — derived closing vs the real bank balance as at `to`.
export function CashFlowTab({ from, to, onDrill, onOpenPnl }: Props) {
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
    ...(['operating', 'investing', 'financing'] as const).flatMap((k) => {
      const section = data?.[k];
      return [
        ...(section?.lines ?? []).map((l) => [l.label, l.amount?.value]),
        [`${k} subtotal`, section?.subtotal?.value],
      ];
    }),
    ['Net change', data?.netChange?.value],
    ['Closing cash', data?.closingCash?.value],
    ['Closing cash (actual)', data?.closingCashActual?.value],
    ['Check', data?.check?.value],
  ];

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={isEmpty}
    >
      <Section>
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

        <div className='grid max-w-4xl gap-6 pt-2 lg:grid-cols-3'>
          <SectionBreakdown
            section={data?.operating}
            title='operating'
            onDrill={onDrill}
            onOpenPnl={onOpenPnl}
          />
          <SectionBreakdown section={data?.investing} title='investing' onDrill={onDrill} />
          <SectionBreakdown section={data?.financing} title='financing' onDrill={onDrill} />
        </div>
      </Section>
    </ReportState>
  );
}
