import { common_ColorwayPrice, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useFormContext, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { WaterfallRow } from 'ui/components/bar-row';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { useDevExpenses } from './dev-expenses-field';
import { TechCardFormData } from './schema';
import { useSamples } from './useSamples';

const num = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The retail the waterfall descends from, and — the part that used to be missing — whether it is
 * net of VAT.
 *
 * Catalogue prices are VAT-INCLUSIVE everywhere in this system: the order snapshot extracts VAT out
 * of them, accounting derives output VAT from them, and the margin-by-style report divides them by
 * (1 + rate) before comparing to cost. This tab did not, so the same style showed two margins a
 * whole VAT rate apart on two adjacent screens, and the flattering one was the one people priced
 * against. `netPrices` is the server's netting, at the rate named in `costing.vatCountryCode`.
 *
 * Both figures are returned deliberately. The house target was calibrated against the GROSS number,
 * so showing only the net one would turn the whole board red overnight with no explanation; the
 * strip shows net as the real margin and keeps gross visible while the target is re-anchored.
 *
 * Still only trusted when every priced colourway agrees — a disagreement is reported, never
 * averaged. A made-up retail would make every margin on this tab a lie.
 */
function useRetail(techCard: common_TechCard | undefined, currency: string) {
  const colorways = techCard?.colorways ?? [];

  if (!currency)
    return { gross: undefined, net: undefined, reason: 'set a costing currency first' };
  if (colorways.length === 0)
    return {
      gross: undefined,
      net: undefined,
      reason: 'no linked colourways to read a price from',
    };

  const pick = (list: common_ColorwayPrice[] | undefined) => {
    const line = (list ?? []).find((p) => p.currency === currency);
    const n = parseDecimalNumber(line?.price?.value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const agreed = (values: Array<number | undefined>) => {
    const found = values.filter((v): v is number => v != null);
    const distinct = Array.from(new Set(found.map((n) => n.toFixed(2))));
    return { value: distinct.length === 1 ? Number(distinct[0]) : undefined, distinct };
  };

  const gross = agreed(colorways.map((c) => pick(c.prices)));
  const net = agreed(colorways.map((c) => pick(c.netPrices)));

  if (gross.distinct.length === 0)
    return { gross: undefined, net: undefined, reason: `no ${currency} price on the colourways` };
  if (gross.distinct.length > 1)
    return {
      gross: undefined,
      net: undefined,
      reason: `colourways disagree on price (${gross.distinct.join(' / ')} ${currency})`,
    };
  // net is absent when the read's VAT country has no rate on file — an export destination has no
  // VAT to remove. That is reported next to the figure, not silently substituted with gross.
  return { gross: gross.value, net: net.value, reason: '' };
}

// Manual cost articles (Sheet «Калькуляция») + the live waterfall they drive. The materials
// rollup and the per-colourway costs are computed server-side from the BOM + colourway usages
// (output-only): read from the last GetTechCard, never sent on write.
//
// 🔒 costing: the tab is hidden without costing:read; the fieldsets below are disabled without
// costing:write. The waterfall is still drawn read-only in that case.
export function CostingField({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  const { canWriteCosting } = usePermissions();
  const { dictionary } = useDictionary();
  const techCardId = techCard?.id;

  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    usages?: Array<{ consumption?: string; sizeConsumptions?: Array<{ consumption?: string }> }>;
  }>;

  // A usage costs at order-scale when it has per-size consumption; at per-garment scale when
  // it uses the single consumption. Mixing both in one card mixes scales in the total.
  const allUsages = colorways.flatMap((c) => c.usages ?? []);
  const hasPerSize = allUsages.some((u) =>
    (u.sizeConsumptions ?? []).some((sc) => sc.consumption?.trim()),
  );
  const hasPerGarment = allUsages.some(
    (u) =>
      !(u.sizeConsumptions ?? []).some((sc) => sc.consumption?.trim()) && u.consumption?.trim(),
  );
  const mixedScale = hasPerSize && hasPerGarment;

  const rollup = techCard?.techCard?.costing;
  const colorwayCosts = rollup?.colorwayCosts ?? [];
  // colorway_cost rows are keyed by the real colorwayId (0 = the card's primary/base costing,
  // not tied to one colourway) — resolve labels from the live techCard.colorways
  // (AdminColorwayRef[], R1: a colourway is a product) + dictionary.colors, same pattern as
  // construction-tab.tsx.
  const storedColorways = techCard?.colorways ?? [];
  const colorwayLabel = (id?: number) => {
    const cw = id ? storedColorways.find((c) => c.colorwayId === id) : undefined;
    const dc = cw ? dictionary?.colors?.find((c) => c.code === cw.colorCode) : undefined;
    return dc?.name || cw?.colorCode || (id ? `колорвей #${id}` : 'колорвей');
  };

  const materialsTotal = rollup?.materialsTotal ?? [];

  const costing = (useWatch({ control, name: 'costing' }) ?? {}) as {
    cmtCost?: string;
    hardwareCost?: string;
    packagingCost?: string;
    logisticsCost?: string;
    overheadCost?: string;
    defectPercent?: string;
    targetMarginPct?: string;
    currency?: string;
  };
  const cur = costing.currency || rollup?.baseCurrency || '';
  const money = (n: number) => `${cur ? `${cur} ` : ''}${n.toFixed(2)}`;

  // Live recompute: materials come from the server rollup (BOM-derived, not typed), every other
  // article is read straight off the form so the waterfall moves as you type. On reload the
  // server's own unit_cost replaces this preview — the formula is the same one it uses.
  const materials = num(decimalToInput(rollup?.materialsPerUnit));
  const cmt = num(costing.cmtCost);
  const hardware = num(costing.hardwareCost);
  const packaging = num(costing.packagingCost);
  const logistics = num(costing.logisticsCost);
  const overhead = num(costing.overheadCost);
  const defectPct = num(costing.defectPercent);
  const articlesSubtotal = cmt + hardware + packaging + logistics + overhead;
  const beforeDefect = materials + articlesSubtotal;
  const defectAmount = (beforeDefect * defectPct) / 100;
  const unitCost = beforeDefect + defectAmount;
  // An untouched card must read `—`, never a confident 0.00 — an empty strip that looks like
  // zero cost is worse than one that admits it has nothing.
  const hasCosting =
    materials > 0 || articlesSubtotal > 0 || num(decimalToInput(rollup?.unitCost)) > 0;

  const { gross: grossRetail, net: netRetail, reason: retailReason } = useRetail(techCard, cur);
  // The margin is drawn against NET retail, because unit_cost carries no VAT. Gross is kept only to
  // show what the old number was while the target is re-anchored — never to compute against.
  const retail = netRetail ?? grossRetail;
  const netted = netRetail != null;
  const vatCountry = rollup?.vatCountryCode || '';
  const vatRate = num(decimalToInput(rollup?.vatRatePct));

  const marginBase = netRetail;
  const grossMargin = marginBase != null ? marginBase - unitCost : undefined;
  const marginPct =
    marginBase != null && marginBase > 0 && hasCosting
      ? ((marginBase - unitCost) / marginBase) * 100
      : undefined;
  // Gross-of-VAT margin: the figure this strip used to show. Displayed as the smaller half of the
  // margin stat so the drop from one to the other is legible rather than mysterious.
  const grossMarginPct =
    grossRetail != null && grossRetail > 0 && hasCosting
      ? ((grossRetail - unitCost) / grossRetail) * 100
      : undefined;

  // The target now comes from the contract: this style's own, else the house default, resolved
  // server-side into effective_target_margin_pct. No client constant.
  const targetPct = num(decimalToInput(rollup?.effectiveTargetMarginPct));
  const hasTarget = targetPct > 0;
  const onTarget = marginPct != null && hasTarget && marginPct >= targetPct;

  // R&D is a period style cost, deliberately outside the unit COGS — it lands in the strip as
  // "what developing this cost" and as the amount the unit margin has to earn back.
  const { data: devData } = useDevExpenses(techCardId);
  const devTotal = num(decimalToInput(devData?.summary?.totalBase));
  const { data: samplesData } = useSamples(techCardId);
  const samplesCount = samplesData?.samples?.length ?? 0;
  const breakEvenUnits =
    devTotal > 0 && grossMargin != null && grossMargin > 0
      ? Math.ceil(devTotal / grossMargin)
      : undefined;

  // Waterfall geometry: the track is the full retail price (or, with no retail, the unit cost),
  // and each article bar sits where the running total lands — so the descent reads as money
  // leaving the price rather than as five unrelated bars.
  const steps = [
    { label: 'materials (BOM)', amount: materials },
    { label: 'CMT', amount: cmt },
    { label: 'hardware · packaging', amount: hardware + packaging },
    { label: 'logistics · overhead', amount: logistics + overhead },
    { label: `defect ${defectPct}%`, amount: defectAmount },
  ].filter((s) => s.amount > 0);
  const scale = retail ?? unitCost;
  let running = scale;
  const stepRows = steps.map((s) => {
    const after = running - s.amount;
    const row = {
      ...s,
      left: scale > 0 ? Math.max(0, (after / scale) * 100) : 0,
      width: scale > 0 ? (s.amount / scale) * 100 : 0,
    };
    running = after;
    return row;
  });

  return (
    <div className='flex flex-col gap-3'>
      {/* 16.2 — economics as a header strip: always visible, always current, no click anywhere.
          (This component is the first thing the costing tab renders, so "top of the tab" is
          here.) The `style economics` modal it replaces still serves the analytics page. */}
      <StatGrid min={130}>
        <Stat
          label='unit cost'
          big
          value={hasCosting ? money(unitCost) : '—'}
          sub={
            hasCosting && unitCost > 0 && materials > 0
              ? `materials ${Math.round((materials / unitCost) * 100)}%`
              : 'per garment'
          }
        />
        <Stat
          label='margin'
          value={marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}
          tone={marginPct == null || !hasTarget ? undefined : onTarget ? 'up' : 'down'}
          sub={
            marginPct == null
              ? netted || grossMarginPct == null
                ? 'no retail price'
                : `no ${vatCountry || 'VAT'} rate — cannot net`
              : hasTarget
                ? `target ${targetPct.toFixed(0)}% · net of ${vatRate.toFixed(0)}% ${vatCountry} VAT`
                : `net of ${vatRate.toFixed(0)}% ${vatCountry} VAT`
          }
        />
        <Stat
          label='break-even'
          value={breakEvenUnits != null ? String(breakEvenUnits) : '—'}
          sub={breakEvenUnits != null ? 'units to recover R&D' : 'needs margin + R&D'}
        />
        <Stat
          label='R&D spent (base)'
          value={devTotal > 0 ? devTotal.toFixed(2) : '—'}
          sub={samplesCount > 0 ? `${samplesCount} samples` : 'period cost, not COGS'}
        />
      </StatGrid>
      <Text size='micro' variant='label'>
        Style-level: the tech-card payload carries this style’s plan rollup (its primary colourway),
        NOT each product’s stored cost_price. Per-colourway precision lives in the cost estimate
        below and on each product’s detail page. R&D is in the dev base currency.
      </Text>

      {mixedScale && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            Внимание: часть материалов задана поразмерно (стоимость партии), часть — на изделие.
            Итог смешивает масштабы. По возможности задавайте расход всех измеряемых материалов
            одним способом.
          </Text>
        </CalloutBox>
      )}

      <fieldset
        disabled={!canWriteCosting}
        className='grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'
      >
        <DecimalField name='costing.cmtCost' label='CMT cost / изделие' />
        <DecimalField name='costing.hardwareCost' label='hardware / изделие' />
        <DecimalField name='costing.packagingCost' label='packaging / изделие' />
        <DecimalField name='costing.logisticsCost' label='logistics / изделие' />
        <DecimalField name='costing.overheadCost' label='overhead / изделие' />
        <DecimalField name='costing.defectPercent' label='defect %' />
        {/* This style's own target. Left empty it falls back to the house default, which the server
            resolves onto the read — so an empty field is not "no target", it is "the usual one". */}
        <DecimalField
          name='costing.targetMarginPct'
          label={`target margin %${hasTarget && !num(costing.targetMarginPct) ? ` (house ${targetPct.toFixed(0)})` : ''}`}
        />
        <CurrencySelect name='costing.currency' label='currency' />
      </fieldset>
      <Text size='micro' variant='label'>
        Все статьи — на 1 изделие, в одной валюте. Материалы приходят из BOM, не набираются руками.
        Ценообразование (наценка/опт/розница) живёт на опубликованном продукте, не здесь.
      </Text>
      <fieldset disabled={!canWriteCosting} className='border-0 p-0'>
        <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />
      </fieldset>

      {/* 16.1 — where the retail price goes. Same inputs as above, but each one is a bar you can
          see the size of, and margin lands at the bottom. */}
      <GroupLabel>{retail != null ? 'retail → gross margin' : 'unit cost composition'}</GroupLabel>
      {!hasCosting ? (
        <Text size='micro' variant='label'>
          nothing to draw yet — add materials to the BOM or type a cost article above and the
          waterfall appears as soon as there is a number.
        </Text>
      ) : (
        <div className='flex flex-col'>
          <WaterfallRow
            name={retail != null ? 'retail (list price)' : 'unit cost'}
            left={0}
            width={100}
            value={money(retail ?? unitCost)}
            kind='pos'
            emphasis
          />
          {stepRows.map((s) => (
            <WaterfallRow
              key={s.label}
              name={`− ${s.label}`}
              left={s.left}
              width={s.width}
              value={`−${s.amount.toFixed(2)}`}
              kind='neg'
            />
          ))}
          {retail != null && grossMargin != null && marginPct != null && (
            <WaterfallRow
              name='gross margin'
              left={0}
              width={Math.max(0, (grossMargin / retail) * 100)}
              value={`${money(grossMargin)} · ${marginPct.toFixed(0)}%`}
              // Below the house target the closing bar reads red rather than green — `neg` is
              // the error tone the primitive exposes (there is no "final, but bad" kind).
              kind={onTarget ? 'final' : 'neg'}
              emphasis
            />
          )}
        </div>
      )}
      {hasCosting && retail == null && (
        <Text size='micro' variant='label'>
          {`no retail bar and no margin row — the tech card does not own a retail price (${retailReason}). Price the linked products and the waterfall extends up to it.`}
        </Text>
      )}
      {hasCosting && retail != null && (
        <Text size='micro' variant='label'>
          {netted
            ? `retail read from the colourways’ ${cur} price and netted of ${vatRate.toFixed(0)}% ${vatCountry} VAT — catalogue prices are VAT-inclusive, and unit cost is not, so the margin above is drawn against the net figure. Gross margin at the list price is ${grossMarginPct != null ? `${grossMarginPct.toFixed(1)}%` : '—'}; that is the number this tab used to show, and the target still needs re-anchoring against the net one.`
            : `retail read from the colourways’ ${cur} price. No VAT rate on file for ${vatCountry || 'the selected country'}, so nothing was netted — for an export destination that is correct, otherwise set the rate in the accounting VAT settings or the margin above is overstated.`}
        </Text>
      )}

      {/* Per-colourway material cost — the one figure the estimate tab can only show one
          colourway at a time, so it stays on the roll-up. */}
      {colorwayCosts.length > 0 && (
        <>
          <GroupLabel>cost by colourway (computed server-side)</GroupLabel>
          <DataTable>
            <thead>
              <tr>
                <th>colourway</th>
                <th>materials / unit</th>
                <th>unit cost</th>
                <th>qty</th>
                <th>order cost</th>
              </tr>
            </thead>
            <tbody>
              {colorwayCosts.map((cc, i) => (
                <tr key={i}>
                  <td>
                    <span className='flex flex-wrap items-center gap-1'>
                      {colorwayLabel(cc.colorwayId)}
                      {cc.colorwayId === 0 && <Pill tone='mut'>основной</Pill>}
                      {cc.hasUnconvertedCurrencies && <Pill tone='warn'>no FX</Pill>}
                    </span>
                  </td>
                  <td>{decimalToInput(cc.materialsPerUnit) || <EmptyCell />}</td>
                  <td>{decimalToInput(cc.unitCost) || <EmptyCell />}</td>
                  <td>{cc.orderQty || <EmptyCell />}</td>
                  <td>{decimalToInput(cc.orderCost) || <EmptyCell />}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}

      {materialsTotal.length > 0 && (
        <>
          <GroupLabel>materials by currency · primary colourway</GroupLabel>
          <div>
            {materialsTotal.map((line, i) => (
              <Row
                key={i}
                label={line.currency || 'no currency'}
                value={decimalToInput(line.amount) || '—'}
              />
            ))}
          </div>
        </>
      )}

      {/* Costing FX rates are global (shared across all cards) and live in Settings — here we
          only note the fold + link out, keeping the hard "unconverted" warning. */}
      <Text size='micro' variant='label'>
        Multi-currency BOM lines fold into the base currency
        {rollup?.baseCurrency ? ` (${rollup.baseCurrency})` : ''} via the global costing FX rates,
        which also seed the product’s cost price.{' '}
        <Link to={ROUTES.settings} className='underline hover:text-textColor'>
          Manage FX rates in Settings
        </Link>
        .
      </Text>
      {rollup?.hasUnconvertedCurrencies && (
        <CalloutBox tone='error'>
          <Text size='micro'>
            <b>Some BOM lines are in another currency with no FX rate</b>, so they are excluded from
            the total and no base-currency cost can be computed — the unit cost above is
            understated.{' '}
            <Link to={ROUTES.settings} className='underline'>
              Add a costing FX rate in Settings
            </Link>{' '}
            so they fold into the base cost instead of silently lowering it.
          </Text>
        </CalloutBox>
      )}
      {!hasCosting && (
        <Text size='micro' variant='label'>
          the materials rollup is computed from the BOM on save; reload to refresh it.
        </Text>
      )}
    </div>
  );
}
