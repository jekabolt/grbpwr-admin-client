import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { useSplitToInput } from '../split-to-input';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { ApplySplitDoor, splitDecks } from './apply-split';
import {
  RENDER_MIN_VIEWS,
  benchSides,
  feedIsTruncated,
  pictureThumb,
  stripProvenance,
  unmarkedFlats,
} from './model';
import { CELL_WIDTH, EmptyStripCell, Strip, StripCell, StripDivider } from './strip-cell';

/**
 * INPUT — FLATS OF THIS CARD. What a fabric render is actually made from.
 *
 * THE LINE DOWN THE MIDDLE IS THE WHOLE ORGAN. Left of it: the drawings the render reads, one per
 * view, each with its provenance — which is the bench, seen from the render's side rather than the
 * sheet's. Right of it: every other flat this card holds, generated or brought by hand, each with a
 * `mark ▸` that puts it in a slot. The two halves are the same pictures under two different
 * questions, and the prototype's own footnote says the thing that makes the screen safe to use:
 * marking one DISPLACES the picture that held the slot, and nothing is deleted.
 *
 * THE TWO HALVES ARE GATHERED FROM DIFFERENT PLACES, and they have to be. A bench slot carries its
 * RESOLVED plate however old the picture is, so the left side is always complete. The right side
 * can only list what the band shipped — one page of the feed — so when there is more, the strip
 * says so rather than letting a technologist conclude that a drawing he uploaded last week has
 * disappeared.
 *
 * THE SECTION HOLDS DRAWINGS AND NOTHING ELSE (E-7). It held the card's CLOTHS for two waves —
 * `+ cloth` stood in this very strip, between the view slots and the line — and the owner has now
 * moved that whole setting into the render's own menu, under TEXTURE & COLOUR. The note further
 * down records what left and where it went; the point here is that the title is true again.
 *
 * A HAND FILE WAS ALWAYS LEGAL INPUT HERE. Nothing on this card requires a run: an uploaded flat
 * sits on the right of the line exactly like a generated one, marks into a slot exactly like one,
 * and feeds the render exactly like one. That is why the classification refuses a picture only on
 * positive evidence that it is an OUTPUT of the machine (see `isFlatCandidate`), and admits
 * everything else.
 *
 * ЭТОТ ЭКРАН БОЛЬШЕ НЕ ДЕРЖИТ СВОЕГО ПРОСМОТРЩИКА (T-8). Здесь стоял свой `MediaViewer` со своим
 * рядом, собранным из плит ЭТОЙ полосы, и своя угловая кнопка `zoom`, нарисованная руками. Значит
 * зум листал четыре флэта и упирался в край — до референсов, истории генераций и верстака из него
 * было не добраться, хотя владелец просил ровно обратного: «что бы можно было в зум вью по всем
 * картинкам из всех генераций итерироваться не только этой».
 *
 * Теперь ячейка объявляет только КАДР (`gallery`), а показывает его ОДИН `PictureGalleryProvider`
 * на всю студию (смонтирован в `studio-tab.tsx`). Ряд собирают сами плитки и сортируются по
 * порядку в документе, поэтому человек листает ровно то, что видит.
 */

/** Radix forbids an empty item value, and an empty one reaching `Select.Root` shows a placeholder
 *  where a label should be — so «mark ▸» is a sentinel, never `''`. */
const MARK_PROMPT = '__mark__';

