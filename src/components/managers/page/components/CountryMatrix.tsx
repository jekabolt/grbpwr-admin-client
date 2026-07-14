import type {
  CountryDemandRow,
  CountryEconomicsRow,
  CountryLogisticsRow,
  GeographySection,
} from 'api/proto-http/admin';
import { FC, ReactNode, useState } from 'react';
import Text from 'ui/components/text';
import { countryDisplay, UNMATCHED_COUNTRY } from '../countries';
import { formatCurrency, formatNumber, parseDecimal } from '../utils';

interface CountryMatrixProps {
  geography: GeographySection | undefined;
  canReadCosting: boolean;
}

type ViewKey = 'economics' | 'logistics' | 'demand';

// Per-country trust floors, mirroring the dashboard-wide conventions.
const COVERAGE_FLOOR_FOR_PCT = 80; // margin % biased below this cost coverage
const LTV_SAMPLE_FLOOR = 3; // LTV avg swings on too few customers
const LOGISTICS_SAMPLE_FLOOR = 5; // durations noisy below this delivered sample
const REFUND_RATE_FLAG_PCT = 10; // refund rate worth flagging…
const REFUND_ORDERS_FLAG = 3; // …but only with enough refund orders behind it
const UNDERSERVED_SESSIONS = 200; // enough demand that a near-zero conversion is a real gap
const UNDERSERVED_CONV_PCT = 0.2;

const VIEW_LABEL: Record<ViewKey, string> = {
  economics: 'Economics',
  logistics: 'Logistics',
  demand: 'Demand',
};

const CountryCell: FC<{ code: string | undefined; sub?: ReactNode }> = ({ code, sub }) => {
  const { flag, name, unmatched } = countryDisplay(code);
  return (
    <div>
      <span className={unmatched ? 'text-textInactiveColor' : undefined}>
        {flag && <span className='mr-1'>{flag}</span>}
        {name}
      </span>
      {sub && <div className='text-labelColor text-textBaseSize normal-case'>{sub}</div>}
    </div>
  );
};

const Th: FC<{ children: ReactNode; right?: boolean }> = ({ children, right }) => (
  <th className={`p-2 ${right ? 'text-right' : 'text-left'}`}>
    <Text variant='uppercase' className='text-textBaseSize'>
      {children}
    </Text>
  </th>
);

