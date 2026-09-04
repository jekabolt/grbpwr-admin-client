import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { useSplitToInput } from '../split-to-input';
import { viewLabel } from '../views';
import { ApplySplitDoor, splitDecks } from './apply-split';
import { LockBar } from './generate-row';
import { pictureThumb, slotOrigin, slotOriginLine, stripProvenance, threedSides, type Gate } from './model';
import { Strip, StripCell } from './strip-cell';

/**
 * INPUT — RENDERS BY VIEW. Ровно то, из чего сервер соберёт эту сборку, и ничего кроме.
 *
 * ═══ ЭТО ЗЕРКАЛО ВЕРСТАКА, А НЕ ВТОРОЙ ЕГО ПИСАТЕЛЬ (J-26) ════════════════════════════════════
 *
 * Владелец, дословно: «в 3D вкладке мы будем видеть только INPUT — RENDERS BY VIEW и там будут
 * как раз наши слоты из FABRIC RENDER SLOTS».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ ДО ЭТОГО КРУГА — 566 строк, и половина из них были ПИСАТЕЛЯМИ ТЕХ ЖЕ СЛОТОВ:
 * `mark ▸` в каждой стороне, дверь загрузки «+ render», дверь «use the N you chose», правая
 * половина полосы со всеми рендерами карточки и три объясняющих абзаца. Они появились кругом
 * V-14/Д-3/Д-4 как ответ на «нельзя просунуть референсы»: тогда 3D было ЕДИНСТВЕННЫМ местом, где
 * рендер-слот вообще можно было написать.
 *
 * J-25 перенёс заполнение слотов туда, где лежит материал, — на FABRIC RENDER. Значит здесь
 * остался бы ВТОРОЙ ПИСАТЕЛЬ ОДНОГО СЛОТА на второй вкладке: два экрана, две прочитанные полосы,
 * два CAS-токена одной строки и два разных скоупа (тот, что выбран здесь, и тот, что выбран там).
 * Отказ, который эта правка делает НЕВЫРАЗИМЫМ, именно этот: слот пишется в одном месте, а 3D
 * показывает ровно `threedSides(band, scope)` — ту же функцию, по которой `turntableSourceIds`
 * собирает `source_picture_ids`, и тот же предикат, что у сервера (`designSelectBench`). Вход и
 * прогон согласны ПО ПОСТРОЕНИЮ, а не по дисциплине двух экранов.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ:
 *   · правой половины полосы и линии-разделителя — линия разделяла ДВА ВОПРОСА, второго вопроса
 *     на этом экране больше нет;
 *   · `unmark` у занятой стороны — снятие это правка входа, а вход правится там же, где
 *     заполняется; ✕ на плите в FABRIC RENDER SLOTS показывает при этом, ЧТО именно встанет
 *     взамен, чего этот экран показать не может;
 *   · трёх абзацев (J-28, владелец: «этого текста быть не должно») — правила, которые они
 *     пересказывали, исполняются там, где их исполняют: «front обязателен» — отказом двери
 *     запуска, «пометка вытесняет» — подписью двери на FABRIC RENDER;
 *   · признания «полоса отдаёт одну страницу ленты» — оно относилось к правой половине; у левой
 *     предела нет, плита слота приезжает разрешённой, сколь бы старой ни была.
 *
 * ═══ КРУГ 17 (F-10 / F-11 / F-12 / F-14): ОДНА ПОЛОСА РОВНЫХ КНОПОК, БЕЗ ЛИШНИХ СЛОВ ═══════════
 *
 * Владелец: «в INPUT — RENDERS BY VIEW … полнейший пиздец этот текст», «для даже незаспличеного
 * мультивью показываем кнопку аплай сплитед … убери все лишнее», «убери текст "WHAT IS MISSING /
 * no fabric render stands on this card yet — …"», «сделай полировку … что бы все было ровно все
 * кнопки ровные нет лишнего текста ничего не перекосоебано».
 *
 * ЧТО БЫЛО ЗАМЕРЕНО НА СТЕНДЕ (`tmp/dsgprobe/qa-w2.mjs`, прогон ДО правок):
 *   · дверь «apply splitted ▸» рисовалась на НЕРАЗРЕЗАННОМ листе ровно в одной позе — у карточки
 *     только для чтения: ветка `!canWrite` ставила `InertDoor` с этой подписью, не глядя, есть ли
 *     что применять. У пишущей карточки на месте двери стояло слово «cut it first — split ▸ on the
 *     frame», посылавшее к углу, который виден только под курсором (тот же дефект, за который
 *     `outputs.tsx` уже платил, — см. П-4 в `qa-frs.mjs`);
 *   · подпись «apply splitted ▸» мерялась в 136px при ячейке 132px и ПЕРЕНОСИЛАСЬ на вторую
 *     строку; дверь «fill it on FABRIC RENDER ▸» была подчёркнутым текстом в три строки (36px)
 *     против кнопок соседей — нижние края дверей расходились на 85–98px;
 *   · под дверью «apply» всегда стояла розовая строка последствий (F-10), под входом на пустом
 *     верстаке — полоса «what is missing» с простынёй (F-12), а в шапке — «front is required»,
 *     уже сказанное на самой ячейке FRONT.
 *
 * ЧТО СТОИТ ТЕПЕРЬ, И ЭТО ОДНО ПРАВИЛО НА ВСЮ ПОЛОСУ: под каждой ячейкой, у которой есть жест,
 * стоит РОВНО ОДНА кнопка `secondary/xs` во всю ширину ячейки, и больше ничего. Пустая сторона —
 * «FABRIC RENDER ▸» (туда, где сторону заполняют); лист без разреза — «split ▸» (та же дверь, что
 * на плитке в «renders of this card»); лист с разрезом — «apply splitted». На читаемой карточке те
 * же три двери стоят инертными С ПРИЧИНОЙ, каждая со СВОЕЙ подписью, — дверь, которой нечего
 * применять, не притворяется дверью «apply». Подписи выбраны ПО ЗАМЕРУ: кнопка `xs` рендерится
 * 12-пиксельным FeatureMono с трекингом, и в 132px влезает не больше ~15 знаков.
 *
 * ⚠ ПОЛОСА «WHAT IS MISSING» НЕ РИСУЕТСЯ ДЛЯ ОДНОГО ОТКАЗА — ПУСТОГО ВЕРСТАКА (`next: 'render'`).
 * Четыре пустые ячейки со словами «empty · required · blocks 3D» и дверью на FABRIC RENDER — это и
 * есть ответ «чего не хватает», третье повторение под ними владелец и назвал простынёй. Остальные
 * отказы (нет фронта, смешанные ревизии, на карточке нет рендеров вовсе) полосу сохраняют: они
 * говорят то, чего по ячейкам не прочесть. Причина пустого верстака при этом ЖИВА — короткой, в
 * подсказке погашенной GENERATE (`threedGate` → `InertDoor`), так что «почему кнопка не жмётся» не
 * онемело.
 */

