import type { common_DesignPicture, common_DesignRun, GetDesignBandResponse } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import SelectComponent from 'ui/components/select';

import { InertDoor } from '../bench-slot';
import { colorwayOf, refColorwayFor, slotHolding } from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
import { cropFamilies, type CropFamilies } from '../generation/composite';
import { CropDeck, DECK_PEEK_MAX } from '../generation/crop-deck';
import { runStatus } from '../generation/run-state';
import { useElapsed } from '../generation/use-generation';
import { VectorModal } from '../modals';
import { useSplitToInput } from '../split-to-input';
import { threedResults } from '../threed/media';
import { useBringOwnModel } from '../threed/model-upload-cell';
import { useDesignWrites } from '../use-design-band';
import {
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  normaliseViewKey,
  viewLabel,
  type SilhouetteView,
} from '../views';
import { applyPlan, type SplitPiece } from './apply-split';
import {
  SELECT_MARK_NOT_STATED,
  liveRunsOfKind,
  outputsHorizon,
  outputsOfKind,
  pictureIsComposite,
  pictureOffersSplit,
  serverStatesOutputs,
  pictureIsSelected,
  pictureThumb,
  serverStatesSelected,
  threedSides,
} from './model';
import { CELL_WIDTH, STRIP_CELL_PX, STRIP_FRAME_ASPECT, Strip, StripCell } from './strip-cell';

/** Radix запрещает пустое значение пункта, поэтому «ничего не выбрано» — сентинел, а не `''`. */
const MARK_PROMPT = '__mark__';

/** Пустая карта родства — для рода, который колодой не группируется. Один экземпляр: новая пустая
 *  карта на каждый рендер пересобирала бы `useMemo` ниже по кругу. */
const EMPTY_FAMILIES: CropFamilies = { membersOf: new Map(), rootOf: new Map() };

/**
 * ═══ ОДНА СЕТКА НА ВЕСЬ РЯД ДВЕРЕЙ — F-9, И ЭТО ЗАМЕР, А НЕ ВКУС ══════════════════════════════
 *
 * Владелец, дословно: «отполируй дизайн импакаблом тк сейчас там все кнопки скачут селекторы
 * болшего размера чем кнопки».
 *
 * ЗАМЕРЕНО ДО ПРАВКИ (`tmp/dsgprobe/k17w1-measure.mjs` над той же сборкой):
 *   · органы ряда стояли трёх разных высот — Pill 19px, Button xs 20px, Radix-триггер 24px
 *     (`min-h-[22px]` + две рамки), то есть селектор был на пятую часть выше соседней кнопки;
 *   · верхние кромки органов разъезжались на 18.5px (1243 против 1261.5), потому что ячейка
 *     листа колоды мерилась по содержимому, а соседние — по растянутому ряду;
 *   · ряд был `flex-wrap`, и селектор шириной 104px в колонке 132px переносил соседа на вторую
 *     строку, меняя высоту ячейки от её содержимого.
 *
 * ЛЕЧИТСЯ ТРЕМЯ ЧИСЛАМИ, А НЕ ПОДБОРОМ. Ряд — коробка ФИКСИРОВАННОЙ высоты в 20px (высота
 * `Button size='xs'`: 16px `leading-4` + 2px паддинга + 2px рамок), органы центрируются по ней, и
 * ровно ОДНА живая дверь на ячейку. Селектор приводится к той же высоте и к тому же кеглю
 * (`text-micro uppercase`), а не остаётся полем ввода: `min-h-0` обязателен — `min-height` и
 * `height` у twMerge разные группы, и без него 22px тихо победили бы 20px.
 *
 * ⚠ МЕТРИКА ЖИВЁТ ЗДЕСЬ, А НЕ В `StripCell`. Тот же примитив несёт ряды других экранов, и там в
 * `action` стоят КОЛОНКИ (кнопка + абзац последствия у `ApplySplitDoor`): фиксированные 20px
 * обрезали бы их молча.
 */
const DOOR_ROW = 'flex h-5 items-center gap-1';
/** ⚠ `bg-bgColor` ЯВНО, А НЕ ПО УМОЛЧАНИЮ. Вторичная кнопка системы — «white fill, 1px edge
 *  border», но БЕЛОГО В НЕЙ НЕТ: она полагается на белую страницу под собой. Над затемнённым
 *  грунтом группы (`Bay`) сквозь неё просвечивал #ededed, и `set` читался залитым — то есть
 *  нажатым или выключенным, — стоя рядом с белыми селекторами. Замерено снимком 2×. */
const DOOR = 'h-5 w-full bg-bgColor';
/** То же для `InertDoor`: класс приезжает на ЕЁ обёртку, а ширину надо отдать кнопке внутри —
 *  примитив её наружу не пускает, а мёртвая дверь обязана занимать ровно то место, которое заняла
 *  бы живая. Иначе отказ выглядит уже своей причины и читается как другой орган. */
const INERT_DOOR = 'w-full [&>button]:h-5 [&>button]:w-full [&>button]:bg-bgColor';

/**
 * ═══ ЗАТЕМНЁННЫЙ ГРУНТ ПОД РАСКРЫТОЙ ГРУППОЙ — F-6 ═══════════════════════════════════════════
 *
 * Владелец, дословно: «сплитнутые сейчас отображаются с обводкой один пиксель черной это убрать я
 * имел ввиду другое когда они расколапшены сделай так что бы под ними мульти вью и стороны был
 * немного затемнен бекграунд что бы когда оно анколапшено было понятно что это общие картинки как
 * то визуально отделить».
 *
 * ГРУППА — ЭТО ЛИСТ ПЛЮС ЕГО КУСКИ, И ОНИ ЖИВУТ ПО РАЗНЫЕ СТОРОНЫ `CropDeck`. Куски раскрытой
 * колоды рисуются РЯДОМ с ней, обычными ячейками ряда, поэтому коробки, охватывающей обе половины,
 * у колоды нет и быть не может: она кончается на своём последнем пикселе (там же, где кончалась
 * снятая обводка E-4 — та обводила ЛИСТ С ВЕЕРОМ, то есть не то, что владелец называл). Коробку
 * даёт этот отсек.
 *
 * ⚠ ОТСЕК ОБЯЗАН БЫТЬ У КАЖДОГО ЧЛЕНА ПОЛОСЫ, А НЕ ТОЛЬКО У ГРУППЫ, И ЭТО НЕ СИММЕТРИЯ РАДИ
 * СИММЕТРИИ. Отбивка сдвигает содержимое отсека относительно соседей, и группа перестала бы
 * стоять с ними на одной линии. Одинаковый отсек у ВСЕХ снимает сдвиг по построению: тонируется
 * ровно один из них, а метрика у всех одна. Замерено `k17w1-measure.mjs`: верхние кромки кадров
 * совпадают до пикселя.
 *
 * ⚠ ОТБИВКА ТОЛЬКО ПО ВЕРТИКАЛИ, И ЭТО ТОЖЕ ЗАМЕР. Первая редакция брала `p-1` — грунт получал
 * рамку в 4px со всех сторон и выглядел нарядно, но ЛЕВАЯ кромка первой ячейки уезжала с 33px на
 * 37px, то есть полоса этого блока переставала стоять в одну линию с полосами трёх соседних
 * (замерено `k17w1-shot.mjs` по левым кромкам всех секций страницы). Отвесная линия левых кромок —
 * несущая в этой системе, а 4px на неё не стоят ничего: по горизонтали грунт и так виден в
 * междурядьях, а под подписями и дверьми — во всю ширину группы.
 *
 * ⚠ ТОН — `bgSecondary` (#ededed), И ЭТО ЕДИНСТВЕННАЯ СВОБОДНАЯ КЛЕТКА СЛОВАРЯ. DESIGN.md: panel
 * «a fill, not a container… where a tint is wanted but a new box is not» — дословно этот случай.
 * Рамки у отсека нет намеренно: блок уже обведён, а вторая рамка внутри — это box-in-box, прямой
 * запрет системы. `bgZebra` (#fafafa) на белом не читается вовсе: 5 единиц яркости против 18.
 */
