import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import type { JSX } from 'react';
import type { MediaViewerItem } from 'ui/components/media-viewer';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { PictureTile, type PictureTileAction } from '../picture-tile';
import { viewLabel } from '../views';

/**
 * ONE CELL OF AN INPUT STRIP — a frame, two caption lines and one action, at a fixed width.
 *
 * The two generative screens both open on a horizontal band of inputs, and they must be the same
 * band: the render's flats and the 3D's renders are read in the same glance, on the same baseline,
 * with the provenance in the same place. Two cell components would drift by a pixel and by a word.
 *
 * ═══ КАДР РИСУЕТ ОБЩИЙ ПРИМИТИВ `PictureTile`, И ЭТО ВЕСЬ ОТВЕТ НА T-8 ════════════════════════
 *
 * Владелец, дословно (круг 4, пункт 8): «зум кнопку на ховер картинки ТАК КАК У НАС ВЕЗДЕ СДЕЛАНО
 * и что бы можно было в зум вью по всем картинкам из всех генераций итерироваться не только этой
 * и сделай везде одинаково включая кнопку сплит нахуя ты делаешь везде по разному».
 *
 * Замер до этой правки: ячейка рисовала угол САМА (проп `corner`), а оба экрана, которые ею
 * пользуются, монтировали ПО СВОЕМУ `MediaViewer` со своим рядом — рядом из четырёх плит одного
 * экрана. То есть в FABRIC RENDER стрелка «дальше» упиралась в край полосы флэтов не по решению, а
 * потому что дальше ничего не было передано: ни референсов, ни истории, ни верстака. Это ровно тот
 * архитектурный дефект, который владелец и просил устранить, повторённый ещё в двух местах.
 *
 * Теперь кадр — `PictureTile`. Угол больше не рисуется здесь и не задаётся снаружи: раскладка
 * органов — решение примитива, а ячейка объявляет только КАДР ДЛЯ РЯДА (`gallery`). Ряд собирает
 * `PictureGalleryProvider`, смонтированный на всю студию (`studio-tab.tsx`), поэтому листается всё,
 * что на экране, в порядке документа — включая картинки соседних блоков.
 *
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ: пропа `corner`. Он был единственным способом поставить в эту ячейку
 * свой орган, и пока он существует, «сделать везде одинаково» остаётся задачей, которую можно
 * выполнить наполовину.
 *
 * THE FRAME IS A FIXED BOX AND THE PICTURE IS CONTAINED IN IT, which is deliberate and is the same
 * choice the bench makes. A frame cut to each picture's own proportions would give a strip of
 * ragged heights whose captions no longer line up, and the rule that a frame must match its
 * picture's ratio binds only where FRACTIONAL geometry is drawn over the frame — a callout at 0.5,
 * 0.16 lands in a different place on a letterboxed image than on a fitted one. Nothing fractional
 * is drawn here: the view badge and the corner organs are anchored to corners, so `object-contain`
 * inside a fixed box is honest. The moment a marker is placed on one of these frames, the box has
 * to become the picture's own ratio — and `media.thumbnail.width/height` is on the wire for it.
 */

/** Ширина ячейки ЧИСЛОМ. Класс ниже собран из неё же — колода кропов (J-23) считает по ней свою
 *  ширину и шаг веера, а второе написание «132» разъехалось бы с первым молча. */
export const STRIP_CELL_PX = 132;
export const CELL_WIDTH = 'w-[132px] shrink-0';
/** 132 × 148 — та же коробка, что была задана высотой, теперь сказанная пропорцией: `PictureTile`
 *  меряет кадр отношением сторон, а ячейка стоит в колонке шириной ровно 132px. */
export const STRIP_FRAME_ASPECT = '132/148';
const FRAME_ASPECT = STRIP_FRAME_ASPECT;
const FRAME_HEIGHT = 'h-[148px]';

