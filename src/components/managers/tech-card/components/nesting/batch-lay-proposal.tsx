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
import type {
  common_ProductionLayMode,
  common_ProductionRunLay,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import {
  LAY_END_LOSS_DEFAULT_CM,
  LayEditor,
  type LayEditorContext,
} from 'components/managers/production-runs/components/lay-editor';
import { layGeometry } from 'components/managers/production-runs/components/lay-geometry';
import { markerFitness } from 'components/managers/production-runs/components/marker-picker';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { BatchCell, JobSizeRow, MarkerJob } from './batch-marker-plan';
import { decNum } from './marker-io';

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
 * НА СЕКЦИИ настила, и её вердикт видно в той же форме, что откроется по кнопке: чертёж с одной
 * половиной пары кроят как раз лицом к лицу, и режим там переключается одним чипом.
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
  if (sizes.length === 0) return { ok: false, reason: 'у раскладки нет состава' };
  let plies = 0;
  const steps: string[] = [];
  for (const r of sizes) {
    if (!(r.units > 0)) {
      return {
        ok: false,
        reason: `в составе размер ${r.sizeLabel} стоит нулём — слои по нему не считаются`,
      };
    }
    if (!(r.batchQty > 0)) {
      return {
        ok: false,
        reason: `партия не заказывает размер ${r.sizeLabel}, а он лежит в составе раскладки — сколько слоёв стелить, из этого не следует`,
      };
    }
    if (r.batchQty % r.units !== 0) {
      return {
        ok: false,
        reason: `${r.batchQty} шт размера ${r.sizeLabel} не делятся нацело на ${r.units} в составе раскладки: число слоёв вышло бы дробным, а округление либо не докроит партию, либо накроит лишнего. Состав партии изменился после того, как эта раскладка была снята — переснимите её`,
      };
    }
    const p = r.batchQty / r.units;
    if (plies === 0) plies = p;
    else if (p !== plies) {
      return {
        ok: false,
        reason: `размеры дают РАЗНОЕ число слоёв (${steps.join(', ')}, а ${r.sizeLabel}: ${r.batchQty} ÷ ${r.units} = ${p}) — значит состав раскладки уже не является соотношением этой партии. Переснимите настил`,
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
      why: `в партии ещё нет настилов, у которых можно спросить — форма подставит своё умолчание ${LAY_END_LOSS_DEFAULT_CM} см на конец слоя`,
    };
  }
  if (values.length > 1) {
    return {
      why: `на настилах этой партии стоят разные значения (${values.join(', ')} см) — подставить одно из них наугад нельзя, форма возьмёт своё умолчание ${LAY_END_LOSS_DEFAULT_CM} см`,
    };
  }
  return {
    value: values[0],
    why: `${values[0]} см взято с настилов этой партии — тот же цех и тот же стол`,
  };
}

const meters = (cm: number) => `${(cm / 100).toFixed(2)} м`;

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
  editor,
  fallback,
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
  editor: LayEditorContext;
  /** Путь «сделать это руками» — он остаётся всегда, в том числе за каждым отказом. */
  fallback: React.ReactNode;
}) {
  // Форма монтируется ТОЛЬКО открытой (как и на странице партии), поэтому засев состояния делают
  // ленивые инициализаторы useState, а не эффект: закрытие размонтирует редактор, следующее
  // открытие пересеет его свежими числами.
  const [open, setOpen] = useState(false);

  const marker = editor.runMarkers.find((m) => (m.id ?? 0) === markerId);
  const fit = marker ? markerFitness(marker, job.bomLineKey, job.colorwayId) : null;
  const plies = derivePlies(job.sizes);
  const uncovered = uncoveredBatchSizes(job, cells, sizeLabel);
  const pairLays = lays.filter(
    (l) => (l.colorwayId ?? 0) === job.colorwayId && (l.bomLineKey ?? '') === job.bomLineKey,
  );
  const already = pairLays.find((l) =>
    (l.sections ?? []).some((s) => (s.markerId ?? 0) === markerId && markerId > 0),
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
    ? 'партия принята или закрыта — настил это план, а не история, и правится только на открытой партии'
    : !canEdit
      ? 'нет прав на изменение производства — настил не сохранить'
      : '';
  const refusal = laysLoading
    ? 'читаем настилы партии — пока список не прочитан, предложить настил нельзя: он мог бы оказаться дублем уже существующего'
    : markerId <= 0
      ? 'раскладка этой ткани сохранялась не в этой сессии — её номер здесь неизвестен, а угадывать его по имени нельзя: одноимённых раскладок у партии бывает несколько'
      : !marker
        ? 'сохранённая раскладка ещё не приехала в списке раскладок партии — обновите страницу партии или подождите перечитывания'
        : fit && !fit.eligible
          ? `эта раскладка в секцию настила не встанет: ${fit.reason}`
          : !plies.ok
            ? plies.reason
            : uncovered.length > 0
              ? `настил НЕ ПОКРОЕТ размеры ${uncovered.join(', ')} этой партии: их нет в составе раскладки. Строка настила по нему сказала бы, что колорвей раскроен, — а он раскроен частично`
              : writeRefusal;
  // ЖДЁМ — НЕ ЗНАЧИТ СЛОМАНО. Оба состояния чтения (список ещё едет, раскладка в нём ещё не
  // появилась) проходят сами, и красный цвет объявил бы их поломкой; красное здесь только то, что
  // человеку придётся чинить руками.
  const refusalTransient = laysLoading || (markerId > 0 && !marker);

  // ПРЕДПРОСМОТР ГЕОМЕТРИИ СЧИТАЕТСЯ ТОЛЬКО ДЛЯ ПРЕДЛАГАЕМОГО НАСТИЛА. У уже собранного свои
  // слои и свои концевые — их посчитал и опубликовал сервер (`planned_length_cm`), — и напечатать
  // рядом с ним ЭТИ метры значило бы приписать существующей строке чужой план.
  const geo =
    plies.ok && marker && !already
      ? layGeometry({
          sections: [{ markerId, plies: plies.plies }],
          endLossCm: endLoss.value ?? LAY_END_LOSS_DEFAULT_CM,
          markers: editor.runMarkers,
        })
      : null;
  const markerLenCm = decNum(marker?.usedLengthCm);
  const endLossCm = Number(endLoss.value ?? LAY_END_LOSS_DEFAULT_CM);

  return (
    <div className='flex flex-col gap-0.5'>
      <GroupLabel>строка раскроя партии по этой раскладке</GroupLabel>

      {/* СОСТАВ И СЛОИ — СЛОВАМИ И ЧИСЛАМИ. Число слоёв здесь единственное, что выведено, и
          показать его без арифметики значило бы попросить поверить на слово. */}
      <Text size='micro' variant='label'>
        {`партия заказывает ${job.sizes
          .map((r) => `${r.batchQty} ${r.sizeLabel}`)
          .join(
            ' + ',
          )}; раскладка снята на состав ${job.sizeLabel} — то же соотношение, ужатое на НОД`}
      </Text>
      {plies.ok ? (
        <Text size='micro' variant='label'>
          {`слоёв = количество в партии ÷ количество в составе: ${plies.steps.join(
            ' · ',
          )} — одно число на каждом размере, потому что состав получен делением на общий делитель`}
        </Text>
      ) : null}

      {geo && plies.ok ? (
        <>
          <Row label='слоёв' value={String(geo.totalPlies)} />
          <Row
            label={`ткань · ${markerLenCm.toFixed(0)} см × ${geo.totalPlies} сл`}
            value={meters(geo.clothCm)}
          />
          <Row
            label={`концевые · 2 × ${endLossCm} см × ${geo.totalPlies} сл`}
            value={meters(geo.endLossTotalCm)}
          />
          <Row emphasis label='план настила' value={meters(geo.plannedCm)} />
          {/* ЧЕГО В ЭТОМ ПЛАНЕ НЕТ. Коэффициент раскроя артикула к настилу не применяется
              (решение Ф4): он покрывает усадку, обход пороков и сращивание, то есть ровно то,
              чего геометрия не видит, — и применённый здесь сделал бы калибровку круговой. */}
          <Text size='micro' variant='label'>
            план настила — это ткань плюс концевые и НИЧЕГО СВЕРХ: коэффициент раскроя артикула к
            настилу не применяется (усадка, обход пороков и сращивание в него не входят), а высоту
            стопки считает сервер при сохранении.
          </Text>
          <Text size='micro' variant='label'>
            {`концевые потери — ваше число, а не измерение: ${endLoss.why}. Из геометрии раскладки они не выводятся ничем — это свойство стола.`}
          </Text>
          <Text size='micro' variant='label'>
            режим — ЛИЦОМ ВВЕРХ: очередь кладёт каждый контур так, как он нарисован, и ни одного
            зеркального размещения не заводит — значит ОДИН слой даёт ровно состав. Лицом к лицу
            потребовало бы чётного числа слоёв (а их тут {geo.totalPlies}) и запрещено на
            направленной ткани. Если в чертеже нарисована только одна деталь зеркальной пары, это
            скажет проверка секции «развёртка зеркальных деталей» — тогда режим меняют в той же
            форме.
          </Text>
        </>
      ) : null}

      {/* НАСТИЛ ПО ЭТОЙ ЖЕ РАСКЛАДКЕ УЖЕ ЕСТЬ — предлагать второй значит предлагать дубль: секции
          обоих ссылались бы на одну геометрию, а потребность в ткани сложилась бы дважды. */}
      {already ? (
        <div className='flex flex-col items-start gap-0.5'>
          <Text size='micro' variant='label'>
            {`настил «${already.name || already.bomItemName || already.layKey || 'без имени'}» уже собран по ЭТОЙ раскладке — второй по ней был бы дублем: потребность в ткани сложилась бы дважды.${
              plies.ok
                ? ` Сверьте, что в нём стоит ${plies.plies} сл.: столько нужно партии по расчёту выше`
                : ''
            }`}
          </Text>
          {writeRefusal ? (
            <Text size='micro' className='text-error'>
              {writeRefusal}
            </Text>
          ) : null}
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={!!writeRefusal}
            onClick={() => setOpen(true)}
          >
            открыть этот настил
          </Button>
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
          {/* ЧУЖОЙ НАСТИЛ НА ТОЙ ЖЕ ПАРЕ НАЗЫВАЕТСЯ ВСЛУХ — он законен (разные ткани, разные
              размерные блоки), но новый встанет РЯДОМ, а не вместо, и потребность сложится. */}
          {pairLays.length > 0 ? (
            <Text size='micro' variant='label'>
              {`на эту ткань и колорвей в партии уже есть ${pairLays
                .map((l) => `«${l.name || l.bomItemName || l.layKey}»`)
                .join(
                  ', ',
                )} — с другими раскладками. Новый настил встанет рядом, и потребность в ткани сложится`}
            </Text>
          ) : null}
          <Button type='button' size='xs' variant='secondary' onClick={() => setOpen(true)}>
            собрать настил из этой раскладки
          </Button>
          <Text size='micro' variant='label'>
            откроется та же форма настила, что на странице партии, с заполненными полями —
            предлагаем, а не создаём: запись происходит по вашей кнопке в форме.
          </Text>
        </div>
      )}

      {fallback}

      {open ? (
        <LayEditor
          {...editor}
          // `key` по цели правки: форма ремонтируется при смене настила, и засев делают ленивые
          // инициализаторы useState — ровно как на странице партии.
          key={already?.layKey || `new:${job.colorwayId}:${job.bomLineKey}:${markerId}`}
          open
          onOpenChange={setOpen}
          existing={already}
          seedColorwayId={job.colorwayId}
          seedBomLineKey={job.bomLineKey}
          seedSections={plies.ok && !already ? [{ markerId, plies: plies.plies }] : undefined}
          seedMode={BATCH_LAY_MODE}
          seedEndLossCm={endLoss.value}
        />
      ) : null}
    </div>
  );
}
