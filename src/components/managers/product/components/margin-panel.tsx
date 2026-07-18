import { ColorwayCostInfo } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { StyleEconomicsModal } from 'components/managers/page/components/StyleEconomicsModal';
import { formatCurrency, parseDecimal } from 'components/managers/page/utils';
import { currencySymbols, SELLING_CURRENCIES } from 'constants/constants';
import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useCostingFxRates } from './useCostingFxRates';

// cost_price is booked in the base currency; margin is normalised to it.
const BASE_CURRENCY = 'EUR';

type PriceEntry = { currency?: string; price?: { value?: string } };

function isIntegerCurrency(c: string) {
  return c === 'JPY' || c === 'KRW';
}

// Local price with its own symbol (JPY/KRW are whole-number currencies). The EUR-normalised margin
// figures use formatCurrency() instead.
function formatLocal(value: number, currency: string): string {
  const sym = currencySymbols[currency] ?? '';
  const n = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: isIntegerCurrency(currency) ? 0 : 2,
    maximumFractionDigits: isIntegerCurrency(currency) ? 0 : 2,
  }).format(value);
  return `${sym}${n}`;
}

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// A currency whose margin differs from the reference by at least this many percentage points is
// flagged: the same garment at the same cost should earn a similar margin everywhere, so a big gap
// means that market is priced out of line.
const MARGIN_DEVIATION_PP = 10;

