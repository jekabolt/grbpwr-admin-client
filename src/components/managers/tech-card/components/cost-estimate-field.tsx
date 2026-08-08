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
import { Accordion } from 'ui/components/accordion';
import { BarRow } from 'ui/components/bar-row';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Select from 'ui/components/select';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { useStyleCostEstimate } from './useStyleReadViews';

const num = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : 0;
};

const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '—';

// Provenance badge for a material line's price (Q4 transparency): which rung of the price ladder
// it resolved to. NONE is a real gap (no price found anywhere) so it reads red, not just as
// another neutral state.
const PRICE_SOURCE_LABEL: Partial<Record<StyleCostPriceSource, string>> = {
  STYLE_COST_PRICE_SOURCE_BOM_SNAPSHOT: 'plan (snapshot)',
  STYLE_COST_PRICE_SOURCE_CATALOG_LATEST: 'catalog',
  STYLE_COST_PRICE_SOURCE_NONE: 'no price',
};

function PriceSourceBadge({ source }: { source?: StyleCostPriceSource }) {
  const label = source ? PRICE_SOURCE_LABEL[source] : undefined;
  if (!label) return <EmptyCell />;
  return <Pill tone={source === 'STYLE_COST_PRICE_SOURCE_NONE' ? 'warn' : 'mut'}>{label}</Pill>;
}