export function StripCell({
  src,
  alt,
  /** Drawn in the top-left corner of the frame, filled ink — the view this picture stands for. */
  badge,
  /**
   * КАДР ЭТОЙ ЯЧЕЙКИ ДЛЯ ОБЩЕГО ПРОСМОТРЩИКА СТУДИИ. Есть — примитив сам рисует угловой `zoom` и
   * ставит картинку в общий ряд; нет — ячейка зума не обещает и в ряд не встаёт.
   *
   * Полный адрес, а не миниатюра `src`: миниатюра на сцене просмотрщика — это мыло, выданное за
   * увеличение, и человек читает его как испорченный файл.
   */
  gallery,
  /**
   * КАДР, КОТОРЫЙ ЭТА ЯЧЕЙКА ПРЕДЛАГАЕТ ВЗЯТЬ, — не тот, что уже стоит. Едет в разметку как
   * `data-offered` и служит якорем и пробам, и человеку в инспекторе: список кандидатов — это
   * ровно то, что волна G-1 фильтрует, а «какая плитка сейчас предложена» иначе читается только
   * по картинке. Ячейки ЛЕВОЙ половины полосы (то, что стоит в слоте) его не несут намеренно:
   * они адресуются своим слотом, а не картинкой.
   */
  /**
   * ПОВЕРХНОСТЬ КАДРА ОТКРЫВАЕТ НЕ ЗУМ, А ЭТО (J-2/J-23). Ставится ячейкой, которая стоит листом
   * СВЁРНУТОЙ колоды: первое нажатие раскрывает её. Зум остаётся угловой кнопкой примитива —
   * см. `PictureTile.onOpen`, где эта роль и живёт.
   */
  onOpen,
  /**
   * УГОЛ `split` НА КАДРЕ ЭТОЙ ЯЧЕЙКИ — тот же орган примитива, что на плите верстака и на
   * плитке ленты (владелец, круг 4: «сделай везде одинаково включая кнопку сплит»). Ячейка его не
   * рисует и раскладку не выбирает: она только объявляет, что резать здесь есть что.
   */
  onSplit,
  /**
   * ЯЧЕЙКА ТОЛЬКО ЧТО УВЕЛА РЯД В ПРОСМОТРЩИК (E-4). Извещение, а не дверь: зум по-прежнему
   * открывает сам примитив. Раздел, держащий открытую колоду, узнаёт факт и решает, складывать
   * ли её, — разбор целиком у `PictureTile.onZoom`.
   */
  onZoom,
  /**
   * УГОЛ ПОМЕТКИ (E-25). Владелец: «кнопки OPEN DOWNLOAD SELECT должны появляться на ховер на
   * карточку а не кнопками снизу». Ячейка, как и с `split`, объявляет только ЧТО здесь можно
   * сделать; где рисовать орган — решение примитива.
   *
   * ⚠ СЮДА ПЕРЕЕЗЖАЕТ ТОЛЬКО ЖИВАЯ ДВЕРЬ. Отказ («сервер не знает пометки», «карточка только для
   * чтения») обязан остаться ПОД кадром словами: этот файл уже платил за обратное — «Угол это
   * ТИХИЙ орган: он появляется по наведению, то есть отказ называл орган, которого на экране не
   * видно» (`render/outputs.tsx`, разбор двери `split first ▸`).
   */
  onSelect,
  /* Правка кадра — тот же угол, что и у сплита (E-3). Пробрасывается, а не решается здесь:
     кто имеет право править и что именно, знает раздел, а не ячейка. */
  onEdit,
  selectLabel,
  offeredPictureId,
  /**
   * КАКУЮ КАРТИНКУ ЯЧЕЙКА ПОКАЗЫВАЕТ. Едет в разметку как `data-cell-picture` и существует по той
   * же причине, что и `data-offered` рядом: у полосы выходов не было НИ ОДНОГО якоря, по которому
   * ячейку можно назвать, — только вёрстка, а вёрстка переживает правку смысла и делает пробу
   * зелёной над сломанным экраном. Здесь якорь несёт ещё и ответ: со времён H-9 раздел показывает
   * выходы всей карточки, и «какие именно» — это и есть проверяемое утверждение.
   */
  cellPictureId,
  /** Shown instead of the frame when there is no picture. */
  empty,
  emphasis,
  lines,
  action,
  className,
}: {
  src?: string;
  alt: string;
  badge?: string;
  gallery?: MediaViewerItem;
  onOpen?: () => void;
  onSplit?: PictureTileAction;
  onZoom?: () => void;
  onSelect?: PictureTileAction;
  onEdit?: PictureTileAction;
  selectLabel?: string;
  offeredPictureId?: number;
  cellPictureId?: number;
  empty?: React.ReactNode;
  /** The cell holds something the screen READS — a heavier frame, as on a filled bench slot. */
  emphasis?: boolean;
  lines: React.ReactNode[];
  action?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      data-offered={offeredPictureId || undefined}
      data-cell-picture={cellPictureId || undefined}
      className={cn('flex flex-col gap-1', CELL_WIDTH, className)}
    >
      {src ? (
        /* `contain`, never `cover`: these are DRAWINGS, and a crop of a flat loses the outline of
           the garment — the one thing the sheet is printed for. Белая подложка задаётся здесь, а не
           примитивом: при `contain` поля кадра иначе показывали бы серый грунт страницы. */
        <PictureTile
          url={src}
          alt={alt}
          badge={badge}
          aspect={FRAME_ASPECT}
          fit='contain'
          selected={emphasis}
          gallery={gallery}
          onOpen={onOpen}
          onZoom={onZoom}
          onSplit={onSplit}
          onSelect={onSelect}
          onEdit={onEdit}
          selectLabel={selectLabel}
          className='w-full bg-bgColor'
        />
      ) : (
        <div
          className={cn(placeholderClass({ dashed: true }), FRAME_HEIGHT, 'w-full px-1 text-center')}
          style={PLACEHOLDER_SURFACE}
        >
          {empty}
        </div>
      )}

      {lines.map((line, i) => (
        <Text key={i} size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {line}
        </Text>
      ))}

      {/* ЯКОРЬ РЯДА ДВЕРЕЙ. Заведён по той же причине, что `data-offered` и `data-cell-picture`
          выше: «под карточкой ничего не осталось» (E-25) — это утверждение о КОРОБКЕ, и держать
          его за css-класс раскладки значит проверять оформление вместо смысла. */}
      {action && (
        <div data-cell-doors='' className='mt-auto pt-0.5'>
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * ONE SLOT THAT HOLDS NOTHING — H-11.
 *
 * Владелец, дословно: «в FABRIC RENDER если мы не добавили одну INPUT — FLATS OF THIS CARD она
 * всегда должна отображатся пустым плейсхолдером».
 *
 * ЗАЧЕМ ЭТО ВООБЩЕ ОТДЕЛЬНАЯ ЯЧЕЙКА. Полоса рисовала ТОЛЬКО занятые слоты, поэтому карточка без
 * разметки открывалась голым разделителем: слоты, которых человек не видит, он читает не как
 * «пустые», а как «их нет», и следующий его вопрос — почему GENERATE мёртв. Пустая ячейка
 * отвечает на оба сразу: слот существует, он этого вида, и он пуст.
 *
 * ═══ ПУСТОЙ СЛОТ ПРИНИМАЕТ ФАЙЛ ПРЯМО ЗДЕСЬ (J-17) ═══════════════════════════════════════════
 *
 * Владелец, дословно: «во вкладке FABRIC RENDER если у нас эмпти слот его от сюда же можно
 * добавить из медиа селектора».
 *
 * ⚠ ЗДЕСЬ СТОЯЛО «ПИСАТЕЛЯ НЕТ НАМЕРЕННО: плейсхолдер, принимающий бросок, был бы ВТОРЫМ
 * написанием того же жеста». Довод записан целиком, чтобы его не восстановили как «было же
 * сказано», — и он БЫЛ НЕВЕРЕН в своей посылке. Второго написания нет: `mark ▸` справа от линии
 * берёт КАРТИНКУ, УЖЕ ЛЕЖАЩУЮ НА КАРТОЧКЕ (`SetDesignBenchSlot`), а эта дверь берёт ФАЙЛ ИЗ
 * МЕДИАТЕКИ и в ОДНОЙ транзакции заводит его в полосу и кладёт в слот
 * (`RegisterDesignUpload` + `target`). Два разных глагола на два разных предмета; до J-17 второй
 * приходилось исполнять в два приёма — «+ flat» слева, потом `mark ▸` справа, — и человек,
 * смотревший на пустой слот, не имел на нём ни одной двери вовсе.
 *
 * ДВЕРЬ — ТА ЖЕ, ЧТО НА ВЕРСТАКЕ (`bench-slot.tsx`), и это правило PRODUCT.md «one editor
 * grammar»: `MediaSlot` с той же приёмной модалкой (библиотека / ⌘V / бросок). Без обработчика
 * ячейка рисуется ровно как рисовалась — полоса входа 3D его не передаёт.
 *
 * СЛОВА — ТЕ ЖЕ, ЧТО У ВЕРСТАКА (`bench-slot.tsx`): жирное `empty`, красная приписка у
 * обязательной стороны и `*` у её имени. Один и тот же факт, сказанный на двух экранах двумя
 * словарями, заставляет искать между ними разницу.
 */
export function EmptyStripCell({
  view,
  required,
  onPlaceMedia,
}: {
  view: string;
  /**
   * Сторона, без которой прогон НЕ СТАРТУЕТ (`renderGate`: перед и спинка). Проп, а не проверка
   * внутри: обязательность — свойство ЭКРАНА, а не ячейки, и у полосы входа 3D она другая.
   */
  required?: boolean;
  /**
   * J-17: положить файл ИЗ МЕДИАТЕКИ прямо в этот слот. Не задан — ячейка мертва, как была
   * (полоса входа 3D и режим read-only).
   */
  onPlaceMedia?: (media: common_MediaFull) => void;
}): JSX.Element {
  const label = viewLabel(view) || view;
  return (
    <div
      data-slot-empty={view}
      data-slot-door={onPlaceMedia ? 'media' : undefined}
      className={cn('flex flex-col gap-1', CELL_WIDTH)}
    >
      {onPlaceMedia ? (
        /* Кадр СТАЛ дверью, а не получил дверь рядом с собой. Кнопка под полосатой коробкой
           означала бы два органа на один слот; коробка, которая и есть слот, принимает файл сама —
           ровно как пустая плита верстака. Имя вида при этом остаётся В ПОДПИСИ снизу, потому что
           лицо `MediaSlot` рисует своё («+ add front») и второе имя внутри кадра читалось бы как
           заголовок чужого органа. */
        <MediaSlot
          aspectRatio={['Custom']}
          frameAspect={FRAME_ASPECT}
          label={`+ add ${label}`}
          hint={null}
          purpose={`design · flat for the ${label} slot`}
          showVideos={false}
          editMode
          onSelect={(media) => {
            const first = media[0];
            if (first?.id) onPlaceMedia(first);
          }}
        />
      ) : (
        <div
          className={cn(
            placeholderClass({ dashed: true }),
            FRAME_HEIGHT,
            'w-full flex-col gap-0.5 px-1 text-center',
          )}
          style={PLACEHOLDER_SURFACE}
          title={`no drawing is marked for ${label}. Mark one from the right of the line, or generate one on FLAT.`}
        >
          {/* Имя вида — В ЦЕНТРЕ, а не угловым ярлыком, как на занятой плите: угловой ярлык на
              пустой полосатой коробке читается как забытая подпись, центр говорит «эта коробка
              целиком и есть слот такой-то». Цвет — `labelColor`: `textInactiveColor` (#ccc) в этой
              системе для рамок и заглушек, а не для текста, который читают. */}
          <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
            {label}
            {required && (
              <span className='text-error' title='the render needs it'>
                {' *'}
              </span>
            )}
          </Text>
        </div>
      )}

      <Text
        size='nano'
        component='span'
        className={cn('min-w-0 break-words', required ? 'text-error' : 'text-labelColor')}
      >
        <b>empty</b>
        {required ? ' · the render needs it' : ''}
      </Text>

      {onPlaceMedia && (
        <Text size='nano' variant='label' component='span'>
          ⌘V · drop · browse
        </Text>
      )}
    </div>
  );
}

/**
 * The scrolling band the cells sit in.
 *
 * `overflow-x-auto` ON ITS OWN CONTAINER, not on the page: a card with a dozen flats is exactly the
 * case this strip exists for, and a page that scrolls sideways to show it takes every other block
 * with it.
 */
export function Strip({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className='flex items-stretch gap-2 overflow-x-auto pb-1'>{children}</div>;
}

/** The vertical rule that separates «what the render reads» from «everything else on the card». */
export function StripDivider(): JSX.Element {
  return <span aria-hidden='true' className='w-px shrink-0 self-stretch bg-borderColor' />;
}
