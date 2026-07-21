import { googletype_Decimal } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useFinancialHealth } from '../../utils/hooks';
import { CopyTableButton } from './copy-table-button';
import { CaveatsNote, ReportState } from './report-utils';

type Props = {
  from: string;
  to: string;
};

// Status → cell colour. Reuses the repo's ok/error convention (text-success / text-error, see
// BalancedBadge): a ratio that breaches its benchmark reads red like every other loss/warn signal;
// `na`/`track` (no data yet, or an informational metric) stay muted grey. Unknown → muted too.
const STATUS_CLS: Record<string, string> = {
  ok: 'text-success',
  warn: 'text-error',
  na: 'text-textInactiveColor',
  track: 'text-textInactiveColor',
};

// A ratio value carries its own display unit ("%", "x"/"×", "days", the base currency, or "").
// The backend computes the figure (§8.6 #6); this only appends the unit. Missing/non-finite → em
// dash, matching formatBase's "no data".
function formatHealthValue(value?: googletype_Decimal, unit?: string): string {
  const raw = value?.value;
  if (raw == null || raw === '') return '—';
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return '—';
  switch (unit) {
    case '%':
      return `${n.toFixed(1)} %`;
    case 'x':
    case '×':
      return `${n.toFixed(2)}×`;
    case 'days':
      return `${n.toFixed(0)} days`;
    default: {
      const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return unit ? `${s} ${unit}` : s;
    }
  }
}

// 4.x Financial Health: the ratio set over [from, to) as a flat table — metric · formula ·
// benchmark · value (unit-aware) · status. Status is the only colour-bearing column, so the
// benchmark comparison is legible at a glance without re-reading the numbers (§8.5).
export function FinancialHealthTab({ from, to }: Props) {
  const { data, isLoading, isError, refetch } = useFinancialHealth(from, to);
  const rows = data?.rows ?? [];
  const caveats = data?.caveats ?? [];

  const copyHeaders = ['metric', 'formula', 'benchmark', 'value', 'status'];
  const copyRows: (string | number | undefined)[][] = rows.map((r) => [
    r.name,
    r.formula,
    r.benchmark,
    r.value?.value,
    r.status,
  ]);

  return (
    <ReportState
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      isEmpty={rows.length === 0}
    >
      <div className='flex flex-col gap-3'>
        <CaveatsNote caveats={caveats} />
        <div className='flex justify-end'>
          <CopyTableButton headers={copyHeaders} rows={copyRows} filename='financial-health' />
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead className='border-b border-textColor'>
              <tr>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>metric</th>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>formula</th>
                <th className='px-2 py-2 text-left text-textBaseSize uppercase'>benchmark</th>
                <th className='min-w-32 px-2 py-2 text-right text-textBaseSize uppercase'>value</th>
                <th className='px-2 py-2 text-right text-textBaseSize uppercase'>status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name ?? i} className='border-b border-textInactiveColor'>
                  <td className='whitespace-nowrap px-2 py-1'>{r.name}</td>
                  <td className='px-2 py-1 text-labelColor'>{r.formula}</td>
                  <td className='whitespace-nowrap px-2 py-1 text-labelColor'>{r.benchmark}</td>
                  <td className='w-32 min-w-32 whitespace-nowrap px-2 py-1 text-right tabular-nums'>
                    {formatHealthValue(r.value, r.unit)}
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap px-2 py-1 text-right uppercase',
                      STATUS_CLS[r.status ?? ''] ?? 'text-textInactiveColor',
                    )}
                  >
                    {r.status ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportState>
  );
}