// A base-currency amount that couldn't be folded (hasBase === false, e.g. a currency with no FX
// rate) — show the raw figure (may be empty) plus an explicit flag, never a silently-wrong 0.
function BaseAmount({ value, hasBase }: { value: string; hasBase?: boolean }) {
  return (
    <span className='flex flex-col items-end gap-0.5'>
      <span>{value || '—'}</span>
      {hasBase === false && <Pill tone='warn'>no base rate</Pill>}
    </span>
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
      <Text size='micro' variant='label'>
        no BOM materials
      </Text>
    );
  }
  return (
    <DataTable>
      <thead>
        <tr>
          <th>material</th>
          <th>section</th>
          <th>consumption</th>
          <th>unit price</th>
          <th>source</th>
          <th>wastage %</th>
          <th>line total ({baseCurrency || 'base'})</th>
        </tr>
      </thead>
      <tbody>
        {materials.map((m, i) => (
          <tr key={m.bomItemId || i}>
            <td>{m.materialName || `#${m.bomItemId}`}</td>
            <td>{sectionLabel(m.section)}</td>
            <td>
              {decimalToInput(m.consumption) || '—'} {m.unit || ''}
            </td>
            <td>
              {decimalToInput(m.unitPrice) || '—'} {m.currency || ''}
            </td>
            <td>
              <span className='flex flex-col items-end gap-0.5'>
                <PriceSourceBadge source={m.priceSource} />
                {m.priceDate && (
                  <Text size='micro' variant='label' component='span'>
                    {String(m.priceDate).slice(0, 10)}
                  </Text>
                )}
              </span>
            </td>
            {/* Wastage tells two different stories now (0261). On a bom_estimate line the
                percent is a MULTIPLIER the line total already carries. On a marker line
                nothing is multiplied — the measured length paid for the waste — and the
                percent is the decomposition of what that length contains. Rendering both as a
                bare number made a marker row read as an uplift it never received. */}
            <td>
              {m.wastageSource === 'marker' ? (
                <span className='flex flex-col items-end gap-0.5'>
                  <Pill tone='mut'>из раскладки</Pill>
                  <Text size='micro' variant='label' component='span'>
                    {/* A marker with no recorded efficiency (hand-built or imported) stores no
                        decomposition, and the server's wastage_pct is the SUM of the two
                        components — so it is 0 there too, not an independently known total.
                        Printing «кромка 0% + выпады 0%» would state a split nobody measured;
                        the norm still contains its waste, we just cannot say how it divides. */}
                    {decimalToInput(m.wastageSelvedgePct) || decimalToInput(m.wastageCutPct)
                      ? `кромка ${decimalToInput(m.wastageSelvedgePct) || '0'}% + выпады ${
                          decimalToInput(m.wastageCutPct) || '0'
                        }% — уже в норме`
                      : 'отходы уже в норме; разложение не записано'}
                  </Text>
                </span>
              ) : (
                decimalToInput(m.wastagePct) || <EmptyCell />
              )}
            </td>
            <td>
              <BaseAmount value={decimalToInput(m.lineTotalBase)} hasBase={m.hasBase} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function ArticlesTable({
  articles,
  baseCurrency,
}: {
  articles: StyleCostArticleLine[];
  baseCurrency?: string;
}) {
  if (articles.length === 0) {
    return (
      <Text size='micro' variant='label'>
        no cost articles
      </Text>
    );
  }
  return (
    <DataTable>
      <thead>
        <tr>
          <th>kind</th>
          <th>amount</th>
          <th>amount ({baseCurrency || 'base'})</th>
        </tr>
      </thead>
      <tbody>
        {articles.map((a, i) => (
          <tr key={i}>
            <td>{a.kind || '—'}</td>
            <td>
              {decimalToInput(a.amount) || '—'} {a.currency || ''}
            </td>
            <td>
              <BaseAmount value={decimalToInput(a.amountBase)} hasBase={a.hasBase} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
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
    <>
      <GroupLabel>booked snapshot</GroupLabel>
      <StatGrid min={130}>
        <Stat
          label={`snapshot${comparison.snapshotSource ? ` · ${comparison.snapshotSource}` : ''}`}
          value={`${decimalToInput(comparison.snapshotCostBase) || '—'} ${cur}`}
          sub={
            comparison.estimateVsSnapshot?.value
              ? `Δ vs estimate ${decimalToInput(comparison.estimateVsSnapshot)}`
              : undefined
          }
        />
        {comparison.hasActual && (
          <Stat
            label='actual vs snapshot Δ'
            value={decimalToInput(comparison.actualVsSnapshot) || '—'}
          />
        )}
      </StatGrid>
    </>
  );
}

/**
 * Per-cost-kind variance, drawn as bars off the biggest mover — the one part of this accordion
 * people actually read (spec 16.3). Two seconds to see that trims, not fabric, are the problem.
 *
 * The delta is computed here from estimate/actual rather than read off `variance`: the field's
 * sign convention is undocumented, and a flipped sign would paint an overspend green.
 * With no production actuals there is nothing to vary, so the same bars show where the PLAN
 * cost sits instead (ink, not a fake zero variance).
 */
function VarianceByKind({ comparison, cur }: { comparison?: StyleCostComparison; cur: string }) {
  const byKind = comparison?.byKind ?? [];
  if (byKind.length === 0) return null;
  const hasActual = !!comparison?.hasActual;

  const rows = byKind.map((k) => {
    const estimate = num(decimalToInput(k.estimateBase));
    const actual = num(decimalToInput(k.actualBase));
    const delta = k.hasActual ? actual - estimate : 0;
    return { kind: k.kind || '—', estimate, delta, lineHasActual: !!k.hasActual };
  });

  const moved = rows.filter((r) => r.lineHasActual && Math.abs(r.delta) >= 0.005);
  const shown = hasActual ? moved : rows.filter((r) => r.estimate > 0);
  const measure = (r: (typeof rows)[number]) => (hasActual ? Math.abs(r.delta) : r.estimate);
  const max = Math.max(...shown.map(measure), 0);
  const sorted = [...shown].sort((a, b) => measure(b) - measure(a));

  return (
    <>
      <GroupLabel>{hasActual ? 'variance by cost kind' : 'plan by cost kind'}</GroupLabel>
      {sorted.length === 0 ? (
        <Text size='micro' variant='label'>
          {hasActual ? 'every kind came in on plan' : 'no per-kind figures'}
        </Text>
      ) : (
        <div className='flex flex-col'>
          {sorted.map((r) => (
            <BarRow
              key={r.kind}
              name={r.kind}
              pct={max > 0 ? (measure(r) / max) * 100 : 0}
              tone={hasActual ? (r.delta > 0 ? 'down' : 'up') : 'ink'}
              value={
                hasActual
                  ? `${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta).toFixed(2)}`
                  : `${r.estimate.toFixed(2)} ${cur}`
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

function EstimateBody({ estimate }: { estimate: StyleCostEstimate }) {
  const baseCurrency = estimate.baseCurrency || '';
  const cur = baseCurrency;
  const materials = estimate.materials ?? [];
  const articles = estimate.articles ?? [];
  const comparison = estimate.comparison;

  // Computed locally (not read off `estimateVsActual`) so the sign is unambiguous: positive =
  // over plan = red.
  const planUnit = num(decimalToInput(comparison?.estimateUnitCostBase));
  const actualUnit = num(decimalToInput(comparison?.actualUnitCostBase));
  const hasActual = !!comparison?.hasActual;
  const delta = hasActual ? actualUnit - planUnit : 0;
  const deltaPct = hasActual && planUnit > 0 ? (delta / planUnit) * 100 : undefined;

  return (
    <div className='flex flex-col gap-3'>
      {/* Summary-first: what one garment costs to plan, and what it actually cost. */}
      <StatGrid min={130}>
        <Stat
          label='plan'
          big
          value={`${decimalToInput(estimate.unitCostBase) || '—'} ${cur}`}
          sub='per garment'
        />
        <Stat
          label='actual'
          value={
            hasActual ? `${decimalToInput(comparison?.actualUnitCostBase) || '—'} ${cur}` : '—'
          }
          tone={!hasActual || Math.abs(delta) < 0.005 ? undefined : delta > 0 ? 'down' : 'up'}
          sub={
            !hasActual
              ? 'no production actuals yet'
              : deltaPct != null
                ? `${delta > 0 ? '+' : '−'}${Math.abs(deltaPct).toFixed(1)}% vs plan`
                : undefined
          }
        />
        {/* No «order cost» stat. It was unit cost × the card's typical calculation size run,
            which no longer exists — the estimate is per GARMENT, and what a batch of it costs is
            the production run's own plan × this unit cost. */}
        <Stat
          label='materials / unit'
          value={`${decimalToInput(estimate.materialsPerUnitBase) || '—'} ${cur}`}
        />
        <Stat label='defect %' value={decimalToInput(estimate.defectPct) || '—'} />
      </StatGrid>

      <Text size='micro' variant='label'>
        all amounts in {baseCurrency || 'the style base currency'}, folded via the costing FX rates.
        An estimate is not an actual is not the booked COGS snapshot — the three figures are
        deliberately kept apart.
      </Text>

      {estimate.caveat && (
        <CalloutBox tone='note'>
          <Text size='micro'>{estimate.caveat}</Text>
        </CalloutBox>
      )}
      {comparison?.caveat && (
        <CalloutBox tone='note'>
          <Text size='micro'>{comparison.caveat}</Text>
        </CalloutBox>
      )}

      {/* Progressive disclosure: the evidence is one click from the headline (#72 "too much
          data, where to start"). */}
      <Accordion
        title={
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            cost breakdown ({materials.length} materials · {articles.length} articles)
          </Text>
        }
      >
        <div className='flex flex-col gap-2'>
          <VarianceByKind comparison={comparison} cur={cur} />
          <SnapshotReconciliation comparison={comparison} cur={cur} />
          <GroupLabel>materials</GroupLabel>
          <MaterialsTable materials={materials} baseCurrency={baseCurrency} />
          <GroupLabel>cost articles</GroupLabel>
          <ArticlesTable articles={articles} baseCurrency={baseCurrency} />
        </div>
      </Accordion>
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
      <Text size='micro' variant='label'>
        costing access required
      </Text>
    );
  }

  if (colorways.length === 0) {
    return (
      <Text size='micro' variant='label'>
        no colourways yet; add one before estimating cost
      </Text>
    );
  }

  const forbidden = isError && (error as { status?: number } | null)?.status === 403;
  const estimate = data?.estimate;

  const colorwayItems = colorways.map((c) => ({
    value: String(c.colorwayId),
    label: `${c.baseSku || `#${c.colorwayId}`}${c.colorCode ? ` / ${c.colorCode}` : ''}`,
  }));

  return (
    <div className='flex flex-col gap-3'>
      {/* Scope: this view is per colourway — a style's colourways are its products, and their
          material cost differs. Kept as an explicit picker, never defaulted silently. */}
      <Toolbar className='items-end'>
        <label className='flex w-[220px] flex-col gap-0.5'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            colourway
          </Text>
          <Select
            name='cost-estimate-colorway'
            items={colorwayItems}
            // Radix rejects an item with value '', but '' as the ROOT value is its documented
            // "cleared" state — which is how the placeholder shows for the unpicked case.
            value={colorwayId ? String(colorwayId) : ''}
            onValueChange={(v: string) => setColorwayId(Number(v) || 0)}
            placeholder='— select —'
            fullWidth
          />
        </label>
      </Toolbar>

      {colorwayId === 0 ? (
        <Text size='micro' variant='label'>
          pick a colourway to see its cost estimate
        </Text>
      ) : isLoading ? (
        <Text size='micro'>loading…</Text>
      ) : forbidden ? (
        <Text size='micro' variant='label'>
          costing access required
        </Text>
      ) : isError || !estimate ? (
        <Text size='micro' variant='label'>
          estimate unavailable
        </Text>
      ) : (
        <EstimateBody estimate={estimate} />
      )}
    </div>
  );
}
