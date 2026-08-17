// «По выкройкам» — норма расхода из площади деталей, без раскладки (`consumption_source='dxf'`, 0294).
//
// ЗАЧЕМ ОН РЯДОМ С «ИЗ РАСКЛАДКИ». Раскладка — лучший ответ: её длина ИЗМЕРЕНА, в ней уже лежат
// межлекальные выпады, и костинг такую норму не гроссит. Но раскладки на карточке может не быть
// вовсе — а себестоимость стиля и потребность до первого прогона считаются уже сейчас, и до сих
// пор единственным выходом был ручной ввод: число «на глаз», умноженное на процент раскроя «на
// глаз». Выкройки в этот момент есть, и площадь каждой детали в них — факт.
//
// ЧТО ЭТОТ ДИАЛОГ ОБЯЗАН СКАЗАТЬ ВСЛУХ, И ГОВОРИТ:
//   • число NETTO. Межлекальных выпадов и концов настила в нём нет и быть не может; за них
//     платит процент раскроя слота, и сервер его доначисляет именно потому, что источник не
//     'marker'. Поэтому применение на слот с ПУСТЫМ процентом ЗАПРЕЩЕНО прямо здесь: netto
//     без процента уходит в закупку заведомо занижённым (гейт готовности прогона на такой паре
//     ставит блокер — эта кнопка не даёт до него дойти).
//
//     КРОМКИ В СПИСКЕ ТОГО, ЧТО ДОНАЧИСЛЯЕТ ПРОЦЕНТ, НЕТ — И ЭТО АРИФМЕТИКА, А НЕ ВКУС.
//     Тексты этого диалога (и разбора нормы в строке рецепта) до правки называли кромку среди
//     покрываемого процентом и в таком виде уехали на бету; оператор, поверивший им, настроил
//     бы процент С кромочной составляющей — двойной учёт. Считается так: netto-длина = площадь
//     деталей ÷ РАСКРОЙНАЯ ширина (рулон − 2×кромка). Купив 1 м рулона 150 см при раскройной
//     144 см, получаешь 15000 см² полотна, из которых 14400 идут в дело, — 600 см² кромки УЖЕ
//     куплены и уже сидят в netto-длине. Кромка учтена делением, ровно один раз. Процент
//     раскроя слота покрывает: межлекальные выпады (качество раскладки), концевые потери
//     настила, стыки и обход пороков. Кромку — НЕТ. То же в килограммах: kg = netto-длина ×
//     ПОЛНАЯ ширина × плотность — масса покупаемого полотна вместе с кромкой, один раз.
//   • по какой ЛИНИИ считано. Слой 14 несёт линию шва, слой 1 — линию кроя базового размера;
//     ошибка здесь меняет норму на припуск по всему периметру каждой детали. Слой выбирается тем
//     же ранжированием, что в раскладке и в сопоставлении деталей, а припуск предзаполняется
//     ЗАМЕРОМ файла (`seamAllowancePrefill`) — и подпись говорит, откуда взялось число.
//   • по какой ШИРИНЕ поделено. Раскройная (рулон − 2×кромка), а не полная: кромку не кроят.
//
// РЕЖИМ ОДИН — ПО РАЗМЕРАМ, и это не упущение. План материалов прогона ходит по линиям
// (изделие × размер) и берёт норму размера, а при её отсутствии — скаляр НА ЛЮБОЙ размер: одна
// цифра, снятая с площади M, поехала бы в потребность XL. Скаляр здесь был бы ровно той
// нечестностью, за которую сервер отказывает смешанной раскладке в средней норме.
import { useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { mmToEngineCm } from './nesting/allowance-units';
import { useSnackBarStore } from 'lib/stores/store';
import { publishPieceAreas, useUnsavedAreaSource } from './piece-areas';
import { serverScopeKeyOfSheet } from './pattern-size-index';
import { fabricScopes, isRollGoodsSection, scopeKeyOfBinding } from './bom-purpose';
import { sizeTokensOf } from './nesting/block-code';
import {
  DxfMeasureConditionsFields,
  useDxfMeasureConditions,
} from './nesting/dxf-measure-conditions';
import { dxfNormAreas, dxfNormValueRows, type DxfNormPiece } from './nesting/dxf-consumption';
import {
  BreakdownSizeChips,
  fmtInt,
  middleSize,
  NettoFormula,
} from './nesting/dxf-piece-breakdown';
import {
  weightBasisNote,
  weightRefusalText,
  type WeightBasisResolution,
} from './nesting/fabric-weight';
import { bomUnitKind } from './nesting/marker-io';
import type { TechCardFormData } from './schema';

export default function DxfApplyDialog({
  control,
  pieces,
  unaliasedPieces,
  unit,
  wastagePercent,
  articleWidth,
  weightBasis,
  sizeIds,
  sizeNameById,
  canEdit,
  techCardId,
  lineKey,
  onClose,
  onApply,
}: {
  /** id карточки; 0 = ещё не сохранена, публиковать площади некуда. */
  techCardId: number;
  /** line_key строки BOM этой ткани — из него резолвится скоуп словами сервера. */
  lineKey: string;
  // Форма приходит ЯВНЫМ control'ом, а не через useFormContext ЗДЕСЬ: два поля ниже читаются
  // именно из неё, и пробрасывать их сквозь обёртку значило бы дублировать. (Пачку DXF собирает
  // useCardDxfPack, и она контекст всё-таки берёт — у неё нет другого способа, и она вызвана в
  // компоненте, который монтируется только внутри формы.)
  control: Control<TechCardFormData>;
  /** Детали кроя этой ткани с количеством на изделие — разрешены лёгкой обёрткой (dxf-apply.tsx). */
  pieces: DxfNormPiece[];
  /** Детали этой же ткани БЕЗ связи с блоком чертежа — расчёт на них отказывает, см. dxfNormAreas. */
  unaliasedPieces: string[];
  unit: string;
  /** Процент раскроя слота. Пустой = применять нельзя, см. заголовок файла. */
  wastagePercent: string;
  /** РАСКРОЙНАЯ ширина эффективного артикула, см (рулон − 2×кромка). '' = неизвестна. */
  articleWidth: string;
  /**
   * Основа веса кг-слота (Ф3): ПОЛНАЯ ширина рулона × плотность артикула. Резолвит строка
   * рецепта (weightBasisOf) — у диалога нет ни артикула, ни пина, и выбирать числа сам он не
   * имеет права. Netto-длина по-прежнему делится на РАСКРОЙНУЮ ширину; полная нужна только весу.
   */
  weightBasis: WeightBasisResolution;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  /** Диалог монтируется ТОЛЬКО открытым — обёртка держит состояние, чтобы геометрия не грузилась. */
  onClose: () => void;
  onApply: (patch: {
    consumption?: string;
    quantity?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
    normMarkerId?: number;
  }) => void;
}) {
  // УСЛОВИЯ ЗАМЕРА — ОБЩИМ КОДОМ с отдельным действием «замерить площади деталей» на вкладке
  // выкроек (nesting/dxf-measure-conditions.tsx): разбор пачки, выбор слоя, прифилл припуска и все
  // запреты. Оба входа пишут ОДНУ И ТУ ЖЕ таблицу площадей, и мерить они обязаны по одному контуру
  // — иначе одна карточка, померенная двумя кнопками, дала бы две площади без единого слова о том,
  // почему. Из формы там читается стандарт припуска карточки; детали кроя и скоуп ткани сюда
  // приходят готовыми от лёгкой обёртки.
  const conditions = useDxfMeasureConditions(control);
  const { index, layer: chosenLayer, seamMm: seamValue } = conditions;

  const widthCm = parseDecimalNumber(articleWidth);
  const wastage = parseDecimalNumber(wastagePercent);
  const wastageMissing = !Number.isFinite(wastage);
  const unitKind = bomUnitKind(unit);
  const fabric = weightBasis.ok ? weightBasis.basis : undefined;

  const outcome = useMemo(() => {
    if (!index) return null;
    return dxfNormAreas({
      index,
      pieces,
      unaliasedPieces,
      sizeIds,
      tokensOfSize: (id) => sizeTokensOf(sizeNameById.get(id)),
      contourLayer: chosenLayer,
      allowanceCm: mmToEngineCm(seamValue) ?? 0,
    });
  }, [index, pieces, unaliasedPieces, sizeIds, sizeNameById, chosenLayer, seamValue]);

  // Строки применения: размер → netto в единице линии — общей функцией с пересчётом по текущим
  // данным (dxfNormValueRows), включая правило «ноль после округления — не норма»: `toBomUnit` округляет
  // метры до трёх знаков (колонка DECIMAL(10,3)), и крошечная площадь честно превращается в 0.000 —
  // строка сохранилась бы «с нормой», которая ничего не требует, и дефицит на прогоне вышел бы
  // нулевым. Полное покрытие ряда или ничего — частичный ряд заставил бы план подставлять скаляр
  // (которого не будет) на непокрытые размеры.
  const rows = useMemo(() => {
    if (!outcome?.ok || !(widthCm > 0)) return [];
    return dxfNormValueRows(outcome.areas.rows, widthCm, unit, fabric);
  }, [outcome, widthCm, unit, fabric]);
  const complete = rows.length === sizeIds.length && rows.every((r) => r.value != null);
  // Запреты УСЛОВИЙ ЗАМЕРА (припуск не число, припуск выше потолка, двойной припуск, частично
  // скачанная пачка, ещё не прочитанные настройки цеха) держит общий хук — они одни и те же для
  // любого, кто мерит по DXF. Здесь остаётся то, что есть только у нормы: полный ряд, процент
  // раскроя слота и право писать в карточку.
  const applicable = complete && !wastageMissing && canEdit && !conditions.blocked;

  // РАЗМЕР, НА КОТОРОМ ПОКАЗАН РАЗБОР. Применяется ВЕСЬ ряд и только он (частичный заставил бы план
  // прогона подставлять скаляр, которого здесь не будет), но ОБЪЯСНИТЬ норму можно только на одном
  // размере: у градуируемой детали площадь в S и в XL разная, и среднее по ряду не соответствует ни
  // одному настилу. По умолчанию срединный — тот же, которым по всей карточке рисуются силуэты
  // деталей, чтобы картинка и число описывали одну и ту же геометрию.
  const areaRows = outcome?.ok ? outcome.areas.rows : [];
  const shownSizeIds = useMemo(() => areaRows.map((r) => r.sizeId), [areaRows]);
  const [pickedSize, setPickedSize] = useState<number | null>(null);
  const shownSize =
    pickedSize != null && shownSizeIds.includes(pickedSize) ? pickedSize : middleSize(shownSizeIds);

  const { showMessage } = useSnackBarStore();
  const queryClient = useQueryClient();
  const patternRows = (useWatch({ control, name: 'patterns' }) ?? []) as {
    lineKey?: string;
    fabricPurpose?: string;
    bomLineKey?: string;
  }[];
  const bomRows = (useWatch({ control, name: 'bomItems' }) ?? []) as {
    lineKey?: string;
    purpose?: string;
    name?: string;
    section?: string;
  }[];
  // Скоуп ЭТОЙ строки словами сервера: назначение, иначе её собственный line_key.
  const lineScopeKey = useMemo(() => {
    const row = bomRows.find((b) => (b.lineKey ?? '') === lineKey);
    return serverScopeKeyOfSheet({ fabricPurpose: row?.purpose, bomLineKey: row?.lineKey });
  }, [bomRows, lineKey]);

  const sizeName = (id: number) => sizeNameById.get(id) ?? `#${id}`;

  // КУДА ПУБЛИКОВАТЬ ПЛОЩАДИ, И ПО КАКИМ ЛИСТАМ ОТВЕЧАТЬ.
  //
  // Скоуп называется ТЕМ ЖЕ словом, что на сервере (`serverScopeKeyOfSheet`), а не ключом строки
  // BOM: сервер собирает состав скоупа по СВОИМ строкам, и ключ, написанный не тем словом, не
  // найдёт ни одного листа. Карточка без id (ещё не сохранена) публиковать не может.
  //
  // ЛИСТЫ БЕРУТСЯ ПО РАЗРЕШЁННОМУ СКОУПУ, А НЕ ПО СЫРОМУ КЛЮЧУ, и это правка, а не стиль. Геометрия
  // приходит из карточного индекса, который группирует файлы по РАЗРЕШЁННОМУ скоупу (лист строки L
  // принадлежит назначению P, если L разложена в P). Прежний фильтр по сырому ключу отбирал из них
  // подмножество и публиковал его как полный набор: площадь считалась в том числе по листу, за
  // который отпечаток не отвечал, — перезалив его, оператор менял площади и НЕ делал замер
  // устаревшим. Теперь набор один и тот же, а расхождение сырых привязок внутри него — отказ, общий
  // с отдельным действием на вкладке выкроек (`pieceAreaSheetsRefusal`).
  //
  // Листы берутся ВСЕ, включая наследие в PDF: отпечаток сервер считает по своим строкам
  // `tech_card_size_pattern`, а они форматом не отбираются.
  // Правлен ли ИСТОЧНИК замера и не сохранён — общее правило обеих точек публикации (piece-areas.ts).
  const sourceDirty = useUnsavedAreaSource(control);
  const publishTarget = useMemo(() => {
    const id = Number(techCardId) || 0;
    if (id <= 0 || !lineScopeKey) return null;
    const scopes = fabricScopes(
      bomRows
        .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
        .map((b) => ({ lineKey: b.lineKey as string, purpose: b.purpose, name: b.name })),
    );
    const resolvedKey = scopes.find((s) => s.lines.some((l) => l.lineKey === lineKey))?.key ?? '';
    if (!resolvedKey) return null;
    const mine = (patternRows ?? []).filter(
      (sh) => scopeKeyOfBinding(sh.fabricPurpose, sh.bomLineKey, scopes) === resolvedKey,
    );
    if (mine.length === 0) return null;
    return { techCardId: id, scopeKey: lineScopeKey, sheets: mine };
  }, [techCardId, patternRows, bomRows, lineKey, lineScopeKey]);

  const apply = () => {
    if (!applicable) return;
    // ПЛОЩАДИ УЕЗЖАЮТ НА СЕРВЕР ЗДЕСЬ, И ИМЕННО ЗДЕСЬ (Ф0/Ф1).
    //
    // Это единственная точка, где оператор ПОДТВЕРДИЛ условия замера — слой контура и припуск, — а
    // те же площади уже посчитаны для нормы. Писать их фоном при открытии вкладки значило бы
    // сохранять данные на действии чтения, да ещё с угаданными условиями: ошибка в слое молча
    // меняет площадь на величину припуска по всему периметру каждой детали.
    //
    // Публикация НЕ БЛОКИРУЕТ применение нормы и не может его отменить: норма уже посчитана и
    // подтверждена, а площади — это то, из чего сервер потом выведет ОЦЕНКУ для слотов, где нормы
    // никто не вписал. Отказ сервера (например, неполный комплект скоупа) остаётся сообщением, а не
    // провалом операции, которую человек только что подтвердил.
    //
    // …НО НЕ С НЕСОХРАНЁННЫМ ИСТОЧНИКОМ. Комплект деталей здесь собран из ФОРМЫ
    // (useFabricDxfPieces читает pieceDxfAliases), а полноту присланного набора сервер доказывает
    // против СВОИХ, сохранённых связей. Если деталь только что перепривязали к другому блоку, а
    // состав деталей не изменился, серверная сверка «в обе стороны» пройдёт против СТАРЫХ связей —
    // и площади, снятые с геометрии, которой сохранённая карточка не заявляет, лягут в базу МОЛЧА.
    // Отказаться после этого от правок формы значит остаться с неверными площадями без следа.
    //
    // Норму это НЕ отменяет: её человек только что подтвердил, она посчитана и применяется ниже.
    // Не уезжают только площади — и об этом говорится вслух, вместе с тем, что делать.
    if (publishTarget && outcome?.ok && sourceDirty) {
      showMessage(
        'the norm is applied; the areas are NOT saved: the patterns or the block→piece links have been edited and not saved — the server checks the set against the saved links. save the card and measure the areas on the patterns tab',
        'error',
      );
    } else if (publishTarget && outcome?.ok) {
      void publishPieceAreas({
        techCardId: publishTarget.techCardId,
        scopeKey: publishTarget.scopeKey,
        sheets: publishTarget.sheets,
        areas: outcome.areas.pieceRows,
        contourLayer: chosenLayer,
        seamAllowanceMm: Number(seamValue) || 0,
        nameOfPiece: (key) => pieces.find((p) => (p.lineKey ?? '').trim() === key)?.name ?? key,
      }).then((res) => {
        if (!res.ok) {
          showMessage(`the norm is applied, but the areas were not saved: ${res.reason}`, 'error');
          return;
        }
        // Состояние замера показывает вкладка выкроек, и читает она его ИЗ ОТВЕТА СЕРВЕРА (свежесть
        // считает он). Без сброса чтения плитка ткани продолжала бы писать «площади не замерены»
        // над только что записанным замером — до перезагрузки страницы.
        queryClient.invalidateQueries({ queryKey: techCardKeys.detail(publishTarget.techCardId) });
      });
    }
    onApply({
      // Скаляр СНИМАЕТСЯ явно: одна оставшаяся строка заставила бы сервер игнорировать ряд.
      consumption: '',
      // КОЛИЧЕСТВО СНИМАЕТСЯ ТОЖЕ, И ЭТО НЕ УБОРКА. LineTotal читает Quantity ПЕРВЫМ (штук × цена,
      // без гросс-апа), а план материалов на той же строке берёт расход — строка с обоими полями
      // раскалывает себестоимость и потребность. Сервер такую форму на источнике 'dxf' прямо
      // отказывает (validateDxfNormShape), причём отказом на ВЕСЬ рецепт и позже, на сохранении
      // колорвея: без этой строки применение к легаси-строке (обоими полями заполненной с 0079)
      // выглядело бы удавшимся, а рушилось бы потом и в другом месте.
      quantity: '',
      sizeConsumptions: rows.map((r) => ({ sizeId: r.sizeId, consumption: r.value! })),
      consumptionSource: 'dxf',
      // Разложение отходов описывает измеренную раскладку — у площади деталей его нет, и сервер
      // отказывает паре (dxf + проценты). Штамп нормы снимается явно: 0, а не пропуск поля, иначе
      // прежний марочный штамп пережил бы применение и стал описывать не то число.
      wasteSelvedgePct: '',
      wasteCutPct: '',
      normMarkerId: 0,
    });
    onClose();
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onConfirm={apply}
      onCancel={onClose}
      title='consumption norm from the patterns'
      confirmLabel='apply per size'
      confirmDisabled={!applicable}
      closeOnConfirm={false}
      // Ширина по умолчанию (`md` — не фиксированная, а МИНИМУМ): с уходом таблицы «расход по
      // деталям» держать здесь `lg` стало нечем — полоса формулы и ряд из пяти размеров помещаются
      // в форму, а окно во весь экран ради них читалось бы как окно, которому нечего показать.
    >
      <div className='space-y-2.5'>
        {/* ── ЧТО МЕШАЕТ ПРИМЕНИТЬ — ПЕРВЫМ, И БЕЗ ИСКЛЮЧЕНИЙ ────────────────────────────────
            Отказ, лежащий под таблицей, читается после того, как оператор уже поверил числу. */}
        {wastageMissing && (
          // ОТКУДА ВЗЯТЬ ПРОЦЕНТ — говорится прямо в отказе (T7): отказ без ответа на этот
          // вопрос отправлял оператора искать число самостоятельно, а ближайшее похожее число в
          // системе — коэффициент раскроя артикула — считается от ДРУГОЙ базы (длина раскладки,
          // выпады уже внутри) и, вписанный сюда, занижает закупку на все выпады. Волна 1 честно
          // говорила «посчитать пока не из чего»; с волной 2 это утверждение стало временны́м —
          // у поля на вкладке BOM теперь живая панель «процент по факту настилов», и отказ зовёт
          // к ней, а не пересказывает её состояние (второго запроса отсюда не делается: диалог
          // не знает, набраны ли замеры, и не должен врать в обе стороны).
          <CalloutBox tone='warning'>
            the slot has NO wastage percent set. without it the net figure goes into the cost and
            into purchasing as the final number — that is, it understates both by all the cutting
            waste. fill in the slot's wastage percent on the BOM tab and applying becomes available:
            the field there carries a suggestion, “wastage percent from actual lays” — the median
            over measurements of this article's past cuttings, once three of them have accumulated;
            while there are fewer, the percent is estimated by hand. don't carry the article's
            cutting coefficient over here: it is measured from the marker length and contains none
            of the waste between pieces.
          </CalloutBox>
        )}

        {!(widthCm > 0) && (
          <CalloutBox tone='warning'>
            the article has no cloth width filled in — there is nothing to divide the area by. a
            nominal value can't be substituted: an error in the width enters the norm linearly and is
            invisible in every number.
          </CalloutBox>
        )}

        {outcome && !outcome.ok && <CalloutBox tone='warning'>{outcome.reason}</CalloutBox>}

        {/* Отказ по единице и ноль после округления — тоже блокеры, и стоят они здесь, а не под
            таблицей: при них применить нельзя, и число ниже показано ровно затем, чтобы было видно,
            ЧТО именно не переводится. */}
        {outcome?.ok && rows.some((r) => r.conv == null) && (
          // Кг-слот называет, ЧЕГО не хватает — ширины или плотности: «единица не принимает длину»
          // отправила бы оператора менять единицу вместо того, чтобы заполнить артикул. Пустая
          // единица — своя починка: единица нормы = единица слота (фолбэка в единицу артикула нет),
          // и лечится это на вкладке BOM, а не здесь.
          <CalloutBox tone='warning'>
            {unitKind === 'kg' && !weightBasis.ok
              ? weightRefusalText(weightBasis.missing, weightBasis.pinned)
              : unit
                ? `the slot's unit “${unit}” takes neither length nor weight: it can be applied in metres, centimetres or kilograms.`
                : "the slot has no unit filled in — the norm is written in the slot's unit, and there is nothing to apply it in. fill in the unit on the BOM tab."}
          </CalloutBox>
        )}
        {/* НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ — НЕ НОРМА. Метры округляются до трёх знаков (столько держит
            колонка), и крошечная площадь честно становится 0.000: строка сохранилась бы «с нормой»,
            которая ничего не требует, а дефицит на прогоне вышел бы нулевым.
            СОВЕТ РАЗВЕДЁН ПО РАЗМЕРНОСТИ: на весовой строке «выберите см» превратил бы её в
            длиновую — единица строки согласована с закупочной ценой, и смена размерности
            разъехалась бы с ценой за килограмм. */}
        {outcome?.ok && rows.some((r) => r.conv != null && !(r.conv.value > 0)) && (
          <CalloutBox tone='warning'>
            {unitKind === 'kg'
              ? `after conversion to “${unit}” the norm rounds to zero — the weight per garment is under half a gram. a zero would mean “no fabric is needed”. the slot is a weight one: don't change its unit to centimetres (that would change the line's dimension and diverge from the purchase price per kilogram) — check the article's density and width, and whether the right contour layer is picked.`
              : `after conversion to “${unit || '—'}” the norm rounds to zero — the area is too small for this unit. a zero would mean “no fabric is needed”; pick a finer unit (cm), or check whether the right contour layer is picked.`}
          </CalloutBox>
        )}
        {outcome?.ok && outcome.areas.sizesIncomplete.length > 0 && (
          <CalloutBox tone='warning'>
            not all pieces were found for the sizes:{' '}
            {outcome.areas.sizesIncomplete.map(sizeName).join(', ')}. the norm is written for the
            WHOLE range or not at all: an uncovered size would take the scalar in the run plan, and
            there is none here.
          </CalloutBox>
        )}

        {/* ── ЧИСЛО И ЕГО ФОРМУЛА ────────────────────────────────────────────────────────────
            Раньше диалог открывался пятистрочным абзацем, а результат лежал под ним таблицей в
            один вес со всем остальным. Порядок теперь говорит то же, что и порядок в строке
            рецепта: сначала ЧИСЛО и из чего оно, потом условия, потом объяснение. */}
        {outcome?.ok && areaRows.length > 0 && (
          <div>
            <GroupLabel
              flush
              action={
                <BreakdownSizeChips
                  sizeIds={shownSizeIds}
                  sizeId={shownSize}
                  sizeNameById={sizeNameById}
                  onChange={setPickedSize}
                  label=''
                />
              }
            >
              {`norm · size ${formatSizeName(sizeName(shownSize))}`}
            </GroupLabel>
            <div className='flex flex-col gap-1.5 pt-1'>
              <NettoFormula
                areaCm2={areaRows.find((r) => r.sizeId === shownSize)?.areaCm2 ?? 0}
                sizeLabel={formatSizeName(sizeName(shownSize))}
                cuttingWidthCm={widthCm}
                netto={rows.find((r) => r.sizeId === shownSize)?.conv?.value ?? null}
                unit={unit}
              />
              {/* ГЛАВНОЕ УТВЕРЖДЕНИЕ О ЧИСЛЕ ОСТАЁТСЯ ИНЛАЙНОМ, а не уезжает в раскрывашку вместе
                  с остальным разбором: «это netto, а выпады доначисляет процент» — единственное,
                  чего нельзя не прочитать, потому что от него зависит, верна ли закупка. */}
              <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
                {Number.isFinite(wastage)
                  ? `NET: the waste between pieces and the lay ends are NOT in this number — the slot's wastage percent adds them on top (${wastagePercent}%). the selvedge is already inside: it is paid for by dividing by the cutting width`
                  : "NET: the waste between pieces and the lay ends are not in this number. the selvedge is already inside — it is paid for by dividing by the cutting width"}
              </Text>
            </div>
          </div>
        )}

        {outcome?.ok && rows.length > 0 && (
          <div>
            <GroupLabel flush>the norm across the whole range — this is what goes into the line</GroupLabel>
            <div className='pt-1'>
              <DataTable>
                <thead>
                  <tr>
                    <th>size</th>
                    <th>area, cm²</th>
                    <th>netto{unit ? `, ${unit}` : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    // Показанный размер подсвечен зеброй — и это не украшение: формула и разбивка
                    // выше относятся именно к нему, а без метки ряд из семи чисел не сообщает, о
                    // каком из них там речь.
                    <tr
                      key={r.sizeId}
                      className={r.sizeId === shownSize ? 'bg-bgZebra' : undefined}
                    >
                      <td>{formatSizeName(sizeName(r.sizeId))}</td>
                      <td>{fmtInt(r.areaCm2)}</td>
                      <td>{r.conv ? r.conv.value : <EmptyCell />}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
            <Text size='nano' variant='label' component='p' className='pt-1'>
              {`${rows.length} of ${sizeIds.length} ${sizeIds.length === 1 ? 'size' : 'sizes'} in the range`}
              {' · '}
              pieces graded: {outcome.areas.gradedPieces} of {pieces.length}
              {outcome.areas.sizelessCm2 > 0
                ? ` · sizeless pieces: ${Math.round(outcome.areas.sizelessCm2)} cm² in every size`
                : ''}
              {' · the style cost is the average over the range, no base size is needed for that'}
            </Text>
            {/* Кг-число без основы не проверить ничем: формула целиком, с числами, до нажатия. */}
            {unitKind === 'kg' && fabric && (
              <Text size='nano' variant='label' component='p'>
                {weightBasisNote(fabric)}
              </Text>
            )}
          </div>
        )}

        {/* РАЗБОРА ПО ДЕТАЛЯМ ЗДЕСЬ БОЛЬШЕ НЕТ — по решению владельца (2026-08-13): таблица на
            тридцать строк делала диалог применения объёмным и сложным, а пользы приносила мало;
            открывают его, чтобы применить норму, а не изучать её состав. Диалог отвечает ровно на
            три вопроса: сколько, из чего посчитано и чем мерили.

            ГДЕ РАЗБОР ОСТАЛСЯ, И ГДЕ ЕГО ТЕПЕРЬ НЕТ — честно: он живёт под «?» на строке рецепта
            (dxf-recheck) и только у УЖЕ ПРИМЕНЁННОЙ нормы с источником «по выкройкам». До
            применения, после отмены этого диалога и на ручной или марочной норме прочитать его
            негде. Это сознательное сужение, а не недосмотр: проверять состав до применения
            оказалось никому не нужно, а таблица на тридцать строк стояла в каждом открытии. */}

        {/* ── ЧЕМ МЕРИЛИ ─────────────────────────────────────────────────────────────────────
            Общий блок с отдельным действием на вкладке выкроек: состояние разбора, слой контура,
            припуск и все отказы условий — одними словами на оба входа. Стоит ПОД числом, потому
            что предзаполнен замером самого файла и в большинстве случаев верен; но менять его
            приходится тому, кого число не устроило, — то есть ровно после того, как он его увидел. */}
        <div>
          <GroupLabel flush>measurement conditions</GroupLabel>
          {/* ПОЛЯ НЕ ТЯНУТСЯ НА ВСЮ ШИРИНУ ОКНА. Общий блок условий рисует их `w-full`, и это
              правильно в узком диалоге, из которого он приехал; здесь окно `lg`, и растянутый на
              тысячу пикселей селект слоя читается как ошибка вёрстки, а не как поле. Ограничение
              стоит СНАРУЖИ, на обёртке: правка общего компонента сузила бы поля и на вкладке
              выкроек, где они законно во всю ширину своей колонки. */}
          <div className='flex max-w-md flex-col gap-1.5 pt-1'>
            <DxfMeasureConditionsFields state={conditions} />
          </div>
        </div>

        {/* ── ПОЧЕМУ ЭТО ИМЕННО NETTO ────────────────────────────────────────────────────────
            Тот же текст, что был первым абзацем диалога, — слово в слово, кроме порядка. Он не
            выброшен и не сокращён: двойной учёт кромки, ради предупреждения о котором он написан,
            стоит денег на каждом закупе. Но читать его нужно ОДИН раз на человека, а видеть перед
            числом — каждый раз, и второе делало диалог нечитаемым.

            `<details>`, а не кнопка: на выпущенной карточке вкладка лежит внутри
            `<fieldset disabled>`, и раскрывашка на `<button>` там умерла бы молча. */}
        <details className='border border-hairline px-2 py-1'>
          <summary className='cursor-pointer text-micro uppercase'>
            why this is net, and what the wastage percent adds on top
          </summary>
          <div className='flex max-w-[90ch] flex-col gap-1 pt-1.5'>
            <Text size='nano' variant='label' component='p'>
              it is computed as Σ(piece area × count per garment) ÷ cutting width. the waste between
              pieces and the lay ends are not and cannot be in this number — only a marker knows
              them; the slot's wastage percent pays for them
              {Number.isFinite(wastage) ? ` (${wastagePercent}%)` : ''}, and the server adds it on
              top precisely because the source is not “from a marker”.
            </Text>
            <Text size='nano' variant='label' component='p'>
              the selvedge is NOT part of the percent: the net length comes from dividing by the
              CUTTING width (roll − 2×selvedge), so a purchased metre of the roll carries its selvedge
              with it and it is already paid for by that division — exactly once. build it into the
              percent and you count it twice.
            </Text>
            {unitKind === 'kg' && (
              <Text size='nano' variant='label' component='p'>
                a slot in kilograms: the net length is converted to weight by the FULL roll width
                (the selvedge is bought, and it weighs — the same once, not twice) and the article's
                density. both widths in one calculation, and that is how it should be.
              </Text>
            )}
            <Text size='nano' variant='label' component='p'>
              a marker, once there is one, gives a MEASURED number and replaces this: its length
              already has the waste inside it, and the slot's wastage percent is not added to it.
            </Text>
            {outcome?.ok && outcome.areas.hulled.length > 0 && (
              <Text size='nano' variant='label' component='p'>
                {`the contour was replaced with a convex hull (the area is overstated): ${outcome.areas.hulled.join(', ')}`}
              </Text>
            )}
          </div>
        </details>

        <Pill tone='mut'>the source will be recorded as “from the patterns”</Pill>
      </div>
    </ConfirmationModal>
  );
}