const TableShell: FC<{ head: ReactNode; children: ReactNode }> = ({ head, children }) => (
  <div className='overflow-x-auto border border-textInactiveColor'>
    <table className='w-full text-textBaseSize'>
      <thead>
        <tr className='border-b border-textInactiveColor'>{head}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

// --- Economics -----------------------------------------------------------------------------

const EconomicsView: FC<{ rows: CountryEconomicsRow[] }> = ({ rows }) => {
  const sorted = [...rows].sort(
    (a, b) => parseDecimal(b.contributionMargin) - parseDecimal(a.contributionMargin),
  );
  const maxRevenue = Math.max(...sorted.map((r) => parseDecimal(r.revenue)), 1);

  return (
    <>
      <TableShell
        head={
          <>
            <Th>Country</Th>
            <Th right>Revenue</Th>
            <Th right>Orders</Th>
            <Th right>Margin</Th>
            <Th right>Shipping</Th>
            <Th right>Fees</Th>
            <Th right>Contribution</Th>
            <Th right>Profit / order</Th>
            <Th right>LTV</Th>
          </>
        }
      >
        {sorted.map((r, i) => {
          const revenue = parseDecimal(r.revenue);
          const profitPerOrder = parseDecimal(r.profitPerOrder);
          const coverage = r.costCoveragePct ?? 0;
          const marginTrusted = coverage >= COVERAGE_FLOOR_FOR_PCT;
          const ltvSample = r.ltvSample ?? 0;
          return (
            <tr key={`${r.country ?? 'x'}-${i}`} className='border-b border-textInactiveColor'>
              <td className='p-2'>
                <CountryCell code={r.country} />
              </td>
              <td className='p-2 text-right'>
                <div>{formatCurrency(revenue)}</div>
                <div className='mt-0.5 h-1 w-full bg-bgSecondary/40'>
                  <div
                    className='h-1 bg-textColor/50'
                    style={{ width: `${Math.min(100, (revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </td>
              <td className='p-2 text-right'>{formatNumber(r.orders ?? 0)}</td>
              <td className='p-2 text-right'>
                {marginTrusted ? (
                  `${(r.grossMarginPct ?? 0).toFixed(0)}%`
                ) : (
                  <span
                    className='text-textInactiveColor'
                    title={`${coverage.toFixed(0)}% of this country's revenue is costed`}
                  >
                    —
                  </span>
                )}
              </td>
              <td className='p-2 text-right'>−{formatCurrency(parseDecimal(r.shippingCost))}</td>
              <td className='p-2 text-right'>−{formatCurrency(parseDecimal(r.paymentFees))}</td>
              <td className='p-2 text-right'>
                {formatCurrency(parseDecimal(r.contributionMargin))}
              </td>
              <td
                className={`p-2 text-right font-bold ${profitPerOrder < 0 ? 'text-error' : ''}`}
              >
                {formatCurrency(profitPerOrder)}
              </td>
              <td className='p-2 text-right'>
                {ltvSample >= LTV_SAMPLE_FLOOR ? formatCurrency(parseDecimal(r.ltvAvg)) : '—'}
                <span className='text-textInactiveColor'> n={ltvSample}</span>
              </td>
            </tr>
          );
        })}
      </TableShell>
      <Text className='mt-2 text-textInactiveColor text-textBaseSize'>
        shipping = actual carrier cost incl. return leg · fees = captured Stripe fees · contribution
        = margin − shipping − fees.
      </Text>
    </>
  );
};

// --- Logistics -----------------------------------------------------------------------------

const LogisticsView: FC<{ rows: CountryLogisticsRow[] }> = ({ rows }) => {
  const sorted = [...rows].sort((a, b) => (b.deliveredSample ?? 0) - (a.deliveredSample ?? 0));
  return (
    <TableShell
      head={
        <>
          <Th>Country</Th>
          <Th right>Door-to-door</Th>
          <Th right>To ship</Th>
          <Th right>On-time</Th>
          <Th right>Ship cost</Th>
          <Th right>Refunds</Th>
        </>
      }
    >
      {sorted.map((r, i) => {
        const sample = r.deliveredSample ?? 0;
        const muted = sample < LOGISTICS_SAMPLE_FLOOR;
        const mutedCls = muted ? 'text-textInactiveColor' : '';
        const refundRate = r.refundRatePct ?? 0;
        const refundOrders = r.refundOrders ?? 0;
        const refundBad = refundRate >= REFUND_RATE_FLAG_PCT && refundOrders >= REFUND_ORDERS_FLAG;
        return (
          <tr key={`${r.country ?? 'x'}-${i}`} className='border-b border-textInactiveColor'>
            <td className='p-2'>
              <CountryCell code={r.country} />
            </td>
            <td className={`p-2 text-right ${mutedCls}`}>
              {(r.avgDaysPlacedToDelivered ?? 0).toFixed(1)} d
            </td>
            <td className={`p-2 text-right ${mutedCls}`}>
              {(r.avgDaysPlacedToShipped ?? 0).toFixed(1)} d
            </td>
            <td className={`p-2 text-right ${mutedCls}`}>
              {(r.onTimeRatePct ?? 0).toFixed(0)}%
              <span className='text-textInactiveColor'> n={sample}</span>
            </td>
            <td className='p-2 text-right'>{formatCurrency(parseDecimal(r.avgShippingCost))}</td>
            <td className={`p-2 text-right ${refundBad ? 'text-error' : ''}`}>
              {refundRate.toFixed(1)}%
              <span className={refundBad ? '' : 'text-textInactiveColor'}>
                {' · '}
                {formatNumber(refundOrders)}
              </span>
            </td>
          </tr>
        );
      })}
    </TableShell>
  );
};

// --- Demand --------------------------------------------------------------------------------

const DemandView: FC<{ rows: CountryDemandRow[] }> = ({ rows }) => {
  // Sessions desc, but the "(unmatched)" GA4 bucket always sinks to the bottom.
  const sorted = [...rows].sort((a, b) => {
    const au = a.country === UNMATCHED_COUNTRY ? 1 : 0;
    const bu = b.country === UNMATCHED_COUNTRY ? 1 : 0;
    if (au !== bu) return au - bu;
    return (b.sessions ?? 0) - (a.sessions ?? 0);
  });
  return (
    <>
      <TableShell
        head={
          <>
            <Th>Country</Th>
            <Th right>Sessions</Th>
            <Th right>Orders</Th>
            <Th right>Conv</Th>
            <Th right>AOV</Th>
            <Th right>New / ret</Th>
            <Th>Top categories</Th>
          </>
        }
      >
        {sorted.map((r, i) => {
          const sessions = r.sessions ?? 0;
          const conv = r.conversionRatePct ?? 0;
          const underserved = sessions >= UNDERSERVED_SESSIONS && conv < UNDERSERVED_CONV_PCT;
          const cats = (r.topCategories ?? [])
            .slice(0, 3)
            .map(
              (c) =>
                `${c.categoryDisplayName || c.categoryName || '—'} ${(c.sharePct ?? 0).toFixed(0)}%`,
            )
            .join(' · ');
          return (
            <tr key={`${r.country ?? 'x'}-${i}`} className='border-b border-textInactiveColor'>
              <td className='p-2'>
                <CountryCell
                  code={r.country}
                  sub={underserved ? 'demand without conversion' : undefined}
                />
              </td>
              <td className='p-2 text-right'>
                {sessions > 0 ? formatNumber(sessions) : '—'}
              </td>
              <td className='p-2 text-right'>{formatNumber(r.orders ?? 0)}</td>
              <td className='p-2 text-right' title={r.caveat || undefined}>
                {sessions > 0 ? `${conv.toFixed(1)}%` : '—'}
              </td>
              <td className='p-2 text-right'>{formatCurrency(parseDecimal(r.aov))}</td>
              <td className='p-2 text-right'>
                {(r.newSharePct ?? 0).toFixed(0)}% new
                <span className='text-textInactiveColor'>
                  {' '}
                  ({formatNumber(r.newCustomers ?? 0)}/{formatNumber(r.returningCustomers ?? 0)})
                </span>
              </td>
              <td className='p-2'>
                <span className='block max-w-[16rem] truncate text-labelColor' title={cats}>
                  {cats || '—'}
                </span>
              </td>
            </tr>
          );
        })}
      </TableShell>
      <Text className='mt-2 text-textInactiveColor text-textBaseSize'>
        sessions and conversion are GA4-sourced and directional at boutique traffic.
      </Text>
    </>
  );
};

/**
 * Per-country economics / logistics / demand in ONE table with a segmented view toggle — the
 * operator picks a country in their head, then interrogates it across dimensions by switching
 * the column set. Economics is costing-gated: without costing:read the option isn't offered at
 * all (field-shaping, not a disabled button).
 */
export const CountryMatrix: FC<CountryMatrixProps> = ({ geography, canReadCosting }) => {
  const economics = geography?.economicsByCountry ?? [];
  const logistics = geography?.logisticsByCountry ?? [];
  const demand = geography?.demandByCountry ?? [];

  const views: ViewKey[] = [];
  if (canReadCosting && economics.length > 0) views.push('economics');
  if (logistics.length > 0) views.push('logistics');
  if (demand.length > 0) views.push('demand');

  const [active, setActive] = useState<ViewKey | null>(null);
  if (views.length === 0) return null;
  const view = active && views.includes(active) ? active : views[0];

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-textBaseSize font-bold uppercase'>Countries</h3>
        {views.length > 1 && (
          <div className='flex border border-textInactiveColor'>
            {views.map((v) => (
              <button
                key={v}
                type='button'
                onClick={() => setActive(v)}
                className={`px-3 py-1.5 text-textBaseSize uppercase transition-colors ${
                  v === view
                    ? 'bg-textColor text-bgColor'
                    : 'text-textInactiveColor hover:text-textColor'
                }`}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'economics' && <EconomicsView rows={economics} />}
      {view === 'logistics' && <LogisticsView rows={logistics} />}
      {view === 'demand' && <DemandView rows={demand} />}
    </div>
  );
};
