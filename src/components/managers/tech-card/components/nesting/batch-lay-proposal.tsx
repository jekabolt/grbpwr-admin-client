// ПРЕДЛОЖЕНИЕ НАСТИЛА ПО СНЯТОЙ РАСКЛАДКЕ — последний шаг очереди раскроя партии.
//
// Очередь только что измерила настил партии: раскладка сохранена, её длина и КПД известны. Дальше
// оператор уходил на страницу партии и набирал ту же строку руками — выбирал ту же раскладку,
// вводил число слоёв, ставил режим. Здесь это предлагается готовым.
//
// ═══ ЧТО ВЫВОДИТСЯ ИЗ ДАННЫХ, А ЧТО ОСТАЁТСЯ ЗА ЧЕЛОВЕКОМ ══════════════════════════════════════
//
// ЧИСЛО СЛОЁВ ВЫВОДИТСЯ — но из ПАРТИИ, а не из геометрии раскладки. Состав настила партии есть
// соотношение размеров этой партии, ужатое на НОД (60 M + 40 L → 3 M + 2 L), поэтому слоёв =
// количество в партии ÷ количество в составе, и по построению НОДа это деление точное и даёт одно
// и то же число на каждом размере: 60/3 = 40/2 = 20. Ни одно из этих чисел не берётся с полотна —
// длина раскладки в расчёт слоёв не входит вовсе.
//
// КОНЦЕВЫЕ ПОТЕРИ НЕ ВЫВОДЯТСЯ НИОТКУДА. Это свойство СТОЛА (сколько ткани уходит на захват у
// каждого конца настила), а не ткани и не раскладки, и вывести его из геометрии нельзя ни в каком
// виде. Единственная честная подстановка — то, что оператор уже написал на настилах ЭТОЙ ЖЕ
// партии: тот же цех, тот же стол. Разошлись значения между настилами — не подставляем ничего,
// потому что выбирать за человека из двух его же ответов не на чем.
//
// ═══ ПРЕДЛАГАЕМ, А НЕ СОЗДАЁМ ══════════════════════════════════════════════════════════════════
//
// Кнопка открывает ТУ ЖЕ форму настила (`LayEditor`), которой пользуется страница партии, — с уже
// заполненными полями. Второй формы здесь нет и быть не может: настил — это ключ идемпотентности,
// оптимистичная блокировка, полная замена секций, лот и факт расхода, и вторая её реализация
// разошлась бы с первой на первой же правке. Запись происходит по кнопке человека внутри формы.
import type { common_ProductionLayMode, common_ProductionRunLay } from 'api/proto-http/admin';
import {
  LAY_END_LOSS_DEFAULT_CM,
  LayEditor,
  type LayEditorContext,
} from 'components/managers/production-runs/components/lay-editor';
import { layGeometry } from 'components/managers/production-runs/components/lay-geometry';
import { markerFitness } from 'components/managers/production-runs/components/marker-picker';
import {
  VERDICT_GLYPH,
  VERDICT_TEXT,
  allLayChecks,
  layVerdict,
} from 'components/managers/production-runs/components/useLays';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { BatchCell, JobSizeRow, MarkerJob } from './batch-marker-plan';
import { decNum } from './marker-io';
import { wireInt } from '../schema';

