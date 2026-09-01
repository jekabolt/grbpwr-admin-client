import { MediaSlot } from 'components/managers/media/components/media-slot';
import type { JSX } from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { mediaThumb } from '../render/model';
import { CELL_WIDTH, Strip, StripCell } from '../render/strip-cell';
import type { RecolorSources } from './drafts';
import { RECOLOR_SOURCES_MAX } from './model';

/**
 * INPUT — PHOTOGRAPHS OF THIS GARMENT. Что перекраска на самом деле перекрашивает.
 *
 * ═══ ЭТО ПОЛОСА ТОГО ЖЕ РОДА, ЧТО У РЕНДЕРА И 3D, И ЭТО НЕ ЭКОНОМИЯ ═══════════════════════════
 *
 * Три генеративных экрана открываются одинаково: горизонтальный ряд входов, кадр 132×148, две
 * строки подписи под ним, одна дверь в углу. Своя полоса здесь разошлась бы с соседними по пикселю
 * и по слову, а читаются они одним взглядом — поэтому ячейки и ряд взяты общие (`strip-cell`).
 *
 * ═══ И ЧЕМ ОНА ОТ НИХ ОТЛИЧАЕТСЯ — ТРЕМЯ ВЕЩАМИ, И ВСЕ ТРИ СКАЗАНЫ ВСЛУХ ══════════════════════
 *
 *  1. ЛИНИИ ПОСЕРЕДИНЕ НЕТ. У рендера и 3D слева стоит ВЕРСТАК (исключительные слоты, по одному
 *     на вид), справа — всё остальное. Здесь верстака нет вовсе: перекраска не адресуется видами,
 *     сторону снимка не объявляет никто, и каждый кадр равноправен. Полоса — просто список того,
 *     что уедет, в порядке, в котором его набрали.
 *  2. ЭТО НЕ КАРТИНКИ КАРТОЧКИ, А МЕДИА. Кадры не заводятся как `DesignPicture` (довод целиком —
 *     в `./drafts.ts`), поэтому у них нет ни провенанса, ни прогона, ни пометки: под кадром стоит
 *     его номер и его размер, и это всё, что о нём правдиво известно до отправки.
 *  3. КАЖДЫЙ КАДР — ОТДЕЛЬНЫЙ ПЛАТНЫЙ ВЫЗОВ, и модель видит в нём ТОЛЬКО ЕГО. Она не сравнивает
 *     снимки между собой и не знает, что это одна вещь с четырёх сторон. Практическое последствие
 *     ровно одно и его надо знать заранее: совпадение оттенка между кадрами не гарантировано
 *     механизмом, его обеспечивает названный цвет. Об этом говорит подпись под полосой, а не
 *     всплывающее сообщение после того, как деньги ушли.
 */
export function OnModelInputStrip({
  sources,
  disabled,
}: {
  sources: RecolorSources;
  disabled?: boolean;
}): JSX.Element {
  const count = sources.items.length;
  const over = count > RECOLOR_SOURCES_MAX;

  return (
    <Section
      title='input — photographs on a model'
      question='— the shots this run recolours: one paid call each, from any side'
      action={
        /* ДВЕРЬ, ДЕЙСТВУЮЩАЯ НА ВСЮ ПОЛОСУ, ЖИВЁТ В ЕЁ ШАПКЕ — та же грамматика, что у «use the N
           you chose» на входе 3D. Внизу блока, под объясняющим абзацем, она читалась как приписка
           и стояла дальше от того, что снимает, чем от текста про деньги. */
        <span className='flex items-center gap-3'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className={over ? 'uppercase text-error' : 'uppercase'}
          >
            {count} photograph{count === 1 ? '' : 's'} · {RECOLOR_SOURCES_MAX} max
          </Text>
          {!disabled && count > 0 && (
            <Button variant='secondary' size='xs' onClick={sources.clear}>
              remove all {count}
            </Button>
          )}
        </span>
      }
    >
      <Strip>
        {sources.items.map((media, index) => {
          const id = media.id ?? 0;
          /* РАЗМЕР БЕРЁТСЯ У ОРИГИНАЛА, А НЕ У МИНИАТЮРЫ. Под кадром стояло `160×200` — половина
             от настоящего: миниатюра именно тем и отличается, что меньше. Число, читаемое как
             разрешение снимка и не являющееся им, хуже отсутствующего. */
          const full = media.media?.fullSize;
          const size =
            full?.width && full?.height ? `${full.width}×${full.height}` : `media ${id}`;
          return (
            <StripCell
              key={id}
              emphasis
              src={mediaThumb(media)}
              alt={`photograph ${index + 1}`}
              /* НОМЕР, А НЕ ВИД. Сторону этот кадр не объявляет — её не знает ни файл, ни сервер;
                 номер же несущий: результаты приходят по одному на снимок и читаются по этому же
                 порядку. */
              badge={String(index + 1)}
              gallery={mediaFullToViewerItem(media)}
              lines={[`photo ${index + 1} · one paid call`, size]}
              action={
                disabled ? undefined : (
                  <Button variant='secondary' size='xs' onClick={() => sources.remove(id)}>
                    remove
                  </Button>
                )
              }
            />
          );
        })}

        {!disabled && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect='132/148'
              label='+ photo'
              hint={null}
              purpose='design · a photograph to recolour'
              showVideos={false}
              editMode
              allowMultiple
              onSelect={(media) => sources.add(media)}
            />
            <Text size='nano' variant='label' component='span'>
              from the library
            </Text>
            <Text size='nano' variant='label' component='span'>
              ⌘V · drop · browse
            </Text>
          </div>
        )}
      </Strip>

      {count === 0 && (
        <Text size='micro' variant='inactive' component='p' className='normal-case'>
          Nothing to recolour yet. Bring in the shots of this garment — front, back, a side, a
          detail: whatever exists. Each one comes back recoloured on its own.
        </Text>
      )}

      <Text size='micro' variant='label' component='p' className='normal-case'>
        Each photograph is its own paid call, and the model is shown <b>one</b> photograph at a
        time: it never sees the others and does not know they are the same garment. So the thing
        that keeps four shots the same shade is the colour you name below, not the fact that they
        were sent together.
        {count > 0 && (
          <>
            {' '}
            These are <b>media</b>, not pictures of this card: they are not filed on the card and
            not on the bench. What was sent is kept by the run itself, in its input snapshot.
          </>
        )}
      </Text>

    </Section>
  );
}
