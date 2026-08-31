import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { LockBar } from './generate-row';
import {
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
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  lock?: Gate;
  onGoToKind?: (kind: 'flat' | 'render') => void;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);

  const sides = useMemo(() => threedSides(band), [band]);
  const others = useMemo(() => threedCandidates(band), [band]);
  const marked = sides.filter((side) => !!side.picture);

  /** Для какой ячейки идёт запись. Общий `isPending` сказал бы «сохраняю» на всех сразу. */
  const [busy, setBusy] = useState<string | null>(null);

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
      { slot: { viewKey: side.view, kind: 'render' }, pictureId, expectedSlotRev: side.slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  const unmark = (view: string, slotRev: number) => {
    setBusy(`v${view}`);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` — ОСВОБОДИТЬ сторону, не удаляя ничего: плита остаётся на карточке.
      { slot: { viewKey: view, kind: 'render' }, pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  return (
    <Section
      title='input — renders by view'
      question='— 3D turns the renders, not the drawings: one render marked into each side'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {marked.length} of 4 marked · {others.length} not marked
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
                empty={
                  <span className='flex flex-col gap-0.5'>
                    <span>{viewLabel(side.view)}</span>
                    <span className='text-labelColor'>no render marked</span>
                  </span>
                }
                lines={[
                  'required',
                  <span key='blocks' className='text-error'>
                    blocks 3D
                  </span>,
                ]}
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
                  .map((mediaId) => ({ mediaId, ghostView: '', kind: 'render' }));
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

        {others.map(({ picture, chosen, composite }) => {
          const provenance = stripProvenance(band, picture);
          return (
            <StripCell
              key={`pic-${picture.id}`}
              src={pictureThumb(picture)}
              alt={provenance}
              gallery={frameOf(picture)}
              /* Ярлык — ПОМЕТКА ВЛАДЕЛЬЦА, поставленная в FABRIC RENDER. Она и привела его сюда. */
              badge={chosen ? 'selected' : undefined}
              lines={[chosen ? 'chosen · not marked' : 'not marked', provenance]}
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
        Left of the line — the four sides the turntable is actually built from, one render each.
        Right of the line — every other render of this card; the ones you chose in FABRIC RENDER
        come first. Marking one displaces the render that held the side; nothing is deleted.
      </Text>

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
