import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import type { JSX } from 'react';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';

/**
 * ═══ ПЛИТКА НА ДВЕ ПОЛОВИНЫ — ОДИН ОРГАН НА ВСЕ ЛЕНТЫ ПОЛОСЫ ══════════════════════════════════
 *
 * Владелец, дословно (r2 п.16): «плейсхолдер как был — из двух частей: половина „из медиатеки“,
 * половина „draw“; разделён горизонтальной линией пополам, с пиктограммами». Тот же плейсхолдер
 * он потребовал во ФЛЭТ-СТОРОНАХ рендера (r2 п.28: «в каждый пустой плейсхолдер флэт-стороны —
 * выбрать картинку из медиа-селектора ИЛИ нарисовать»).
 *
 * ⚠ ПОЧЕМУ ЭТОТ ФАЙЛ ВООБЩЕ ЗАВЁЛСЯ. Волну r2 писали семь агентов параллельно, и два из них
 * (зона D — `references-section.tsx` / `bench-slot.tsx`, зона G — `render/strip-cell.tsx`)
 * начертили ОДИН И ТОТ ЖЕ орган по отдельности, каждый в своём файле: два `PenGlyph` с теми же
 * путями и две разные половины «draw». Кожа уже разъехалась — у зоны D одна пунктирная коробка с
 * линией посередине, у зоны G ДВЕ пунктирные коробки внахлёст на пиксель, — и это ровно то
 * расхождение, которое сам файл зоны G назвал запрещённым и просил свести после волны. Сведено
 * сюда, в `core`: одна коробка, одна линия, одно перо. Форма выбрана зоны D — она и есть та, что
 * владелец описал словами («разделён горизонтальной линией пополам»).
 *
 * ДВЕ ДВЕРИ В ОДНУ КОМНАТУ, А НЕ ПЛИТКА С КНОПКАМИ. Верх — `MediaSlot` как он есть: клик в
 * библиотеку, ⌘V, бросок файла и фотоглиф живут ВНУТРИ примитива, и второго их написания здесь не
 * заводится. Низ — перо и глагол на той же полосатой поверхности. Обе половины заводят ОДИН
 * предмет — картинку в этот слот, — поэтому рамку несёт коробка, а не половины по отдельности.
 */

/**
 * Перо нижней половины — тем же штрихом и в той же коробке 24×24, что фотоглиф верхней у
 * `MediaSlot`: две половины одной плитки обязаны читаться одной парой «знак + глагол».
 */
function PenGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden
      width={20}
      height={20}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
      className={cn('shrink-0', className)}
    >
      <path d='M4.5 19.5 6 14.5 16.5 4l3.5 3.5L9.5 18z' />
      <path d='M14.5 6l3.5 3.5' />
      <path d='M6 14.5l3.5 3.5' />
    </svg>
  );
}

/** Лицо половины — общее для верхней и нижней, чтобы «знак + глагол» стояли на одной высоте. */
export const HALF_FACE =
  'flex h-full w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 px-2 ' +
  'text-center text-micro uppercase tracking-label text-labelColor hover:text-textColor ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';

/**
 * Деление коробки НАДВОЕ — ГЕОМЕТРИЕЙ, А НЕ ВЕРОЙ. `<button>` меряется по содержимому, а у
 * элемента грида `min-height: auto`: без нулевого минимума собственные пропорции кнопки слота
 * (4/5) распирают строку, и «половина» перестаёт быть половиной (замерено: 366 против 162 у
 * заполненной ячейки). Поэтому размер живёт на КОРОБКЕ, а строки просто делят её пополам.
 */
const SLOT_HALVES: React.CSSProperties = { display: 'grid', gridTemplateRows: '1fr 1fr' };

