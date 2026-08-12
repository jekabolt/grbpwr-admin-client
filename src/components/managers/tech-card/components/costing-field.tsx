import { common_ColorwayPrice, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { runStatusLabel } from 'components/managers/production-runs/components/options';
import { runColorwayRows } from 'components/managers/production-runs/components/run-composition';
import { useProductionRun, useProductionRuns } from 'components/managers/production-runs/components/useProductionRuns';
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
import { HelpMark, LineProblems } from './costing-vocab';
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

const BREAK_EVEN_NO_FX =
  'R&D учитывается в базовой валюте, а маржа выше — в валюте костинга. Пересчитать нечем: ' +
  'нужна нетто-розница в базовой валюте и серверный unit_cost_base (он появляется, когда для ' +
  'всех валют BOM есть курс). Делить базовую сумму на маржу в другой валюте нельзя.';

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

  if (!currency) return { gross: undefined, net: undefined, reason: 'не выбрана валюта костинга' };
  if (colorways.length === 0)
    return { gross: undefined, net: undefined, reason: 'нет колорвеев, не из чего читать цену' };

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
    return { gross: undefined, net: undefined, reason: `нет ${currency}-цены у колорвеев` };
  if (gross.distinct.length > 1)
    return {
      gross: undefined,
      net: undefined,
      reason: `колорвеи расходятся в цене (${gross.distinct.join(' / ')} ${currency})`,
    };
  // A NET disagreement is its own fact and must not be reported as a missing VAT rate. Gross can
  // agree while net does not — two colourways sold into two rates — and the old code let `net.value`
  // fall to undefined with an empty reason, so the tab blamed the country dictionary for a
  // disagreement between the prices themselves.
  if (net.distinct.length > 1)
    return {
      gross: gross.value,
      net: undefined,
      reason: `колорвеи расходятся в нетто-цене (${net.distinct.join(' / ')} ${currency})`,
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
 *  • PRICE AXIS — розница → −VAT → −себестоимость → =маржа as four cells of ONE arithmetic chain.
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
    return dc?.name || cw?.colorCode || (id ? `колорвей #${id}` : 'основной');
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
          `цены из каталога: изменено ${changed} из ${lines.length}` +
            (noPrice ? `, без каталожной цены: ${noPrice}` : '') +
            ((r.skippedUnlinked ?? 0) > 0 ? `, без привязки к каталогу: ${r.skippedUnlinked}` : ''),
          'success',
        );
      },
      onError: () => showMessage('не удалось обновить цены из каталога', 'error'),
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
    if (fxIncomplete) return { value: 'н/д', why: 'нет курсов — базовая себестоимость не сошлась' };
    if (sameCurrency) {
      if (grossMargin == null) return { value: 'н/д', why: 'нет нетто-розницы' };
      if (!(grossMargin > 0)) return { value: 'н/д', why: 'маржа не положительна' };
      return { value: `${Math.ceil(devTotal / grossMargin)} шт`, why: '' };
    }
    // Cross-currency: fold both sides through the server's base figures. Each unavailable input
    // has its OWN message — «нет курса» used to stand in for all three, sending people to the FX
    // settings when the actual gap was a missing base-currency price or just unsaved edits.
    if (costingDirty) return { value: 'н/д', why: 'черновик — сохраните для пересчёта' };
    if (!(serverUnitCostBase > 0)) return { value: 'н/д', why: 'нет курса' };
    if (baseRetail.net == null) return { value: 'н/д', why: `нет розницы в ${baseCur}` };
    const marginInBase = baseRetail.net - serverUnitCostBase;
    if (!(marginInBase > 0)) return { value: 'н/д', why: `маржа не положительна (${baseCur})` };
    return { value: `${Math.ceil(devTotal / marginInBase)} шт`, why: baseCur };
  })();

  // ── THE GAP. Target margin t on net retail R means a unit cost of at most R×(1−t), so the gap is
  // what the current cost exceeds that by. Stated in the costing currency, like the cost it is
  // measured against.
  const targetUnitCost =
    marginBase != null && hasTarget ? marginBase * (1 - targetPct / 100) : undefined;
  const gap = targetUnitCost != null ? unitCost - targetUnitCost : undefined;
  // A cost the server itself calls incomplete (an uncostable BOM line, a currency with no rate) is
  // understated by an unknown amount, so a margin computed from it cannot certify anything.
  const costIncomplete = !!rollup?.hasUnpriced || !!rollup?.hasUnconvertedCurrencies;
  // ...and every GREEN thing on the tab has to consult that, not just the verdict sentence. Without
  // this gate the panel said «маржу по этой себестоимости считать нельзя» while, two blocks down,
  // the margin cell rendered `tone='up'`, the closing waterfall bar rendered green, and the
  // break-even footnote quoted a confident unit count — all from the same understated cost. A
  // pending currency switch is the same class of "the money on screen is not comparable yet".
  const certifiable = hasCosting && !costIncomplete && !currencyDirty;
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
      name: 'материалы',
      amount: materials,
      aside:
        unitCost > 0 ? `${Math.round((materials / unitCost) * 100)}% себестоимости` : undefined,
      help: 'Считает сервер из BOM × рецептов колорвеев, ПРИ СОХРАНЕНИИ карты: правки BOM, рецепта колорвея или цены материала не попадают в эту цифру, пока карта не сохранена и перечитана. Руками здесь не задаётся.',
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
      name: 'CMT (работа)',
      amount: cmt,
      aside: impliedPerMinute != null ? `≈ ${impliedPerMinute.toFixed(2)} ${cur}/мин` : undefined,
      help: `Квота фабрики за изделие — единственная money-цифра, которую человек приносит извне. ${
        impliedPerMinute != null
          ? `При общем SAM конструктива ${totalSam.toFixed(1)} мин это ≈ ${impliedPerMinute.toFixed(2)} ${cur}/мин — производная ставка, нигде не хранится; сверьте с обычной ставкой фабрики.`
          : 'Ставка за минуту появится рядом, когда в конструктиве будут операции с SAM.'
      }`,
      lever: <Lever canWrite={canWriteCosting} name='costing.cmtCost' label='CMT за изделие' />,
    },
    {
      key: 'logistics',
      name: 'логистика',
      amount: logistics,
      help: 'За 1 изделие, в валюте костинга. Вводится вручную: вывести её системе не из чего.',
      lever: (
        <Lever
          canWrite={canWriteCosting}
          name='costing.logisticsCost'
          label='логистика за изделие'
        />
      ),
    },
    {
      key: 'overhead',
      name: 'overhead',
      amount: overhead,
      help: 'За 1 изделие, в валюте костинга. Ценообразование (наценка, опт, розница) живёт на опубликованном продукте, не здесь.',
      lever: (
        <Lever canWrite={canWriteCosting} name='costing.overheadCost' label='overhead за изделие' />
      ),
    },
    {
      key: 'defect',
      name: `брак ${defectPct.toFixed(0)}%`,
      // At a 0% reject rate the residual plug is pure rounding noise (the server rounds unit_cost
      // and materials_per_unit to 2dp independently, so it lands within ±0.005). Printing «0.01»
      // beside «брак 0%» states a cost nobody entered.
      amount: defectPct > 0 ? defectAmount : 0,
      help:
        avgWastage != null
          ? `Только брак ГОТОВЫХ изделий. Кроёные потери уже в материалах: средний cutting wastage по BOM-строкам ${avgWastage.toFixed(1)}% (${bomWastages.length} строк с wastage).`
          : 'Только брак ГОТОВЫХ изделий. Потери кроя задаются per-строчно в BOM (wastage %) и уже заложены в материалы.',
      lever: (
        <Lever canWrite={canWriteCosting} name='costing.defectPercent' label='процент брака' />
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
  // The verdict names this row as the place to go looking. It used to say «материалы» unconditionally,
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
          <b>у карточки нет колорвеев — расход задавать не на чем.</b> Рецепт (какая ткань и сколько
          её идёт на изделие) живёт на колорвее, поэтому материалы считаются нулевыми независимо от
          того, насколько полон BOM.
        </>
      ) : (
        <>
          <b>рецепт колорвея не даёт расхода — нет ни одной строки «на изделие».</b> Строка детали
          отвечает только на вопрос «из какой ткани кроится деталь» и нормы не несёт: расход — это
          свойство изделия. Пока у ткани не назван расход на изделие, материалы считаются нулевыми,
          и себестоимость ниже — не заниженная, а несчитанная.
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=colorways'>к колорвеям</Link>
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
          <b>площади деталей не замерены — оценки расхода по выкройкам не будет.</b> Слот умеет
          получить цену и БЕЗ строки «на изделие»: если ему назначены детали кроя, сервер считает
          оценку снизу — площадь деталей ÷ раскройную ширину (netto, без межлекальных выпадов). Но
          площади нужно один раз замерить по DXF, и делает это только браузер. Без годного замера
          (не мерили вовсе либо замер устарел — файлы или связи менялись после него):{' '}
          {unmeasuredCloth.join(', ')}.
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=patterns'>к выкройкам</Link>
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
          <b>строка без цены — unit cost занижен и НЕ сеется в cost_price.</b> Нет цены в BOM или в
          каталоге, пин на артикул с несовпадающей единицей измерения, не задана норма расхода, либо
          норма задана по размерам не на всех размерах ряда — среднее по ряду требует нормы на
          каждом. Такая строка не попадает ни в один валютный итог, поэтому цифры выше выглядят
          правдоподобно, но занижены на целый материал.
          {colorwayCosts.some((cc) => cc.hasUnpriced)
            ? ' Проблемный колорвей отмечен в плитках ниже.'
            : ''}
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to='?tab=bom'>к BOM</Link>
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
          <b>часть строк BOM в другой валюте</b> и не попала в итог валюты костинга — unit cost выше
          занижен. Заголовок останется в валюте костинга и этих строк всё равно не включит, пока нет
          курса.
        </>
      ),
      action: (
        <Button asChild size='xs' variant='secondary'>
          <Link to={ROUTES.settings}>курсы</Link>
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
          <b>черновик — сохраните для пересчёта.</b> unit cost, маржа, break-even и разбивка
          посчитаны в браузере по несохранённым правкам статей. Итоговую цифру считает сервер (из
          BOM + FX-курсов), и именно она уходит в cost_price продукта.
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
          <b>{`брак ${defectPct.toFixed(0)}% при нулевом wastage на всех ${bomLines.length} строках BOM`}</b>
          {
            ' — похоже, в брак свалены и потери кроя. Раздельно честнее: wastage на строках материалов, брак — только на готовые изделия.'
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
          <b>деньги ждут ручного переноса в BOM.</b> Миграция «hardware/packaging → BOM» не смогла
          перенести эти суммы автоматически. Перенос: строка BOM с этой суммой + usage на каждый
          колорвей. Отчёт исторический и не самоочищается.
        </>
      ),
      detail: (
        <div className='mt-1 flex flex-col'>
          {migrationExceptions.map((e, i) => (
            <Text size='micro' variant='label' key={i}>
              {`· ${e.article}: ${e.amount?.value ?? '—'} ${e.currency || ''} — ${
                e.kind === 'not_draft'
                  ? 'карта была released (перенесите при пере-релизе)'
                  : e.kind === 'zero_colorways'
                    ? 'нет колорвеев, некуда повесить usage'
                    : 'в секции уже была строка с ценой (double-count; BOM победил)'
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
        figureLabel: 'себестоимость',
        tone: 'note',
        sentence: 'себестоимость ещё не посчитана',
        // ВЕРДИКТ ОБЯЗАН НАЗЫВАТЬ БЛИЖАЙШИЙ НЕДОСТАЮЩИЙ ФАКТ, А НЕ ПЕРВЫЙ ПОПАВШИЙСЯ ЭКРАН.
        // «Заполните BOM» на заполненном BOM — не подсказка, а отправка туда, где всё уже сделано:
        // человек проверяет спецификацию, находит её полной и остаётся без следующего шага.
        cause: !bomHasLines
          ? 'заполните BOM или впишите статью в разбивке ниже — цифры появятся после сохранения'
          : recipeGaveNothing && noColorways
            ? 'BOM заполнен, но у карточки нет колорвеев — расход задаётся в рецепте колорвея'
            : recipeGaveNothing
              ? // ВТОРАЯ ПОЛОВИНА ФАКТА — ТУТ ЖЕ. «Нет строк расхода на изделие» было правдой ровно
                // наполовину с тех пор, как сервер научился считать слот с деталями по ПЛОЩАДИ:
                // выход есть и без такой строки, но он требует замеренных площадей, а их не было
                // ни у одной карточки беты. Оговорка появляется только когда замерить и правда
                // есть что (выкройки в DXF на месте, площадей нет) — иначе она звала бы на вкладку,
                // где делать нечего.
                areasWouldPrice
                ? 'BOM заполнен, но в рецептах колорвеев нет строк расхода на изделие, а годного замера площадей деталей нет — по площадям сервер считает оценку снизу и без такой строки, если детали назначены слоту (вкладка выкроек)'
                : 'BOM заполнен, но в рецептах колорвеев нет строк расхода на изделие — расход задаётся на ткани, а не на детали'
            : 'у строк BOM нет цены, либо рецепт не назначен ни на один колорвей — цифры появятся после сохранения',
        action:
          bomHasLines && recipeGaveNothing ? (
            <Button asChild size='xs' variant='secondary'>
              <Link to='?tab=colorways'>к колорвеям</Link>
            </Button>
          ) : (
            <Button asChild size='xs' variant='secondary'>
              <Link to='?tab=bom'>заполнить BOM</Link>
            </Button>
          ),
      }
    : currencyDirty
      ? {
          figure: '—',
          figureLabel: `валюта → ${cur || '—'}`,
          tone: 'error',
          sentence: 'валюта костинга изменена — считать пока нечем',
          cause:
            'материалы и себестоимость по колорвеям всё ещё в прежней валюте: пересчитать их может только сервер, по курсам костинга. Сохраните карту.',
        }
      : costIncomplete
        ? {
            figure: money(unitCost),
            figureLabel: 'unit cost занижен',
            tone: 'error',
            figureTone: 'text-error',
            sentence: 'маржу по этой себестоимости считать нельзя',
            cause: 'в расчёте есть строки без цены или без курса — они не вошли ни в один итог',
            action: (
              <Button asChild size='xs' variant='secondary'>
                <Link to='?tab=bom'>найти строку</Link>
              </Button>
            ),
          }
        : marginPct == null
          ? {
              figure: money(unitCost),
              figureLabel: 'себестоимость',
              tone: 'note',
              sentence: 'нетто-маржа не считается',
              cause:
                retailReason ||
                (netted ? 'нет розничной цены' : `нет ставки VAT для ${vatCountry || 'страны'}`),
            }
          : !hasTarget
            ? {
                figure: `${marginPct.toFixed(1)}%`,
                figureLabel: 'маржа нетто',
                tone: 'note',
                sentence: `${money(grossMargin ?? 0)} с изделия`,
                cause: 'цель маржи не задана — ни своя у стиля, ни дефолт компании',
              }
            : onTarget
              ? {
                  figure: `${marginPct.toFixed(1)}%`,
                  figureLabel: 'маржа нетто',
                  tone: 'note',
                  figureTone: 'text-success',
                  sentence: `цель ${targetPct.toFixed(0)}% выполнена`,
                  cause: `${money(grossMargin ?? 0)} с изделия · запас ${money(Math.abs(gap ?? 0))} на изделие`,
                }
              : {
                  figure: `−${(gap ?? 0).toFixed(2)}`,
                  figureLabel: `не хватает, ${cur || 'на изделие'}`,
                  tone: 'error',
                  figureTone: 'text-error',
                  sentence: `маржа ${marginPct.toFixed(1)}% при цели ${targetPct.toFixed(0)}%`,
                  // Name the row that is ACTUALLY the longest, not the one that usually is.
                  cause:
                    biggestStep && biggestStep.amount > 0 && unitCost > 0
                      ? `самая длинная полоса — ${biggestStep.name}, ${money(biggestStep.amount)} (${Math.round(
                          (biggestStep.amount / unitCost) * 100,
                        )}% себестоимости)`
                      : undefined,
                  // ...and only offer the BOM when the BOM is where that row is edited. For a CMT- or
                  // overhead-dominated garment the lever is the input in the breakdown below, and
                  // sending someone to the BOM would be sending them away from it.
                  action:
                    biggestStep?.key === 'materials' ? (
                      <Button asChild size='xs' variant='secondary'>
                        <Link to='?tab=bom'>открыть BOM</Link>
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
                база расчёта
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
                  стиль · средняя по ряду
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
                  {`партия #${r.id}${r.run?.status ? ` · ${runStatusLabel(r.run.status)}` : ''}`}
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
                  + новая партия
                </Button>
              )}
              {canPlanRuns && runColorways.length === 0 && (
                <Text size='micro' variant='label' component='span'>
                  у карточки нет живых колорвеев с продуктом — составлять партию не из чего
                </Text>
              )}
              {batchRunId > 0 && (
                <Text size='micro' component='span'>
                  {batchCost?.value
                    ? `${batchCost.value} ${batchRun?.plannedCurrency || cur} за изделие — взвешенно по миксу ЭТОЙ партии (колорвеи × размеры), с её пинами`
                    : batchReason || 'цена партии не посчитана'}
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
                  загружаем состав партии…
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
              загружаем движок раскладки…
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
        {draftPreview && <Pill tone='attention'>черновик</Pill>}
        <Text size='micro' variant='label'>
          плановая себестоимость · нормы по размерам входят СРЕДНИМ ПО РАЗМЕРНОМУ РЯДУ (это не
          прогноз партии — план партии считается по её линиям) · пересчитывается при сохранении
          карты
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
                ? `${blockingCount} ${plural(blockingCount, 'проблема', 'проблемы', 'проблем')} ${plural(blockingCount, 'блокирует', 'блокируют', 'блокируют')} расчёт`
                : `${warningCount} ${plural(warningCount, 'предупреждение', 'предупреждения', 'предупреждений')}`}
            </Text>
            {blockingCount > 0 && warningCount > 0 && (
              <Text size='micro' variant='label' component='span'>
                {`+ ${warningCount} ${plural(warningCount, 'предупреждение', 'предупреждения', 'предупреждений')}`}
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
                  {p.blocking ? 'блок' : 'внимание'}
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
      <GroupLabel flush>{`цена → себестоимость → маржа${cur ? ` · ${cur}` : ''}`}</GroupLabel>
      {retail != null && showMoney ? (
        <StatGrid min={140}>
          <Stat
            label={
              <span className='inline-flex items-center gap-1'>
                розница
                <HelpMark title='розница'>
                  Читается из {cur}-цены связанных колорвеев и только когда все они согласны:
                  расхождение сообщается, а не усредняется. Каталожные цены VAT-inclusive.
                </HelpMark>
              </span>
            }
            value={(grossRetail ?? 0).toFixed(2)}
            sub='каталог, с VAT'
          />
          <Stat
            label={netted ? `− VAT ${vatRate.toFixed(0)}% ${vatCountry}` : '− VAT'}
            value={netted ? (netRetail ?? 0).toFixed(2) : '—'}
            sub={netted ? 'нетто — от неё маржа' : `нет ставки для ${vatCountry || 'страны'}`}
          />
          <Stat
            label={
              <span className='inline-flex items-center gap-1'>
                − себестоимость
                <HelpMark title='себестоимость'>
                  Плановый unit cost за изделие: материалы из BOM + CMT + логистика + overhead, всё
                  это умножено на процент брака. VAT в него не входит — поэтому маржа и считается от
                  нетто-розницы.
                </HelpMark>
              </span>
            }
            value={unitCost.toFixed(2)}
            sub={
              usingServerCost && baseCur && !sameCurrency && serverUnitCostBase > 0
                ? `план · база ${baseCur} ${serverUnitCostBase.toFixed(2)}`
                : 'план, за изделие'
            }
          />
          <Stat
            label='= маржа'
            value={grossMargin != null ? grossMargin.toFixed(2) : '—'}
            // `certifiable`, not just `hasTarget`: a green «up» on a margin the verdict has already
            // called uncomputable is the contradiction this gate exists to prevent.
            tone={
              !certifiable || marginPct == null || !hasTarget ? undefined : onTarget ? 'up' : 'down'
            }
            // «к списку» is the gross-of-VAT margin, and the docstring above promises it stays
            // visible while the house target is re-anchored against net. It used to appear only in
            // the no-target branch — i.e. never on the cards actually being re-anchored.
            sub={
              marginPct == null
                ? retailReason || 'нет нетто-розницы'
                : `${marginPct.toFixed(1)}%${hasTarget ? ` · цель ${targetPct.toFixed(0)}%` : ''}${
                    grossMarginPct != null ? ` · к списку ${grossMarginPct.toFixed(1)}%` : ''
                  }`
            }
          />
        </StatGrid>
      ) : (
        <StatGrid min={140}>
          <Stat
            label='себестоимость'
            big
            value={hasCosting && showMoney ? money(unitCost) : '—'}
            sub={
              !showMoney
                ? `пересчитается в ${cur} при сохранении`
                : hasCosting && materials > 0 && unitCost > 0
                  ? `материалы ${Math.round((materials / unitCost) * 100)}%`
                  : 'за изделие'
            }
          />
          <Stat
            label='маржа'
            value='—'
            sub={!showMoney ? 'валюта костинга изменена' : retailReason || 'нет розничной цены'}
          />
        </StatGrid>
      )}

      {/* ═══ РАЗБИВКА — the waterfall IS the breakdown, and the input that moves each step sits on
          that step's row. One picture, not two. */}
      <GroupLabel>
        {!showMoney
          ? 'из чего сложилось · суммы появятся после сохранения'
          : retailScale != null
            ? `куда уходит ${netted ? 'нетто-розница' : 'розница'} · ${money(unitCost)} себестоимости из ${money(retailScale)}`
            : `из чего сложилось${hasCosting ? ` · ${money(unitCost)} за изделие` : ''}`}
      </GroupLabel>
      {retailScale != null && showMoney && (
        <StepRow
          // `retail` falls back to the GROSS price when the destination has no VAT rate on file, so
          // this row must not hardcode «нетто» — it spent one revision calling a VAT-inclusive
          // number a net one, which is the exact confusion the netting work existed to end.
          name={netted ? 'розница нетто' : 'розница (с VAT)'}
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
          name={hasTarget ? `маржа · цель ${targetPct.toFixed(0)}%` : 'маржа'}
          left={0}
          width={Math.max(0, (grossMargin / retailScale) * 100)}
          value={`${grossMargin.toFixed(2)} · ${marginPct.toFixed(0)}%`}
          // Green only when the figure can actually certify something. On an understated cost the
          // bar goes neutral ink rather than red: «below target» is a claim we cannot make either,
          // and painting it red would be as wrong as painting it green.
          kind={!certifiable ? 'pos' : onTarget || !hasTarget ? 'final' : 'neg'}
          emphasis
        />
      )}
      {!hasCosting && (
        <Text size='micro' variant='label'>
          пока нечего разбирать — добавьте материалы в BOM или впишите статью в строке выше, и
          полосы появятся, как только появится первое число.
        </Text>
      )}
      {/* Not on an understated cost: a confident unit count derived from a margin the verdict has
          just refused to certify is the same contradiction as a green bar. */}
      {breakEven.value && certifiable && (
        <Text size='micro' variant='label'>
          {`R&D ${baseCur || cur} ${devTotal.toFixed(2)} отобьётся на ${breakEven.value} по ПЛАНОВОЙ марже (каталожная розница)`}
          {breakEven.why ? ` — ${breakEven.why}` : ''}
          {'. Окупаемость по фактическим продажам — в секции R&D ниже; это разные вопросы. '}
          {fxIncomplete && (
            <HelpMark title='почему не считается' label='почему'>
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
            параметры расчёта
          </Text>
          <Pill tone='mut'>{cur || 'валюта не выбрана'}</Pill>
          <Pill tone='mut'>{hasTarget ? `цель ${targetPct.toFixed(0)}%` : 'цель не задана'}</Pill>
          <Pill tone='mut'>
            {vatCountry
              ? `рынок ${vatCountry}${vatRate > 0 ? ` · VAT ${vatRate.toFixed(0)}%` : ' · без VAT'}`
              : 'рынок по умолчанию'}
          </Pill>
          {costing.notes ? <Pill tone='mut'>заметка есть</Pill> : null}
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
            <CurrencySelect name='costing.currency' label='валюта костинга' />
            {/* This style's own target. Left empty it falls back to the house default, which the
                server resolves onto the read — so an empty field is not "no target", it is "the
                usual one". */}
            <DecimalField
              name='costing.targetMarginPct'
              label={`цель маржи, %${hasTarget && !num(costing.targetMarginPct) ? ` (дефолт ${targetPct.toFixed(0)})` : ''}`}
            />
          </fieldset>
          {/* WHICH MARKET the margin is for. Catalogue prices are VAT-inclusive, so the net retail —
              and therefore the margin — depends entirely on the destination's rate. An empty country
              dictionary hides the control rather than offering an empty select. */}
          {countryItems.length > 0 && (
            <div className='flex flex-wrap items-end gap-3'>
              <div className='flex min-w-56 flex-col gap-1'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  рынок для маржи (VAT)
                </Text>
                <MarketPicker
                  value={vatScenarioCountry}
                  items={countryItems}
                  onPick={setVatScenarioCountry}
                />
              </div>
              <Text size='micro' variant='label' className='min-w-0 flex-1 pb-0.5'>
                {vatScenarioLoading
                  ? 'перечитываю карту по ставке этой страны…'
                  : vatCountry
                    ? vatRate > 0
                      ? `нетто-розница и маржа считаются по ставке ${vatRate.toFixed(0)}% ${vatCountry}${vatScenarioCountry ? '' : ' — домашней ставке компании'}.`
                      : `для ${vatCountry} ставки VAT нет — ничего не вычитается, и маржа получается «к списочной цене».`
                    : 'домашняя ставка компании. Выберите направление, чтобы увидеть маржу, которую оставляет этот рынок.'}
              </Text>
            </div>
          )}
          <fieldset disabled={!canWriteCosting} className='m-0 border-0 p-0'>
            <TextareaField name='costing.notes' label='заметки' rows={2} maxLength={2000} />
          </fieldset>
        </div>
      </details>

      {/* ═══ КОЛОРВЕИ — a set of tiles, because the question is "which one is dearer and why",
          and a three-column table answered it only in the reader's head. */}
      {colorwayCosts.length > 0 && (
        <>
          <GroupLabel>по колорвеям</GroupLabel>
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
              const delta =
                !broken && ccUnit > 0 && serverUnitCost > 0 ? ccUnit - serverUnitCost : undefined;
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
                    {cc.colorwayId === 0 && <Pill tone='mut'>основной</Pill>}
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
                      ? `пересчитается в ${cur} при сохранении`
                      : `материалы ${ccMaterials > 0 ? ccMaterials.toFixed(2) : '—'}${
                          ccMarginPct != null ? ` · маржа ${ccMarginPct.toFixed(1)}%` : ''
                        }`}
                  </Text>
                  {showMoney && delta != null && Math.abs(delta) >= 0.005 && (
                    <Text
                      size='micro'
                      component='span'
                      className={delta > 0 ? 'text-error' : 'text-success'}
                    >
                      {`${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)} к плану стиля`}
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
            {reprice.isPending ? 'обновляю цены…' : 'обновить цены из каталога'}
          </Button>
          <Text size='micro' variant='label' className='min-w-0 flex-1'>
            {`перезапишет unit price у ${catalogLinkedLines} привязанных к каталогу строк BOM и пометит их источник «каталог»; подписанный MATERIALS sign-off станет устаревшим.`}
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
            материалы построчно
          </Text>
          <Text size='micro' variant='label' component='span'>
            раскладки · суммы по валютам · курсы
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
                  label={`материалы · ${line.currency || 'без валюты'}`}
                  value={decimalToInput(line.amount) || '—'}
                />
              ))}
            </div>
          )}
          {colorwayCosts.length === 0 && materialsTotal.length === 0 && (
            <Text size='micro' variant='label'>
              материалов пока нет — заполните BOM и рецепты колорвеев, суммы посчитаются при
              сохранении. Источник и дату каждой цены видно в смете ниже.
            </Text>
          )}
          <Text size='micro' variant='label'>
            Строки BOM в других валютах сворачиваются в базовую
            {rollup?.baseCurrency ? ` (${rollup.baseCurrency})` : ''} по общим курсам костинга — они
            же засевают cost_price продукта.{' '}
            <Link to={ROUTES.settings} className='underline hover:text-textColor'>
              Курсы в настройках
            </Link>
            . Здесь план стиля (его основной колорвей), а не сохранённый cost_price каждого
            продукта; построчная точность — в смете ниже. R&D в базовой валюте и в unit cost не
            входит.
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
  const all = [{ value: DOMESTIC, label: 'по умолчанию (домашний)' }, ...items];
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
      title='рынок для маржи'
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

/** Russian count agreement — 1 проблема / 2 проблемы / 5 проблем. */
function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
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
          {help && <HelpMark title={typeof name === 'string' ? name : 'строка'}>{help}</HelpMark>}
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
