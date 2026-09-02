import type { common_DesignPicture, common_DesignRun, GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { threedResults } from '../threed/media';
import { ThreedModelModal } from '../threed/model-modal';
import { useDesignWrites } from '../use-design-band';
import { viewLabel } from '../views';
import {
  SELECT_MARK_NOT_STATED,
  outputsHorizon,
  outputsOfKind,
  serverStatesOutputs,
  pictureIsSelected,
  pictureThumb,
  serverStatesSelected,
  stripProvenance,
} from './model';
import { Strip, StripCell } from './strip-cell';

/**
 * ═══ THE OUTPUTS OF ONE KIND, AND THE MARK «CHOSEN» ON THEM — W-12 ════════════════════════════
 *
 * ONE SECTION FOR BOTH GENERATIVE SCREENS. The owner's sentence names 3D («мы так же можем маркать
 * 3д рендеры как выбранные»), but the mark is one notion across the band: ARTIFACTS narrows each
 * of its representations to the chosen pictures of that kind (W-14), so a kind whose outputs had
 * no place to BE chosen would carry a switch position that filters on a mark nobody can set. So
 * the turntable frames get this section on 3D and the fabric renders get the same section on
 * FABRIC RENDER — same cells, same doors, same rules, because two copies would drift by a word.
 * FLATS deliberately have no such section: the bench slot IS the choice for a flat (a slot holds
 * at most one plate), and a second mark there would be two registries of one election.
 *
 * WHY THE VERDICT LIVES BESIDE THE MENU THAT PRODUCES IT. A run comes back as a handful of
 * pictures of ONE ask, and the owner's requirement is to be able to say which of them is THE one.
 * The run history lists every run of the card, of every kind, folded — it answers «what has this
 * card cost», not «which picture did we settle on».
 *
 * THE WRITE GOES THROUGH THE BAND'S ONE SEAM (`useDesignWrites().setPictureSelected`), like every
 * other write of the band. `selected` and `hidden` stay two unrelated statements: hiding says «do
 * not show me this», choosing says «this is the one», a chosen picture may later be hidden, and
 * nothing here folds one gesture into the other. Nothing is exclusive either — the owner speaks
 * in the plural, so the doors toggle each picture on its own and never un-mark a neighbour.
 */
/**
 * Одна ячейка полосы. `modelUrl` непуст ровно тогда, когда за ячейкой стоит файл модели: у
 * рендеров он пуст всегда, у 3D — всегда, кроме исторической строки, приехавшей без `.glb`.
 */
interface Row {
  picture: common_DesignPicture;
  run: common_DesignRun;
  /** Растр для кадра. Пусто — рисуется заглушка со словом, а не молчаливая дыра. */
  src: string;
  modelUrl: string;
}

export function OutputsSection({
  band,
  techCardId,
  kind,
  disabled,
  colorwayId,
  colorwayLabel,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  kind: 'render' | 'threed';
  disabled?: boolean;
  /**
   * ═══ ВЫХОДЫ ТОГО ЖЕ КОЛОРВЕЯ, ЧТО И МЕНЮ НАД НИМИ (L-2) ═══════════════════════════════════
   *
   * `undefined` — экран без оси (сегодня таких нет; оставлено для композитора, у которого выбора
   * колорвея нет вовсе), и тогда список не сужается ничем. Число — включая 0 — сужает до прогонов
   * ЭТОГО колорвея; 0 это безколорвейные, то есть все, сделанные до оси.
   *
   * ПЛИТКА ЧУЖОГО КОЛОРВЕЯ ОТСЮДА ПРОПАДАЕТ, И ЭТО ОТВЕТ, А НЕ ПРОПАЖА. Она лежит на карточке,
   * видна в ленте прогонов ниже и в ARTIFACTS; здесь её нет потому, что раздел стоит под меню
   * ОДНОГО цвета и «renders of this card» без сужения читалось бы как «вход, который увидит 3D».
   */
  colorwayId?: number;
  /** Имя выбранного колорвея для подписи; пусто = безколорвейный верстак. */
  colorwayLabel?: string;
}): JSX.Element | null {
  // HOOKS ABOVE THE EARLY RETURN, unconditionally — a hook below it would change the hook count
  // between renders and take the whole tree down (React #310; this screen has paid for it once).
  const speaks = serverSpeaksDesign();
  const { setPictureSelected } = useDesignWrites(techCardId);
  const [openModel, setOpenModel] = useState<string | null>(null);

  /**
   * ═══ РЯД ЯЧЕЕК: ДЛЯ РЕНДЕРОВ — КАРТИНКА, ДЛЯ 3D — РЕЗУЛЬТАТ ═══════════════════════════════
   *
   * ⚠ ПРОГОН 3D ОТДАЁТ ДВЕ СТРОКИ НА ОДИН ПРЕДМЕТ, и до этой правки раздел считал их за два:
   * заголовок говорил «2 models» там, где модель одна, а вторая ячейка отдавала `.glb` в `<img>`
   * и показывала битый кадр. Пару сводит `threedResults` — ЕДИНСТВЕННОЕ место, где живёт этот
   * счёт; здесь она только вызывается. Второй свод рядом с ним разошёлся бы молча.
   */
  const rows = useMemo<Row[]>(() => {
    const outputs = outputsOfKind(band, kind, colorwayId);
    if (kind !== 'threed') {
      return outputs.map(({ picture, run }) => ({
        picture,
        run,
        src: pictureThumb(picture),
        modelUrl: '',
      }));
    }
    return threedResults(outputs).map((result) => ({
      picture: result.markable,
      run: result.run,
      // Растр, который маршрут прислал ВМЕСТЕ с моделью, ровно для этого и прислан: «the raster
      // thumbnail that stands in for it wherever a list has to draw a tile» (`threedfal.go`).
      src: result.posterUrl,
      modelUrl: result.modelUrl,
    }));
  }, [band, kind, colorwayId]);

  if (!rows.length) return null;

  // Does the binary that answered state the mark at all? With `EmitUnpopulated` a server that
  // knows the field sends it on EVERY picture (as `false` when unset), so one picture is a
  // truthful sample for all of them — and `undefined` means «rolled-back binary», against which
  // the verb's own route would 404 too, so the doors are drawn inert rather than collecting it.
  const carries = serverStatesSelected(rows[0].picture);
  const marked = rows.filter((r) => pictureIsSelected(r.picture)).length;
  const writesOff = !!disabled || !speaks;

  /**
   * ═══ КАКОЙ ИЗ ДВУХ ОТВЕТОВ НАРИСОВАН — И ПОДПИСЬ ЧИТАЕТ ИМЕННО ЕГО (H-9) ═══════════════════
   *
   * `serverStatesOutputs` спрашивает про БИНАРЬ («поле прислано вообще?»), а не про длину списка.
   * Разница поймана ревью: пустой, но объявленный список — это «выходов нет», а не «сервер старше
   * поля», и подписывать его фразой про страницу ленты значит обманывать охватом в подписи ровно
   * так же, как раньше обманывал сам список. Читатель списка при этом продолжает складывать пустое
   * с несказанным, и это безопасно по надмножеству — довод стоит у самих предикатов.
   *
   * `horizon` — не «сколько всего у карточки». Это «сколько У ЭТОГО КОЛОРВЕЯ и сколько из них
   * доехало»: потолок сервера тратится ПОКОЛОРВЕЙНО, и `outputs_total` подписал бы суженную
   * секцию числом всей карточки. `null` — ничего не осталось за горизонтом, и тогда о нём молчим.
   */
  const stated = serverStatesOutputs(band);
  // Горизонт спрашивается только у СЕКЦИИ С КОЛОРВЕЕМ — теперь это требование типа, а не
  // договорённость: секция без сужения не имеет числа, которым её можно честно подписать.
  const horizon = colorwayId === undefined ? null : outputsHorizon(band, colorwayId);

  /**
   * ⚠ «FRAME» И «TURNTABLE» БЫЛИ НЕПРАВДОЙ, И ЭТО ПРОВЕРЕНО ПО ЗАДЕПЛОЕННОМУ БЭКЕНДУ, А НЕ ПО
   * ПАМЯТИ. Маршрут 3D — `hitem3d/…/multi-view-to-3d` через fal, и его `Produces` называет ровно
   * два предмета: САМУ МОДЕЛЬ (`.glb`) и растровую миниатюру, которая стоит вместо неё там, где
   * список обязан нарисовать плитку (`internal/designgen/threedfal.go` на origin/beta). Кадров
   * оборота не возвращается ни одного и не возвращалось с тех пор, как поворотный стол сменился
   * сборкой объёма из видов. Слово «кадр» звало человека искать ряд картинок, которого нет.
   */
  const noun = kind === 'threed' ? 'model' : 'render';

  return (
    <Section
      title={kind === 'threed' ? '3D models of this card' : 'renders of this card'}
      question={
        kind === 'threed'
          ? '— the models that came back, and which of them is the chosen one'
          : stated
            ? // ГОВОРИТ ПРО КАРТОЧКУ ЦЕЛИКОМ И ПРО ОБА ПРОИСХОЖДЕНИЯ. В списке теперь стоят и
              // загруженные руками плиты (у них нет прогона вовсе), а «came back» — слово о
              // прогоне, и под ним рука выглядела бы чужой строкой.
              '— the coloured plates of this card, generated or brought, and which are chosen'
            : '— the coloured plates that came back, and which of them are chosen'
      }
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {rows.length} {noun}
          {rows.length === 1 ? '' : 's'}
          {carries ? ` · ${marked} selected` : ''}
        </Text>
      }
    >
      {/* ЧЕЙ ЭТО СПИСОК И ГДЕ ОН КОНЧАЕТСЯ — ОДНОЙ СТРОКОЙ, ДО ПЛИТОК. Сужение по колорвею надо
          сказать всегда (иначе «а где мой рендер» на соседнем цвете); ВТОРОЕ сужение — по странице
          ленты — теперь есть не всегда, и строка называет ровно то, что нарисовано: всю карточку
          на сервере, который выходы объявляет, и страницу ленты на откаченном бинаре. */}
      {colorwayId !== undefined && (
        <Text
          size='nano'
          variant='label'
          component='p'
          data-outputs-scope={colorwayId}
          data-outputs-whole={stated ? '1' : '0'}
          className='normal-case'
        >
          {colorwayLabel?.trim()
            ? `${noun}s of ${colorwayLabel.trim()}, ${stated ? 'of this whole card' : 'on this page of the feed'}`
            : `${noun}s filed without a colourway, ${stated ? 'of this whole card' : 'on this page of the feed'}`}
        </Text>
      )}
      {!carries && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>this server does not state the mark at all.</b> `DesignPicture.selected` is on this
            contract, and a server that knows it sends it on every picture — this one sent nothing,
            which means a binary older than the field. Nothing is broken; the card simply has no
            record of which {noun} was chosen, and the doors below stay shut until the server
            catches up.
          </Text>
        </CalloutBox>
      )}

      <Strip>
        {rows.map(({ picture, run, src, modelUrl }) => {
          const chosen = pictureIsSelected(picture);
          /**
           * ⚠ `run 0` — ЭТО НЕ ПРОГОН НОМЕР НОЛЬ. Со времён H-9 в списке стоят и плиты, за которыми
           * прогона нет вовсе: загруженная руками и «плоская» правка без основы обе приходят с
           * `run_id = 0`. Печатать им `run 0` значило бы назвать номер, которого нет.
           *
           * И слово тут именно «no run», а не «upload», хотя загрузка — частый случай: контракт
           * прямо предупреждает, что `run_id 0` НЕ влечёт «пришло из партии» (`batch_id` тоже
           * бывает нулём). Откуда плита взялась на самом деле, говорит вторая строка — она читает
           * `source_class` и печатает `uploaded` / `drawn` / `imported SVG`. Первая строка отвечает
           * только за прогон, и её честный ответ — что прогона нет.
           */
          const stamped = (run.id ?? 0) > 0;
          const view = viewLabel((picture.ghostView ?? '').trim());
          const shape = modelUrl
            ? '3d model'
            : kind === 'threed'
              ? `picture ${picture.ordinal ?? '—'}`
              : [view, run.rrev ? `r${run.rrev}` : ''].filter(Boolean).join(' · ') ||
                `picture ${picture.ordinal ?? '—'}`;
          return (
            <StripCell
              key={picture.id}
              cellPictureId={picture.id}
              emphasis={chosen}
              src={src}
              alt={modelUrl ? `3d model of run ${run.id ?? ''}` : `${noun} ${picture.ordinal ?? ''}`}
              /* Прогон без миниатюры — законное состояние (`if thumb.Len() > 0` в Collect), и на
                 нём рисовать нечего. Заглушка обязана СКАЗАТЬ это словом: пустая рамка читается
                 как несработавший сервер. */
              empty={
                modelUrl ? (
                  <Text size='nano' variant='label' component='span'>
                    3d model · no preview
                  </Text>
                ) : undefined
              }
              /* Выход прогона встаёт в ОБЩИЙ ряд просмотрщика студии. Без этой строки плитка
                 рисовалась общим примитивом, но кадра в ряд не клала — то есть зума у неё не было
                 вовсе, и «листать по всем картинкам» (T-8) обрывалось ровно на готовых рендерах,
                 ради которых экран и открывают. */
              gallery={
                picture.media && mediaFullViewerSrc(picture.media)
                  ? mediaFullToViewerItem(picture.media)
                  : undefined
              }
              badge={modelUrl ? (chosen ? '3d · selected' : '3d model') : chosen ? 'selected' : undefined}
              lines={[
                stamped ? `run ${run.id} · ${shape}` : `no run · ${shape}`,
                stripProvenance(band, picture),
              ]}
              action={
                <div className='flex flex-wrap items-center gap-1'>
                  {/* ФАЙЛ ОТДАЁТСЯ ДО ВСЯКОГО ПРОСМОТРА И НЕЗАВИСИМО ОТ НЕГО. Модель — то, за что
                      заплачено; просмотрщик — удобство поверх неё, и его отказ не должен уносить
                      предмет вместе с собой. */}
                  {modelUrl && (
                    <>
                      <Button
                        variant='secondary'
                        size='xs'
                        onClick={() => setOpenModel(modelUrl)}
                        title='open the model in the viewer'
                      >
                        open
                      </Button>
                      <Button asChild variant='secondary' size='xs'>
                        <a href={modelUrl} target='_blank' rel='noopener noreferrer' download>
                          download
                        </a>
                      </Button>
                    </>
                  )}
                  {!carries ? (
                  <InertDoor label='select' reason={SELECT_MARK_NOT_STATED} />
                ) : writesOff ? (
                  <InertDoor
                    label={chosen ? 'un-select' : 'select'}
                    reason={
                      disabled
                        ? 'this card is read-only for you — the mark is an edit of the card'
                        : 'this server does not answer the design routes'
                    }
                  />
                ) : (
                  <Button
                    variant='secondary'
                    size='xs'
                    disabled={setPictureSelected.isPending}
                    onClick={() =>
                      setPictureSelected.mutate({
                        pictureId: picture.id ?? 0,
                        selected: !chosen,
                      })
                    }
                    /* ПОДПИСЬ НАЗЫВАЕТ ПОСЛЕДСТВИЕ, И У ДВУХ РОДОВ ОНО РАЗНОЕ. Владелец пометил
                       рендер здесь и ждал его в 3D; пока подпись говорила только про ARTIFACTS,
                       пометка выглядела обещанием, которого экран не давал. */
                    title={
                      chosen
                        ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
                        : kind === 'render'
                          ? // ЦЕНА ВТОРОЙ ПОМЕТКИ НА ТУ ЖЕ СТОРОНУ НАЗЫВАЕТСЯ ЗДЕСЬ, ГДЕ ЕЁ И
                            // СТАВЯТ (Д-4). Помечать нескольких кандидатов законно — экран 3D
                            // теперь говорит, кто из них забрал сторону, — но узнавать об этом
                            // только там значит ставить вердикт вслепую.
                            'mark this render as chosen — ARTIFACTS offers the chosen ones for markup, and 3D puts the chosen renders into their sides with one door; if two of them name the same side, that side goes to the newer'
                          : 'mark this picture as chosen — ARTIFACTS offers the chosen ones for markup'
                    }
                  >
                    {chosen ? 'un-select' : 'select'}
                  </Button>
                  )}
                </div>
              }
            />
          );
        })}
      </Strip>

      {/* ОДНО ОКНО НА ВЕСЬ РАЗДЕЛ, А НЕ ПО ОДНОМУ НА ЯЧЕЙКУ: сцена WebGL дорога, и держать её
          смонтированной под каждой плиткой — это упереться в потолок живых контекстов браузера. */}
      {openModel && (
        <ThreedModelModal url={openModel} title='3d model' onClose={() => setOpenModel(null)} />
      )}

      <Text
        size='nano'
        variant='label'
        component='p'
        data-outputs-note={stated ? 'whole' : 'page'}
        className='normal-case'
      >
        {/* ⚠ ЭТА СНОСКА БЫЛА ПРИЗНАНИЕМ, А ПРИЗНАНИЕ — НЕ ПОЧИНКА. Она годами говорила «это
            страница ленты, а не все рендеры карточки», и владелец нашёл ровно то, о чём она
            предупреждала. Теперь у неё две редакции, и печатается та, которая соответствует
            нарисованному списку: сервер, объявляющий выходы, показывает карточку целиком; сервер
            старше поля — по-прежнему страницу, и говорит об этом прежними словами. */}
        {stated ? (
          <>
            Every {noun} this card holds, newest first — including the pieces cut out of a sheet,
            and the plates brought in by hand rather than generated. Hidden ones are folded away.
            {horizon ? (
              <>
                {' '}
                This colourway has {horizon.total} generative pictures in all and the card shipped
                the newest {horizon.carried} of them, so the oldest are not on this list.
              </>
            ) : null}{' '}
          </>
        ) : (
          <>
            This is the page of the feed the band shipped, newest run first — not every {noun} this
            card has ever produced.{' '}
          </>
        )}
        The mark is a verdict about a picture and is <b>not</b> the same thing as hiding one: a
        hidden picture is out of sight and can come back, a chosen one is what the card is going
        with — and what ARTIFACTS narrows its list to. More than one may be chosen.
        {/* КУДА ВЕДЁТ ПОМЕТКА — СКАЗАНО ТАМ, ГДЕ ЕЁ СТАВЯТ. Она никого никуда не двигает сама:
            сторона поворотного стола исключительна, а помеченных может быть много. */}
        {kind === 'render' && (
          <>
            {' '}
            On <b>3D</b>, the input strip offers to put the renders you chose here into the sides
            they declare — one door, one gesture; the mark itself moves nothing.
          </>
        )}
      </Text>
    </Section>
  );
}
