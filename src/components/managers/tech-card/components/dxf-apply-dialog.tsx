// «По выкройкам» — норма расхода из площади деталей, без раскладки (`consumption_source='dxf'`, 0294).
//
// ЗАЧЕМ ОН РЯДОМ С «ИЗ РАСКЛАДКИ». Раскладка — лучший ответ: её длина ИЗМЕРЕНА, в ней уже лежат
// межлекальные выпады, и костинг такую норму не гроссит. Но раскладки на карточке может не быть
// вовсе — а себестоимость стиля и потребность до первого прогона считаются уже сейчас, и до сих
// пор единственным выходом был ручной ввод: число «на глаз», умноженное на процент раскроя «на
// глаз». Выкройки в этот момент есть, и площадь каждой детали в них — факт.
//
// ЧТО ЭТОТ ДИАЛОГ ОБЯЗАН СКАЗАТЬ ВСЛУХ, И ГОВОРИТ:
//   • число NETTO. Межлекальных выпадов, кромки и концов настила в нём нет и быть не может;
//     за них платит процент раскроя слота, и сервер его доначисляет именно потому, что источник
//     не 'marker'. Поэтому применение на слот с ПУСТЫМ процентом ЗАПРЕЩЕНО прямо здесь: netto
//     без процента уходит в закупку заведомо занижённым (гейт готовности прогона на такой паре
//     ставит блокер — эта кнопка не даёт до него дойти).
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
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { useWorkshopSettings } from '../../workshop/useWorkshopSettings';
import {
  clampSeamAllowanceMm,
  engineCmToMm,
  MAX_SEAM_ALLOWANCE_MM,
  mmToEngineCm,
} from './nesting/allowance-units';
import { sizeTokensOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { applyLayerOptions, applySeamPrefill } from './nesting/dxf-apply-conditions';
import { layerAllowanceLabel } from './nesting/contour-layer';
import { dxfNormAreas, dxfNormValueRows, type DxfNormPiece } from './nesting/dxf-consumption';
import { useDxfGeometry, useDxfIndex } from './nesting/dxf-geometry';
import type { TechCardFormData } from './schema';

export default function DxfApplyDialog({
  control,
  pieces,
  unaliasedPieces,
  unit,
  wastagePercent,
  articleWidth,
  sizeIds,
  sizeNameById,
  canEdit,
  onClose,
  onApply,
}: {
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
  const [layer, setLayer] = useState<string | null>(null);
  const [seamMm, setSeamMm] = useState<string>('');

  // Из формы здесь нужны РОВНО два поля: стандарт припуска карточки (предзаполнение) и базовый
  // размер (по его норме считается себестоимость стиля). Детали кроя и скоуп ткани разрешает лёгкая
  // обёртка и передаёт готовыми — иначе два места считали бы одно и то же и однажды разошлись.
  const cardSeamMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? null) as
    | number
    | string
    | null;
  const baseSampleSizeId = (useWatch({ control, name: 'baseSampleSizeId' }) ?? 0) as number;

  // Разбор ВСЕЙ пачки карточки, общий с панелями выкроек и деталей кроя (ключ кэша — содержимое
  // пачки). Взводится только открытым диалогом: это мегабайты с CDN и разбор в воркере.
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, true);
  const index = useDxfIndex(geometry.data);

  const layers = useMemo(() => {
    if (!geometry.data || !index) return [];
    // Список слоёв (и построение индекса замера по неотфильтрованному разбору) — общим кодом с
    // пересчётом по текущим данным (dxf-recheck.tsx): условия пересчёта там обязаны быть теми же,
    // что предложил бы этот диалог, и «теми же» их делает один вызов, а не два похожих.
    return applyLayerOptions(geometry.data, index);
  }, [geometry.data, index]);
  const chosenLayer = layer ?? index?.contourLayer ?? '';
  const chosenOption = layers.find((o) => o.layer === chosenLayer);

  // ЦЕХ СПРАШИВАЕТСЯ НАРАВНЕ С КАРТОЧКОЙ И ФАЙЛОМ. Без него подпись «ни карточка, ни цех, ни файл
  // припуска не назвали» врала бы: цех мог назвать, его просто не спросили — и норма разошлась бы с
  // раскладкой того же файла, где порядок источников полный. Запрос дешёвый и идёт только с открытым
  // диалогом (RBAC: чтение настроек разрешено любому аккаунту).
  const workshop = useWorkshopSettings();

  const prefill = useMemo(
    () =>
      applySeamPrefill(chosenOption, cardSeamMm, workshop.data?.settings?.defaultSeamAllowanceMm),
    [chosenOption, cardSeamMm, workshop.data],
  );
  // РУЧНОЙ ВВОД ПРИПУСКА ПРОВЕРЯЕТСЯ, А НЕ ГЛОТАЕТСЯ. Мусор («1.2.3») давал NaN и молча превращался
  // в 0 мм, а 900 мм принимались — при том, что и раскладка, и сервер держат потолок в
  // MAX_SEAM_ALLOWANCE_MM. Результат уходит прямо в норму, и защиты на сервере у него нет.
  const seamTyped = seamMm.trim() === '' ? null : Number(seamMm);
  const seamInvalid = seamTyped != null && (!Number.isFinite(seamTyped) || seamTyped < 0);
  const seamOverMax =
    seamTyped != null && Number.isFinite(seamTyped) && seamTyped > MAX_SEAM_ALLOWANCE_MM;
  const seamValue = seamTyped == null ? prefill.value : clampSeamAllowanceMm(seamTyped);

  // ДВОЙНОЙ ПРИПУСК — тот же отказ, что в раскладке, и теми же словами: если замер сказал, что на
  // слое лежит ЛИНИЯ КРОЯ, добавленный сверху офсет посчитает припуск ДВАЖДЫ и раздует площадь по
  // всему периметру каждой детали. Прифилл ставит здесь 0 сам, но оператор может напечатать своё.
  const measured = chosenOption?.allowance ?? null;
  const contourIsCutLine = measured?.verdict === 'cut' && (measured.allowanceCm ?? 0) > 0;
  const doubleAllowance = contourIsCutLine && seamValue > 0;

  const widthCm = parseDecimalNumber(articleWidth);
  const wastage = parseDecimalNumber(wastagePercent);
  const wastageMissing = !Number.isFinite(wastage);

  // ЧАСТИЧНО НЕ СКАЧАННАЯ ПАЧКА — не «просто предупреждение». Если свежий лист не скачался, а старая
  // ревизия в пачке есть, комплект соберётся по НЕЙ, и норма встанет по прошлой геометрии молча.
  const downloadFailures = (geometry.data?.warnings ?? []).filter(
    (w) => w.includes('не удалось скачать') || w.includes('не разобрал'),
  );

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
    return dxfNormValueRows(outcome.areas.rows, widthCm, unit);
  }, [outcome, widthCm, unit]);
  const complete = rows.length === sizeIds.length && rows.every((r) => r.value != null);
  // ПРИМЕНЕНИЕ ЖДЁТ НАСТРОЙКИ ЦЕХА. Порядок источников припуска — замер → карточка → ЦЕХ → умолчание
  // раскладки, и пока запрос цеха в пути, прифилл показывает умолчание. Оператор, успевший нажать
  // «применить» в это окно, снял бы норму по припуску, которого никто не назначал: цех хранит 12 мм,
  // подставилось 10, разница ушла по всему периметру каждой детали в себестоимость и в закупку.
  // Ошибку запроса применение НЕ блокирует (иначе упавшая настройка остановила бы работу), но
  // подпись прифилла в этом состоянии врёт про «цех не назвал» — об этом говорит отдельная плашка.
  const applicable =
    complete &&
    !wastageMissing &&
    canEdit &&
    !seamInvalid &&
    !seamOverMax &&
    !doubleAllowance &&
    !workshop.isPending &&
    downloadFailures.length === 0;

  const sizeName = (id: number) => sizeNameById.get(id) ?? `#${id}`;

  const apply = () => {
    if (!applicable) return;
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
          межлекальных выпадов, кромки и концов настила в нём нет — их доначисляет процент раскроя
          слота{Number.isFinite(wastage) ? ` (${wastagePercent}%)` : ''}. Раскладка, когда она
          появится, даст измеренное число и заменит это.
        </CalloutBox>

        {wastageMissing && (
          <CalloutBox tone='warning'>
            У слота НЕ ЗАДАН процент раскроя. Netto без него уходит в себестоимость и в закупку как
            итог — то есть занижает их на все отходы кроя. Заполните процент раскроя слота на
            вкладке BOM, тогда применение станет доступно.
          </CalloutBox>
        )}

        {/* ПУСТАЯ ПАЧКА НАЗЫВАЕТСЯ ПУСТОЙ. `useDxfGeometry` при нуле файлов — это отключённый
            запрос, а у отключённого запроса в react-query v5 `isPending` вечно true: без этой ветки
            диалог «качал и разбирал выкройки» бесконечно, хотя качать нечего. Состояние достижимое:
            связи блок→деталь остаются на карточке и после удаления всех DXF. */}
        {pack.length === 0 ? (
          <CalloutBox tone='warning'>
            На карточке нет ни одного DXF — площади считать не по чему. Загрузите выкройки на
            вкладке выкроек; связи деталей с блоками у вас уже есть.
          </CalloutBox>
        ) : (
          geometry.isPending && <Text size='micro'>качаем и разбираем выкройки…</Text>
        )}
        {geometry.isError && (
          <CalloutBox tone='warning'>
            не удалось разобрать выкройки: {geometry.error?.message || 'неизвестная ошибка'}
          </CalloutBox>
        )}
        {/* ЧАСТИЧНО СКАЧАННАЯ ПАЧКА ХУЖЕ НЕСКАЧАННОЙ: комплект деталей может собраться по СТАРОЙ
            ревизии листа, и норма встанет по прошлой геометрии, ничем себя не выдав. Поэтому не
            предупреждение, а запрет применения. */}
        {downloadFailures.length > 0 && (
          <CalloutBox tone='warning'>
            Часть выкроек не скачалась или не разобралась: {downloadFailures.join('; ')}. Норма
            могла бы собраться по другому листу — например, по прежней ревизии, — и была бы
            неотличима от верной. Повторите позже.
          </CalloutBox>
        )}

        {layers.length > 1 && (
          <Selector
            label='слой контура'
            value={chosenLayer}
            options={layers.map((o) => ({
              value: o.layer,
              label: `слой ${o.layer || '—'} · деталей ${o.pieces}${
                o.checked > 0 ? ` · градуируется ${o.graded}/${o.checked}` : ''
              }${layerAllowanceLabel(o) ? ` · ${layerAllowanceLabel(o)}` : ''}`,
            }))}
            onChange={(v: string | number) => {
              setLayer(String(v));
              setSeamMm('');
            }}
          />
        )}

        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' component='span'>
            припуск на шов, мм
          </Text>
          <input
            className='h-8 w-full border border-borderColor px-2 text-small'
            inputMode='decimal'
            value={seamMm === '' ? String(prefill.value) : seamMm}
            onChange={(e) => setSeamMm(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
          />
          <Text size='nano' variant='label' component='span'>
            {seamMm.trim() === '' ? prefill.why : 'введено руками'}
          </Text>
        </label>

        {/* ЦЕХ — ТРЕТИЙ ИСТОЧНИК ПРИПУСКА, и его молчание надо отличать от невозможности спросить.
            Пока запрос в пути, применение запрещено (см. applicable): подставленное умолчание уехало
            бы в норму. Если запрос УПАЛ, применять можно — иначе сломанная настройка остановила бы
            работу, — но подпись «ни карточка, ни цех, ни файл не назвали» в этом состоянии неверна,
            и молчать об этом нельзя. */}
        {workshop.isPending && <Text size='micro'>читаем стандарт припуска цеха…</Text>}
        {workshop.isError && (
          <CalloutBox tone='warning'>
            Настройки цеха не читаются, поэтому цеховой стандарт припуска в предзаполнении НЕ
            участвовал. Если он задан, норма выйдет посчитанной по другому припуску — проверьте
            число в поле выше.
          </CalloutBox>
        )}

        {seamInvalid && (
          <CalloutBox tone='warning'>
            Припуск читается не как число. Пустое поле означает предзаполнение ({prefill.value} мм),
            а не ноль: молча посчитать ноль значило бы отдать норму по линии шва.
          </CalloutBox>
        )}
        {seamOverMax && (
          <CalloutBox tone='warning'>
            Припуск больше {MAX_SEAM_ALLOWANCE_MM} мм — тот же потолок, что у раскладки и у сервера.
            Столько не бывает; похоже, введены сантиметры вместо миллиметров.
          </CalloutBox>
        )}
        {/* ТОТ ЖЕ ОТКАЗ, ЧТО В РАСКЛАДКЕ, И ПО ТОЙ ЖЕ ПРИЧИНЕ — правило одно, а не две политики. */}
        {doubleAllowance && measured && (
          <CalloutBox tone='warning'>
            {`Слой ${measured.layer || '—'} — это ЛИНИЯ КРОЯ: замерено, что он лежит на ${(engineCmToMm(measured.allowanceCm) ?? 0).toFixed(1)} мм снаружи линии шва. Добавленный сверху припуск ${seamValue.toFixed(1)} мм посчитает его ДВАЖДЫ и раздует площадь по всему периметру каждой детали. Выходов два: поставить 0 (контур уже с припуском) либо выбрать слой с линией шва.`}
          </CalloutBox>
        )}

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
                    <td>
                      {sizeName(r.sizeId)}
                      {baseSampleSizeId === r.sizeId ? ' · базовый' : ''}
                    </td>
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
            {baseSampleSizeId === 0 && (
              <CalloutBox tone='note'>
                У карточки не назван базовый размер — себестоимость стиля считается по норме
                базового размера, и без него она останется непосчитанной.
              </CalloutBox>
            )}
            {rows.some((r) => r.conv == null) && (
              <CalloutBox tone='warning'>
                Единица слота «{unit || '—'}» не принимает длину: применить можно в метрах или
                сантиметрах.
              </CalloutBox>
            )}
            {/* НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ — НЕ НОРМА. Метры округляются до трёх знаков (столько держит
                колонка), и крошечная площадь честно становится 0.000: строка сохранилась бы «с
                нормой», которая ничего не требует, а дефицит на прогоне вышел бы нулевым. */}
            {rows.some((r) => r.conv != null && !(r.conv.value > 0)) && (
              <CalloutBox tone='warning'>
                После перевода в «{unit || '—'}» норма округляется в ноль — площадь слишком мала для
                этой единицы. Ноль означал бы «ткань не нужна»; выберите единицу мельче (см) или
                проверьте, тот ли слой контура выбран.
              </CalloutBox>
            )}
          </>
        )}

        <Pill tone='mut'>источник будет записан как «по выкройкам»</Pill>
      </div>
    </ConfirmationModal>
  );
}
