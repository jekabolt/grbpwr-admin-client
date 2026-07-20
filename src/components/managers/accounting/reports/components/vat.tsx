import { googletype_Decimal } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { useOssReturn, useVatReturnPL } from '../../utils/hooks';
import { AmountCell } from '../../components/amount-cell';
import { adminService } from 'api/api';
import { CopyTableButton } from './copy-table-button';
import { XmlExportButton } from './xml-export-button';
import { CaveatsNote, formatMonthLabel, formatPercent, ReportState } from './report-utils';

type Props = {
  // Range `from` from the shared search-params contract. VAT is a monthly return, OSS a quarterly
  // one, so both dimensions are derived from `from` (the backend normalises to 1st / quarter start).
  from: string;
};

type VatRow = {
  label: string;
  value?: googletype_Decimal;
  // Rows the JPK return declares but that are settled on another return (OSS, UK) or carry no VAT
  // (zero-rated bases) — kept visible for completeness, flagged so they're not read into net_payable.
  note?: string;
  bold?: boolean;
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

const INFORMATIONAL = 'informational / filed separately';

// Phase-2 VAT: two statutory returns off the same period. (a) JPK_VAT — the monthly PL return, output
// VAT by regime minus input VAT = net_payable; OSS and UK figures are declared here for completeness
// but settled on their own returns, so they're flagged and excluded from net_payable (§backend
// GetVatReturnPLResponse). (b) OSS — the quarterly EU-B2C aggregate, one line per destination country.
export function VatTab({ from }: Props) {
  const month = monthStartOf(from);
  const quarter = quarterStartOf(from);

  const vat = useVatReturnPL(month);
  const oss = useOssReturn(quarter);

  const ret = vat.data;
  const rows: VatRow[] = ret
    ? [
        { label: 'output VAT — domestic (PL)', value: ret.outputDomestic },
        { label: 'output VAT — WNT self-charge', value: ret.outputWntSelfCharge },
        { label: 'OSS output VAT', value: ret.ossInfoTotal, note: INFORMATIONAL },
        { label: 'input VAT — domestic (PL)', value: ret.inputDomestic },
        { label: 'input VAT — WNT', value: ret.inputWnt },
        { label: 'input VAT — import', value: ret.inputImport },
        { label: 'net payable', value: ret.netPayable, bold: true },
        { label: 'UK output VAT — stock domestic', value: ret.outputUkStockDomestic, note: INFORMATIONAL },
        { label: 'UK input VAT — domestic', value: ret.inputUkDomestic, note: INFORMATIONAL },
        { label: 'net WDT (zero-rated base)', value: ret.netWdt, note: INFORMATIONAL },
        { label: 'net export (zero-rated base)', value: ret.netExport, note: INFORMATIONAL },
      ]
    : [];

  // TSV mirrors the visible table; amounts are the raw decimal `value` strings (unformatted).
  const vatCopyHeaders = ['line', 'amount'];
  const vatCopyRows: (string | number | undefined)[][] = rows.map((r) => [r.label, r.value?.value]);

  const ossRows = oss.data?.rows ?? [];
  const ossCopyHeaders = ['country', 'rate %', 'net', 'vat'];
  const ossCopyRows: (string | number | undefined)[][] = [
    ...ossRows.map((r) => [r.country, r.ratePct?.value, r.net?.value, r.vat?.value]),
    ['total', '', oss.data?.totalNet?.value, oss.data?.totalVat?.value],
  ];

  return (
    <div className='flex flex-col gap-8'>
      <section className='flex flex-col gap-3'>
        <Text variant='uppercase' className='font-medium'>
          JPK_VAT — monthly return · {formatMonthLabel(month)}
        </Text>
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
            <div className='overflow-x-auto'>
              <table className='w-full min-w-max border-collapse'>
                <thead className='border-b border-textColor'>
                  <tr>
                    <th className='px-2 py-2 text-left text-textBaseSize uppercase'>line</th>
                    <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>
                      amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className='border-b border-textInactiveColor'>
                      <td
                        className={`whitespace-nowrap px-2 py-1${r.bold ? ' border-t border-textColor font-medium' : ''}`}
                      >
                        {r.label}
                        {r.note ? (
                          <Text component='span' size='small' variant='inactive' className='ml-2'>
                            ({r.note})
                          </Text>
                        ) : null}
                      </td>
                      <AmountCell value={r.value} bold={r.bold} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ReportState>
      </section>

      <section className='flex flex-col gap-3'>
        <Text variant='uppercase' className='font-medium'>
          OSS — quarterly return · {formatQuarterLabel(quarter)}
        </Text>
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
            <div className='overflow-x-auto'>
              <table className='w-full min-w-max border-collapse'>
                <thead className='border-b border-textColor'>
                  <tr>
                    <th className='px-2 py-2 text-left text-textBaseSize uppercase'>country</th>
                    <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>
                      rate %
                    </th>
                    <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>net</th>
                    <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>vat</th>
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
                    <td className='border-t border-textColor px-2 py-1 font-medium'>total</td>
                    <td className='border-t border-textColor' />
                    <AmountCell value={oss.data?.totalNet} bold />
                    <AmountCell value={oss.data?.totalVat} bold />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </ReportState>
      </section>
    </div>
  );
}
