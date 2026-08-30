import { cn } from 'lib/utility';
import type { JSX, ReactNode } from 'react';
import { ANNOTATION_EDITOR_H } from 'ui/components/annotation/editor';
import { AnnotationToolbar, placingHint } from 'ui/components/annotation/toolbar';
import Text from 'ui/components/text';

/**
 * ПОЛОСА УКАЗАНИЙ — `annStripHtml` прототипа (`proto.html:2800`), ровно две половины:
 * ряд чипов-видов сверху и корпус редактора под ним.
 *
 * ВТОРОГО ГЕОМЕТРИЧЕСКОГО ДВИЖКА ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. Постановка, ручки, дуга по трём точкам
 * и память пера живут в `ui/components/annotation/*` — этот файл не знает о них ничего и ничего не
 * рисует на кадре. Он складывает два ГОТОВЫХ органа: `AnnotationToolbar` (реестр видов) и слот, в
 * который вызывающий кладёт `AnnotationEditor` выбранного указания. Ровно та же пара стоит внутри
 * `FocusedAnnotator`; полоса вынесена отдельно для поверхностей, которые НЕ галерея — лист
 * ARTIFACTS со своей сеткой плит.
 *
 * ВЫСОТА ПОЛОСЫ ПОСТОЯННА, И ЭТО НЕСУЩЕЕ, А НЕ ОФОРМЛЕНИЕ (П1 прототипа, и его же гейт:
 * `qa-proto.mjs` меряет `#annstrip-mood` ДО и ПОСЛЕ нажатия чипа и требует равенства). Обе половины
 * стоят в потоке НАД рядом кадров: полоса, которая растёт при выборе вида или при выборе указания,
 * двигает вниз все картинки — то самое «экран дёргается, когда нажимаешь на колаут». Поэтому:
 *
 *   • ряд чипов — фиксированные 26px с обрезкой (так же, как `proto.css:.annstrip .chips`);
 *     подсказка постановки и чип «cancel» появляются ВНУТРИ этой высоты, а не под ней;
 *   • корпус редактора — всегда `ANNOTATION_EDITOR_H`, пустой он или занятый. Пустым он не
 *     пустует: грамматика выбора написана ровно там, где ею пользуются.
 *
 * ЧИПЫ ЛИБО ЖИВЫЕ, ЛИБО МЁРТВЫЕ С ПРИЧИНОЙ (`inert`). Нарисованный ряд видов, который ничего не
 * ставит, — это обещание жеста: в этой полосе такое уже стоило разбирательства. Поверхность, на
 * которой указание поставить НЕЛЬЗЯ (плита верстака до минта — её медиа карточка ещё не держит),
 * обязана сказать это словами и `data-inert`, а не показать восемь работающих на вид кнопок.
 */

/** Высота ряда чипов, px. Экспортируется по той же причине, что `ANNOTATION_EDITOR_H`: тот, кто
 *  резервирует под полосу место, обязан знать её целиком. */
export const ANNOTATION_CHIPS_H = 26;

const DEFAULT_EMPTY =
  'no callout selected — click a pin or a line on a frame · Backspace deletes it · Enter opens this editor';

export function AnnotationStrip({
  tool,
  onTool,
  kinds,
  placed = 0,
  remaining,
  editor,
  emptyHint,
  inert,
  className,
}: {
  /** Вооружённый вид, `null` — рука свободна. Состояние принадлежит поверхности, не полосе. */
  tool: string | null;
  onTool: (kind: string | null) => void;
  /** Виды, доступные на этой поверхности. Не задано — весь реестр. */
  kinds?: string[];
  /** Сколько якорей уже набрано в НЕЗАВЕРШЁННОЙ фигуре — из этого строится подсказка постановки. */
  placed?: number;
  /** Сколько указаний ещё влезет на кадр; 0 — панель уступает место объяснению. */
  remaining?: number;
  /** Редактор выбранного указания. Не задан — в корпусе стоит подсказка, но корпус остаётся. */
  editor?: ReactNode;
  /** Чем занят корпус, когда ничего не выбрано. */
  emptyHint?: string;
  /** Полоса нарисована и намеренно мертва — причина едет и в `data-inert`, и в текст. */
  inert?: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* РЯД ВИДОВ. Обрезка, а не перенос: перенос на вторую строку — это и есть рост полосы. */}
      <div
        className='flex shrink-0 items-center overflow-hidden'
        style={{ height: ANNOTATION_CHIPS_H }}
      >
        {inert ? (
          <span data-inert={inert} title={inert} className='min-w-0'>
            <Text size='micro' variant='label' component='span' className='block truncate'>
              {inert}
            </Text>
          </span>
        ) : (
          <AnnotationToolbar
            tool={tool}
            onTool={onTool}
            kinds={kinds}
            remaining={remaining}
            hint={
              tool
                ? placed > 0
                  ? placingHint(tool, placed)
                  : 'click on the picture you need'
                : undefined
            }
          />
        )}
      </div>

      {/* КОРПУС РЕДАКТОРА — зарезервирован, а не появляется.
          РЕЗЕРВ ЕСТЬ ТОЛЬКО У ЖИВОЙ ПОЛОСЫ, и это не исключение из правила, а само правило: резерв
          заведён против сдвига кадров ПРИ ПРАВКЕ — выбрал указание, вдвинулось полтораста пикселей,
          все картинки уехали вниз. Там, где правки нет вовсе (`inert`), сдвигать нечего, а пустая
          рамка «ничего не выбрано» на экране, который только что сказал «здесь не рисуют», — это
          полтораста пикселей, обещающих выбор. */}
      {!inert && (
        <div className='shrink-0 overflow-hidden' style={{ height: ANNOTATION_EDITOR_H }}>
          {editor ?? (
            <div className='flex h-full items-center border border-dashed border-borderColor px-1.5'>
              <Text size='micro' variant='label' component='span'>
                {emptyHint ?? DEFAULT_EMPTY}
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