/**
 * ═══ ОДИН ФАКТ — ОДНА ФРАЗА, А ВЫЗЫВАЮЩИЙ ДАЁТ ТОЛЬКО СУЩЕСТВИТЕЛЬНОЕ ════════════════════════
 *
 * Факт у всех четырёх лент один: перо открывает редактор на чистой плите, и нарисованное встаёт
 * ТУДА, откуда перо нажали. До этой правки он был написан ЧЕТЫРЬМЯ РАЗНЫМИ фразами («…takes this
 * slot», «…joins the input», «draw front from nothing — saving puts the drawing straight into
 * this slot», плюс мёртвое умолчание). Четыре редакции одного обещания — это четыре места, где
 * оно разойдётся, и на трёх экранах из четырёх человек читал бы про чуть-чуть другое поведение.
 *
 * ПОЭТОМУ ПРЕДЛОЖЕНИЕ ЖИВЁТ ЗДЕСЬ, А ЛЕНТА НАЗЫВАЕТ ТОЛЬКО АДРЕС: `this slot`, `the input`.
 * Существительное — единственное, что у лент действительно различается.
 */
const drawTitle = (into: string): string =>
  `opens the picture editor on a blank plate; what you draw goes into ${into}`;

/**
 * НИЖНЯЯ ПОЛОВИНА ПЛЕЙСХОЛДЕРА — «нарисовать». Отдельный экспорт потому, что ВЕРХНЮЮ половину на
 * разных лентах держат разные коробки (квадрат референса, кадр верстака, плита стороны), а нижняя
 * везде одна и та же: второе её начертание разъехалось бы с первым в первый же день.
 */
function DrawHalf({
  label,
  into = 'this slot',
  onClick,
  anchor,
  ariaLabel,
  className,
  ...rest
}: {
  label: string;
  /**
   * КУДА встанет нарисованное — существительным, а не целой фразой: предложение пишет
   * `drawTitle` один раз на всю студию (разбор у него).
   */
  into?: string;
  onClick: () => void;
  /** Якорь пробы: чем эта половина является на своём экране. */
  anchor?: string;
  /** Шесть половин с надписью «draw» в одной ленте неразличимы на слух — здесь их различают. */
  ariaLabel?: string;
  className?: string;
  [k: `data-${string}`]: unknown;
}): JSX.Element {
  return (
    <button
      type='button'
      data-draw-half={anchor ?? ''}
      {...rest}
      aria-label={ariaLabel}
      title={drawTitle(into)}
      onClick={onClick}
      style={{ minHeight: 0 }}
      className={cn(HALF_FACE, 'border-t border-dashed border-borderColor', className)}
    >
      <PenGlyph />
      <span className='leading-tight'>{label}</span>
    </button>
  );
}

