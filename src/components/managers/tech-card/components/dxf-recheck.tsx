// ПЕРЕСЧЁТ dxf-НОРМЫ ПО ТЕКУЩИМ ДАННЫМ (Ф2): совпадает ли сохранённое число с тем, что вышло бы
// при применении сейчас.
//
// Строка с источником 'dxf' хранит только числа (`sizeConsumptions[]`). Серверного штампа «когда
// считали» НЕТ И НЕ БУДЕТ: norm_applied_at двигается только при СМЕНЕ пары (источник, раскладка),
// а у dxf пара (dxf, NULL) при повторном применении не меняется — отметка времени тут врала бы по
// построению. Поэтому сравнивается не дата, а САМО ЧИСЛО: тот же конвейер, что у применения
// (useFabricDxfPieces → defaultApplyConditions → dxfNormAreas → dxfNormValueRows), со ВСЕМИ его
// стоп-условиями — неизвестная ширина, единица вне словаря записи (или кг-слот без основы веса),
// частично скачанная пачка, ноль после округления. Стоп-условия здесь не менее важны, чем формула:
// расчёт по пачке, где свежая ревизия не скачалась, собрался бы по старой и показал бы ложное
// совпадение.
//
// ЧЕСТНОСТЬ ФОРМУЛИРОВКИ — ГЛАВНОЕ ТРЕБОВАНИЕ. «Текущие данные» — это не только геометрия
// выкроек: в расчёт входят состав деталей этой ткани, их pieces_per_garment, связи деталей с
// блоками (побеждает ПЕРВАЯ найденная — порядок связей влияет), назначение ткани в BOM, размерный
// ряд и имена размеров, единица строки, раскройная ширина артикула, слой и припуск. Оператор,
// поправивший на манжете piecesPerGarment с 2 на 4, удвоил площадь, не тронув ни одной выкройки —
// поэтому расхождение формулируется ТОЛЬКО как «сохранённое не совпадает с расчётом по текущим
// данным карточки», никогда как «выкройки изменились». Условия, при которых применяли, строка не
// записывает — сказать, ЧТО именно разошлось, нечем, и это говорится вслух. Совпадение тоже не
// утверждает неизменности: сравнение идёт по площади и после округления единицы.
//
// НИ ОДНОГО БЛОКЕРА И НИ ОДНОЙ КНОПКИ. Сохранённая норма продолжает считать потребность; всё здесь
// — примечание (тон максимум attention), авторитетный вердикт остаётся за серверным гейтом
// готовности прогона. Кнопок нет ещё и потому, что на выпущенной (RELEASED) карточке вкладка лежит
// в <fieldset disabled>, который глушит любую <button>, но не <details> и не текст, — а именно там
// этот ответ нужнее всего.
//
// МОНТИРУЕТСЯ ТОЛЬКО ОТКРЫТОЙ РАСКРЫВАШКОЙ И ПРИЕЗЖАЕТ lazy() (см. NormSummary): NormSummary
// смонтирован для каждой строки каждого колорвея одновременно, а этот компонент тянет подписки на
// массивы формы и мегабайты DXF с CDN. Закрытая раскрывашка обязана стоить ноль — тот же приём,
// что в dxf-apply.tsx.
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { parseDecimalNumber } from 'utils/decimal';
import { useWorkshopSettings } from '../../workshop/useWorkshopSettings';
import { mmToEngineCm } from './nesting/allowance-units';
import { sizeTokensOf } from './nesting/block-code';
import { useCardDxfPack } from './nesting/card-dxf-pack';
import { defaultApplyConditions } from './nesting/dxf-apply-conditions';
import { dxfNormAreas, dxfNormValueRows } from './nesting/dxf-consumption';
import { useDxfGeometry, useDxfIndex } from './nesting/dxf-geometry';
import {
  weightBasisLabel,
  weightRefusalText,
  type WeightBasisResolution,
} from './nesting/fabric-weight';
import { bomUnitKind, bomUnitStep } from './nesting/marker-io';
import type { TechCardFormData } from './schema';
import { useFabricDxfPieces } from './use-fabric-dxf-pieces';

// Все ответы — нано-текстом: внутри раскрывашки строки рецепта только текст и пилюли, никаких
// вложенных блоков-панелей.
function Line({ children }: { children: string }) {
  return (
    <Text size='nano' variant='label' component='span'>
      {children}
    </Text>
  );
}

