import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { LockBar } from './generate-row';
import {
  chosenRenderPlacements,
  feedIsTruncated,
  pictureThumb,
  stripProvenance,
  threedCandidates,
  threedSides,
  type Gate,
} from './model';
import { CELL_WIDTH, Strip, StripCell, StripDivider } from './strip-cell';

/**
 * INPUT — RENDERS BY VIEW. Что поворотный стол на самом деле крутит.
 *
 * ═══ ЭТО ТОТ ЖЕ ОРГАН, ЧТО «INPUT — FLATS OF THIS CARD», И ЭТО НЕ ЭКОНОМИЯ ════════════════════
 *
 * Слева от линии — четыре стороны, которые ЧИТАЕТ прогон: слоты рендер-верстака, по одному на вид.
 * Справа — все остальные рендеры этой карточки, каждый с «mark ▸», который ставит его в сторону.
 * Ровно так устроен вход фабрик-рендера, только там верстак флэтовый; двумя разными полосами эти
 * два экрана разошлись бы по пикселю и по слову, а читаются они одним взглядом.
 *
 * ═══ ПОЧЕМУ ЭТО ЗАМЕНИЛО «ПОСЛЕДНИЙ РЕНДЕР КАЖДОЙ СТОРОНЫ» (V-14) ═════════════════════════════
 *
 * Владелец: «в 3д INPUT — RENDERS BY VIEW нельзя никаким образом просунуть правильные референсы я
 * замаркал артефакты из фабрик рендера но они не отображаются в инпуте». Две беды в одной строке,
 * и обе — про то, что экран считал вход САМ, вместо того чтобы показывать вход, который читает
 * сервер (`designSelectBench` берёт слоты `kind: render`; см. `./model.ts`, `threedSides`).
 *
 *  · пометка «chosen», поставленная на артефакте фабрик-рендера, здесь не читалась вовсе — вот и
 *    «замаркал, а во входе их нет». Теперь помеченные стоят ПЕРВЫМИ справа от линии и несут ярлык
 *    `selected`: пометка владельца видна там, где он её искал;
 *  · вывод рендера приезжает ОДНИМ СКЛЕЕННЫМ ЛИСТОМ, у листа нет `ghost_view` — до разреза он не
 *    показывался нигде. Теперь он показан, с инертной дверью и причиной: сторона поворотного стола
 *    это один вид, лист надо сначала разрезать;
 *  · просунуть СВОЮ картинку было нельзя ничем. Дверь «+ render» стоит здесь по тому же праву, по
 *    которому «+ flat» стоит у рендера: принесённый руками файл всегда был законным входом.
 *
 * ═══ И ПОЧЕМУ ЭТОГО НЕ ХВАТИЛО: «ВСЁ РАВНО НЕ ПОПАДАЕТ» ══════════════════════════════════════
 *
 * Владелец, следующий круг: «заселекченный рендер в RENDERS OF THIS CARD все равно не попадает в
 * GENERATION — 3D».
 *
 * Круг выше починил ПОКАЗ: помеченные встали первыми и получили ярлык `selected`. Замер показал,
 * что на этом всё и кончалось — четыре кадра со своими `ghost_view`, все помечены, а полоса пишет
 * «0 of 4 marked», четыре стороны «blocks 3D», кнопки GENERATE нет вовсе, и на провод не уходит
 * ничего. Между пометкой и прогоном стоял второй жест, поштучный, в котором человек НАЗЫВАЛ СТОРОНУ
 * ЗАНОВО — ту самую, которую плита несёт сама и которую этот же экран под ней и печатает.
 *
 * Дверь «use the N you chose» — этот жест, сделанный один раз для всех. Она пишет ВЕРСТАК (снимок
 * входов собирает сервер, и никакой список параметров его не заменит), ставит каждый помеченный
 * рендер в сторону, которую он объявляет, и говорит до нажатия, какие это стороны и что будет
 * вытеснено. Почему это дверь, а не автоматика на самой пометке, и кто побеждает при споре за
 * сторону — в `chosenRenderPlacements` (`./model.ts`).
 *
 * ═══ ДВЕРЬ ПИШЕТ НЕСКОЛЬКО СЛОТОВ, ЗНАЧИТ ОНА МОЖЕТ ВСТАТЬ НА ПОЛОВИНЕ (Д-3) ══════════════════
 *
 * Транзакции здесь нет и быть не может: глагол верстака адресует РОВНО ОДИН слот, у каждой стороны
 * свой CAS-токен. Значит частичный исход — не сбой, а штатная возможность, и экран обязан его
 * ПРОГОВАРИВАТЬ, а не изображать успех. Дверь пробует ВСЕ стороны (отказ одной ничего не говорит о
 * соседней), ничего не откатывает и печатает под полосой, сколько сторон встало и какие не встали
 * с чем именно. Полный довод — у `adoptChosen`.
 */

