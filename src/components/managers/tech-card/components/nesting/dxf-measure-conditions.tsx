// УСЛОВИЯ ЗАМЕРА ПО DXF — ОДИН КОД И ОДИН ЭКРАН НА ВСЕ ВХОДЫ В ЗАМЕР.
//
// Площадь деталей меряется из ДВУХ мест, и оба пишут одну и ту же таблицу площадей (0297):
//
//   • диалог нормы «по выкройкам» (dxf-apply-dialog.tsx) — там площадь промежуточная, из неё
//     считается норма расхода строки рецепта, а площади уезжают попутно;
//   • отдельное действие «замерить площади деталей» на вкладке выкроек (piece-areas-dialog.tsx) —
//     там площади и есть весь предмет: ни нормы, ни рецепта оно не касается.
//
// УСЛОВИЯ ЗАМЕРА У НИХ ОБЯЗАНЫ БЫТЬ ОДНИ И ТЕ ЖЕ, и это не вопрос аккуратности. Слой контура и
// припуск — это буквально то, ЧТО измеряется: слой 14 несёт линию шва, слой 1 — линию кроя базового
// размера, и разница между ними равна припуску по ВСЕМУ периметру каждой детали. Два похожих
// прифилла рядом означали бы, что одна и та же карточка, померенная двумя кнопками, даёт две разные
// площади, и ни одна строка на экране не смогла бы объяснить, почему: условия замера строка площадей
// хранит, а сравнивать их между собой некому. Поэтому здесь и хук (состояние и правила), и разметка
// (селектор слоя, поле припуска и все отказы условий) — вызывающему остаётся только его собственный
// предмет.
//
// Тексты отказов говорят про ЗАМЕР, а не про норму: норма — это уже следствие, и в отдельном
// действии её нет вовсе. Утверждения от этого не ослабли — сорванный замер одинаково опасен обоим:
// из него выводится и норма строки, и серверная оценка снизу.
import { useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import Selector from 'ui/components/selector';
import Text from 'ui/components/text';
import { useWorkshopSettings } from '../../../workshop/useWorkshopSettings';
import type { TechCardFormData } from '../schema';
import { clampSeamAllowanceMm, engineCmToMm, MAX_SEAM_ALLOWANCE_MM } from './allowance-units';
import { useCardDxfPack } from './card-dxf-pack';
import type { ContourAllowance } from './contour-allowance';
import { layerAllowanceLabel, type LayerOption } from './contour-layer';
import { applyLayerOptions, applySeamPrefill } from './dxf-apply-conditions';
import { useDxfGeometry, useDxfIndex, type DxfBundle, type DxfIndex } from './dxf-geometry';

export type DxfMeasureConditions = {
  /** Пачка DXF карточки — пустая означает «мерить не по чему», и это отдельная ветка. */
  packSize: number;
  bundle: DxfBundle | undefined;
  index: DxfIndex | null;
  parsePending: boolean;
  parseError: Error | null;
  /** Слой контура: выбор оператора, по умолчанию — слой карточки (`index.contourLayer`). */
  layer: string;
  /** Припуск, ММ, уже с прифиллом и потолком — то, чем будет раздут контур. */
  seamMm: number;
  /** Замер выбранного слоя (что в контуре уже лежит). null = не мерили. */
  measured: ContourAllowance | null;
  /** Листы, которые не скачались или не разобрались — замер по такой пачке запрещён. */
  downloadFailures: string[];
  /**
   * УСЛОВИЯ НЕПРИГОДНЫ ДЛЯ ЗАМЕРА — общий запрет обоим вызывающим: припуск не число, припуск выше
   * потолка, двойной припуск, частично скачанная пачка, ещё не прочитанные настройки цеха.
   * Собственные условия (процент раскроя, ширина, права) вызывающий добавляет к этому сам.
   */
  blocked: boolean;
};

type Internals = {
  layers: LayerOption[];
  chosenOption: LayerOption | undefined;
  prefillValue: number;
  prefillWhy: string;
  seamInput: string;
  setSeamInput: (v: string) => void;
  setLayer: (v: string) => void;
  seamInvalid: boolean;
  seamOverMax: boolean;
  doubleAllowance: boolean;
  workshopPending: boolean;
  workshopError: boolean;
};

/** Всё состояние условий разом: наружу — ответы, внутрь (в разметку) — ещё и органы управления. */
export type DxfMeasureState = DxfMeasureConditions & { readonly _fields: Internals };

/**
 * Условия замера: разбор пачки карточки, выбор слоя, припуск и все запреты.
 *
 * Разбор взводится САМИМ вызовом хука (`useDxfGeometry(pack, true)`) — это мегабайты с CDN и разбор
 * в воркере, поэтому вызывающий обязан монтироваться только открытым диалогом. Кэш разбора общий с
 * панелями вкладки (ключ — содержимое пачки), так что второй читатель платит ноль.
 */
export function useDxfMeasureConditions(control: Control<TechCardFormData>): DxfMeasureState {
  const [layer, setLayer] = useState<string | null>(null);
  const [seamInput, setSeamInput] = useState<string>('');

  // Из формы нужен РОВНО стандарт припуска карточки — второй источник прифилла после замера файла.
  const cardSeamMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? null) as
    | number
    | string
    | null;

  const packFiles = useCardDxfPack();
  const geometry = useDxfGeometry(packFiles, true);
  const index = useDxfIndex(geometry.data);

  const layers = useMemo(() => {
    if (!geometry.data || !index) return [];
    // Список слоёв строится ОБЩЕЙ функцией с пересчётом нормы по текущим данным (dxf-recheck.tsx):
    // «те же условия» держатся на том, что это один вызов, а не два похожих.
    return applyLayerOptions(geometry.data, index);
  }, [geometry.data, index]);
  const chosenLayer = layer ?? index?.contourLayer ?? '';
  const chosenOption = layers.find((o) => o.layer === chosenLayer);

  // ЦЕХ СПРАШИВАЕТСЯ НАРАВНЕ С КАРТОЧКОЙ И ФАЙЛОМ. Без него подпись «ни карточка, ни цех, ни файл
  // припуска не назвали» врала бы: цех мог назвать, его просто не спросили. Запрос дешёвый, ключ
  // общий на всё приложение (RBAC: чтение настроек разрешено любому аккаунту).
  const workshop = useWorkshopSettings();

  const prefill = useMemo(
    () =>
      applySeamPrefill(chosenOption, cardSeamMm, workshop.data?.settings?.defaultSeamAllowanceMm),
    [chosenOption, cardSeamMm, workshop.data],
  );

  // РУЧНОЙ ВВОД ПРИПУСКА ПРОВЕРЯЕТСЯ, А НЕ ГЛОТАЕТСЯ. Мусор («1.2.3») давал NaN и молча превращался
  // в 0 мм, а 900 мм принимались — при том, что и раскладка, и сервер держат потолок в
  // MAX_SEAM_ALLOWANCE_MM. Результат уходит прямо в площадь, и защиты на сервере у него нет.
  const seamTyped = seamInput.trim() === '' ? null : Number(seamInput);
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

  // ЧАСТИЧНО НЕ СКАЧАННАЯ ПАЧКА — не «просто предупреждение». Если свежий лист не скачался, а старая
  // ревизия в пачке есть, комплект соберётся по НЕЙ, и замер встанет по прошлой геометрии молча.
  const downloadFailures = (geometry.data?.warnings ?? []).filter(
    (w) => w.includes('не удалось скачать') || w.includes('не разобрал'),
  );

  return {
    packSize: packFiles.length,
    bundle: geometry.data,
    index,
    parsePending: geometry.isPending,
    parseError: (geometry.error as Error | null) ?? null,
    layer: chosenLayer,
    seamMm: seamValue,
    measured,
    downloadFailures,
    // ЗАМЕР ЖДЁТ НАСТРОЙКИ ЦЕХА. Порядок источников припуска — замер → карточка → ЦЕХ → умолчание
    // раскладки, и пока запрос цеха в пути, прифилл показывает умолчание. Оператор, успевший
    // нажать в это окно, померил бы по припуску, которого никто не назначал: цех хранит 12 мм,
    // подставилось 10, разница ушла по всему периметру каждой детали. Ошибку запроса замер НЕ
    // блокирует (иначе упавшая настройка остановила бы работу) — об этом говорит отдельная плашка.
    blocked:
      seamInvalid ||
      seamOverMax ||
      doubleAllowance ||
      workshop.isPending ||
      downloadFailures.length > 0,
    _fields: {
      layers,
      chosenOption,
      prefillValue: prefill.value,
      prefillWhy: prefill.why,
      seamInput,
      setSeamInput,
      setLayer,
      seamInvalid,
      seamOverMax,
      doubleAllowance,
      workshopPending: workshop.isPending,
      workshopError: workshop.isError,
    },
  };
}

