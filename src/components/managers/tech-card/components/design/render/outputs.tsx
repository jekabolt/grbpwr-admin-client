import type { common_DesignPicture, common_DesignRun, GetDesignBandResponse } from 'api/proto-http/admin';
import { Fragment, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Pill } from 'ui/components/pill';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import SelectComponent from 'ui/components/select';

import { InertDoor } from '../bench-slot';
import { colorwayOf, refColorwayFor, slotHolding } from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { cropFamilies, type CropFamilies } from '../generation/composite';
import { CropDeck, DECK_PEEK_MAX } from '../generation/crop-deck';
import { VectorModal } from '../modals';
import { useSplitToInput } from '../split-to-input';
import { threedResults } from '../threed/media';
import { useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import {
  SELECT_MARK_NOT_STATED,
  outputsHorizon,
  outputsOfKind,
  pictureIsComposite,
  serverStatesOutputs,
  pictureIsSelected,
  pictureThumb,
  serverStatesSelected,
  stripProvenance,
  threedSides,
} from './model';
import { STRIP_CELL_PX, STRIP_FRAME_ASPECT, Strip, StripCell } from './strip-cell';

/** Radix запрещает пустое значение пункта, поэтому «ничего не выбрано» — сентинел, а не `''`. */
const MARK_PROMPT = '__mark__';

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
  const { setPictureSelected, setBenchSlot } = useDesignWrites(techCardId);
  /* ⚠ `openModel` СНЯТ ВМЕСТЕ С КНОПКОЙ `open` (E-25). Единственным, кто взводил это состояние,
     была она; окно модели теперь поднимает сама плитка, у которой на руках адрес `.glb`.
     И довод прежней сноски («одно окно на весь раздел, а не по одному на ячейку: сцена WebGL
     дорога») от переезда НЕ нарушен: плитка монтирует окно только раскрытым
     (`{modelOpen && modelHref && …}`), поэтому смонтированных сцен по-прежнему не больше одной —
     ровно той, которую человек открыл. */
  /** Для какой плитки идёт запись слота. Общий `isPending` сказал бы «saving» на всех сразу. */
  const [marking, setMarking] = useState<number | null>(null);
  /**
   * ⚠ И ТО ЖЕ САМОЕ ДЛЯ ПОМЕТКИ — ПРАВИЛО СТРОКОЙ ВЫШЕ НАКОНЕЦ РАСПРОСТРАНЕНО НА ВТОРУЮ ЗАПИСЬ.
   *
   * Пока пометка была кнопкой ПОД карточкой, она гасилась общим `setPictureSelected.isPending`,
   * то есть все плитки раздела разом. Стерпеть это было можно: серая кнопка среди серых кнопок
   * читается как «идёт запись». На КАДРЕ (E-25) так уже нельзя: угол — тихий орган, и погашенный
   * он выходит `#ccc` по белому, около 1.6:1, то есть просто исчезает — причём на всех плитках
   * сразу и без единого слова о том, что происходит.
   *
   * Поэтому занятость адресная, а орган говорит `select…` СВОИМ словом (`pending` у роли
   * примитива) и остаётся видимым, пока идёт запись.
   */
  const [selecting, setSelecting] = useState<number | null>(null);
  /**
   * ═══ РЕЗАТЬ МОЖНО ЗДЕСЬ ЖЕ (J-25) ═══════════════════════════════════════════════════════════
   *
   * Владелец: слоты «можно заполнять в разделе RENDERS OF THIS CARD и там же можно и сплитить их».
   * Тот же хук, что у верстака и у блока референсов, — второй механизм разъехался бы с первым в
   * значении роли.
   *
   * ⚠ `addToInput` НЕ ПЕРЕДАЁТСЯ, И ЭТО ДЕНЕЖНОЕ УМОЛЧАНИЕ, А НЕ ЭКОНОМИЯ БУКВ. Оно `false`, и
   * потому на провод уезжает `SplitDesignPicture.for_input = false`: сервер тогда НЕ заводит
   * кадрам строки `design_reference`. Строка роли едет в промпт КАЖДОГО флэт-прогона
   * (`designAssembleInputs`), то есть разрез рендера с `true` молча дописывал бы цветные кадры во
   * вход всех последующих чертежей — и платил бы за них на каждом прогоне. Умолчание выбрано
   * так, чтобы забытый проп давал ТИШИНУ, а не тихое пополнение промпта; см. шапку
   * `split-to-input.tsx`.
   */
  const split = useSplitToInput({ techCardId, band });
  /* КАКУЮ ИМЕННО КАРТИНКУ ПРАВИМ. Не булево `editing`: ячеек в полосе много, а модалка одна,
     и флаг открыл бы редактор сразу над всеми. Ноль — закрыто. */
  const [editingId, setEditingId] = useState(0);
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
      //
      // ⚠ А ЕСЛИ РАСТРА НЕ ПРИШЛО — В КАДР ИДЁТ САМА МОДЕЛЬ, И ЭТО ПОЧИНКА, А НЕ ЗАПАСНОЙ ПУТЬ
      // (E-25). «Модель без миниатюры» — законное состояние прогона (`if thumb.Len() > 0` в
      // Collect), и до этой волны такая строка рисовалась ПЛЕЙСХОЛДЕРОМ: не плиткой, а полосатой
      // коробкой со словами «3d model · no preview». Пока органы стояли кнопками ПОД карточкой,
      // это работало. Как только они переехали на кадр (владелец: «должны появляться на ховер на
      // карточку»), плейсхолдер остался бы КАДРОМ БЕЗ ЕДИНОЙ ДВЕРИ: ни открыть, ни пометить
      // модель, за которую заплачено, стало бы нечем.
      //
      // Отвечает на это примитив, а не этот файл: `PictureTile` умеет лицо `.glb` — слово «3d
      // model» в кадре, поверхность в просмотрщик и угловой `open 3d` по наведению. То есть
      // плейсхолдер здесь был ВТОРЫМ написанием того же лица, сделанным до того, как примитив
      // научился первому.
      src: result.posterUrl || result.modelUrl,
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

  /**
   * ═══ ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4) ══════════════════════════════════
   *
   * Владелец, дословно: «в RENDERS OF THIS CARD после экспанда спличеных карточек при зуме любой
   * другой они должны обратно колапсится».
   *
   * ЗАКОН ТОТ ЖЕ И НАПИСАН ТЕМИ ЖЕ ТРЕМЯ СТРОКАМИ, ЧТО В ЛЕНТЕ, И ЭТО НАМЕРЕННО: «одна открытая
   * колода» уже живёт в обоих хостах одинаково, и второй ДИАЛЕКТ той же мысли разошёлся бы с
   * первым на первой же правке. Читатели родства при этом остаются одним — `families.rootOf`,
   * который этот файл уже считает для самой колоды.
   *
   * ГРАНИЦА — ПО КОЛОДЕ, А НЕ ПО КАРТОЧКЕ. Зум по САМОМУ листу и по любому его куску — это работа
   * ВНУТРИ раскрытой группы; сложить её там значило бы унести куски из документа под уже открытым
   * окном, и человек, ткнувший в кусок, оказался бы на соседнем кадре.
   */
  const foldOnForeignZoom = (pictureId: number) =>
    setOpenDeck((current) => {
      if (current === null || !pictureId) return current;
      if (pictureId === current) return current;
      return families.rootOf.get(pictureId) === current ? current : null;
    });

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
   * ═══ ПОСТАВИТЬ РЕНДЕР В СТОРОНУ — ПРЯМО ОТСЮДА (J-25) ═══════════════════════════════════════
   *
   * Владелец: слоты фабрик-рендера «можно заполнять в разделе RENDERS OF THIS CARD».
   *
   * ⚠ АДРЕСУЕТСЯ ВЕРСТАК ПЛИТЫ, А НЕ ВЕРСТАК ЭКРАНА, И ЭТО НЕ ОСТОРОЖНОСТЬ. Колорвей входит в
   * ключ исключительности слота, а сервер сверяет колорвей ПЛИТЫ с колорвеем СЛОТА и отвергает
   * несовпадение (`colorway_mismatch`). Кадр ROSSO, помеченный при выбранном OLIVE, обязан
   * адресовать верстак ROSSO — иначе экран рисует дверь, за которой отказ. Сегодня секция и так
   * сужена колорвеем студии, то есть две величины совпадают; читать их как одну значило бы
   * поставить починку в зависимость от сужения, которое живёт в другом файле и может смениться.
   *
   * ⚠ CAS-ТОКЕН БЕРЁТСЯ С ТОГО ЖЕ ВЕРСТАКА, ЧТО И АДРЕС. Полоса читается целиком
   * (`bench_colorway_id: 0`, довод в `use-design-band.ts`), поэтому строка чужого колорвея у
   * клиента на руках есть и второго круга запроса не нужно.
   */
  const markInto = (picture: common_DesignPicture, view: string) => {
    const pictureId = picture.id ?? 0;
    if (pictureId <= 0) return;
    const bench = refColorwayFor('render', colorwayOf(picture));
    const side = threedSides(band, bench).find((s) => s.view === view);
    if (!side) return;
    setMarking(pictureId);
    setBenchSlot.mutate(
      // `kind: 'render'` — КАКОЙ ВЕРСТАК, а не какой слот. Рендер-фронт и флэт-фронт — два разных
      // слота, ОБА адресуемые `view_key: 'front'`; пустое поле читается сервером как flat, и плита
      // уехала бы в чужой верстак, где её отвергли бы по роду кадра (`wrong_kind`).
      {
        slot: { viewKey: view, slotId: 0, kind: 'render', colorwayId: bench },
        pictureId,
        expectedSlotRev: side.slotRev,
      },
      { onSettled: () => setMarking(null) },
    );
  };

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
     * ═══ ТРИ ФАКТА, РЕШАЮЩИЕ СУДЬБУ ДВЕРИ `mark ▸` (J-25) ═════════════════════════════════════
     *
     * Все три — ЗЕРКАЛА СЕРВЕРНЫХ ОТКАЗОВ, а не вкус экрана, и потому дверь не рисуется живой там,
     * где сервер уже сказал бы «нет»:
     *   · `composite` — склеенный лист: `ErrDesignCompositePlate`, «сторона это ОДИН вид»;
     *   · `held` — плита уже занимает какой-то слот ЭТОЙ карточки: `ErrDesignPictureAlreadyInSlot`,
     *     и граница там карточка, а не верстак (довод у `slotHolding`);
     *   · род — дверь стоит только у рендеров: у 3D слот верстака рода `threed` не принимает
     *     вовсе (`IsDesignBenchKind` его знает, но выходов 3D в верстак никто не кладёт), и
     *     единственное избрание модели там — пометка `selected`, которую J-23 у рендеров снял.
     */
    /** В кадре стоит РАСТР, а не сам `.glb`: у прогона без миниатюры это не так (E-25). */
    const posterShown = !!src && !!modelUrl && src !== modelUrl;
    const composite = kind === 'render' && pictureIsComposite(picture);
    const held = kind === 'render' ? slotHolding(band, picture.id ?? 0) : null;
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
        /* E-4: зум чужой карточки складывает открытую колоду; своя и её куски — нет. */
        onZoom={() => foldOnForeignZoom(picture.id ?? 0)}
        /* Толстая рамка — «этот экран это ЧИТАЕТ». У рендеров пометка больше ничего не
           открывает, и подсветка обещала бы вес, которого у неё нет (J-23). */
        emphasis={selectable && chosen}
        src={src}
        alt={modelUrl ? `3d model of run ${run.id ?? ''}` : `${noun} ${picture.ordinal ?? ''}`}
        /* ⚠ ЗАГЛУШКА БОЛЬШЕ НЕ ЛОВИТ «ПРОГОН БЕЗ МИНИАТЮРЫ» — ЕГО ЛОВИТ КАДР (E-25, разбор у
           `src` выше): у такой строки в кадре теперь стоит САМА модель, и примитив рисует ей
           лицо с дверью. Остался единственный случай, при котором рисовать нечем вообще: у
           строки нет НИ ОДНОГО адреса файла — ни растра, ни `.glb`. Он должен быть назван
           словом: пустая рамка читается как несработавший сервер, а сервер тут ни при чём. */
        empty={
          <Text size='nano' variant='label' component='span'>
            no file address on this row
          </Text>
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
        /* ═══ РЕЗАТЬ — ТЕМ ЖЕ УГЛОМ, ЧТО ВЕЗДЕ (J-25) ══════════════════════════════════════════
           Владелец про этот угол уже говорил один раз в общем виде: «сделай везде одинаково
           включая кнопку сплит нахуя ты делаешь везде по разному». Поэтому он рисуется на КАЖДОМ
           рендере, а не только на склеенном листе: у листа это единственный путь в слоты, у
           одиночного кадра — обычный кроп, и разными органами эти два жеста не бывают.
           У 3D его нет: резать модель нечем, а её постер поглощён парой (`threedResults`). */
        /* ═══ ПОМЕТКА — УГОЛ КАДРА, А НЕ КНОПКА ПОД НИМ (E-25) ════════════════════════════════
           Владелец, дословно: «кнопки OPEN DOWNLOAD SELECT должны появляться на ховер на карточку
           а не кнопками снизу».

           ⚠ СЮДА ПЕРЕЕХАЛА ТОЛЬКО ЖИВАЯ ДВЕРЬ, И ЭТО РЕШЕНИЕ ЭТОГО ЖЕ ФАЙЛА, ПРИНЯТОЕ РАНЬШЕ.
           Двумя сотнями строк выше стоит разбор снесённой двери «split first ▸»: «Угол — ТИХИЙ
           орган: он появляется по наведению, то есть отказ называл орган, которого на экране не
           видно». Отказ, спрятанный в наведение, — это отсутствие отказа. Поэтому оба неживых
           состояния (сервер не знает пометки; карточка только для чтения) остаются `InertDoor`
           ПОД кадром, словами и всегда видимыми, — см. ряд `action` ниже. */
        onSelect={
          selectable && carries && !writesOff
            ? {
                onClick: () => {
                  const id = picture.id ?? 0;
                  setSelecting(id);
                  setPictureSelected.mutate(
                    { pictureId: id, selected: !chosen },
                    { onSettled: () => setSelecting(null) },
                  );
                },
                /* Занятость АДРЕСНАЯ и со СВОИМ словом — довод у `selecting` выше. */
                pending: selecting === (picture.id ?? 0),
                ariaLabel: chosen
                  ? `take the chosen mark off ${noun} ${picture.ordinal ?? ''}`.trim()
                  : `mark ${noun} ${picture.ordinal ?? ''} as chosen`.trim(),
                title: chosen
                  ? 'take the mark off — with none chosen, ARTIFACTS goes back to listing every picture of this kind'
                  : 'mark this picture as chosen — ARTIFACTS offers the chosen ones for markup',
              }
            : undefined
        }
        selectLabel={chosen ? 'un-select' : 'select'}
        /* ⚠ ПРАВКА — ТОЛЬКО РЯДОМ СО СПЛИТОМ И ТОЛЬКО У РАСТРА (E-3). Владелец просил на
           ховер «сплит и эдит», и оба угла живут по одному правилу: редактор работает ОТ
           РАСТРА, а `.glb` растром не является — на постере же он сработал бы и завёл в
           строке прогона обычную картинку, выдающую себя за выход 3D. `slot` не передаётся:
           плитка полосы не слот верстака, и результат правки никуда вставать не обязан. */
        onEdit={
          kind === 'render' && !writesOff && !modelUrl
            ? {
                onClick: () => setEditingId(picture.id ?? 0),
                ariaLabel: `edit render ${picture.ordinal ?? ''} — draw over this picture`.trim(),
                title:
                  'draw over this picture — saving makes a NEW picture; the original is never overwritten',
              }
            : undefined
        }
        onSplit={
          kind === 'render' && !writesOff && !modelUrl
            ? {
                onClick: () => split.openForPicture(picture, `render ${picture.ordinal ?? ''}`.trim()),
                ariaLabel: `split render ${picture.ordinal ?? ''} into views`,
              }
            : undefined
        }
        /* ⚠ ЯРЛЫК ГОВОРИТ ТО, ЧЕГО НЕ ГОВОРИТ САМ КАДР. У прогона С ПОСТЕРОМ кадр — обычный
           растр, и по нему не видно, что за ним модель: слово нужно. У прогона БЕЗ постера в
           кадре стоит `.glb`, и примитив уже пишет «3d model» посреди него — второй такой же
           ярлык поверх был бы одним фактом, сказанным дважды. Пометка при этом называется
           всегда: это состояние, а не тип файла. */
        badge={
          modelUrl
            ? chosen
              ? '3d · selected'
              : posterShown
                ? '3d model'
                : undefined
            : selectable && chosen
              ? 'selected'
              : undefined
        }
        lines={[
          stamped ? `run ${run.id} · ${shape}` : `no run · ${shape}`,
          stripProvenance(band, picture),
        ]}
        /* ⚠ РЯД ПОД КАДРОМ РИСУЕТСЯ, ТОЛЬКО ЕСЛИ В НЁМ ЧТО-ТО ЕСТЬ (E-25). У здоровой ячейки 3D
           под карточкой теперь не должно быть НИЧЕГО — а пустой `<div>` это всё-таки орган:
           `StripCell` даёт ему свою отбивку, и ряд ячеек разъезжается по высоте оттого, у какой
           из них дверь жива. Единственные жильцы ряда — двери рендера (плашка/`split`/`mark ▸`) и
           ОТКАЗ пометки; живая пометка уехала на кадр. */
        action={
          kind === 'render' || (selectable && (!carries || writesOff)) ? (
          <div className='flex flex-wrap items-center gap-1'>
            {/* ═══ ДВЕРЬ В СЛОТ — ЗДЕСЬ, ГДЕ ЛЕЖИТ МАТЕРИАЛ (J-25) ═════════════════════════════
                Четыре состояния, и каждое отвечает на СВОЙ вопрос человека:
                  · «в какой стороне это уже стоит» — читаемая плашка (Pill), не кнопка: сторону
                    освобождает ✕ на самой плите в FABRIC RENDER SLOTS, и второй глагол снятия
                    здесь был бы вторым реестром одного действия;
                  · «почему нельзя поставить лист» — инертная дверь со словом «split first»,
                    рядом с углом, который его режет;
                  · «почему дверь мертва» — карточка только читается либо сервер молчит;
                  · и сама постановка — селект сторон.
                ⚠ АТРИБУТ ВИСИТ НА ОБЁРТКЕ, А НЕ НА `SelectComponent`: корень Radix разбирает
                ЗАКРЫТЫЙ список пропов, `data-*` до DOM не доезжает, и утверждение по нему было бы
                зелёным над отсутствующим узлом. Тот же приём, что у `ColorwaySelect`. */}
            {kind === 'render' &&
              (held ? (
                <span
                  data-mark-held={picture.id || undefined}
                  title={
                    `this render already stands in a slot of this card, and one plate stands in one slot: ` +
                    `the server refuses a second placement outright. Empty that side first — the ✕ on its ` +
                    `plate in FABRIC RENDER SLOTS.`
                  }
                >
                  <Pill>in {viewLabel((held.viewKey ?? '').trim()) || 'a slot'}</Pill>
                </span>
              ) : composite ? (
                /* ═══ У ЛИСТА ДВЕРЬ ЖИВАЯ, И ЭТО ПОЧИНКА, А НЕ УКРАШЕНИЕ ══════════════════════
                   Здесь стояла ПОГАШЕННАЯ дверь «split first ▸», чья причина отправляла человека
                   «к угловой кнопке этой плитки». Угол — ТИХИЙ орган: он появляется по наведению,
                   то есть отказ называл орган, которого на экране не видно. Дверь, объясняющая,
                   куда пойти, вместо того чтобы туда вести, — самый дорогой вид мёртвого контрола:
                   она занимает то самое место, где нужный жест и ожидается.
                   Теперь глагол один и он исполним отсюда. «Почему нельзя пометить лист» переехало
                   в `title` — это ответ на вопрос, который человек задаёт ПОСЛЕ, а не вместо. */
                writesOff ? (
                  <InertDoor
                    label='split ▸'
                    reason={
                      disabled
                        ? 'this card is read-only for you — cutting a sheet writes new pictures onto the card'
                        : 'this server does not answer the design routes'
                    }
                  />
                ) : (
                  <span data-split-for={picture.id || undefined} className='inline-flex'>
                    <Button
                      variant='secondary'
                      size='xs'
                      onClick={() =>
                        split.openForPicture(picture, `render ${picture.ordinal ?? ''}`.trim())
                      }
                      title='one sheet with several views glued into it, and a side holds ONE view. Cut it into frames here, then put them into their sides below'
                    >
                      split ▸
                    </Button>
                  </span>
                )
              ) : writesOff ? (
                <InertDoor
                  label='mark ▸'
                  reason={
                    disabled
                      ? 'this card is read-only for you — putting a render into a side is an edit of the card'
                      : 'this server does not answer the design routes'
                  }
                />
              ) : (
                <span data-mark-for={picture.id || undefined} className='inline-flex w-[104px]'>
                  <SelectComponent
                    name={`mark-render-${picture.id}`}
                    value={MARK_PROMPT}
                    placeholder='mark ▸'
                    disabled={marking === (picture.id ?? 0)}
                    /* ⚠ ЗАНЯТАЯ СТОРОНА НАЗЫВАЕТ СЕБЯ ЗАНЯТОЙ. Пункт без пометки писал бы «front»
                       и молча ВЫТЕСНЯЛ плиту, которая там стоит: запись идёт CAS-токеном ИМЕННО
                       той строки, поэтому она проходит. Довод блока слотов гласит, что замена
                       осталась отдельным жестом «где видно, что именно вытесняется» — в момент
                       действия видно не было ничего. Сторона не запрещается: замена законна и
                       обратима, она просто перестаёт быть немой. */
                    items={[
                      { value: MARK_PROMPT, label: 'mark ▸' },
                      ...SILHOUETTE_VIEWS.map((view) => {
                        const held = threedSides(band, refColorwayFor('render', colorwayOf(picture)))
                          .find((s) => s.view === view)?.picture;
                        const heldId = held?.id ?? 0;
                        return {
                          value: view,
                          label: heldId > 0 ? `${viewLabel(view)} · replaces #${heldId}` : viewLabel(view),
                        };
                      }),
                    ]}
                    onValueChange={(value: string) => {
                      if (!value || value === MARK_PROMPT) return;
                      markInto(picture, value);
                    }}
                    fullWidth
                  />
                </span>
              ))}
            {/* ═══ ЗДЕСЬ СТОЯЛИ `open` И `download` — ОБЕ СНЯТЫ (E-25) ═══════════════════════
                Владелец, дословно: «кнопки OPEN DOWNLOAD SELECT должны появляться на ховер на
                карточку а не кнопками снизу а кнопки DOWNLOAD быть не должно она только во вьере».

                `open` НЕ ПОТЕРЯН, А ПЕРЕЕХАЛ В ПРИМИТИВ: у плитки, за которой стоит модель,
                поверхность открывает просмотрщик модели, а по наведению в верхнем правом углу
                появляется объявленный орган `open 3d` (`picture-tile.tsx`). Это верно для ОБЕИХ
                строк 3D — и для постера, и для самого `.glb`, — потому что кадр теперь всегда
                есть (разбор у `src` выше).

                `download` СНЯТ НАСОВСЕМ, и довод «файл отдаётся до всякого просмотра и независимо
                от него» ПРОВЕРЕН, а не отброшен: ссылка на файл в окне модели стоит НАД сценой и
                от неё не зависит — так написана её собственная шапка (`threed/model-modal.tsx`).
                Упавший разбор `.glb`, выключенный WebGL, нехватка памяти уносят картинку, но не
                ссылку. Файл стал на одно нажатие дальше и не стал недостижимым.

                А ВОТ ОТКАЗ ПОМЕТКИ ОСТАЛСЯ ЗДЕСЬ, И ЭТО НЕ НЕДОДЕЛКА: дверь, которой нельзя
                воспользоваться, обязана быть ВИДНА без наведения — довод у пропа `onSelect`
                выше. Живая пометка ушла на кадр; неживая говорит словом на прежнем месте. */}
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
            /* ЖИВАЯ ПОМЕТКА СТОИТ НА КАДРЕ (проп `onSelect` выше), поэтому под кадром её нет.
               Ветка оставлена пустой намеренно: три состояния одной двери читаются подряд, и
               «а где же третье» — вопрос, который иначе задавал бы каждый следующий читатель. */
            null
          )}
          </div>
          ) : undefined
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
      {/* ОДНО ОКНО РЕЗА НА ВЕСЬ РАЗДЕЛ. Оно рисуется хуком и монтируется только когда цель
          выбрана; кадры размечает человек, а `for_input: false` уезжает на провод из самого хука
          (довод — у его вызова выше). */}
      {split.modal}

      {/* ОДИН РЕДАКТОР НА ВЕСЬ РАЗДЕЛ, ПО ИМЕНИ ЦЕЛИ (E-3). Держать его внутри ячейки значило
          бы столько модалок, сколько плиток; булев флаг открыл бы их разом над всеми.
          `slot={null}` — плитка полосы не слот верстака: машинная векторизация внутри честно
          откажет («the machine reads the bench»), а рисование поверх работает целиком. */}
      {editingId > 0 && rows.some((r) => (r.picture.id ?? 0) === editingId) && (
        <VectorModal
          open
          onOpenChange={(next: boolean) => !next && setEditingId(0)}
          techCardId={techCardId}
          band={band}
          base={rows.find((r) => (r.picture.id ?? 0) === editingId)!.picture}
          slot={null}
          disabled={disabled}
        />
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
