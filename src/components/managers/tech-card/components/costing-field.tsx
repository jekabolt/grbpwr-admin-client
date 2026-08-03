import { common_ColorwayPrice, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCardVatScenario } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { WaterfallRow } from 'ui/components/bar-row';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Select from 'ui/components/select';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { useDevExpenses } from './dev-expenses-field';
import { TechCardFormData } from './schema';
import { useSamples } from './useSamples';

// "no country picked" for the VAT-scenario select — '' cannot be a Radix Select.Item value.
const DOMESTIC = '__domestic__';

const num = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : 0;
};

// The form fields the SERVER's unit_cost is built from. While none of them is dirty, the rollup on
// the last read still describes what is in the form, so the strip below shows the server's own
// figures; touch one and it degrades to a labelled browser-side preview until the card is saved.
// (target_margin_pct and notes are deliberately absent: neither moves the unit cost, and the target
// itself is read back from the server-resolved effective_target_margin_pct.)
const COSTING_COST_KEYS = [
  'cmtCost',
  'hardwareCost',
  'packagingCost',
  'logisticsCost',
  'overheadCost',
  'defectPercent',
  'currency',
] as const;
const COSTING_COST_PATHS = COSTING_COST_KEYS.map((k) => `costing.${k}` as const);

const BREAK_EVEN_NO_FX =
  'R&D учитывается в базовой валюте, а маржа выше — в валюте костинга. Пересчитать нечем: ' +
  'нужна нетто-розница в базовой валюте и серверный unit_cost_base (он появляется, когда для ' +
  'всех валют BOM есть курс). Делить базовую сумму на маржу в другой валюте нельзя.';

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

  // WHICH MARKET this margin is for. GetTechCardRequest.vat_country_code was never sent, so the tab
  // always showed the domestic rate while presenting it as "the" margin — the one thing the netting
  // contract says is not true ("one gross price is sold into as many rates as there are
  // destinations"). '' keeps the page's own read, i.e. the domestic country; picking a country
  // fetches the same card netted at that country's rate, as a scenario beside the default.
  const [vatScenarioCountry, setVatScenarioCountry] = useState('');
  const { data: vatScenario, isFetching: vatScenarioLoading } = useTechCardVatScenario(
    techCardId,
    vatScenarioCountry,
  );
  // Everything except the VAT context and the net retail is rate-independent (a unit cost carries no
  // VAT), so the rollup below stays the page's — only these two reads follow the scenario.
  const vatCard = vatScenarioCountry && vatScenario ? vatScenario : techCard;
  const countryItems = (dictionary?.countries ?? [])
    .filter((c) => c.active && c.code)
    .map((c) => ({ value: c.code as string, label: `${c.code} — ${c.name ?? ''}` }));

  // NOTE (Phase 0b #17): there used to be a "part of the materials are graded per size, part per
  // garment — the total mixes scales" warning here. It was FALSE. The server normalises a size-only
  // usage to a per-garment figure by dividing it by the total order qty before it ever reaches
  // materials_per_unit (see TechCardCosting's own contract comment, entity/techcard.go), so the two
  // ways of grading a usage do NOT mix scales in the rollup. The callout only frightened people off
  // per-size grading, which is the more precise of the two. Removed, not fixed.

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
  // Are the article inputs still what the server computed the rollup from? RHF's dirty state is
  // measured against the defaultValues the card was loaded (and re-reset after every save) with, so
  // this is exactly the question "does the form still match the last read".
  const { dirtyFields } = useFormState({ control, name: COSTING_COST_PATHS });
  const costingDirty = COSTING_COST_KEYS.some(
    (k) => !!(dirtyFields.costing as Record<string, boolean> | undefined)?.[k],
  );

  const cur = costing.currency || rollup?.baseCurrency || '';
  const money = (n: number) => `${cur ? `${cur} ` : ''}${n.toFixed(2)}`;

  // The article inputs, read off the form so the waterfall bars move as you type. Materials are
  // never typed — they come from the server rollup (BOM-derived).
  const materials = num(decimalToInput(rollup?.materialsPerUnit));
  const cmt = num(costing.cmtCost);
  const hardware = num(costing.hardwareCost);
  const packaging = num(costing.packagingCost);
  const logistics = num(costing.logisticsCost);
  const overhead = num(costing.overheadCost);
  const defectPct = num(costing.defectPercent);
  const articlesSubtotal = cmt + hardware + packaging + logistics + overhead;
  const beforeDefect = materials + articlesSubtotal;

  // #7 — WHOSE unit cost this strip shows. It used to be this file's own JS-float re-derivation,
  // always, with the server's `unit_cost` demoted to a truthiness test and `unit_cost_base` read by
  // nobody at all. That made the headline a second implementation of a decimal.Decimal calculation
  // that seeds cost_price: it agreed with the server only by luck, and every understatement the
  // server's own rollup carries (an FX-less BOM line dropped from materials_per_unit, a size-graded
  // usage normalised by order qty) was re-derived here into margins and a waterfall that read as
  // authoritative. Now: unchanged form → the SERVER's figure; unsaved edits → the local preview,
  // labelled as a draft so nobody prices against a number the server has never seen.
  const serverUnitCost = num(decimalToInput(rollup?.unitCost));
  const serverUnitCostBase = num(decimalToInput(rollup?.unitCostBase));
  const usingServerCost = !costingDirty && serverUnitCost > 0;
  const unitCost = usingServerCost ? serverUnitCost : beforeDefect * (1 + defectPct / 100);
  // The defect step closes the waterfall ONTO whichever unit cost is on show, so the bars always
  // sum to the headline instead of to a second, differently-rounded number.
  const defectAmount = Math.max(0, unitCost - beforeDefect);
  // An untouched card must read `—`, never a confident 0.00 — an empty strip that looks like
  // zero cost is worse than one that admits it has nothing.
  const hasCosting = materials > 0 || articlesSubtotal > 0 || serverUnitCost > 0;
  const draftPreview = hasCosting && !usingServerCost;

  const { gross: grossRetail, net: netRetail, reason: retailReason } = useRetail(vatCard, cur);
  // The margin is drawn against NET retail, because unit_cost carries no VAT. Gross is kept only to
  // show what the old number was while the target is re-anchored — never to compute against.
  const retail = netRetail ?? grossRetail;
  const netted = netRetail != null;
  // The country the figures above were actually netted at, as the SERVER reports it — not the
  // dropdown. An unknown code comes back echoed with no rate, and saying which country produced a
  // number is the whole point of the control.
  const vatContext = vatCard?.techCard?.costing;
  const vatCountry = vatContext?.vatCountryCode || '';
  const vatRate = num(decimalToInput(vatContext?.vatRatePct));

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

  // #8 — break-even used to be `ceil(devTotal / grossMargin)` flat: a BASE-currency R&D total
  // divided by a COSTING-currency margin. With a PLN costing and a EUR base that produced a
  // confident whole number out of two different monies, and nothing on screen said so. Now the
  // division only happens inside ONE currency:
  //   • costing currency == base currency → the strip's own margin already is a base margin;
  //   • otherwise → fold both sides with the SERVER's base figures (net retail read in the base
  //     currency + unit_cost_base, the same rollup that seeds cost_price). Unavailable (no base
  //     price on the colourways, no FX rate so unit_cost_base is unset, or unsaved edits that
  //     unit_cost_base does not know about) → «н/д», never a cross-currency quotient.
  const baseCur = rollup?.baseCurrency || '';
  const sameCurrency = !!cur && !!baseCur && cur === baseCur;
  const baseRetail = useRetail(vatCard, !sameCurrency && baseCur ? baseCur : '');
  const breakEven = ((): { value: string; sub: React.ReactNode } => {
    if (!(devTotal > 0)) return { value: '—', sub: 'needs margin + R&D' };
    if (sameCurrency) {
      if (grossMargin == null) return { value: '—', sub: 'needs a net retail price' };
      if (!(grossMargin > 0)) return { value: '—', sub: 'margin is not positive' };
      return { value: String(Math.ceil(devTotal / grossMargin)), sub: 'units to recover R&D' };
    }
    const marginInBase =
      !costingDirty && baseRetail.net != null && serverUnitCostBase > 0
        ? baseRetail.net - serverUnitCostBase
        : undefined;
    if (marginInBase == null)
      return {
        value: 'н/д',
        sub: (
          <span title={BREAK_EVEN_NO_FX} className='cursor-help underline decoration-dotted'>
            нет курса
          </span>
        ),
      };
    if (!(marginInBase > 0)) return { value: '—', sub: `margin is not positive (${baseCur})` };
    return {
      value: String(Math.ceil(devTotal / marginInBase)),
      sub: `units to recover R&D · ${baseCur}`,
    };
  })();

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
          label={
            <span className='inline-flex items-center gap-1.5'>
              unit cost
              {draftPreview && <Pill tone='attention'>черновик</Pill>}
            </span>
          }
          big
          value={hasCosting ? money(unitCost) : '—'}
          sub={
            hasCosting && unitCost > 0 && materials > 0
              ? `materials ${Math.round((materials / unitCost) * 100)}%${
                  usingServerCost && baseCur && !sameCurrency && serverUnitCostBase > 0
                    ? ` · base ${baseCur} ${serverUnitCostBase.toFixed(2)}`
                    : ''
                }`
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
        <Stat label='break-even' value={breakEven.value} sub={breakEven.sub} />
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

      {/* #7 — the strip is either the server's arithmetic or a preview of yours, and it says which.
          A draft figure is the one thing that must never be mistaken for the number that seeds
          cost_price. */}
      {draftPreview && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            <b>Черновик — сохраните для пересчёта.</b> unit cost, маржа, break-even и waterfall
            посчитаны в браузере по несохранённым правкам статей. Итоговую цифру считает сервер (из
            BOM + FX-курсов), и именно она уходит в cost_price продукта.
          </Text>
        </CalloutBox>
      )}

      {/* WHICH MARKET the margin above is for. Catalogue prices are VAT-inclusive, so the net
          retail — and therefore the margin — depends entirely on the destination's rate. The list
          is the country dictionary; an empty dictionary hides the control rather than offering an
          empty select, and the domestic default still stands. */}
      {countryItems.length > 0 && (
        <div className='flex flex-wrap items-end gap-3'>
          <label className='flex min-w-56 flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              margin for market (VAT)
            </Text>
            {/* DOMESTIC is a sentinel, not ''. A Radix Select.Item throws on an empty-string
                value, so "no country picked" needs a real token on the way in and out. */}
            <Select
              name='costing-vat-country'
              fullWidth
              value={vatScenarioCountry || DOMESTIC}
              items={[{ value: DOMESTIC, label: 'domestic (default)' }, ...countryItems]}
              onValueChange={(v: string) => setVatScenarioCountry(v === DOMESTIC ? '' : v)}
            />
          </label>
          <Text size='micro' variant='label' className='min-w-0 flex-1 pb-0.5'>
            {vatScenarioLoading
              ? 're-reading the card at that country’s rate…'
              : vatCountry
                ? vatRate > 0
                  ? `net retail and margin above are computed at ${vatRate.toFixed(0)}% ${vatCountry} VAT${vatScenarioCountry ? '' : ' — the company’s domestic rate'}.`
                  : `no VAT rate on file for ${vatCountry} — nothing is netted, so the margin above is the gross-price one.`
                : 'the company’s domestic rate. Pick a destination to see the margin that market actually leaves.'}
          </Text>
        </div>
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
      {/* The note used to hang off `!hasCosting` — i.e. it appeared only when there was no rollup
          at all and therefore nothing that could be stale, and stayed hidden on exactly the cards
          where the rollup CAN lag behind the BOM. Inverted: a card that has a rollup is a card
          whose rollup was computed at some earlier save. */}
      {hasCosting && (
        <Text size='micro' variant='label'>
          the materials rollup above is computed from the BOM on SAVE — edits to the BOM, to a
          colourway’s usages or to a material’s price are not in these figures until the card is
          saved and re-read.
        </Text>
      )}
    </div>
  );
}