/**
 * РЕЖИМ НАСТИЛАНИЯ, КОТОРЫЙ ПРЕДЛАГАЕТСЯ, И ПОЧЕМУ ИМЕННО ОН.
 *
 * ЛИЦОМ ВВЕРХ — потому что раскладка очереди НЕ СОДЕРЖИТ НИ ОДНОГО ЗЕРКАЛЬНОГО РАЗМЕЩЕНИЯ, и это
 * факт кода, а не предположение: `buildJobConfig` (batch-marker-plan.ts) выставляет деталям только
 * `quantity` и НЕ ВЫСТАВЛЯЕТ `flippedQuantity`, а движок разворачивает зеркалом ровно
 * `mirroredCount(quantity, flippedQuantity)` последних экземпляров (nest/index.ts) — при
 * отсутствующем поле это ноль. Каждый контур чертежа лежит на полотне столько раз, сколько изделий
 * его размера в составе, и лежит КАК НАРИСОВАН.
 *
 * Значит ОДИН слой даёт ровно то, что нарисовано, — то есть ровно состав. Это и есть «лицом
 * вверх»: чётность не требуется (а выведенное число слоёв — НОД количеств партии, который сплошь и
 * рядом нечётен: партия 3 M + 2 L даёт ровно один слой), направленная ткань допустима, а зеркальные
 * детали обязаны лежать в раскладке парами.
 *
 * ЧЕГО ЭТОТ ВЫБОР НЕ УТВЕРЖДАЕТ. Лежат ли в раскладке ОБЕ детали зеркальной пары, решает ЧЕРТЁЖ:
 * в реальных файлах левая и правая полочки нарисованы отдельными блоками (FP_L против FP_R), и
 * тогда всё сходится, — но проверить это здесь нечем, потому что зеркальность детали живёт в
 * словаре деталей кроя, а не в геометрии. Отвечает на это сервер, проверкой `lay_mirror_expansion`
 * НА СЕКЦИИ настила: чертёж с одной половиной пары кроят как раз лицом к лицу.
 *
 * ЕЁ ВЕРДИКТ ПОКАЗЫВАЕТСЯ ЗДЕСЬ ЖЕ, на этом экране, а не «в форме». Форма рисует список проверок
 * только у СУЩЕСТВУЮЩЕГО настила (`allLayChecks(existing)`), а созданный она закрывает тостом
 * «Настил создан» — то есть на пути СОЗДАНИЯ ни одна серверная проверка не была бы видна ни разу,
 * и настил, кроящий сто левых полочек, выглядел бы удавшимся. Поэтому проверки сохранённого
 * настила читаются ниже прямо из ответа сервера, вместе с высотой стопки и шириной рулона.
 */
export const BATCH_LAY_MODE: common_ProductionLayMode = 'PRODUCTION_LAY_MODE_FACE_UP';

/** Слои, выведенные из партии. Отказ — с числами, по которым он вынесен. */
export type PliesDerivation =
  | { ok: true; plies: number; steps: string[] }
  | { ok: false; reason: string };

/**
 * СКОЛЬКО СЛОЁВ НАСТИЛАТЬ — из состава раскладки и количеств партии.
 *
 * Точность деления проверяется, а не предполагается. По построению НОДа она гарантирована, но
 * гарантия эта живёт в ДРУГОМ модуле (планировщик), и «должно делиться» — не то основание, на
 * котором можно молча округлить число слоёв: округление вверх кроит лишние изделия, вниз — не
 * докраивает партию, и оба варианта выглядят на экране одинаково нормальным целым числом.
 */
export function derivePlies(sizes: readonly JobSizeRow[]): PliesDerivation {
  if (sizes.length === 0) return { ok: false, reason: 'the marker has no composition' };
  let plies = 0;
  const steps: string[] = [];
  for (const r of sizes) {
    if (!(r.units > 0)) {
      return {
        ok: false,
        reason: `size ${r.sizeLabel} stands at zero in the composition — plies are not counted from it`,
      };
    }
    if (!(r.batchQty > 0)) {
      return {
        ok: false,
        reason: `the run does not order size ${r.sizeLabel}, yet it sits in the marker composition — how many plies to spread does not follow from that`,
      };
    }
    if (r.batchQty % r.units !== 0) {
      return {
        ok: false,
        reason: `${r.batchQty} pcs of size ${r.sizeLabel} do not divide evenly by the ${r.units} in the marker composition: the ply count would come out fractional, and rounding would either leave the run short or cut too much. the run composition changed after this marker was captured — re-capture it`,
      };
    }
    const p = r.batchQty / r.units;
    if (plies === 0) plies = p;
    else if (p !== plies) {
      return {
        ok: false,
        reason: `the sizes give a DIFFERENT ply count (${steps.join(', ')}, while ${r.sizeLabel}: ${r.batchQty} ÷ ${r.units} = ${p}) — which means the marker composition is no longer the ratio of this run. re-capture the lay`,
      };
    }
    steps.push(`${r.sizeLabel}: ${r.batchQty} ÷ ${r.units} = ${p}`);
  }
  return { ok: true, plies, steps };
}

