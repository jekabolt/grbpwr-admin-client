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
// №2 (gone) the BOM no longer carries a cutting wastage %: the waste lives in the marker length.
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
import {
  Button,
  CalloutBox,
  Chip,
  ChipRow,
  ConfirmationModal,
  FoldCaret,
  HeaderWarnings,
  type HeaderWarning,
  Pill,
  HeaderNote,
  HeaderNoteTone,
  Row,
  Selector,
  Text,
  EmptyCell,
} from 'ui';
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
  markerNormProvenance,
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

/**
 * A fact about the number: a pill in the row, plain text when the hint stands in a group header
 * (`compact`: the fabric card's toolbar; owner, item 38: a header frames no words).
 */
function Mark({
  quiet,
  tone,
  title,
  children,
}: {
  quiet: boolean;
  tone: HeaderNoteTone;
  title?: string;
  children: React.ReactNode;
}) {
  return quiet ? (
    <HeaderNote tone={tone} title={title}>
      {children}
    </HeaderNote>
  ) : (
    <Pill tone={tone} title={title}>
      {children}
    </Pill>
  );
}

export function MarkerApplyHint({
  markers,
  colorwayId = 0,
  lineKey,
  unit,
  articleWidth,
  weightBasis,
  sizeIds,
  sizeNameById,
  canEdit,
  compact = false,
  onApply,
}: {
  markers: common_TechCardMarkerSummary[] | undefined;
  // Колорвей, чей рецепт редактируется. Список уже отфильтрован (свои + общие), но выбирать
  // ЛУЧШИЙ надо тоже с оглядкой на принадлежность, иначе свежий общий маркер перебьёт
  // собственный — см. betterMarker.
  colorwayId?: number;
  lineKey: string;
  unit: string;
  /** Unused: the cutting wastage % left the BOM. Kept optional for callers. */
  wastagePercent?: string;
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
  /**
   * Кнопка и ПИЛЮЛИ, но без строки «из раскладки: N · «имя» (состав)» — для тулбара в шапке
   * карточки (макет «лист»). Пилюли остаются: «норма», «набор изменился», «старая норма», отказ и
   * основа веса — это факты о ГОДНОСТИ числа, и узнать их надо до открытия диалога. Уходит только
   * предпросмотр числа: то же самое диалог показывает первой строкой, а в ряду из пяти кнопок эта
   * строка разрывала бы тулбар.
   */
  compact?: boolean;
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
  const [splitOpen, setSplitOpen] = useState(false);

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

  const sizeName = (id?: number) => sizeNameById.get(id ?? 0) ?? `#${id}`;
  const perSizeWhyNot = perSizeRefusal(plan, (id) => sizeName(id));
  const compLabel = (m: common_TechCardMarkerSummary) =>
    compositionLabel(compositionOf(m), (id) => sizeName(id)) || 'composition unreadable';
  // Label and number from the same marker — the CHOSEN one (the hint used to number by
  // `chosen` and label by the auto-picked marker, which diverged the moment the selector
  // was touched).
  // Ноль после округления в превью не показывается ЧИСЛОМ: «0 кг» на строке читался бы как
  // норма. Показывается измеренная длина в см — она-то ненулевая, и по ней видно, ЧТО округлилось.
  const preview =
    conv && !convZero
      ? `${conv.value} ${conv.unit}`
      : chosenCons != null
        ? `${chosenCons} cm`
        : '—';
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
  // Сам список полей и правило штампа живут в marker-io (`markerNormProvenance`): применений
  // теперь два — этот диалог и «раскладка комплекта» на карточке ткани, — и две копии этого списка
  // разъехались бы в тот день, когда провенанс получит третье поле.
  const provenance = markerNormProvenance;

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
        { bindingScopes, fabricScopes, isRollGoodsSection, scopeKeyOfBinding },
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
        .map((b) => ({
          lineKey: b.lineKey as string,
          purpose: b.purpose ?? '',
          section: b.section,
        }));
      const scopes = fabricScopes(rollGoods);
      const scope = key ? scopes.find((s) => s.lines.some((l) => l.lineKey === key)) : undefined;
      const sheets = bindingScopes(scopes, patternRows);
      const sources = patternSourcesForMarker(patternRows, {
        bomLineKey: key,
        purposeOwnsLine: (p, line) => !!scope && scopeKeyOfBinding(p, line, sheets) === scope.key,
      });
      if (sources.length === 0) {
        setAreas(null);
        setAreaError(
          'the card has no patterns for this fabric — nothing to measure the areas from',
        );
        return;
      }
      // Блоб едет ОТДЕЛЬНЫМ запросом: в сводке его нет намеренно (60–100 КБ на раскладку), а без
      // него неизвестны ни количества деталей на изделие, ни площади неградуируемых.
      const r = await adminService.GetTechCardMarker({ id: chosen.id ?? 0 });
      if (!r.marker) {
        setAreas(null);
        setAreaError('the marker was not found — it may have been deleted');
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
        e instanceof Error && e.message
          ? e.message
          : "couldn't measure the areas from the patterns",
      );
    } finally {
      setAreaBusy(false);
    }
  };

  // Всё, что мешает применить или делает число менее надёжным, — одной строкой в шапке тела.
  const unitShort =
    unitKind === 'kg' && !weightBasis.ok
      ? weightMissingShort(weightBasis.missing)
      : unit
        ? `unit “${unit}” takes neither length nor weight`
        : 'slot has no unit';
  const zeroShort = `norm rounds to zero in “${unit || '—'}”`;
  const sizesWord = (ids: number[]) => ids.map(sizeName).join(', ');
  const warnings: (HeaderWarning | null | undefined | false)[] = [
    mode === 'scalar' &&
      chosenRefusal && { text: `no single norm: ${refusalWord(chosen)}`, error: true },
    mode === 'scalar' && !chosenRefusal && !conv && { text: unitShort, error: true },
    mode === 'scalar' && !chosenRefusal && convZero && { text: zeroShort, error: true },
    mode === 'perSize' && plan.complete && !perSizeConvertible && { text: unitShort, error: true },
    mode === 'perSize' && perSizeZero && { text: zeroShort, error: true },
    mode === 'perSize' &&
      isDraftMarker(chosen) && { text: 'draft marker: its length is short', error: true },
    mode === 'perSize' && !plan.complete && perSizeWhyNot && { text: perSizeWhyNot, error: true },
    mode === 'perSize' && areaError && { text: areaError, error: true },
    mode === 'perSize' &&
      plan.continuation === 'blocked' &&
      plan.areaCheck && {
        text: `patterns changed since capture: ${plan.areaCheck.reason}`,
        error: true,
      },
    mode === 'perSize' &&
      plan.meanSizes.length > 0 &&
      `mean used for ${sizesWord(plan.meanSizes)}: no patterns`,
    notTheNorm &&
      normMarker &&
      (normRefusal
        ? `norm “${normMarker.name}” gives no consumption`
        : `not the norm “${normMarker.name}”${normConv ? ` (${normConv.value} ${normConv.unit})` : ''}`),
    mode === 'scalar' && widthMismatch && `marker on ${chosenW} cm, article ${artW} cm`,
    mode === 'perSize' &&
      mixedWidths &&
      `markers on ${Math.min(...perSizeWidths)}–${Math.max(...perSizeWidths)} cm cloth`,
    mode === 'perSize' &&
      perSizeWidthMismatch &&
      `markers on ${[...new Set(perSizeWidths)].join(' / ')} cm, article ${artW} cm`,
    mode === 'scalar' && offRunSize && `size ${sizeName(chosenSizeId)} is not in the card's range`,
    mode === 'scalar' &&
      spreadPct > 5 && {
        text: `sizes differ by ${spreadPct.toFixed(0)}%`,
        action: perSizeOffered
          ? { label: 'apply per size', onClick: () => setMode('perSize') }
          : undefined,
      },
    mode === 'scalar' && pieceSetChanged(chosen) && 'measured on the previous piece set',
    mode === 'perSize' &&
      perSizeChanged.length > 0 &&
      `previous piece set: ${perSizeChanged.join(', ')}`,
    mode === 'scalar' && isLegacyNorm(chosen) && 'capture conditions not recorded',
    mode === 'perSize' &&
      perSizeLegacy.length > 0 &&
      `capture conditions not recorded: ${perSizeLegacy.join(', ')}`,
    mode === 'perSize' &&
      plan.continuation === 'ok' &&
      plan.continuedSizes.length > 0 &&
      `${sizesWord(plan.continuedSizes)} continued from pattern areas`,
  ];

  // Отходы без длины настила — процентной подписью (её считают по тем же раскладкам, что apply).
  const wasteLine = (() => {
    const used = mode === 'scalar' ? [chosen] : appliedPerSize;
    const parts = used.map((m) => markerWasteDecomposition(m!)).filter((d) => d != null);
    if (parts.length === 0) return 'no recorded efficiency: waste cannot be split';
    const avg = (pick: (d: { selvedgePct: number; cutPct: number }) => number) =>
      parts.reduce((sum, d) => sum + pick(d!), 0) / parts.length;
    const sv = avg((d) => d.selvedgePct);
    const cut = avg((d) => d.cutPct);
    return `waste inside: selvedge ${sv.toFixed(1)}% + between pieces ${cut.toFixed(1)}%${
      sv === 0 ? " (article's selvedge not set)" : ''
    }`;
  })();

  // Закрытие диалога сбрасывает и посчитанные площади: они проверены против ОДНОЙ раскладки и
  // против СЕГОДНЯШНИХ файлов, а между открытиями могло измениться и то и другое.
  const reset = () => {
    setMarkerId(0);
    setMode('scalar');
    setAreas(null);
    setAreaError('');
    setSplitOpen(false);
  };

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {!compact && (
        <Text size='nano' variant='label' component='span'>
          from a marker: {chosenRefusal ? <EmptyCell /> : preview} · “{chosen.name}” (
          {compLabel(chosen)})
        </Text>
      )}
      {/* «Норма» — ПОДПИСЬ, а не порядок. Раньше назначенную раскладку можно было опознать только
          по тому, что её предложили первой, — то есть не отличить от «просто самой свежей». */}
      {chosen.isNorm === true && (
        <Mark
          quiet={compact}
          tone='ink'
          title='the marker set as the norm of this fabric on the card'
        >
          norm
        </Mark>
      )}
      {pieceSetChanged(chosen) && (
        <Mark
          quiet={compact}
          tone='attention'
          title="the card's piece set changed after this marker was captured — the length is measured on the previous set"
        >
          piece set changed
        </Mark>
      )}
      {isLegacyNorm(chosen) && (
        <Mark
          quiet={compact}
          tone='mut'
          title='the capture conditions (seam allowance, layers, flipping) are not recorded — this marker was captured before they started being recorded'
        >
          legacy norm
        </Mark>
      )}
      {/* Норма назначена, а предлагается не она — на строке это видно только здесь: диалог с
          объяснением ещё надо открыть, а прочитать число можно и не открывая. */}
      {notTheNorm && normRefusal && (
        <Mark quiet={compact} tone='warn' title={normRefusal}>
          the norm gives no consumption
        </Mark>
      )}
      {chosenRefusal && (
        <Mark quiet={compact} tone='warn' title={chosenRefusal}>
          {refusalWord(chosen)}
        </Mark>
      )}
      {/* Кг-слот (Ф3): основа веса называется ПРЯМО НА СТРОКЕ. Успех — какой шириной и
          плотностью посчитано (ширина полная, с кромкой); отказ — чего именно не хватает,
          потому что лечится он заполнением артикула, а не сменой единицы. */}
      {unitKind === 'kg' && fabric && conv && (
        <Mark quiet={compact} tone='mut' title={weightBasisNote(fabric)}>
          weight: {weightBasisLabel(fabric)}
        </Mark>
      )}
      {unitKind === 'kg' && !weightBasis.ok && (
        <Mark
          quiet={compact}
          tone='warn'
          title={weightRefusalText(weightBasis.missing, weightBasis.pinned)}
        >
          {weightMissingShort(weightBasis.missing)}
        </Mark>
      )}
      {canEdit && (
        <Button
          type='button'
          variant={compact ? 'underline' : 'secondary'}
          size='xs'
          className={compact ? 'text-labelColor hover:text-textColor' : undefined}
          onClick={() => setOpen(true)}
        >
          apply…
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
        title={`apply norm from marker “${chosen.name ?? ''}”`}
        confirmLabel='apply'
        confirmDisabled={!applyPossible}
        footerHint={
          applyPossible
            ? undefined
            : mode === 'scalar'
              ? chosenRefusal
                ? 'this marker gives no single norm'
                : 'no number in the slot unit'
              : 'not every size has a number'
        }
        closeOnConfirm={false}
        hideCancel
        // Everything that blocks applying, or makes the number less certain than it looks.
        headerActions={<HeaderWarnings items={warnings} />}
      >
        <div className='space-y-2.5'>
          {/* Селектор в обоих режимах: в «по размерам» выбранная раскладка ещё и базис продолжения.
              Список идёт ПО РАНГУ (норма → свой колорвей → свежесть), неприменимые подписаны. */}
          {lineMarkers.length > 1 && (
            <div className='max-w-xl'>
              <Selector
                label='marker'
                value={chosen.id ?? 0}
                options={ranked.map((m) => {
                  const c = consumptionCm(m);
                  return {
                    value: m.id ?? 0,
                    label: `${m.isNorm === true ? 'norm · ' : ''}“${m.name}” · ${compLabel(m)} · ${
                      c != null ? `${c} cm/unit` : `no norm: ${refusalWord(m)}`
                    }${
                      isDraftMarker(m) && Number(m.totalCount ?? 0) > Number(m.placedCount ?? 0)
                        ? ` (placed ${m.placedCount ?? 0} of ${m.totalCount ?? 0})`
                        : ''
                    }${pieceSetChanged(m) ? ' · piece set changed' : ''}`,
                  };
                })}
                onChange={(v: string | number) => {
                  setMarkerId(Number(v));
                  // Площади посчитаны против конкретной раскладки: для другой они не проверены.
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
              one number
            </Chip>
            <Chip
              selected={mode === 'perSize'}
              pressed={mode === 'perSize'}
              disabled={!perSizeOffered}
              title={perSizeOffered ? undefined : 'no card size is cut in a complete marker'}
              onClick={() => perSizeOffered && setMode('perSize')}
            >
              per size
            </Chip>
          </ChipRow>

          {mode === 'scalar' && !chosenRefusal && (
            <Row
              label='per unit'
              value={conv && !convZero ? `${conv.value} ${conv.unit}` : <EmptyCell />}
            />
          )}

          {mode === 'perSize' && (
            <div className='flex flex-col gap-1.5'>
              {/* Число и происхождение — в одной строке таблицы: «из раскладки», «по площади
                  выкроек», «СРЕДНЕЕ» стоят разного. */}
              <MarkerPerSizeTable
                rows={plan.rows.map((r) => ({
                  sizeId: r.sizeId,
                  consumptionCm: r.consumptionCm,
                  areaCm2: r.areaCm2,
                  origin: r.origin ?? '',
                  originLabel: originLabel(r.origin),
                  originTitle:
                    r.origin === 'area'
                      ? `continued from the pattern area (${(r.areaCm2 ?? 0).toFixed(0)} cm² per unit)`
                      : r.origin === 'mean'
                        ? `no patterns for this size: the mean over “${chosen.name}”`
                        : r.marker
                          ? `measured by “${r.marker.name}”`
                          : undefined,
                }))}
                sizeNameById={sizeNameById}
                unit={unit}
                fabric={fabric}
                toUnit={(cm) => toBomUnit(cm, unit, fabric)}
              />
              {/* Продолжение — по нажатию: это мегабайты с CDN и разбор DXF. */}
              {continuationOffered && (
                <div>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    disabled={areaBusy}
                    title={`measure ${plan.unansweredSizes.map(sizeName).join(', ')} on today's patterns`}
                    onClick={continueByAreas}
                  >
                    {areaBusy ? 'measuring…' : 'fill the rest from patterns'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Арифметика и разложение отходов — за складкой: проверять их нужно редко. */}
          {applyPossible && (
            <div>
              <Button
                type='button'
                variant='underline'
                size='xs'
                aria-expanded={splitOpen}
                onClick={() => setSplitOpen((o) => !o)}
              >
                how it was split
                <FoldCaret open={splitOpen} />
              </Button>
              {splitOpen && (
                <div className='flex flex-col gap-1.5 pt-1'>
                  {mode === 'scalar' && (
                    <MarkerLengthFormula
                      lengthCm={decNum(chosen.usedLengthCm)}
                      units={totalUnitsOf(chosen)}
                      unitsLabel={compositionSummary(chosen, sizeName)}
                      perGarment={conv && !convZero ? conv.value : null}
                      unit={unit}
                      widthCm={chosenW}
                    />
                  )}
                  {splitMarker ? (
                    <MarkerAreaSplit
                      marker={splitMarker}
                      unit={unit}
                      fabric={fabric}
                      units={totalUnitsOf(splitMarker)}
                    />
                  ) : (
                    <Text size='nano' variant='label' component='p'>
                      {wasteLine}
                    </Text>
                  )}
                  {unitKind === 'kg' && fabric && (
                    <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
                      {weightBasisNote(fabric)}
                    </Text>
                  )}
                </div>
              )}
            </div>
          )}
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
          ? 'per size'
          : scalars.size === 0
            ? pinnedScalars.size > 0
              ? ''
              : '—'
            : scalars.size === 1
              ? [...scalars][0]
              : `they differ (${[...scalars].join(' / ')})`;
        const current =
          !perSize && pinnedScalars.size > 0
            ? [
                comparable,
                `pinned to a different article: ${[...pinnedScalars].join(' / ')} — not compared, a different fabric`,
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
        consumption from markers — applied in the colorway recipe, the colourways tab
      </Text>
      {rows.map(({ line, best, conv, cons, refusal, current, delta, skipped, stale, kg }) => (
        <div key={line.lineKey} className='space-y-1'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Text size='micro' component='span' className='min-w-0 truncate'>
              {line.name?.trim() || 'fabric'}
            </Text>
            {refusal ? (
              <Pill tone='warn' title={refusal}>
                from a marker: no norm — {refusalWord(best)}
              </Pill>
            ) : (
              <Pill tone='mut'>
                from a marker: {conv ? `${conv.value} ${conv.unit}` : `${cons} cm`}
              </Pill>
            )}
            {/* Кг-число обязано называть основу (Ф3): полная ширина рулона с кромкой ×
                плотность — иначе его не проверить ничем. Отказ называет нехватку, потому что
                лечится она заполнением артикула, а не сменой единицы слота. */}
            {kg?.basis && conv && (
              <Pill tone='mut' title={weightBasisNote(kg.basis)}>
                weight: {weightBasisLabel(kg.basis)}
              </Pill>
            )}
            {/* ТРИ СОСТОЯНИЯ КАТАЛОГА — СЛОВАМИ, и ни одно не называется «нет плотности»:
                загрузка — не отказ (тон mut), ошибка чтения и артикул вне выдачи — отказы, но
                про заполненность карточки материала они не утверждают ничего. */}
            {kg?.catalog === 'loading' && !refusal && (
              <Pill
                tone='mut'
                title="the materials catalog is still being read — the article's density and width are not read yet. This is loading, not a refusal: the material card may well be filled in completely"
              >
                weight: reading the catalog…
              </Pill>
            )}
            {kg?.catalog === 'error' && !refusal && (
              <Pill
                tone='warn'
                title="the materials catalog didn't read — the article's density and width could not be read. This is a read error, not an empty material card: refresh the page"
              >
                kg: the catalog didn't read
              </Pill>
            )}
            {kg?.catalog === 'missing' && !refusal && (
              <Pill
                tone='warn'
                title={`article #${kg.articleId} is not in the materials catalog (deleted or unavailable) — there is nowhere to take the weight basis from. This says nothing about its density`}
              >
                kg: article not found in the catalog
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
              <Pill tone='ink' title='the marker set as the norm of this fabric on the card'>
                norm
              </Pill>
            )}
            {pieceSetChanged(best) && (
              <Pill
                tone='attention'
                title="the card's piece set changed after this marker was captured — the length is measured on the previous set"
              >
                piece set changed
              </Pill>
            )}
            {isLegacyNorm(best) && (
              <Pill
                tone='mut'
                title='the capture conditions (seam allowance, layers, flipping) are not recorded — this marker was captured before they started being recorded'
              >
                legacy norm
              </Pill>
            )}
            {skipped && (
              <Pill
                tone={skipped.isNorm === true ? 'warn' : 'mut'}
                title={scalarNormRefusal(skipped)}
              >
                {skipped.isNorm === true
                  ? 'the assigned norm'
                  : isDraftMarker(skipped)
                    ? 'a fresher DRAFT'
                    : 'a fresher measurement'}{' '}
                “{skipped.name}” gives no consumption — {refusalWord(skipped)}
              </Pill>
            )}
            <Text size='nano' variant='label' component='span'>
              in the recipes: {current}
            </Text>
            {delta != null && Math.abs(delta) > 5 && (
              <Pill tone='warn'>
                {delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`}
              </Pill>
            )}
          </div>
          {stale && (
            <CalloutBox tone='warning'>
              the recipes are not recomputed: applied from a marker {stale.applied.join(' / ')}{' '}
              {stale.unit} against the norm “{stale.name}” — {stale.value} {stale.unit}. There is no
              link from the recipe to the marker: reassigning the norm recomputes nothing, and the
              old number stands until the norm is applied again
              {/* НА КГ-СЛОТЕ У РАСХОЖДЕНИЯ ЕСТЬ ВТОРАЯ ПРИЧИНА, и приписывать его одной раскладке
                  нельзя: обе стороны переведены в вес, но применённое — основой ТОГО дня, а
                  правая — сегодняшней. Правка плотности или ширины артикула даёт то же
                  расхождение, не тронув ни одной раскладки. */}
              {kg?.basis
                ? `. The slot is in kilograms: the right-hand side is converted with today's basis (${weightBasisLabel(kg.basis)}) — editing the article's width or density gives the same divergence all by itself`
                : ''}
            </CalloutBox>
          )}
        </div>
      ))}
    </div>
  );
}
