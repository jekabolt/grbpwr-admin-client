import type { common_DesignPicture, common_DesignRun, GetDesignBandResponse } from 'api/proto-http/admin';
import { Fragment, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { cropFamilies, type CropFamilies } from '../generation/composite';
import { CropDeck, DECK_PEEK_MAX } from '../generation/crop-deck';
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
import { STRIP_CELL_PX, STRIP_FRAME_ASPECT, Strip, StripCell } from './strip-cell';

/** Пустая карта родства — для рода, который колодой не группируется. Один экземпляр: новая пустая
 *  карта на каждый рендер пересобирала бы `useMemo` ниже по кругу. */
const EMPTY_FAMILIES: CropFamilies = { membersOf: new Map(), rootOf: new Map() };

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
   * ОДНА ОТКРЫТАЯ КОЛОДА НА РАЗДЕЛ, тем же законом, что и в ленте: «нажимаешь на другой мультивью
   * старый колапсится обратно». Состояние из одного значения делает второе открытое невыразимым.
   */
  const [openDeck, setOpenDeck] = useState<number | null>(null);

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

  /**
   * ═══ КОЛОДА КРОПОВ И ЗДЕСЬ, ТЕМ ЖЕ ОРГАНОМ (J-23) ═══════════════════════════════════════════
   *
   * Владелец, дословно: «в RENDERS OF THIS CARD должна быть такая же логика что мы можем нажать
   * на мультивью и оно группирует сплиты от одного мультивью».
   *
   * ✅ ПРЕДИКАТ «ТОЛЬКО ПОСЛЕ СПЛИТА» ТЕПЕРЬ ОКОНЧАТЕЛЬНЫЙ, И ОБЕЩАНИЕ СДЕРЖАНО ДОСЛОВНО. Колонка
   * `design_picture.derivation` доехала, и поменялось РОВНО ОДНО место — `isCutOut` в
   * `composite.tsx`, через который ходят оба хоста колоды. В этом файле не появилось ни строчки
   * про виды производных: второе мнение о родстве и есть дефект, от которого он уходит.
   *
   * ⚠ ПРОВЕРЕНО, А НЕ ПРИНЯТО НА ВЕРУ, — прежняя редакция этого абзаца была ОБЕЩАНИЕМ. В `src/`
   * есть ещё четыре читателя `derived_from`, и ни один не рисует колоду: `visibility.ts` (через
   * `band-feed.tsx`) зеркалит серверное условие запрета скрытия и обязан остаться слепым к
   * глаголу, иначе ✕ будет рисоваться и получать отказ; `render/model.ts:derivesFromChosen`
   * спрашивает «помечена ли картинка выше по цепочке»; `threed/media.ts` — поглощение постера
   * парой 3D; `provenance.ts` печатает сырой id родителя. Три вопроса, ни одного о колоде.
   *
   * ⚠ ТОЛЬКО У РЕНДЕРОВ. Ряд 3D — это `threedResults`, свод пары «модель + её растр», и
   * `derived_from` там уже занят другим утверждением (кроп постера не поглощается парой). Пакет
   * 3D придёт своим кругом.
   */
  const families = useMemo(
    () => (kind === 'render' ? cropFamilies(rows.map((r) => r.picture)) : EMPTY_FAMILIES),
    [rows, kind],
  );
  /** Кусок → его строка ряда: открытая колода рисует членов теми же ячейками, что и ряд. */
  const rowById = useMemo(() => {
    const m = new Map<number, Row>();
    for (const row of rows) if (row.picture.id != null) m.set(row.picture.id, row);
    return m;
  }, [rows]);

  if (!rows.length) return null;

  // Does the binary that answered state the mark at all? With `EmitUnpopulated` a server that
  // knows the field sends it on EVERY picture (as `false` when unset), so one picture is a
  // truthful sample for all of them — and `undefined` means «rolled-back binary», against which
  // the verb's own route would 404 too, so the doors are drawn inert rather than collecting it.
  const carries = serverStatesSelected(rows[0].picture);
  const marked = rows.filter((r) => pictureIsSelected(r.picture)).length;
  const writesOff = !!disabled || !speaks;

  /**
   * ═══ У РЕНДЕРОВ ПОМЕТКИ БОЛЬШЕ НЕТ (J-23) ═══════════════════════════════════════════════════
   *
   * Владелец, дословно: «в RENDERS OF THIS CARD … там не должно быть кнопки селект».
   *
   * ⚠ РОД РЕШАЕТ, И ЭТО НЕ ОСТОРОЖНОСТЬ. Раздел один на два экрана. У 3D пометка — ЕДИНСТВЕННЫЙ
   * способ избрать модель, и снести её там значило бы отнять выбор, о котором владелец не просил
   * (3D — предмет отдельного пакета, J-26/J-27/J-29). У рендеров же выбор давно живёт в другом
   * месте: плита встаёт в слот верстака, и слот — это и есть «карточка идёт с этим». Пометка
   * была вторым реестром одного избрания.
   *
   * ЧТО СТАНОВИТСЯ С ЧИТАТЕЛЯМИ ПОМЕТКИ. `pictureIsSelected` читают ARTIFACTS (W-14) и полоса
   * входа 3D (Д-4); оба уже держат правило «никто не помечен → предлагаются все», и на карточке,
   * где помечать больше нечем, они по этому правилу и работают. Старые пометки на проводе
   * остаются и продолжают читаться — снос двери не стирает данных.
   */
  const selectable = kind !== 'render';

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

  /**
   * ═══ ОДНА ЯЧЕЙКА ПОЛОСЫ — ФУНКЦИЕЙ, А НЕ ТЕЛОМ MAP (J-23) ═════════════════════════════════
   *
   * Ячейка рисуется теперь из ДВУХ мест: как лист колоды и как обычная строка ряда, а куски
   * открытой колоды встают тем же органом сразу за своим листом. Второе написание ячейки рядом
   * разошлось бы с первым словом или пикселем — это ровно тот дефект, ради которого `StripCell`
   * и заведён.
   *
   * `deckSheet` — «эта ячейка стоит листом СВЁРНУТОЙ колоды»: её поверхность раскрывает колоду
   * вместо того, чтобы открыть просмотрщик (J-2, `PictureTile.onOpen`). Зум при этом не теряется
   * — он остаётся угловой кнопкой, как и в ленте.
   */
  function cell({ picture, run, src, modelUrl }: Row, deckSheet?: boolean): JSX.Element {
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
        onOpen={
          deckSheet ? () => setOpenDeck((current) => (current === (picture.id ?? 0) ? null : picture.id ?? 0)) : undefined
        }
        cellPictureId={picture.id}
        /* Толстая рамка — «этот экран это ЧИТАЕТ». У рендеров пометка больше ничего не
           открывает, и подсветка обещала бы вес, которого у неё нет (J-23). */
        emphasis={selectable && chosen}
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
        badge={
          modelUrl
            ? chosen
              ? '3d · selected'
              : '3d model'
            : selectable && chosen
              ? 'selected'
              : undefined
        }
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
            {!selectable ? null : !carries ? (
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
              /* ⚠ РЕДАКЦИЯ ДЛЯ РЕНДЕРА ОТСЮДА УБРАНА, И ЭТО НЕ ПОТЕРЯ, А ДОКАЗАННАЯ МЁРТВОСТЬ.
                 Дверь рисуется только при `selectable`, то есть только у 3D (J-23) — компилятор
                 сузил `kind` до `'threed'` и назвал ветку рендера недостижимой сам. Слова про
                 «3D ставит помеченные рендеры в стороны» жили ровно в той ветке; ставить их
                 больше негде, потому что и ставить пометку на рендер больше негде. */
              title={
                chosen
                  ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
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
  }

  return (
    <Section
      title={kind === 'threed' ? '3D models of this card' : 'renders of this card'}
      question={
        /* ОХВАТ НАЗЫВАЕТСЯ У ОБОИХ РОДОВ, А НЕ ТОЛЬКО У РЕНДЕРОВ. До J-19 про «страницу ленты
           против всей карточки» говорила сноска, и она стояла НАД ОБОИМИ экранами; вопрос же
           различал охват только у рендеров, а 3D отвечал одной фразой на оба случая. Со снятием
           сноски это стало бы потерей: на откаченном бинаре список 3D честно обходит страницу
           ленты, и признаться в этом теперь может только вопрос. */
        kind === 'threed'
          ? stated
            ? '— the models of this whole card, and which of them is the chosen one'
            : '— the models on this page of the feed, and which of them is the chosen one'
          : stated
            ? // ГОВОРИТ ПРО КАРТОЧКУ ЦЕЛИКОМ И ПРО ОБА ПРОИСХОЖДЕНИЯ. В списке теперь стоят и
              // загруженные руками плиты (у них нет прогона вовсе), а «came back» — слово о
              // прогоне, и под ним рука выглядела бы чужой строкой.
              '— the coloured plates of this whole card, generated or brought, and which are chosen'
            : // ОТКАЧЕННЫЙ БИНАРЬ ПРИЗНАЁТСЯ ЗДЕСЬ, И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ОН ЕЩЁ МОЖЕТ.
              // Строка охвата и сноска, обе говорившие «on this page of the feed», сняты (J-24,
              // J-19). Список на таком сервере по-прежнему обходит СТРАНИЦУ ЛЕНТЫ, и молчать об
              // этом значило бы выдать её за все рендеры карточки.
              '— the coloured plates on this page of the feed, and which of them are chosen'
      }
      /* ЧЕЙ ЭТО СПИСОК И ГДЕ ОН КОНЧАЕТСЯ — В СЧЁТЕ ШАПКИ, А НЕ ОТДЕЛЬНОЙ СТРОКОЙ (J-24, J-19).
         Владелец снял обе прозаические строки под плитками; из них уцелели ровно два ФАКТА, и оба
         стоят здесь, потому что оба — про охват этого счёта:
           · имя колорвея — сужение, о котором нельзя молчать («а где мой рендер» на соседнем
             цвете); безколорвейная секция не говорит ничего, её сужение уже назвал пикер выше;
           · горизонт — единственная фраза, называвшая ПОТЕРЮ: у колорвея N картинок, доехало M.
         Слово о том, что список — вся карточка или только страница ленты, ушло в `question`
         секции: там оно стоит один раз и в обеих редакциях. */
      action={
        /* ДВА ЧЛЕНА, А НЕ ОБЁРТКА: слот `action` у `SectionHeader` сам по себе flex-ряд с gap —
           лишний span здесь был бы коробкой внутри коробки на ровном месте. */
        <>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {rows.length} {noun}
            {rows.length === 1 ? '' : 's'}
            {colorwayLabel?.trim() ? ` · ${colorwayLabel.trim()}` : ''}
            {/* СЧЁТ ПОМЕЧЕННЫХ — ТОЛЬКО ТАМ, ГДЕ ПОМЕТКУ СТАВЯТ (J-23). У рендеров двери больше
                нет, и число «· 2 selected» над списком без единого органа читалось бы как
                сломанная кнопка, а не как факт. */}
            {selectable && carries ? ` · ${marked} selected` : ''}
          </Text>
          {horizon && (
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase'
              data-outputs-horizon={`${horizon.carried}/${horizon.total}`}
              title={`this colourway has ${horizon.total} generative pictures in all and the card shipped the newest ${horizon.carried} of them, so the oldest are not on this list`}
            >
              newest {horizon.carried} of {horizon.total}
            </Text>
          )}
        </>
      }
    >
      {/* ПРИЗНАНИЕ ПРО ОТКАЧЕННЫЙ БИНАРЬ СТОИТ ТАМ, ГДЕ ЕСТЬ ДВЕРЬ. У рендеров пометки больше нет
          (J-23), и «doors below stay shut» описывало бы двери, которых на экране не существует —
          то есть отправляло бы человека искать несломанное. */}
      {selectable && !carries && (
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
        {rows.map((row) => {
          const rootId = row.picture.id ?? 0;
          // Кусок рисуется ТОЛЬКО под своим листом — иначе закрытая колода показала бы его вопреки
          // собственной двери, а открытая дважды.
          if (families.rootOf.has(rootId)) return null;
          const members = families.membersOf.get(rootId) ?? [];
          const open = openDeck === rootId;
          if (!members.length) return <Fragment key={rootId}>{cell(row)}</Fragment>;
          return (
            <Fragment key={rootId}>
              <CropDeck
                rootId={rootId}
                count={members.length}
                peeks={members.map((member) => ({
                  id: member.id ?? 0,
                  url: pictureThumb(member),
                  alt: `render ${member.ordinal ?? ''}`,
                }))}
                /* ПОЛОСА — НЕ СЕТКА: ячейка здесь фиксированной ширины (`CELL_WIDTH` = 132px), и
                   ширина колоды считается явно, а не спанится дорожками. Формула — та же, что в
                   ленте: лист плюс по трети на каждый выглядывающий кусок. */
                sheetWidth={`${STRIP_CELL_PX}px`}
                frameAspect={STRIP_FRAME_ASPECT}
                className='shrink-0'
                style={
                  open
                    ? undefined
                    : {
                        width: `calc(${STRIP_CELL_PX}px + ${Math.min(
                          members.length,
                          DECK_PEEK_MAX,
                        )} * ${STRIP_CELL_PX}px / ${DECK_PEEK_MAX})`,
                      }
                }
                open={open}
                onToggle={() => setOpenDeck((current) => (current === rootId ? null : rootId))}
              >
                {cell(row, !open)}
              </CropDeck>
              {open &&
                members.map((member) => {
                  const memberRow = rowById.get(member.id ?? 0);
                  return memberRow ? <Fragment key={member.id}>{cell(memberRow)}</Fragment> : null;
                })}
            </Fragment>
          );
        })}
      </Strip>
      {/* ОДНО ОКНО НА ВЕСЬ РАЗДЕЛ, А НЕ ПО ОДНОМУ НА ЯЧЕЙКУ: сцена WebGL дорога, и держать её
          смонтированной под каждой плиткой — это упереться в потолок живых контекстов браузера. */}
      {openModel && (
        <ThreedModelModal url={openModel} title='3d model' onClose={() => setOpenModel(null)} />
      )}

      {/* J-19 (владелец, дословно): сноска «Every render this card holds, newest first…» снята
          целиком — вместе с редакцией про страницу ленты, фразой «The mark is a verdict…» и
          предложением про дверь 3D. Что из неё уцелело и где:
            · горизонт («у колорвея N, доехало M») — в счёте шапки, `data-outputs-horizon`: это
              единственная фраза сноски, называвшая ПОТЕРЮ;
            · охват («вся карточка» против «страница ленты») — в `question` шапки, обе редакции;
            · «дверь 3D ставит помеченные в стороны» — в `title` кнопки select, там, где метку и
              ставят.
          ЧТО УШЛО НАСОВСЕМ: различение «помечено ≠ скрыто». Скрывать картинки по одной этот
          клиент больше не умеет (verb снят), стамп `hidden` носят только строки прошлых сессий, и
          плитка подписывает их словом сама — второго объяснения экрану не нужно. */}
    </Section>
  );
}