/**
 * Размеры партии, которых НЕТ в составе раскладки, — то есть та часть заказа, которую этот настил
 * не выкроит.
 *
 * Спрашивается ПРЯМО У ДАННЫХ (клетки партии против состава задания), а не выводится из списка
 * отказов планировщика: планировщик сегодня отменяет всё задание целиком, если размера нет в
 * выкройках, но это его правило, а не свойство настила. Здесь важен ответ на другой вопрос —
 * покрывает ли ПРЕДЛАГАЕМЫЙ настил то, что заказано, — и он обязан оставаться верным независимо
 * от того, по какой причине размер выпал.
 */
export function uncoveredBatchSizes(
  job: MarkerJob,
  cells: readonly BatchCell[],
  sizeLabel: (sizeId: number) => string,
): string[] {
  const inComposition = new Set(job.sizes.map((s) => s.sizeId));
  const missing = new Set<number>();
  for (const c of cells) {
    // Клетка без размера или без колорвея отсеивается ТЕМ ЖЕ условием, каким её отсеивает
    // планировщик: раскладку на неё никто и не обещал, и объявить её «непокрытым размером #0»
    // значило бы выдумать отказ на пустом месте.
    if (c.colorwayId !== job.colorwayId || c.qty <= 0 || c.sizeId <= 0) continue;
    if (!inComposition.has(c.sizeId)) missing.add(c.sizeId);
  }
  return [...missing].map(sizeLabel);
}

/** Концевые потери, уже названные на настилах ЭТОЙ партии. undefined = подставлять нечего. */
export function batchEndLossPrefill(lays: readonly common_ProductionRunLay[]): {
  value?: string;
  why: string;
} {
  const seen = new Map<string, string>();
  for (const l of lays) {
    const raw = (l.endLossCm?.value ?? '').trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 0) continue;
    // Ключ — ЧИСЛО, а не строка: «2» и «2.00» это одно и то же значение, записанное двумя
    // способами, и считать их разными ответами значило бы отказаться от подстановки на пустом
    // месте. Показывается при этом первая написанная форма — она в этой партии и стоит.
    if (!seen.has(String(n))) seen.set(String(n), raw);
  }
  const values = [...seen.values()];
  if (values.length === 0) {
    return {
      why: `the run has no lays yet to ask — the form will substitute its own default of ${LAY_END_LOSS_DEFAULT_CM} cm per ply end`,
    };
  }
  if (values.length > 1) {
    return {
      why: `the lays of this run carry different values (${values.join(', ')} cm) — none of them can be substituted at random, so the form will take its own default of ${LAY_END_LOSS_DEFAULT_CM} cm`,
    };
  }
  return {
    value: values[0],
    why: `${values[0]} cm taken from the lays of this run — the same workshop and the same table`,
  };
}

const meters = (cm: number) => `${(cm / 100).toFixed(2)} m`;

/** Как настил называется на экране. Безымянный — законное состояние, и молчать про него нельзя. */
const layName = (l: common_ProductionRunLay) => l.name || l.bomItemName || l.layKey || 'unnamed';

/**
 * Блок предложения под итогом по одной ткани одного колорвея.
 *
 * Ничего не пишет сам: либо объясняет, почему предложить нечего, либо открывает форму настила с
 * заполненными полями.
 */