function Bay({ groupOf, children }: { groupOf?: number; children: React.ReactNode }): JSX.Element {
  return (
    <div
      data-deck-group={groupOf || undefined}
      className={cn('flex shrink-0 items-stretch gap-2 py-1', groupOf ? 'bg-bgSecondary' : '')}
    >
      {children}
    </div>
  );
}

/**
 * ═══ ПУНКТИРНАЯ ЯЧЕЙКА ЖИВОГО ПРОГОНА — ДЫРА ФОРМЫ ОТВЕТА (круг 19) ═════════════════════════════
 *
 * ⚠ ЭТО ДЕНЬГИ. До неё на FABRIC RENDER и на 3D в состоянии покоя не было НИ ОДНОГО признака того,
 * что прогон уже заказан: снекбар гаснет, кнопка возвращается в `GENERATE` в момент БРОНИ (её
 * `pending` — полёт мутации, а не прогона), а свёрнутая лента генераций больше не носит маркера
 * `run N now` по прямому слову владельца («в свернутом варианте GENERATION HISTORY должен быть
 * только текст GENERATION HISTORY и стрелочка и все»). Человек нажимал второй раз и покупал второй
 * прогон. ВОЗВРАЩАТЬ МАРКЕР В ШАПКУ ЛЕНТЫ НЕЛЬЗЯ — это ровно то, что снято; признак обязан стоять
 * там, где стоит ответ.
 *
 * ФОРМА ОТВЕТА, А НЕ ФРАЗА О НЁМ, и это дословный приём экрана паттернов (`PendingTile` в
 * `pattern/pattern-library.tsx`): прозаическая строка «a render is being made · 0:42 — it lands
 * below» ОБЕЩАЛА БЫ СЛОВАМИ место, стоя при этом не в нём. Дыра, занимающая в полосе ту самую
 * ячейку, в которую встанет готовая плита, говорит то же самое и соврать не может.
 *
 * ОТДЕЛЬНЫМ КОМПОНЕНТОМ РАДИ ХУКА: `useElapsed` тикает раз в секунду, и позванный в теле раздела
 * он перерисовывал бы вместе с собой ВСЮ полосу — каждую замощённую плитку, каждую открытую колоду.
 * Здесь он перерисовывает одну ячейку.
 *
 * ⚠ ЭКСПОРТИРУЕТСЯ РАДИ ВТОРОГО ХОЗЯИНА, А НЕ «НА ВСЯКИЙ СЛУЧАЙ» (B-24). Владелец потребовал,
 * чтобы правая половина полосы входа 3D показывала ТО ЖЕ, что этот раздел на FABRIC RENDER, — с
 * теми же органами. Дыра живого прогона — один из них, и второе её написание разошлось бы с этим
 * первым же круглым числом (пропорция кадра, слово состояния с провода, тик секунд).
 */