/**
 * Инертная дверь — во всю ячейку, как и живая. `InertDoor` рисует `inline-flex` по содержимому;
 * ряд, где живая кнопка на 132px, а погашенная — на 90, читался бы как две разные вещи.
 */
const INERT_DOOR = 'flex w-full [&>button]:w-full';

const READ_ONLY_REASON =
  'this card is read-only for you — cutting a render or putting one into a side is an edit of the card';

export function ThreedInputStrip({
  band,
  lock,
  onGoToKind,
  colorwayId,
  colorwayLabel,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  /** Отказ ворот 3D целиком — рисуется полосой под плитками, вместе со своей дверью. */
  lock?: Gate;
  /**
   * Уйти на другое представление студии. Состояние `kind` живёт в ОДНОМ месте на всю студию
   * (`StudioTab`); без пропа дверь рисуется ИНЕРТНОЙ С ПРИЧИНОЙ, а не пропадает.
   */
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * ═══ ЧЕЙ ВЕРСТАК ПОКАЗАН — И ЭТО ЕДИНСТВЕННОЕ, ЧТО ЭТОТ ФАЙЛ ЗНАЕТ О КОЛОРВЕЕ (L-2/L-3) ═════
   *
   * Число обязано быть ТЕМ ЖЕ, под которым FABRIC RENDER пишет слоты и под которым прогон уезжает
   * на провод (`params.colorway_id`): иначе вход показывает один верстак, а сервер собирает
   * другой. Один источник на всю студию — `useColorwayChoice`; писателя у этого файла больше нет
   * вовсе, поэтому разойтись ему не с чем.
   */
  colorwayId?: number;
  colorwayLabel?: string;
  /**
   * ⚠ ВЕРНУЛИСЬ РАДИ ОДНОЙ ЗАПИСИ — `apply splitted` (E-6). Разбор того, чем эта запись отличается
   * от «второго писателя», которого запрещал J-26, — у места вызова в `threed-studio.tsx`.
   */
  techCardId?: number;
  disabled?: boolean;
}): JSX.Element {
  const colorway = colorwayId ?? 0;
  const sides = useMemo(() => threedSides(band, colorway), [band, colorway]);
  const filled = sides.filter((side) => !!side.picture).length;
  const named = colorwayLabel?.trim() ?? '';
  const split = useSplitToInput({ techCardId: techCardId ?? 0, band });
  /**
   * СКЛЕЕННЫЕ ЛИСТЫ РЕНДЕРОВ — ВТОРОЙ РОД ЯЧЕЙКИ ЭТОЙ ПОЛОСЫ (E-6).
   *
   * Владелец: «мультивью карточек тоже должно отображаться». До этой волны экран показывал ровно
   * четыре стороны верстака — и на самой частой карточке беты все четыре были пусты, потому что
   * рендер приходит ОДНИМ СКЛЕЕННЫМ ЛИСТОМ и в сторону не встаёт до разреза. То есть «0 of 4»
   * стояло на карточке с готовым, оплаченным рендером, и путь дальше был только через соседнюю
   * вкладку.
   */
  const decks = useMemo(() => splitDecks(band, 'render'), [band]);
  const canWrite = !!techCardId && !disabled;

  return (
    <Section
      id='design-threed-input'
      title='input — renders by view'
      question={
        named
          ? `— the fabric render slots of ${named}, one per side`
          : '— the fabric render slots, one per side'
      }
      action={
        /* СЧЁТ, И ТОЛЬКО СЧЁТ. «front is required» стояло здесь вторым написанием того, что
           говорит сама ячейка FRONT («required · blocks 3D»); один факт в двух местах учит
           читать одно из них (F-14). */
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {filled} of 4 filled
          {decks.length > 0 ? ` · ${decks.length} multi-view` : ''}
        </Text>
      }
    >
      <Strip>
        {sides.map((side) => {
          const picture = side.picture;
          if (!picture) {
            return (
              <StripCell
                key={`slot-${side.view}`}
                alt={viewLabel(side.view)}
                /* ⚠ ИМЯ СТОРОНЫ — `labelColor`, А НЕ ЦВЕТ ПЛЕЙСХОЛДЕРА. `placeholderClass` красит
                   своё содержимое `textInactiveColor` (#ccc, ~1.6:1), и это законно для рамок и
                   заглушек, но НЕ для текста, который читают: имя стороны — единственное, что
                   отвечает на вопрос «какая это сторона». Тот же довод и то же лечение, что у
                   `EmptyStripCell` соседней полосы. */
                empty={
                  <span className='flex flex-col gap-0.5 text-labelColor'>
                    <span>{viewLabel(side.view)}</span>
                    <span className='text-textColor'>
                      <b>empty</b>
                    </span>
                  </span>
                }
                /* ═══ ОБЯЗАТЕЛЕН ФРОНТ, ОСТАЛЬНЫЕ ТРИ — ПОЛЬЗА, А НЕ УСЛОВИЕ (K-10/K-11) ═══════
                   Красное «blocks 3D» стояло на КАЖДОЙ пустой стороне, пока 3D было поворотным
                   столом. `multi-view-to-3d` строит объём из видов и бесплатно отвергает ровно
                   одно — отсутствие фронта (`no_front_render` у двери, ДО резерва). Ячейка,
                   кричащая «blocks 3D» там, где ничего не блокируется, учит не читать красное.
                   «one more angle = a better model» под необязательной стороной снято (F-14): это
                   пояснение, а не факт о ячейке, и его читали четыре раза подряд. */
                lines={
                  side.view === 'front'
                    ? [
                        'required',
                        <span key='blocks' className='text-error'>
                          blocks 3D
                        </span>,
                      ]
                    : ['optional']
                }
                action={
                  /* ДВЕРЬ ВЕДЁТ ТУДА, ГДЕ СТОРОНУ ЗАПОЛНЯЮТ, И БОЛЬШЕ НЕ ПИШЕТ САМА. Прежняя
                     («ask for it ▸») звала генерировать рендер — верный жест ровно тогда, когда
                     рендера ещё нет вовсе; но самый частый случай другой: рендер есть, он лежит в
                     «renders of this card», и его надо ПОЛОЖИТЬ в сторону. Обе половины теперь на
                     одном экране, и дверь называет его.

                     КНОПКА, А НЕ ПОДЧЁРКНУТЫЙ ТЕКСТ (F-14): двери ячеек этой полосы и соседней
                     («unmark», «mark ▸», «apply splitted») — кнопки `secondary/xs`; подчёркнутая
                     строка в три переноса среди них была единственной иной формой и единственной
                     иной высотой. Подпись — имя вкладки: «fill it on FABRIC RENDER ▸» меряется в
                     213px и в ячейку не входит ни в одном переносе, «FABRIC RENDER ▸» — 128. */
                  onGoToKind ? (
                    <Button
                      variant='secondary'
                      size='xs'
                      className='w-full'
                      onClick={() => onGoToKind('render')}
                      title={`fill ${viewLabel(side.view)} on FABRIC RENDER — from the renders of this card or from a file`}
                    >
                      FABRIC RENDER ▸
                    </Button>
                  ) : (
                    <InertDoor
                      className={INERT_DOOR}
                      label='FABRIC RENDER ▸'
                      reason='switch to FABRIC RENDER on the strip above: its FABRIC RENDER SLOTS block is where a side is filled, from the renders of this card or from a file'
                    />
                  )
                }
              />
            );
          }
          const origin = slotOrigin(band, side);
          const line = slotOriginLine(origin);
          return (
            <StripCell
              key={`slot-${side.view}`}
              emphasis
              src={pictureThumb(picture)}
              alt={viewLabel(side.view)}
              badge={viewLabel(side.view)}
              cellPictureId={picture.id}
              gallery={picture.media ? mediaFullToViewerItem(picture.media) : undefined}
              /* ═══ ЧТО СТОИТ В СТОРОНЕ — СО ШТАМПА СЛОТА, А НЕ С ЛЕНТЫ (круг 15) ═══════════════
                 `run_rrev` и `run_kind` едут на самой строке верстака. До них ревизия выводилась
                 постраничным поиском прогона и на плите старше двенадцати строк ленты молчала — то
                 есть на всякой карточке с историей. Именно из-за этого молчания сторож «стороны
                 ОДНОЙ ревизии» не мог сработать НИ РАЗУ; довод целиком в `threedRevisions`.
                 Строка чужого рода (`from ON MODEL — a photograph…`) — не украшение: у перекраса
                 собственный род кадра ЧЕСТНО `render`, и без штампа фотография человека в стороне
                 неотличима от фабрик-рендера. */
              lines={[
                line ? (
                  <span key='origin' className={origin.foreign ? 'text-warning' : undefined}>
                    {`in slot · ${viewLabel(side.view)} · ${line}`}
                  </span>
                ) : (
                  `in slot · ${viewLabel(side.view)}`
                ),
                stripProvenance(band, picture),
              ]}
            />
          );
        })}

        {/* ═══ СКЛЕЕННЫЕ ЛИСТЫ — ПОСЛЕ ЧЕТЫРЁХ СТОРОН (E-6) ═════════════════════════════════════
            Порядок не косметический. Четыре стороны — это ТО, ЧТО УЕДЕТ; лист — это ПРЕДЛОЖЕНИЕ
            переписать их все разом. Предложение, стоящее перед фактом, читается как часть факта.

            ⚠ ЛИНИИ-РАЗДЕЛИТЕЛЯ МЕЖДУ НИМИ НЕТ НАМЕРЕННО. J-26 снял её вместе с правой половиной
            полосы, потому что она отделяла ДВА ВОПРОСА, а второго вопроса не осталось. Здесь
            второй вопрос не вернулся: лист — не «что ещё есть на карточке», а другой способ
            ответить на тот же вопрос «что стоит в сторонах». Ячейки различает ярлык `multi-view`
            и глагол на двери, а не штрих. */}
        {decks.map((deck) => {
          const id = deck.sheet.id ?? 0;
          const cut = deck.pieces.length > 0;
          return (
            <StripCell
              key={`deck-${id}`}
              cellPictureId={id}
              src={pictureThumb(deck.sheet)}
              alt={`multi-view render · ${deck.declared.map(viewLabel).join(', ')}`}
              badge='multi-view'
              gallery={deck.sheet.media ? mediaFullToViewerItem(deck.sheet.media) : undefined}
              /* ⚠ У РАЗРЕЗАННОГО ЛИСТА УГЛА `split` НЕТ (F-8, дословно: «на уже заспличеных
                 картинках на ховер сплит писать не нужно»). Здесь стоял обратный довод — «у листа
                 с разрезом он остаётся путём перерезать», — и он пережил своё основание: у такого
                 листа глагол уже другой, `apply splitted` под кадром, и два глагола на одном кадре
                 читаются как один сломанный. Резать второй раз по-прежнему законно и делается там,
                 где это единственный глагол кадра, — в ленте генераций. */
              onSplit={
                canWrite && !cut
                  ? {
                      onClick: () => split.openForPicture(deck.sheet, `sheet ${id}`),
                      ariaLabel: `split the multi-view render ${id} into views`,
                    }
                  : undefined
              }
              lines={[
                deck.declared.length
                  ? `${deck.declared.length} views · ${deck.declared.map(viewLabel).join(', ')}`
                  : 'a multi-view file',
                stripProvenance(band, deck.sheet),
              ]}
              /* ═══ ДВЕРЬ ПО СОСТОЯНИЮ ЛИСТА, А НЕ ПО ПРАВУ (F-11) ═══════════════════════════════
                 «apply splitted» существует ТОЛЬКО там, где есть что применять. Раньше ветка
                 «нет права» ставила эту подпись на любой лист, и владелец видел «apply» над
                 листом, который никто не резал. Теперь право решает лишь, жива дверь или
                 погашена; КАКАЯ это дверь — решает разрез. */
              action={
                !canWrite ? (
                  <InertDoor
                    className={INERT_DOOR}
                    label={cut ? 'apply splitted' : 'split ▸'}
                    reason={READ_ONLY_REASON}
                  />
                ) : cut ? (
                  <ApplySplitDoor
                    techCardId={techCardId ?? 0}
                    sides={sides}
                    pieces={deck.pieces}
                    benchKind='render'
                    /* ТОТ ЖЕ ВЕРСТАК, ЧТО ЧИТАЕТ ЭТА ПОЛОСА И ЧТО СОБИРАЕТ СЕРВЕР. Одно число на
                       обе половины — иначе вход показывал бы одно, а прогон уезжал бы с другим. */
                    colorwayId={colorway}
                    noun='render'
                  />
                ) : (
                  /* ЖИВАЯ ДВЕРЬ РАЗРЕЗА, А НЕ СЛОВО О НЕЙ. «cut it first — split ▸ on the frame»
                     называло угол, которого на экране без курсора нет (П-4 в `qa-frs.mjs` уже
                     платила за это на соседнем экране). Якорь тот же, что у плитки листа в
                     «renders of this card» — `data-split-for`. */
                  <Button
                    variant='secondary'
                    size='xs'
                    className='w-full'
                    data-split-for={id}
                    onClick={() => split.openForPicture(deck.sheet, `sheet ${id}`)}
                    title='cut this multi-view render into one picture per side; the pieces can then be applied to the input at once'
                  >
                    split ▸
                  </Button>
                )
              }
            />
          );
        })}
      </Strip>

      {split.modal}

      {/* ⚠ ПУСТОЙ ВЕРСТАК (`next: 'render'`) ПОЛОСУ НЕ РИСУЕТ — довод в шапке (F-12). Остальные
          отказы говорят то, чего по ячейкам не прочесть, и остаются со своими дверями. */}
      {lock && !lock.ok && lock.next !== 'render' && (
        <LockBar reason={lock.reason}>
          {/* ═══ ДВЕРЬ ОТВЕЧАЕТ ИМЕННО ЭТОМУ ОТКАЗУ (J-26) ══════════════════════════════════════
              Отказов у 3D два, и сервер их различает поимённо: `no_fabric_render` («на верстаке
              нет ничего») и `no_front_render` («есть, но не спереди»). Следующий жест у них
              разный — сделать рендер против положить готовый во фронт, — и пара дверей на оба
              случая заставляла бы гадать, какой из двух показали. Здесь стояли ДВЕ безусловные
              двери («generate a flat ▸» и «generate a render ▸») при любой причине. */}
          {onGoToKind ? (
            <>
              {/* ОДИН ОТКАЗ — ОДНА ДВЕРЬ, И ЭТО НЕ СИМВОЛИЧНО. «Сгенерировать рендер» под отказом
                  «стороны разных ревизий» продавало бы прогон за $-цену там, где нужный жест
                  бесплатен: переложить одну сторону. Пара дверей рисуется РОВНО в одном случае —
                  у карточки нет ни одного рендера вовсе, и тогда путь и правда может начинаться
                  с чертежа. */}
              {lock.next === 'front-slot' && (
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    put a render into FRONT ▸
                  </Text>
                </button>
              )}
              {lock.next === 'refill' && (
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    re-fill the odd sides on FABRIC RENDER ▸
                  </Text>
                </button>
              )}
              {lock.next === 'flat' && (
                <button
                  type='button'
                  onClick={() => onGoToKind('flat')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    generate a flat ▸
                  </Text>
                </button>
              )}
              {(lock.next === 'flat' || !lock.next) && (
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    generate a render ▸
                  </Text>
                </button>
              )}
            </>
          ) : (
            <InertDoor
              label='generate a render ▸'
              reason='the way out is the strip of representations above — FLAT draws the missing side, FABRIC RENDER colours it and puts it into a slot, and 3D turns what stands there'
            />
          )}
        </LockBar>
      )}
    </Section>
  );
}