/** Radix запрещает пустое значение пункта; «mark ▸» — сентинел, а не ''. */
const MARK_PROMPT = '__mark__';

export function ThreedInputStrip({
  band,
  techCardId,
  disabled,
  /**
   * ОТКАЗ, КАСАЮЩИЙСЯ ВХОДА, И ТОЛЬКО ОН. Полоса «что не хватает» живёт под входной полосой, потому
   * что причина — про ВХОД, а глаз в этот момент на входе. Причины МЕНЮ (не сказано, на каком теле;
   * не выбран размер) сюда не приходят: их называет своя полоса у кнопки, рядом с органами, которые
   * их снимают. Одна причина — одно место.
   */
  lock,
  /** Уйти на другое представление полосы — «ask for it ▸» пустой стороны и двери полосы отказа. */
  onGoToKind,
  colorwayId,
  colorwayLabel,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  lock?: Gate;
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * ═══ ЭТА ПОЛОСА И ЕСТЬ ВЕРСТАК ОДНОГО КОЛОРВЕЯ (L-2/L-3) ══════════════════════════════════
   *
   * Все три записи слота ниже адресуют `render`-верстак ЭТОГО колорвея, и правая половина
   * предлагает только плиты того же цвета: у слота колорвей входит в ключ исключительности, а
   * постановка чужой плиты отвергается сервером (`colorway_mismatch`). Предлагать её значило бы
   * рисовать дверь, за которой отказ. `0` — безколорвейный верстак, вечно законный.
   */
  colorwayId?: number;
  colorwayLabel?: string;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const colorway = colorwayId ?? 0;

  const sides = useMemo(() => threedSides(band, colorway), [band, colorway]);
  const others = useMemo(() => threedCandidates(band, colorway), [band, colorway]);
  const marked = sides.filter((side) => !!side.picture);
  /** Помеченные в «renders of this card» рендеры, которым есть куда встать. Довод — в `./model.ts`. */
  const placements = useMemo(() => chosenRenderPlacements(band, colorway), [band, colorway]);

  /** Для какой ячейки идёт запись. Общий `isPending` сказал бы «сохраняю» на всех сразу. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Своё состояние у двери «взять выбранные»: она пишет НЕСКОЛЬКО слотов, а не один. */
  const [adopting, setAdopting] = useState(false);
  /**
   * ИСХОД ПОСЛЕДНЕГО НАЖАТИЯ ДВЕРИ — сколько сторон встало и какие не встали, с причинами (Д-3).
   *
   * Держится СОСТОЯНИЕМ, а не всплывающим сообщением, и это не украшение. Тост живёт секунды и
   * приходит по одному на отказ; вопрос же, который остаётся у человека после частичной записи, —
   * «какие стороны у меня теперь новые» — он задаёт, глядя на полосу, и ответ обязан стоять рядом
   * с ней, пока он не нажмёт снова.
   */
  const [outcome, setOutcome] = useState<{
    done: string[];
    failed: { view: string; reason: string }[];
  } | null>(null);

  const frameOf = (picture: common_DesignPicture) =>
    picture.media ? mediaFullToViewerItem(picture.media) : undefined;

  const mark = (picture: common_DesignPicture, view: string) => {
    const side = sides.find((s) => s.view === view);
    const pictureId = picture.id ?? 0;
    if (!side || pictureId <= 0) return;
    setBusy(`p${pictureId}`);
    writes.setBenchSlot.mutate(
      // `kind: 'render'` — КАКОЙ ВЕРСТАК, а не какой слот. Рендер-фронт и флэт-фронт это два разных
      // слота, ОБА адресуемые `view_key: 'front'`; пустое поле означало бы flat, то есть плита
      // уехала бы в вход фабрик-рендера, а сервер отказал бы ей по роду кадра. Именно это поле
      // связывает то, что человек видит здесь, с тем, что прогон отправит в сборку.
      {
        slot: { viewKey: side.view, kind: 'render', colorwayId: colorway },
        pictureId,
        expectedSlotRev: side.slotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ДОВЕСТИ ПОМЕТКУ ДО ВЕРСТАКА — прямой ответ на «заселекченный рендер не попадает в GENERATION».
   *
   * ПИШЕТСЯ ИМЕННО ВЕРСТАК, а не список входов прогона: снимок входов собирает СЕРВЕР
   * (`DesignInputSnapshot` — «Assembled by the SERVER only»), и `params.threed.sourcePictureIds`
   * это ЗАПИСЬ о сборке, а не её приказ. Дверь, которая наполняла бы только список параметров,
   * зеленела бы на пробе и не меняла бы ни одного прогона.
   *
   * ПОСЛЕДОВАТЕЛЬНО И ПО ОДНОМУ СЛОТУ, потому что CAS у каждой стороны свой: `expectedSlotRev`
   * читается из полосы ДО первой записи, а стороны между собой не пересекаются, поэтому чужой
   * токен ни одна из этих записей не трогает. Одним запросом это не отправить — глагол верстака
   * адресует РОВНО ОДИН слот.
   *
   * ═══ ОТКАЗ ОДНОЙ СТОРОНЫ НЕ ОСТАНАВЛИВАЕТ ОСТАЛЬНЫЕ, И ИТОГ НАЗЫВАЕТСЯ ВСЛУХ (Д-3) ══════════
   *
   * Дверь бросала цикл на первом отказе и не откатывала уже сделанное. Замер: четыре помеченных
   * рендера, отказ на `back` — на провод ушли ДВЕ попытки (front, back), `side L` и `side R` не
   * исполнились вовсе, верстак остался с одним фронтом, а полоса написала «1 of 4 marked» и не
   * сказала НИ СЛОВА о том, что произошло. Человек видел частично заменённый вход и не мог узнать,
   * какие стороны новые.
   *
   * ПОЧЕМУ ПРОДОЛЖАЕМ, А НЕ БРОСАЕМ. Полноценной транзакции здесь быть не может — сервер даёт по
   * слоту, — значит выбор стоит между двумя НЕПОЛНЫМИ исходами, и он не симметричен:
   *   · стороны независимы: отказ на `back` (чужая вкладка сдвинула его `slot_rev`) не говорит
   *     ничего о `side L`, и не пытаться его поставить — потерять годную запись из-за соседа;
   *   · брошенный цикл оставляет БОЛЬШЕ гибрида, а не меньше: две стороны новые, две старые;
   *   · повтор после броска заново бьёт по уже поставленному фронту — теперь с протухшим токеном,
   *     то есть первый же отказ порождает второй.
   * Продолжив, мы доводим карточку до максимума исполнимого и сужаем отчёт ровно до тех сторон,
   * которым нужен человек.
   *
   * ОТКАТ НЕ ДЕЛАЕТСЯ, И ЭТО ТОЖЕ ВЫБОР. Снятие уже поставленной стороны — такая же запись, она
   * может так же отказать, а «вернуть как было» она не умеет вовсе: под ней мог стоять чужой
   * рендер, и мы затёрли бы его пустотой. Молчаливая уборка на отказе опаснее честного отчёта.
   *
   * ⚠ КАЖДЫЙ ОТКАЗ ВДОБАВОК ЗОВЁТ `onError` ШВА ПОЛОСЫ, то есть на четыре отказа придёт четыре
   * сообщения. Это шум, но не ложь; глушить их отсюда нельзя — шов общий, а тост это единственное,
   * что видит человек, ушедший глазами с этой полосы.
   */
  const adoptChosen = async () => {
    if (!placements.length || adopting) return;
    setAdopting(true);
    setOutcome(null);
    const done: string[] = [];
    const failed: { view: string; reason: string }[] = [];
    for (const placement of placements) {
      try {
        await writes.setBenchSlot.mutateAsync({
          slot: { viewKey: placement.view, kind: 'render', colorwayId: colorway },
          pictureId: placement.picture.id ?? 0,
          expectedSlotRev: placement.slotRev,
        });
        done.push(placement.view);
      } catch (error) {
        // ПРИЧИНА БЕРЁТСЯ С ОТКАЗА, А НЕ СОЧИНЯЕТСЯ. Слова сервера («slot_rev mismatch», бюджет,
        // род кадра) — единственное, из чего человек поймёт, повторять ему жест или звать другого.
        failed.push({
          view: placement.view,
          reason: (error as Error)?.message?.trim() || 'the server refused without saying why',
        });
      }
    }
    setAdopting(false);
    // Полный успех не рапортуется: он ВИДЕН — стороны заполнились, счётчик дошёл до 4 of 4, дверь
    // исчезла. Полоса «всё хорошо» под уже случившимся хорошим — шум, который учит не читать.
    setOutcome(failed.length ? { done, failed } : null);
  };

  const unmark = (view: string, slotRev: number) => {
    setBusy(`v${view}`);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` — ОСВОБОДИТЬ сторону, не удаляя ничего: плита остаётся на карточке.
      {
        slot: { viewKey: view, kind: 'render', colorwayId: colorway },
        pictureId: 0,
        expectedSlotRev: slotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  return (
    <Section
      title='input — renders by view'
      question={
        colorwayLabel?.trim()
          ? `— the render bench of ${colorwayLabel.trim()}: 3D is built from these and from nothing else. Front is required, more sides are better`
          : '— 3D is built from the renders, not the drawings: front is required, more sides are better'
      }
      action={
        <span className='flex items-center gap-3'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {marked.length} of 4 marked · {others.length} not marked
          </Text>
          {/* ДВЕРЬ СТОИТ В ШАПКЕ ПОЛОСЫ, ПОТОМУ ЧТО ГОВОРИТ ПРО ПОЛОСУ ЦЕЛИКОМ, а не про одну
              ячейку: она ставит СРАЗУ НЕСКОЛЬКО сторон. Пропадает она ровно тогда, когда ставить
              нечего — все помеченные уже на своих местах, — а не «когда ворота открыты»: человек,
              выбравший другие рендеры на собранной карточке, меняет ими вход тем же жестом. */}
          {!disabled && placements.length > 0 && (
            <Button variant='secondary' size='xs' loading={adopting} onClick={adoptChosen}>
              use the {placements.length} you chose ▸
            </Button>
          )}
        </span>
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
                empty={
                  <span className='flex flex-col gap-0.5'>
                    <span>{viewLabel(side.view)}</span>
                    <span className='text-labelColor'>no render marked</span>
                  </span>
                }
                /* ═══ ОБЯЗАТЕЛЕН ФРОНТ, ОСТАЛЬНЫЕ ТРИ — ПОЛЬЗА, А НЕ УСЛОВИЕ (K-10/K-11) ═══════
                   Красное «required · blocks 3D» стояло на КАЖДОЙ пустой стороне, пока 3D было
                   поворотным столом и собиралось полным кругом. Провайдер строит объём из видов
                   (`multi-view-to-3d`) и бесплатно отвергает ровно одно — отсутствие фронта.
                   Ячейка, кричащая «blocks 3D» там, где ничего не блокируется, учит не читать
                   красное: следующий раз человек так же пролистает и настоящий запрет. */
                lines={
                  side.view === 'front'
                    ? [
                        'required',
                        <span key='blocks' className='text-error'>
                          blocks 3D
                        </span>,
                      ]
                    : ['optional', 'one more angle = a better model']
                }
                action={
                  /* ДВЕРЬ ЗДЕСЬ — «СДЕЛАТЬ РЕНДЕР», А НЕ «ПОМЕТИТЬ». Пометка живёт справа от линии,
                     на самой картинке, и она там одна на все четыре стороны; вторая дверь в углу
                     пустой ячейки была бы вторым способом сделать то же самое. Пустая сторона
                     отвечает на другой вопрос: «а если рендера ещё нет вовсе». */
                  onGoToKind ? (
                    <button
                      type='button'
                      onClick={() => onGoToKind('render')}
                      className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                    >
                      <Text size='nano' variant='label' component='span'>
                        ask for it ▸
                      </Text>
                    </button>
                  ) : (
                    <InertDoor
                      label='ask for it ▸'
                      reason='switch to FABRIC RENDER on the strip above and render this side — 3D reads the renders, and this one does not exist yet'
                    />
                  )
                }
              />
            );
          }
          return (
            <StripCell
              key={`slot-${side.view}`}
              emphasis
              src={pictureThumb(picture)}
              alt={viewLabel(side.view)}
              badge={viewLabel(side.view)}
              gallery={frameOf(picture)}
              lines={[`in slot · ${viewLabel(side.view)}`, stripProvenance(band, picture)]}
              /* «unmark» СЛОВОМ В ПОДВАЛЕ, А НЕ УГЛОВЫМ ✕ ПРИМИТИВА, по тому же доводу, что у
                 флэтов: ✕ значит «убрать картинку», а здесь картинка никуда не девается — пустеет
                 СТОРОНА, а плита остаётся на карточке, справа от линии. */
              action={
                disabled ? undefined : (
                  <Button
                    variant='secondary'
                    size='xs'
                    loading={busy === `v${side.view}`}
                    onClick={() => unmark(side.view, side.slotRev)}
                  >
                    unmark
                  </Button>
                )
              }
            />
          );
        })}

        {/* Линия стоит всегда: она разделяет два ВОПРОСА, а не два непустых списка. */}
        <StripDivider />

        {/* ДВЕРЬ РУКИ, РАВНАЯ В ПРАВАХ МАШИНЕ — прямой ответ на «нельзя никаким образом просунуть».
            Файл приезжает НЕПОМЕЧЕННЫМ (`RegisterDesignUpload` без цели): человек ещё не сказал,
            какая это сторона, а догадка-призрак — не ответ. Род `render` — УТВЕРЖДЕНИЕ, а не
            догадка: дверь стоит под «input — renders by view», и именно род решает, в какой из двух
            верстаков эта картинка вообще может встать. */}
        {!disabled && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect='132/148'
              label='+ render'
              hint={null}
              purpose='design · render for the turntable'
              showVideos={false}
              editMode
              onSelect={(media) => {
                const items = media
                  .map((m) => m.id ?? 0)
                  .filter((id) => id > 0)
                  // КОЛОРВЕЙ — ТАКОЕ ЖЕ УТВЕРЖДЕНИЕ, КАК РОД, И ПО ТОЙ ЖЕ ПРИЧИНЕ: принесённый
                  // руками рендер — это рендер КАКОГО-ТО цвета, и восстановить какого из пикселей
                  // нельзя ничем. Дверь стоит внутри верстака выбранного колорвея, поэтому она и
                  // называет его. `0` — безколорвейный, ровно то, чем является всякий рендер,
                  // загруженный до появления оси.
                  .map((mediaId) => ({ mediaId, ghostView: '', kind: 'render', colorwayId: colorway }));
                if (!items.length) return;
                writes.registerUpload.mutate({
                  // Минтуется ОДИН раз на намерение человека и НЕ внутри мутации: повтор со свежим
                  // идентификатором заставил бы сервер честно завести вторую пачку.
                  clientRequestId: newClientRequestId(),
                  items,
                });
              }}
              allowMultiple
            />
            <Text size='nano' variant='label' component='span'>
              bring your own
            </Text>
            <Text size='nano' variant='label' component='span'>
              ⌘V · drop · browse
            </Text>
          </div>
        )}

        {others.map(({ picture, chosen, fromChosen, composite }) => {
          const provenance = stripProvenance(band, picture);
          return (
            <StripCell
              key={`pic-${picture.id}`}
              src={pictureThumb(picture)}
              alt={provenance}
              gallery={frameOf(picture)}
              /* Ярлык — ПОМЕТКА ВЛАДЕЛЬЦА, поставленная в FABRIC RENDER. Она и привела его сюда.
                 Кадру разреза ярлык НЕ ОДАЛЖИВАЕТСЯ: `selected` под плиткой обязан означать поле
                 `selected` этой самой плиты, иначе экран снова говорит одно, а провод несёт другое.
                 Унаследованный вердикт называется словами в строке под кадром. */
              badge={chosen ? 'selected' : undefined}
              lines={[
                chosen
                  ? 'chosen · not marked'
                  : fromChosen
                    ? 'cut of a chosen render · not marked'
                    : 'not marked',
                provenance,
              ]}
              action={
                disabled ? undefined : composite ? (
                  <InertDoor
                    label='split first ▸'
                    reason='this is one sheet with several views glued into it, and a side of a turntable is ONE view — split it in the run history (the split corner of its tile), then mark the frames here'
                  />
                ) : (
                  <SelectComponent
                    name={`mark-${picture.id}`}
                    value={MARK_PROMPT}
                    placeholder='mark ▸'
                    disabled={busy === `p${picture.id}`}
                    items={[
                      { value: MARK_PROMPT, label: 'mark ▸' },
                      ...SILHOUETTE_VIEWS.map((view) => ({
                        value: view,
                        label: viewLabel(view),
                      })),
                    ]}
                    onValueChange={(value: string) => {
                      if (!value || value === MARK_PROMPT) return;
                      mark(picture, value);
                    }}
                    fullWidth
                  />
                )
              }
            />
          );
        })}

        {!marked.length && !others.length && (
          <Text size='micro' variant='inactive' component='span' className='py-6'>
            no renders on this card yet — colour the flats on FABRIC RENDER, or bring a render in.
          </Text>
        )}
      </Strip>

      {/* ═══ ИТОГ ПОСЛЕДНЕГО НАЖАТИЯ ДВЕРИ (Д-3) ═══════════════════════════════════════════════
          Стоит ПОД ПОЛОСОЙ, а не у кнопки: вопрос, на который он отвечает, человек задаёт, глядя
          на четыре стороны, — «какие из них теперь новые». Пропадает он при следующем нажатии, а
          не по таймеру: пока стороны не поставлены, отчёт остаётся единственным их списком. */}
      {outcome && (
        <CalloutBox tone='error'>
          <Text size='micro' component='p' className='normal-case'>
            <b>
              {outcome.done.length} of {outcome.done.length + outcome.failed.length} sides took the
              render you chose.
            </b>{' '}
            {outcome.done.length > 0 && <>Now new: {outcome.done.map(viewLabel).join(', ')}. </>}
            {outcome.failed.length === 1
              ? 'This one did not, and still holds whatever stood there before: '
              : 'These did not, and still hold whatever stood there before: '}
            {outcome.failed.map((f) => `${viewLabel(f.view)} — ${f.reason}`).join('; ')}. Nothing was
            undone: the sides are separate slots, and taking a good one back would be another write
            that can fail in its turn. Press the door again — it now offers only what is left.
          </Text>
        </CalloutBox>
      )}

      {lock && !lock.ok && (
        <LockBar reason={lock.reason}>
          {onGoToKind ? (
            <>
              <button
                type='button'
                onClick={() => onGoToKind('flat')}
                className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='micro' variant='label' component='span'>
                  generate a flat ▸
                </Text>
              </button>
              <button
                type='button'
                onClick={() => onGoToKind('render')}
                className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='micro' variant='label' component='span'>
                  generate a render ▸
                </Text>
              </button>
            </>
          ) : (
            <InertDoor
              label='generate a render ▸'
              reason='the way out is the strip of representations above — FLAT draws the missing side, FABRIC RENDER colours it, and 3D turns what comes out'
            />
          )}
        </LockBar>
      )}

      <Text size='micro' variant='label' component='p' className='normal-case'>
        Left of the line — the sides the model is actually built from, one render each. Only{' '}
        <b>front</b> is required: a run without it is rejected before anything is charged, and every
        further side you mark gives the model another angle to build from. Right of the line — every
        other render of this card; the ones you chose in FABRIC RENDER come first. Marking one
        displaces the render that held the side; nothing is deleted.
      </Text>

      {/* ЧТО ИМЕННО СДЕЛАЕТ ДВЕРЬ — СКАЗАНО ДО НАЖАТИЯ, а не после. Она ставит несколько сторон
          разом и может вытеснить то, что там стоит; кнопка, у которой это не написано рядом,
          заставляет узнавать её правило нажатием. */}
      {!disabled && placements.length > 0 && (
        <Text size='nano' variant='label' component='p' className='normal-case'>
          «use the {placements.length} you chose» takes the renders you marked <b>selected</b> in
          FABRIC RENDER — and the frames cut out of a chosen sheet, which is the same picture — and
          puts each into the side it declares: {placements.map((p) => viewLabel(p.view)).join(', ')}
          {placements.some((p) => p.displaces)
            ? '. It displaces what stands there now; nothing is deleted.'
            : '.'}{' '}
          A chosen render that names no side, and the glued sheet itself, are not among them: the
          first is marked by hand, the second is split first.
          {/* ═══ СПОР ЗА СТОРОНУ НАЗЫВАЕТСЯ ЗДЕСЬ (Д-4) ══════════════════════════════════════
              Помечать несколько кандидатов на одну сторону ЗАКОННО — «More than one may be
              chosen», человек сравнивает. Сторона исключительна, поэтому лишние вердикты не
              исполняются; раньше они просто исчезали из счёта, и абзац перечислял одних
              победителей, называя лишь два исключения. Теперь третье исключение названо вместе с
              ними — с именем стороны, числом претендентов и тем, кто её забрал. */}
          {placements.some((p) => p.alsoChosen.length > 0) && (
            <>
              {' '}
              More than one chosen render names the same side, and a side holds one:{' '}
              {placements
                .filter((p) => p.alsoChosen.length > 0)
                .map(
                  (p) =>
                    `${viewLabel(p.view)} is claimed by ${p.alsoChosen.length + 1} of them and goes to the newest — run ${p.picture.runId || '—'}`,
                )
                .join('; ')}
              . The others stay where they are, still marked <b>selected</b> — un-select them in
              FABRIC RENDER if the newest is not the one you meant.
            </>
          )}
        </Text>
      )}

      {/* СТРАНИЦА ПРИЗНАЁТСЯ, А НЕ ПРЯЧЕТСЯ. Полоса отдаёт одну страницу ленты, поэтому у карточки
          с длинной историей есть рендеры, которых эта половина не видит. Оператор, которому этого
          не сказали, заключит, что его файл потерян. */}
      {feedIsTruncated(band) && (
        <Text size='nano' variant='label' component='p' className='normal-case'>
          This card has more history than one page. The right of the line lists the renders of the
          newest page; older ones are still on the card and still in their sides.
        </Text>
      )}
    </Section>
  );
}