/**
 * ═══ CLOTH УШЁЛ С ЭТОГО ЭКРАНА ЦЕЛИКОМ — E-7 ═════════════════════════════════════════════════
 *
 * Владелец, дословно: «в фабрик рендере в INPUT — FLATS OF THIS CARD убери CLOTH плейсхолдер
 * давай эту все настройку сделаем в GENERATION — FABRIC RENDER».
 *
 * ЗДЕСЬ СТОЯЛИ 350 СТРОК: хук `useClothRun` (плитки тканей второй пробежкой той же ленты, дверь
 * `+ cloth`, потолок активов с причиной словами, вопрос удаления, вторая дверь «make a pattern»)
 * и чеканка имени `cloth N`. ВСЁ ЭТО ПЕРЕЕХАЛО, А НЕ УДАЛЕНО, — в `./palette.tsx`, под заголовок
 * TEXTURE & COLOUR (E-8), вместе со своими доводами поимённо. Ни одного писателя полоса не
 * потеряла: ткань по-прежнему заводится и убирается ровно одной дверью на всю админку, просто
 * стоит она теперь там, где ткань ВЫБИРАЮТ.
 *
 * ЧТО ЭТИМ ВЫИГРАНО — НЕ МЕСТО, А ЗАГОЛОВОК. Секция называется «input — flats of this card», и
 * до этой правки в ней среди чертежей стояли лоскуты: род ячейки приходилось выводить по
 * подписи под кадром. Теперь заголовок описывает содержимое целиком, и линия посреди ленты
 * снова делит ровно два вопроса — «какой чертёж в какой стороне» и «какие ещё чертежи есть».
 *
 * ⚠ ДОВОД K-9 («CLOTH должен быть дальше в линии с фронт бэк сайд л р») ЭТИМ ОТМЕНЁН ВЛАДЕЛЬЦЕМ,
 * а не забыт. Он был верен, пока ткань выбирали ДВУМЯ экранами ниже: тогда ряд, разорванный
 * надвое, заставлял читать один ответ в два приёма. Теперь ткань и выбирают, и заводят в одном
 * месте, и ходить между двумя блоками больше незачем.
 */