export function BatchLayProposal({
  job,
  markerId,
  cells,
  lays,
  sizeLabel,
  canEdit,
  locked,
  laysLoading,
  queueRunning,
  editor,
}: {
  /** Задание настила партии, чья раскладка только что снята. */
  job: MarkerJob;
  /** id сохранённой раскладки. 0 = в этой сессии она не сохранялась (см. отказ ниже). */
  markerId: number;
  /** Клетки партии — ими проверяется, покрывает ли предлагаемый настил заказ колорвея. */
  cells: readonly BatchCell[];
  /** Настилы прогона, как их отдал сервер. */
  lays: readonly common_ProductionRunLay[];
  sizeLabel: (sizeId: number) => string;
  /** Право на запись в производство (НЕ в тех-карты: настил принадлежит прогону). */
  canEdit: boolean;
  /** Партия принята или закрыта — настил это план, и на закрытой партии он не правится. */
  locked: boolean;
  /** Список настилов ещё читается: предлагать по непрочитанному списку значит предлагать дубль. */
  laysLoading: boolean;
  /**
   * Очередь ещё считает. Список настилов перечитывается ОДИН РАЗ, по её окончании (инвалидация
   * стоит в `finally` у `start()`), поэтому до конца очереди свежесохранённой раскладки в списке
   * может не быть — и это надо сказать словами, а не отправлять человека обновлять страницу.
   */
  queueRunning: boolean;
  editor: LayEditorContext;
}) {
  // Что открыто: '' — ничего, 'new' — новый настил, иначе lay_key существующего. Ключ, а не сам
  // объект: настил перечитывается с сервера, и держать его копию в состоянии значило бы править
  // форму по снимку, который успел устареть.
  const [openKey, setOpenKey] = useState('');

  const marker = editor.runMarkers.find((m) => wireInt(m.id) === markerId);
  const fit = marker ? markerFitness(marker, job.bomLineKey, job.colorwayId) : null;
  const plies = derivePlies(job.sizes);
  const uncovered = uncoveredBatchSizes(job, cells, sizeLabel);
  // СОСТАВ, СВЁДШИЙСЯ К ОДНОМУ ИЗДЕЛИЮ, — вырожденный случай, и он вырожден ровно так же, как в
  // измерении: очередь прямо над этим блоком отказывается называть его КПД процентом раскроя
  // партии. Предложить его как производство молча значило бы принять как факт то, что строкой
  // выше объявлено негодным.
  const singleGarment = job.unitsTotal <= 1;

  // ДУБЛЬ ЛОВИТСЯ ПО ПАРЕ (КОЛОРВЕЙ, СЛОТ), А НЕ ПО НОМЕРУ РАСКЛАДКИ. Это главное здесь.
  //
  // Обычный цикл работы — «поднимите бюджет и пересчитайте» — МЕНЯЕТ номер раскладки: как только
  // на прежнюю сослалась секция настила, планировщик исключает её из замены (её нельзя подменять
  // под живой производственной строкой), задание сохраняется НОВОЙ раскладкой, и предикат «есть ли
  // настил с ЭТИМ маркером» становится пустым. Кнопка нарисовалась бы как в первый раз, и прогон
  // получил бы два настила, каждый из которых планирует ВСЮ партию: потребность в ткани удвоена,
  // покрытие удвоено, в кат-лист уезжают два одинаковых настила по двадцать слоёв.
  //
  // Поэтому вопрос задаётся другой: есть ли у этой пары настил ВООБЩЕ. Настил партии на пару один
  // — его состав и есть соотношение партии, — и второй по той же паре из этого экрана не
  // предлагается никогда. Что делать со старым, решает человек, и обе законные развязки ведут в
  // одну и ту же форму: заменить раскладку в его секции (пересъёмка) либо удалить его на странице
  // партии.
  const pairLays = lays.filter(
    (l) => wireInt(l.colorwayId) === job.colorwayId && (l.bomLineKey ?? '') === job.bomLineKey,
  );
  const already = pairLays.find((l) =>
    (l.sections ?? []).some((s) => markerId > 0 && wireInt(s.markerId) === markerId),
  );
  const endLoss = batchEndLossPrefill(lays);

  // ОТКАЗЫ ПРОИЗНОСЯТСЯ ДО ТОГО, КАК ЧТО-ТО ОТКРЫЛОСЬ. Каждый из них — причина, по которой
  // предложенный настил был бы неверен, а не «кнопка недоступна»: увидеть их после создания
  // настила значит увидеть их после того, как на них уже сослались.
  //
  // ПРАВО И СОСТОЯНИЕ ПАРТИИ — ОТДЕЛЬНАЯ ПОЛОВИНА, потому что относится и к УЖЕ СОБРАННОМУ
  // настилу: открыть его на закрытой партии нельзя ровно так же, как создать новый, и кнопка,
  // погашенная без причины, читается как поломка.
  const writeRefusal = locked
    ? 'the run is received or closed — a lay is a plan, not history, and is edited only on an open run'
    : !canEdit
      ? "you don't have the rights to change production — the lay can't be saved"
      : '';
  // ПОРЯДОК — ОТ НЕПОЧИНИМОГО К ПРОХОДЯЩЕМУ САМО. Закрытая партия не станет открытой оттого, что
  // раскладку пересняли в этой сессии, и сказать про сессию первой значило бы послать человека
  // чинить то, что чинить не нужно.
  const refusal =
    writeRefusal ||
    (!plies.ok
      ? plies.reason
      : uncovered.length > 0
        ? `the lay WILL NOT COVER sizes ${uncovered.join(', ')} of this run: they are not in the marker composition. a lay row built on it would say the colourway is cut — while it is cut only in part`
        : markerId <= 0
          ? "this fabric's marker was not saved in this session — its id is unknown here, and guessing it by name is not allowed: a run can hold several markers of the same name"
          : laysLoading
            ? 'reading the lays of the run — until the list is read, no lay can be proposed: it could turn out to be a duplicate of an existing one'
            : !marker
              ? queueRunning
                ? 'the marker is saved, but the list of the run markers is re-read when the QUEUE finishes — wait until it counts out the remaining fabrics'
                : 'the saved marker was not found in the list of the run markers — open the run page to read it again'
              : fit && !fit.eligible
                ? `this marker will not fit into a lay section: ${fit.reason}`
                : '');
  // ЖДЁМ — НЕ ЗНАЧИТ СЛОМАНО. Оба состояния чтения (список ещё едет, раскладка в нём ещё не
  // появилась) проходят сами, и красный цвет объявил бы их поломкой; красное здесь только то, что
  // человеку придётся чинить руками.
  const refusalTransient = !writeRefusal && (laysLoading || (markerId > 0 && !marker));

  // ПРЕДПРОСМОТР ГЕОМЕТРИИ — ТОЛЬКО ТАМ, ГДЕ НАСТИЛ ДЕЙСТВИТЕЛЬНО ПРЕДЛАГАЕТСЯ.
  //
  // План над красным отказом — это план того, чего построить нельзя, и читается он как разрешение.
  // У уже собранного настила свои слои и свои концевые, посчитанные сервером
  // (`planned_length_cm`), — напечатать рядом с ним ЭТИ метры значило бы приписать существующей
  // строке чужой план.
  const geo =
    plies.ok && marker && !refusal && pairLays.length === 0
      ? layGeometry({
          sections: [{ markerId, plies: plies.plies }],
          endLossCm: endLoss.value ?? LAY_END_LOSS_DEFAULT_CM,
          markers: editor.runMarkers,
        })
      : null;
  const markerLenCm = decNum(marker?.usedLengthCm);
  const endLossCm = Number(endLoss.value ?? LAY_END_LOSS_DEFAULT_CM);
  // Настил, открытый на правку. Пропал из списка (удалили в соседнем окне) — форма не открывается:
  // редактировать нечего, а `existing: undefined` превратило бы правку в создание второго.
  const openLay = openKey && openKey !== 'new' ? lays.find((l) => l.layKey === openKey) : undefined;
  const editorOpen = openKey === 'new' || !!openLay;

  return (
    <div className='flex flex-col gap-0.5'>
      <GroupLabel>the run's cutting row built on this marker</GroupLabel>

      {/* СОСТАВ И СЛОИ — СЛОВАМИ И ЧИСЛАМИ. Число слоёв здесь единственное, что выведено, и
          показать его без арифметики значило бы попросить поверить на слово. */}
      <Text size='micro' variant='label'>
        {`the run orders ${job.sizes.map((r) => `${r.batchQty} ${r.sizeLabel}`).join(' + ')};` +
          (singleGarment
            ? ` the marker was captured on ONE garment ${job.sizeLabel}`
            : ` the marker was captured on composition ${job.sizeLabel} — the same ratio, squeezed by the GCD`)}
      </Text>
      {/* ВЫРОЖДЕННЫЙ СЛУЧАЙ НАЗЫВАЕТСЯ ЗДЕСЬ ЖЕ, А НЕ ТОЛЬКО В ИЗМЕРЕНИИ ВЫШЕ. Оговорка про
          «настила здесь нет» стоит над этим блоком красным, и предложить под ней обычную кнопку с
          обычными метрами значило бы принять за производство ровно то, что строкой выше объявлено
          негодным замером. Отказывать при этом не за что: сто слоёв одного размера — совершенно
          нормальный настил, неверна не идея, а ДЛИНА, которой он посчитан. */}
      {singleGarment ? (
        <Text size='micro' className='text-error'>
          {`the run orders this colourway in a single size, so what was measured is a SPARSE single-kit placement, not a lay: its length carries a margin, and the lay plan inherits that margin whole.${
            plies.ok
              ? ` ${plies.plies} plies is the whole order in one stack: check the stack height (the server computes it on save) and, if needed, split the lay into sections.`
              : ''
          }`}
        </Text>
      ) : null}
      {plies.ok ? (
        <Text size='micro' variant='label'>
          {`plies = quantity in the run ÷ quantity in the composition: ${plies.steps.join(
            ' · ',
          )} — one and the same number on every size, because the composition came from dividing by a common divisor`}
        </Text>
      ) : null}

      {geo && plies.ok ? (
        <>
          <Row label='plies' value={String(geo.totalPlies)} />
          <Row
            label={`fabric · ${markerLenCm.toFixed(0)} cm × ${geo.totalPlies} plies`}
            value={meters(geo.clothCm)}
          />
          <Row
            label={`lay ends · 2 × ${endLossCm} cm × ${geo.totalPlies} plies`}
            value={meters(geo.endLossTotalCm)}
          />
          <Row emphasis label='lay plan' value={meters(geo.plannedCm)} />
          {/* ЧЕГО В ЭТОМ ПЛАНЕ НЕТ. Коэффициент раскроя артикула к настилу не применяется
              (решение Ф4): он покрывает усадку, обход пороков и сращивание, то есть ровно то,
              чего геометрия не видит, — и применённый здесь сделал бы калибровку круговой. */}
          <Text size='micro' variant='label'>
            the lay plan is the fabric plus the lay ends and NOTHING BEYOND: the article's cutting
            coefficient is not applied to a lay (shrinkage, working around faults and splicing are
            not part of it), and the stack height is computed by the server on save.
          </Text>
          <Text size='micro' variant='label'>
            {`the lay end loss is your number, not a measurement: ${endLoss.why}. nothing derives it from the geometry of the marker — it is a property of the table.`}
          </Text>
          <Text size='micro' variant='label'>
            the mode is FACE UP: the queue places every contour exactly as it is drawn and creates
            no mirrored placement — which means ONE ply gives exactly the composition. face to face
            would require an even ply count (and here there are {geo.totalPlies}) and is forbidden
            on directional fabric. if the drawing holds only one piece of a mirrored pair, the
            section check “mirrored piece expansion” will say so: it appears right here as soon as
            the lay is saved, and the mode is switched in the same form.
          </Text>
        </>
      ) : null}

      {/* У ПАРЫ УЖЕ ЕСТЬ НАСТИЛ — ВТОРОЙ ОТСЮДА НЕ ПРЕДЛАГАЕТСЯ НИКОГДА. Настил партии на пару
          (колорвей, слот) один: его состав и есть соотношение партии, поэтому каждый второй
          планировал бы ВСЮ ту же партию ещё раз. Различаются только слова: раскладка та же самая
          или пересчитанная. */}
      {pairLays.length > 0 ? (
        <div className='flex flex-col items-start gap-0.5'>
          <Text size='micro' variant='label'>
            {already
              ? `lay “${layName(already)}” is already built on THIS marker — there must not be a second one on it.`
              : `this fabric and colourway already have a lay in the run — and it plans that very same run. if the marker was RECOMPUTED, it now has a different id: replace it in the SECTION of the existing lay instead of creating a second one — otherwise both will plan the whole order, and the fabric requirement will double.`}
            {/* ИМЯ СВЕЖЕЙ РАСКЛАДКИ — иначе «замените в секции» отправляет искать её в пикере
                среди одноимённых: пересъёмка, которая не смогла заменить прежнюю, получает то же
                имя с суффиксом «#2», и различить их по одному названию невозможно. */}
            {!already && marker?.name ? ` the fresh marker is called “${marker.name}”.` : ''}
            {plies.ok ? ` the run needs ${plies.plies} plies.` : ''}
          </Text>
          {/* Слои не вывелись — причина обязана доехать и сюда: без неё совет «сверьте число
              слоёв» повисает без числа, и непонятно, потерялось оно или его не бывает. */}
          {!plies.ok ? (
            <Text size='micro' className='text-error'>
              {plies.reason}
            </Text>
          ) : null}
          {writeRefusal ? (
            <Text size='micro' className='text-error'>
              {writeRefusal}
            </Text>
          ) : null}
          {/* ВЕРДИКТЫ СЕРВЕРА — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ИХ ВИДНО НА ЭТОМ ПУТИ. Список проверок в
              форме рисуется только у СУЩЕСТВУЮЩЕГО настила, а созданный закрывает её тостом — то
              есть «развёртка зеркальных деталей», «ширина рулона» и высота стопки после создания
              не показывались бы нигде. Здесь они читаются с настила, который сервер уже вернул. */}
          {pairLays.map((l) => {
            const checks = allLayChecks(l).filter((c) => layVerdict(c.status) !== 'ok');
            return (
              <div key={l.layKey || l.id} className='flex flex-col items-start gap-0.5'>
                <Text size='micro' variant='label'>
                  {`“${layName(l)}” — ${l.totalPlies ?? 0} plies, plan ${meters(decNum(l.plannedLengthCm))}`}
                </Text>
                {checks.map((c, i) => {
                  const v = layVerdict(c.status);
                  return (
                    <Text key={`${c.key || 'check'}-${i}`} size='micro' className={VERDICT_TEXT[v]}>
                      {VERDICT_GLYPH[v]} {v === 'unknown' ? 'not checked: ' : ''}
                      {c.label || c.key}
                      {c.detail ? ` — ${c.detail}` : ''}
                    </Text>
                  );
                })}
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  disabled={!!writeRefusal}
                  onClick={() => setOpenKey(l.layKey ?? '')}
                >
                  {`open “${layName(l)}”`}
                </Button>
              </div>
            );
          })}
        </div>
      ) : refusal ? (
        <Text
          size='micro'
          variant={refusalTransient ? 'label' : undefined}
          className={refusalTransient ? undefined : 'text-error'}
        >
          {refusal}
        </Text>
      ) : (
        <div className='flex flex-col items-start gap-0.5'>
          <Button type='button' size='xs' variant='secondary' onClick={() => setOpenKey('new')}>
            build a lay from this marker
          </Button>
          <Text size='micro' variant='label'>
            the same lay form as on the run page will open, with the fields filled in — we propose,
            we do not create: the write happens on your button in the form. the server checks
            (mirrored piece expansion, roll width, stack height) will appear right here as soon as
            the lay is saved.
          </Text>
        </div>
      )}

      {editorOpen ? (
        <LayEditor
          {...editor}
          // `key` по цели правки: форма ремонтируется при смене настила, и засев делают ленивые
          // инициализаторы useState — ровно как на странице партии.
          key={openLay?.layKey || `new:${job.colorwayId}:${job.bomLineKey}:${markerId}`}
          open
          onOpenChange={(o) => {
            if (!o) setOpenKey('');
          }}
          existing={openLay}
          seedColorwayId={job.colorwayId}
          seedBomLineKey={job.bomLineKey}
          seedSections={plies.ok && !openLay ? [{ markerId, plies: plies.plies }] : undefined}
          seedMode={BATCH_LAY_MODE}
          seedEndLossCm={endLoss.value}
        />
      ) : null}
    </div>
  );
}
