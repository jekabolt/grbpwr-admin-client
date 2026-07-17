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
      <Text variant='inactive' size='small'>
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
                    <Text variant='inactive' size='small'>
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
      <Text variant='inactive' size='small'>
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

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className='flex flex-col gap-0.5 border border-textInactiveColor p-2'>
      <Text variant='inactive' size='small' className='uppercase'>
        {label}
      </Text>
      <Text size='small' className='font-bold'>
        {value}
      </Text>
      {sub && (
        <Text variant='inactive' size='small'>
          {sub}
        </Text>
      )}
    </div>
  );
}

// The three figures are deliberately distinct (an estimate is not an actual is not the booked COGS
// snapshot) — shown side by side, only adding the actual/snapshot columns when they exist.
function ComparisonBlock({
  comparison,
  baseCurrency,
}: {
  comparison?: StyleCostComparison;
  baseCurrency?: string;
}) {
  if (!comparison) return null;
  const byKind = comparison.byKind ?? [];
  const cur = baseCurrency || '';
  return (
    <div className='flex flex-col gap-3 border-t border-textInactiveColor pt-3'>
      <Text variant='uppercase' size='small'>
        estimate vs actual vs snapshot
      </Text>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <StatCell
          label='estimate (plan)'
          value={`${decimalToInput(comparison.estimateUnitCostBase) || '—'} ${cur}`}
        />
        {comparison.hasActual && (
          <StatCell
            label='actual (production)'
            value={`${decimalToInput(comparison.actualUnitCostBase) || '—'} ${cur}`}
            sub={
              comparison.estimateVsActual?.value
                ? `Δ vs estimate ${decimalToInput(comparison.estimateVsActual)}`
                : undefined
            }
          />
        )}
        {comparison.hasSnapshot && (
          <StatCell
            label={`snapshot${comparison.snapshotSource ? ` · ${comparison.snapshotSource}` : ''}`}
            value={`${decimalToInput(comparison.snapshotCostBase) || '—'} ${cur}`}
            sub={
              comparison.estimateVsSnapshot?.value
                ? `Δ vs estimate ${decimalToInput(comparison.estimateVsSnapshot)}`
                : undefined
            }
          />
        )}
      </div>
      {comparison.hasActual && comparison.hasSnapshot && (
        <Text variant='inactive' size='small'>
          actual vs snapshot Δ: {decimalToInput(comparison.actualVsSnapshot) || '—'}
        </Text>
      )}
      {byKind.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr>
                <th className={th}>kind</th>
                <th className={thRight}>estimate ({cur})</th>
                {comparison.hasActual && <th className={thRight}>actual ({cur})</th>}
                {comparison.hasActual && <th className={thRight}>variance</th>}
              </tr>
            </thead>
            <tbody>
              {byKind.map((k, i) => (
                <tr key={i}>
                  <td className={td}>{k.kind || '—'}</td>
                  <td className={tdRight}>{decimalToInput(k.estimateBase) || '—'}</td>
                  {comparison.hasActual && (
                    <td className={tdRight}>
                      {k.hasActual ? decimalToInput(k.actualBase) || '—' : '—'}
                    </td>
                  )}
                  {comparison.hasActual && (
                    <td className={tdRight}>
                      {k.hasActual ? decimalToInput(k.variance) || '—' : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {comparison.caveat && (
        <Text variant='inactive' size='small'>
          {comparison.caveat}
        </Text>
      )}
    </div>
  );
}

function EstimateBody({ estimate }: { estimate: StyleCostEstimate }) {
  const baseCurrency = estimate.baseCurrency || '';
  return (
    <div className='flex flex-col gap-4'>
      <Text variant='inactive' size='small'>
        all amounts in {baseCurrency || 'the style base currency'}
      </Text>

      <div className='flex flex-col gap-2'>
        <Text variant='uppercase' size='small'>
          materials
        </Text>
        <MaterialsTable materials={estimate.materials ?? []} baseCurrency={baseCurrency} />
      </div>

      <div className='flex flex-col gap-2'>
        <Text variant='uppercase' size='small'>
          cost articles
        </Text>
        <ArticlesList articles={estimate.articles ?? []} baseCurrency={baseCurrency} />
      </div>

      <div className='flex flex-col gap-1 border-t border-textInactiveColor pt-3'>
        <Text size='small'>
          materials / unit: {decimalToInput(estimate.materialsPerUnitBase) || '—'} {baseCurrency}
        </Text>
        <Text size='small'>defect %: {decimalToInput(estimate.defectPct) || '—'}</Text>
        <Text size='small' className='font-bold'>
          unit cost: {decimalToInput(estimate.unitCostBase) || '—'} {baseCurrency}
        </Text>
        <Text size='small'>order qty: {estimate.orderQty ?? 0}</Text>
        <Text size='small'>
          order cost: {decimalToInput(estimate.orderCostBase) || '—'} {baseCurrency}
        </Text>
      </div>

      {estimate.caveat && (
        <Text variant='inactive' size='small'>
          {estimate.caveat}
        </Text>
      )}

      <ComparisonBlock comparison={estimate.comparison} baseCurrency={baseCurrency} />
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
      <Text variant='inactive' size='small'>
        costing access required
      </Text>
    );
  }

  if (colorways.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        no colourways yet — add one before estimating cost
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
        <Text variant='inactive' size='small'>
          pick a colourway to see its cost estimate
        </Text>
      ) : isLoading ? (
        <Text size='small'>loading…</Text>
      ) : forbidden ? (
        <Text variant='inactive' size='small'>
          costing access required
        </Text>
      ) : isError || !estimate ? (
        <Text variant='inactive' size='small'>
          estimate unavailable
        </Text>
      ) : (
        <EstimateBody estimate={estimate} />
      )}
    </div>
  );
}
