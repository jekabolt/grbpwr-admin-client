import { common_ColorwayPrice, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  useCostingMigrationExceptions,
  useRepriceTechCardBom,
  useTechCardVatScenario,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { WaterfallRow } from 'ui/components/bar-row';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { MarkerConsumptionBand } from './marker-apply';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Select from 'ui/components/select';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { operationMinutes, SummaryOp } from './construction-tab';
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
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
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
  // usage to a per-garment figure — nowadays by the norm of the card's BASE SIZE, formerly by
  // dividing it by the total order qty — before it ever reaches
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
  const logistics = num(costing.logisticsCost);
  const overhead = num(costing.overheadCost);
  const defectPct = num(costing.defectPercent);
  // hardware/packaging are BOM-priced since Phase 2 — they arrive inside the server's materials
  // figure, never as typed articles.
  const articlesSubtotal = cmt + logistics + overhead;
  const beforeDefect = materials + articlesSubtotal;

  // #7 — WHOSE unit cost this strip shows. It used to be this file's own JS-float re-derivation,
  // always, with the server's `unit_cost` demoted to a truthiness test and `unit_cost_base` read by
  // nobody at all. That made the headline a second implementation of a decimal.Decimal calculation
  // that seeds cost_price: it agreed with the server only by luck, and every understatement the
  // server's own rollup carries (an FX-less BOM line dropped from materials_per_unit, a size-graded
  // usage normalised to one garment) was re-derived here into margins and a waterfall that read as
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

  // --- Phase 3 (plan 11): provenance-band inputs ---
  const approvalState = techCard?.techCard?.approvalState;
  const isDraft = approvalState === 'TECH_CARD_APPROVAL_STATE_DRAFT';
  // Only RELEASED freezes content (the server's RequireMutableTechCard rule): in_review/approved
  // cards are price-editable through a normal save, so they reprice too.
  const isReleased = approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED';
  const stateLabel = isDraft
    ? 'draft план'
    : approvalState === 'TECH_CARD_APPROVAL_STATE_IN_REVIEW'
      ? 'in review'
      : approvalState === 'TECH_CARD_APPROVAL_STATE_APPROVED'
        ? 'approved'
        : approvalState === 'TECH_CARD_APPROVAL_STATE_OBSOLETE'
          ? 'obsolete'
          : 'released';
  const { showMessage } = useSnackBarStore();
  const reprice = useRepriceTechCardBom();
  // The Phase 2 migration report for THIS card — empty for every cleanly-migrated card, so the
  // banner below simply never renders in the common case.
  const { data: migrationExceptions = [] } = useCostingMigrationExceptions(techCardId);

  // Implied labour rate, moved here from the construction tab: cmt_cost is a per-GARMENT quote, so
  // beside the input the derived money-per-minute reads against the construction total SAM
  // (smv-else-sam, exactly the server's operationMinutes rule).
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];
  const totalSam = operations.reduce((sum, o) => sum + operationMinutes(o), 0);
  const impliedPerMinute = cmt > 0 && totalSam > 0 ? cmt / totalSam : undefined;

  // Read-only cutting-wastage context for the reject rate (plan 10): the per-line wastage% already
  // grosses the material lines, so reject% must not re-price the same losses. Read from the SAVED
  // card (the rollup's own inputs), not the form.
  const bomLines = techCard?.techCard?.bomItems ?? [];
  const bomWastages = bomLines
    .map((b) => num(decimalToInput(b.wastagePercent)))
    .filter((w) => w > 0);
  const avgWastage = bomWastages.length
    ? bomWastages.reduce((a, b) => a + b, 0) / bomWastages.length
    : undefined;
  const rejectNoWastage = defectPct > 10 && bomLines.length > 0 && bomWastages.length === 0;

  const catalogLinkedLines = bomLines.filter((b) => (b.materialId ?? 0) > 0).length;
  const onReprice = () => {
    if (!techCardId) return;
    reprice.mutate(techCardId, {
      onSuccess: (r) => {
        const lines = r.lines ?? [];
        // The form is seeded at mount and deliberately never wholesale-reset on refetch, so the
        // live BOM rows still hold the pre-reprice prices — and the NEXT save would write those
        // stale numbers back (restamped 'manual'), silently undoing the reprice it just confirmed.
        // Sync the returned per-line results into the form by lineKey.
        const rows = (getValues('bomItems') ?? []) as { lineKey?: string }[];
        for (const l of lines) {
          if (!l.newPrice?.value || !l.lineKey) continue;
          const i = rows.findIndex((b) => b.lineKey === l.lineKey);
          if (i < 0) continue;
          setValue(`bomItems.${i}.unitPrice`, decimalToInput(l.newPrice), { shouldDirty: true });
          if (l.newCurrency) {
            setValue(`bomItems.${i}.currency`, l.newCurrency, { shouldDirty: true });
          }
        }
        const changed = lines.filter((l) => l.changed).length;
        const noPrice = lines.filter((l) => !l.newPrice).length;
        showMessage(
          `цены из каталога: изменено ${changed} из ${lines.length}` +
            (noPrice ? `, без каталожной цены: ${noPrice}` : '') +
            ((r.skippedUnlinked ?? 0) > 0 ? `, без привязки к каталогу: ${r.skippedUnlinked}` : ''),
          'success',
        );
      },
      onError: () => showMessage('не удалось обновить цены из каталога', 'error'),
    });
  };

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
  // rollup.baseCurrency is NOT a bare "company base currency" field — the server assigns it only
  // when EVERY component folded to base (base_currency == '' ⟺ unit_cost_base unset, see
  // techCardCostingToPb). An empty value therefore means "FX incomplete", not "cross-currency":
  // an EUR costing with one rate-less BOM line must say so, not pretend the card is foreign.
  const baseCur = rollup?.baseCurrency || '';
  const fxIncomplete = hasCosting && !baseCur;
  const sameCurrency = !!cur && !!baseCur && cur === baseCur;
  const baseRetail = useRetail(vatCard, !sameCurrency && baseCur ? baseCur : '');
  const helpSub = (label: string) => (
    <span title={BREAK_EVEN_NO_FX} className='cursor-help underline decoration-dotted'>
      {label}
    </span>
  );
  const breakEven = ((): { value: string; sub: React.ReactNode } => {
    if (!(devTotal > 0)) return { value: '—', sub: 'needs margin + R&D' };
    if (fxIncomplete) return { value: 'н/д', sub: helpSub('нет курсов — база не вычислена') };
    if (sameCurrency) {
      if (grossMargin == null) return { value: '—', sub: 'needs a net retail price' };
      if (!(grossMargin > 0)) return { value: '—', sub: 'margin is not positive' };
      return { value: String(Math.ceil(devTotal / grossMargin)), sub: 'units to recover R&D' };
    }
    // Cross-currency: fold both sides through the server's base figures. Each unavailable input
    // has its OWN message — «нет курса» used to stand in for all three, sending people to the FX
    // settings when the actual gap was a missing base-currency price or just unsaved edits.
    if (costingDirty) return { value: 'н/д', sub: 'черновик — сохраните для пересчёта' };
    if (!(serverUnitCostBase > 0)) return { value: 'н/д', sub: helpSub('нет курса') };
    if (baseRetail.net == null)
      return { value: 'н/д', sub: helpSub(`нет розницы в ${baseCur}`) };
    const marginInBase = baseRetail.net - serverUnitCostBase;
    if (!(marginInBase > 0)) return { value: '—', sub: `margin is not positive (${baseCur})` };
    return {
      value: String(Math.ceil(devTotal / marginInBase)),
      sub: `units to recover R&D · ${baseCur}`,
    };
  })();

  // Waterfall geometry: the track is the full retail price (or, with no retail, the unit cost),
  // and each article bar sits where the running total lands — so the descent reads as money
  // leaving the price rather than as five unrelated bars.
  // hardware · packaging have no bar of their own since Phase 2: they are BOM lines now, priced
  // per colourway, and arrive inside the materials figure.
  const steps = [
    { label: 'materials (BOM)', amount: materials },
    { label: 'CMT', amount: cmt },
    { label: 'logistics · overhead', amount: logistics + overhead },
    { label: `defect ${defectPct}%`, amount: defectAmount },
    // ≥ 0.005, not > 0: the server rounds unit_cost and materials_per_unit to 2dp independently,
    // so with defect 0% the residual plug can be ±0.005 — a phantom «defect 0% · −0.00» bar.
  ].filter((s) => s.amount >= 0.005);
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
      {/* Plan identity (plan 11 header): whose numbers these are and whether they are complete —
          answered before a single figure is read, not deduced from footnotes 300 lines down. */}
      <div className='flex flex-wrap items-center gap-1.5'>
        <Pill tone={isReleased ? 'attention' : 'mut'}>{stateLabel}</Pill>
        {cur && <Pill tone='mut'>{cur}</Pill>}
        {hasCosting &&
          (rollup?.hasUnpriced || rollup?.hasUnconvertedCurrencies ? (
            <Pill tone='warn'>неполный</Pill>
          ) : (
            <Pill tone='mut'>полный</Pill>
          ))}
        <Text size='micro' variant='label'>
          плановая себестоимость · пересчитывается при сохранении карты
        </Text>
      </div>

      {/* BLOCKING, so it sits ABOVE the strip it invalidates rather than beside the FX note at the
          bottom. An uncostable line joins NO currency bucket, so hasUnconvertedCurrencies never
          catches it and every figure below renders plausible-but-short by a whole material — the
          server refuses to seed product.cost_price from it, and until this banner existed the tab
          could not say why. */}
      {rollup?.hasUnpriced && (
        <CalloutBox tone='error'>
          <Text size='micro'>
            <b>Unit cost неполный и НЕ сеется в cost_price.</b> В рецепте есть строка, которую
            невозможно посчитать: нет цены в BOM или в каталоге, пин на артикул с несовпадающей
            единицей измерения, не задана норма расхода, либо норма задана по размерам, а размерные
            количества не заполнены. Такая строка не попадает ни в один валютный итог, поэтому цифры
            ниже выглядят правдоподобно, но занижены на целый материал. Найдите строку на вкладках
            BOM / colorways
            {colorwayCosts.some((cc) => cc.hasUnpriced)
              ? ' — проблемный colourway отмечен ниже, в «cost by colourway»'
              : ''}
            .
          </Text>
        </CalloutBox>
      )}

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

      {/* Phase 2 migration debt for THIS card: hardware/packaging money the scalar→BOM migration
          refused to move mechanically. Renders only when rows exist — a cleanly migrated card
          (the overwhelmingly common case) never sees this. */}
      {migrationExceptions.length > 0 && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            <b>Деньги ждут ручного переноса в BOM.</b> Миграция «hardware/packaging → BOM» не смогла
            перенести эти суммы автоматически:
          </Text>
          {migrationExceptions.map((e, i) => (
            <Text size='micro' key={i}>
              {`· ${e.article}: ${e.amount?.value ?? '—'} ${e.currency || ''} — ${
                e.kind === 'not_draft'
                  ? 'карта была released (перенесите при пере-релизе)'
                  : e.kind === 'zero_colorways'
                    ? 'нет колорвеев, некуда повесить usage'
                    : 'в секции уже была строка с ценой (double-count; BOM победил)'
              }`}
            </Text>
          ))}
          <Text size='micro' variant='label'>
            Перенос: строка BOM с этой суммой + usage на каждый колорвей. Отчёт исторический
            (зафиксирован миграцией) и не самоочищается — он напоминание, а не текущее состояние
            BOM.
          </Text>
        </CalloutBox>
      )}

      {/* ═══ COMPUTED · материалы — the system's own numbers, from BOM × colourway recipes.
          Everything in this band is computed server-side on save; nothing here is typed. */}
      <GroupLabel>COMPUTED · материалы — из BOM × рецепты колорвеев</GroupLabel>
      {/* Ф4: measured fabric consumption from saved раскладки, beside what the recipes say.
          Display-only — the write path is the recipe editor's «применить…». */}
      <MarkerConsumptionBand techCard={techCard} />
      {colorwayCosts.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              {/* No qty / order cost columns: a style has no batch size of its own. They showed
                  Σ(типовой тираж) × unit cost, and with the typical size run gone they would
                  read 0 — «партия бесплатная». The batch total belongs to the production run. */}
              <th>colourway</th>
              <th>materials / unit</th>
              <th>unit cost</th>
            </tr>
          </thead>
          <tbody>
            {colorwayCosts.map((cc, i) => (
              // An uncostable line blocks THIS colourway's own cost seed, so the figures are
              // muted to stop them being read as the answer — the name stays at full weight
              // because it is what you have to go and fix.
              <tr
                key={i}
                className={cc.hasUnpriced ? '[&>td:not(:first-child)]:text-labelColor' : undefined}
              >
                <td>
                  <span className='flex flex-wrap items-center gap-1'>
                    {colorwayLabel(cc.colorwayId)}
                    {cc.colorwayId === 0 && <Pill tone='mut'>основной</Pill>}
                    {cc.hasUnconvertedCurrencies && <Pill tone='warn'>no FX</Pill>}
                    {cc.hasUnpriced && (
                      <Pill tone='warn' title='в рецепте есть строка, которую нельзя посчитать'>
                        строка без цены
                      </Pill>
                    )}
                  </span>
                </td>
                <td>{decimalToInput(cc.materialsPerUnit) || <EmptyCell />}</td>
                <td>{decimalToInput(cc.unitCost) || <EmptyCell />}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {materialsTotal.length > 0 && (
        <div>
          {materialsTotal.map((line, i) => (
            <Row
              key={i}
              label={`materials · ${line.currency || 'no currency'}`}
              value={decimalToInput(line.amount) || '—'}
            />
          ))}
        </div>
      )}
      {colorwayCosts.length === 0 && materialsTotal.length === 0 && (
        <Text size='micro' variant='label'>
          материалов пока нет — заполните BOM и рецепты колорвеев, суммы посчитаются при
          сохранении. Источник и дату каждой цены видно в таблице «cost estimate».
        </Text>
      )}
      {/* Reprice: the one write this band owns. Server-side, frozen only for RELEASED cards,
          catalog-linked lines only —
          the same CATALOG_LATEST price the estimate table shows as the fallback. */}
      {canWriteCosting && !isReleased && catalogLinkedLines > 0 && (
        <div className='flex flex-wrap items-center gap-3'>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={reprice.isPending}
            onClick={onReprice}
          >
            {reprice.isPending ? 'обновляю цены…' : 'обновить цены из каталога'}
          </Button>
          <Text size='micro' variant='label' className='min-w-0 flex-1'>
            перезапишет unit price у {catalogLinkedLines} привязанных к каталогу строк BOM текущей
            каталожной ценой и пометит их источник «catalog»; подписанный MATERIALS sign-off станет
            устаревшим — цены документа реально изменились.
          </Text>
        </div>
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
            <b>Some BOM lines are in another currency</b>, so they are excluded from the
            costing-currency total — the unit cost above is understated.{' '}
            <Link to={ROUTES.settings} className='underline'>
              Add a costing FX rate in Settings
            </Link>{' '}
            to get a complete <b>base-currency</b> cost (unit cost base): the headline above stays
            in the costing currency and still will not include those lines.
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

      {/* ═══ QUOTED · работа — the factory's CMT quote per garment. The one money figure a human
          brings from outside; the implied rate ties it back to the construction minutes. */}
      <GroupLabel>QUOTED · работа (CMT)</GroupLabel>
      <fieldset disabled={!canWriteCosting} className='grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'>
        <DecimalField name='costing.cmtCost' label='CMT cost / изделие (квота фабрики)' />
      </fieldset>
      {impliedPerMinute != null && (
        <Text size='micro' variant='label'>
          {`total SAM ${totalSam.toFixed(1)} мин (конструктив) → CMT ${cmt.toFixed(2)} ${cur} ≈ ${impliedPerMinute.toFixed(2)} ${cur}/мин — производная ставка, не хранится; сверьте с обычной ставкой фабрики.`}
        </Text>
      )}

      {/* ═══ ENTERED · прочие прямые — manual because nothing in the system can derive them. */}
      <GroupLabel>ENTERED · прочие прямые</GroupLabel>
      <fieldset
        disabled={!canWriteCosting}
        className='grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'
      >
        <DecimalField name='costing.logisticsCost' label='logistics / изделие' />
        <DecimalField name='costing.overheadCost' label='overhead / изделие' />
        <CurrencySelect name='costing.currency' label='currency' />
      </fieldset>
      <Text size='micro' variant='label'>
        За 1 изделие, в валюте костинга (единой для всех ручных статей). Вводятся вручную, потому
        что данных для вывода нет. Материалы сюда не входят — они выше, из BOM. Ценообразование
        (наценка/опт/розница) живёт на опубликованном продукте, не здесь.
      </Text>
      <fieldset disabled={!canWriteCosting} className='border-0 p-0'>
        <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />
      </fieldset>

      {/* ═══ RATES — percentages, with the adjacent figure each one must NOT double-count. */}
      <GroupLabel>RATES</GroupLabel>
      <fieldset
        disabled={!canWriteCosting}
        className='grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'
      >
        <DecimalField name='costing.defectPercent' label='reject rate % (готовые изделия)' />
      </fieldset>
      <Text size='micro' variant='label'>
        {avgWastage != null
          ? `Кроёные потери уже в материалах: средний cutting wastage по BOM-строкам ${avgWastage.toFixed(1)}% (${bomWastages.length} строк с wastage). Reject % — только брак ГОТОВЫХ изделий, не потери кроя.`
          : 'Reject % — брак ГОТОВЫХ изделий. Потери кроя задаются per-строчно в BOM (wastage %) и уже заложены в материалы.'}
      </Text>
      {rejectNoWastage && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            <b>{`Reject ${defectPct.toFixed(0)}% при нулевом wastage на всех ${bomLines.length} строках BOM`}</b>
            {' — похоже, в reject свалены и потери кроя. Раздельно честнее: wastage на строках материалов, reject — только на готовые изделия.'}
          </Text>
        </CalloutBox>
      )}

      {/* ═══ RESULT — the commercial read: what the market leaves after the production cost above.
          Deliberately separated from the cost bands: margin is a pricing fact, not a cost fact. */}
      <GroupLabel>RESULT · retail → margin</GroupLabel>
      {/* WHICH MARKET the margin is for. Catalogue prices are VAT-inclusive, so the net
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
                  ? `net retail and margin are computed at ${vatRate.toFixed(0)}% ${vatCountry} VAT${vatScenarioCountry ? '' : ' — the company’s domestic rate'}.`
                  : `no VAT rate on file for ${vatCountry} — nothing is netted, so the margin is the gross-price one.`
                : 'the company’s domestic rate. Pick a destination to see the margin that market actually leaves.'}
          </Text>
        </div>
      )}
      <fieldset
        disabled={!canWriteCosting}
        className='grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'
      >
        {/* This style's own target. Left empty it falls back to the house default, which the server
            resolves onto the read — so an empty field is not "no target", it is "the usual one". */}
        <DecimalField
          name='costing.targetMarginPct'
          label={`target margin %${hasTarget && !num(costing.targetMarginPct) ? ` (house ${targetPct.toFixed(0)})` : ''}`}
        />
      </fieldset>

      {/* 16.1 — where the retail price goes. Same inputs as above, but each one is a bar you can
          see the size of, and margin lands at the bottom. */}
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
    </div>
  );
}