// Health tint: red = losing money, amber = thin (<40%), green = healthy. Matches the text-* color
// override pattern used in price-fields.
function marginClass(pct: number | null): string {
  if (pct == null) return 'text-textInactiveColor';
  if (pct < 0) return 'text-error';
  if (pct < 40) return 'text-warning';
  return 'text-success';
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type MarginRow = {
  currency: string;
  full: number; // full local selling price
  effective: number; // sale-adjusted local price (== full when no sale)
  eur: number | null; // effective price expressed in base currency; null when no FX rate
  marginEur: number | null;
  marginPct: number | null; // margin over the effective (sale) price
  markupPct: number | null; // margin over cost
  fullMarginPct: number | null; // margin at full price (for the muted secondary when a sale is on)
  exact: boolean; // base currency — no FX approximation
};

// Per-unit margin for one colourway, at its (discounted) selling price, shown per selling currency.
// The confidential COGS lives in base currency; each non-base price is converted to base via the
// costing FX rates (auto-updated from ECB) so its margin is honest even when markets are priced
// independently. A currency whose margin deviates materially from the reference is flagged.
export function ProductMarginPanel({ costInfo }: { costInfo?: ColorwayCostInfo }) {
  const { canReadCosting } = usePermissions();
  const { watch } = useFormContext();
  const [ecoOpen, setEcoOpen] = useState(false);
  const { data: fxData } = useCostingFxRates(canReadCosting);

  const pricesRaw = (watch('prices') as PriceEntry[] | undefined) ?? [];
  const saleRaw = watch('product.productBodyInsert.salePercentage.value') as string | undefined;
  const costRaw = watch('product.costPrice') as string | undefined;

  const sale = Math.max(0, Math.min(99, parseFloat(saleRaw ?? '0') || 0));

  // Live cost: a freshly-typed cost preview wins; otherwise the stored base-currency COGS.
  const cost = useMemo(() => {
    const typed = (costRaw ?? '').trim();
    if (typed !== '') {
      const n = parseFloat(typed);
      if (!Number.isNaN(n)) return n;
    }
    return parseDecimal(costInfo?.costPrice);
  }, [costRaw, costInfo?.costPrice]);

  // currency -> base-per-unit rate; latest valid_from wins; the base currency is exact (1).
  const rateMap = useMemo(() => {
    const m = new Map<string, number>();
    const seenTs = new Map<string, number>();
    for (const r of fxData?.rates ?? []) {
      const cur = r.currency;
      const val = r.rateToBase?.value;
      if (!cur || !val) continue;
      const rate = parseFloat(val);
      if (Number.isNaN(rate) || rate <= 0) continue;
      const ts = Date.parse(String(r.validFrom ?? '')) || 0;
      const prev = seenTs.get(cur);
      if (prev === undefined || ts >= prev) {
        seenTs.set(cur, ts);
        m.set(cur, rate);
      }
    }
    m.set(BASE_CURRENCY, 1);
    return m;
  }, [fxData]);

  const rows = useMemo<MarginRow[]>(() => {
    return SELLING_CURRENCIES.map((c): MarginRow => {
      const entry = pricesRaw.find((p) => p?.currency === c.value);
      const full = parseFloat(entry?.price?.value ?? '0') || 0;
      const effective = (full * (100 - sale)) / 100;
      const isBase = c.value === BASE_CURRENCY;
      const rate = rateMap.get(c.value);
      const toBase = (v: number): number | null => (isBase ? v : rate != null ? v * rate : null);
      const eur = toBase(effective);
      const fullEur = toBase(full);
      const marginEur = eur != null ? eur - cost : null;
      const marginPct = eur != null && eur > 0 ? ((eur - cost) / eur) * 100 : null;
      const markupPct = marginEur != null && cost > 0 ? (marginEur / cost) * 100 : null;
      const fullMarginPct =
        fullEur != null && fullEur > 0 ? ((fullEur - cost) / fullEur) * 100 : null;
      return {
        currency: c.value,
        full,
        effective,
        eur,
        marginEur,
        marginPct,
        markupPct,
        fullMarginPct,
        exact: isBase,
      };
    }).filter((r) => r.full > 0);
  }, [pricesRaw, sale, cost, rateMap]);

  // Margin is confidential derived data — costing:read only (a write-only account gets the cost
  // input but never the read-side margin). Hooks above run unconditionally.
  if (!canReadCosting) return null;

  const techCardId = costInfo?.primaryTechCardId ?? 0;
  const baseRow = rows.find((r) => r.currency === BASE_CURRENCY);
  const anyMissingRate = rows.some((r) => !r.exact && r.eur == null);
  const hasCost = cost > 0;
  const hasPrices = rows.length > 0;
  const baseSym = currencySymbols[BASE_CURRENCY] ?? BASE_CURRENCY;

  // Dispersion reference: the exact base (EUR) margin when priced, else the median of the available
  // margins. Each currency's deviation from it flags a market that's priced out of line.
  const refIsBase = baseRow?.marginPct != null;
  const refMargin = refIsBase
    ? baseRow?.marginPct ?? null
    : median(rows.map((r) => r.marginPct).filter((v): v is number => v != null));
  const refLabel = refIsBase ? BASE_CURRENCY : 'median';
  const withDev = rows.map((r) => {
    const isRef = refIsBase && r.currency === BASE_CURRENCY;
    const dev = r.marginPct != null && refMargin != null && !isRef ? r.marginPct - refMargin : null;
    return { ...r, dev, isOutlier: dev != null && Math.abs(dev) >= MARGIN_DEVIATION_PP };
  });
  const outlierCount = withDev.filter((r) => r.isOutlier).length;

  return (
    <div className='flex flex-col gap-3 border-t border-textInactiveColor pt-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
        <Text variant='uppercase' size='small' className='font-bold'>
          margin
        </Text>
        <Text variant='inactive' size='small'>
          {sale > 0 ? `at sale price · −${sale}%` : 'at retail price'}
          {hasCost ? ` · vs cost ${baseSym}${cost.toFixed(2)}/unit` : ''}
        </Text>
      </div>

      {!hasCost ? (
        <Text variant='inactive' size='small'>
          No unit cost recorded — set a cost above to see margin.
        </Text>
      ) : !hasPrices ? (
        <Text variant='inactive' size='small'>
          No selling price set — add a price to see margin.
        </Text>
      ) : (
        <>
          {baseRow && baseRow.marginPct != null && (
            <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
              <Text size='large' className={`font-bold ${marginClass(baseRow.marginPct)}`}>
                {fmtPct(baseRow.marginPct)}
              </Text>
              <Text size='small' className={marginClass(baseRow.marginPct)}>
                {formatCurrency(baseRow.marginEur ?? 0)} / unit
              </Text>
              {baseRow.markupPct != null && (
                <Text variant='inactive' size='small'>
                  {fmtPct(baseRow.markupPct)} markup
                </Text>
              )}
              {sale > 0 && baseRow.fullMarginPct != null && (
                <Text variant='inactive' size='small'>
                  {fmtPct(baseRow.fullMarginPct)} at full price
                </Text>
              )}
            </div>
          )}

          {outlierCount > 0 && (
            <Text size='small' className='text-warning'>
              ⚠ Margin is off by ≥{MARGIN_DEVIATION_PP}pp vs {refLabel} in {outlierCount}{' '}
              {outlierCount === 1 ? 'currency' : 'currencies'} — that market may be mispriced.
            </Text>
          )}

          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
            {withDev.map((r) => (
              <div
                key={r.currency}
                className={`flex flex-col gap-0.5 border p-2 ${
                  r.isOutlier ? 'border-warning bg-warning/10' : 'border-textInactiveColor'
                }`}
              >
                <div className='flex items-center justify-between gap-1'>
                  <Text size='small' variant='inactive'>
                    {r.currency} {currencySymbols[r.currency] ?? ''}
                  </Text>
                  {r.exact ? (
                    <Text size='small' variant='inactive'>
                      base
                    </Text>
                  ) : r.eur == null ? (
                    <Text size='small' className='text-warning'>
                      no FX
                    </Text>
                  ) : (
                    <Text size='small' variant='inactive'>
                      ≈ FX
                    </Text>
                  )}
                </div>
                <Text size='small'>
                  {formatLocal(r.effective, r.currency)}
                  {sale > 0 && <span className='text-textInactiveColor'> · −{sale}%</span>}
                </Text>
                {r.marginPct == null ? (
                  <Text size='small' variant='inactive'>
                    margin —
                  </Text>
                ) : (
                  <Text size='small' className={marginClass(r.marginPct)}>
                    {fmtPct(r.marginPct)} · {formatCurrency(r.marginEur ?? 0)}
                    {!r.exact && r.eur != null && (
                      <span className='text-textInactiveColor'> (≈{formatCurrency(r.eur)})</span>
                    )}
                  </Text>
                )}
                {r.isOutlier && r.dev != null && (
                  <Text size='small' className='text-warning'>
                    {r.dev < 0 ? '▼' : '▲'} {Math.abs(r.dev).toFixed(0)}pp vs {refLabel}
                  </Text>
                )}
              </div>
            ))}
          </div>

          {anyMissingRate && (
            <Text variant='inactive' size='small'>
              Non-{BASE_CURRENCY} prices are converted to {BASE_CURRENCY} via the latest costing FX
              rates, auto-updated from ECB ({BASE_CURRENCY} is exact). Currencies marked “no FX”
              have no rate yet, so their margin can’t be computed.
            </Text>
          )}
        </>
      )}

      {techCardId > 0 && (
        <div>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            onClick={() => setEcoOpen(true)}
          >
            ▸ full style economics
          </Button>
        </div>
      )}
      <StyleEconomicsModal
        techCardId={techCardId || undefined}
        open={ecoOpen}
        onOpenChange={setEcoOpen}
      />
    </div>
  );
}
