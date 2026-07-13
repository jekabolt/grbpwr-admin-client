import type { MarginByStyleRow } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { generatePath, Link } from 'react-router-dom';
import Text from 'ui/components/text';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface MarginByStyleTableProps {
  marginByStyle: MarginByStyleRow[] | undefined;
}

// Margin rolled up to the tech-card style (across its colourways). Costing-gated: the backend
// omits this section entirely without costing:read, so an empty list simply hides the report.
export const MarginByStyleTable: FC<MarginByStyleTableProps> = ({ marginByStyle }) => {
  if (!marginByStyle || marginByStyle.length === 0) return null;

  const rows = [...marginByStyle]
    .sort((a, b) => parseDecimal(b.grossMargin) - parseDecimal(a.grossMargin))
    .slice(0, 30);
  const anyCosted = rows.some((r) => r.hasCost);

  return (
    <div className='border border-textInactiveColor p-4'>
      <Text variant='uppercase' className='font-bold block mb-4'>
        Margin by style
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full text-textBaseSize'>
          <thead>
            <tr className='border-b border-textInactiveColor'>
              <th className='text-left p-2'>Style</th>
              <th className='text-right p-2'>Revenue</th>
              <th className='text-right p-2'>Units</th>
              <th className='text-right p-2'>Colorways</th>
              <th className='text-right p-2'>Unit cost</th>
              <th className='text-right p-2'>COGS</th>
              <th className='text-right p-2'>Gross margin</th>
              <th className='text-right p-2'>Margin %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.techCardId}
                className='border-b border-textInactiveColor hover:bg-bgSecondary'
              >
                <td className='p-2'>
                  {r.techCardId ? (
                    <Link
                      to={generatePath(ROUTES.singleTechCard, { id: String(r.techCardId) })}
                      className='underline underline-offset-2 hover:text-textColor'
                    >
                      {r.styleNumber || r.name || `TC-${r.techCardId}`}
                    </Link>
                  ) : (
                    <Text>{r.styleNumber || r.name || '—'}</Text>
                  )}
                </td>
                <td className='p-2 text-right'>{formatCurrency(parseDecimal(r.revenue))}</td>
                <td className='p-2 text-right'>{formatNumber(r.unitsSold ?? 0)}</td>
                <td className='p-2 text-right'>{formatNumber(r.colorwayCount ?? 0)}</td>
                <td className='p-2 text-right'>
                  {r.hasCost ? formatCurrency(parseDecimal(r.unitCost)) : '—'}
                </td>
                <td className='p-2 text-right'>
                  {r.hasCost ? formatCurrency(parseDecimal(r.revenueCost)) : '—'}
                </td>
                <td className='p-2 text-right'>
                  {r.hasCost ? formatCurrency(parseDecimal(r.grossMargin)) : '—'}
                </td>
                <td className='p-2 text-right'>
                  {r.hasCost ? `${(r.grossMarginPct ?? 0).toFixed(0)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!anyCosted && (
        <Text variant='inactive' size='small' className='mt-3 block'>
          No styles have a unit cost yet — set costs on tech cards to unlock margin here.
        </Text>
      )}
    </div>
  );
};