/**
 * ═══ ЦЕЛАЯ ПУСТАЯ ПЛИТКА НА ДВЕ ПОЛОВИНЫ — ОДИН ОРГАН НА ВСЕ ТРИ ЛЕНТЫ ══════════════════════════
 *
 * ⚠ ДО r3 ЭТА ПЛИТКА БЫЛА СОБРАНА ТРИЖДЫ, и это ровно тот дефект, ради которого файл заводился.
 * Здесь стояла коробка ТОЛЬКО с ростом в пикселях (флэт-стороны рендера), а две другие ленты
 * собирали ту же пару половин у себя: `OneMoreCell` в `references-section.tsx` (квадрат 1:1,
 * множественный выбор, состояние «вход полон») и `EmptyCell` в `bench-slot.tsx` (квадрат 1:1 плюс
 * подвал с именем стороны и слово `empty` на выпущенной карточке). Три написания одной плитки —
 * это три места, где она разъедется: в волне r2 кожа уже разъехалась на пиксель, и разъезд увидел
 * только тот, кто держал два экрана рядом.
 *
 * ПОЭТОМУ РАЗЛИЧИЯ ЛЕНТ СТАЛИ ПРОПАМИ, А НЕ ПОВОДОМ ФОРКНУТЬ ПЛИТКУ. Их ровно четыре, и каждое —
 * факт о ленте, а не вкус:
 *   · КАК МЕРЯЕТСЯ КОРОБКА. `heightPx` — рост числом (лента сторон рендера: плита обязана совпасть
 *     с занятой ячейкой СОСЕДА, а сосед меряется не собой); `aspect` — пропорция (референсы и
 *     верстак флэтов: коробка меряется своей шириной). Ровно одно из двух.
 *   · ПОДВАЛ (`cap`). У верстака флэтов под кадром стоит имя стороны со звёздочкой — третье
 *     слагаемое его высоты 162; у двух других лент подвала нет вовсе.
 *   · ВМЕСТО ПОЛОВИН (`instead`). «the input is full» и «empty» — это СОСТОЯНИЕ КОРОБКИ, а не
 *     другая коробка: рамка, кадр и подвал остаются на месте, дверей просто нет.
 *   · ЛИЦО ВЕРХНЕЙ ПОЛОВИНЫ (`mediaLabel`). У сторон это `+ front`, у верстака — `from media`
 *     (имя стороны уже напечатано в подвале, и «+ front» повторял бы его в двух сантиметрах), у
 *     входа — `+ reference`. Умолчание — `+ {label}`.
 *
 * ЯКОРЯ ПРОБ ПЕРЕЖИВАЮТ СВЕДЕНИЕ: `data-place-or-draw` на коробке и `data-draw-half` на пере
 * стоят здесь, а имя ленты (`data-ref-placeholder`, `data-bench-empty`, `data-side-flat-door`)
 * приезжает от вызывающего через `...rest`.
 */
