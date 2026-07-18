import {
  common_TechCard,
  StyleCostArticleLine,
  StyleCostComparison,
  StyleCostEstimate,
  StyleCostMaterialLine,
  StyleCostPriceSource,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardBomSectionOptions } from 'constants/filter';
import { useState } from 'react';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { useStyleCostEstimate } from './useStyleReadViews';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const th = `${cell} text-left uppercase`;
const thRight = `${cell} text-right uppercase`;
const td = cell;
const tdRight = `${cell} text-right`;
const badge = 'inline-block w-fit shrink-0 border px-1 text-textBaseSize uppercase leading-tight';

const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '—';

// Provenance badge for a material line's price (Q4 transparency): which rung of the price ladder
// it resolved to. NONE is a real gap (no price found anywhere) so it reads as a warning, not just
// another neutral state.
const PRICE_SOURCE_LABEL: Partial<Record<StyleCostPriceSource, string>> = {
  STYLE_COST_PRICE_SOURCE_BOM_SNAPSHOT: 'plan (snapshot)',
  STYLE_COST_PRICE_SOURCE_CATALOG_LATEST: 'catalog',
  STYLE_COST_PRICE_SOURCE_NONE: 'no price',
};

function PriceSourceBadge({ source }: { source?: StyleCostPriceSource }) {
  const label = source ? PRICE_SOURCE_LABEL[source] : undefined;
  if (!label)
    return (
      <Text variant='inactive' size='small'>
        —
      </Text>
    );
  const warn = source === 'STYLE_COST_PRICE_SOURCE_NONE';
  return (
    <span
      className={`${badge} ${warn ? 'border-warning text-warning' : 'border-textInactiveColor text-textInactiveColor'}`}
    >
      {label}
    </span>
  );
}

// A base-currency amount that couldn't be folded (hasBase === false, e.g. a currency with no FX
// rate) — show the raw figure (may be empty) plus an explicit warning, never a silently-wrong 0.
function BaseAmount({ value, hasBase }: { value: string; hasBase?: boolean }) {
  return (
    <div className='flex flex-col items-end gap-0.5'>
      <Text size='small'>{value || '—'}</Text>
      {hasBase === false && (
        <Text size='small' className='text-warning'>
          ⚠ no base rate
        </Text>
      )}
    </div>
  );
}

