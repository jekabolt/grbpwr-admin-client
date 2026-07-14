import type { ProfitabilitySection } from 'api/proto-http/admin';
import { FC, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';
import {
  formatCurrency,
  formatCurrencyDelta,
  formatPercentWithBand,
  getMetricComparison,
  parseDecimal,
} from '../utils';

interface ProfitabilityPanelProps {
  profitability: ProfitabilitySection | undefined;
  compareEnabled?: boolean;
}

// Below this coverage the margin % is a biased average of an unrepresentative slice — match the
// floor used by the Profit & Margin tiles above so the two blocks can never disagree.
const COVERAGE_FLOOR_FOR_PCT = 80;
// Below this many new customers, blended CAC swings on a handful of acquisitions — gray it.
const MIN_CUSTOMERS_FOR_CAC = 30;

type Cmp = ReturnType<typeof getMetricComparison>;

/** Good/bad delta vs the comparison period, in the shared arrow grammar. */
const Delta: FC<{
  cmp: Cmp;
  kind: 'currency' | 'pp';
  enabled: boolean;
  higherIsBetter?: boolean;
}> = ({ cmp, kind, enabled, higherIsBetter = true }) => {
  if (!enabled || cmp.compareValue === undefined) return null;
  const diff = kind === 'pp' ? (cmp.changeAbsolute ?? cmp.value - cmp.compareValue) : cmp.value - cmp.compareValue;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const good = dir === 'flat' ? 'flat' : (dir === 'up') === higherIsBetter ? 'good' : 'bad';
  const color =
    good === 'flat' ? 'text-textInactiveColor' : good === 'good' ? 'text-success' : 'text-error';
  const arrow = dir === 'up' ? '↑ ' : dir === 'down' ? '↓ ' : '';
  const text =
    kind === 'pp'
      ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(1)}pp`
      : formatCurrencyDelta(diff);
  return (
    <Text variant='uppercase' className={`text-textBaseSize ${color}`}>
      {arrow}
      {text}
    </Text>
  );
};

/** One waterfall line: label left, value right, optional delta + sublabel underneath. */
const WLine: FC<{
  label: string;
  value: string;
  strong?: boolean;
  sub?: ReactNode;
  delta?: ReactNode;
  valueTone?: string;
}> = ({ label, value, strong, sub, delta, valueTone }) => (
  <div className='py-1'>
    <div className='flex items-baseline justify-between gap-3'>
      <Text size='small' className={strong ? 'font-bold' : undefined}>
        {label}
      </Text>
      <Text size='small' className={`${strong ? 'font-bold' : ''} ${valueTone ?? ''}`}>
        {value}
      </Text>
    </div>
    {(sub || delta) && (
      <div className='flex items-baseline justify-between gap-3'>
        <span className='text-textInactiveColor text-textBaseSize'>{sub}</span>
        {delta}
      </div>
    )}
  </div>
);

const UnitTile: FC<{ label: string; value: ReactNode; sub?: ReactNode; muted?: boolean }> = ({
  label,
  value,
  sub,
  muted,
}) => (
  <div className='space-y-1'>
    <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
      {label}
    </Text>
    <Text className={`font-bold text-lg ${muted ? 'text-textInactiveColor' : ''}`}>{value}</Text>
    {sub && <div className='text-textInactiveColor text-textBaseSize uppercase'>{sub}</div>}
  </div>
);

/**
 * Full P&L waterfall + unit economics. Costing-gated by the caller (the server nulls the money
 * fields without costing:read). Absorbs the operating-result waterfall that used to live in
 * OperatingResultStrip, so the money story appears once, period-consistent, with compare deltas.
 */
export const ProfitabilityPanel: FC<ProfitabilityPanelProps> = ({
  profitability,
  compareEnabled = false,
}) => {
  if (!profitability) return null;

  const grossMargin = getMetricComparison(profitability.grossMargin as any);
  const grossMarginPct = getMetricComparison(profitability.grossMarginPct as any);
  const contribution = getMetricComparison(profitability.contributionMargin as any);
  const totalDiscount = getMetricComparison(profitability.totalDiscount as any);
  const productDiscount = getMetricComparison(profitability.productSaleDiscount as any);
  const promoDiscount = getMetricComparison(profitability.promoCodeDiscount as any);
  const discountRate = getMetricComparison(profitability.discountRatePct as any);
  const cpo = getMetricComparison(profitability.cpo as any);
  const cac = getMetricComparison(profitability.blendedCac as any);
  const fulfilment = getMetricComparison(profitability.fulfilmentCostPerOrder as any);
  const refundRate = getMetricComparison(profitability.refundRate as any);
  const totalRefunded = getMetricComparison(profitability.totalRefunded as any);

  const coverage = profitability.costCoveragePct ?? 0;
  const marginPctTrusted = coverage >= COVERAGE_FLOOR_FOR_PCT;
  const hasSpend = !!profitability.hasSpend;
  const ltv = parseDecimal(profitability.ltv);
  const ltvCac = profitability.ltvCacRatio ?? 0;

  const opex = parseDecimal(profitability.opexTotal);
  const marketing = parseDecimal(profitability.marketingSpend);
  const operating = parseDecimal(profitability.operatingResult);
  const hasAssembly =
    !!profitability.operatingResult?.value ||
    !!profitability.opexTotal?.value ||
    !!profitability.marketingSpend?.value;

  // Nothing to render if the whole section is empty (non-costed period).
  const hasAnything =
    grossMargin.value !== 0 ||
    contribution.value !== 0 ||
    totalDiscount.value !== 0 ||
    hasAssembly;
  if (!hasAnything) return null;

  const ltvCacTone = ltvCac >= 3 ? 'text-success' : ltvCac > 0 && ltvCac < 1 ? 'text-error' : '';
  const cacMuted = hasSpend && (cac.sampleSize ?? 0) > 0 && (cac.sampleSize ?? 0) < MIN_CUSTOMERS_FOR_CAC;

  return (
    <div className='space-y-2'>
      <h3 className='text-textBaseSize font-bold uppercase'>Profitability</h3>
      <div className='grid gap-4 border-2 border-textInactiveColor/20 bg-bgSecondary/30 p-4 md:grid-cols-2'>
        {/* Left: the P&L waterfall */}
        <div className='space-y-0 md:border-r md:border-textInactiveColor/40 md:pr-4'>
          <WLine
            label='Gross margin'
            value={formatCurrency(grossMargin.value)}
            sub={
              marginPctTrusted
                ? `margin ${grossMarginPct.value.toFixed(0)}%`
                : `need ≥${COVERAGE_FLOOR_FOR_PCT}% costed (${coverage.toFixed(0)}% now)`
            }
            delta={<Delta cmp={grossMargin} kind='currency' enabled={compareEnabled} />}
          />

          {totalDiscount.value > 0 && (
            <details className='py-1'>
              <summary className='flex cursor-pointer items-baseline justify-between gap-3'>
                <Text size='small'>− Discounts</Text>
                <Text size='small'>−{formatCurrency(totalDiscount.value)}</Text>
              </summary>
              <div className='mt-1 space-y-0.5 pl-3'>
                <div className='flex items-baseline justify-between gap-3 text-textInactiveColor text-textBaseSize'>
                  <span>sale</span>
                  <span>−{formatCurrency(productDiscount.value)}</span>
                </div>
                <div className='flex items-baseline justify-between gap-3 text-textInactiveColor text-textBaseSize'>
                  <span>promo</span>
                  <span>−{formatCurrency(promoDiscount.value)}</span>
                </div>
                {discountRate.value > 0 && (
                  <Text className='text-textInactiveColor text-textBaseSize'>
                    {discountRate.value.toFixed(1)}% of gross revenue
                  </Text>
                )}
              </div>
            </details>
          )}

          <WLine
            label='= Contribution'
            value={formatCurrency(contribution.value)}
            sub='to fixed costs, not profit'
            delta={<Delta cmp={contribution} kind='currency' enabled={compareEnabled} />}
          />

          {hasAssembly && (
            <>
              <WLine label='− OPEX (fixed, pro-rated)' value={`−${formatCurrency(opex)}`} />
              <WLine label='− Marketing spend' value={`−${formatCurrency(marketing)}`} />
              <div className='mt-1 border-t border-textInactiveColor pt-1'>
                <WLine
                  label='= Operating result'
                  value={formatCurrency(operating)}
                  strong
                  valueTone={operating < 0 ? 'text-error' : ''}
                />
              </div>
            </>
          )}

          {profitability.opexCaveat && (
            <Text variant='inactive' size='small' className='mt-2 block'>
              {profitability.opexCaveat}
            </Text>
          )}
          <Text variant='inactive' size='small' className='mt-2 block'>
            {hasAssembly
              ? 'operating result = contribution − opex − marketing (EBITDA-ish; not audited profit).'
              : 'add OPEX and marketing spend to complete the operating result.'}
          </Text>
        </div>

        {/* Right: unit economics */}
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-3'>
            <UnitTile
              label='CPO'
              value={hasSpend ? formatCurrency(cpo.value) : '—'}
              sub='marketing € / order'
              muted={!hasSpend}
            />
            <UnitTile
              label='Blended CAC'
              value={hasSpend ? formatCurrency(cac.value) : '—'}
              sub={cacMuted ? 'small sample' : 'marketing € / new customer'}
              muted={!hasSpend || cacMuted}
            />
            <UnitTile
              label='LTV (historical)'
              value={ltv > 0 ? formatCurrency(ltv) : '—'}
              sub='realized revenue / customer'
            />
            <UnitTile
              label='LTV : CAC'
              value={
                <span className={ltvCacTone}>{ltvCac > 0 ? `${ltvCac.toFixed(1)}×` : '—'}</span>
              }
              sub='healthy ≥ 3'
              muted={ltvCac <= 0}
            />
            <UnitTile
              label='Fulfilment € / order'
              value={fulfilment.value > 0 ? formatCurrency(fulfilment.value) : '—'}
              sub='shipping + fees'
            />
            <UnitTile
              label='Refund rate'
              value={formatPercentWithBand(refundRate.value, refundRate.marginOfError)}
              sub={totalRefunded.value > 0 ? formatCurrency(totalRefunded.value) : undefined}
            />
          </div>

          {!hasSpend && (
            <Text className='text-textInactiveColor text-textBaseSize'>
              Enter ad spend in{' '}
              <Link to={{ search: '?tab=growth' }} className='underline hover:text-blue'>
                Growth → Campaigns &amp; channels
              </Link>{' '}
              to unlock CPO / CAC / LTV:CAC.
            </Text>
          )}
          {profitability.caveat && (
            <Text variant='inactive' size='small'>
              {profitability.caveat}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
};