export function PlaceOrDrawCell({
  /**
   * ЧИСТОЕ ИМЯ СЛОТА, БЕЗ «+». Плюс — это лицо ВЕРХНЕЙ половины (двери в библиотеку), и ставит
   * его орган, а не вызывающий: с `label="+ front"` речь читала «draw — + front», то есть
   * зачитывала читалке пунктуацию чужой кнопки как часть имени стороны.
   */
  label,
  heightPx,
  aspect,
  mediaLabel,
  showGestures,
  purpose,
  onSelect,
  onSelectAll,
  onDraw,
  drawLabel = 'draw',
  drawAriaLabel,
  /** Адрес нарисованного — существительным; предложение пишет `drawTitle`. */
  into,
  cap,
  instead,
  topAligned,
  role,
  ariaLabel,
  className,
  ...rest
}: {
  label: string;
  /** Рост коробки в пикселях: она обязана совпадать с занятой плитой соседней ячейки. */
  heightPx?: number;
  /** ИЛИ пропорция кадра (`'1/1'`) — там, где коробка меряется своей шириной. */
  aspect?: string;
  /** Лицо верхней половины; умолчание — `+ {label}`. */
  mediaLabel?: string;
  /**
   * Печатать ли под лицом строку жестов примитива («⌘V · drag a file · click to browse»).
   *
   * ⚠ УМОЛЧАНИЕ — МОЛЧАТЬ, и это не вкус. У ленты сторон рендера коробка ростом в 96px, и третья
   * строка в ней съедала половину пера. Владелец назвал строку жестов частью плейсхолдера ровно
   * там, где для неё есть место (r2 п.16, вход и верстак флэтов) — эти две ленты её и просят.
   */
  showGestures?: boolean;
  purpose: string;
  /** Первая выбранная картинка. Ленты, берущие по одной, дают только его. */
  onSelect?: (media: common_MediaFull) => void;
  /** Множественный выбор: получает ВЕСЬ список. Задан — верхняя половина принимает пачку. */
  onSelectAll?: (media: common_MediaFull[]) => void;
  /** Нет пера — верхняя половина занимает кадр целиком (лента, где рисовать нечем). */
  onDraw?: () => void;
  drawLabel?: string;
  /** Шесть половин с надписью «draw» в одной ленте неразличимы на слух — здесь их различают. */
  drawAriaLabel?: string;
  into?: string;
  /** Подвал под кадром — имя слота и звёздочка обязательной (верстак флэтов). */
  cap?: React.ReactNode;
  /** Слово состояния ВМЕСТО половин: «the input is full», «empty». Коробка остаётся своя. */
  instead?: React.ReactNode;
  /** Не растягивать коробку по строке грида: её рост задаёт пропорция, а не сосед. */
  topAligned?: boolean;
  role?: string;
  ariaLabel?: string;
  className?: string;
  [k: `data-${string}`]: unknown;
}): JSX.Element {
  const halved = !instead && !!onDraw;
  return (
    <div
      {...rest}
      data-place-or-draw=''
      role={role}
      aria-label={ariaLabel}
      /* Рост — ИНЛАЙНОМ: стенд читает CSS готовой сборки, где произвольного класса, которого не
         было в дереве на момент сборки, нет вовсе (замерено на `h-[calc(50%+1px)]`). */
      style={{ ...(heightPx != null ? { height: heightPx } : null), ...(topAligned ? { alignSelf: 'start' } : null) }}
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden border border-dashed border-borderColor',
        className,
      )}
    >
      {/* ═══ КАДР — ТО, ЧТО ДЕЛИТСЯ ПОПОЛАМ. Полосатая поверхность живёт ЗДЕСЬ, а не на коробке:
          подвал под кадром — белая полка с именем, и полоски под ним читались бы как вторая
          пустая ячейка. Нулевой минимум несущий: у элемента флекса `min-height: auto`, то есть
          содержательная высота кнопки слота (её собственные пропорции 4/5) перебивает и
          пропорцию кадра, и деление надвое — замерено, 366 против 162 у заполненной ячейки. */}
      <div
        style={{
          ...PLACEHOLDER_SURFACE,
          minHeight: 0,
          ...(aspect ? { aspectRatio: aspect } : { flex: '1 1 auto' }),
          ...(halved ? SLOT_HALVES : null),
        }}
        /* ⚠ ПОЛЯ И ЦЕНТРИРОВАНИЕ ТЕКСТА — ТОЛЬКО СЛОВУ СОСТОЯНИЯ. Кадр без пера (ячейка, которой
           рисовать нечем) отдан слоту медиа целиком: `px-2` там вжал бы кнопку на 8px с каждой
           стороны, то есть сузил бы саму дверь. */
        className={cn(
          !halved && 'flex items-center justify-center',
          instead && 'px-2 text-center',
        )}
      >
        {instead ?? (
          <>
            {/* ⚠ ОБЁРТКА С НУЛЕВЫМ МИНИМУМОМ НЕСУЩАЯ, А НЕ УБОРКА — см. разбор у `SLOT_HALVES`. */}
            <div style={{ minHeight: 0, overflow: 'hidden' }} className='min-w-0'>
              <MediaSlot
                aspectRatio={['Custom']}
                /* «+» ЖИВЁТ ЗДЕСЬ — на лице двери, а не в имени слота: имя едет ещё и в речь. */
                label={mediaLabel ?? `+ ${label}`}
                hint={showGestures ? undefined : null}
                purpose={purpose}
                showVideos={false}
                allowMultiple={!!onSelectAll}
                editMode
                onSelect={(media) => {
                  if (onSelectAll) {
                    onSelectAll(media);
                    return;
                  }
                  const first = media[0];
                  if (first?.id) onSelect?.(first);
                }}
                sizeClassName='h-full w-full'
                className='border-0'
              />
            </div>
            {onDraw && (
              <DrawHalf
                data-place-or-draw-pen=''
                anchor={label}
                label={drawLabel}
                ariaLabel={drawAriaLabel ?? `${drawLabel} — ${label}`}
                into={into}
                onClick={onDraw}
              />
            )}
          </>
        )}
      </div>
      {cap}
    </div>
  );
}
