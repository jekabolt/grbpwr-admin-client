import { adminService } from 'api/api';
import { googletype_Decimal } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { AmountCell } from '../../components/amount-cell';
import { Callout, CheckStrip, GroupHeader, RowLine } from '../../components/kit';
import { formatBase } from '../../utils/format';
import { useOssReturn, useUkVatReturn, useVatReturnPL } from '../../utils/hooks';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, formatMonthLabel, formatPercent, ReportState } from './report-utils';
import { XmlExportButton } from './xml-export-button';

type Props = {
  // Range `from` from the shared search-params contract. VAT is a monthly return, OSS a quarterly
  // one, so both dimensions are derived from `from` (the backend normalises to 1st / quarter start).
  from: string;
};

// One statutory return line: the formal name (kept for the TSV copy), an optional plain-language
// explainer rendered in parentheses, and the backend-computed amount.
type VatLine = {
  label: string;
  plain?: string;
  value?: googletype_Decimal;
  total?: boolean;
};

// First-of-month key ('YYYY-MM-01') of a YYYY-MM-DD date, for the monthly JPK_VAT return + label.
function monthStartOf(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  if (!y || !m) return '';
  return `${y}-${m}-01`;
}

// First day of the calendar quarter ('YYYY-01-01' | '-04-01' | '-07-01' | '-10-01') a date falls in.
function quarterStartOf(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  if (!y || !m) return '';
  const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(startMonth).padStart(2, '0')}-01`;
}

// 'Q3 2026' label for the calendar quarter a YYYY-MM-01 quarter-start date belongs to (the OSS return
// covers a whole quarter, so a month label would misread e.g. Jul–Sep as just "JUL").
function formatQuarterLabel(quarterStart: string): string {
  const [y, m] = quarterStart.split('-').map(Number);
  if (!y || !m) return '';
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

// ---- Filing deadlines (date arithmetic only — statutory rules, no report figures involved) ----

const MONTH_NAMES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

function formatDeadline(dt: Date): string {
  return `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
}

// JPK_V7M is filed + paid by the 25th of the month after the reporting month.
function jpkDeadline(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  if (!y || !m) return '—';
  return formatDeadline(new Date(y, m, 25));
}

// OSS is filed + paid by the last day of the month following the quarter end.
function ossDeadline(quarterStart: string): string {
  const [y, m] = quarterStart.split('-').map(Number);
  if (!y || !m) return '—';
  return formatDeadline(new Date(y, m + 3, 0));
}

// UK VAT is filed + paid 1 calendar month + 7 days after the quarter end.
function ukDeadline(quarterStart: string): string {
  const [y, m] = quarterStart.split('-').map(Number);
  if (!y || !m) return '—';
  return formatDeadline(new Date(y, m + 3, 7));
}

// Formal line name + plain-language parenthetical, the picker's per-return-block treatment.
function lineLabel(l: VatLine) {
  return (
    <>
      {l.label}
      {l.plain ? (
        <span className='ml-1 text-[11px] font-normal text-labelColor'>({l.plain})</span>
      ) : null}
    </>
  );
}