export function RenderInputStrip({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const split = useSplitToInput({ techCardId, band });

  const sides = useMemo(() => benchSides(band), [band]);
  const others = useMemo(() => unmarkedFlats(band), [band]);
  const marked = sides.filter((side) => !!side.picture);
  /**
   * СКЛЕЕННЫЕ ЛИСТЫ ФЛЭТОВ — ВТОРОЙ РОД ЯЧЕЙКИ СПРАВА ОТ ЛИНИИ (E-6).
   *
   * Их НЕТ в `others` намеренно и правильно: `isFlatCandidate` выбрасывает композиты, потому что
   * в СЛОТ такой лист не встаёт — сервер отказывает (`ErrDesignCompositePlate`). Ровно поэтому
   * владелец их и не видел. Показываются они здесь ДРУГИМ глаголом: `split ▸` на кадре и
   * `apply splitted ▸` под ним, — а не `mark ▸`, который отказал бы.
   */
  const decks = useMemo(() => splitDecks(band, 'flat'), [band]);

  /** Which cell a write is in flight for — a shared `isPending` would say «saving» on all of them. */
  const [busy, setBusy] = useState<string | null>(null);

  /** Кадр одной картинки для общего ряда студии, или ничего — у безадресной плиты зума нет. */
  const frameOf = (picture: common_DesignPicture) =>
    picture.media ? mediaFullToViewerItem(picture.media) : undefined;

  const mark = (picture: common_DesignPicture, view: string) => {
    const side = sides.find((s) => s.view === view);
    const pictureId = picture.id ?? 0;
    if (!side || pictureId <= 0) return;
    setBusy(`p${pictureId}`);
    writes.setBenchSlot.mutate(
      // `kind: 'flat'` — WHICH BENCH, not which slot. The bench grew a second axis (view × kind),
      // and a render front and a flat front are now two different slots BOTH addressed by
      // `view_key: 'front'`. This strip marks DRAWINGS into the flat bench; leaving the field empty
      // would still mean flat today, and would silently mean whatever the default becomes later.
      // КОЛОРВЕЯ У ЭТОЙ ПОЛОСЫ НЕТ И НЕ БУДЕТ (L-4). Она размечает ЧЕРТЕЖИ, а чертёж один на
      // карточку: пикер колорвея стоит НИЖЕ неё, в секции генерации, и его власть кончается там.
      { slot: { viewKey: side.view, kind: 'flat', colorwayId: 0 }, pictureId, expectedSlotRev: side.slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ═══ J-17 — ФАЙЛ ИЗ МЕДИАТЕКИ ПРЯМО В ПУСТОЙ СЛОТ, ОДНОЙ ТРАНЗАКЦИЕЙ ═════════════════════════
   *
   * Владелец: «во вкладке FABRIC RENDER если у нас эмпти слот его от сюда же можно добавить из
   * медиа селектора».
   *
   * ОДНА РУЧКА ДЕЛАЕТ ОБЕ ПОЛОВИНЫ: `RegisterDesignUpload` заводит медиа в полосу карточки И
   * кладёт картинку в слот, названный в `target`, в одной транзакции. Значит карточка не может
   * оказаться с плитой в слоте, под которой нет строки, — и наоборот, с загруженным файлом,
   * который никуда не встал.
   *
   * ⚠ ЭТО ТОТ ЖЕ ВЫЗОВ, ЧТО У ВЕРСТАКА (`bench.tsx:placeMedia`), И ПОЛЯ НАЗВАНЫ ТЕ ЖЕ, ПОИМЁННО:
   *   · `kind: 'flat'` — УТВЕРЖДЕНИЕ этой полосы, а не догадка: под подписью «input — flats of
   *     this card» приходит чертёж. Пустое поле значило бы «flat» и сегодня, и «что бы ни стало
   *     умолчанием» завтра;
   *   · `colorwayId: 0` — у чертежа цвета не бывает по существу (L-4): `colorway_forbidden` на
   *     флэте это ОТКАЗ, а не обнуление;
   *   · `ghostView` — сторона, которую человек ТОЛЬКО ЧТО НАЗВАЛ, положив файл в этот слот; ровно
   *     для подтверждаемой человеком догадки поле и заведено;
   *   · `expectedSlotRev` — ревизия строки, прочитанная ЭТИМ рендером: чужая правка того же слота
   *     обязана отказать, а не молча вытеснить плиту;
   *   · `clientRequestId` минтится ОДИН РАЗ на намерение человека и НЕ внутри мутации — повтор со
   *     свежим ключом сервер честно завёл бы второй партией.
   */
  const placeMedia = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(`v${view}`);
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        items: [{ mediaId, ghostView: view, kind: 'flat', colorwayId: 0 }],
        target: { viewKey: view, kind: 'flat', colorwayId: 0 },
        expectedSlotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  const unmark = (view: string, slotRev: number) => {
    setBusy(`v${view}`);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` is UNMARK — empty the slot without deleting it. A different act from
      // deleting a slot, and it has to stay different.
      { slot: { viewKey: view, kind: 'flat', colorwayId: 0 }, pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  return (
    <Section
      /* ОБЪЯВЛЕННЫЙ ЯКОРЬ КОРОБКИ. Утверждение E-7 — это утверждение ОТСУТСТВИЯ («в этой секции
         нет ни одной плитки ткани»), а такое утверждение стоит ровно столько, сколько стоит
         объявленная коробка, по которой его можно проверить. Класс для этого не годится: он
         переживает правку смысла и оставляет пробу зелёной над сломанным экраном. */
      id='design-render-input'
      title='input — flats of this card'
      question='— the drawings the render is made from, one per side'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {/* Одной строкой, а не двумя: JSX схлопывает перенос в ПРОБЕЛ, и «0 sheet s» вылезло бы
              ровно из аккуратного форматирования. */}
          {marked.length} marked · {others.length} not marked
          {decks.length > 0 ? ` · ${decks.length} multi-view` : ''}
        </Text>
      }
    >
      {/* ═══ ОДНА ЛЕНТА, ТРИ ПРОБЕГА (K-9) ═══════════════════════════════════════════════════
          Владелец: «CLOTH должен быть дальше в линии с фронт бэк сайд л р и т д а не снизу».
          Порядок ленты: виды в слотах → ткани → ЛИНИЯ → всё прочее, чем карточка располагает.

          ДВУХ `GroupLabel` НАД ЛЕНТОЙ БОЛЬШЕ НЕТ. Они появились, когда рядов было два, и каждый
          подписывал свой; над ОДНОЙ лентой «flats» подписывал бы и ткани тоже, то есть врал бы.
          Кто есть кто, лента говорит сама: у вида — ярлык вида на кадре и толстая рамка слота, у
          ткани — её собственное имя строкой под кадром. Числа обеих групп стоят в `action`
          секции, одной строкой, где их и читают вместе. */}
      <Strip>
        {/* ═══ ЧЕТЫРЕ СЛОТА РИСУЮТСЯ ВСЕГДА, ЗАНЯТЫ ОНИ ИЛИ НЕТ (H-11) ══════════════════════════
            Пробег идёт по `sides`, а не по `marked`: порядок обхода (`SILHOUETTE_VIEWS`) — это и
            есть порядок слотов, и пустой вид обязан стоять на СВОЁМ месте между занятыми, иначе
            «чего не хватает» приходится вычислять, а не читать. Счётчики в шапке секции считают
            по-прежнему занятые (`marked`) — теперь они совпадают с тем, что видит глаз. */}
        {sides.map((side) => {
          const picture = side.picture;
          if (!picture) {
            return (
              <EmptyStripCell
                key={`slot-${side.view}`}
                view={side.view}
                /* ⚠ ТРЕБОВАНИЕ ЧИТАЕТСЯ У ТЕХ ЖЕ ВОРОТ, КОТОРЫЕ ОТКАЗЫВАЮТ (`renderGate`), а не у
                   `SHEET_MIN_VIEWS`: тот отвечает на вопрос ЛИСТА и сам оговаривает, что ничего не
                   запрещает. Довод целиком — у константы в `./model`. */
                required={RENDER_MIN_VIEWS.includes(side.view)}
                /* J-17. На read-only карточке двери нет вовсе — не серая кнопка, а её отсутствие:
                   каждая запись этого экрана гаснет так же. */
                onPlaceMedia={
                  disabled ? undefined : (media) => placeMedia(media, side.view, side.slotRev)
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
              /* «unmark» ОСТАЁТСЯ СЛОВОМ В ПОДВАЛЕ, А НЕ УГЛОВЫМ ✕ ПРИМИТИВА, и это не отступление
                 от общего закона углов. ✕ примитива означает «убрать картинку», а здесь картинка
                 никуда не девается: пустеет СЛОТ, а плита остаётся на карточке, справа от линии.
                 Глифом эти два акта неразличимы, и на выпущенной карточке цена ошибки — потерянная
                 работа. */
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

        {/* The line. It stands even when one side is empty: it separates two QUESTIONS, not two
            non-empty lists, and a divider that comes and goes stops reading as a boundary. */}
        <StripDivider />

        {/* THE HAND DOOR, equal in weight to the machine. A flat brought here lands on the upload
            shelf UNMARKED — `RegisterDesignUpload` with no target — because the human has not yet
            said which view it is, and a ghost guess is not an answer. It appears on the right of
            the line a moment later, with the same `mark ▸` as everything else. */}
        {!disabled && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect='132/148'
              label='+ flat'
              hint={null}
              purpose='design · flat for the render'
              showVideos={false}
              editMode
              onSelect={(media) => {
                const items = media
                  .map((m) => m.id ?? 0)
                  .filter((id) => id > 0)
                  // `kind: 'flat'` is a STATEMENT, not a guess (unlike `ghostView`): this door
                  // sits under «input — flats of this card», so what comes through it is a drawing.
                  // Nothing downstream could recover that from the pixels.
                  // …и колорвея у него нет по существу: `colorway_forbidden` на флэте — отказ,
                  // а не обнуление. Ноль здесь читается «у чертежа цвета не бывает».
                  .map((mediaId) => ({ mediaId, ghostView: '', kind: 'flat', colorwayId: 0 }));
                if (!items.length) return;
                writes.registerUpload.mutate({
                  // Minted once per human intent and NOT inside the mutation: a retry carrying a
                  // fresh id would make the server honestly file a second batch.
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

        {others.map((picture) => {
          const provenance = stripProvenance(band, picture);
          return (
            <StripCell
              key={`pic-${picture.id}`}
              offeredPictureId={picture.id}
              src={pictureThumb(picture)}
              alt={provenance}
              gallery={frameOf(picture)}
              lines={['not marked', provenance]}
              action={
                disabled ? undefined : (
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

        {/* ═══ СКЛЕЕННЫЕ ЛИСТЫ — ПОСЛЕДНИМИ СПРАВА ОТ ЛИНИИ (E-6) ══════════════════════════════
            Порядок не косметический: одиночные флэты помечаются В ОДНУ сторону, лист адресует
            ВЕСЬ вход сразу. Жест, переписывающий четыре слота, обязан стоять после жестов,
            переписывающих один, — иначе он читается как ещё один `mark ▸`, только пошире. */}
        {decks.map((deck) => {
          const id = deck.sheet.id ?? 0;
          const provenance = stripProvenance(band, deck.sheet);
          return (
            <StripCell
              key={`deck-${id}`}
              cellPictureId={id}
              src={pictureThumb(deck.sheet)}
              alt={`multi-view sheet · ${deck.declared.map(viewLabel).join(', ')}`}
              badge='multi-view'
              gallery={frameOf(deck.sheet)}
              /* УГОЛ `split` — ТОТ ЖЕ ОРГАН, ЧТО ВЕЗДЕ (владелец, круг 4: «сделай везде одинаково
                 включая кнопку сплит»). Для листа без разреза это ЕДИНСТВЕННЫЙ путь во вход. */
              onSplit={
                disabled
                  ? undefined
                  : {
                      onClick: () => split.openForPicture(deck.sheet, `sheet ${id}`),
                      ariaLabel: `split the multi-view sheet ${id} into views`,
                    }
              }
              lines={[
                deck.declared.length
                  ? `${deck.declared.length} views · ${deck.declared.map(viewLabel).join(', ')}`
                  : 'a multi-view file',
                provenance,
              ]}
              action={
                disabled ? undefined : deck.pieces.length ? (
                  <ApplySplitDoor
                    techCardId={techCardId}
                    sides={sides}
                    pieces={deck.pieces}
                    benchKind='flat'
                    /* ⚠ ЧЕРТЁЖ ЦВЕТА НЕ ИМЕЕТ ПО СУЩЕСТВУ (L-4): `colorway_forbidden` на флэте —
                       ОТКАЗ, а не обнуление. Ноль здесь читается «у чертежа цвета не бывает», и
                       это то же число, которым эта полоса пишет каждый свой слот. */
                    colorwayId={0}
                    noun='drawing'
                  />
                ) : (
                  /* ДВЕРИ НЕТ, ПОКА НЕЧЕГО ПРИМЕНЯТЬ, И ЭТО СКАЗАНО СЛОВАМИ. Кнопка, которая
                     нажимается и молчит, читается как сломанная; слово отправляет к тому жесту,
                     который сейчас единственно возможен. */
                  <Text size='nano' variant='label' component='span' className='normal-case'>
                    cut it first — split ▸ on the frame
                  </Text>
                )
              }
            />
          );
        })}

        {!marked.length && !others.length && !decks.length && (
          <Text size='micro' variant='inactive' component='span' className='py-6'>
            nothing to mark yet — use + FLAT to bring a drawing in, or generate one on the FLAT
            screen.
          </Text>
        )}
      </Strip>

      <Text size='micro' variant='label' component='p' className='normal-case'>
        Left of the line — what the render actually reads: all four view slots are always drawn,
        each filled one carrying its provenance. An empty slot takes a file straight from the
        library, and front and back must hold one before a fabric render can start; the two sides
        are optional. Right of the line — every other flat of this card, plus the multi-view sheets:
        a sheet holds several views in one file and cannot stand in a single slot, so it is cut
        first and then applied to the whole input at once. Marking a single flat displaces the
        picture that held that slot; nothing is deleted. The cloth this render is made OF is chosen
        below, under TEXTURE &amp; COLOUR.
      </Text>

      {/* THE PAGE IS ADMITTED, NOT HIDDEN. The band ships one page of the feed, so a card with a
          long history has flats this strip cannot see. An operator who is not told that concludes
          his file was lost. */}
      {feedIsTruncated(band) && (
        <Text size='nano' variant='label' component='p' className='normal-case'>
          This card has more history than one page. The right of the line lists the flats of the
          newest page; older ones are still on the card and still in their slots.
        </Text>
      )}

      {/* Модалка разреза — ПОД лентой: в прокручиваемом ряду ей места нет, а открывается она
          углом любой из ячеек листа. */}
      {split.modal}
    </Section>
  );
}