export default function DxfNormRecheck({
  lineKey,
  unit,
  articleWidth,
  weightBasis,
  sizeIds,
  sizeNameById,
  saved,
}: {
  /** Слот строки — по нему собирается комплект деталей ткани, тем же хуком, что у применения. */
  lineKey: string;
  unit: string;
  /** РАСКРОЙНАЯ ширина эффективного артикула, см (рулон − 2×кромка). '' = неизвестна. */
  articleWidth: string;
  /** Основа веса кг-слота (Ф3): полная ширина рулона × плотность — резолвит строка рецепта. */
  weightBasis: WeightBasisResolution;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  /** Сохранённые пер-размерные числа строки — то, с чем сверяемся. */
  saved: { sizeId?: number; consumption?: string }[];
}) {
  // Форма — из контекста, как у useCardDxfPack: компонент монтируется только внутри формы карточки,
  // и пробрасывать control сквозь NormSummary ради двух хуков значило бы таскать его через слой,
  // которому он не нужен.
  const { control } = useFormContext<TechCardFormData>();
  const { pieces, unaliasedPieces } = useFabricDxfPieces(control, lineKey);
  const cardSeamMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? null) as
    | number
    | string
    | null;
  // Цех ждём (в отличие от диалога, где поле правится руками): вердикт печатается сразу и целиком,
  // и окно, в котором припуск «умолчание раскладки» лишь потому, что настройки ещё едут, делало бы
  // подпись условий враньём. Запрос дешёвый, ключ общий на всё приложение.
  const workshop = useWorkshopSettings();
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, true);
  const index = useDxfIndex(geometry.data);

  const conditions = useMemo(
    () =>
      geometry.data && index
        ? defaultApplyConditions(
            geometry.data,
            index,
            cardSeamMm,
            workshop.data?.settings?.defaultSeamAllowanceMm,
          )
        : null,
    [geometry.data, index, cardSeamMm, workshop.data],
  );

  const outcome = useMemo(() => {
    if (!index || !conditions) return null;
    return dxfNormAreas({
      index,
      pieces,
      unaliasedPieces,
      sizeIds,
      tokensOfSize: (id) => sizeTokensOf(sizeNameById.get(id)),
      contourLayer: conditions.layer,
      allowanceCm: mmToEngineCm(conditions.prefill.value) ?? 0,
    });
  }, [index, conditions, pieces, unaliasedPieces, sizeIds, sizeNameById]);

  const sizeName = (id: number) => formatSizeName(sizeNameById.get(id) ?? `#${id}`);

  // ── стоп-условия конвейера применения: каждая ветка называет себя, а не молчит ──────────────
  //
  // ПУСТАЯ ПАЧКА НАЗЫВАЕТСЯ ПУСТОЙ ОТДЕЛЬНО: `useDxfGeometry` при нуле файлов — отключённый запрос,
  // а у отключённого запроса в react-query v5 `isPending` вечно true — без этой ветки раскрывашка
  // «пересчитывала» бы навсегда.
  if (pack.length === 0) {
    return (
      <Line>
        пересчёт по текущим данным не делается: на карточке нет ни одного DXF. Про сохранённое число
        это не говорит — его могли снять, когда выкройки ещё были загружены
      </Line>
    );
  }
  if (geometry.isPending || workshop.isPending) {
    return <Line>пересчитываем по текущим данным карточки…</Line>;
  }
  if (geometry.isError) {
    return (
      <Line>
        {`пересчёт по текущим данным не удался: ${geometry.error?.message || 'неизвестная ошибка'}. Сохранённая норма продолжает действовать`}
      </Line>
    );
  }
  // ЧАСТИЧНО СКАЧАННАЯ ПАЧКА — СРАВНЕНИЯ НЕТ, и это самое важное из стоп-условий: если свежая
  // ревизия листа не скачалась, а старая в пачке есть, расчёт соберётся по старой и покажет ЛОЖНОЕ
  // СОВПАДЕНИЕ. Диалог применения такой результат прямо запрещает — здесь запрет тот же.
  const downloadFailures = (geometry.data?.warnings ?? []).filter(
    (w) => w.includes('не удалось скачать') || w.includes('не разобрал'),
  );
  if (downloadFailures.length > 0) {
    return (
      <Line>
        {`сравнения нет — часть выкроек не скачалась или не разобралась (${downloadFailures.join('; ')}): расчёт собрался бы по тем листам, что скачались, — например, по прежней ревизии — и совпадение или расхождение было бы ложным`}
      </Line>
    );
  }
  // Страховка: ширина известна ДО ленивой части, и NormSummary на неизвестной вообще не монтирует
  // пересчёт (качать мегабайты ради этой строки незачем). Причина называется НЕ как «не заполнена»:
  // `cuttingWidthOf` отдаёт пустую строку и когда ширины нет, и когда кромка съела её целиком
  // (рулон − 2×кромка ≤ 0) — «заполните ширину» отправило бы оператора править уже заполненное поле.
  const widthCm = parseDecimalNumber(articleWidth);
  if (!(widthCm > 0)) {
    return (
      <Line>
        пересчёт по текущим данным не делается: раскройная ширина артикула неизвестна — либо не
        заполнена ширина рулона, либо кромка съедает её целиком. Делить площадь не на что
      </Line>
    );
  }
  if (!outcome || !conditions) return <Line>пересчитываем по текущим данным карточки…</Line>;
  // Отказ геометрии — дословно, и БЕЗ утверждения, что сохранённое число неверно: его могли снять
  // при другом составе пачки или других условиях.
  if (!outcome.ok) {
    return (
      <Line>
        {`сегодняшний пересчёт не сходится не с числом, а сам по себе: ${outcome.reason}. Про сохранённое число это не говорит — его могли снять при других данных карточки`}
      </Line>
    );
  }

  // Страховка от рассинхрона с NormSummary (тот не монтирует пересчёт на единице, которую мы не
  // пишем, и на кг-слоте без основы веса): сравнить килограммы с метрами — или посчитать кг не
  // той шириной — и закричать «расхождение» было бы худшим из возможных исходов.
  const step = bomUnitStep(unit);
  if (step == null) {
    // Пустая единица — не «неизвестная»: у неё есть адресная починка (заполнить единицу на
    // вкладке BOM), и отказ обязан её назвать, а не предлагать словарь единиц, который тут ни
    // при чём.
    return (
      <Line>
        {unit
          ? `для единицы «${unit}» пересчёт не считается — сравнивать умеем метры, сантиметры и килограммы`
          : 'пересчёт не считается: у слота не заполнена единица — норма пишется в единице слота, заполните её на вкладке BOM'}
      </Line>
    );
  }
  const unitKind = bomUnitKind(unit);
  if (unitKind === 'kg' && !weightBasis.ok) {
    // Отказ называет, ЧЕГО не хватает — ширины или плотности: лечится он заполнением артикула,
    // а не сменой единицы слота. Пин колорвея меняет слова: искали у пинованного артикула.
    return (
      <Line>{`пересчёт по текущим данным не делается: ${weightRefusalText(weightBasis.missing, weightBasis.pinned)}`}</Line>
    );
  }
  const fabric = weightBasis.ok ? weightBasis.basis : undefined;

  // ── сегодняшние числа и сравнение ───────────────────────────────────────────────────────────
  const rows = dxfNormValueRows(outcome.areas.rows, widthCm, unit, fabric);
  const todayBySize = new Map(rows.map((r) => [r.sizeId, r]));
  const ambiguous = new Set(outcome.areas.sizesAmbiguousPick);
  const incompleteSet = new Set(outcome.areas.sizesIncomplete);

  // Обе стороны — в единице строки. Допуск — max(1% от сохранённого, шаг округления единицы):
  // сохранённое уже прошло toBomUnit, и дребезг последнего знака не должен читаться как расхождение.
  //
  // ВНУТРИ ДОПУСКА — НЕ «ТО ЖЕ ЧИСЛО», и это разные сообщения. 1% от 1.420 м — это 14 мм: сохранённое
  // 1.420 и сегодняшнее 1.433 попадают в допуск, но «даёт те же округлённые значения» про них —
  // ложь, они разные и на экране выглядели бы разными. Поэтому совпадение ЗНАК В ЗНАК и совпадение
  // в пределах допуска считаются отдельно и говорят о себе по-разному.
  const diverged: { id: number; was: string; now: string }[] = [];
  const withinTolerance: { id: number; was: string; now: string }[] = [];
  const ambiguousSaved: number[] = []; // выбор контура неоднозначен — числовых утверждений нет
  const incompleteToday: number[] = []; // комплект деталей сегодня не собрался
  const zeroToday: number[] = []; // число округлилось в ноль — «нормой» его не назвал бы и диалог
  const unreadable: number[] = []; // сохранённое не читается как число
  let exact = 0;
  for (const s of saved) {
    const id = s.sizeId ?? 0;
    // Размер, выпавший из ряда карточки, не сверяем: план прогона его строку уже не читает.
    if (!id || !sizeIds.includes(id)) continue;
    const wasStr = (s.consumption ?? '').trim();
    if (!wasStr) continue;
    if (ambiguous.has(id)) {
      ambiguousSaved.push(id);
      continue;
    }
    if (incompleteSet.has(id)) {
      incompleteToday.push(id);
      continue;
    }
    const was = parseDecimalNumber(wasStr);
    if (!Number.isFinite(was)) {
      unreadable.push(id);
      continue;
    }
    const today = todayBySize.get(id);
    if (!today || today.conv == null) {
      incompleteToday.push(id);
      continue;
    }
    if (today.value == null) {
      zeroToday.push(id);
      continue;
    }
    if (Math.abs(was - today.conv.value) > Math.max(Math.abs(was) * 0.01, step)) {
      diverged.push({ id, was: wasStr, now: today.value });
    } else if (was === today.conv.value) {
      exact++;
    } else {
      withinTolerance.push({ id, was: wasStr, now: today.value });
    }
  }

  // РАЗМЕРЫ, КОТОРЫХ В СОХРАНЁННОМ НЕТ ВОВСЕ, цикл выше не видит — он ходит по `saved`. А сегодняшний
  // пересчёт про них кое-что знает, и это ровно тот ответ, за которым оператор придёт после пилюли
  // «нет нормы: M»: переприменить не выйдет, потому что комплекта M сегодняшние выкройки не дают.
  // Без этой ветки раскрывашка на такой строке писала бы «те же значения» (сравнив один S) — и
  // выглядела бы подтверждением полноты рядом с пилюлей о её отсутствии.
  const savedIds = new Set(saved.map((s) => s.sizeId ?? 0).filter(Boolean));
  const unsavedIncomplete = sizeIds.filter((id) => !savedIds.has(id) && incompleteSet.has(id));

  // Слой называется СЕГОДНЯШНИМ по умолчанию не для красоты: он ранжируется по ВСЕЙ пачке
  // карточки, и DXF подкладки, загруженный после применения, мог сменить победителя для верха.
  // На кг-слоте в условия входит и основа веса — она такой же вход пересчёта, как ширина, и
  // сегодняшняя: применяли, возможно, при другой.
  const conditionsText = `слой ${conditions.layer || '—'} (сегодняшний слой по умолчанию — не обязательно тот, которым применяли), припуск ${conditions.prefill.value} мм (${conditions.prefill.why}), раскройная ширина ${articleWidth} см${
    unitKind === 'kg' && fabric ? `, вес по основе: ${weightBasisLabel(fabric)}` : ''
  }`;

  const notes: string[] = [];
  if (ambiguousSaved.length > 0) {
    notes.push(
      `для размеров ${ambiguousSaved.map(sizeName).join(', ')} числовое сравнение не делается: ${
        outcome.areas.ambiguousPickPieces.length > 0
          ? `детали ${outcome.areas.ambiguousPickPieces.map((n) => `«${n}»`).join(', ')} лежат`
          : 'деталь лежит'
      } на слое в нескольких совпадающих по площади копиях, и какая попадёт в расчёт, зависит от порядка листов в пачке`,
    );
  }
  if (incompleteToday.length > 0) {
    notes.push(
      `для размеров ${incompleteToday.map(sizeName).join(', ')} комплект деталей сегодня не собрался — сравнить нечем`,
    );
  }
  if (zeroToday.length > 0) {
    notes.push(
      `для размеров ${zeroToday.map(sizeName).join(', ')} пересчитанное число округлилось в ноль в единице «${unit}» — сравнить нечем`,
    );
  }
  if (unreadable.length > 0) {
    notes.push(
      `сохранённое число размеров ${unreadable.map(sizeName).join(', ')} не читается как число`,
    );
  }
  if (unsavedIncomplete.length > 0) {
    notes.push(
      `размеры ${unsavedIncomplete.map(sizeName).join(', ')} нормы не имеют, и сегодняшние выкройки её не дадут: комплект деталей для них не собрался — применять «по выкройкам» пока не из чего`,
    );
  }
  // ВЫПУКЛАЯ ОБОЛОЧКА — ЗАПАСНОЙ ГЕОМЕТРИЧЕСКИЙ ПУТЬ, и молчать о нём нельзя ни в применении (там
  // плашка есть), ни здесь: площадь такой детали взята С ЗАПАСОМ, то есть и совпадение, и
  // расхождение получены не тем же способом, каким считается обычная деталь.
  if (outcome.areas.hulled.length > 0) {
    notes.push(
      `сегодняшняя площадь деталей ${outcome.areas.hulled.map((n) => `«${n}»`).join(', ')} взята по выпуклой оболочке (офсет припуска не сошёлся) — это площадь с запасом`,
    );
  }
  // Ошибка настроек цеха не останавливает пересчёт (сохранённая норма и так действует), но цеховой
  // стандарт припуска в условиях НЕ участвовал — а подпись прифилла об этом не знает и назовёт
  // источником умолчание. Без этой строки расхождение выглядело бы свойством выкроек.
  if (workshop.isError) {
    notes.push(
      'настройки цеха не читаются, поэтому цеховой стандарт припуска в сегодняшних условиях не участвовал — если он задан, пересчёт считан по другому припуску',
    );
  }

  if (diverged.length > 0) {
    return (
      <>
        <span className='self-start'>
          <Pill tone='attention'>не совпадает с расчётом по текущим данным</Pill>
        </span>
        <Line>
          {diverged.map((d) => `${sizeName(d.id)}: было ${d.was}, сейчас ${d.now}`).join(' · ')}
        </Line>
        {withinTolerance.length > 0 && (
          <Line>
            {`в пределах допуска: ${withinTolerance
              .map((d) => `${sizeName(d.id)}: было ${d.was}, сейчас ${d.now}`)
              .join(' · ')}`}
          </Line>
        )}
        <Line>{`считали сейчас так: ${conditionsText}`}</Line>
        {/* «Выкройки изменились» писать ЗАПРЕЩЕНО: расхождение значит ровно то, что ниже. */}
        <Line>
          в расчёт входит не только геометрия выкроек: состав деталей этой ткани, их количество на
          изделие, связи деталей с блоками и порядок этих связей, назначение ткани в BOM, размерный
          ряд и имена размеров, единица строки, раскройная ширина, слой и припуск — а на слоте в
          килограммах ещё полная ширина рулона и плотность артикула — расхождение может означать
          изменение любого из этих входов
        </Line>
        <Line>
          какие условия были при применении, строка не записывает — сказать, что именно разошлось,
          нечем
        </Line>
        {notes.map((n, i) => (
          <Line key={i}>{n}</Line>
        ))}
      </>
    );
  }

  // РАЗНИЦА В ПРЕДЕЛАХ ДОПУСКА НАЗЫВАЕТСЯ РАЗНИЦЕЙ И ПОКАЗЫВАЕТ ЧИСЛА. Допуск в 1% на метровой норме
  // — это 14 мм: назвать 1.420 и 1.433 «теми же значениями» значило бы соврать про то, что оператор
  // увидел бы своими глазами. Допуск существует, чтобы не кричать РАСХОЖДЕНИЕМ, а не чтобы скрывать.
  if (withinTolerance.length > 0 && notes.length === 0) {
    return (
      <>
        <Line>
          {`пересчёт по текущим данным карточки расходится не больше допуска (1% либо шаг единицы): ${withinTolerance
            .map((d) => `${sizeName(d.id)}: было ${d.was}, сейчас ${d.now}`)
            .join(' · ')}`}
        </Line>
        <Line>{`считали сейчас так: ${conditionsText}`}</Line>
      </>
    );
  }
  // Совпавшие размеры не перечисляются, и «совпало» не заявляется свойством НОРМЫ, только текущего
  // расчёта: сравнение идёт по площади и после округления единицы — 141.96 см и 142.04 см дают одно
  // и то же «1.420 м», а деталь могла поменять форму, сохранив площадь. Одна нейтральная фраза, и
  // только когда сравнились ВСЕ сохранённые размеры и ни один не оставил примечания.
  if (exact > 0 && notes.length === 0) {
    return <Line>{`пересчёт по текущим данным карточки даёт те же числа; ${conditionsText}`}</Line>;
  }
  if (notes.length > 0) {
    return (
      <>
        {/* Числа, разошедшиеся в пределах допуска, печатаются и здесь: иначе строка с примечанием
            по одному размеру молчала бы о разнице по другому. */}
        {withinTolerance.length > 0 && (
          <Line>
            {`в пределах допуска: ${withinTolerance
              .map((d) => `${sizeName(d.id)}: было ${d.was}, сейчас ${d.now}`)
              .join(' · ')}`}
          </Line>
        )}
        {notes.map((n, i) => (
          <Line key={i}>{n}</Line>
        ))}
      </>
    );
  }
  // Сюда попадает строка, у которой пер-размерных чисел нет вовсе — например dxf-норма, живущая
  // ОДНИМ скаляром (сервер такую форму принимает: `dxf` требует «число или ряд», а не ряд).
  // Сопоставлять скаляр с пер-размерным пересчётом нечем: это числа про разное.
  return (
    <Line>
      {`сравнить не с чем: пер-размерных чисел в строке нет, а пересчёт по выкройкам даёт числа по размерам${
        conditions ? ` (${conditionsText})` : ''
      }`}
    </Line>
  );
}