export function PendingCell({ run }: { run: common_DesignRun }): JSX.Element {
  const elapsed = useElapsed(run.startedAt ?? run.createdAt);
  return (
    <div data-outputs-pending={run.id ?? 0} className={cn('flex flex-col gap-1', CELL_WIDTH)}>
      {/* ПРОПОРЦИЯ — ТА ЖЕ, ЧТО У КАДРА ЗАНЯТОЙ ЯЧЕЙКИ (`STRIP_FRAME_ASPECT`), иначе дыра стоит
          в полосе выше или ниже своих соседей и подписи перестают лежать на одной линии. */}
      <Placeholder dashed className='w-full' style={{ aspectRatio: STRIP_FRAME_ASPECT }} />
      <Text size='nano' component='span' className='min-w-0 break-words text-warning'>
        <b>run {run.id ?? '—'}</b> · {elapsed || '0:00'}
      </Text>
      {/* СЛОВО СОСТОЯНИЯ — С ПРОВОДА (`pending` = в очереди, `running` = у провайдера), а не
          выдуманное. Оно же различает две вещи, которые дыра сама по себе не различает, и ничего
          не обещает про ЧИСЛО плиток: прогон рендера может попросить их несколько, и подпись
          «the render lands here» была бы обещанием единственного числа там, где его нет. */}
      <Text size='nano' variant='label' component='span'>
        {runStatus(run) || 'in flight'}
      </Text>
    </div>
  );
}

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
   * ═══ ДВЕРЬ `set` РАСКРЫТОЙ КОЛОДЫ — ТРИ СОСТОЯНИЯ, ТРИ ЗНАЧЕНИЯ (F-7) ═════════════════════
   *
   * `applyingRoot` — какой лист сейчас пишется (занятость АДРЕСНАЯ: общий `isPending` сказал бы
   * «saving» на всех сразу); `askingRoot` — какой лист ждёт подтверждения; `applyFailed` —
   * стороны, которые сервер не принял.
   *
   * ⚠ ХУКИ ВЫШЕ РАННЕГО ВЫХОДА, как и все остальные в этом файле (React #310).
   */
  const [applyingRoot, setApplyingRoot] = useState(0);
  const [askingRoot, setAskingRoot] = useState(0);
  /**
   * ⚠ ОТЧЁТ ОБ ОТКАЗЕ НОСИТ ИМЯ СВОЕЙ КОЛОДЫ, А НЕ ВИСИТ НАД ПОЛОСОЙ САМ ПО СЕБЕ.
   *
   * Без `root` он переживал и складывание своей колоды, и раскрытие ЧУЖОЙ: человек видел «press
   * set again» там, где кнопки `set` уже нет, а после открытия соседнего листа тот же красный
   * текст читался как отказ ЭТОГО листа и толкал применить не тот разрез. Это ровно тот класс,
   * где «строка отчёта, севшая на чужую строку, не путает её, а СТИРАЕТ»: отчёт обязан исчезать
   * вместе с тем, о чём он.
   */
  const [applyFailed, setApplyFailed] = useState<{
    root: number;
    list: { view: string; reason: string }[];
  }>({ root: 0, list: [] });

  /**
   * ═══ ДВЕРЬ «ПРИНЕСТИ СВОЮ МОДЕЛЬ» — ДВА УЗЛА В РАЗНЫХ МЕСТАХ ДОКУМЕНТА (E-13) ══════════════
   *
   * Хук, а не компонент, и по той же причине, по которой хуком отдаётся окно разреза строкой
   * выше: у двери есть ЯЧЕЙКА (внутрь полосы) и СООБЩЕНИЕ ОБ ОТКАЗЕ (над ней, во всю ширину
   * блока). Отказ здесь — текст в несколько предложений, и в колонке 132 пикселя он встаёт
   * красной стеной выше самого кадра; замерено снимком. Разбор целиком — в `../threed/model-upload-cell`.
   *
   * ⚠ ЗОВЁТСЯ БЕЗУСЛОВНО, ВЫШЕ РАННЕГО ВЫХОДА, как и все хуки этого файла: вызов под условием
   * рода менял бы их число между отрисовками и уносил бы всё дерево (React #310).
   */
  const bring = useBringOwnModel(techCardId);

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
   * ЖИВЫЕ ПРОГОНЫ ЭТОГО ЖЕ РОДА И ЭТОГО ЖЕ КОЛОРВЕЯ — ИСТОЧНИК ПУНКТИРНЫХ ЯЧЕЕК В ГОЛОВЕ ПОЛОСЫ.
   *
   * ЧИТАЕТСЯ ЗДЕСЬ, А НЕ ПРИНИМАЕТСЯ ПРОПОМ, в отличие от полки паттернов: там список уже держал
   * ВЫЗЫВАЮЩИЙ ради собственного `pending`, и второе чтение разошлось бы с ним на одном кадре.
   * Здесь вызывающих двое (`render-studio`, `threed-studio`), ни один из них такого списка не
   * держит, и проп означал бы одно и то же правило, написанное в двух чужих файлах.
   *
   * СУЖЕНИЕ — ТО ЖЕ, ЧТО У РЯДА: род и колорвей. Прогон соседнего цвета в этой полосе был бы
   * обещанием плитки, которая сюда не встанет (раздел сужен `colorwayId`), — то есть новой ложью
   * вместо закрытой.
   */
  const pending = useMemo(
    () => liveRunsOfKind(band, kind, colorwayId),
    [band, kind, colorwayId],
  );

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
   * ═══ КУСКИ РАЗРЕЗА, ПРИВЯЗАННЫЕ К СТОРОНАМ, — ВХОД `applyPlan` (F-7) ══════════════════════
   *
   * Берутся из `families.membersOf`, то есть из ТОГО ЖЕ списка, который экран и показывает
   * раскрытым. Второй источник («спросить у `splitDecks`») отвечал бы на соседний вопрос — «какие
   * листы этого рода вообще есть на карточке» — и разошёлся бы с тем, что человек видит, ровно в
   * тех случаях, ради которых дверь и нужна.
   *
   * Первый кусок на сторону: разрез — один на лист, а кусок без стороны силуэта (`detail`, пустой
   * вид) в слот не встаёт и в план не входит.
   */
  const piecesOf = (rootId: number): SplitPiece[] => {
    const seen = new Set<string>();
    const out: SplitPiece[] = [];
    for (const member of families.membersOf.get(rootId) ?? []) {
      const view = normaliseViewKey(member.ghostView);
      if (!isSilhouetteView(view) || seen.has(view)) continue;
      seen.add(view);
      out.push({ view: view as SilhouetteView, picture: member });
    }
    return out;
  };

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

  const writesOff = !!disabled || !speaks;

  /**
   * ═══ ПРИНЕСТИ СВОЮ 3D-МОДЕЛЬ (E-13) ═══════════════════════════════════════════════════════
   *
   * Владелец, дословно: «в 3D в 3D MODELS OF THIS CARD добавь возможность загрузить свою 3d
   * модель». Дверь — ячейка полосы (`useBringOwnModel`), и весь разбор «почему не `MediaSlot`»
   * живёт у неё; здесь решается только ГДЕ она стоит и КОГДА раздел существует.
   *
   * ⚠ ТОЛЬКО У 3D. Раздел один на два экрана, и `.glb` у рендеров — не файл этого рода: дверь
   * там предлагала бы положить модель в список цветных плит, откуда её нечем ни открыть, ни
   * поставить.
   *
   * ⚠ ПРИ ВЫКЛЮЧЕННОЙ ЗАПИСИ ЯЧЕЙКИ НЕТ ВОВСЕ, и это НЕ противоречит закону «отказ обязан быть
   * виден» двумя сотнями строк ниже. Тот закон про дверь, которая СТОИТ НА КАДРЕ и молча исчезла
   * бы вместе с наведением; здесь же не рисуется ЦЕЛАЯ ЯЧЕЙКА, ровно как `+ flat` в полосе входа
   * рендера (`{!disabled && …}`): человек видит не пропавшую кнопку, а список без места для
   * добавления — то же, что на всякой другой полосе этой карточки в режиме чтения.
   */
  const bringsOwnModel = kind === 'threed' && !writesOff;

  /**
   * ⚠ ПУСТОЙ РАЗДЕЛ БОЛЬШЕ НЕ ИСЧЕЗАЕТ, КОГДА В НЁМ ЕСТЬ ДВЕРЬ. Здесь стояло безусловное
   * `if (!rows.length) return null`, и с дверью оно прятало бы её ровно на той карточке, ради
   * которой она заведена: у карточки БЕЗ единой модели выходов нет, значит раздела нет, значит
   * принести свою некуда. Без двери правило остаётся прежним — пустой раздел, в котором нельзя
   * ничего сделать, это заголовок над пустотой.
   *
   * ⚠ И НЕ ИСЧЕЗАЕТ, КОГДА ИДЁТ ПРОГОН, — ЭТО ТРЕТИЙ ЧЛЕН И ОН ДЕНЕЖНЫЙ. Самый частый случай
   * первого прогона на карточке: выходов ноль, двери нет (у рендеров её нет никогда), и без этого
   * члена раздел вернул бы `null` — то есть пунктирная ячейка, ради которой всё это заведено,
   * пропала бы ровно на том экране, где второе нажатие и стоит вторых денег.
   */
  if (!rows.length && !bringsOwnModel && !pending.length) return null;

  // Does the binary that answered state the mark at all? With `EmitUnpopulated` a server that
  // knows the field sends it on EVERY picture (as `false` when unset), so one picture is a
  // truthful sample for all of them — and `undefined` means «rolled-back binary», against which
  // the verb's own route would 404 too, so the doors are drawn inert rather than collecting it.
  //
  // ⚠ БЕЗ ЕДИНОЙ СТРОКИ ОБРАЗЦА НЕТ, И ЭТО «НЕ СКАЗАНО», А НЕ «НЕ УМЕЕТ». Пустой список бывает
  // теперь и на живом сервере (раздел держится дверью), а `false` здесь читается ниже как
  // признание «бинарь старше поля» — то есть напечатал бы про откат на карточке, где просто ещё
  // нет моделей. Поэтому у самого признания стоит второе условие: строки.
  const carries = rows.length > 0 ? serverStatesSelected(rows[0].picture) : false;
  const marked = rows.filter((r) => pictureIsSelected(r.picture)).length;

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
        /* ⚠ БЕЗ `slotId`: он в одном `oneof` с `viewKey`, и ноль там — заданное поле, от
           которого сервер отвергал запись целиком. */
        slot: { viewKey: view, kind: 'render', colorwayId: bench },
        pictureId,
        expectedSlotRev: side.slotRev,
      },
      { onSettled: () => setMarking(null) },
    );
  };

  /**
   * ═══ `set` — ВХОД РЕНДЕРА СТАНОВИТСЯ РОВНО ЭТИМ РАЗРЕЗОМ (F-7) ════════════════════════════
   *
   * Владелец, дословно: «когда заэкспанжено кнопка set которая будет чистить текущие FABRIC
   * RENDER SLOTS и ставить те что в сплите».
   *
   * ⚠ ПЛАН СЧИТАЕТ ЧУЖОЙ МОДУЛЬ, И ЭТО РЕШЕНИЕ. `applyPlan` живёт в `render/apply-split.tsx`
   * вместе с дверью «apply splitted» двух полос входа — тот же глагол, те же три правила
   * (названную сторону ЗАНЯТЬ, неназванную занятую ОЧИСТИТЬ, неназванную пустую НЕ ТРОГАТЬ) и та
   * же нетривиальная причина: `slot_rev` — CAS-токен, и буквальное «сначала снять все, потом
   * положить» даёт ДВЕ записи на сторону, из которых вторая отказывает. Второе написание этих
   * правил разошлось бы с первым на первой же правке.
   *
   * ⚠ БЕЗ `slotId`. `view_key` и `slot_id` — ЧЛЕНЫ ОДНОГО `oneof`, и ноль в proto-JSON это
   * ЗАДАННОЕ поле: сервер отвечает «oneof … is already set» и не пишет НИ ОДНОЙ стороны. Форма
   * тела здесь ровно та же, что у `markInto` выше и у `bench.tsx:95`.
   *
   * ⚠ ОТКАЗ ОДНОЙ СТОРОНЫ НЕ ОСТАНАВЛИВАЕТ ОСТАЛЬНЫЕ: батча у глагола верстака нет, стороны
   * независимы, и брошенный цикл оставляет БОЛЬШЕ несогласованного, а не меньше.
   *
   * ═══ АДРЕСУЕТСЯ ВЕРСТАК СЕКЦИИ, А НЕ ВЕРСТАК ЛИСТА (F-7, круг 19) ═════════════════════════
   *
   * Здесь стояло `colorwayOf(sheet)` — колорвей ЛИСТА, — а блок, который человек в этот момент
   * видит, смонтирован колорвеем СЕКЦИИ (`FabricRenderSlots colorwayId={colorwayId}` в
   * `render-studio.tsx`). Пока два числа совпадают, разницы нет; расходятся они не гипотетически:
   * на сервере БЕЗ поля `outputs` список сужается колорвеем ПРОГОНА, а `colorwayOf(sheet)` читает
   * колорвей КАРТИНКИ, и загруженная плита с `run_colorway_id: 0` и собственным колорвеем ROSSO
   * проходит фильтр безымянной секции (разбор — у `outputsOfKind`, `render/model.ts`). Тогда `set`
   * писал В ВЕРСТАК, КОТОРОГО НА ЭКРАНЕ НЕТ: слоты ниже не менялись, кнопка отрабатывала молча и
   * «успешно», а стороны заполнялись у другого цвета. Молчаливая запись не в тот верстак — худший
   * из исходов, потому что она не оставляет следа даже в виде отказа.
   *
   * ПОДПИСЬ ДВЕРИ И ЕСТЬ ДОВОД: «the render input becomes exactly this split» — «the render input»
   * это блок ПОД ЭТОЙ СЕКЦИЕЙ, и обещание двери обязано указывать на него. `markInto` рядом
   * адресует верстак ПЛИТЫ, и это не разнобой: там жест называет одну плиту («поставь ВОТ ЭТУ»),
   * а сервер сверяет колорвей плиты с колорвеем слота (`colorway_mismatch`).
   *
   * ДВА ОТКАЗА ВМЕСТО ЗАПИСИ, ОБА СЛОВАМИ (`refusal`), И НИ ОДИН НЕ МОЛЧИТ:
   *   · секция не сужена колорвеем вовсе (`colorwayId === undefined`) — верстака, в который
   *     «надо», не существует как факта, и выбрать его за человека нельзя;
   *   · лист принадлежит ДРУГОМУ колорвею — сервер отверг бы каждую сторону по
   *     `colorway_mismatch`, а до починки мы бы вместо этого тихо заполнили чужой верстак.
   */
  const setStepsFor = (
    rootId: number,
  ): { bench: number; steps: ReturnType<typeof applyPlan>; refusal: string } => {
    const empty = { bench: 0, steps: [] as ReturnType<typeof applyPlan> };
    const sheet = rowById.get(rootId)?.picture;
    const pieces = piecesOf(rootId);
    // Шагов нет по составу разреза — причину говорит прежняя фраза двери, не эта.
    if (!sheet || !pieces.length) return { ...empty, refusal: '' };
    if (colorwayId === undefined)
      return {
        ...empty,
        refusal:
          'this section is not narrowed to a colourway, and a render bench is addressed by one — ' +
          'putting the split anywhere would fill a bench you are not looking at',
      };
    if (colorwayOf(sheet) !== colorwayOf({ colorwayId }))
      return {
        ...empty,
        refusal:
          'this sheet belongs to another colourway than the slots below, and a plate of one ' +
          'colourway cannot stand in the bench of another — the server refuses it outright. ' +
          'Open that colourway and set the split there.',
      };
    const bench = refColorwayFor('render', colorwayId);
    return { bench, steps: applyPlan(threedSides(band, bench), pieces), refusal: '' };
  };

  const runSet = async (rootId: number) => {
    const { bench, steps } = setStepsFor(rootId);
    if (!steps.length) return;
    setApplyingRoot(rootId);
    setApplyFailed({ root: rootId, list: [] });
    const failed: { view: string; reason: string }[] = [];
    for (const step of steps) {
      try {
        await setBenchSlot.mutateAsync({
          slot: { viewKey: step.view, kind: 'render', colorwayId: bench },
          pictureId: step.pictureId,
          expectedSlotRev: step.slotRev,
        });
      } catch (error) {
        // Причина берётся С ОТКАЗА, а не сочиняется: слова сервера — единственное, из чего
        // человек поймёт, повторять ему жест.
        failed.push({
          view: step.view,
          reason: (error as Error)?.message?.trim() || 'the server refused without saying why',
        });
      }
    }
    setApplyingRoot(0);
    // Полный успех не рапортуется: он ВИДЕН — стороны заполнились ниже, на этом же экране.
    setApplyFailed({ root: rootId, list: failed });
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
   * `deck` — «эта ячейка стоит ЛИСТОМ КОЛОДЫ, и вот раскрыта ли она». Свёрнутой её поверхность
   * раскрывает колоду вместо того, чтобы открыть просмотрщик (J-2, `PictureTile.onOpen`); зум при
   * этом не теряется — он остаётся угловой кнопкой, как и в ленте. Раскрытой поверхность снова
   * зумит, а складывает колоду объявленная дверь ряда (F-7/F-9, разбор у ряда `action`).
   */
  function cell(
    { picture, run, src, modelUrl }: Row,
    deck?: { open: boolean },
  ): JSX.Element {
    const deckSheet = !!deck && !deck.open;
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
        /* ═══ РЕЗАТЬ ПРЕДЛАГАЕТСЯ ТОЛЬКО ТАМ, ГДЕ РЕЗАТЬ ЕСТЬ ЧТО (F-8, F-18) ═════════════════
           Владелец, дословно: «на уже заспличеных картинках на ховер сплит писать не нужно так же
           как и на не мультивью картинках» и «везде где картинка не мультивью флет или рендер там
           не должно на ховер показываться сплит».

           ЗДЕСЬ СТОЯЛО ОБРАТНОЕ ПРАВИЛО, И ОНО БЫЛО ВЫВЕДЕНО ИЗ ДРУГОЙ ПРОСЬБЫ. Круг 4: «сделай
           везде одинаково включая кнопку сплит» — про ОДИНАКОВУЮ РАСКЛАДКУ органа (низ слева,
           один примитив), и этот файл прочитал её как «рисовать его на каждом кадре». Отсюда
           `split` на одиночном рендере, где он означал уже не разрез листа на виды, а произвольный
           кроп — второй смысл у одного слова.

           ДВА ЧЛЕНА ПРЕДИКАТА, И КАЖДЫЙ — СВОЙ ВОПРОС ЧЕЛОВЕКА:
             · «есть ли в этом файле несколько видов». Нет — резать нечего, и угол обещал бы кроп,
               которого этот экран не делает;
             · «а не разрезан ли он уже». Разрезан — жест другой и слово другое (`expand` / `set`
               в ряду дверей), а второй разрез того же листа завёл бы вторую колоду тех же видов.

           ⚠ ОБА ВОПРОСА ЗАДАЁТ ТЕПЕРЬ `pictureOffersSplit` (`render/model.ts`), И ЭТО НЕ КОСМЕТИКА.
           Этот файл был ЭТАЛОНОМ правила, но эталон, стоящий литералом, копируется, а копия рано
           или поздно теряет член: плитка референса предъявляла угол по `!readOnly && url`, то есть
           не сверялась ни с одним из двух. Здесь остались только вопросы, которые знает ТОЛЬКО
           этот экран, — род и право писать; «мультивью и не резан» спрашивается у общего предиката.
           У 3D угла нет по-прежнему: резать модель нечем, а её постер поглощён парой. */
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
          kind === 'render' && !writesOff && !modelUrl && pictureOffersSplit(picture, !!deck)
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
        /* ═══ ВТОРАЯ СТРОКА ПОДПИСИ СНЯТА — F-13, ДОСЛОВНО «убери текст "AI · run 26 · from mixed
           input"» ═══════════════════════════════════════════════════════════════════════════════
           Это `stripProvenance`, и снята она ЗДЕСЬ, а не в мире: тем же вызовом живут полоса входа
           рендера, полоса входа 3D и `what-model-gets` — там она отвечает на вопрос «а откуда
           взялось ТО, ЧТО СЕЙЧАС ПОЙДЁТ В ПРОГОН», и молчать об этом нельзя. Здесь же список —
           весь выход карточки, происхождение у всех строк одно и то же слово, и оно повторялось
           столько раз, сколько плиток на экране.
           Что при этом НЕ потеряно: номер прогона стоит первой строкой, и он же — единственный
           член провенанса, который на этом экране различает строки. */
        lines={[stamped ? `run ${run.id} · ${shape}` : `no run · ${shape}`]}
        /* ⚠ РЯД ПОД КАДРОМ РИСУЕТСЯ, ТОЛЬКО ЕСЛИ В НЁМ ЧТО-ТО ЕСТЬ (E-25). У здоровой ячейки 3D
           под карточкой теперь не должно быть НИЧЕГО — а пустой `<div>` это всё-таки орган:
           `StripCell` даёт ему свою отбивку, и ряд ячеек разъезжается по высоте оттого, у какой
           из них дверь жива. Единственные жильцы ряда — двери рендера (плашка/`split`/`mark ▸`) и
           ОТКАЗ пометки; живая пометка уехала на кадр. */
        action={
          kind === 'render' || (selectable && (!carries || writesOff)) ? (
          /* ⚠ `flex-wrap` СНЯТ ВМЕСТЕ С ПРИЧИНОЙ ПЕРЕНОСА. Переносить было что, пока ряд мог
             держать ДВА органа шириной 104px и 50px в колонке 132px; теперь живая дверь ровно
             одна на ячейку (`held` ИЛИ колода ИЛИ лист ИЛИ пометка), и единственный ряд из двух
             членов — раскрытая колода, где ширины заданы явно. Перенос при этом не «на всякий
             случай», а вредный: он МЕНЯЕТ ВЫСОТУ ячейки от её содержимого, то есть и есть то
             самое «кнопки скачут». Разбор метрики — у `DOOR_ROW` в шапке файла. */
          <div data-door-row='' className={DOOR_ROW}>
            {/* ═══ ДВЕРЬ В СЛОТ — ЗДЕСЬ, ГДЕ ЛЕЖИТ МАТЕРИАЛ (J-25) ═════════════════════════════
                Пять состояний, и каждое отвечает на СВОЙ вопрос человека:
                  · «в какой стороне это уже стоит» — читаемая плашка (Pill), не кнопка: сторону
                    освобождает ✕ на самой плите в FABRIC RENDER SLOTS, и второй глагол снятия
                    здесь был бы вторым реестром одного действия;
                  · «этот лист уже разрезан — где куски» — `expand ▸`, а раскрытым `set` + `▾`
                    (F-7, разбор у самой ветки);
                  · «этот лист ещё не разрезан» — живой `split ▸`;
                  · «почему дверь мертва» — карточка только читается либо сервер молчит;
                  · и сама постановка одиночного кадра — селект сторон.
                ⚠ АТРИБУТ ВИСИТ НА ОБЁРТКЕ, А НЕ НА `SelectComponent`: корень Radix разбирает
                ЗАКРЫТЫЙ список пропов, `data-*` до DOM не доезжает, и утверждение по нему было бы
                зелёным над отсутствующим узлом. Тот же приём, что у `ColorwaySelect`. */}
            {kind === 'render' &&
              (deck ? (
                /* ═══ РАЗРЕЗАННЫЙ ЛИСТ: `expand ▸` ЗАКРЫТЫМ, `set` + `▾` РАСКРЫТЫМ (F-7) ═══════
                   Владелец, дословно: «для уже сплитнутых … мы не должны показывать кнопку SPLIT ▸
                   тк оно уже заслитано надо писать экспанд или что-то вроде того пока оно не
                   открыто а когда заэкспанжено кнопка set которая будет чистить текущие FABRIC
                   RENDER SLOTS и ставить те что в сплите».

                   ЭТО ЖЕ МЕСТО ЗАБРАЛО ДВЕРЬ КОЛОДЫ. Под кадром стояла ВТОРАЯ строка — «▸ 3 CUT
                   PIECES», собственная дверь `CropDeck`, — и владелец назвал её визуальным мусором
                   (F-9). Мусором её делало соседство: два органа одного кадра на двух строках,
                   причём верхний («split ▸») врал, а нижний нёс единственный работающий глагол.
                   Теперь глагол один и стоит в ряду дверей, как у всех соседей; счёт кусков ушёл в
                   `title`, а раскрытая колода называет его собой — куски стоят рядом.

                   ⚠ СКЛАДЫВАЮЩАЯ ДВЕРЬ ОБЯЗАТЕЛЬНА, И ЭТО НЕ УКРАШЕНИЕ. `CropDeck` объявленно нем
                   при `hostDoor` (веер `aria-hidden`, поверхность листа тоже), поэтому без `▾`
                   раскрытую колоду нечем было бы закрыть ни с клавиатуры, ни читалкой — только
                   раскрыв ЧУЖУЮ. */
                deck.open ? (
                  <>
                    {/* ⚠ ОТКАЗ НАЗЫВАЕТ СЕБЯ СЛОВОМ, А НЕ СЕРОЙ КНОПКОЙ. Тот же закон, что у
                        `split ▸` и `mark ▸` двумя ветками ниже: выключенная дверь без причины
                        отправляет человека искать, что он сделал не так. */}
                    {/* ⚠ ПУСТОЙ ПЛАН — ЭТО ТОЖЕ ОТКАЗ, А НЕ ЖИВАЯ КНОПКА, КОТОРАЯ МОЛЧИТ.
                        Разрез законно даёт кусок БЕЗ стороны силуэта: человек мог вырезать деталь,
                        и `apply-split.tsx` говорит это прямым текстом («применить его некуда: он
                        не называет слот»). Тогда `piecesOf` пуст, `applyPlan` отдаёт ноль шагов, и
                        дверь, нарисованная живой, на нажатие не делала БУКВАЛЬНО НИЧЕГО — ни
                        запроса, ни ошибки, ни слова. Соседняя реализация того же глагола этот
                        случай закрывает (`if (!pieces.length) return null`); здесь он назван
                        причиной, потому что колода уже раскрыта и исчезнувшая дверь читалась бы
                        как пропажа.

                        ⚠ И ТРЕТИЙ ВИД ПУСТОГО ПЛАНА — КОЛОРВЕЙНЫЙ (круг 19): `setStepsFor` теперь
                        ОТКАЗЫВАЕТ вместо записи, когда верстак секции назвать нечем или лист чужого
                        цвета. Такой отказ несёт свои слова (`refusal`), и они встают ПЕРЕД общей
                        фразой про детали — иначе дверь объясняла бы отказ причиной, которой у него
                        нет, а это хуже молчания: человек пошёл бы резать лист заново. */}
                    {writesOff || !setStepsFor(picture.id ?? 0).steps.length ? (
                      <InertDoor
                        className='flex-1 [&>button]:h-5 [&>button]:w-full [&>button]:bg-bgColor'
                        label='set'
                        reason={
                          disabled
                            ? 'this card is read-only for you — putting the split into the sides is an edit of the card'
                            : !speaks
                              ? 'this server does not answer the design routes'
                              : setStepsFor(picture.id ?? 0).refusal ||
                                'nothing in this split names a side of the silhouette — the pieces are details, and a detail has no slot to stand in. Cut the sheet again and name front, back or a side on the frames.'
                        }
                      />
                    ) : (
                    <Button
                      variant='secondary'
                      size='xs'
                      className='h-5 flex-1 bg-bgColor'
                      loading={applyingRoot === (picture.id ?? 0)}
                      disabled={applyingRoot > 0}
                      data-set-split={picture.id || undefined}
                      onClick={() => {
                        const { steps } = setStepsFor(picture.id ?? 0);
                        if (!steps.length) return;
                        if (steps.some((s) => s.displaces)) setAskingRoot(picture.id ?? 0);
                        else void runSet(picture.id ?? 0);
                      }}
                      title={
                        'the render input becomes exactly this split: every side named by it takes ' +
                        'its piece, and every side it does not name is emptied'
                      }
                    >
                      set
                    </Button>
                    )}
                    {/* ⚠ ЭТО БЫЛ СЫРОЙ `<button>` — ЕДИНСТВЕННЫЙ КОНТРОЛ РЯДА МИМО `buttonVariants`,
                        и он один держал СВОЮ рамку, СВОЙ ховер и СВОЙ фокус, переписанные тут же
                        строкой классов. Пока их четыре штуки совпадали с примитивом на глаз, он
                        читался ровно; расходятся такие копии не «иногда», а при первой же правке
                        кнопки — то есть ряд разъезжается там, где никто не смотрел.
                        Квадрат 20×20 остаётся квадратом: `size='xs'` даёт метрику текста, а
                        `h-5 w-5 p-0` — саму клетку, в которой стоит один глиф. */}
                    <Button
                      variant='secondary'
                      size='xs'
                      className='h-5 w-5 shrink-0 bg-bgColor p-0'
                      aria-expanded
                      aria-label={`fold the pieces of render ${picture.ordinal ?? ''} back behind the sheet`.trim()}
                      data-deck-fold={picture.id || undefined}
                      title='fold these pieces back behind the sheet'
                      onClick={() => setOpenDeck(null)}
                    >
                      ▾
                    </Button>
                  </>
                ) : (
                  <Button
                    variant='secondary'
                    size='xs'
                    className={DOOR}
                    aria-expanded={false}
                    data-deck-expand={picture.id || undefined}
                    onClick={() => setOpenDeck(picture.id ?? 0)}
                    title={`${(families.membersOf.get(picture.id ?? 0) ?? []).length}${(families.membersOf.get(picture.id ?? 0) ?? []).length === 1 ? ' piece was' : ' pieces were'} cut from this sheet — open them as cards in this row`}
                  >
                    expand ▸
                  </Button>
                )
              ) : held ? (
                <span
                  data-mark-held={picture.id || undefined}
                  title={
                    `this render already stands in a slot of this card, and one plate stands in one slot: ` +
                    `the server refuses a second placement outright. Empty that side first — the ✕ on its ` +
                    `plate in FABRIC RENDER SLOTS.`
                  }
                  /* ⚠ САМЫЙ ЗАМЕТНЫЙ «СКАЧОК» РЯДА, И ОН БЫЛ У ЧИТАЕМОЙ ПЛАШКИ, А НЕ У КНОПКИ.
                     `Pill` — `inline-flex` по содержимому и 19px высотой (`py-px` без класса
                     высоты): в ряду, где каждый сосед занимает всю ширину ячейки и ровно 20px, она
                     сидела короткой и прижатой влево, и это читалось как «здесь что-то не
                     дорисовалось». Ширину даёт обёртка (`flex w-full` — сам `span` с `title` был
                     `inline`, то есть шириной по тексту), высоту и центровку — три класса на самой
                     плашке. Слово и тон не трогаются: это по-прежнему статус, а не дверь. */
                  className='flex w-full'
                >
                  <Pill className='h-5 w-full justify-center leading-4'>
                    in {viewLabel((held.viewKey ?? '').trim()) || 'a slot'}
                  </Pill>
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
                    className={INERT_DOOR}
                    label='split ▸'
                    reason={
                      disabled
                        ? 'this card is read-only for you — cutting a sheet writes new pictures onto the card'
                        : 'this server does not answer the design routes'
                    }
                  />
                ) : (
                  <span data-split-for={picture.id || undefined} className='flex w-full'>
                    <Button
                      variant='secondary'
                      size='xs'
                      className={DOOR}
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
                  className={INERT_DOOR}
                  label='mark ▸'
                  reason={
                    disabled
                      ? 'this card is read-only for you — putting a render into a side is an edit of the card'
                      : 'this server does not answer the design routes'
                  }
                />
              ) : (
                <span data-mark-for={picture.id || undefined} className='flex w-full'>
                  <SelectComponent
                    name={`mark-render-${picture.id}`}
                    value={MARK_PROMPT}
                    placeholder='mark ▸'
                    disabled={marking === (picture.id ?? 0)}
                    /* ⚠ СЕЛЕКТОР ПРИВОДИТСЯ К МЕТРИКЕ КНОПКИ, А НЕ НАОБОРОТ (F-9). `min-h-0`
                       обязателен: `min-height` и `height` — РАЗНЫЕ группы у twMerge, поэтому
                       `min-h-[22px]` примитива тихо победил бы `h-5` и селектор остался бы выше
                       соседней кнопки — ровно то, на что владелец и жалуется. Кегль тоже: поле
                       ввода говорит 12px строчными, ряд дверей — 10px прописными. */
                    className='h-5 min-h-0 py-0 text-micro uppercase tracking-label'
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
            {/* ⚠ `INERT_DOOR` НА ОБОИХ НЕЖИВЫХ СОСТОЯНИЯХ, И ЭТО ОДИН ДЕФЕКТ, А НЕ ДВА. Без него
                `InertDoor` — `inline-flex` по слову: «select» занимал бы 46px там, где живая дверь
                занимает всю ширину ячейки, и ряд ехал бы при КАЖДОЙ смене состояния той же самой
                двери. Разведка назвала первую ветку; вторая — та же дверь, и починить одну значило
                бы оставить скачок ровно между её состояниями. */}
            {!selectable ? null : !carries ? (
            <InertDoor className={INERT_DOOR} label='select' reason={SELECT_MARK_NOT_STATED} />
          ) : writesOff ? (
            <InertDoor
              className={INERT_DOOR}
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
      /* ОБЪЯВЛЕННЫЙ ЯКОРЬ КОРОБКИ — тем же приёмом, что `id='design-threed-generation'` у меню
         над ней. Он нужен именно ОТРИЦАТЕЛЬНЫМ утверждениям: «принесённую модель нельзя маркнуть
         ни в один слот» — это утверждение об ОТСУТСТВИИ органа, и без объявленной коробки оно
         одинаково зеленело бы и на снятой двери, и на пробе, смотрящей не туда. Класс для этого
         не годится: он переживает правку смысла. */
      id={kind === 'threed' ? 'design-threed-outputs' : 'design-render-outputs'}
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
      {selectable && rows.length > 0 && !carries && (
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

      {/* ⚠ ОТКАЗ ДВЕРИ СТОИТ НАД ПОЛОСОЙ, А НЕ В ЕЁ ЯЧЕЙКЕ. Ячейка — колонка в 132 пикселя, и
          фраза «модель 51 MB, потолок 50 MB, вот что делать» встаёт в ней красной стеной в восемь
          строк, выше самого кадра (замерено снимком). `CalloutBox` — тот орган системы, у которого
          на это есть ширина, и он не исчезает сам: «a callout stays until it is resolved». */}
      {bringsOwnModel && bring.notice}

      {/* ⚠ ОТКАЗ `set` СТОИТ НАД ПОЛОСОЙ, А НЕ В ЯЧЕЙКЕ, и по той же причине, что отказ модели
          абзацем выше: «сторона front — slot_rev mismatch» в колонке 132 пикселя встаёт красной
          стеной выше самого кадра. Стороны независимы, поэтому отчёт называет ИМЕНА, а не число:
          повторять жест человеку по одной. */}
      {applyFailed.list.length > 0 && applyFailed.root === openDeck && (
        <CalloutBox tone='error'>
          <Text
            size='micro'
            component='p'
            className='normal-case'
            data-set-failed={applyFailed.list.length}
          >
            <b>
              {applyFailed.list.length} side{applyFailed.list.length === 1 ? '' : 's'} of the input{' '}
              {applyFailed.list.length === 1 ? 'was' : 'were'} not written.
            </b>{' '}
            {applyFailed.list.map((f) => `${viewLabel(f.view)} — ${f.reason}`).join('; ')}. Nothing
            was undone: the sides are separate slots, and taking a good one back would be another
            write that can fail in its turn. Press <b>set</b> again — it reads the bench afresh.
          </Text>
        </CalloutBox>
      )}

      <Strip>
        {/* ═══ ДВЕРЬ СТОИТ ПЕРВОЙ, И ЭТО ЗАМЕР, А НЕ ВКУС (E-13) ══════════════════════════════
            Сервер отдаёт выходы `ORDER BY o.id DESC` — новейшее первым, — поэтому только что
            принесённая модель становится строкой НОЛЬ. Дверь в хвосте горизонтального скроллера
            уводила бы собственный ответ за край экрана: человек нажал, что-то произошло, и ничего
            не видно. Первой она к тому же НЕ ПЕРЕЕЗЖАЕТ между пустой и полной полосой — один орган
            стоит в одном месте, — и это ровно та позиция, что у `+ flat` в полосе входа рендера:
            голова того списка, в который она добавляет. */}
        {bringsOwnModel && <Bay>{bring.cell}</Bay>}
        {/* ═══ ЖИВОЙ ПРОГОН — В ГОЛОВЕ РЯДА, И ЭТО АДРЕС ОТВЕТА, А НЕ «НОВОЕ СВЕРХУ» ═══════════
            Сервер отдаёт выходы `ORDER BY o.id DESC`, значит вернувшаяся плита встанет строкой
            НОЛЬ — и дыра обязана стоять ровно там, иначе плита появится не на месте своей дыры.

            ПОСЛЕ ДВЕРИ «принести свою модель», А НЕ ПЕРЕД НЕЙ: у той стоит собственный замер
            («один орган стоит в одном месте», она не переезжает между пустой и полной полосой),
            и пустить дыру вперёд значило бы двигать дверь всякий раз, когда идёт прогон. */}
        {pending.map((run) => (
          <Bay key={`live-${run.id ?? run.startedAt ?? ''}`}>
            <PendingCell run={run} />
          </Bay>
        ))}
        {rows.map((row) => {
          const rootId = row.picture.id ?? 0;
          // Кусок рисуется ТОЛЬКО под своим листом — иначе закрытая колода показала бы его вопреки
          // собственной двери, а открытая дважды.
          if (families.rootOf.has(rootId)) return null;
          const members = families.membersOf.get(rootId) ?? [];
          const open = openDeck === rootId;
          if (!members.length) return <Bay key={rootId}>{cell(row)}</Bay>;
          return (
            <Bay key={rootId} groupOf={open ? rootId : 0}>
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
                /* Дверь колоды — в ряду дверей ячейки (`expand ▸` / `set` + `▾`), а не своей
                   строкой под кадром: F-9, разбор у ветки `deck` в `cell`. */
                hostDoor
              >
                {cell(row, { open })}
              </CropDeck>
              {open &&
                members.map((member) => {
                  const memberRow = rowById.get(member.id ?? 0);
                  return memberRow ? <Fragment key={member.id}>{cell(memberRow)}</Fragment> : null;
                })}
            </Bay>
          );
        })}
      </Strip>

      {/* ⚠ «ПУСТО» ГОВОРИТСЯ СЛОВОМ, И СЛОВО НАЗЫВАЕТ ВТОРОЙ ПУТЬ. Полоса из одной пунктирной
          ячейки читается как «сюда кладут модели», но НЕ отвечает на вопрос, который человек
          задаёт следующим: а разве их не делает генерация? Отвечает эта строка — один раз, без
          мастера и без уговоров. */}
      {rows.length === 0 && bringsOwnModel && (
        <Text
          size='micro'
          variant='label'
          component='p'
          data-outputs-empty=''
          /* ПРЕДЕЛ ДЛИНЫ СТРОКИ. Блок тянется во всю ширину монитора, и без потолка это полторы
             сотни знаков в строке — глаз теряет начало следующей. */
          className='max-w-[70ch] normal-case'
        >
          No model on this card yet. GENERATION — 3D builds one out of the marked render sides and
          charges for it; the cell on the left takes a .glb you already have, and costs nothing.
        </Text>
      )}

      {/* ОДНО ОКНО РЕЗА НА ВЕСЬ РАЗДЕЛ. Оно рисуется хуком и монтируется только когда цель
          выбрана; кадры размечает человек, а `for_input: false` уезжает на провод из самого хука
          (довод — у его вызова выше). */}
      {split.modal}

      {/* ═══ ВОПРОС ДВЕРИ `set` — ОДИН НА РАЗДЕЛ, ПО ИМЕНИ ЛИСТА (F-7) ═══════════════════════
          «Guard the irreversible» (PRODUCT.md): `set` очищает стороны, о которых разрез молчит, и
          вытесняет то, что стоит в названных. Вопрос задаётся ТОЛЬКО когда терять есть что —
          пустой путь этих людей не пáдят («wizard-style over-explained flows»), и решает это
          ветка `steps.some(s => s.displaces)` у самой двери.
          ⚠ ОКНО ОДНО, А НЕ ПО ОДНОМУ НА ЯЧЕЙКУ: булев флаг внутри ячейки открыл бы их разом над
          всеми листами — тот же довод, что у `VectorModal` ниже. */}
      {askingRoot > 0 &&
        (() => {
          const { steps } = setStepsFor(askingRoot);
          const places = steps.filter((s) => s.act === 'place');
          const clears = steps.filter((s) => s.act === 'clear');
          const losing = steps.filter((s) => s.displaces);
          return (
            <ConfirmationModal
              open
              onOpenChange={(next: boolean) => !next && setAskingRoot(0)}
              title='replace the whole render input with this split?'
              confirmLabel='replace the input'
              onConfirm={() => {
                const target = askingRoot;
                setAskingRoot(0);
                void runSet(target);
              }}
            >
              <div className='flex flex-col gap-2' data-set-ask={askingRoot}>
                <Text size='control' component='p' className='normal-case'>
                  {places.length > 0 && (
                    <>
                      <b>{places.map((s) => viewLabel(s.view)).join(', ')}</b> take the pieces of
                      this split.{' '}
                    </>
                  )}
                  {clears.length > 0 && (
                    <>
                      <b>{clears.map((s) => viewLabel(s.view)).join(', ')}</b>{' '}
                      {clears.length === 1 ? 'is' : 'are'} emptied — the split does not name{' '}
                      {clears.length === 1 ? 'that side' : 'those sides'}.
                    </>
                  )}
                </Text>
                <Text size='control' component='p' className='normal-case'>
                  {losing.length} of the sides {losing.length === 1 ? 'holds a render' : 'hold renders'}
                  right now, and {losing.length === 1 ? 'it goes' : 'they go'} out of the input:{' '}
                  {losing.map((s) => viewLabel(s.view)).join(', ')}. Nothing is deleted — every
                  picture stays on the card and can be put back one side at a time.
                </Text>
              </div>
            </ConfirmationModal>
          );
        })()}

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
