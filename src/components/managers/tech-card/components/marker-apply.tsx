// «Из раскладки» — the marker → costing bridge (Ф4, design §3).
//
// Two surfaces, one write path:
// - MarkerApplyHint sits under a recipe usage's consumption editor and APPLIES a marker's
//   measured consumption into the draft via the usage's own onChange — i.e. through the
//   already-staged UpdateColorwayRecipe flow. No parallel write path exists.
// - MarkerConsumptionBand on the costing tab is DISPLAY-ONLY: the measured figure beside
//   what the recipes currently say, with a delta. Applying happens in the recipe editor,
//   where consumption is edited — the band says so.
//
// The two traps the design names are both honoured here:
// №1 usagePerGarmentQty ignores the scalar once size_consumptions is non-empty — so the
//    scalar mode explicitly CLEARS size_consumptions, and the per-size mode is enabled
//    only at FULL size coverage (a marker for every size of the card range).
// №2 wastage_percent grosses on top of measured consumption, which already includes
//    inter-piece waste — the dialog warns and names the number, but never rewrites it.
//
// ЧЕТВЁРТОЕ ПРАВИЛО, И ЭТО ЕДИНСТВЕННОЕ, ЧТО МОЖЕТ ЗАКРЫТЬ ЕГО ДВЕРЬ: НОРМА НЕ БЕРЁТСЯ С
// ЧЕРНОВИКА. Черновик (0299) — раскладка, у которой легла часть деталей: длина у неё короче
// настоящей ровно на то, что заняли бы остальные. Скалярную дверь закрыл сервер сам
// (consumption_per_unit_cm он на черновике не публикует, причина лежит в scalar_apply_refusal), а
// ПЕР-РАЗМЕРНУЮ закрыть может только этот файл: `continueByAreas` считает площади по СЕГОДНЯШНИМ
// выкройкам сам и умножает их на длину настила — то есть все слагаемые нормы у клиента на руках, а
// сервер, получая готовые числа, отличить их от измеренных не может ничем (norm_marker_id при
// нескольких источниках уходит нулём НАМЕРЕННО — см. apply). Поэтому черновик исключается здесь, из
// КАЖДОГО применимого набора, и исключается ВИДИМО: он остаётся в селекторе с названной причиной,
// потому что оператор, только что его посчитавший, будет искать именно его.
//
// Ф3 добавляет третье правило: НОРМА ВЕДЁТ. Из раскладок одной ткани человек назначает
// нормировочную (`is_norm`, отдельный RPC), и `betterMarker` ставит её ПЕРВЫМ ключом — решение
// бьёт эвристики «свой колорвей» и «свежесть». Отсюда же следует главное ограничение (§6.4):
// FK от рецепта к маркеру НЕ СУЩЕСТВУЕТ. Применение КОПИРУЕТ число в usage.consumption, поэтому
// переназначение нормы не пересчитывает ни одной строки рецепта и никогда не пересчитает. Оба
// экрана обязаны сказать это словами — полоса называет расхождение вслух («рецепты не
// пересчитаны»), диалог называет копирование — и ни один не пытается свести их сам: молчаливое
// авто-применение подменило бы решение человека числом, которого он не выбирал.
import { adminService } from 'api/api';
import type {
  common_Material,
  common_TechCard,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { sizeTokensOf } from './nesting/block-code';
import {
  weightBasisLabel,
  weightBasisNote,
  weightBasisOf,
  weightMissingShort,
  weightRefusalText,
  type WeightBasisResolution,
} from './nesting/fabric-weight';
import {
  bomUnitKind,
  compositionLabel,
  compositionOf,
  consumptionCm,
  consumptionForSize,
  decNum,
  betterMarker,
  isDraftMarker,
  isLegacyNorm,
  latestPerSize,
  markerAreaSplitCm2,
  markersForLine,
  markerWasteDecomposition,
  pieceSetChanged,
  refusalWord,
  scalarNormRefusal,
  toBomUnit,
  totalUnitsOf,
} from './nesting/marker-io';
import {
  compositionSummary,
  MarkerAreaSplit,
  MarkerLengthFormula,
  MarkerPerSizeTable,
} from './nesting/marker-length-breakdown';
import {
  canContinue,
  originLabel,
  perSizePlan,
  perSizeRefusal,
  type PerSizePlan,
} from './nesting/per-size-consumption';
import type { TechCardFormData } from './schema';

// ── recipe-side apply ───────────────────────────────────────────────────────────────────

export function MarkerApplyHint({
  markers,
  colorwayId = 0,
  lineKey,
  unit,
  wastagePercent,
  articleWidth,
  weightBasis,
  sizeIds,
  sizeNameById,
  canEdit,
  onApply,
}: {
  markers: common_TechCardMarkerSummary[] | undefined;
  // Колорвей, чей рецепт редактируется. Список уже отфильтрован (свои + общие), но выбирать
  // ЛУЧШИЙ надо тоже с оглядкой на принадлежность, иначе свежий общий маркер перебьёт
  // собственный — см. betterMarker.
  colorwayId?: number;
  lineKey: string;
  unit: string;
  wastagePercent: string;
  // Effective article's CUTTING width in cm (roll − 2×кромка) — the same quantity a marker
  // records in fabricWidthCm, so the two are comparable. '' = unknown.
  articleWidth: string;
  // Основа перевода длины в ВЕС для кг-слота (Ф3): полная ширина рулона × плотность артикула.
  // Резолвится РОДИТЕЛЕМ (weightBasisOf — у него material/slot/pin), сюда приходит готовой,
  // чтобы это место не могло выбрать не те числа.
  weightBasis: WeightBasisResolution;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  onApply: (patch: {
    consumption?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    // Wastage provenance (0261) — always sent with the number so the two can never drift.
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
    // Ф6.8 ШТАМП НОРМЫ: из КАКОЙ раскладки снято это число. Едет тем же патчем, что и провенанс
    // отходов, по той же причине — чтобы «число» и «откуда оно» не могли разъехаться. 0 —
    // явное «штампа нет» (см. provenance).
    normMarkerId?: number;
  }) => void;
}) {
  const lineMarkers = markersForLine(markers, lineKey);
  const [open, setOpen] = useState(false);
  const [markerId, setMarkerId] = useState<number>(0);
  const [mode, setMode] = useState<'scalar' | 'perSize'>('scalar');
  // ПРОДОЛЖЕНИЕ ФОРМУЛЫ НА РАЗМЕРЫ ВНЕ СОСТАВА (Ф2.4). Площади считаются по СЕГОДНЯШНИМ выкройкам,
  // и это мегабайты с CDN плюс разбор в воркере — поэтому только по явному нажатию, никогда само:
  // диалог открывают чаще, чем продолжают, а качать выкройки ради строки, которую и так применят
  // скаляром, значит платить за неё каждый раз.
  const [areas, setAreas] = useState<Map<number, number> | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaError, setAreaError] = useState('');

  // Кг-слот (Ф3): единица и основа веса решаются ОДИН раз на весь диалог — каждое обращение к
  // toBomUnit ниже конвертирует одной и той же основой, иначе превью и запись могли бы разойтись.
  const unitKind = bomUnitKind(unit);
  const fabric = weightBasis.ok ? weightBasis.basis : undefined;

  // Порядок предпочтения — ОДИН на весь файл и живёт в betterMarker: НОРМА → свой колорвей →
  // свежесть (Ф3.4). Назначение нормы — решение человека, принадлежность и дата — эвристики, и
  // решение бьёт эвристику. Список показывается В ЭТОМ ЖЕ порядке (селектор ниже), чтобы «что
  // предложено» и «что первым в списке» не могли разойтись.
  const ranked = useMemo(
    () => [...lineMarkers].sort(betterMarker(colorwayId)),
    [lineMarkers, colorwayId],
  );
  // Лучший ПРИМЕНИМЫЙ маркер, а если применимых нет — просто лучший.
  //
  // С Ф2 у раскладки может не быть скалярной нормы вовсе (смешанный состав — среднее по составу,
  // в рецепт такое не пишется). Брать сюда просто первого по рангу значило бы: одна смешанная
  // раскладка гасит кнопку «применить» на строке, где рядом лежит совершенно годная однородная.
  // Применимость проверяется ПЕРВОЙ, потому что неприменимое число не лучше любого ранга. Но
  // подмену назначенной нормы применимой раскладкой нельзя делать МОЛЧА: о ней говорят пилюля
  // «норма не даёт расхода» на строке и колаут в диалоге (оба через notTheNorm/normRefusal).
  const preferred = useMemo(() => ranked.find((m) => !scalarNormRefusal(m)) ?? ranked[0], [ranked]);
  // Сырьё продолжения: СЕГОДНЯШНИЕ строки выкроек карточки и её BOM (по нему резолвится, какие
  // листы обслуживают ткань этой раскладки — с 0267 лист привязан к НАЗНАЧЕНИЮ, а не к строке).
  // Читаются здесь, потому что форма карточки есть только здесь; сам отбор живёт в marker-rebuild.
  const patternRows = (useWatch<TechCardFormData>({ name: 'patterns' }) ?? []) as Array<{
    url?: string;
    name?: string;
    filename?: string;
    bomLineKey?: string;
    fabricPurpose?: string;
  }>;
  const bomRows = (useWatch<TechCardFormData>({ name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    lineKey?: string;
    purpose?: string;
  }>;
  if (lineMarkers.length === 0 || !preferred) return null;

  const chosen = lineMarkers.find((m) => m.id === markerId) ?? preferred;
  // Назначенная норма линии — величина ОТДЕЛЬНАЯ от выбранного маркера, и путать их нельзя:
  // применяется не всегда она (норма может не выдавать скалярной нормы, а оператор — выбрать
  // другую раскладку руками), и тогда экран обязан назвать, ЧТО именно уйдёт в рецепт.
  const normMarker = lineMarkers.find((m) => m.isNorm === true);
  const normRefusal = normMarker ? scalarNormRefusal(normMarker) : '';
  // consumptionCm сам отказывает на смешанной — арифметики до отказа тут не случается.
  const normCons = normMarker ? consumptionCm(normMarker) : null;
  const normConv = normCons != null ? toBomUnit(normCons, unit, fabric) : null;
  const notTheNorm = normMarker != null && (chosen.id ?? 0) !== (normMarker.id ?? 0);
  // ОТКАЗ ИДЁТ ПЕРЕД АРИФМЕТИКОЙ. Смешанная раскладка не выдаёт расход на изделие: её длина —
  // средняя по составу, и записанная в рецепт она завышает мелкие размеры и занижает крупные —
  // ровно та ошибка, ради устранения которой Ф2 и заводилась. Дальше по коду `chosenCons === null`
  // означает «числа нет», и каждая ветка обязана это пережить, а не подставить ноль.
  const chosenRefusal = scalarNormRefusal(chosen);
  const chosenCons = consumptionCm(chosen);
  const conv = chosenCons != null ? toBomUnit(chosenCons, unit, fabric) : null;
  // НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ — НЕ НОРМА, и в маркерном пути тоже (то же правило, что у dxf-пути:
  // dxfNormValueRows требует value > 0). Метры и килограммы пишутся в тысячных (DECIMAL(10,3)),
  // и крошечная величина честно округляется в 0.000 — записанная строкой «0», она читалась бы
  // как «строка с нормой», которая ничего не требует, и дефицит на прогоне вышел бы нулевым.
  // Проверяется ВЕЗДЕ, где решается применимость и где пишется значение (см. applyPossible,
  // confirmDisabled, apply), в обоих режимах.
  const convZero = conv != null && !(conv.value > 0);
  // ПЛАН ПРИМЕНЕНИЯ ПО РАЗМЕРАМ (Ф2.4). Строка на каждый размер ряда, у каждой — ПРОИСХОЖДЕНИЕ:
  // измерено этой раскладкой, продолжено по площади выкроек, либо среднее по настилу. Раньше
  // здесь стояла карта «размер → однородная раскладка» и всё; теперь одна СМЕШАННАЯ раскладка
  // законно закрывает несколько размеров сразу (latestPerSize её пускает, если она несёт
  // пер-размерные числа), а недостающие размеры добираются продолжением формулы.
  const bySize = latestPerSize(lineMarkers, colorwayId);
  const plan: PerSizePlan = perSizePlan({
    sizeIds,
    bySize,
    continueFrom: chosen,
    clientAreas: areas ?? undefined,
  });
  // Режим вообще имеет смысл, только если хоть один размер нормирован ИЗМЕРЕНИЕМ. План из одних
  // продолжений и средних — это не «применение раскладки», это экстраполяция без опоры.
  const perSizeOffered = plan.rows.some((r) => r.origin === 'marker');
  // Применимость = у КАЖДОГО размера есть число И каждое конвертируется в единицу линии.
  // Гейт единицы держится отдельно от покрытия: без него на линии с «пог.м» кнопка жила, а клик
  // молча не делал ничего — apply() выходил на первом же неконвертируемом размере.
  const perSizeConvs = plan.rows.map((r) =>
    r.consumptionCm != null ? toBomUnit(r.consumptionCm, unit, fabric) : null,
  );
  const perSizeConvertible = plan.complete && perSizeConvs.every((c) => c != null);
  // Ноль после округления гасит применимость и здесь, у ЛЮБОГО размера: ряд пишется целиком или
  // никак, и один «0.000» в нём — та же нулевая норма (см. convZero), только спрятанная в
  // середине таблицы.
  const perSizeZero = perSizeConvertible && perSizeConvs.some((c) => !(c!.value > 0));
  const perSizeApplicable = perSizeConvertible && !perSizeZero;
  // Продолжать имеет смысл, когда есть чем (раскладка публикует площади состава) и есть зачем
  // (какой-то размер ряда остался без числа).
  const continuationOffered =
    canContinue(chosen) && plan.unansweredSizes.length > 0 && plan.continuation !== 'ok';
  // Один предикат «применить возможно» на кнопку и на пояснения — чтобы заметки об отходах не
  // могли рассказывать про норму, которую тот же экран отказался выдавать.
  const applyPossible =
    mode === 'scalar' ? conv != null && !convZero && !chosenRefusal : perSizeApplicable;
  const wastage = parseDecimalNumber(wastagePercent);

  const sizeName = (id?: number) => sizeNameById.get(id ?? 0) ?? `#${id}`;
  const perSizeWhyNot = perSizeRefusal(plan, (id) => sizeName(id));
  const compLabel = (m: common_TechCardMarkerSummary) =>
    compositionLabel(compositionOf(m), (id) => sizeName(id)) || 'состав не читается';
  // Label and number from the same marker — the CHOSEN one (the hint used to number by
  // `chosen` and label by the auto-picked marker, which diverged the moment the selector
  // was touched).
  // Ноль после округления в превью не показывается ЧИСЛОМ: «0 кг» на строке читался бы как
  // норма. Показывается измеренная длина в см — она-то ненулевая, и по ней видно, ЧТО округлилось.
  const preview =
    conv && !convZero
      ? `${conv.value} ${conv.unit}`
      : chosenCons != null
        ? `${chosenCons} см`
        : '—';
  // Отказ по единице. Кг-слот обязан называть, ЧЕГО не хватает — ширины или плотности: «единица
  // не принимает длину» отправила бы оператора менять единицу вместо того, чтобы заполнить
  // артикул. Остальным единицам называется весь словарь, который мы умеем писать. Пустая единица
  // — своя починка на вкладке BOM: единица нормы = единица слота, фолбэка в единицу артикула нет.
  const unitRefusal =
    unitKind === 'kg' && !weightBasis.ok
      ? weightRefusalText(weightBasis.missing, weightBasis.pinned)
      : unit
        ? `единица линии BOM (${unit}) не принимает ни длину, ни вес — применить можно в метрах, сантиметрах или килограммах`
        : 'у линии BOM не заполнена единица — норма пишется в единице слота, и применить её не в чем; заполните единицу на вкладке BOM';
  // ОТКАЗ ПО НУЛЮ — своя причина, и совет разведён по РАЗМЕРНОСТИ единицы: на весовой строке
  // «выберите единицу мельче (см)» превратило бы её в длиновую и разъехалось с закупочной ценой
  // за килограмм (цена и остаток склада живут в единице артикула/строки).
  const zeroRefusal =
    unitKind === 'kg'
      ? `после перевода в «${unit}» норма округляется в ноль — вес на изделие меньше половины грамма. Ноль означал бы «ткань не нужна». Слот весовой: единицу на сантиметры не менять (это сменит размерность строки и разойдётся с закупочной ценой за килограмм) — проверьте плотность и ширину артикула и саму раскладку`
      : `после перевода в «${unit || '—'}» норма округляется в ноль — длина слишком мала для этой единицы. Ноль означал бы «ткань не нужна»; выберите единицу мельче (см) либо проверьте раскладку`;

  // Width honesty (design §1): a marker computed for another width is a different norm. Both
  // sides are CUTTING widths — the article's roll minus its кромка, and the width the layout
  // actually ran on. Comparing the roll against the layout would flag every fabric that has a
  // кромка as a mismatch.
  const artW = parseDecimalNumber(articleWidth);
  const chosenW = decNum(chosen.fabricWidthCm);
  const widthMismatch =
    Number.isFinite(artW) && artW > 0 && chosenW > 0 && Math.abs(artW - chosenW) > 0.5;
  // The markers the per-size mode would actually apply — the card's sizes, not every size that
  // happens to carry a marker (a leftover marker for a size since dropped from the card must
  // not colour a warning, or an average, about what will be written).
  //
  // ИЗ ПЛАНА, а не из карты размеров: с Ф2.4 строка может прийти от продолжения по площадям, и
  // тогда «применённая раскладка» у неё — та, чьей константой продолжали. Собирать этот список
  // мимо плана значило бы предупреждать про ширину и про условия съёмки НЕ ТЕХ раскладок,
  // которые уйдут в рецепт.
  const appliedPerSize = [...new Set(plan.rows.map((r) => r.marker).filter((m) => m != null))];
  const perSizeWidths = appliedPerSize.map((m) => decNum(m!.fabricWidthCm)).filter((w) => w > 0);
  const mixedWidths =
    perSizeWidths.length > 1 && Math.max(...perSizeWidths) - Math.min(...perSizeWidths) > 0.5;
  // Честность ширины И в «по размерам». mixedWidths сравнивает маркеры только МЕЖДУ СОБОЙ, и три
  // одинаково чужих (все на 140 см при артикуле 150) проходили молча — ровно та подмена, от
  // которой скалярный режим защищён widthMismatch'ем строкой выше.
  const perSizeWidthMismatch =
    Number.isFinite(artW) && artW > 0 && perSizeWidths.some((w) => Math.abs(artW - w) > 0.5);

  // ЧЬЮ ДЛИНУ РАЗБИРАЕТ ТАБЛИЦА «ИЗ ЧЕГО СЛОЖИЛАСЬ». Разложение описывает ОДИН настил — его КПД, его
  // ширину, его длину. В «по размерам» числа законно приходят от нескольких раскладок, и показать
  // разложение одной из них значило бы объяснить длину, которой в рецепт не уедет. Поэтому источник
  // обязан быть ровно один; иначе остаётся усреднённая процентная подпись — та же, что была всегда.
  //
  // Раскладка без записанной длины (или без КПД, или без ширины) разложения не даёт вовсе — и это
  // проверяется ЗДЕСЬ, а не внутри таблицы: от ответа зависит, какой из двух текстов показать.
  const splitSource: common_TechCardMarkerSummary | undefined =
    mode === 'scalar'
      ? chosen
      : appliedPerSize.length === 1
        ? appliedPerSize[0] ?? undefined
        : undefined;
  const splitMarker = splitSource && markerAreaSplitCm2(splitSource) ? splitSource : undefined;

  // Scalar-mode spread: a flat norm silently taken from one size understates/overstates the
  // run when sizes diverge — or when the chosen size is not the base sample size.
  //
  // Числа берутся ИЗ ПЛАНА, а не через consumptionCm по маркерам: на смешанной раскладке
  // consumptionCm отказывает (у неё нет одного расхода), и разброс по её размерам — ровно тот
  // самый, ради измерения которого Ф2.4 и заводилась, — считался бы по пустому списку.
  const perSizeCons = plan.rows
    .map((r) => r.consumptionCm)
    .filter((c): c is number => c != null && c > 0);
  const spreadPct =
    perSizeCons.length > 1
      ? ((Math.max(...perSizeCons) - Math.min(...perSizeCons)) / Math.min(...perSizeCons)) * 100
      : 0;
  // Размер, С КОТОРОГО снята единая норма, — из состава, а не из легаси-поля size_id (на маркере
  // с составом сервер шлёт там 0). Вопрос имеет смысл только для однородной раскладки: у
  // смешанной нормы нет одного размера, и она сюда не доходит — её гасит отказ.
  const chosenComp = compositionOf(chosen);
  const chosenSizeId = chosenComp.length === 1 ? chosenComp[0].sizeId : 0;
  // Маркер размера, которого НЕТ в размерном ряду карточки (остался от снятого размера или
  // никогда в ряд не входил), — норма ниоткуда: spreadPct его не видит (он считается по размерам
  // ряда). Прежний сосед offBaseSize («норма не с базового размера») умер вместе с ролью
  // базового размера в костинге (T6): себестоимость стиля — среднее по ряду, и «не тот размер»
  // перестал быть фактом о цене; spreadPct покрывает существенный разброс честнее.
  const offRunSize = chosenSizeId > 0 && sizeIds.length > 0 && !sizeIds.includes(chosenSizeId);

  // УСЛОВИЯ СЪЁМКИ на том маркере, который реально уйдёт в рецепт (Ф3). Ни одно из двух не
  // запрещает применение: «старая норма» — это раскладка, снятая до того, как условия стали
  // записываться (категория ПРОИЗВОДНАЯ, своего флага у неё нет), а «набор изменился» — сверка
  // отпечатка деталей. Оба — знание, которое есть у экрана и которого нет у оператора, и молчать
  // о нём значит выдать число уверенней, чем оно есть. НЕИЗВЕСТНОСТЬ отпечатка — НЕ изменение:
  // pieceSetChanged намеренно ложен на UNKNOWN, иначе бейджем покрылись бы все старые маркеры разом.
  const perSizeChanged = plan.rows
    .filter((r) => pieceSetChanged(r.marker ?? undefined))
    .map((r) => sizeName(r.sizeId));
  const perSizeLegacy = plan.rows
    .filter((r) => r.marker != null && isLegacyNorm(r.marker))
    .map((r) => sizeName(r.sizeId));

  // Provenance stamped with the number (0261): «marker» tells costing this figure ALREADY
  // contains the cutting waste, so the article's wastage_percent must not gross it up a second
  // time. The decomposition is display only. In per-size mode the applied norms come from
  // several markers, so the split is their plain mean — the components are near-identical
  // across a size run (same geometry, same cloth) and the number is never multiplied by
  // anything; a marker with no recorded efficiency contributes nothing and the split stays
  // blank rather than invented.
  //
  // Ф6.8 ДОБАВЛЯЕТ К ЭТОМУ ШТАМП: вместе с числом уходит id раскладки, ИЗ КОТОРОЙ оно снято.
  // §6.4 этим не отменяется — штамп не FK и ничего не пересчитывает; он лишь позволяет строке
  // рецепта ответить на вопрос, которого она сегодня не помнит: «раскладку с тех пор перемеряли,
  // число ещё актуально?». Дату применения ставит СЕРВЕР — клиент её не шлёт никогда.
  const provenance = (used: common_TechCardMarkerSummary[], normMarkerId: number) => {
    const parts = used.map(markerWasteDecomposition).filter((d) => d != null);
    if (parts.length === 0)
      return { consumptionSource: 'marker', wasteSelvedgePct: '', wasteCutPct: '', normMarkerId };
    const mean = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
      String(Math.round((parts.reduce((s, d) => s + pick(d!), 0) / parts.length) * 100) / 100);
    return {
      consumptionSource: 'marker',
      wasteSelvedgePct: mean((d) => d.selvedgePct),
      wasteCutPct: mean((d) => d.cutPct),
      normMarkerId,
    };
  };

  const apply = () => {
    if (mode === 'scalar') {
      // convZero — тот же гейт, что на кнопке: «0» не пишется значением никогда (см. convZero).
      if (!conv || convZero || chosenRefusal) return;
      // The scalar mode CLEARS per-size grading (trap №1): a lone per-size row would make
      // the server ignore this very scalar.
      //
      // Штамп — id ВЫБРАННОЙ раскладки: одно число, одна раскладка, атрибуция точная.
      onApply({
        consumption: String(conv.value),
        sizeConsumptions: [],
        ...provenance([chosen], chosen.id ?? 0),
      });
    } else {
      const rows: { sizeId: number; consumption: string }[] = [];
      const used: common_TechCardMarkerSummary[] = [];
      for (const r of plan.rows) {
        // План уже отказал за каждый размер, который назвать нечем; null и ноль после округления
        // проверяются всё равно — молча записать в рецепт «0» хуже, чем не записать ничего.
        const c = r.consumptionCm != null ? toBomUnit(r.consumptionCm, unit, fabric) : null;
        if (!c || !(c.value > 0)) return;
        rows.push({ sizeId: r.sizeId, consumption: String(c.value) });
        if (r.marker && !used.includes(r.marker)) used.push(r.marker);
      }
      if (rows.length === 0) return;
      // ШТАМП СТАВИТ НЕ РЕЖИМ, А ЧИСЛО ИСТОЧНИКОВ — и 0 здесь такое же решение, как id.
      //
      // Штамп утверждает «эти числа пришли из раскладки #N». Ложью его делает НЕСКОЛЬКО источников,
      // а не слово «по размерам» в названии режима: проштамповать одну из нескольких значило бы
      // поставить правдоподобную ложь, после которой индикатор расхождения следил бы за ОДНОЙ
      // раскладкой и МОЛЧА пропускал изменения в остальных — выглядел бы работающим, ничего не
      // проверяя. Поэтому источников больше одного ⇒ 0.
      //
      // Но с Ф2.4 одна СМЕШАННАЯ раскладка законно накрывает весь размерный ряд, и тогда источник
      // ровно один: утверждение «числа сняты с #N» просто ИСТИННО, а продолжения по площадям
      // берут её же за базис — перемеряют её, устаревают и они. Отказать здесь в штампе значило бы
      // выбросить индикатор у самого современного пути ради симметрии с случаем, которого нет.
      // Считаем РАЗЛИЧНЫЕ id, а не длину массива: две строки могут держать два объекта одной и той
      // же раскладки.
      //
      // 0 обязан быть ЯВНЫМ, а не пропуском поля: отсутствие сервер читает как «сохрани что было»,
      // и прежний скалярный штамп пережил бы применение по размерам, начав описывать не то число.
      const sourceIds = new Set(used.map((m) => Number(m.id ?? 0)).filter((id) => id > 0));
      const stamp = sourceIds.size === 1 ? [...sourceIds][0] : 0;
      onApply({ sizeConsumptions: rows, ...provenance(used, stamp) });
    }
    setOpen(false);
  };

  // ПРОДОЛЖЕНИЕ ПО ВЫКРОЙКАМ — по нажатию, никогда само (см. состояние `areas`).
  //
  // Три источника сходятся здесь и нигде больше: блоб раскладки (количества деталей на изделие и
  // площади неградуируемых), СЕГОДНЯШНИЕ выкройки её ткани и словарь размеров (чем размер написан
  // в имени блока). Тяжёлое — разбор DXF — приходит ДИНАМИЧЕСКИМ импортом: этот файл живёт в
  // чанке рецепта, и статический импорт притащил бы туда dxf-parser целиком.
  const continueByAreas = async () => {
    setAreaBusy(true);
    setAreaError('');
    try {
      const [
        { sizeAreasForMarker },
        { patternSourcesForMarker },
        { fabricScopes, isRollGoodsSection },
      ] = await Promise.all([
        import('./nesting/size-areas-from-dxf'),
        import('./nesting/marker-rebuild'),
        import('./bom-purpose'),
      ]);
      // Какие листы обслуживают ткань ЭТОЙ раскладки. С 0267 лист привязан к НАЗНАЧЕНИЮ, и оно
      // резолвится перед bomLineKey — фильтр по одному ключу теряет листы «основного материала»
      // и отвечает «выкроек нет» там, где они загружены.
      const key = (chosen.bomLineKey ?? '').trim();
      const rollGoods = bomRows
        .filter((b) => isRollGoodsSection(b.section) && b.lineKey)
        .map((b) => ({ lineKey: b.lineKey as string, purpose: b.purpose ?? '' }));
      const scope = key
        ? fabricScopes(rollGoods).find((s) => s.lines.some((l) => l.lineKey === key))
        : undefined;
      const sources = patternSourcesForMarker(patternRows, {
        bomLineKey: key,
        purposeOwnsLine: (p) => !!scope?.byPurpose && scope.key === p,
      });
      if (sources.length === 0) {
        setAreas(null);
        setAreaError('выкроек этой ткани на карточке нет — площади считать не по чему');
        return;
      }
      // Блоб едет ОТДЕЛЬНЫМ запросом: в сводке его нет намеренно (60–100 КБ на раскладку), а без
      // него неизвестны ни количества деталей на изделие, ни площади неградуируемых.
      const r = await adminService.GetTechCardMarker({ id: chosen.id ?? 0 });
      if (!r.marker) {
        setAreas(null);
        setAreaError('раскладка не найдена — возможно, её удалили');
        return;
      }
      // Токены размера — ПО ВСЕМУ СЛОВАРЮ, а не по ряду карточки: иначе размер, лежащий в файле,
      // но не заведённый в ряд, перестаёт быть размерным хвостом, и деталь двоится на идентичности.
      const dictTokens = new Set<string>();
      for (const name of sizeNameById.values())
        for (const t of sizeTokensOf(name)) dictTokens.add(t);
      const wanted = new Set<number>(sizeIds);
      for (const c of compositionOf(chosen)) wanted.add(c.sizeId);
      const out = await sizeAreasForMarker({
        marker: r.marker,
        sources,
        sizeIds: [...wanted],
        tokensOfSize: (id) => sizeTokensOf(sizeNameById.get(id)),
        isSizeToken: (t) => dictTokens.has(t),
      });
      if (!out.ok) {
        setAreas(null);
        setAreaError(out.reason);
        return;
      }
      // Сверка клиентских площадей с записанными живёт в perSizePlan — здесь только сырьё. Так
      // «продолжение недействительно» остаётся ОДНИМ решением в одном месте, а не двумя.
      setAreas(out.areas.areaBySize);
    } catch (e) {
      setAreas(null);
      setAreaError(
        e instanceof Error && e.message ? e.message : 'не удалось посчитать площади по выкройкам',
      );
    } finally {
      setAreaBusy(false);
    }
  };

  // Закрытие диалога сбрасывает и посчитанные площади: они проверены против ОДНОЙ раскладки и
  // против СЕГОДНЯШНИХ файлов, а между открытиями могло измениться и то и другое.
  const reset = () => {
    setMarkerId(0);
    setMode('scalar');
    setAreas(null);
    setAreaError('');
  };

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Text size='nano' variant='label' component='span'>
        из раскладки: {chosenRefusal ? '—' : preview} · «{chosen.name}» ({compLabel(chosen)})
      </Text>
      {/* «Норма» — ПОДПИСЬ, а не порядок. Раньше назначенную раскладку можно было опознать только
          по тому, что её предложили первой, — то есть не отличить от «просто самой свежей». */}
      {chosen.isNorm === true && (
        <Pill tone='ink' title='назначенная нормировочная раскладка этой ткани на карточке'>
          норма
        </Pill>
      )}
      {pieceSetChanged(chosen) && (
        <Pill
          tone='attention'
          title='набор деталей карточки изменился после съёмки этой раскладки — длина измерена по прежнему набору'
        >
          набор изменился
        </Pill>
      )}
      {isLegacyNorm(chosen) && (
        <Pill
          tone='mut'
          title='условия съёмки (припуск, слои, переворот) не записаны — раскладка снята до того, как их стали записывать'
        >
          старая норма
        </Pill>
      )}
      {/* Норма назначена, а предлагается не она — на строке это видно только здесь: диалог с
          объяснением ещё надо открыть, а прочитать число можно и не открывая. */}
      {notTheNorm && normRefusal && (
        <Pill tone='warn' title={normRefusal}>
          норма не даёт расхода
        </Pill>
      )}
      {chosenRefusal && (
        <Pill tone='warn' title={chosenRefusal}>
          {refusalWord(chosen)}
        </Pill>
      )}
      {/* Кг-слот (Ф3): основа веса называется ПРЯМО НА СТРОКЕ. Успех — какой шириной и
          плотностью посчитано (ширина полная, с кромкой); отказ — чего именно не хватает,
          потому что лечится он заполнением артикула, а не сменой единицы. */}
      {unitKind === 'kg' && fabric && conv && (
        <Pill tone='mut' title={weightBasisNote(fabric)}>
          вес: {weightBasisLabel(fabric)}
        </Pill>
      )}
      {unitKind === 'kg' && !weightBasis.ok && (
        <Pill tone='warn' title={weightRefusalText(weightBasis.missing, weightBasis.pinned)}>
          {weightMissingShort(weightBasis.missing)}
        </Pill>
      )}
      {canEdit && (
        <Button type='button' variant='secondary' size='xs' onClick={() => setOpen(true)}>
          применить…
        </Button>
      )}

      <ConfirmationModal
        open={open}
        onOpenChange={(o: boolean) => {
          setOpen(o);
          if (!o) reset();
        }}
        onConfirm={apply}
        onCancel={() => {
          setOpen(false);
          reset();
        }}
        title='применить расход из раскладки'
        confirmLabel='применить'
        confirmDisabled={
          (mode === 'scalar' && (!conv || convZero || !!chosenRefusal)) ||
          (mode === 'perSize' && !perSizeApplicable)
        }
        closeOnConfirm={false}
      >
        <div className='space-y-2.5'>
          {/* ── ЧТО ПРИМЕНЯЕМ ────────────────────────────────────────────────────────────────
              Выбор раскладки и режим — вход всего остального, и стоят они первыми. Всё, что
              ниже, описывает ПОСЛЕДСТВИЯ этого выбора и меняется вместе с ним. */}
          {/* Селектор теперь и в «по размерам»: выбранная раскладка там не только показывается,
              она ЕСТЬ БАЗИС ПРОДОЛЖЕНИЯ — её константа L/Σ(q·a) достраивает размеры, которых нет
              в её составе. Прятать выбор в режиме, где он решает больше всего, было бы странно. */}
          {/* ПОЛЯ НЕ ТЯНУТСЯ НА ВСЮ ШИРИНУ ОКНА. `Selector` рисует себя `w-full`, и это правильно в
              узкой панели, из которой он приехал; здесь окно `lg`, и растянутый на тысячу пикселей
              выпадающий список читается как ошибка вёрстки. Ограничение стоит СНАРУЖИ, на обёртке:
              правка самого примитива сузила бы его на всех остальных экранах. */}
          {lineMarkers.length > 1 && (
            <div className='max-w-xl'>
              <Selector
                label='маркер'
                value={chosen.id ?? 0}
                // Список идёт ПО РАНГУ (норма → свой колорвей → свежесть), а не в порядке,
                // в котором строки приехали с сервера: первый пункт списка обязан совпадать с тем,
                // что экран предложил сам.
                options={ranked.map((m) => {
                  const c = consumptionCm(m);
                  return {
                    value: m.id ?? 0,
                    // Неприменимая раскладка остаётся В СПИСКЕ и подписана словом. Спрятать её
                    // значило бы ответить на «а где раскладка, которую я только что снял»
                    // молчанием; подписать «— смешанный состав» — назвать причину там, где её ищут.
                    // «набор изменился» стоит здесь же: это факт о ГОДНОСТИ числа, и узнать его надо
                    // до выбора, а не после. «Старая норма» намеренно осталась ниже, на выбранном
                    // маркере: до Ф3 её несёт КАЖДАЯ строка, и в списке это был бы шум, а не сигнал.
                    label: `${m.isNorm === true ? 'норма · ' : ''}«${m.name}» · ${compLabel(m)} · ${
                      c != null ? `${c} см/ед` : `нормы нет — ${refusalWord(m)}`
                    }${
                      isDraftMarker(m) && Number(m.totalCount ?? 0) > Number(m.placedCount ?? 0)
                        ? ` (уложено ${m.placedCount ?? 0} из ${m.totalCount ?? 0})`
                        : ''
                    }${pieceSetChanged(m) ? ' · набор изменился' : ''}`,
                  };
                })}
                onChange={(v: string | number) => {
                  setMarkerId(Number(v));
                  // Площади посчитаны ПРОТИВ конкретной раскладки: её блоба, её условий съёмки, её
                  // записанных a_s. Для другой они не проверены ничем, и оставить их значило бы
                  // продолжить чужую константу по чужой сверке.
                  setAreas(null);
                  setAreaError('');
                }}
              />
            </div>
          )}
          <ChipRow>
            <Chip
              selected={mode === 'scalar'}
              pressed={mode === 'scalar'}
              onClick={() => setMode('scalar')}
            >
              единой нормой
            </Chip>
            {/* «По размерам» ТЕПЕРЬ ДОСТУПНО И ОТ ОДНОЙ СМЕШАННОЙ РАСКЛАДКИ. Раньше режим требовал
                однородной раскладки на КАЖДЫЙ размер, потому что поделить смешанную было нечем;
                с Ф2.4 у каждой строки её состава есть свой расход, и она нормирует все свои
                размеры сразу. Гейт остался один: хоть один размер обязан быть ИЗМЕРЕН, остальное
                договаривает продолжение по площадям. */}
            <Chip
              selected={mode === 'perSize'}
              pressed={mode === 'perSize'}
              disabled={!perSizeOffered}
              title={
                perSizeOffered
                  ? undefined
                  : 'ни один размер карточки не нормирован раскладкой: нужна раскладка, чей состав режет хотя бы один из этих размеров. Смешанная годится — если она снята после того, как площади по размерам стали записываться (иначе поделить её длину по размерам нечем). ЧЕРНОВИК не годится ни в каком виде: у него не легла часть деталей, и длина короче настоящей'
              }
              onClick={() => perSizeOffered && setMode('perSize')}
            >
              по размерам
            </Chip>
          </ChipRow>

          {/* ── ЧТО МЕШАЕТ ПРИМЕНИТЬ — СРАЗУ ПОСЛЕ ВЫБОРА И ДО ВСЯКИХ ЧИСЕЛ ───────────────────
              Отказ, лежащий под таблицей, читается после того, как оператор уже поверил числу. */}
          {/* Отказ сервера, слово в слово. Он длинный намеренно: называет и правило, и что
              делать — применить однородную раскладку либо дождаться Ф2.4. Показывается ВМЕСТО
              отказа по единице: когда числа нет вовсе, единица уже не при чём. */}
          {mode === 'scalar' && chosenRefusal ? (
            <CalloutBox tone='error'>{chosenRefusal}</CalloutBox>
          ) : (
            mode === 'scalar' && !conv && <CalloutBox tone='error'>{unitRefusal}</CalloutBox>
          )}
          {/* НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ — отдельная причина с отдельными словами (см. zeroRefusal):
              отказ по единице здесь врал бы — единица-то принимает, число слишком мало. */}
          {mode === 'scalar' && !chosenRefusal && convZero && (
            <CalloutBox tone='warning'>{zeroRefusal}</CalloutBox>
          )}
          {/* Тот же отказ по единице — и в «по размерам»: покрытие полное, а применить нечем.
              Без него кнопка гаснет молча, и объяснить это некому. */}
          {mode === 'perSize' && plan.complete && !perSizeConvertible && (
            <CalloutBox tone='error'>{unitRefusal}</CalloutBox>
          )}
          {mode === 'perSize' && perSizeZero && (
            <CalloutBox tone='warning'>{zeroRefusal}</CalloutBox>
          )}
          {/* ЧЕРНОВИК В РЕЖИМЕ «ПО РАЗМЕРАМ» ОТКАЗЫВАЕТ ОТДЕЛЬНЫМИ СЛОВАМИ. Скалярный отказ висит
              выше своей веткой, а здесь его не видно вовсе — и без этой строки выбранный черновик
              выглядел бы как раскладка, которая почему-то ничего не даёт. Он не нормирует ни один
              свой размер и не может быть базисом продолжения: константа распределения выводится из
              ДЛИНЫ настила, а она у него короче настоящей. */}
          {mode === 'perSize' && isDraftMarker(chosen) && (
            <CalloutBox tone='error'>
              {chosenRefusal} Продолжить по нему остальной ряд тоже нельзя: распределение выводится
              из длины настила, и по черновику оно занизило бы сразу все размеры
            </CalloutBox>
          )}
          {/* ПОЧЕМУ ПО РАЗМЕРАМ НЕ ПОЛУЧАЕТСЯ — словами, а не погасшей кнопкой. */}
          {mode === 'perSize' && !plan.complete && perSizeWhyNot && (
            <CalloutBox tone='warning'>{perSizeWhyNot}</CalloutBox>
          )}
          {mode === 'perSize' && areaError && <CalloutBox tone='error'>{areaError}</CalloutBox>}
          {/* СВЕРКА НЕ СОШЛАСЬ — ПРОДОЛЖАТЬ НЕЛЬЗЯ, и это отдельный, более сильный факт, чем
              «размера нет». Площади посчитаны, но сегодняшние выкройки не воспроизводят те, по
              которым мерили: файлы менялись после съёмки, а длина настила осталась от прежней
              геометрии. Экстраполировать константу по чужим файлам значит выдать число, которое
              ни к чему не относится. */}
          {mode === 'perSize' && plan.continuation === 'blocked' && plan.areaCheck && (
            <CalloutBox tone='error'>
              продолжение недействительно: {plan.areaCheck.reason}. Переснимите раскладку по
              сегодняшним выкройкам — тогда и длина, и площади будут от одной геометрии
            </CalloutBox>
          )}

          {/* ── ЧИСЛО И ЕГО АРИФМЕТИКА ───────────────────────────────────────────────────────
              Расход раскладки — это ДЕЛЕНИЕ, и ошибаются в нём в делителе: настил на шесть
              изделий, посчитанный как на три, даёт вдвое завышенную норму, и на экране это
              по-прежнему правдоподобное число. До этой правки диалог печатал одно частное и
              двадцать абзацев вокруг — проверить его было нечем. */}
          {mode === 'scalar' && !chosenRefusal && (
            <div>
              <GroupLabel flush>{`норма из «${chosen.name}»`}</GroupLabel>
              <div className='flex flex-col gap-1.5 pt-1'>
                <MarkerLengthFormula
                  lengthCm={decNum(chosen.usedLengthCm)}
                  units={totalUnitsOf(chosen)}
                  unitsLabel={compositionSummary(chosen, sizeName)}
                  perGarment={conv && !convZero ? conv.value : null}
                  unit={unit}
                  widthCm={chosenW}
                />
                {/* Кг-слот: формула веса целиком, с числами, ДО нажатия — применённое число иначе
                    невозможно проверить: ошибка ширины или плотности входит в него линейно.
                    Стоит ВПЛОТНУЮ к арифметике, потому что это её продолжение. */}
                {unitKind === 'kg' && fabric && (
                  <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
                    {weightBasisNote(fabric)}
                  </Text>
                )}
                {/* Применяется НЕ НОРМА — и это надо сказать до нажатия, а не объяснять потом. Два
                    разных случая, и путать их нельзя: экран сам обошёл норму, потому что она не
                    выдаёт расхода на изделие (тогда это предупреждение), либо оператор выбрал
                    другую раскладку руками (тогда это констатация). Молчаливая подмена назначенной
                    нормы «просто применимой» — ровно то, ради чего норма и заводилась. */}
                {notTheNorm && normMarker && (
                  <CalloutBox tone={normRefusal ? 'warning' : 'note'}>
                    {normRefusal
                      ? `назначенная норма «${normMarker.name}» расхода на изделие не даёт (${refusalWord(
                          normMarker,
                        )}) — применится «${chosen.name}», а не она`
                      : `применится «${chosen.name}», а НЕ назначенная норма «${normMarker.name}»${
                          normConv ? ` (${normConv.value} ${normConv.unit})` : ''
                        }`}
                  </CalloutBox>
                )}
              </div>
            </div>
          )}

          {mode === 'perSize' && (
            <div>
              <GroupLabel flush>норма по размерному ряду — это и уедет в строку</GroupLabel>
              <div className='flex flex-col gap-1.5 pt-1'>
                {/* ЧИСЛО И ЕГО ПРОИСХОЖДЕНИЕ — В ОДНОЙ СТРОКЕ ТАБЛИЦЫ. Три источника выглядят
                    одинаково убедительно, а стоят разного: «из раскладки» измерено, «по площади
                    выкроек» продолжено той же формулой, «СРЕДНЕЕ» — тот самый перекос, который вся
                    подсистема отказывается отдавать скаляром. Строка без пометки была бы обещанием,
                    которого экран не может дать. */}
                <MarkerPerSizeTable
                  rows={plan.rows.map((r) => ({
                    sizeId: r.sizeId,
                    consumptionCm: r.consumptionCm,
                    areaCm2: r.areaCm2,
                    origin: r.origin ?? '',
                    originLabel: originLabel(r.origin),
                    originTitle:
                      r.origin === 'area'
                        ? `размера нет в составе «${chosen.name}» — расход продолжен по площади его выкроек (${(r.areaCm2 ?? 0).toFixed(0)} см² на изделие) той же формулой распределения`
                        : r.origin === 'mean'
                          ? `выкроек этого размера на карточке нет — подставлено СРЕДНЕЕ по настилу «${chosen.name}». Мелкие размеры оно завышает, крупные занижает`
                          : r.marker
                            ? `измерено раскладкой «${r.marker.name}»`
                            : undefined,
                  }))}
                  sizeNameById={sizeNameById}
                  unit={unit}
                  fabric={fabric}
                  toUnit={(cm) => toBomUnit(cm, unit, fabric)}
                />
                {unitKind === 'kg' && fabric && (
                  <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
                    {weightBasisNote(fabric)}
                  </Text>
                )}
                {/* ПРОДОЛЖЕНИЕ ФОРМУЛЫ НА ОСТАЛЬНОЙ РЯД. Раскладка публикует площадь каждого размера
                    своего состава, а вместе с длиной настила — и константу L/Σ(q·a); размеру, которого
                    в составе не было, недостаёт ровно одного числа — его собственной площади, и она
                    берётся из выкроек. Кнопка, а не автозапуск: это мегабайты с CDN и разбор DXF. */}
                {continuationOffered && (
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      disabled={areaBusy}
                      onClick={continueByAreas}
                    >
                      {areaBusy ? 'считаю площади…' : 'продолжить по выкройкам'}
                    </Button>
                    <Text size='nano' variant='label' component='span'>
                      посчитать площади размеров {plan.unansweredSizes.map(sizeName).join(', ')} по
                      сегодняшним выкройкам и продолжить распределение «{chosen.name}»
                    </Text>
                  </div>
                )}
                {plan.continuation === 'ok' && plan.continuedSizes.length > 0 && (
                  <CalloutBox tone='note'>
                    размеры {plan.continuedSizes.map(sizeName).join(', ')} в составе «{chosen.name}»
                    не резались: их расход ПРОДОЛЖЕН по площади выкроек тем же распределением, каким
                    раскладка поделила свою длину между своими размерами. Площади сверены с
                    записанными в раскладке — сегодняшние выкройки те же
                  </CalloutBox>
                )}
              </div>
            </div>
          )}

          {/* ── НА ЧТО УШЛО ПОЛОТНО ──────────────────────────────────────────────────────────
              Единственное место во всём приложении, где netto и brutto одной длины стоят рядом
              числами. Оператор, только что видевший «0.867 м по выкройкам» на этой же ткани,
              читал «1.737 м из раскладки» как второе мнение — теперь видно, что это то же самое
              плюс названные отходы.

              ТОЛЬКО ПРИ ОДНОМ ИСТОЧНИКЕ. В «по размерам» числа могут прийти от нескольких
              раскладок, и разложение ОДНОЙ из них описывало бы не ту длину; там остаётся
              усреднённая процентная подпись ниже, как и было. */}
          {applyPossible && splitMarker && (
            <div>
              <GroupLabel flush>из чего сложилась измеренная длина</GroupLabel>
              <div className='pt-1'>
                <MarkerAreaSplit
                  marker={splitMarker}
                  unit={unit}
                  fabric={fabric}
                  units={totalUnitsOf(splitMarker)}
                />
              </div>
            </div>
          )}
          {/* РАЗЛОЖЕНИЕ БЕЗ ДЛИНЫ НАСТИЛА — прежней подписью в процентах. Таблица выше требует
              длину (она делит абсолютные см²), а проценты живут и без неё: раскладка, у которой
              записаны КПД и ширина, но не записана длина, обязана по-прежнему отвечать. Тот же
              текст стоит и там, где источников несколько. */}
          {applyPossible &&
            !splitMarker &&
            (() => {
              // Exactly the markers apply() would use — the preview and the value written must be
              // the same number.
              const used = mode === 'scalar' ? [chosen] : appliedPerSize;
              const parts = used.map((m) => markerWasteDecomposition(m!)).filter((d) => d != null);
              if (parts.length === 0) {
                return (
                  <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
                    раскладка без записанной эффективности — отходы не разложить на кромку и выпады
                  </Text>
                );
              }
              const avg = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
                parts.reduce((s, d) => s + pick(d!), 0) / parts.length;
              const sv = avg((d) => d.selvedgePct);
              const cut = avg((d) => d.cutPct);
              return (
                <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
                  в норме уже сидят отходы: кромка {sv.toFixed(1)}% + межлекальные выпады{' '}
                  {cut.toFixed(1)}% (от площади деталей)
                  {sv === 0 ? ' — кромка артикула не задана' : ''}
                </Text>
              );
            })()}
          {/* Процент раскроя слота на марочной норме НЕ начисляется, и сказать это надо там же, где
              показаны отходы: иначе оператор, увидевший «12%» на вкладке BOM и отходы здесь,
              решит, что они складываются. Одной строкой, а не колаутом: это правило системы, а не
              состояние ЭТОГО числа. */}
          {applyPossible && Number.isFinite(wastage) && wastage > 0 && (
            <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
              {`у линии стоит ${wastage}% отходов — на применённой из раскладки норме костинг их НЕ начисляет: измеренная длина уже содержит и межлекальные выпады, и кромку. Процент снова начнёт работать, если норму перебить вручную`}
            </Text>
          )}

          {/* ── ЧТО СТОИТ ЗНАТЬ ПРО ЭТО ЧИСЛО ────────────────────────────────────────────────
              Всё, что ниже, применить НЕ мешает, но говорит, насколько числу можно верить. Это
              знание есть у экрана и нет у оператора — молчать о нём значит выдать число уверенней,
              чем оно есть. Поэтому здесь, видимым, а не в раскрывашке. */}
          {/* СРЕДНЕЕ НАЗЫВАЕТСЯ ВСЛУХ. 03-composition.md оставляет его только размерам без файлов
              и требует сказать об этом на экране — потому что это ровно то число, ради устранения
              которого затевался состав, и молча оно неотличимо от измеренного. */}
          {mode === 'perSize' && plan.meanSizes.length > 0 && (
            <CalloutBox tone='warning'>
              у размеров {plan.meanSizes.map(sizeName).join(', ')} выкроек на карточке нет, и им
              подставлено СРЕДНЕЕ по настилу «{chosen.name}»: мелкие размеры оно завышает, крупные
              занижает. Загрузите их выкройки — расход посчитается по площади, как у остальных
            </CalloutBox>
          )}
          {mode === 'scalar' && widthMismatch && (
            <CalloutBox tone='warning'>
              маркер «{chosen.name}» посчитан для полотна {chosenW} см, артикул слота — {artW} см:
              расход не переносится между ширинами без пересчёта
            </CalloutBox>
          )}
          {mode === 'perSize' && mixedWidths && (
            <CalloutBox tone='warning'>
              маркеры разных размеров посчитаны на разной ширине полотна (
              {Math.min(...perSizeWidths)}–{Math.max(...perSizeWidths)} см) — нормы смешивают разные
              ткани
            </CalloutBox>
          )}
          {mode === 'perSize' && perSizeWidthMismatch && (
            <CalloutBox tone='warning'>
              маркеры посчитаны для полотна {[...new Set(perSizeWidths)].join(' / ')} см, артикул
              слота — {artW} см: расход не переносится между ширинами без пересчёта
            </CalloutBox>
          )}
          {mode === 'scalar' && (offRunSize || spreadPct > 5) && (
            <CalloutBox tone={offRunSize ? 'warning' : 'note'}>
              {[
                offRunSize
                  ? `единая норма взята с размера ${sizeName(chosenSizeId)}, которого НЕТ в размерном ряду карточки`
                  : '',
                spreadPct > 5
                  ? `расход по размерам расходится на ${spreadPct.toFixed(0)}% — рассмотрите режим «по размерам»`
                  : '',
              ]
                .filter(Boolean)
                .join('; ')}
            </CalloutBox>
          )}
          {/* Условия съёмки (Ф3). Ни одно из двух не запрещает применение — и НЕ должно: гейт
              условий живёт в Ф6, а здесь их дело — не дать применить число молча увереннее, чем
              оно есть. */}
          {mode === 'scalar' && pieceSetChanged(chosen) && (
            <CalloutBox tone='warning'>
              набор деталей карточки изменился после съёмки «{chosen.name}»: длина измерена по
              ПРЕЖНЕМУ набору деталей. Применить можно, но число стоит подтвердить пересъёмкой
            </CalloutBox>
          )}
          {mode === 'perSize' && perSizeChanged.length > 0 && (
            <CalloutBox tone='warning'>
              набор деталей карточки изменился после съёмки раскладок размеров{' '}
              {perSizeChanged.join(', ')}: их длины измерены по ПРЕЖНЕМУ набору деталей
            </CalloutBox>
          )}
          {mode === 'scalar' && isLegacyNorm(chosen) && (
            <CalloutBox tone='note'>
              старая норма: у «{chosen.name}» не записаны условия съёмки — ни припуск, ни слои, ни
              политика переворота, а значит по чему именно она снята, сказать нечем. Применить
              можно; пересъёмка запишет условия
            </CalloutBox>
          )}
          {mode === 'perSize' && perSizeLegacy.length > 0 && (
            <CalloutBox tone='note'>
              старая норма у размеров {perSizeLegacy.join(', ')}: условия съёмки (припуск, слои,
              переворот) не записаны
            </CalloutBox>
          )}

          {/* ── КАК ЭТО РАБОТАЕТ ─────────────────────────────────────────────────────────────
              Правила системы, а не состояние этого числа: читать их надо ОДИН раз на человека, а
              видеть перед каждым применением — каждый раз. `<details>`, а не кнопка: на выпущенной
              карточке вкладка лежит внутри `<fieldset disabled>`, который глушит любую кнопку. */}
          <details className='border border-hairline px-2 py-1'>
            <summary className='cursor-pointer text-micro uppercase'>
              что именно запишется в рецепт
            </summary>
            <div className='flex max-w-[90ch] flex-col gap-1 pt-1.5'>
              {/* §6.4 сказанное там, где оно случается. Кнопка КОПИРУЕТ число: ссылки на раскладку в
                  рецепте не остаётся, и никакое последующее событие — ни пересъёмка, ни назначение
                  другой нормы — этот рецепт не тронет. */}
              <Text size='nano' variant='label' component='p'>
                запись уйдёт при сохранении карточки (рецепт колорвея staged-сейвом). Число
                КОПИРУЕТСЯ: связи рецепта с раскладкой нет — переназначат норму или переснимут
                раскладку, рецепт сам не пересчитается, применять придётся заново.
              </Text>
              <Text size='nano' variant='label' component='p'>
                Вместе с числом уходит ИСТОЧНИК — «из раскладки». По нему костинг понимает, что
                отходы кроя уже внутри длины, и НЕ начисляет сверху процент раскроя слота. Перебьёте
                число руками — источник снимется, и процент снова начнёт работать.
              </Text>
              <Text size='nano' variant='label' component='p'>
                Расчёт «по выкройкам» на этой же ткани даёт NETTO — площадь деталей ÷ раскройную
                ширину, без межлекальных выпадов; за них там платит процент раскроя слота. Раскладка
                измеряет ту же длину целиком, поэтому её число больше, а процент к нему не
                применяется. Два инструмента, одна физика — разница между их числами и есть отходы
                раскроя.
              </Text>
            </div>
          </details>
        </div>
      </ConfirmationModal>
    </div>
  );
}

// ── costing-side display band ───────────────────────────────────────────────────────────

export function MarkerConsumptionBand({ techCard }: { techCard?: common_TechCard }) {
  // Сырое поле карточки: раскройные маркеры прогонов приезжают в нём вперемешку с карточными
  // (отдельного List-RPC у клиента нет). Отсеивает их markersForLine — через cardMarkers, один
  // фильтр на весь клиент, — и ВСЁ, что эта полоса читает из маркеров, проходит через него:
  // отбор строк BOM (:filter ниже), сам список, ранжирование и поиск нормы работают уже с
  // `lineMarkers`. Держать здесь второй `productionRunId === 0` значило бы завести вторую копию
  // правила, которая разойдётся с первой.
  const markers = techCard?.markers ?? [];
  const bomLines = techCard?.techCard?.bomItems ?? [];
  const colorways = techCard?.colorways ?? [];
  // Каталог материалов — ТОЛЬКО ради основы веса кг-слотов (Ф3): плотность живёт на артикуле и
  // никогда на строке BOM (у той лежит свой снимок, см. fabric-weight.ts). Ключ запроса общий с
  // вкладкой колорвеев, так что чаще всего это чтение из кэша.
  //
  // И ЗАПРАШИВАЕТСЯ ТОЛЬКО КОГДА В КАРТОЧКЕ ЕСТЬ КГ-СЛОТ. Полоса живёт на карточке, где кг может не
  // быть ни одного, а `ListMaterials` — это весь каталог; безусловный запрос платил бы за вес там,
  // где вес никто не считает. Условие читается из пропа, до всех хуков, поэтому порядок хуков не
  // меняется — меняется только `enabled`.
  const needsWeightBasis = bomLines.some((b) => bomUnitKind(b.unit) === 'kg');
  // Статусы запроса читаются НАРАВНЕ с данными: на холодном кэше карта артикулов пуста, и без
  // них строка с реальными 220 г/м² получала бы отказ «нет плотности артикула», а упавший запрос
  // делал бы этот ложный отказ постоянным. Статусы осмысленны только при needsWeightBasis
  // (отключённый запрос в react-query v5 вечно isPending) — читаются они ниже строго под
  // bomUnitKind === 'kg', то есть только когда запрос включён.
  const {
    data: materialsData,
    isPending: materialsPending,
    isError: materialsError,
  } = useMaterials('', true, needsWeightBasis);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materialsData?.materials ?? []) if (mat.id) m.set(Number(mat.id), mat);
    return m;
  }, [materialsData]);

  const rows = useMemo(() => {
    return bomLines
      .filter((b) => b.lineKey && markersForLine(markers, b.lineKey).length > 0)
      .map((b) => {
        const lineMarkers = markersForLine(markers, b.lineKey!);
        // Полоса — КАРТОЧНАЯ и мультислотовая: основа веса резолвится ПО СТРОКЕ, из ЕЁ
        // собственного артикула (пином владеет рецепт колорвея, здесь его нет). Ширина — общим
        // резолвером (fullRollWidthOf внутри weightBasisOf): поле строки, потом COALESCE-
        // обогащение 0259, потом артикул; здесь оба поля с провода и равны, когда строка своё
        // заполнила. Плотность — с артикула.
        const kgKind = bomUnitKind(b.unit) === 'kg';
        const articleId = Number(b.materialId ?? 0);
        const article = articleId ? materialById.get(articleId) : undefined;
        // ТРИ СОСТОЯНИЯ КАТАЛОГА РАЗЛИЧАЮТСЯ ДО основы веса, и ни одно не называется «нет
        // плотности артикула»: «каталог читается» — загрузка, а не отказ; «каталог не
        // прочитался» — ошибка чтения, а не пустая карточка материала; «артикула нет в выдаче» —
        // про его плотность сказать нечего вовсе. Ложный отказ «нет плотности» на холодном кэше
        // выглядел бы как дефект данных и отправлял бы заполнять уже заполненное.
        const catalog = !kgKind
          ? null
          : materialsPending
            ? ('loading' as const)
            : materialsError
              ? ('error' as const)
              : articleId > 0 && !article
                ? ('missing' as const)
                : null;
        const weightBasis = weightBasisOf(article, {
          effectiveFabricWidthCm: b.effectiveFabricWidthCm?.value ?? '',
          fabricWidth: b.fabricWidth?.value ?? '',
        });
        const fabric = weightBasis.ok ? weightBasis.basis : undefined;
        // Кг-витрина строки — одним полем, чтобы рендер не решал заново, что показывать: основа
        // при числе; состояние каталога, когда артикул не прочитан; нехватка — только когда
        // каталог прочитан и артикул найден (иначе «чего не хватает» — догадка, не факт).
        // null = слот не в килограммах, пилюль нет вовсе.
        const kg = kgKind
          ? {
              basis: fabric ?? null,
              missing: catalog == null && !weightBasis.ok ? weightBasis.missing : null,
              catalog,
              articleId,
            }
          : null;
        // ТОТ ЖЕ компаратор, что в подсказке рецепта: НОРМА → свежесть. Здесь стояла голая
        // сортировка по updatedAt, и это была не мелочь: полоса называла «самую свежую»
        // раскладку там, где рецепт применяли из назначенной нормы, — два экрана про одну ткань
        // показывали разные числа, и расхождение выглядело ошибкой рецепта. colorwayId = 0
        // намеренно: полоса КАРТОЧНАЯ, не колорвейная (см. markersOfColorway), и ключ
        // принадлежности здесь выключен — сравнивать колорвеи между собой она не должна.
        const ranked = [...lineMarkers].sort(betterMarker(0));
        // Смешанная раскладка не гасит собой применимую только потому, что стоит выше по рангу.
        const best = ranked.find((m) => !scalarNormRefusal(m)) ?? ranked[0];
        const refusal = scalarNormRefusal(best);
        const cons = consumptionCm(best);
        const conv = cons != null ? toBomUnit(cons, b.unit ?? '', fabric) : null;
        // Пропуск лучшего маркера — ФАКТ, а не служебная деталь: пропущенной может оказаться и
        // САМА НАЗНАЧЕННАЯ НОРМА (смешанный состав расхода на изделие не выдаёт), и тогда полоса
        // показывает число не с неё. В диалоге применения пропуск виден в селекторе с причиной;
        // у полосы селектора нет — значит, нужна пометка.
        const skipped = ranked.length > 0 && best !== ranked[0] ? ranked[0] : null;
        // What the recipes currently say for this slot: distinct non-empty scalars across
        // colourways (a per-size graded usage shows as «по размерам»). Кто внёс скаляр —
        // запоминается: дельта против чужого колорвея — ложная тревога (его артикул может быть
        // другой ширины, и «расхождение» — это расхождение тканей, а не рецепта с раскладкой).
        const scalars = new Set<string>();
        const scalarCws = new Set<number>();
        // СКАЛЯРЫ КОЛОРВЕЕВ С ПИНОМ НА ДРУГОЙ АРТИКУЛ — ВНЕ ЛЮБОЙ СВЕРКИ, и это то же правило,
        // что у ширины строкой выше, только для веса: рецепт через пин законно получал число на
        // ЕГО ткани (её полная ширина × её плотность), а полоса пересчитывает ту же раскладку
        // основой артикула СЛОТА — сравнение объявляло бы устаревшим сравнение двух РАЗНЫХ
        // тканей (150 см × 200 г/м² против 160 см × 250 г/м² — «расхождение» на треть без
        // единой правки). Показываются они отдельной подписью, а не прячутся: число в рецепте
        // есть, просто сверять его этой полосе не по чему.
        const pinnedScalars = new Set<string>();
        // Скаляры, ПРИМЕНЁННЫЕ ИЗ РАСКЛАДКИ, с колорвеем каждого — сырьё для §6.4 ниже. Ручные
        // числа сюда не попадают: рецепт, набранный руками, ничего про норму не обещал.
        const markerScalars: { cw: number; value: string }[] = [];
        let perSize = false;
        for (const cw of colorways) {
          const cwId = Number(cw.colorwayId ?? 0);
          for (const u of cw.usages ?? []) {
            if ((u.bomLineKey ?? '') !== b.lineKey) continue;
            if ((u.sizeConsumptions ?? []).length > 0) {
              perSize = true;
            } else if (u.consumption?.value) {
              const pinId = Number(u.materialId ?? 0);
              if (pinId > 0 && pinId !== articleId) {
                pinnedScalars.add(u.consumption.value);
                continue;
              }
              scalars.add(u.consumption.value);
              scalarCws.add(cwId);
              if ((u.consumptionSource ?? '') === 'marker')
                markerScalars.push({ cw: cwId, value: u.consumption.value });
            }
          }
        }
        const comparable = perSize
          ? 'по размерам'
          : scalars.size === 0
            ? pinnedScalars.size > 0
              ? ''
              : '—'
            : scalars.size === 1
              ? [...scalars][0]
              : `расходятся (${[...scalars].join(' / ')})`;
        const current =
          !perSize && pinnedScalars.size > 0
            ? [
                comparable,
                `пин на другой артикул: ${[...pinnedScalars].join(' / ')} — не сверяется, другая ткань`,
              ]
                .filter(Boolean)
                .join(' · ')
            : comparable;
        const bestCw = Number(best.colorwayId ?? 0);
        const delta =
          conv &&
          !perSize &&
          scalars.size === 1 &&
          Number([...scalars][0]) > 0 &&
          (bestCw === 0 || scalarCws.has(bestCw))
            ? ((conv.value - Number([...scalars][0])) / Number([...scalars][0])) * 100
            : null;

        // §6.4 — ПЕРЕСЧЁТА НЕТ И НЕ БУДЕТ. FK от рецепта к маркеру не существует: применение
        // КОПИРУЕТ длину в tech_card_colorway_usage.consumption, и переназначение нормы не
        // трогает ни одной строки рецепта. Значит «в рецепте лежит применённое из раскладки
        // число, а норма сейчас даёт другое» — не порча данных и не рассинхрон, который что-то
        // когда-нибудь починит: это состояние, закрыть которое может только человек, применив
        // норму заново. Дельта рядом называет РАЗМЕР расхождения и молчит о его природе — тут
        // нужна причина, иначе расхождение читается как ошибка рецепта.
        //
        // Сравниваются ТОЛЬКО скаляры с провенансом 'marker'. Пер-размерная строка собрана из
        // нескольких раскладок, из каких — не записано нигде (тот же отсутствующий FK), и
        // объявить её разошедшейся значило бы гадать. Колорвейный скоуп соблюдается той же
        // проверкой, что у дельты: норма своего колорвея ничего не утверждает о чужом рецепте —
        // у того другой артикул, другая ширина, и «расхождение» было бы расхождением тканей.
        // Скаляры колорвеев с пином на ДРУГОЙ артикул отсеяны ещё на сборе (pinnedScalars):
        // их переводили основой пина, а normConv ниже посчитан основой артикула слота.
        const normMarker = lineMarkers.find((m) => m.isNorm === true);
        const normCons = normMarker ? consumptionCm(normMarker) : null;
        const normConv = normCons != null ? toBomUnit(normCons, b.unit ?? '', fabric) : null;
        const normCw = Number(normMarker?.colorwayId ?? 0);
        // 0.0005 — шум представления: колонка DECIMAL(10,3), а число туда положил тот же apply
        // строкой из toBomUnit. Всё, что крупнее, — другое измерение, а не другая запись.
        const staleApplied = normConv
          ? [
              ...new Set(
                markerScalars
                  .filter((r) => normCw === 0 || r.cw === normCw)
                  .map((r) => r.value)
                  .filter((v) => Math.abs(Number(v) - normConv.value) > 0.0005),
              ),
            ]
          : [];
        const stale =
          normMarker && normConv && staleApplied.length > 0
            ? {
                name: normMarker.name ?? '',
                value: normConv.value,
                unit: normConv.unit,
                applied: staleApplied,
              }
            : null;
        return { line: b, best, conv, cons, refusal, current, delta, skipped, stale, kg };
      });
  }, [bomLines, markers, colorways, materialById, materialsPending, materialsError]);

  if (rows.length === 0) return null;

  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p'>
        расход из раскладок (маркеров) — применяется в рецепте колорвея, вкладка colourways
      </Text>
      {rows.map(({ line, best, conv, cons, refusal, current, delta, skipped, stale, kg }) => (
        <div key={line.lineKey} className='space-y-1'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Text size='micro' component='span' className='min-w-0 truncate'>
              {line.name?.trim() || 'ткань'}
            </Text>
            {refusal ? (
              <Pill tone='warn' title={refusal}>
                из раскладки: нормы нет — {refusalWord(best)}
              </Pill>
            ) : (
              <Pill tone='mut'>
                из раскладки: {conv ? `${conv.value} ${conv.unit}` : `${cons} см`}
              </Pill>
            )}
            {/* Кг-число обязано называть основу (Ф3): полная ширина рулона с кромкой ×
                плотность — иначе его не проверить ничем. Отказ называет нехватку, потому что
                лечится она заполнением артикула, а не сменой единицы слота. */}
            {kg?.basis && conv && (
              <Pill tone='mut' title={weightBasisNote(kg.basis)}>
                вес: {weightBasisLabel(kg.basis)}
              </Pill>
            )}
            {/* ТРИ СОСТОЯНИЯ КАТАЛОГА — СЛОВАМИ, и ни одно не называется «нет плотности»:
                загрузка — не отказ (тон mut), ошибка чтения и артикул вне выдачи — отказы, но
                про заполненность карточки материала они не утверждают ничего. */}
            {kg?.catalog === 'loading' && !refusal && (
              <Pill
                tone='mut'
                title='каталог материалов ещё читается — плотность и ширина артикула пока не прочитаны. Это загрузка, а не отказ: карточка материала может быть заполнена полностью'
              >
                вес: каталог читается…
              </Pill>
            )}
            {kg?.catalog === 'error' && !refusal && (
              <Pill
                tone='warn'
                title='каталог материалов не прочитался — плотность и ширину артикула прочитать не удалось. Это ошибка чтения, а не пустая карточка материала: перезагрузите страницу'
              >
                кг: каталог не прочитался
              </Pill>
            )}
            {kg?.catalog === 'missing' && !refusal && (
              <Pill
                tone='warn'
                title={`артикула #${kg.articleId} в каталоге материалов нет (удалён или недоступен) — основу веса взять неоткуда. Про его плотность это не говорит ничего`}
              >
                кг: артикул не найден в каталоге
              </Pill>
            )}
            {kg?.missing && !refusal && (
              <Pill tone='warn' title={weightRefusalText(kg.missing)}>
                {weightMissingShort(kg.missing)}
              </Pill>
            )}
            {/* Чьё это число: назначенной нормы или просто лучшей раскладки. Без подписи полоса
                называет цифру с одинаковой уверенностью в обоих случаях. */}
            {best.isNorm === true && (
              <Pill tone='ink' title='назначенная нормировочная раскладка этой ткани на карточке'>
                норма
              </Pill>
            )}
            {pieceSetChanged(best) && (
              <Pill
                tone='attention'
                title='набор деталей карточки изменился после съёмки этой раскладки — длина измерена по прежнему набору'
              >
                набор изменился
              </Pill>
            )}
            {isLegacyNorm(best) && (
              <Pill
                tone='mut'
                title='условия съёмки (припуск, слои, переворот) не записаны — раскладка снята до того, как их стали записывать'
              >
                старая норма
              </Pill>
            )}
            {skipped && (
              <Pill
                tone={skipped.isNorm === true ? 'warn' : 'mut'}
                title={scalarNormRefusal(skipped)}
              >
                {skipped.isNorm === true
                  ? 'назначенная норма'
                  : isDraftMarker(skipped)
                    ? 'свежий ЧЕРНОВИК'
                    : 'свежее измерение'}{' '}
                «{skipped.name}» расхода не даёт — {refusalWord(skipped)}
              </Pill>
            )}
            <Text size='nano' variant='label' component='span'>
              в рецептах: {current}
            </Text>
            {delta != null && Math.abs(delta) > 5 && (
              <Pill tone='warn'>
                {delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`}
              </Pill>
            )}
          </div>
          {stale && (
            <CalloutBox tone='warning'>
              рецепты не пересчитаны: применённое из раскладки {stale.applied.join(' / ')}{' '}
              {stale.unit} против нормы «{stale.name}» — {stale.value} {stale.unit}. Связи рецепта с
              раскладкой нет: переназначение нормы ничего не пересчитывает, и прежнее число будет
              стоять, пока норму не применят заново
              {/* НА КГ-СЛОТЕ У РАСХОЖДЕНИЯ ЕСТЬ ВТОРАЯ ПРИЧИНА, и приписывать его одной раскладке
                  нельзя: обе стороны переведены в вес, но применённое — основой ТОГО дня, а
                  правая — сегодняшней. Правка плотности или ширины артикула даёт то же
                  расхождение, не тронув ни одной раскладки. */}
              {kg?.basis
                ? `. Слот в килограммах: правая часть переведена сегодняшней основой (${weightBasisLabel(kg.basis)}) — правка ширины или плотности артикула даёт такое же расхождение сама по себе`
                : ''}
            </CalloutBox>
          )}
        </div>
      ))}
    </div>
  );
}
