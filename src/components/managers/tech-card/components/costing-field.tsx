import { common_ColorwayPrice, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { runStatusLabel } from 'components/managers/production-runs/components/options';
import { runColorwayRows } from 'components/managers/production-runs/components/run-composition';
import {
  useProductionRun,
  useProductionRuns,
} from 'components/managers/production-runs/components/useProductionRuns';
import {
  useCostingMigrationExceptions,
  useRepriceTechCardBom,
  useTechCardVatScenario,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { Suspense, lazy, useMemo, useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import GenericPopover from 'ui/components/popover';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import CurrencySelect from 'ui/form/fields/currency-select';
import DecimalField from 'ui/form/fields/decimal-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { BatchComposition } from './batch-composition';
import { bomPurposeLabel } from './bom-purpose';
import { operationMinutes, SummaryOp } from './construction-tab';
import { ESTIMATE_WHY, HelpMark, LineProblems, TIER_ESTIMATE } from './costing-vocab';
import { serverScopeKeyOfSheet, wireFabricPurpose } from './pattern-size-index';
import { unmeasuredDxfScopeKeys } from './piece-areas-state';
import { useDevExpenses } from './dev-expenses-field';
import { MarkerConsumptionBand } from './marker-apply';
import { TechCardFormData } from './schema';

// Весь граф раскладки (dxf-parser + clipper2 + воркер) живёт в ленивом чанке — см. место рендера.
const BatchMarkerQueue = lazy(() =>
  import('./batch-marker-queue').then((m) => ({ default: m.BatchMarkerQueue })),
);

// "no country picked" for the VAT-scenario select — '' cannot be a Radix Select.Item value.
const DOMESTIC = '__domestic__';

const num = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : 0;
};

// The form fields the SERVER's unit_cost is built from. While none of them is dirty, the rollup on
// the last read still describes what is in the form, so the figures below are the server's own;
// touch one and they degrade to a labelled browser-side preview until the card is saved.
// (target_margin_pct and notes are deliberately absent: neither moves the unit cost, and the target
// itself is read back from the server-resolved effective_target_margin_pct.)
// Экспортированы, а не скопированы: полоса себестоимости (money-panel) задаёт форме РОВНО ТОТ ЖЕ
// вопрос — «форма всё ещё то, из чего сервер считал rollup». Второй список полей разошёлся бы с
// этим при первой же новой статье костинга, и разошёлся бы молча.
export const COSTING_COST_KEYS = [
  'cmtCost',
  'logisticsCost',
  'overheadCost',
  'defectPercent',
  'currency',
] as const;
export const COSTING_COST_PATHS = COSTING_COST_KEYS.map((k) => `costing.${k}` as const);

// ЧТО ДЕЛАТЬ С ОЦЕНКОЙ — одной фразой, общей для обеих веток вердикта ниже. Обе называют один и
// тот же следующий шаг, и разъехаться словами им незачем: кнопки здесь нет намеренно (вердикт
// живёт внутри `fieldset disabled` выпущенной карточки, где кнопка была бы мёртвой, а блок базы
// расчёта с этими действиями стоит ВЫШЕ и заморозке не подлежит).
const ESTIMATE_CTA =
  'the consumption of some fabrics is derived from geometry (piece area ÷ cutting width): there is ' +
  'no waste between pieces in this number, so the cost is understated and the margin overstated. ' +
  'The norm comes from a marker — pick a run as the calculation basis at the top of the tab and ' +
  'build it, or enter the consumption by hand in the colourway recipe.';

const BREAK_EVEN_NO_FX =
  'R&D is accounted for in the base currency, and the margin above is in the costing currency. ' +
  'There is nothing to convert with: a net retail in the base currency and the server-side ' +
  'unit_cost_base are needed (it appears once every BOM currency has a rate). A base-currency ' +
  'amount cannot be divided by a margin in another currency.';

/**
 * The retail the margin descends from, and — the part that used to be missing — whether it is
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
 * axis shows net as the real margin and keeps gross visible while the target is re-anchored.
 *
 * Still only trusted when every priced colourway agrees — a disagreement is reported, never
 * averaged. A made-up retail would make every margin on this tab a lie.
 */
function useRetail(techCard: common_TechCard | undefined, currency: string) {
  const colorways = techCard?.colorways ?? [];

  if (!currency) return { gross: undefined, net: undefined, reason: 'no costing currency picked' };
  if (colorways.length === 0)
    return {
      gross: undefined,
      net: undefined,
      reason: 'no colourways, nothing to read a price from',
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

  if (gross.distinct.length === 0) {
    // ОТСУТСТВИЕ НАЗЫВАЕТ ТО, ЧТО НАШЛОСЬ ВМЕСТО. «Нет EUR-цены» — правда, от которой нечего
    // делать: у колорвея цена в карточке ВИДНА, и человек читает строку как поломку экрана.
    // А случаев за ней два, и чинятся они по-разному: цена есть, но в ДРУГОЙ валюте (тогда либо
    // добавить цену в валюте костинга, либо вести костинг в той) — или цены нет вовсе ни в одной
    // (тогда идти публиковать продукт). Пересчитать чужую валюту по курсу здесь НЕЛЬЗЯ: розница в
    // другой валюте — это цена другого рынка, а не то же число в других единицах, и маржа против
    // пересчитанного была бы сценарием, выданным за факт — ровно то, за что в этом же файле уже
    // разведены gross и net.
    const others = Array.from(
      new Set(
        colorways.flatMap((c) =>
          (c.prices ?? [])
            .filter(
              (p) =>
                p.currency && p.currency !== currency && parseDecimalNumber(p.price?.value) > 0,
            )
            .map((p) => p.currency as string),
        ),
      ),
    );
    return {
      gross: undefined,
      net: undefined,
      reason: others.length
        ? `the colourways have no price in ${currency} — it is set in ${others.join(' / ')}. Add a price in ${currency} or run the costing in that same currency`
        : `the colourways have no retail price in any currency`,
    };
  }
  if (gross.distinct.length > 1)
    return {
      gross: undefined,
      net: undefined,
      reason: `the colourways disagree on the price (${gross.distinct.join(' / ')} ${currency})`,
    };
  // A NET disagreement is its own fact and must not be reported as a missing VAT rate. Gross can
  // agree while net does not — two colourways sold into two rates — and the old code let `net.value`
  // fall to undefined with an empty reason, so the tab blamed the country dictionary for a
  // disagreement between the prices themselves.
  if (net.distinct.length > 1)
    return {
      gross: gross.value,
      net: undefined,
      reason: `the colourways disagree on the net price (${net.distinct.join(' / ')} ${currency})`,
    };
  // net is absent when the read's VAT country has no rate on file — an export destination has no
  // VAT to remove. That is reported next to the figure, not silently substituted with gross.
  return { gross: gross.value, net: net.value, reason: '' };
}

/**
 * Manual cost articles (Sheet «Калькуляция») + the numbers they drive. The materials rollup and
 * the per-colourway costs are computed server-side from the BOM + colourway usages (output-only):
 * read from the last GetTechCard, never sent on write.
 *
 * SHAPE OF THIS TAB (owner's picks from the costing configurator, 2026-08-09):
 *
 *  • VERDICT PANEL — the gap as one big number, its cause named, and the one control that closes
 *    it. Previously a coloured sentence competing with five status pills.
 *  • PRICE AXIS — retail → −VAT → −cost → =margin as four cells of ONE arithmetic chain.
 *    Previously four cells from three different universes (plan, plan-with-VAT, plan-without-VAT,
 *    period R&D) at equal weight.
 *  • ONE BREAKDOWN, NOT TWO — the waterfall is the breakdown, and the input that moves each step
 *    sits on that step's own row. Before, the same money was drawn twice: visible cost bars with
 *    the levers, and a hidden waterfall without them.
 *  • PROBLEMS AS A LIST, NOT A STACK — up to five full-width callouts collapsed into one counted
 *    row, each problem carrying the link to where it is fixed.
 *  • EXPLANATIONS AT THE THING THEY EXPLAIN — `HelpMark` popovers instead of ~8 grey paragraphs
 *    lying between the numbers people are trying to compare.
 *
 * 🔒 costing: the tab is hidden without costing:read; the fieldsets below are disabled without
 * costing:write. Everything read-only stays drawn in that case.
 */
export function CostingField({
  techCard,
  frozen = false,
}: {
  techCard?: common_TechCard;
  /**
   * Карточка ВЫПУЩЕНА (approval_state = RELEASED), и её содержимое правке больше не подлежит.
   *
   * Заморозку теперь несёт эта вкладка сама, а не общий `<fieldset disabled>` формы, из-под которого
   * она выехала. Причина — в блоке БАЗЫ РАСЧЁТА ниже: партия не является содержимым карточки, и
   * планируют её как раз ПОСЛЕ релиза. Под общим fieldset'ом браузер гасил и переключатель базы, и
   * сетку состава — то есть ровно на тех карточках, ради которых они и написаны.
   */
  frozen?: boolean;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  // ДВА РАЗНЫХ ПРАВА ВСТРЕЧАЮТСЯ НА ЭТОЙ ВКЛАДКЕ. Статьи костинга пишет costing:write; партию —
  // даже черновую, даже заведённую ради расчёта — планирует production:write. Аккаунт с одним и без
  // другого нормален (экономист считает деньги, координатор заводит партии), и слить их в одно
  // право значило бы либо раздать планирование, либо отобрать расчёт.
  const { canWriteCosting, canWrite } = usePermissions();
  const { dictionary } = useDictionary();
  const techCardId = techCard?.id;

  // WHICH MARKET this margin is for. GetTechCardRequest.vat_country_code was never sent, so the tab
  // always showed the domestic rate while presenting it as "the" margin — the one thing the netting
  // contract says is not true ("one gross price is sold into as many rates as there are
  // destinations"). '' keeps the page's own read, i.e. the domestic country; picking a country
  // fetches the same card netted at that country's rate, as a scenario beside the default.
  const [vatScenarioCountry, setVatScenarioCountry] = useState('');
  // БАЗА РАСЧЁТА: стиль или конкретная ПАРТИЯ (Ф2).
  //
  // Стиль отвечает на вопрос «сколько стоит это изделие вообще» — средняя по объявленному
  // размерному ряду, одна на карточку. Партия отвечает на другой: «сколько будет стоить ВОТ ЭТО
  // производство» — взвешенно по её собственному миксу колорвеев и размеров, с её пинами.
  //
  // Это РАЗНЫЕ вопросы, и путать их дороже всего: партия из одних XL, посчитанная по средней ряда,
  // выглядит нормально и врёт на всю разницу градации. Поэтому база выбирается явно и подписана.
  const [batchRunId, setBatchRunId] = useState(0);
  // Открыт ли редактор состава ДЛЯ ЕЩЁ НЕ СОЗДАННОЙ партии. Для уже выбранной базы состав
  // показывается всегда: «сколько каких размеров каждого колорвея» — это и есть вопрос вкладки,
  // и прятать ответ на него за вторую кнопку значит отвечать не сразу.
  const [composing, setComposing] = useState(false);
  const { data: runsData } = useProductionRuns(techCardId ?? 0, '', 0, false, !!techCardId);
  const runs = runsData?.runs ?? [];
  const { data: batchData } = useProductionRun(batchRunId, batchRunId > 0);
  const batchRun = batchData?.run;
  // Планировать партии — производственное право, и без сохранённой карточки планировать нечего:
  // techCardId 0 уехал бы в CreateProductionRun партией без стиля.
  const canPlanRuns = canWrite(SECTION.production) && !!techCardId;
  // Тот же вывод строк, что у модалки создания прогона и у сетки на странице партии (архивные и
  // беспродуктовые колорвеи не предлагаются) — один экземпляр правил на три поверхности.
  const runColorways = useMemo(
    () => runColorwayRows(techCard?.colorways, dictionary?.colors),
    [techCard?.colorways, dictionary?.colors],
  );
  // Кнопок базы — шесть, но ВЫБРАННАЯ партия обязана быть среди них всегда: только что созданный
  // черновик иначе стал бы базой, у которой на экране нет ни одной нажатой кнопки, и экран
  // показывал бы «стиль» при расчёте по партии.
  const basisRuns = useMemo(() => {
    const head = runs.slice(0, 6);
    const selected = runs.find((r) => r.id === batchRunId);
    return selected && !head.some((r) => r.id === selected.id) ? [...head, selected] : head;
  }, [runs, batchRunId]);
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

  const rollup = techCard?.techCard?.costing;
  const colorwayCosts = rollup?.colorwayCosts ?? [];
  // colorway_cost rows are keyed by the real colorwayId (0 = the card's primary/base costing,
  // not tied to one colourway) — resolve labels from the live techCard.colorways
  // (AdminColorwayRef[], R1: a colourway is a product) + dictionary.colors, same pattern as
  // construction-tab.tsx.
  // vatCard, NOT techCard: the per-colourway margins in the tiles below read `netPrices` off these
  // refs, and the page's own read is netted at the DOMESTIC rate. Reading them from techCard while
  // the headline follows the picked market produced one screen with two VAT regimes on it and
  // nothing saying so. Labels and swatches are identical in both, so this only moves the money.
  const storedColorways = vatCard?.colorways ?? [];
  const colorwayOf = (id?: number) =>
    id ? storedColorways.find((c) => c.colorwayId === id) : undefined;
  const colorwayLabel = (id?: number) => {
    const cw = colorwayOf(id);
    const dc = cw ? dictionary?.colors?.find((c) => c.code === cw.colorCode) : undefined;
    return dc?.name || cw?.colorCode || (id ? `colourway #${id}` : 'base');
  };
  // AdminColorwayRef is output-only and carries no shade of its own (no colorHexOverride, no
  // resolved dictionaryColor) — only colorCode — so the swatch resolves through the dictionary.
  // A colour with no hex on file simply gets no swatch, rather than a grey square pretending to
  // be the colour.
  const colorwaySwatch = (id?: number) => {
    const cw = colorwayOf(id);
    return cw ? dictionary?.colors?.find((c) => c.code === cw.colorCode)?.hex : undefined;
  };

  const materialsTotal = rollup?.materialsTotal ?? [];

  const costing = (useWatch({ control, name: 'costing' }) ?? {}) as {
    cmtCost?: string;
    logisticsCost?: string;
    overheadCost?: string;
    defectPercent?: string;
    targetMarginPct?: string;
    currency?: string;
    notes?: string;
  };
  // Are the article inputs still what the server computed the rollup from? RHF's dirty state is
  // measured against the defaultValues the card was loaded (and re-reset after every save) with, so
  // this is exactly the question "does the form still match the last read".
  const { dirtyFields } = useFormState({ control, name: COSTING_COST_PATHS });
  const costingDirty = COSTING_COST_KEYS.some(
    (k) => !!(dirtyFields.costing as Record<string, boolean> | undefined)?.[k],
  );
  // A CURRENCY edit is not the same kind of dirty as a CMT edit, and treating it as one produced the
  // worst number on the tab. Every server rollup this component reads — materials_per_unit, each
  // colourway's unit cost — is denominated in the SAVED currency, and nothing re-converts them; only
  // the `cur` label flips. So switching EUR → PLN instantly subtracted EUR materials from a PLN
  // retail and stamped the difference «PLN» in the verdict's big figure. There is no client-side FX
  // here to fix that with (the rates live server-side), so the honest move is to refuse to show the
  // derived money until the card is saved and the server has recomputed it.
  const currencyDirty = !!(dirtyFields.costing as Record<string, boolean> | undefined)?.currency;

  const cur = costing.currency || rollup?.baseCurrency || '';
  const money = (n: number) => `${cur ? `${cur} ` : ''}${n.toFixed(2)}`;

  // The article inputs, read off the form so the bars move as you type. Materials are never typed —
  // they come from the server rollup (BOM-derived).
  const materials = num(decimalToInput(rollup?.materialsPerUnit));
  const cmt = num(costing.cmtCost);
  const logistics = num(costing.logisticsCost);
  const overhead = num(costing.overheadCost);
  const defectPct = num(costing.defectPercent);
  // hardware/packaging are BOM-priced since Phase 2: they arrive inside the server's materials
  // figure, never as typed articles.
  const articlesSubtotal = cmt + logistics + overhead;
  const beforeDefect = materials + articlesSubtotal;

  // WHOSE unit cost this is. Unchanged form → the SERVER's figure (the one that seeds cost_price);
  // unsaved edits → the local preview, labelled as a draft so nobody prices against a number the
  // server has never seen.
  const serverUnitCost = num(decimalToInput(rollup?.unitCost));
  const serverUnitCostBase = num(decimalToInput(rollup?.unitCostBase));
  const usingServerCost = !costingDirty && serverUnitCost > 0;
  const unitCost = usingServerCost ? serverUnitCost : beforeDefect * (1 + defectPct / 100);
  // The defect step closes the breakdown ONTO whichever unit cost is on show, so the rows always
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
  // The country the figures were actually netted at, as the SERVER reports it — not the dropdown.
  // An unknown code comes back echoed with no rate, and saying which country produced a number is
  // the whole point of the control.
  const vatContext = vatCard?.techCard?.costing;
  const vatCountry = vatContext?.vatCountryCode || '';
  const vatRate = num(decimalToInput(vatContext?.vatRatePct));

  const marginBase = netRetail;
  const grossMargin = marginBase != null ? marginBase - unitCost : undefined;
  const marginPct =
    marginBase != null && marginBase > 0 && hasCosting
      ? ((marginBase - unitCost) / marginBase) * 100
      : undefined;
  // Gross-of-VAT margin: the figure this tab used to headline. Kept as the margin cell's sub so the
  // drop from one to the other is legible rather than mysterious.
  const grossMarginPct =
    grossRetail != null && grossRetail > 0 && hasCosting
      ? ((grossRetail - unitCost) / grossRetail) * 100
      : undefined;

  // The target comes from the contract: this style's own, else the house default, resolved
  // server-side into effective_target_margin_pct. No client constant.
  //
  // A TYPED target wins over the saved one while it is on screen: judging the verdict against a
  // target the operator has just replaced (60% margin, target moved 50 → 70) would keep
  // congratulating them until they saved. Out-of-range input is ignored rather than obeyed.
  const typedTarget = num(costing.targetMarginPct);
  const serverTargetPct = num(decimalToInput(rollup?.effectiveTargetMarginPct));
  const targetPct = typedTarget > 0 && typedTarget < 100 ? typedTarget : serverTargetPct;
  const hasTarget = targetPct > 0;
  const onTarget = marginPct != null && hasTarget && marginPct >= targetPct;

  const approvalState = techCard?.techCard?.approvalState;
  const isDraft = approvalState === 'TECH_CARD_APPROVAL_STATE_DRAFT';
  // Only RELEASED freezes content (the server's RequireMutableTechCard rule): in_review/approved
  // cards are price-editable through a normal save, so they reprice too.
  const isReleased = approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED';
  const stateLabel = isDraft
    ? 'draft plan'
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
  // row below simply never appears in the common case.
  const { data: migrationExceptions = [] } = useCostingMigrationExceptions(techCardId);

  // Implied labour rate: cmt_cost is a per-GARMENT quote, so the derived money-per-minute reads
  // against the construction total SAM (smv-else-sam, exactly the server's operationMinutes rule).
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as SummaryOp[];
  const totalSam = operations.reduce((sum, o) => sum + operationMinutes(o), 0);
  const impliedPerMinute = cmt > 0 && totalSam > 0 ? cmt / totalSam : undefined;

  // Read-only cutting-wastage context for the reject rate: the per-line wastage% already grosses
  // the material lines, so reject% must not re-price the same losses. Read from the SAVED card
  // (the rollup's own inputs), not the form.
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
          `catalog prices: ${changed} of ${lines.length} changed` +
            (noPrice ? `, no catalog price: ${noPrice}` : '') +
            ((r.skippedUnlinked ?? 0) > 0
              ? `, not linked to the catalog: ${r.skippedUnlinked}`
              : ''),
          'success',
        );
      },
      onError: () => showMessage("couldn't refresh prices from the catalog", 'error'),
    });
  };

  // R&D is a period style cost, deliberately outside the unit COGS — it lands here only as the
  // amount the unit margin has to earn back.
  const { data: devData } = useDevExpenses(techCardId);
  const devTotal = num(decimalToInput(devData?.summary?.totalBase));

  // Break-even used to be a headline stat here AND a headline stat in the R&D section below, under
  // the same name, computed from two different margins. This one is explicitly the PLANNED-margin
  // answer (catalogue retail); the R&D section owns the realised-sales one and says so. Kept as a
  // footnote to the breakdown rather than a fifth headline cell.
  //
  // The division only ever happens inside ONE currency:
  //   • costing currency == base currency → the margin above already is a base margin;
  //   • otherwise → fold both sides with the SERVER's base figures (net retail read in the base
  //     currency + unit_cost_base, the same rollup that seeds cost_price).
  // rollup.baseCurrency is NOT a bare "company base currency" field — the server assigns it only
  // when EVERY component folded to base (base_currency == '' ⟺ unit_cost_base unset). An empty
  // value therefore means "FX incomplete", not "cross-currency".
  const baseCur = rollup?.baseCurrency || '';
  const fxIncomplete = hasCosting && !baseCur;
  const sameCurrency = !!cur && !!baseCur && cur === baseCur;
  const baseRetail = useRetail(vatCard, !sameCurrency && baseCur ? baseCur : '');
  const breakEven = ((): { value: string; why: string } => {
    if (!(devTotal > 0)) return { value: '', why: '' };
    if (fxIncomplete) return { value: 'n/a', why: "no rates — the base cost didn't add up" };
    if (sameCurrency) {
      if (grossMargin == null) return { value: 'n/a', why: 'no net retail' };
      if (!(grossMargin > 0)) return { value: 'n/a', why: 'the margin is not positive' };
      return { value: `${Math.ceil(devTotal / grossMargin)} pcs`, why: '' };
    }
    // Cross-currency: fold both sides through the server's base figures. Each unavailable input
    // has its OWN message — «no rate» used to stand in for all three, sending people to the FX
    // settings when the actual gap was a missing base-currency price or just unsaved edits.
    if (costingDirty) return { value: 'n/a', why: 'draft — save to recompute' };
    if (!(serverUnitCostBase > 0)) return { value: 'n/a', why: 'no rate' };
    if (baseRetail.net == null) return { value: 'n/a', why: `no retail in ${baseCur}` };
    const marginInBase = baseRetail.net - serverUnitCostBase;
    if (!(marginInBase > 0))
      return { value: 'n/a', why: `the margin is not positive (${baseCur})` };
    return { value: `${Math.ceil(devTotal / marginInBase)} pcs`, why: baseCur };
  })();

  // ── THE GAP. Target margin t on net retail R means a unit cost of at most R×(1−t), so the gap is
  // what the current cost exceeds that by. Stated in the costing currency, like the cost it is
  // measured against.
  const targetUnitCost =
    marginBase != null && hasTarget ? marginBase * (1 - targetPct / 100) : undefined;
  const gap = targetUnitCost != null ? unitCost - targetUnitCost : undefined;
  // РЕШЕНИЕ И ПОКАЗ ОБЯЗАНЫ СОГЛАСОВАТЬСЯ ПО ТОЧНОСТИ. `onTarget` сравнивает сырые числа, а
  // разрыв печатается с двумя знаками: маржа, недотянувшая до цели на полкопейки, давала красное
  // «не хватает −0.00» — то есть тревогу о сумме, которой на экране нет. Полкопейки — тот же
  // порог, которым весь этот экран отличает остаток округления от денег.
  const gapWorthShowing = (gap ?? 0) >= 0.005;
  // A cost the server itself calls incomplete (an uncostable BOM line, a currency with no rate) is
  // understated by an unknown amount, so a margin computed from it cannot certify anything.
  const costIncomplete = !!rollup?.hasUnpriced || !!rollup?.hasUnconvertedCurrencies;
  // ── СТУПЕНЬ ЦИФРЫ (Ф5). `has_estimate` — сервер посчитал часть рулонных слотов ОЦЕНКОЙ СНИЗУ
  // (площадь деталей ÷ раскройную ширину) и сам отказывается сеять таким числом cost_price.
  //
  // ЭТО НЕ «НЕПОЛНАЯ» ЦИФРА, И ПОТОМУ ОНА НЕ В `costIncomplete`. У неполной неизвестен ЗНАК ошибки:
  // строка без цены могла бы стоить и три копейки, и половину изделия. У оценки знак известен
  // ТОЧНО — netto не содержит межлекальных выпадов, значит себестоимость занижена, а маржа
  // завышена. Поэтому оценка показывается числом (её и просили: карточка не должна стоить ноль при
  // полной спецификации), но НИЧЕГО НЕ УДОСТОВЕРЯЕТ.
  //
  // До этой правки вкладка про ступень не знала вовсе, хотя полоса себестоимости справа читала
  // ровно тот же флаг: карточка, посчитанная оценкой, писала зелёным «цель 50% выполнена» и
  // считала окупаемость R&D по марже, которой не бывает на фабрике.
  const lowerBound = hasCosting && !!rollup?.hasEstimate;
  // ...and every GREEN thing on the tab has to consult that, not just the verdict sentence. Without
  // this gate the panel said «the margin can't be computed from this cost» while, two blocks down,
  // the margin cell rendered `tone='up'`, the closing waterfall bar rendered green, and the
  // break-even footnote quoted a confident unit count — all from the same understated cost. A
  // pending currency switch is the same class of "the money on screen is not comparable yet".
  //
  // `lowerBound` живёт здесь наравне с неполнотой: удостоверять — значит утверждать, что цифра
  // рядом верна, а нижняя граница верна только КАК ГРАНИЦА. Один гейт на все три зелёные вещи
  // экрана — заводить для оценки второй список мест было бы ровно тем расхождением, из-за которого
  // этот гейт и появился.
  const certifiable = hasCosting && !costIncomplete && !currencyDirty && !lowerBound;
  // Stronger than `certifiable`: an understated cost is still a real amount in a known currency and
  // is worth showing (flagged). A cost mid-currency-switch is not — it is EUR materials about to be
  // printed with a PLN sign. Every derived amount below is withheld until the server re-denominates
  // it, but the ROWS and their inputs stay, so the card is still editable while that is pending.
  const showMoney = !currencyDirty;

  // ── THE BREAKDOWN ROWS. Fixed order — materials, work, the rest, then the rate that grosses
  // them. Ranking by size would re-sort the list under the cursor of whoever is typing into it.
  //
  // Every row is ALWAYS rendered, including a row whose amount is zero: the row carries the input
  // that sets it, and a filtered-out row is an input you cannot reach to type your first CMT quote
  // into.
  const steps: {
    key: string;
    name: string;
    amount: number;
    aside?: string;
    help: React.ReactNode;
    lever?: React.ReactNode;
  }[] = [
    {
      key: 'materials',
      name: 'materials',
      amount: materials,
      // Ступень стоит У САМОЙ ДЛИННОЙ ПОЛОСЫ, а не только в заголовке: вердикт называет
      // «materials» местом, куда идти за деньгами, и пришедший сюда по его совету обязан здесь же
      // увидеть, что часть этой полосы — выведенное netto, а не измеренный факт.
      aside: [
        unitCost > 0 ? `${Math.round((materials / unitCost) * 100)}% of the cost` : '',
        lowerBound ? TIER_ESTIMATE : '',
      ]
        .filter(Boolean)
        .join(' · '),
      help: `The server computes it from BOM × colourway recipes, ON SAVING the card: edits to the BOM, to a colourway recipe or to a material's price do not reach this figure until the card is saved and re-read. It is not set by hand here.${
        lowerBound ? ` ${ESTIMATE_WHY}` : ''
      }`,
      // A Link, not a button: the tab lives in the URL (?tab=), and an anchor survives both the
      // frozen fieldset a RELEASED card is wrapped in and a costing:read-only account.
      lever: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=bom'>bom</Link>
        </Button>
      ),
    },
    {
      key: 'cmt',
      name: 'CMT (labour)',
      amount: cmt,
      aside: impliedPerMinute != null ? `≈ ${impliedPerMinute.toFixed(2)} ${cur}/min` : undefined,
      help: `The factory's quote per garment — the only money figure a person brings in from outside. ${
        impliedPerMinute != null
          ? `At the construction's total SAM of ${totalSam.toFixed(1)} min that is ≈ ${impliedPerMinute.toFixed(2)} ${cur}/min — a derived rate, stored nowhere; check it against the factory's usual rate.`
          : 'The per-minute rate will appear beside it once the construction has operations with a SAM.'
      }`,
      lever: <Lever canWrite={canWriteCosting} name='costing.cmtCost' label='CMT per garment' />,
    },
    {
      key: 'logistics',
      name: 'logistics',
      amount: logistics,
      help: 'Per 1 garment, in the costing currency. Entered by hand: the system has nothing to derive it from.',
      lever: (
        <Lever
          canWrite={canWriteCosting}
          name='costing.logisticsCost'
          label='logistics per garment'
        />
      ),
    },
    {
      key: 'overhead',
      name: 'overhead',
      amount: overhead,
      help: 'Per 1 garment, in the costing currency. Pricing (markup, wholesale, retail) lives on the published product, not here.',
      lever: (
        <Lever
          canWrite={canWriteCosting}
          name='costing.overheadCost'
          label='overhead per garment'
        />
      ),
    },
    {
      key: 'defect',
      name: `defects ${defectPct.toFixed(0)}%`,
      // At a 0% reject rate the residual plug is pure rounding noise (the server rounds unit_cost
      // and materials_per_unit to 2dp independently, so it lands within ±0.005). Printing «0.01»
      // beside «defects 0%» states a cost nobody entered.
      amount: defectPct > 0 ? defectAmount : 0,
      help:
        avgWastage != null
          ? `Only defects in FINISHED garments. Cutting losses are already in the materials: the average cutting wastage across BOM lines is ${avgWastage.toFixed(1)}% (${bomWastages.length} lines with wastage).`
          : 'Only defects in FINISHED garments. Cutting losses are set per line in the BOM (wastage %) and are already built into the materials.',
      lever: (
        <Lever canWrite={canWriteCosting} name='costing.defectPercent' label='defect percent' />
      ),
    },
  ];

  // Waterfall geometry when a retail price exists: the track is the full net retail and each bar
  // sits where the running total lands, so the descent reads as money leaving the price. With no
  // retail there is nothing to descend FROM, so the same rows fall back to plain shares of the unit
  // cost, scaled to the biggest component so the small ones stay visible instead of collapsing to a
  // hairline. (That fallback is also what makes this tab survive a style whose colourways are not
  // priced yet — the levers stay reachable, only the descent is gone.)
  //
  // A narrowed const, not a boolean flag: `descend === true` does not tell the compiler that
  // `retail` is a number, and every geometry expression below would need its own null check.
  const retailScale = retail != null && retail > 0 ? retail : undefined;
  // The verdict names this row as the place to go looking. It used to say «materials» unconditionally,
  // which is right for most garments and actively misleading for the ones where it isn't — a card
  // with CMT 30 and materials 8 sent the operator to the BOM to find 5.58 in the shortest bar.
  const biggestStep = steps.reduce((a, b) => (b.amount > a.amount ? b : a), steps[0]);
  const biggest = biggestStep?.amount ?? 0;
  let running = retailScale ?? 0;
  const stepRows = steps.map((s) => {
    if (retailScale == null) {
      return { ...s, left: 0, width: biggest > 0 ? (s.amount / biggest) * 100 : 0 };
    }
    const after = running - s.amount;
    const row = {
      ...s,
      left: Math.max(0, (after / retailScale) * 100),
      width: (s.amount / retailScale) * 100,
    };
    running = after;
    return row;
  });

  // ── PROBLEMS. One counted row instead of up to five stacked full-width callouts; each entry
  // carries the link to the screen where it is actually fixed.
  type Problem = {
    key: string;
    blocking: boolean;
    text: React.ReactNode;
    action?: React.ReactNode;
    detail?: React.ReactNode;
  };
  const problems: Problem[] = [];
  // РЕЦЕПТ НЕ ДАЛ РАСХОДА — и раньше об этом не говорила НИ ОДНА строка экрана.
  //
  // Сервер считает материалы, обходя строки рецепта колорвея (dto colorwayCost). Строка, привязанная
  // к детали кроя (`IsPieceMaterialAssignment`), пропускается ЦЕЛИКОМ и НЕ поднимает has_unpriced:
  // по решению владельца (T8) она отвечает только «из какой ткани кроится деталь» и нормы не несёт.
  // Колорвей, у которого заполнены ТОЛЬКО такие строки, для расчёта — пустой рецепт: материалов 0,
  // ни одной проблемы, вердикт «заполните BOM» на полностью заполненном BOM. Ровно в эту стену
  // упёрся владелец на карточке 38, где девять деталей назначены на ткань с ценой.
  //
  // Признак выводится из уже пришедших чисел, без второго запроса за рецептами: материалов НОЛЬ при
  // непустом BOM и БЕЗ флага has_unpriced означает, что ни одна строка не дала числа и ни одна не
  // была отброшена из-за цены — то есть считать было нечего.
  //
  // Валютная неполнота ИСКЛЮЧЕНА из признака: строка в чужой валюте тоже не попадает в
  // materials_per_unit, но у неё своя проблема ниже и свой ответ («нет курса»), и списать её на
  // пустой рецепт значило бы отправить человека заводить строку, которая уже заведена.
  const bomHasLines = bomLines.length > 0;
  const noColorways = storedColorways.length === 0;
  const recipeGaveNothing =
    bomHasLines && materials === 0 && !rollup?.hasUnpriced && !rollup?.hasUnconvertedCurrencies;

  // ВТОРАЯ ПОЛОВИНА ТОЙ ЖЕ ПРАВДЫ: слот с деталями кроя МОЖЕТ получить цену без строки «на изделие».
  //
  // Сервер считает такому слоту ОЦЕНКУ СНИЗУ — площадь деталей ÷ раскройную ширину (Ф1, ступень 0),
  // — но только если площади деталей замерены. Замер живёт исключительно в браузере (DXF сервер не
  // читает) и до сих пор ехал на сервер лишь попутно, при применении нормы «по выкройкам». То есть
  // экран, говоря «нет строк расхода на изделие», называл ровно половину: вторая половина — «и
  // площади не замерены, поэтому оценить нечем», а лечится она на вкладке выкроек.
  //
  // ПОЧЕМУ УСЛОВИЕ ИМЕННО ТАКОЕ. Про рецепты эта вкладка ничего не знает (они читаются отдельным RPC
  // по колорвею), поэтому «детали назначены на ткань» здесь непроверяемо напрямую. Зато
  // `recipeGaveNothing` — это состояние, в котором рецепт НЕ ДАЛ НИ ОДНОГО ЧИСЛА при заполненном
  // BOM, то есть ровно то, ради чего оценка и существует. Без этой оговорки строка загоралась бы на
  // любой здоровой карточке с выкройками и нормальными нормами — то есть требовала бы замерить
  // площади, которые никому не нужны.
  //
  // `hasEstimate` — СТОП-СЛОВО СЕРВЕРА: он уже посчитал часть слотов оценкой, значит площади есть и
  // работают, и звать замерять их было бы неправдой.
  //
  // Карточка БЕЗ КОЛОРВЕЕВ исключена: оценка считается по слоту рецепта, а рецепт живёт на
  // колорвее — мерить площади там нечего оценивать, и строка звала бы делать вторую работу вместо
  // первой. Про «детали слоту назначены» здесь утверждать нечем, поэтому текст ниже называет это
  // УСЛОВИЕМ оценки, а не свершившимся фактом.
  const unmeasuredCloth = useMemo(() => {
    // ГЕЙТ ПО СВЯЗЯМ БЛОК→ДЕТАЛЬ. Оценка живёт на деталях, а деталь попадает в площадь только через
    // связь с блоком чертежа — эти связи клиенту ВИДНЫ (тот же список читает очередь раскроя), и
    // без них замер отвечает «к этой ткани не привязана ни одна деталь». Без гейта вердикт звал на
    // вкладку выкроек, где открытый по его совету диалог сразу отказывал: совет, который сам себя и
    // опровергает.
    //
    // Гейт НЕ доказывает, что деталь назначена слоту в рецепте (про рецепт эта вкладка не знает),
    // поэтому текст ниже остаётся условным и оценку не обещает.
    const aliasScopes = new Set(
      (techCard?.techCard?.pieceDxfAliases?.items ?? [])
        .filter((a) => !!(a.blockName ?? '').trim() && !!(a.pieceLineKey ?? '').trim())
        .map((a) =>
          serverScopeKeyOfSheet({ fabricPurpose: a.fabricPurpose, bomLineKey: a.bomLineKey }),
        )
        .filter(Boolean),
    );
    const keys = unmeasuredDxfScopeKeys(
      techCard?.techCard?.patterns,
      techCard?.pieceAreaScopes,
    ).filter((key) => aliasScopes.has(key));
    return keys.map((key) => {
      // Имя скоупа человеку: назначение — своим словом, неразобранная строка — своим названием.
      const byPurpose = bomLines.find((b) => b.purpose && wireFabricPurpose(b.purpose) === key);
      if (byPurpose?.purpose) return bomPurposeLabel(byPurpose.purpose);
      const byLine = bomLines.find((b) => (b.lineKey ?? '') === key);
      return byLine?.name?.trim() || key;
    });
  }, [
    techCard?.techCard?.patterns,
    techCard?.techCard?.pieceDxfAliases,
    techCard?.pieceAreaScopes,
    bomLines,
  ]);
  const areasWouldPrice =
    recipeGaveNothing && !noColorways && !rollup?.hasEstimate && unmeasuredCloth.length > 0;

  if (recipeGaveNothing) {
    problems.push({
      key: 'norecipe',
      blocking: true,
      text: noColorways ? (
        <>
          <b>the card has no colourways — there is nothing to set the consumption on.</b> The recipe
          (which fabric and how much of it goes into the garment) lives on a colourway, so the
          materials count as zero no matter how complete the BOM is.
        </>
      ) : (
        <>
          <b>the colourway recipe gives no consumption — there is not a single “per unit” line.</b>{' '}
          A piece line answers only the question “which fabric is the piece cut from” and carries no
          norm: consumption is a property of the garment. Until a per-unit consumption is named for
          the fabric, the materials count as zero, and the cost below is not understated — it is
          uncomputed.
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=colorways'>to colorways</Link>
        </Button>
      ),
    });
  }
  if (areasWouldPrice) {
    problems.push({
      key: 'noareas',
      // НЕ «блок»: расчёт уже заблокирован строкой выше, и вторая красная строка про ту же дыру
      // считала бы одну поломку дважды. Это второй ВЫХОД из неё, а не вторая причина.
      blocking: false,
      text: (
        <>
          <b>
            the piece areas are not measured — there will be no consumption estimate from the
            patterns.
          </b>{' '}
          A slot can get a price even WITHOUT a “per unit” line: if cut pieces are assigned to it,
          the server computes a lower-bound estimate — piece area ÷ cutting width (netto, without
          the waste between pieces). But the areas have to be measured from the DXF once, and only
          the browser does that. Without a usable measurement (never measured at all, or the
          measurement went stale — files or links changed after it): {unmeasuredCloth.join(', ')}.
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=patterns'>to patterns</Link>
        </Button>
      ),
    });
  }
  if (rollup?.hasUnpriced) {
    problems.push({
      key: 'unpriced',
      blocking: true,
      text: (
        <>
          <b>
            a line without a price — unit cost is understated and is NOT seeded into cost_price.
          </b>{' '}
          There is no price in the BOM or in the catalog, a pin onto an article with a mismatched
          unit of measure, no consumption norm set, or the norm is set per size but not on every
          size of the range — the mean across the range requires a norm on each. Such a line enters
          no currency total, so the figures above look plausible but are understated by a whole
          material.
          {colorwayCosts.some((cc) => cc.hasUnpriced)
            ? ' The offending colourway is marked in the tiles below.'
            : ''}
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=bom'>to the BOM</Link>
        </Button>
      ),
    });
  }
  if (rollup?.hasUnconvertedCurrencies) {
    problems.push({
      key: 'nofx',
      blocking: true,
      text: (
        <>
          <b>some BOM lines are in another currency</b> and did not make it into the
          costing-currency total — the unit cost above is understated. The headline stays in the
          costing currency and still will not include those lines while there is no rate.
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to={ROUTES.settings}>rates</Link>
        </Button>
      ),
    });
  }
  if (draftPreview) {
    problems.push({
      key: 'draft',
      blocking: false,
      text: (
        <>
          <b>draft — save to recompute.</b> unit cost, the margin, break-even and the breakdown are
          computed in the browser from unsaved edits to the cost items. The final figure is computed
          by the server (from the BOM + FX rates), and it is the one that goes into the product's
          cost_price.
        </>
      ),
    });
  }
  if (rejectNoWastage) {
    problems.push({
      key: 'reject',
      blocking: false,
      text: (
        <>
          <b>{`defects ${defectPct.toFixed(0)}% with zero wastage on all ${bomLines.length} BOM lines`}</b>
          {
            ' — it looks like the cutting losses were dumped into the defect rate too. Keeping them apart is more honest: wastage on the material lines, defects only on finished garments.'
          }
        </>
      ),
    });
  }
  if (migrationExceptions.length > 0) {
    problems.push({
      key: 'migration',
      blocking: false,
      text: (
        <>
          <b>money is waiting to be carried into the BOM by hand.</b> The “hardware/packaging → BOM”
          migration could not carry these amounts over automatically. To carry them: a BOM line with
          this amount + a usage on every colourway. The report is historical and does not clean
          itself up.
        </>
      ),
      detail: (
        <div className='mt-1 flex flex-col'>
          {migrationExceptions.map((e, i) => (
            <Text size='micro' variant='label' key={i}>
              {`· ${e.article}: ${e.amount?.value ?? '—'} ${e.currency || ''} — ${
                e.kind === 'not_draft'
                  ? 'the card was released (carry it over at the next re-release)'
                  : e.kind === 'zero_colorways'
                    ? 'no colourways, nowhere to hang a usage'
                    : 'the section already had a priced line (double-count; the BOM won)'
              }`}
            </Text>
          ))}
        </div>
      ),
    });
  }
  const blockingCount = problems.filter((p) => p.blocking).length;
  const warningCount = problems.length - blockingCount;

  // ── THE VERDICT. One figure, one sentence, one control.
  const verdict: {
    figure: string;
    figureLabel: string;
    tone: 'error' | 'warning' | 'note';
    figureTone?: string;
    sentence: React.ReactNode;
    cause?: React.ReactNode;
    action?: React.ReactNode;
  } = !hasCosting
    ? {
        figure: '—',
        figureLabel: 'cost',
        tone: 'note',
        sentence: 'the cost is not computed yet',
        // ВЕРДИКТ ОБЯЗАН НАЗЫВАТЬ БЛИЖАЙШИЙ НЕДОСТАЮЩИЙ ФАКТ, А НЕ ПЕРВЫЙ ПОПАВШИЙСЯ ЭКРАН.
        // «fill in the BOM» на заполненном BOM — не подсказка, а отправка туда, где всё уже
        // сделано: человек проверяет спецификацию, находит её полной и остаётся без следующего шага.
        cause: !bomHasLines
          ? 'fill in the BOM or enter a cost item in the breakdown below — the figures will appear after saving'
          : recipeGaveNothing && noColorways
            ? 'the BOM is filled in, but the card has no colourways — consumption is set in the colourway recipe'
            : recipeGaveNothing
              ? // ВТОРАЯ ПОЛОВИНА ФАКТА — ТУТ ЖЕ. «no per-unit consumption lines» было правдой ровно
                // наполовину с тех пор, как сервер научился считать слот с деталями по ПЛОЩАДИ:
                // выход есть и без такой строки, но он требует замеренных площадей, а их не было
                // ни у одной карточки беты. Оговорка появляется только когда замерить и правда
                // есть что (выкройки в DXF на месте, площадей нет) — иначе она звала бы на вкладку,
                // где делать нечего.
                areasWouldPrice
                ? 'the BOM is filled in, but the colourway recipes have no per-unit consumption lines, and there is no usable measurement of the piece areas — from areas the server computes a lower-bound estimate even without such a line, if pieces are assigned to the slot (the patterns tab)'
                : 'the BOM is filled in, but the colourway recipes have no per-unit consumption lines — consumption is set on the fabric, not on the pieces'
              : 'the BOM lines have no price, or the recipe is not assigned to any colourway — the figures will appear after saving',
        action:
          bomHasLines && recipeGaveNothing ? (
            <Button asChild size='xs' variant='secondary'>
              <Link to='?tab=colorways'>to colorways</Link>
            </Button>
          ) : (
            <Button asChild size='xs' variant='secondary'>
              <Link to='?tab=bom'>fill in the BOM</Link>
            </Button>
          ),
      }
    : currencyDirty
      ? {
          figure: '—',
          figureLabel: `currency → ${cur || '—'}`,
          tone: 'error',
          sentence: 'the costing currency was changed — there is nothing to compute with yet',
          cause:
            'the materials and the per-colourway costs are still in the previous currency: only the server can convert them, at the costing rates. Save the card.',
        }
      : costIncomplete
        ? {
            figure: money(unitCost),
            figureLabel: 'unit cost understated',
            tone: 'error',
            figureTone: 'text-error',
            sentence: "the margin can't be computed from this cost",
            cause:
              'the calculation contains lines without a price or without a rate — they entered no total',
            action: (
              <Button asChild size='xs' variant='secondary'>
                <Link to='?tab=bom'>find the line</Link>
              </Button>
            ),
          }
        : marginPct == null
          ? {
              figure: money(unitCost),
              // Ступень стоит и здесь: маржи в этой ветке нет вовсе, но цифра себестоимости —
              // есть, и правило «ступень у каждой цифры» не знает исключения «зато маржа не
              // посчиталась». Ветка ниже (`lowerBound`) сюда не достаёт по построению: она
              // говорит о марже, а её тут нет.
              figureLabel: lowerBound ? `cost · ${TIER_ESTIMATE}` : 'cost',
              tone: 'note',
              sentence: 'the net margin is not computed',
              cause:
                retailReason ||
                (netted ? 'no retail price' : `no VAT rate for ${vatCountry || 'the country'}`),
            }
          : // ── ОЦЕНКА СНИЗУ ГОВОРИТ ЗА ВСЕ ТРИ МАРЖИНАЛЬНЫЕ ВЕТКИ, И ЭТО НЕ ПЕРЕСТРАХОВКА.
            // Ниже стоят три ветки про цель: «цели нет», «цель выполнена» и «не хватает столько-то».
            // Каждая — утверждение О МАРЖЕ, а маржа, посчитанная от нижней границы, сама является
            // границей ВЕРХНЕЙ. «Цель 50% выполнена» на карточке, где ткань посчитана netto, — это
            // согласование цены по числу, которого на фабрике не бывает.
            //
            // Ветка стоит ПОСЛЕ `marginPct == null`: «нет розничной цены» — другой недостающий факт,
            // и подменять его ступенью значило бы спрятать причину, по которой маржи нет вовсе.
            //
            // НЕДОБОР ПО НИЖНЕЙ ГРАНИЦЕ — ФАКТ, А ПЕРЕВЫПОЛНЕНИЕ — ГИПОТЕЗА, и ветка обязана
            // различать эти два случая, иначе оговорка съедает единственную тревогу, ради которой
            // экран и существует. Если цель не проходит уже на заниженной себестоимости, то на
            // настоящей она не пройдёт тем более: разрыв реален, он лишь ПРЕУМЕНЬШЕН — поэтому
            // цифра остаётся разрывом со словом «минимум», а тон красный. Если же цель проходит,
            // утверждать нечего: настоящая себестоимость выше, и цифрой становится она сама.
            lowerBound
            ? !hasTarget || onTarget || !gapWorthShowing
              ? {
                  figure: money(unitCost),
                  figureLabel: `cost · ${TIER_ESTIMATE}`,
                  tone: 'warning',
                  sentence:
                    `the margin is no higher than ${marginPct.toFixed(1)}%` +
                    (hasTarget ? ` — the ${targetPct.toFixed(0)}% target passes only on it` : ''),
                  cause: ESTIMATE_CTA,
                }
              : {
                  figure: `−${(gap ?? 0).toFixed(2)}`,
                  figureLabel: `short by at least, ${cur || 'per garment'}`,
                  tone: 'error',
                  figureTone: 'text-error',
                  sentence: `the margin is no higher than ${marginPct.toFixed(1)}% against a ${targetPct.toFixed(0)}% target`,
                  cause: `the gap is computed from an UNDERSTATED cost, the real one is bigger. ${ESTIMATE_CTA}`,
                }
            : !hasTarget
              ? {
                  figure: `${marginPct.toFixed(1)}%`,
                  figureLabel: 'net margin',
                  tone: 'note',
                  sentence: `${money(grossMargin ?? 0)} per garment`,
                  cause:
                    "no margin target is set — neither the style's own nor the company default",
                }
              : // Тот же порог полкопейки, что и в ветке оценки выше: недобор, который печатается
                // как «−0.00», это остаток округления, а не дыра в марже, и красная плашка о нём
                // отправляет искать деньги, которых нет.
                onTarget || !gapWorthShowing
                ? {
                    figure: `${marginPct.toFixed(1)}%`,
                    figureLabel: 'net margin',
                    tone: 'note',
                    figureTone: 'text-success',
                    sentence: `the ${targetPct.toFixed(0)}% target is met`,
                    cause: `${money(grossMargin ?? 0)} per garment · ${money(Math.abs(gap ?? 0))} headroom per garment`,
                  }
                : {
                    figure: `−${(gap ?? 0).toFixed(2)}`,
                    figureLabel: `short by, ${cur || 'per garment'}`,
                    tone: 'error',
                    figureTone: 'text-error',
                    sentence: `margin ${marginPct.toFixed(1)}% against a ${targetPct.toFixed(0)}% target`,
                    // Name the row that is ACTUALLY the longest, not the one that usually is.
                    cause:
                      biggestStep && biggestStep.amount > 0 && unitCost > 0
                        ? `the longest bar is ${biggestStep.name}, ${money(biggestStep.amount)} (${Math.round(
                            (biggestStep.amount / unitCost) * 100,
                          )}% of the cost)`
                        : undefined,
                    // ...and only offer the BOM when the BOM is where that row is edited. For a CMT- or
                    // overhead-dominated garment the lever is the input in the breakdown below, and
                    // sending someone to the BOM would be sending them away from it.
                    action:
                      biggestStep?.key === 'materials' ? (
                        <Button asChild size='xs' variant='secondary'>
                          <Link to='?tab=bom'>open the BOM</Link>
                        </Button>
                      ) : undefined,
                  };

  // Партия отвечает своей ценой: снапшот плана и «сегодня по той же формуле». Пусто — сервер
  // называет причину словами (Ф2 BE-3), и показать надо ЕЁ, а не собственную догадку по пустоте.
  const batchCost = batchRun?.plannedUnitCostToday ?? batchRun?.plannedUnitCost;
  const batchReason = batchRun?.plannedCostReason ?? '';

  return (
    <div className='flex flex-col gap-3'>
      {/* ═══ БАЗА РАСЧЁТА (Ф2). Стиль и партия — РАЗНЫЕ вопросы об одной карточке, и экран обязан
          говорить, на какой сейчас отвечает: партия из одних XL, показанная как средняя по ряду,
          выглядит нормально и врёт на всю разницу градации. */}
      {(runs.length > 0 || canPlanRuns) && (
        <CalloutBox tone='note'>
          <div className='flex flex-col gap-2'>
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              <Text size='micro' variant='label' component='span'>
                calculation basis
              </Text>
              {runs.length > 0 && (
                <Button
                  type='button'
                  size='xs'
                  variant={batchRunId === 0 ? 'default' : 'secondary'}
                  onClick={() => {
                    setBatchRunId(0);
                    setComposing(false);
                  }}
                >
                  style · mean across the range
                </Button>
              )}
              {basisRuns.map((r) => (
                <Button
                  key={r.id}
                  type='button'
                  size='xs'
                  variant={batchRunId === r.id ? 'default' : 'secondary'}
                  onClick={() => {
                    setBatchRunId(r.id ?? 0);
                    setComposing(false);
                  }}
                >
                  {`run #${r.id}${r.run?.status ? ` · ${runStatusLabel(r.run.status)}` : ''}`}
                </Button>
              ))}
              {/* СОСТАВИТЬ ПАРТИЮ, НЕ УХОДЯ СО СТРАНИЦЫ. Черновик не занимает ткань и не проходит
                  гейт — это прикидка денег, и заводится она там, где деньги и считают. Аффорданса
                  нет, когда составлять не из чего: у карточки без живых колорвеев с продуктом
                  клетку сетки нечем ключевать (product_id), и об этом сказано строкой ниже —
                  один раз, а не кнопкой, которая молча ничего не делает. */}
              {canPlanRuns && runColorways.length > 0 && (
                // Эта кнопка — ДЕЙСТВИЕ, а не база, и нажатой она поэтому не выглядит никогда:
                // пока черновик не создан, расчёт по-прежнему ведётся по стилю, и «выбранной»
                // обязана читаться именно кнопка стиля. Открытость редактора видна по самому
                // редактору ниже, а закрывает его «отмена» в его заголовке.
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  onClick={() => {
                    setBatchRunId(0);
                    setComposing(true);
                  }}
                >
                  + new run
                </Button>
              )}
              {canPlanRuns && runColorways.length === 0 && (
                <Text size='micro' variant='label' component='span'>
                  the card has no live colourways with a product — there is nothing to compose a run
                  from
                </Text>
              )}
              {batchRunId > 0 && (
                <Text size='micro' component='span'>
                  {batchCost?.value
                    ? `${batchCost.value} ${batchRun?.plannedCurrency || cur} per garment — weighted by THIS run's mix (colourways × sizes), with its pins`
                    : batchReason || "the run's cost is not computed"}
                </Text>
              )}
            </div>

            {/* СОСТАВ. `key` — это и есть сброс состояния редактора: смена базы есть смена
                предмета, а не обновление того же, и набранное для одной партии не должно
                перетечь в другую. Сохранение внутри инвалидирует префикс productionRunKeys.all,
                под которым лежат И список, И detail(id) выбранной партии, — поэтому цифра
                «за изделие» выше пересчитывается сама, без второго вызова отсюда. */}
            {batchRunId > 0 ? (
              batchRun ? (
                <BatchComposition
                  key={batchRunId}
                  techCard={techCard}
                  run={batchRun}
                  canPlan={canPlanRuns}
                />
              ) : (
                <Text size='micro' variant='label'>
                  loading the run's composition…
                </Text>
              )
            ) : composing ? (
              <BatchComposition
                key='new'
                techCard={techCard}
                canPlan={canPlanRuns}
                // Созданный черновик СРАЗУ становится базой: иначе оператор набрал бы партию и
                // остался смотреть на среднюю по ряду — то есть на ответ к другому вопросу.
                onCreated={(id) => {
                  setBatchRunId(id);
                  setComposing(false);
                }}
                onCancel={() => setComposing(false)}
              />
            ) : null}
          </div>
        </CalloutBox>
      )}

      {/* ═══ РАСКРОЙ ПАРТИИ — состав выше превращается в НАБОР РАСКЛАДОК и в измеренный расход.
          Аффорданс появляется только когда база расчёта — партия: раскладывать «стиль вообще»
          нечего, пары (колорвей, размер) называет именно партия.

          ЛЕНИВЫЙ ИМПОРТ ОБЯЗАТЕЛЕН. За этим компонентом стоит весь граф раскладки — dxf-parser,
          clipper2 и воркер, — и статический импорт затащил бы его в главный бандл каждому, кто
          открыл любую страницу админки. Ровно по той же причине лениво грузится модалка раскладки
          из вкладки выкроек.

          ЗА ПРЕДЕЛАМИ `fieldset disabled` НИЖЕ, но НЕ потому, что очередь работает на выпущенной
          карточке: сервер карточных раскладок на неё не принимает, и компонент говорит это прямым
          текстом. Место здесь ради самого текста — под общим fieldset'ом он выглядел бы как
          погашенная кнопка без причины, то есть как поломка. */}
      {batchRunId > 0 && batchRun && techCardId ? (
        <Suspense
          fallback={
            <Text size='micro' variant='label'>
              loading the nesting engine…
            </Text>
          }
        >
          <BatchMarkerQueue
            key={batchRunId}
            techCard={techCard}
            techCardId={techCardId}
            run={batchRun}
            canEdit={canWrite(SECTION.techCards)}
            frozen={frozen}
          />
        </Suspense>
      ) : null}

      {/* ЗАМОРОЗКА РЕЛИЗА НАЧИНАЕТСЯ ЗДЕСЬ, а не выше. Всё, что ниже, — содержимое карточки: статьи,
          цели маржи, заметки; на выпущенной карточке они правке не подлежат, и сервер тот же ответ
          даёт независимо. Блок базы расчёта выше заморозке не подлежит НИКОГДА: партия карточке не
          принадлежит, и планируют её как раз после релиза.

          Классы повторяют внешний контейнер (flex-col gap-3): fieldset встаёт между ним и его
          бывшими детьми, и без этого все промежутки между блоками вкладки схлопнулись бы в один. */}
      <fieldset disabled={frozen} className='m-0 flex min-w-0 flex-col gap-3 border-0 p-0'>
        {/* ═══ ВЕРДИКТ — the gap as a number, its cause, and the way to close it. */}
        <CalloutBox tone={verdict.tone}>
          <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
            <div className='min-w-[110px]'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                {verdict.figureLabel}
              </Text>
              <Text size='statBig' className={verdict.figureTone}>
                {verdict.figure}
              </Text>
            </div>
            <div className='flex min-w-0 flex-1 flex-col items-start gap-1'>
              <Text className='font-bold'>{verdict.sentence}</Text>
              {verdict.cause && (
                <Text size='micro' variant='label'>
                  {verdict.cause}
                </Text>
              )}
              {verdict.action}
            </div>
          </div>
        </CalloutBox>

        {/* State of the CARD, not of the calculation — the calculation's own state is the problem
          list below. Three pills, not six. */}
        <div className='flex flex-wrap items-center gap-1.5'>
          <Pill tone={isReleased ? 'attention' : 'mut'}>{stateLabel}</Pill>
          {cur && <Pill tone='mut'>{cur}</Pill>}
          {/* Ступень — теми же словами, что на полосе себестоимости справа (общий словарь). Полоса
            носит эту пилюлю с Ф6.1, вкладка — нет, и человек, видевший обе, читал два разных
            ответа об одной цифре. */}
          {lowerBound && <Pill tone='attention'>{TIER_ESTIMATE}</Pill>}
          {draftPreview && <Pill tone='attention'>draft</Pill>}
          {/* ОДНА БАЗА НА ЭКРАНЕ. Переключатель вверху меняет базу расчёта, но перерисовать по
            партии сервер сегодня умеет ровно одну цифру — её цену за изделие (planned_unit_cost);
            ни разбивки, ни маржи, ни колорвейного разреза по партии он не отдаёт. Пока это так,
            экран обязан хотя бы СКАЗАТЬ, что всё ниже — про стиль: молчащая подпись при нажатой
            кнопке «run #12» читается как «вот её деньги», а это средняя по размерному ряду,
            которая на партии из одних XL врёт на всю разницу градации. */}
          <Text size='micro' variant='label'>
            {batchRunId > 0
              ? `the calculation basis is run #${batchRunId}, but everything below describes the STYLE: ` +
                "the server returns the run's cost as the single figure above; there is no breakdown or margin by its mix yet. "
              : ''}
            planned cost · per-size norms enter as the MEAN ACROSS THE SIZE RANGE (this is not a run
            forecast — a run plan is computed from its own lines) · recomputed when the card is
            saved
          </Text>
        </div>

        {/* ═══ ПРОБЛЕМЫ — counted, collapsed, each with the link to where it is fixed.
          `<details>`, not a button: a RELEASED card wraps this whole tab in `<fieldset disabled>`,
          which would make a button-driven disclosure unreadable on exactly the cards people read
          most. */}
        {problems.length > 0 && (
          <details className='group'>
            <summary
              className={`flex cursor-pointer list-none items-center gap-2 border px-2.5 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor [&::-webkit-details-marker]:hidden ${
                blockingCount > 0 ? 'border-error' : 'border-warning bg-warning/5'
              }`}
            >
              <Text
                size='micro'
                tracking='label'
                component='span'
                className={`font-bold uppercase ${blockingCount > 0 ? 'text-error' : 'text-warning'}`}
              >
                {blockingCount > 0
                  ? `${blockingCount} ${plural(blockingCount, 'problem')} ${plural(blockingCount, 'blocks', 'block')} the calculation`
                  : `${warningCount} ${plural(warningCount, 'warning')}`}
              </Text>
              {blockingCount > 0 && warningCount > 0 && (
                <Text size='micro' variant='label' component='span'>
                  {`+ ${warningCount} ${plural(warningCount, 'warning')}`}
                </Text>
              )}
              <Text size='micro' variant='label' component='span' className='ml-auto' aria-hidden>
                <span className='group-open:hidden'>▸</span>
                <span className='hidden group-open:inline'>▾</span>
              </Text>
            </summary>
            <div className='flex flex-col border border-t-0 border-borderColor'>
              {problems.map((p) => (
                <div
                  key={p.key}
                  className='flex flex-wrap items-start gap-2 border-b border-hairline px-2.5 py-1.5 last:border-b-0'
                >
                  <Pill tone={p.blocking ? 'warn' : 'attention'}>
                    {p.blocking ? 'blocking' : 'warning'}
                  </Pill>
                  <div className='min-w-[200px] flex-1'>
                    <Text size='micro'>{p.text}</Text>
                    {p.detail}
                  </div>
                  {p.action}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* ═══ ОСЬ ЦЕНЫ — one arithmetic chain, left to right. VAT stops being a footnote and
          becomes the step it actually is. */}
        <GroupLabel flush>{`price → cost → margin${cur ? ` · ${cur}` : ''}`}</GroupLabel>
        {retail != null && showMoney ? (
          <StatGrid min={140}>
            <Stat
              label={
                <span className='inline-flex items-center gap-1'>
                  retail
                  <HelpMark title='retail'>
                    Read from the {cur} price of the linked colourways, and only when they all
                    agree: a disagreement is reported, not averaged. Catalogue prices are
                    VAT-inclusive.
                  </HelpMark>
                </span>
              }
              value={(grossRetail ?? 0).toFixed(2)}
              sub='catalog, with VAT'
            />
            <Stat
              label={netted ? `− VAT ${vatRate.toFixed(0)}% ${vatCountry}` : '− VAT'}
              value={netted ? (netRetail ?? 0).toFixed(2) : '—'}
              sub={
                netted
                  ? 'net — the margin comes off it'
                  : `no rate for ${vatCountry || 'the country'}`
              }
            />
            <Stat
              label={
                <span className='inline-flex items-center gap-1'>
                  − cost
                  <HelpMark title='cost'>
                    The planned unit cost per garment: materials from the BOM + CMT + logistics +
                    overhead, all of it multiplied by the defect percent. VAT is not in it — which
                    is why the margin is computed off the net retail.
                    {lowerBound ? ` ${ESTIMATE_WHY}` : ''}
                  </HelpMark>
                </span>
              }
              value={unitCost.toFixed(2)}
              // Ступень ВЫТЕСНЯЕТ валютную приписку, а не приписывается к ней: «база EUR 41.20» — это
              // где ЕЩЁ живёт та же цифра, а «оценка снизу» — ЧЕМ она является. Второе важнее, и в
              // одну строку `sub` помещается только одно из двух.
              sub={
                lowerBound
                  ? `${TIER_ESTIMATE} — the real one is higher`
                  : usingServerCost && baseCur && !sameCurrency && serverUnitCostBase > 0
                    ? `plan · base ${baseCur} ${serverUnitCostBase.toFixed(2)}`
                    : 'plan, per garment'
              }
            />
            <Stat
              label='= margin'
              // «≤» — ТА ЖЕ ОГОВОРКА, ЧТО СЛОВАМИ В `sub`, но у самой цифры: подпись под ячейкой
              // читают не всегда, а число — всегда. Без знака ячейка утверждала точные «42.00» ровно
              // там, где вердикт двумя блоками выше говорит «не выше».
              value={
                grossMargin != null ? `${lowerBound ? '≤ ' : ''}${grossMargin.toFixed(2)}` : '—'
              }
              // `certifiable`, not just `hasTarget`: a green «up» on a margin the verdict has already
              // called uncomputable is the contradiction this gate exists to prevent.
              tone={
                !certifiable || marginPct == null || !hasTarget
                  ? undefined
                  : onTarget
                    ? 'up'
                    : 'down'
              }
              // «to list price» is the gross-of-VAT margin, and the docstring above promises it stays
              // visible while the house target is re-anchored against net. It used to appear only in
              // the no-target branch — i.e. never on the cards actually being re-anchored.
              sub={
                marginPct == null
                  ? retailReason || 'no net retail'
                  : // «no higher than» — не украшение, а знак неравенства: маржа от нижней границы
                    // себестоимости сама является верхней границей, и число без этой оговорки
                    // читается как достигнутое.
                    `${lowerBound ? 'no higher than ' : ''}${marginPct.toFixed(1)}%${
                      hasTarget ? ` · target ${targetPct.toFixed(0)}%` : ''
                    }${grossMarginPct != null ? ` · to list price ${grossMarginPct.toFixed(1)}%` : ''}`
              }
            />
          </StatGrid>
        ) : (
          <StatGrid min={140}>
            <Stat
              label='cost'
              big
              value={hasCosting && showMoney ? money(unitCost) : '—'}
              sub={
                !showMoney
                  ? `will be recomputed in ${cur} on save`
                  : hasCosting && materials > 0 && unitCost > 0
                    ? `materials ${Math.round((materials / unitCost) * 100)}%`
                    : 'per garment'
              }
            />
            <Stat
              label='margin'
              value='—'
              sub={
                !showMoney ? 'the costing currency was changed' : retailReason || 'no retail price'
              }
            />
          </StatGrid>
        )}

        {/* ═══ РАЗБИВКА — the waterfall IS the breakdown, and the input that moves each step sits on
          that step's row. One picture, not two. */}
        <GroupLabel>
          {!showMoney
            ? 'what it adds up from · the amounts will appear after saving'
            : retailScale != null
              ? `where the ${netted ? 'net retail' : 'retail'} goes · ${money(unitCost)} of cost out of ${money(retailScale)}`
              : `what it adds up from${hasCosting ? ` · ${money(unitCost)} per garment` : ''}`}
        </GroupLabel>
        {retailScale != null && showMoney && (
          <StepRow
            // `retail` falls back to the GROSS price when the destination has no VAT rate on file, so
            // this row must not hardcode «net» — it spent one revision calling a VAT-inclusive
            // number a net one, which is the exact confusion the netting work existed to end.
            name={netted ? 'net retail' : 'retail (with VAT)'}
            left={0}
            width={100}
            value={retailScale.toFixed(2)}
            kind='pos'
            emphasis
          />
        )}
        {stepRows.map((s) => (
          <StepRow
            key={s.key}
            name={s.name}
            aside={s.aside}
            help={s.help}
            left={showMoney ? s.left : 0}
            width={showMoney ? s.width : 0}
            value={showMoney && s.amount > 0 ? `−${s.amount.toFixed(2)}` : '—'}
            kind='neg'
            lever={s.lever}
          />
        ))}
        {retailScale != null && showMoney && grossMargin != null && marginPct != null && (
          <StepRow
            name={hasTarget ? `margin · target ${targetPct.toFixed(0)}%` : 'margin'}
            left={0}
            width={Math.max(0, (grossMargin / retailScale) * 100)}
            // Та же оговорка, что у ячейки маржи выше: полоса водопада — вторая поверхность того же
            // числа, и молчащая здесь она возвращала бы точное утверждение, которое экран только что
            // отозвал.
            value={`${lowerBound ? '≤ ' : ''}${grossMargin.toFixed(2)} · ${marginPct.toFixed(0)}%`}
            // Green only when the figure can actually certify something. On an understated cost the
            // bar goes neutral ink rather than red: «below target» is a claim we cannot make either,
            // and painting it red would be as wrong as painting it green.
            kind={!certifiable ? 'pos' : onTarget || !hasTarget ? 'final' : 'neg'}
            emphasis
          />
        )}
        {!hasCosting && (
          <Text size='micro' variant='label'>
            nothing to break down yet — add materials to the BOM or enter a cost item in the row
            above, and the bars will appear as soon as the first number does.
          </Text>
        )}
        {/* Not on an understated cost: a confident unit count derived from a margin the verdict has
          just refused to certify is the same contradiction as a green bar. */}
        {breakEven.value && certifiable && (
          <Text size='micro' variant='label'>
            {`R&D ${baseCur || cur} ${devTotal.toFixed(2)} pays back at ${breakEven.value} on the PLANNED margin (catalogue retail)`}
            {breakEven.why ? ` — ${breakEven.why}` : ''}
            {
              '. The payback from actual sales is in the R&D section below; these are different questions. '
            }
            {fxIncomplete && (
              <HelpMark title='why it is not computed' label='why'>
                {BREAK_EVEN_NO_FX}
              </HelpMark>
            )}
          </Text>
        )}

        {/* ═══ ПАРАМЕТРЫ — collapsed to the line of assumptions the figures were computed under.
          `<details>` again, so the values stay readable on a frozen card. */}
        <details className='group'>
          <summary className='mt-3 flex cursor-pointer list-none flex-wrap items-center gap-1.5 border-b border-borderColor pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor [&::-webkit-details-marker]:hidden'>
            <Text
              size='micro'
              variant='label'
              tracking='group'
              component='span'
              className='font-bold uppercase'
            >
              calculation parameters
            </Text>
            <Pill tone='mut'>{cur || 'no currency picked'}</Pill>
            <Pill tone='mut'>
              {hasTarget ? `target ${targetPct.toFixed(0)}%` : 'no target set'}
            </Pill>
            <Pill tone='mut'>
              {vatCountry
                ? `market ${vatCountry}${vatRate > 0 ? ` · VAT ${vatRate.toFixed(0)}%` : ' · no VAT'}`
                : 'default market'}
            </Pill>
            {costing.notes ? <Pill tone='mut'>has a note</Pill> : null}
            <Text size='micro' variant='label' component='span' className='ml-auto' aria-hidden>
              <span className='group-open:hidden'>▸</span>
              <span className='hidden group-open:inline'>▾</span>
            </Text>
          </summary>
          <div className='flex flex-col gap-3 pt-2'>
            <fieldset
              disabled={!canWriteCosting}
              className='m-0 grid grid-cols-2 gap-3 border-0 p-0 lg:grid-cols-3'
            >
              <CurrencySelect name='costing.currency' label='costing currency' />
              {/* This style's own target. Left empty it falls back to the house default, which the
                server resolves onto the read — so an empty field is not "no target", it is "the
                usual one". */}
              <DecimalField
                name='costing.targetMarginPct'
                label={`margin target, %${hasTarget && !num(costing.targetMarginPct) ? ` (default ${targetPct.toFixed(0)})` : ''}`}
              />
            </fieldset>
            {/* WHICH MARKET the margin is for. Catalogue prices are VAT-inclusive, so the net retail —
              and therefore the margin — depends entirely on the destination's rate. An empty country
              dictionary hides the control rather than offering an empty select. */}
            {countryItems.length > 0 && (
              <div className='flex flex-wrap items-end gap-3'>
                <div className='flex min-w-56 flex-col gap-1'>
                  <Text size='micro' variant='label' tracking='label' className='uppercase'>
                    market for the margin (VAT)
                  </Text>
                  <MarketPicker
                    value={vatScenarioCountry}
                    items={countryItems}
                    onPick={setVatScenarioCountry}
                  />
                </div>
                <Text size='micro' variant='label' className='min-w-0 flex-1 pb-0.5'>
                  {vatScenarioLoading
                    ? "re-reading the card at this country's rate…"
                    : vatCountry
                      ? vatRate > 0
                        ? `the net retail and the margin are computed at the ${vatRate.toFixed(0)}% ${vatCountry} rate${vatScenarioCountry ? '' : " — the company's domestic rate"}.`
                        : `there is no VAT rate for ${vatCountry} — nothing is deducted, and the margin comes out “against the list price”.`
                      : "the company's domestic rate. Pick a destination to see the margin that market leaves."}
                </Text>
              </div>
            )}
            <fieldset disabled={!canWriteCosting} className='m-0 border-0 p-0'>
              <TextareaField name='costing.notes' label='notes' rows={2} maxLength={2000} />
            </fieldset>
          </div>
        </details>

        {/* ═══ КОЛОРВЕИ — a set of tiles, because the question is "which one is dearer and why",
          and a three-column table answered it only in the reader's head. */}
        {colorwayCosts.length > 0 && (
          <>
            <GroupLabel>by colourway</GroupLabel>
            <Tiles min={170}>
              {colorwayCosts.map((cc, i) => {
                const ccUnit = num(decimalToInput(cc.unitCost));
                const ccMaterials = num(decimalToInput(cc.materialsPerUnit));
                const broken = !!cc.hasUnpriced || !!cc.hasUnconvertedCurrencies;
                // Per-colourway margin needs THIS colourway's own net price, not the style's — two
                // colourways of one style can be priced differently. The base row (colorwayId 0) is
                // not tied to a colourway, so it falls back to the style-level agreed retail.
                const cw = colorwayOf(cc.colorwayId);
                const ccNet = cc.colorwayId
                  ? parseDecimalNumber(
                      (cw?.netPrices ?? []).find((p) => p.currency === cur)?.price?.value,
                    )
                  : netRetail;
                const ccMarginPct =
                  !broken && ccNet != null && Number.isFinite(ccNet) && ccNet > 0 && ccUnit > 0
                    ? ((ccNet - ccUnit) / ccNet) * 100
                    : undefined;
                // Δ against the style's own plan unit cost — the number people actually compare.
                // Measured against the SERVER's figure, not the live preview: `cc.unitCost` is a
                // server rollup, and subtracting a browser-side draft from it made every tile's delta
                // twitch while someone typed a CMT quote that had not reached the server yet.
                // Ступень ЭТОГО колорвея. Она своя у каждого: детали на ткань назначает его рецепт,
                // поэтому один цвет может считаться нормой, а соседний — оценкой снизу.
                const ccLowerBound = !!cc.hasEstimate;
                // РАЗНЫЕ СТУПЕНИ НЕ ВЫЧИТАЮТСЯ. Корень rollup'а — ОСНОВНОЙ колорвей; если он посчитан
                // нормой, а этот оценкой (или наоборот), разность содержит не разницу между цветами, а
                // разницу между способами счёта: «дешевле на 4.10» читалось бы как экономия ткани там,
                // где у одного из двух просто нет выпадов в числе.
                // ДВЕ ОЦЕНКИ ВЫЧИТАТЬ ТОЖЕ НЕЛЬЗЯ, хотя ступень у них одна. Первая редакция этой
                // правки гасила дельту только при РАЗНЫХ ступенях — на том основании, что одинаковые
                // сравнимы. Это неверно: каждая оценка прячет СВОЙ, неизвестный объём выпадов.
                // Оценки 80 и 90 при скрытых выпадах 30 и 10 дают настоящие 110 и 100 — знак
                // фактической разницы ОБРАТНЫЙ показанному, а плитка красит его уверенным цветом.
                //
                // `costIncomplete` — про вторую сторону вычитания: `broken` проверяет только саму
                // плитку, поэтому здоровый колорвей продолжал показывать «−4.10 к плану стиля», где
                // «план стиля» — это корень, о котором вкладка сверху уже сказала «маржу по этой
                // себестоимости считать нельзя».
                const delta =
                  !broken &&
                  !ccLowerBound &&
                  !rollup?.hasEstimate &&
                  !costIncomplete &&
                  ccUnit > 0 &&
                  serverUnitCost > 0
                    ? ccUnit - serverUnitCost
                    : undefined;
                const swatch = colorwaySwatch(cc.colorwayId);
                return (
                  <Tile key={cc.colorwayId || `base-${i}`} tone={broken ? 'error' : 'default'}>
                    <div className='flex items-center gap-1.5'>
                      {swatch && (
                        <span
                          aria-hidden
                          className='inline-block size-[9px] shrink-0 border border-borderColor'
                          style={{ background: swatch }}
                        />
                      )}
                      <Text size='micro' component='span' className='truncate font-bold uppercase'>
                        {colorwayLabel(cc.colorwayId)}
                      </Text>
                      {cc.colorwayId === 0 && <Pill tone='mut'>base</Pill>}
                      {ccLowerBound && <Pill tone='attention'>{TIER_ESTIMATE}</Pill>}
                    </div>
                    {/* Same withholding as the axis above: these are server rollups denominated in
                      the SAVED currency, so mid-switch they must not be printed under the new one. */}
                    <Text
                      size='stat'
                      className={broken || !showMoney ? 'text-labelColor' : undefined}
                    >
                      {showMoney && ccUnit > 0 ? ccUnit.toFixed(2) : '—'}
                    </Text>
                    <Text size='micro' variant='label'>
                      {!showMoney
                        ? `will be recomputed in ${cur} on save`
                        : `materials ${ccMaterials > 0 ? ccMaterials.toFixed(2) : '—'}${
                            ccMarginPct != null
                              ? ` · margin ${ccLowerBound ? 'no higher than ' : ''}${ccMarginPct.toFixed(1)}%`
                              : ''
                          }`}
                    </Text>
                    {showMoney && delta != null && Math.abs(delta) >= 0.005 && (
                      <Text
                        size='micro'
                        component='span'
                        className={delta > 0 ? 'text-error' : 'text-success'}
                      >
                        {`${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)} vs the style plan`}
                      </Text>
                    )}
                    <div className='mt-1'>
                      {/* No `currency` here on purpose. `hasUnconvertedCurrencies` means some BOM line
                        is in a currency that has NO rate — which is never the costing currency, the
                        one every other figure on this tile is already in. Passing `cur` made the
                        pill read «нет курса EUR» and sent people to add the one rate that exists.
                        The rollup does not say which currency offended, so the honest pill is the
                        bare «нет курса». */}
                      <LineProblems
                        noPrice={!!cc.hasUnpriced}
                        noFxRate={!!cc.hasUnconvertedCurrencies}
                      />
                    </div>
                  </Tile>
                );
              })}
            </Tiles>
          </>
        )}

        {/* Reprice: the one write this band owns. Server-side, frozen only for RELEASED cards,
          catalog-linked lines only. */}
        {canWriteCosting && !isReleased && catalogLinkedLines > 0 && (
          <div className='flex flex-wrap items-center gap-3'>
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={reprice.isPending}
              onClick={onReprice}
            >
              {reprice.isPending ? 'refreshing prices…' : 'refresh prices from the catalog'}
            </Button>
            <Text size='micro' variant='label' className='min-w-0 flex-1'>
              {`will overwrite the unit price on ${catalogLinkedLines} catalog-linked BOM lines and mark their source as “catalog”; a signed MATERIALS sign-off will become stale.`}
            </Text>
          </div>
        )}

        {/* ═══ ДОКАЗАТЕЛЬСТВА — one click away, never in the way. */}
        <details className='group'>
          <summary className='mt-3 flex cursor-pointer list-none items-baseline gap-2 border-b border-borderColor pb-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor [&::-webkit-details-marker]:hidden'>
            <Text
              size='micro'
              variant='label'
              tracking='group'
              component='span'
              className='font-bold uppercase'
            >
              materials line by line
            </Text>
            <Text size='micro' variant='label' component='span'>
              markers · totals by currency · rates
            </Text>
            <Text size='micro' variant='label' component='span' className='ml-auto' aria-hidden>
              <span className='group-open:hidden'>▸</span>
              <span className='hidden group-open:inline'>▾</span>
            </Text>
          </summary>
          <div className='flex flex-col gap-2 pt-2'>
            {/* Ф4: measured fabric consumption from saved раскладки, beside what the recipes say.
              Display-only — the write path is the recipe editor's «применить…». */}
            <MarkerConsumptionBand techCard={techCard} />
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
                no materials yet — fill in the BOM and the colourway recipes, and the amounts will
                be computed on save. The source and date of every price are visible in the estimate
                below.
              </Text>
            )}
            <Text size='micro' variant='label'>
              BOM lines in other currencies are folded into the base one
              {rollup?.baseCurrency ? ` (${rollup.baseCurrency})` : ''} at the shared costing rates
              — the same ones that seed the product's cost_price.{' '}
              <Link to={ROUTES.settings} className='underline hover:text-textColor'>
                Rates in settings
              </Link>
              . This is the style plan (its base colourway), not the saved cost_price of each
              product; line-by-line precision is in the estimate below. R&D is in the base currency
              and is not part of the unit cost.
            </Text>
          </div>
        </details>
      </fieldset>
    </div>
  );
}

/**
 * Which market's VAT rate the margin is read at.
 *
 * NOT a `Select`. Radix renders its trigger as a real `<button>`, and this whole tab lives inside
 * the `<fieldset disabled>` that a RELEASED card is wrapped in — so the shared Select was the one
 * control on the rebuilt tab that went dead exactly where it is most wanted: reading a frozen,
 * shipped card's margin for another destination is a pure GET, and it was refusing to open.
 *
 * Everything here is spans, for the same reason `HelpMark` is. No filter box either — an `<input>`
 * would be disabled by that fieldset just like the button was, and a search field that silently
 * stops accepting text is worse than a list you scroll. (The list is the same length the Select
 * offered, and the popover scrolls at 50vh.)
 */
function MarketPicker({
  value,
  items,
  onPick,
}: {
  value: string;
  items: { value: string; label: string }[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // DOMESTIC is a sentinel, not '': '' is "the page's own read", i.e. the company's domestic rate.
  const all = [{ value: DOMESTIC, label: 'default (domestic)' }, ...items];
  const current = all.find((i) => i.value === (value || DOMESTIC));
  const key = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };
  const focus =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      title='market for the margin'
      triggerProps={{ asChild: true }}
      openElement={
        <span
          role='button'
          tabIndex={0}
          aria-haspopup='listbox'
          aria-expanded={open}
          onKeyDown={key(() => setOpen(!open))}
          className={`flex h-[22px] w-full cursor-pointer items-center justify-between gap-2 border border-borderColor bg-bgColor px-1.5 hover:border-textColor ${focus}`}
        >
          <span className='min-w-0 truncate'>{current?.label}</span>
          <span aria-hidden className='shrink-0 text-labelColor'>
            ▾
          </span>
        </span>
      }
    >
      <div role='listbox' className='flex flex-col'>
        {all.map((i) => {
          const selected = i.value === (value || DOMESTIC);
          const pick = () => {
            onPick(i.value === DOMESTIC ? '' : i.value);
            setOpen(false);
          };
          return (
            <span
              key={i.value}
              role='option'
              aria-selected={selected}
              tabIndex={0}
              onClick={pick}
              onKeyDown={key(pick)}
              className={`cursor-pointer truncate px-1 py-0.5 hover:bg-bgSecondary ${selected ? 'font-bold' : ''} ${focus}`}
            >
              {i.label}
            </span>
          );
        })}
      </div>
    </GenericPopover>
  );
}

/** English count agreement — 1 problem / 2 problems. */
function plural(n: number, one: string, many = `${one}s`) {
  return n === 1 ? one : many;
}

/**
 * One row of the breakdown: name, the bar showing where the money leaves, the amount — and the
 * control that changes it, on the SAME line.
 *
 * Not `WaterfallRow`: that primitive is `grid-cols-[150px_1fr_90px]` with no room for a control,
 * and this row's whole point is that the lever sits where the size is. The lever column is
 * reserved even when a row has no lever, so every column stays aligned down the list.
 */
function StepRow({
  name,
  aside,
  help,
  left,
  width,
  value,
  kind = 'neg',
  emphasis,
  lever,
}: {
  name: React.ReactNode;
  /** Small derived note under the name — an implied rate, a share. Never a number you can type. */
  aside?: string;
  help?: React.ReactNode;
  /** 0–100, left edge of the bar. */
  left: number;
  /** 0–100, bar width. */
  width: number;
  value: React.ReactNode;
  kind?: 'pos' | 'neg' | 'final';
  emphasis?: boolean;
  lever?: React.ReactNode;
}) {
  const fill = kind === 'neg' ? 'bg-error/55' : kind === 'final' ? 'bg-success' : 'bg-textColor';
  const valueTone = kind === 'neg' ? 'text-error' : kind === 'final' ? 'text-success' : '';
  return (
    <div className='grid grid-cols-[minmax(110px,170px)_1fr_auto] items-center gap-2 border-b border-hairline py-1 last:border-b-0'>
      <span className='min-w-0'>
        <span className={`flex items-center gap-1 ${emphasis ? 'font-bold' : ''}`}>
          <span className='truncate'>{name}</span>
          {help && <HelpMark title={typeof name === 'string' ? name : 'row'}>{help}</HelpMark>}
        </span>
        {aside && (
          <Text size='nano' variant='label' component='span' className='block truncate'>
            {aside}
          </Text>
        )}
      </span>
      <span className='relative block h-[13px] bg-trackBg'>
        <span
          className={`absolute top-0 h-[13px] ${fill}`}
          style={{ left: `${left}%`, width: `${Math.max(0, Math.min(100, width))}%` }}
        />
      </span>
      {/* div, not span: `lever` is a `<fieldset>` (the per-field write gate), and a fieldset is
          flow content — it cannot legally sit inside phrasing content. */}
      <div className='flex items-center justify-end gap-2'>
        <span className={`w-[100px] shrink-0 text-right tabular-nums ${valueTone}`}>{value}</span>
        <div className='w-[96px] shrink-0'>{lever}</div>
      </div>
    </div>
  );
}

/**
 * One editable cost component. The write gate lives on the FIELD, not around the list of rows: a
 * `<fieldset disabled>` wrapping the whole band would also disable the materials row's link into
 * the BOM, which is a read action a costing:read account is entitled to.
 */
function Lever({ canWrite, name, label }: { canWrite: boolean; name: string; label: string }) {
  return (
    <fieldset disabled={!canWrite} className='m-0 border-0 p-0'>
      <DecimalField name={name} label={label} srLabel />
    </fieldset>
  );
}