// Phase-2 VAT: two statutory returns off the same period. (a) JPK_VAT — the monthly PL return, output
// VAT by regime minus input VAT = net_payable; OSS and UK figures are declared here for completeness
// but settled on their own returns, so they're grouped separately and excluded from net_payable
// (§backend GetVatReturnPLResponse). (b) OSS — the quarterly EU-B2C aggregate, one line per
// destination country. (c) UK VAT — the 9-box HMRC return for the UK-stock domestic regime.
export function VatTab({ from }: Props) {
  const month = monthStartOf(from);
  const quarter = quarterStartOf(from);

  const vat = useVatReturnPL(month);
  const oss = useOssReturn(quarter);
  const ukvat = useUkVatReturn(quarter);

  const ret = vat.data;
  const plRows: VatLine[] = ret
    ? [
        {
          label: 'Output VAT — domestic PL',
          plain: 'tax you charged on Polish sales',
          value: ret.outputDomestic,
        },
        {
          label: 'Output VAT — WNT self-charge',
          plain: 'tax you charge yourself on EU stock arrivals',
          value: ret.outputWntSelfCharge,
        },
        {
          label: 'Input VAT — domestic PL',
          plain: 'VAT you can reclaim on Polish purchases',
          value: ret.inputDomestic,
        },
        {
          label: 'Input VAT — WNT',
          plain: 'reclaims the WNT self-charge above',
          value: ret.inputWnt,
        },
        {
          label: 'Input VAT — import',
          plain: 'VAT paid at customs, reclaimable',
          value: ret.inputImport,
        },
        { label: 'Net VAT to pay', plain: 'output minus input', value: ret.netPayable, total: true },
      ]
    : [];
  // Lines JPK declares for completeness but that are settled on another return (OSS, UK) or carry
  // no VAT (zero-rated bases) — kept visible, grouped so they're not read into net payable.
  const plInfoRows: VatLine[] = ret
    ? [
        { label: 'OSS output VAT', plain: 'settled on the EU OSS return', value: ret.ossInfoTotal },
        {
          label: 'UK output VAT — stock domestic',
          plain: 'settled on the UK return',
          value: ret.outputUkStockDomestic,
        },
        {
          label: 'UK input VAT — domestic',
          plain: 'settled on the UK return',
          value: ret.inputUkDomestic,
        },
        { label: 'Net WDT', plain: 'zero-rated base — no VAT due', value: ret.netWdt },
        { label: 'Net export', plain: 'zero-rated base — no VAT due', value: ret.netExport },
      ]
    : [];

  // TSV mirrors the visible lines; amounts are the raw decimal `value` strings (unformatted).
  const vatCopyHeaders = ['line', 'amount'];
  const vatCopyRows: (string | number | undefined)[][] = [...plRows, ...plInfoRows].map((r) => [
    r.label,
    r.value?.value,
  ]);

  const ossRows = oss.data?.rows ?? [];
  const ossCopyHeaders = ['country', 'rate %', 'net', 'vat'];
  const ossCopyRows: (string | number | undefined)[][] = [
    ...ossRows.map((r) => [r.country, r.ratePct?.value, r.net?.value, r.vat?.value]),
    ['total', '', oss.data?.totalNet?.value, oss.data?.totalVat?.value],
  ];

  // UK VAT 9-box return (separate jurisdiction). Boxes 2/8/9 are always 0 for a GB return.
  const uk = ukvat.data;
  const ukBoxes: (VatLine & { box: string })[] = uk
    ? [
        {
          box: '1',
          label: 'VAT due on sales',
          plain: 'tax you charged on UK sales',
          value: uk.box1OutputVat,
        },
        {
          box: '2',
          label: 'VAT due on EU acquisitions',
          plain: 'always 0 post-Brexit',
          value: undefined,
        },
        { box: '3', label: 'Total VAT due', plain: 'Box 1 + Box 2', value: uk.box3TotalVatDue },
        {
          box: '4',
          label: 'VAT reclaimed on purchases',
          plain: 'VAT you can claim back',
          value: uk.box4InputVat,
        },
        {
          box: '5',
          label: 'Net VAT',
          plain: 'what you pay HMRC — negative means a reclaim',
          value: uk.box5NetVat,
          total: true,
        },
        {
          box: '6',
          label: 'Total sales ex-VAT',
          plain: 'net UK sales for the quarter',
          value: uk.box6NetSales,
        },
        {
          box: '7',
          label: 'Total purchases ex-VAT',
          plain: 'net UK purchases',
          value: uk.box7NetPurchases,
        },
        { box: '8', label: 'EU supplies ex-VAT', plain: 'always 0', value: undefined },
        { box: '9', label: 'EU acquisitions ex-VAT', plain: 'always 0', value: undefined },
      ]
    : [];
  const ukCopyHeaders = ['box', 'description', 'amount'];
  const ukCopyRows: (string | number | undefined)[][] = ukBoxes.map((b) => [
    b.box,
    b.label,
    b.value?.value ?? '0',
  ]);

  return (
    <div className='flex flex-col gap-8'>
      <section className='flex flex-col gap-3'>
        <GroupHeader className='mt-0'>
          Poland — JPK_VAT (the Polish VAT return) · {formatMonthLabel(month)}
        </GroupHeader>
        <ReportState
          isLoading={vat.isLoading}
          isError={vat.isError}
          onRetry={() => vat.refetch()}
          isEmpty={!ret}
        >
          <div className='flex flex-col gap-3'>
            <CaveatsNote caveats={ret?.caveats ?? []} />
            <div className='flex flex-wrap justify-end gap-2'>
              <XmlExportButton
                label='download JPK_V7M (XML)'
                fallbackName={`JPK_V7M_${month}.xml`}
                run={() => adminService.ExportJpkV7M({ month })}
              />
              <CopyTableButton headers={vatCopyHeaders} rows={vatCopyRows} filename='vat-return' />
            </div>
            <Callout className='text-textColor'>
              {plRows.map((r) => (
                <RowLine key={r.label} label={lineLabel(r)} value={<AmountCell as='span' value={r.value} />} total={r.total} />
              ))}
              <GroupHeader>Declared for information — settled on other returns</GroupHeader>
              {plInfoRows.map((r) => (
                <RowLine key={r.label} label={lineLabel(r)} value={<AmountCell as='span' value={r.value} />} />
              ))}
              <CheckStrip
                tone='bad'
                label={`file + pay by ${jpkDeadline(month)} (JPK_V7M)`}
                value={formatBase(ret?.netPayable)}
              />
            </Callout>
          </div>
        </ReportState>
      </section>

      <section className='flex flex-col gap-3'>
        <GroupHeader className='mt-0'>
          EU OSS (one EU return for cross-border consumer sales) · {formatQuarterLabel(quarter)}
        </GroupHeader>
        <ReportState
          isLoading={oss.isLoading}
          isError={oss.isError}
          onRetry={() => oss.refetch()}
          isEmpty={ossRows.length === 0}
        >
          <div className='flex flex-col gap-3'>
            <div className='flex flex-wrap justify-end gap-2'>
              <XmlExportButton
                label='download OSS (XML)'
                fallbackName={`OSS_${quarter}.xml`}
                run={() => adminService.ExportOssReturn({ quarter })}
              />
              <CopyTableButton headers={ossCopyHeaders} rows={ossCopyRows} filename='oss-return' />
            </div>
            <Callout className='text-textColor'>
              <div className='overflow-x-auto'>
                <table className='w-full min-w-max border-collapse'>
                  <thead className='border-b border-textColor'>
                    <tr>
                      <th className='px-2 py-2 text-left text-textBaseSize uppercase'>country</th>
                      <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>
                        rate %
                      </th>
                      <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>
                        net
                      </th>
                      <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>
                        vat
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ossRows.map((r, i) => (
                      <tr key={r.country ?? i} className='border-b border-textInactiveColor'>
                        <td className='whitespace-nowrap px-2 py-1'>{r.country}</td>
                        <td className='w-32 min-w-32 whitespace-nowrap px-2 py-1 text-right tabular-nums'>
                          {formatPercent(r.ratePct)}
                        </td>
                        <AmountCell value={r.net} />
                        <AmountCell value={r.vat} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className='border-t border-textColor px-2 py-1 font-medium'>
                        total VAT to pay
                        <span className='ml-1 text-[11px] font-normal text-labelColor'>
                          (one payment covers every EU country above)
                        </span>
                      </td>
                      <td className='border-t border-textColor' />
                      <AmountCell value={oss.data?.totalNet} bold />
                      <AmountCell value={oss.data?.totalVat} bold />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <CheckStrip
                tone='bad'
                label={`file + pay by ${ossDeadline(quarter)} (OSS)`}
                value={formatBase(oss.data?.totalVat)}
              />
            </Callout>
          </div>
        </ReportState>
      </section>

      <section className='flex flex-col gap-3'>
        <GroupHeader className='mt-0'>
          UK VAT (9-box return to HMRC) · {formatQuarterLabel(quarter)}
        </GroupHeader>
        <ReportState
          isLoading={ukvat.isLoading}
          isError={ukvat.isError}
          onRetry={() => ukvat.refetch()}
          isEmpty={!uk}
        >
          <div className='flex flex-col gap-3'>
            <Text size='small' variant='inactive'>
              UK-stock domestic regime — a separate jurisdiction, excluded from the Polish net payable.
              Enter these figures into MTD-compatible software to submit to HMRC.
            </Text>
            <div className='flex justify-end'>
              <CopyTableButton headers={ukCopyHeaders} rows={ukCopyRows} filename='uk-vat-return' />
            </div>
            <Callout className='text-textColor'>
              {ukBoxes.map((b) => (
                <RowLine
                  key={b.box}
                  label={
                    <>
                      <span className='font-normal text-labelColor'>Box {b.box}</span> — {b.label}
                      {b.plain ? (
                        <span className='ml-1 text-[11px] font-normal text-labelColor'>
                          ({b.plain})
                        </span>
                      ) : null}
                    </>
                  }
                  value={<AmountCell as='span' value={b.value} />}
                  total={b.total}
                />
              ))}
              <CheckStrip
                tone='bad'
                label={`file + pay by ${ukDeadline(quarter)} (HMRC, via MTD)`}
                value={formatBase(uk?.box5NetVat)}
              />
            </Callout>
          </div>
        </ReportState>
      </section>
    </div>
  );
}