function MaterialsTable({
  materials,
  baseCurrency,
}: {
  materials: StyleCostMaterialLine[];
  baseCurrency?: string;
}) {
  if (materials.length === 0) {
    return (
      <Text variant='label' size='small'>
        no BOM materials
      </Text>
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-max border-collapse'>
        <thead>
          <tr>
            <th className={th}>material</th>
            <th className={th}>section</th>
            <th className={thRight}>consumption</th>
            <th className={thRight}>unit price</th>
            <th className={th}>source</th>
            <th className={thRight}>wastage %</th>
            <th className={thRight}>line total ({baseCurrency || 'base'})</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m, i) => (
            <tr key={m.bomItemId || i}>
              <td className={td}>{m.materialName || `#${m.bomItemId}`}</td>
              <td className={td}>{sectionLabel(m.section)}</td>
              <td className={tdRight}>
                {decimalToInput(m.consumption) || '—'} {m.unit || ''}
              </td>
              <td className={tdRight}>
                {decimalToInput(m.unitPrice) || '—'} {m.currency || ''}
              </td>
              <td className={td}>
                <div className='flex flex-col items-start gap-0.5'>
                  <PriceSourceBadge source={m.priceSource} />
                  {m.priceDate && (
                    <Text variant='label' size='small'>
                      {String(m.priceDate).slice(0, 10)}
                    </Text>
                  )}
                </div>
              </td>
              <td className={tdRight}>{decimalToInput(m.wastagePct) || '—'}</td>
              <td className={tdRight}>
                <BaseAmount value={decimalToInput(m.lineTotalBase)} hasBase={m.hasBase} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArticlesList({
  articles,
  baseCurrency,
}: {
  articles: StyleCostArticleLine[];
  baseCurrency?: string;
}) {
  if (articles.length === 0) {
    return (
      <Text variant='label' size='small'>
        no cost articles
      </Text>
    );
  }
  return (
    <div className='overflow-x-auto'>
      <table className='w-full min-w-max border-collapse'>
        <thead>
          <tr>
            <th className={th}>kind</th>
            <th className={thRight}>amount</th>
            <th className={thRight}>amount ({baseCurrency || 'base'})</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a, i) => (
            <tr key={i}>
              <td className={td}>{a.kind || '—'}</td>
              <td className={tdRight}>
                {decimalToInput(a.amount) || '—'} {a.currency || ''}
              </td>
              <td className={tdRight}>
                <BaseAmount value={decimalToInput(a.amountBase)} hasBase={a.hasBase} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 border p-2 ${
        highlight ? 'border-textColor' : 'border-textInactiveColor'
      }`}
    >
      <Text variant='label' size='small' className='uppercase'>
        {label}
      </Text>
      <Text size={highlight ? 'large' : 'small'} className='font-bold'>
        {value}
      </Text>
      {sub && (
        <Text variant='label' size='small'>
          {sub}
        </Text>
      )}
    </div>
  );
}

// The default comparison is deliberately just two figures: the plan estimate vs the production
// actual. The booked-snapshot reconciliation and the per-kind variance are a level of detail most
// reads don't need, so they move into the cost-breakdown disclosure below.
function EstimateVsActual({ comparison, cur }: { comparison?: StyleCostComparison; cur: string }) {
  if (!comparison) return null;
  return (
    <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
      <Text variant='uppercase' size='small'>
        estimate vs actual
      </Text>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <StatCell
          label='estimate (plan)'
          value={`${decimalToInput(comparison.estimateUnitCostBase) || '—'} ${cur}`}
        />
        {comparison.hasActual ? (
          <StatCell
            label='actual (production)'
            value={`${decimalToInput(comparison.actualUnitCostBase) || '—'} ${cur}`}
            sub={
              comparison.estimateVsActual?.value
                ? `Δ vs estimate ${decimalToInput(comparison.estimateVsActual)}`
                : undefined
            }
          />
        ) : (
          <StatCell label='actual (production)' value='—' sub='no production actuals yet' />
        )}
      </div>
    </div>
  );
}

// Booked COGS snapshot + how it reconciles against estimate and actual. Detail-level: shown only
// inside the cost-breakdown disclosure, and only when a snapshot exists.
function SnapshotReconciliation({
  comparison,
  cur,
}: {
  comparison?: StyleCostComparison;
  cur: string;
}) {
  if (!comparison?.hasSnapshot) return null;
  return (
    <div className='flex flex-col gap-2'>
      <Text variant='uppercase' size='small'>
        booked snapshot
      </Text>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <StatCell
          label={`snapshot${comparison.snapshotSource ? ` · ${comparison.snapshotSource}` : ''}`}
          value={`${decimalToInput(comparison.snapshotCostBase) || '—'} ${cur}`}
          sub={
            comparison.estimateVsSnapshot?.value
              ? `Δ vs estimate ${decimalToInput(comparison.estimateVsSnapshot)}`
              : undefined
          }
        />
        {comparison.hasActual && (
          <StatCell
            label='actual vs snapshot Δ'
            value={decimalToInput(comparison.actualVsSnapshot) || '—'}
          />
        )}
      </div>
    </div>
  );
}

// Per-cost-kind estimate/actual variance. Detail-level; breakdown-only.
function VarianceByKind({ comparison, cur }: { comparison?: StyleCostComparison; cur: string }) {
  const byKind = comparison?.byKind ?? [];
  if (byKind.length === 0) return null;
  return (
    <div className='flex flex-col gap-2'>
      <Text variant='uppercase' size='small'>
        variance by cost kind
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-max border-collapse'>
          <thead>
            <tr>
              <th className={th}>kind</th>
              <th className={thRight}>estimate ({cur})</th>
              {comparison?.hasActual && <th className={thRight}>actual ({cur})</th>}
              {comparison?.hasActual && <th className={thRight}>variance</th>}
            </tr>
          </thead>
          <tbody>
            {byKind.map((k, i) => (
              <tr key={i}>
                <td className={td}>{k.kind || '—'}</td>
                <td className={tdRight}>{decimalToInput(k.estimateBase) || '—'}</td>
                {comparison?.hasActual && (
                  <td className={tdRight}>
                    {k.hasActual ? decimalToInput(k.actualBase) || '—' : '—'}
                  </td>
                )}
                {comparison?.hasActual && (
                  <td className={tdRight}>
                    {k.hasActual ? decimalToInput(k.variance) || '—' : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EstimateBody({ estimate }: { estimate: StyleCostEstimate }) {
  const baseCurrency = estimate.baseCurrency || '';
  const cur = baseCurrency || '';
  // Progressive disclosure: only the headline cost + plan-vs-actual show by default. The booked
  // snapshot, per-kind variance, defect %, and the raw material / article rows are one click away
  // (#72 "too much data, where to start").
  const [showBreakdown, setShowBreakdown] = useState(false);
  const materials = estimate.materials ?? [];
  const articles = estimate.articles ?? [];
  const comparison = estimate.comparison;

  return (
    <div className='flex flex-col gap-4'>
      {/* Summary-first: the "what does this cost" headline before any comparison or raw rows. */}
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
        <StatCell
          label='unit cost'
          value={`${decimalToInput(estimate.unitCostBase) || '—'} ${cur}`}
          highlight
        />
        <StatCell
          label='order cost'
          value={`${decimalToInput(estimate.orderCostBase) || '—'} ${cur}`}
          sub={`qty ${estimate.orderQty ?? 0}`}
        />
        <StatCell
          label='materials / unit'
          value={`${decimalToInput(estimate.materialsPerUnitBase) || '—'} ${cur}`}
        />
      </div>

      {/* The comparison this tab exists for, reduced to the two figures that matter. */}
      <EstimateVsActual comparison={comparison} cur={cur} />

      {comparison?.caveat && (
        <Text variant='label' size='small'>
          {comparison.caveat}
        </Text>
      )}

      <Text variant='label' size='small'>
        all amounts in {baseCurrency || 'the style base currency'}, folded via costing FX rates.
      </Text>

      {estimate.caveat && (
        <Text variant='label' size='small'>
          {estimate.caveat}
        </Text>
      )}

      <div className='flex flex-col gap-4 border-t border-textInactiveColor pt-3'>
        <button
          type='button'
          onClick={() => setShowBreakdown((v) => !v)}
          aria-expanded={showBreakdown}
          className='flex w-fit items-center gap-1 uppercase text-labelColor hover:text-textColor'
        >
          <Text size='small'>
            {showBreakdown ? '▾' : '▸'} cost breakdown ({materials.length} materials ·{' '}
            {articles.length} articles)
          </Text>
        </button>
        {showBreakdown && (
          <>
            <SnapshotReconciliation comparison={comparison} cur={cur} />
            <VarianceByKind comparison={comparison} cur={cur} />

            <div className='flex flex-col gap-2'>
              <Text variant='uppercase' size='small'>
                materials
              </Text>
              <MaterialsTable materials={materials} baseCurrency={baseCurrency} />
            </div>

            <div className='flex flex-col gap-2'>
              <Text variant='uppercase' size='small'>
                cost articles
              </Text>
              <ArticlesList articles={articles} baseCurrency={baseCurrency} />
            </div>

            {/* Non-cost % echo — deprioritised into the breakdown per the costing simplification. */}
            <div className='flex flex-col gap-2'>
              <Text variant='uppercase' size='small'>
                quality
              </Text>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                <StatCell label='defect %' value={decimalToInput(estimate.defectPct) || '—'} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Q4: the transparent estimated (plan) cost of one style colourway, read-only. Gated on
// costing:read (screen gate, not just field-shaping — an ungated caller gets 403 from the RPC
// itself) and, once past the gate, scoped to a colourway the operator picks from the style's
// derived colourways (techCard.colorways, R1 output-only refs).
export function CostEstimateField({
  techCardId,
  techCard,
}: {
  techCardId?: number;
  techCard?: common_TechCard;
}) {
  const { canReadCosting } = usePermissions();
  const colorways = techCard?.colorways ?? [];
  const [colorwayId, setColorwayId] = useState(0);

  const queryEnabled = canReadCosting && !!techCardId && colorwayId > 0;
  const { data, isLoading, isError, error } = useStyleCostEstimate(
    techCardId,
    colorwayId,
    queryEnabled,
  );

  if (!canReadCosting) {
    return (
      <Text variant='label' size='small'>
        costing access required
      </Text>
    );
  }

  if (colorways.length === 0) {
    return (
      <Text variant='label' size='small'>
        no colourways yet; add one before estimating cost
      </Text>
    );
  }

  const forbidden = isError && (error as { status?: number } | null)?.status === 403;
  const estimate = data?.estimate;

  return (
    <div className='flex flex-col gap-4'>
      <label className='flex flex-col gap-1 sm:w-72'>
        <Text size='small'>colourway</Text>
        <select
          className={cell}
          value={colorwayId}
          onChange={(e) => setColorwayId(Number(e.target.value) || 0)}
        >
          <option value={0}>— select —</option>
          {colorways.map((c) => (
            <option key={c.colorwayId} value={c.colorwayId}>
              {c.baseSku || `#${c.colorwayId}`}
              {c.colorCode ? ` / ${c.colorCode}` : ''}
            </option>
          ))}
        </select>
      </label>

      {colorwayId === 0 ? (
        <Text variant='label' size='small'>
          pick a colourway to see its cost estimate
        </Text>
      ) : isLoading ? (
        <Text size='small'>loading…</Text>
      ) : forbidden ? (
        <Text variant='label' size='small'>
          costing access required
        </Text>
      ) : isError || !estimate ? (
        <Text variant='label' size='small'>
          estimate unavailable
        </Text>
      ) : (
        <EstimateBody estimate={estimate} />
      )}
    </div>
  );
}
