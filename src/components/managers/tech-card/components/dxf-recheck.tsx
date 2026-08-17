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
import { useMemo, useState, type ReactNode } from 'react';
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
import { BreakdownSizeChips, DxfPieceBreakdown, middleSize } from './nesting/dxf-piece-breakdown';
import {
  weightBasisLabel,
  weightRefusalText,
  type WeightBasisResolution,
} from './nesting/fabric-weight';
import { isFetchFailure } from './nesting/dxf-warnings';
import { bomUnitKind, bomUnitStep } from './nesting/marker-io';
import type { TechCardFormData } from './schema';
import { useFabricDxfPieces, type RecipePieceLink } from './use-fabric-dxf-pieces';

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
  recipeLinks,
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
  /** Привязки «деталь → слот» из строк рецепта — тот же второй источник, что у применения. */
  recipeLinks?: readonly RecipePieceLink[];
  /** Сохранённые пер-размерные числа строки — то, с чем сверяемся. */
  saved: { sizeId?: number; consumption?: string }[];
}) {
  // Форма — из контекста, как у useCardDxfPack: компонент монтируется только внутри формы карточки,
  // и пробрасывать control сквозь NormSummary ради двух хуков значило бы таскать его через слой,
  // которому он не нужен.
  const { control } = useFormContext<TechCardFormData>();
  const { pieces, unaliasedPieces } = useFabricDxfPieces(control, lineKey, recipeLinks);
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

  // РАСКРОЙНАЯ ШИРИНА И ОСНОВА ВЕСА — ДО ВЕРДИКТА, потому что нужны они ДВОИМ: и сравнению «было /
  // сейчас», и разбивке по деталям под ним. Вердикт состоит из десятка ранних возвратов, и всё,
  // объявленное внутри него, для разбивки недосягаемо.
  const widthCm = parseDecimalNumber(articleWidth);
  const fabric = weightBasis.ok ? weightBasis.basis : undefined;
  // ЧАСТИЧНО СКАЧАННАЯ ПАЧКА ГАСИТ И РАЗБИВКУ, А НЕ ТОЛЬКО СРАВНЕНИЕ. Вердикт на этом входе
  // отказывается сравнивать (см. ветку ниже) ровно потому, что расчёт собрался бы по тем листам,
  // что скачались, — например по ПРЕЖНЕЙ ревизии. Таблица «расход по деталям» построена тем же
  // расчётом и унаследовала бы ту же ложь, только в более убедительном виде: у неё на каждой
  // строке площадь конкретной детали, и подделку такого вида глазом не поймать вовсе. Поэтому
  // условие вычисляется ЗДЕСЬ, снаружи вердикта, и гасит оба показа одним фактом.
  const downloadFailures = (geometry.data?.warnings ?? []).filter(isFetchFailure);
  // Размер, на котором показана разбивка. Состояние объявлено ЗДЕСЬ, среди хуков: ниже начинается
  // цепочка ранних возвратов, и хук, поставленный там, вызывался бы не на каждом рендере.
  const [pickedSize, setPickedSize] = useState<number | null>(null);
  // ЦЕХ ЖДЁМ И ДЛЯ РАЗБИВКИ ТОЖЕ. Пока настройки цеха в пути, `defaultApplyConditions` строит
  // припуск по УМОЛЧАНИЮ раскладки — и это ровно то окно, из-за которого вердикт выше печатается
  // только целиком (см. комментарий у useWorkshopSettings). Геометрия при этом может быть тёплой,
  // то есть `outcome` уже посчитан — по припуску, который через секунду сменится: таблица площадей
  // успела бы показать числа, посчитанные не тем контуром, и разница ровно в припуск по периметру
  // КАЖДОЙ детали. `geometry.isPending` здесь избыточен (без данных `outcome` и так null) и стоит
  // ради явности: условие показа обязано читаться целиком в одном месте.
  const breakdownShown =
    !!outcome?.ok && downloadFailures.length === 0 && !workshop.isPending && !geometry.isPending;
  const breakdownSizeIds = outcome?.ok ? outcome.areas.rows.map((r) => r.sizeId) : [];
  const breakdownSize =
    pickedSize != null && breakdownSizeIds.includes(pickedSize)
      ? pickedSize
      : middleSize(breakdownSizeIds);

  // ── стоп-условия конвейера применения: каждая ветка называет себя, а не молчит ──────────────
  //
  // ВЕРДИКТ ЗАВЁРНУТ В ФУНКЦИЮ, а не написан ранними возвратами компонента, и это вынужденно: под
  // ним теперь стоит разбивка «расход по деталям», которая обязана показываться и тогда, когда
  // сравнивать не с чем (норму применили давно, сохранённых пер-размерных чисел нет). Ранний
  // возврат компонента унёс бы её с собой в половине веток.
  const verdict = (): ReactNode => {
    //
    // ПУСТАЯ ПАЧКА НАЗЫВАЕТСЯ ПУСТОЙ ОТДЕЛЬНО: `useDxfGeometry` при нуле файлов — отключённый запрос,
    // а у отключённого запроса в react-query v5 `isPending` вечно true — без этой ветки раскрывашка
    // «пересчитывала» бы навсегда.
    if (pack.length === 0) {
      return (
        <Line>
          no recompute on current data: the card carries no DXF at all. that says nothing about the
          saved number — it could have been captured while the patterns were still uploaded
        </Line>
      );
    }
    if (geometry.isPending || workshop.isPending) {
      return <Line>recomputing on the card's current data…</Line>;
    }
    if (geometry.isError) {
      return (
        <Line>
          {`the recompute on current data failed: ${geometry.error?.message || 'unknown error'}. the saved norm stays in force`}
        </Line>
      );
    }
    // ЧАСТИЧНО СКАЧАННАЯ ПАЧКА — СРАВНЕНИЯ НЕТ, и это самое важное из стоп-условий: если свежая
    // ревизия листа не скачалась, а старая в пачке есть, расчёт соберётся по старой и покажет ЛОЖНОЕ
    // СОВПАДЕНИЕ. Диалог применения такой результат прямо запрещает — здесь запрет тот же.
    // (Список считается выше, снаружи вердикта: тем же фактом гасится и разбивка по деталям.)
    if (downloadFailures.length > 0) {
      return (
        <Line>
          {`no comparison — some of the patterns didn't download (${downloadFailures.join('; ')}): the calculation would be assembled from the sheets that did download — from a previous revision, say — and a match or a divergence would be false`}
        </Line>
      );
    }
    // Страховка: ширина известна ДО ленивой части, и NormSummary на неизвестной вообще не монтирует
    // пересчёт (качать мегабайты ради этой строки незачем). Причина называется НЕ как «не заполнена»:
    // `cuttingWidthOf` отдаёт пустую строку и когда ширины нет, и когда кромка съела её целиком
    // (рулон − 2×кромка ≤ 0) — «заполните ширину» отправило бы оператора править уже заполненное поле.
    if (!(widthCm > 0)) {
      return (
        <Line>
          no recompute on current data: the cutting width of the article is unknown — either the
          roll width is not filled in, or the selvedge eats it whole. there is nothing to divide the
          area by
        </Line>
      );
    }
    if (!outcome || !conditions) return <Line>recomputing on the card's current data…</Line>;
    // Отказ геометрии — дословно, и БЕЗ утверждения, что сохранённое число неверно: его могли снять
    // при другом составе пачки или других условиях.
    if (!outcome.ok) {
      return (
        <Line>
          {`today's recompute doesn't add up on its own, never mind against the number: ${outcome.reason}. that says nothing about the saved number — it could have been captured on different card data`}
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
            ? `for the unit “${unit}” the recompute is not computed — we can compare metres, centimetres and kilograms`
            : 'the recompute is not computed: the slot has no unit filled in — the norm is written in the unit of the slot, fill it in on the BOM tab'}
        </Line>
      );
    }
    const unitKind = bomUnitKind(unit);
    if (unitKind === 'kg' && !weightBasis.ok) {
      // Отказ называет, ЧЕГО не хватает — ширины или плотности: лечится он заполнением артикула,
      // а не сменой единицы слота. Пин колорвея меняет слова: искали у пинованного артикула.
      return (
        <Line>{`no recompute on current data: ${weightRefusalText(weightBasis.missing, weightBasis.pinned)}`}</Line>
      );
    }

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
    const conditionsText = `layer ${conditions.layer || '—'} (today's default layer — not necessarily the one it was applied with), seam allowance ${conditions.prefill.value} mm (${conditions.prefill.why}), cutting width ${articleWidth} cm${
      unitKind === 'kg' && fabric ? `, weight basis: ${weightBasisLabel(fabric)}` : ''
    }`;

    const notes: string[] = [];
    if (ambiguousSaved.length > 0) {
      notes.push(
        `for sizes ${ambiguousSaved.map(sizeName).join(', ')} no numeric comparison is made: ${
          outcome.areas.ambiguousPickPieces.length > 0
            ? `pieces ${outcome.areas.ambiguousPickPieces.map((n) => `“${n}”`).join(', ')} lie`
            : 'a piece lies'
        } on the layer in several copies matching by area, and which one lands in the calculation depends on the order of the sheets in the pack`,
      );
    }
    if (incompleteToday.length > 0) {
      notes.push(
        `for sizes ${incompleteToday.map(sizeName).join(', ')} the set of pieces didn't come together today — there is nothing to compare`,
      );
    }
    if (zeroToday.length > 0) {
      notes.push(
        `for sizes ${zeroToday.map(sizeName).join(', ')} the recomputed number rounded to zero in the unit “${unit}” — there is nothing to compare`,
      );
    }
    if (unreadable.length > 0) {
      notes.push(
        `the saved number of sizes ${unreadable.map(sizeName).join(', ')} does not read as a number`,
      );
    }
    if (unsavedIncomplete.length > 0) {
      notes.push(
        `sizes ${unsavedIncomplete.map(sizeName).join(', ')} have no norm, and today's patterns will not give one: the set of pieces for them didn't come together — there is nothing to apply “by patterns” from yet`,
      );
    }
    // ВЫПУКЛАЯ ОБОЛОЧКА — ЗАПАСНОЙ ГЕОМЕТРИЧЕСКИЙ ПУТЬ, и молчать о нём нельзя ни в применении (там
    // плашка есть), ни здесь: площадь такой детали взята С ЗАПАСОМ, то есть и совпадение, и
    // расхождение получены не тем же способом, каким считается обычная деталь.
    if (outcome.areas.hulled.length > 0) {
      notes.push(
        `today's area of pieces ${outcome.areas.hulled.map((n) => `“${n}”`).join(', ')} is taken from the convex hull (the allowance offset didn't work out) — that is an area with a margin`,
      );
    }
    // Ошибка настроек цеха не останавливает пересчёт (сохранённая норма и так действует), но цеховой
    // стандарт припуска в условиях НЕ участвовал — а подпись прифилла об этом не знает и назовёт
    // источником умолчание. Без этой строки расхождение выглядело бы свойством выкроек.
    if (workshop.isError) {
      notes.push(
        "the workshop settings cannot be read, so the workshop allowance standard did not take part in today's conditions — if one is set, the recompute was counted on a different allowance",
      );
    }

    if (diverged.length > 0) {
      return (
        <>
          <span className='self-start'>
            <Pill tone='attention'>does not match the calculation on current data</Pill>
          </span>
          <Line>
            {diverged.map((d) => `${sizeName(d.id)}: was ${d.was}, now ${d.now}`).join(' · ')}
          </Line>
          {withinTolerance.length > 0 && (
            <Line>
              {`within tolerance: ${withinTolerance
                .map((d) => `${sizeName(d.id)}: was ${d.was}, now ${d.now}`)
                .join(' · ')}`}
            </Line>
          )}
          <Line>{`this is how it was counted just now: ${conditionsText}`}</Line>
          {/* «Выкройки изменились» писать ЗАПРЕЩЕНО: расхождение значит ровно то, что ниже. */}
          <Line>
            the calculation takes in more than the geometry of the patterns: the set of pieces of this
            fabric, their per-garment count, the piece-to-block links and the order of those links,
            the purpose of the fabric in the BOM, the size range and the size names, the unit of the
            line, the cutting width, the layer and the seam allowance — and on a slot in kilograms
            the full roll width and the density of the article too — a divergence can mean a change in any of these inputs
          </Line>
          <Line>
            what the conditions were at the time of applying, the line does not record — there is
            nothing to say what exactly diverged
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
            {`the recompute on the card's current data diverges by no more than the tolerance (1% or the step of the unit): ${withinTolerance
              .map((d) => `${sizeName(d.id)}: was ${d.was}, now ${d.now}`)
              .join(' · ')}`}
          </Line>
          <Line>{`this is how it was counted just now: ${conditionsText}`}</Line>
        </>
      );
    }
    // Совпавшие размеры не перечисляются, и «совпало» не заявляется свойством НОРМЫ, только текущего
    // расчёта: сравнение идёт по площади и после округления единицы — 141.96 см и 142.04 см дают одно
    // и то же «1.420 м», а деталь могла поменять форму, сохранив площадь. Одна нейтральная фраза, и
    // только когда сравнились ВСЕ сохранённые размеры и ни один не оставил примечания.
    if (exact > 0 && notes.length === 0) {
      return (
        <Line>{`the recompute on the card's current data gives the same numbers; ${conditionsText}`}</Line>
      );
    }
    if (notes.length > 0) {
      return (
        <>
          {/* Числа, разошедшиеся в пределах допуска, печатаются и здесь: иначе строка с примечанием
            по одному размеру молчала бы о разнице по другому. */}
          {withinTolerance.length > 0 && (
            <Line>
              {`within tolerance: ${withinTolerance
                .map((d) => `${sizeName(d.id)}: was ${d.was}, now ${d.now}`)
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
        {`there is nothing to compare with: the line carries no per-size numbers, while the recompute by patterns gives numbers per size${
          conditions ? ` (${conditionsText})` : ''
        }`}
      </Line>
    );
  };

  return (
    <>
      {verdict()}
      {/* ── РАСХОД ПО ДЕТАЛЯМ, ПРЯМО В СТРОКЕ РЕЦЕПТА ──────────────────────────────────────
          Тот же разбор, что в диалоге применения, и той же функцией — но ЧИТАТЬ его можно там,
          где норму уже применили: на выпущенной (RELEASED) карточке диалога нет вовсе, а вопрос
          «на что уходит эта ткань» там как раз и задают — менять уже нельзя, а понять, из чего
          сложилась цена, надо.

          Своей раскрывашкой, а не сразу: тридцать строк таблицы внутри «из чего сложилось»
          сделали бы вердикт (ради которого раскрывашку и открыли) первой строкой длинного
          свитка. Геометрия к этому моменту уже разобрана — открытие не стоит ни запроса. */}
      {breakdownShown && outcome?.ok && (
        <details className='pt-1'>
          <summary className='cursor-pointer'>
            <Text size='nano' variant='label' component='span' className='uppercase'>
              consumption by piece
            </Text>
          </summary>
          <div className='flex flex-col gap-1.5 pt-1'>
            {/* Заголовка группы здесь нет намеренно: раскрывашка уже названа, а ruled-подпись
                внутри неё была бы третьим уровнем разметки в строке рецепта — ровно то
                «блок в блоке», которого система не держит. Размер называют сами чипы. */}
            <BreakdownSizeChips
              sizeIds={breakdownSizeIds}
              sizeId={breakdownSize}
              sizeNameById={sizeNameById}
              onChange={setPickedSize}
            />
            <DxfPieceBreakdown
              index={index}
              pieces={pieces}
              areas={outcome.areas}
              sizeId={breakdownSize}
              sizeNameById={sizeNameById}
              cuttingWidthCm={widthCm}
              unit={unit}
              fabric={fabric}
            />
            {/* Разбор СЕГОДНЯШНИЙ, а сохранённая норма могла быть снята при других данных — и
                сказать это обязано именно то место, где стоят числа. Вердикт выше говорит про
                СРАВНЕНИЕ; здесь речь о самой таблице, и без этой строки её легко прочитать как
                «вот из чего сложено сохранённое число». */}
            <Text size='nano' variant='label' component='p'>
              the parse is computed on TODAY's patterns and today's conditions; the saved norm may
              have been captured on different ones — see the “was / now” check above
            </Text>
          </div>
        </details>
      )}
    </>
  );
}