/**
 * Разметка условий: состояние разбора, выбор слоя, поле припуска и отказы условий — ровно то, что
 * обязаны показывать оба входа в замер, в одном порядке и одними словами.
 *
 * Свой предмет (норму, площади) вызывающий рисует до и после этого блока.
 */
export function DxfMeasureConditionsFields({ state }: { state: DxfMeasureState }) {
  const f = state._fields;
  return (
    <>
      {/* ПУСТАЯ ПАЧКА НАЗЫВАЕТСЯ ПУСТОЙ. `useDxfGeometry` при нуле файлов — это отключённый
          запрос, а у отключённого запроса в react-query v5 `isPending` вечно true: без этой ветки
          диалог «качал и разбирал выкройки» бесконечно, хотя качать нечего. Состояние достижимое:
          связи блок→деталь остаются на карточке и после удаления всех DXF. */}
      {state.packSize === 0 ? (
        <CalloutBox tone='warning'>
          На карточке нет ни одного DXF — площади считать не по чему. Загрузите выкройки на вкладке
          выкроек; связи деталей с блоками у вас уже есть.
        </CalloutBox>
      ) : (
        state.parsePending && <Text size='micro'>качаем и разбираем выкройки…</Text>
      )}
      {state.parseError && (
        <CalloutBox tone='warning'>
          не удалось разобрать выкройки: {state.parseError.message || 'неизвестная ошибка'}
        </CalloutBox>
      )}
      {/* ЧАСТИЧНО СКАЧАННАЯ ПАЧКА ХУЖЕ НЕСКАЧАННОЙ: комплект деталей может собраться по СТАРОЙ
          ревизии листа, и замер встанет по прошлой геометрии, ничем себя не выдав. Поэтому не
          предупреждение, а запрет. */}
      {state.downloadFailures.length > 0 && (
        <CalloutBox tone='warning'>
          Часть выкроек не скачалась или не разобралась: {state.downloadFailures.join('; ')}. Замер
          собрался бы по тем листам, что скачались, — например, по прежней ревизии, — и был бы
          неотличим от верного. Повторите позже.
        </CalloutBox>
      )}

      {f.layers.length > 1 && (
        <Selector
          label='слой контура'
          value={state.layer}
          options={f.layers.map((o) => ({
            value: o.layer,
            label: `слой ${o.layer || '—'} · деталей ${o.pieces}${
              o.checked > 0 ? ` · градуируется ${o.graded}/${o.checked}` : ''
            }${layerAllowanceLabel(o) ? ` · ${layerAllowanceLabel(o)}` : ''}`,
          }))}
          onChange={(v: string | number) => {
            f.setLayer(String(v));
            f.setSeamInput('');
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
          value={f.seamInput === '' ? String(f.prefillValue) : f.seamInput}
          onChange={(e) => f.setSeamInput(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
        />
        <Text size='nano' variant='label' component='span'>
          {f.seamInput.trim() === '' ? f.prefillWhy : 'введено руками'}
        </Text>
      </label>

      {/* ЦЕХ — ТРЕТИЙ ИСТОЧНИК ПРИПУСКА, и его молчание надо отличать от невозможности спросить.
          Пока запрос в пути, замер запрещён (см. blocked): подставленное умолчание уехало бы в
          площади. Если запрос УПАЛ, мерить можно — иначе сломанная настройка остановила бы
          работу, — но подпись «ни карточка, ни цех, ни файл не назвали» в этом состоянии неверна,
          и молчать об этом нельзя. */}
      {f.workshopPending && <Text size='micro'>читаем стандарт припуска цеха…</Text>}
      {f.workshopError && (
        <CalloutBox tone='warning'>
          Настройки цеха не читаются, поэтому цеховой стандарт припуска в предзаполнении НЕ
          участвовал. Если он задан, замер выйдет посчитанным по другому припуску — проверьте число
          в поле выше.
        </CalloutBox>
      )}

      {f.seamInvalid && (
        <CalloutBox tone='warning'>
          Припуск читается не как число. Пустое поле означает предзаполнение ({f.prefillValue} мм),
          а не ноль: молча посчитать ноль значило бы померить по линии шва.
        </CalloutBox>
      )}
      {f.seamOverMax && (
        <CalloutBox tone='warning'>
          Припуск больше {MAX_SEAM_ALLOWANCE_MM} мм — тот же потолок, что у раскладки и у сервера.
          Столько не бывает; похоже, введены сантиметры вместо миллиметров.
        </CalloutBox>
      )}
      {/* ТОТ ЖЕ ОТКАЗ, ЧТО В РАСКЛАДКЕ, И ПО ТОЙ ЖЕ ПРИЧИНЕ — правило одно, а не две политики. */}
      {f.doubleAllowance && state.measured && (
        <CalloutBox tone='warning'>
          {`Слой ${state.measured.layer || '—'} — это ЛИНИЯ КРОЯ: замерено, что он лежит на ${(
            engineCmToMm(state.measured.allowanceCm) ?? 0
          ).toFixed(1)} мм снаружи линии шва. Добавленный сверху припуск ${state.seamMm.toFixed(
            1,
          )} мм посчитает его ДВАЖДЫ и раздует площадь по всему периметру каждой детали. Выходов два: поставить 0 (контур уже с припуском) либо выбрать слой с линией шва.`}
        </CalloutBox>
      )}
    </>
  );
}
