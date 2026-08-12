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
import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { mmToEngineCm } from './nesting/allowance-units';
import { useSnackBarStore } from 'lib/stores/store';
import { publishPieceAreas } from './piece-areas';
import { serverScopeKeyOfSheet } from './pattern-size-index';
import { fabricScopes, isRollGoodsSection, scopeKeyOfBinding } from './bom-purpose';
import { sizeTokensOf } from './nesting/block-code';
import {
  DxfMeasureConditionsFields,
  useDxfMeasureConditions,
} from './nesting/dxf-measure-conditions';
import { dxfNormAreas, dxfNormValueRows, type DxfNormPiece } from './nesting/dxf-consumption';
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
    if (publishTarget && outcome?.ok) {
      void publishPieceAreas({
        techCardId: publishTarget.techCardId,
        scopeKey: publishTarget.scopeKey,
        sheets: publishTarget.sheets,
        areas: outcome.areas.pieceRows,
        contourLayer: chosenLayer,
        seamAllowanceMm: Number(seamValue) || 0,
        nameOfPiece: (key) =>
          pieces.find((p) => (p.lineKey ?? '').trim() === key)?.name ?? key,
      }).then((res) => {
        if (!res.ok) {
          showMessage(`норма применена, но площади не сохранены: ${res.reason}`, 'error');
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
      title='норма расхода по выкройкам'
      confirmLabel='применить по размерам'
      confirmDisabled={!applicable}
      closeOnConfirm={false}
    >
      <div className='space-y-2'>
        <CalloutBox tone='note'>
          Считается Σ(площадь деталей × количество на изделие) ÷ раскройная ширина. Это NETTO:
          межлекальных выпадов и концов настила в нём нет — их доначисляет процент раскроя слота
          {Number.isFinite(wastage) ? ` (${wastagePercent}%)` : ''}. Кромка уже учтена самим
          делением на раскройную ширину (рулон − 2×кромка) — в процент её не закладывайте,
          посчитается дважды. Раскладка, когда она появится, даст измеренное число и заменит это.
          {unitKind === 'kg'
            ? ' Слот в килограммах: netto-длина затем переводится в вес по ПОЛНОЙ ширине рулона (кромку покупают, и она весит — тот же один раз, не второй) и плотности артикула — обе ширины в одном расчёте, так и должно быть.'
            : ''}
        </CalloutBox>

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
            У слота НЕ ЗАДАН процент раскроя. Netto без него уходит в себестоимость и в закупку как
            итог — то есть занижает их на все отходы кроя. Заполните процент раскроя слота на
            вкладке BOM, тогда применение станет доступно: там у поля есть предложение «процент по
            факту настилов» — медиана по замерам прошлых раскроев артикула, когда их набралось три;
            пока их меньше, процент оценивается руками. Коэффициент раскроя артикула сюда не
            переносите: он меряется от длины раскладки и межлекальных выпадов не содержит.
          </CalloutBox>
        )}

        {/* Условия замера — общий блок с отдельным действием на вкладке выкроек: состояние
            разбора, слой контура, припуск и все отказы условий, одними словами на оба входа. */}
        <DxfMeasureConditionsFields state={conditions} />

        {!(widthCm > 0) && (
          <CalloutBox tone='warning'>
            У артикула не заполнена ширина полотна — делить площадь не на что. Подставить номинал
            нельзя: ошибка ширины входит в норму линейно и не видна ни в одном числе.
          </CalloutBox>
        )}

        {outcome && !outcome.ok && <CalloutBox tone='warning'>{outcome.reason}</CalloutBox>}

        {outcome?.ok && rows.length > 0 && (
          <>
            <DataTable variant='grid' className='[&_td]:text-micro'>
              <thead>
                <tr>
                  <th>размер</th>
                  <th>площадь, см²</th>
                  <th>netto{unit ? `, ${unit}` : ''}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sizeId}>
                    <td>{sizeName(r.sizeId)}</td>
                    <td>{Math.round(r.areaCm2)}</td>
                    <td>{r.conv ? `${r.conv.value} ${r.conv.unit}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Text size='nano' variant='label'>
              деталей градуируется: {outcome.areas.gradedPieces} из {pieces.length}
              {outcome.areas.sizelessCm2 > 0
                ? ` · безразмерные детали: ${Math.round(outcome.areas.sizelessCm2)} см² в каждом размере`
                : ''}
              {widthCm > 0 ? ` · раскройная ширина ${articleWidth} см` : ''}
            </Text>
            {/* Кг-число без основы не проверить ничем: формула целиком, с числами, до нажатия. */}
            {unitKind === 'kg' && fabric && (
              <Text size='nano' variant='label'>
                {weightBasisNote(fabric)}
              </Text>
            )}
            {outcome.areas.sizesIncomplete.length > 0 && (
              <CalloutBox tone='warning'>
                Не нашлись все детали для размеров:{' '}
                {outcome.areas.sizesIncomplete.map(sizeName).join(', ')}. Норма пишется на ВЕСЬ ряд
                или не пишется вовсе: непокрытый размер в плане прогона взял бы скаляр, которого
                здесь нет.
              </CalloutBox>
            )}
            {outcome.areas.hulled.length > 0 && (
              <CalloutBox tone='note'>
                контур заменён выпуклой оболочкой (площадь с запасом):{' '}
                {outcome.areas.hulled.join(', ')}
              </CalloutBox>
            )}
            <CalloutBox tone='note'>
              Себестоимость стиля — среднее по размерному ряду: норма пишется на весь ряд, этого
              достаточно, базовый размер не нужен.
            </CalloutBox>
            {/* Отказ по единице. Кг-слот называет, ЧЕГО не хватает — ширины или плотности:
                «единица не принимает длину» отправила бы оператора менять единицу вместо того,
                чтобы заполнить артикул. Пустая единица — своя починка: единица нормы = единица
                слота (фолбэка в единицу артикула нет), и лечится это на вкладке BOM, а не здесь. */}
            {rows.some((r) => r.conv == null) && (
              <CalloutBox tone='warning'>
                {unitKind === 'kg' && !weightBasis.ok
                  ? weightRefusalText(weightBasis.missing, weightBasis.pinned)
                  : unit
                    ? `Единица слота «${unit}» не принимает ни длину, ни вес: применить можно в метрах, сантиметрах или килограммах.`
                    : 'У слота не заполнена единица — норма пишется в единице слота, и применить её не в чем. Заполните единицу на вкладке BOM.'}
              </CalloutBox>
            )}
            {/* НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ — НЕ НОРМА. Метры округляются до трёх знаков (столько держит
                колонка), и крошечная площадь честно становится 0.000: строка сохранилась бы «с
                нормой», которая ничего не требует, а дефицит на прогоне вышел бы нулевым.
                СОВЕТ РАЗВЕДЁН ПО РАЗМЕРНОСТИ: на весовой строке «выберите см» превратил бы её в
                длиновую — единица строки согласована с закупочной ценой, и смена размерности
                разъехалась бы с ценой за килограмм. */}
            {rows.some((r) => r.conv != null && !(r.conv.value > 0)) && (
              <CalloutBox tone='warning'>
                {unitKind === 'kg'
                  ? `После перевода в «${unit}» норма округляется в ноль — вес на изделие меньше половины грамма. Ноль означал бы «ткань не нужна». Слот весовой: единицу на сантиметры не менять (это сменит размерность строки и разойдётся с закупочной ценой за килограмм) — проверьте плотность и ширину артикула и тот ли слой контура выбран.`
                  : `После перевода в «${unit || '—'}» норма округляется в ноль — площадь слишком мала для этой единицы. Ноль означал бы «ткань не нужна»; выберите единицу мельче (см) или проверьте, тот ли слой контура выбран.`}
              </CalloutBox>
            )}
          </>
        )}

        <Pill tone='mut'>источник будет записан как «по выкройкам»</Pill>
      </div>
    </ConfirmationModal>
  );
}
