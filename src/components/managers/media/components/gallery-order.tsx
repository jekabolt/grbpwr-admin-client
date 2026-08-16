import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Pill } from 'ui/components/pill';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import Text from 'ui/components/text';
import {
  calculateAspectRatio,
  cropLoss,
  isKnownAspectRatio,
  matchesSlotRatio,
} from '../utils/calculate-aspect';

// ПОРЯДОК КАДРОВ В ФОРМЕ — ОДИН МОДУЛЬ НА ВСЕ ГАЛЕРЕИ.
//
// Порядок здесь несёт смысл: первый кадр становится обложкой (модель, семпл, карточка задачи),
// остальные показываются покупателю ровно в том порядке, в каком лежат. Переставить их до сих пор
// было нельзя НИГДЕ, кроме полосы кадров на шаге операции, — единственный способ поменять порядок
// состоял в том, чтобы удалить кадр и добавить заново последним. Отсюда этот модуль: ручка мышью,
// стрелки с клавиатуры и возврат убранного живут в одном месте, а не переписываются в каждой
// галерее по-своему.
//
// ДВА ПУТИ К ОДНОМУ ДЕЙСТВИЮ, ПОТОМУ ЧТО МЫШЬ — НЕ ЕДИНСТВЕННЫЙ УКАЗАТЕЛЬ. Перетаскивание не
// доступно с клавиатуры вовсе, поэтому ручка ⠿ намеренно НЕ является кнопкой (лишняя остановка
// табуляции, которая ничего не умеет), а стрелки ← → — настоящие кнопки с подписями.

/** Переложить элемент: вынуть из `from` и вставить на место `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = items.slice();
  const [it] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, it);
  return next;
}

/**
 * ЧТО ИМЕННО ТАЩАТ — ФАЙЛ ИЛИ ПЛИТКУ — ЧИТАЕТСЯ ИЗ САМОГО ЖЕСТА, А НЕ ИЗ СОСТОЯНИЯ ГАЛЕРЕИ.
 *
 * Состояние знает только про СВОЮ перестановку, а на экране галерей бывает две рядом (архив
 * держит две медиа-линии): плитку тащат из первой, у второй `active` равен false, и она обещает
 * приём файла жесту, в котором файла нет. `dataTransfer.files` во время `dragover` ещё пуст —
 * браузер отдаёт содержимое только на `drop`, — а вот `types` читаются на любом шаге.
 */
export const isFileDrag = (e: React.DragEvent | DragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

export type ReorderApi = {
  /**
   * Кадр тащат ИЗ ЭТОГО экземпляра.
   *
   * НЕ ГОДИТСЯ как сторож приёма файлов: рядом бывает вторая такая же галерея, и её плитка едет
   * при `active === false` здесь. Приём файла решается по содержимому жеста — `isFileDrag`.
   */
  active: boolean;
  /** Индекс плитки, на которую ляжет кадр. */
  overIndex: number | null;
  registerTile: (index: number) => (el: HTMLElement | null) => void;
  handleProps: (index: number) => Record<string, unknown>;
  tileProps: (index: number) => Record<string, unknown>;
  cancel: () => void;
};

/**
 * Перетаскивание плитки мышью. Тащат за ручку, а роняют на любую плитку: кадр занимает её место.
 *
 * Все события перестановки ОСТАНАВЛИВАЮТСЯ на плитке (`stopPropagation`). Галерея снаружи слушает
 * бросок ФАЙЛА и, увидев всплывший `dragover`, зажгла бы рамку «отпусти файл» посреди перестановки —
 * жест один, а обещаний два.
 */
export function useReorder(onMove: (from: number, to: number) => void): ReorderApi {
  const [from, setFrom] = useState<number | null>(null);
  const [overIndex, setOver] = useState<number | null>(null);
  const tiles = useRef<(HTMLElement | null)[]>([]);
  const setters = useRef(new Map<number, (el: HTMLElement | null) => void>());

  const cancel = useCallback(() => {
    setFrom(null);
    setOver(null);
  }, []);

  /**
   * Ref-колбэк на плитку ОДИН И ТОТ ЖЕ между рендерами.
   *
   * React сравнивает ref-колбэк по ссылке: новая функция на каждом рендере значит «отцепись от
   * старого узла и прицепись к новому» — то есть вызов с `null` и следом вызов с элементом на
   * КАЖДОЙ плитке галереи при любом изменении формы. Здесь колбэк хранится по индексу и переживает
   * рендер.
   */
  const registerTile = useCallback((index: number) => {
    let setter = setters.current.get(index);
    if (!setter) {
      setter = (el: HTMLElement | null) => {
        tiles.current[index] = el;
      };
      setters.current.set(index, setter);
    }
    return setter;
  }, []);

  /**
   * СТОРОЖ ЗАЛИПШЕГО ЖЕСТА. `dragend` доставляется ИСХОДНОМУ узлу; если тот успел размонтироваться
   * посреди перетаскивания (рефетч сменил id, плитки перемонтировались), событие не придёт никому,
   * и `from` останется навсегда. Второй рубеж — мышь: во время нативного перетаскивания браузер
   * `mousemove` не шлёт вовсе, поэтому первое её движение значит, что жест уже кончился. Задержка
   * перед подпиской снимает гонку с самим началом жеста.
   */
  useEffect(() => {
    if (from === null) return;
    const done = () => cancel();
    document.addEventListener('dragend', done, true);
    document.addEventListener('drop', done, true);
    const arm = window.setTimeout(() => window.addEventListener('mousemove', done, true), 400);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener('dragend', done, true);
      document.removeEventListener('drop', done, true);
      window.removeEventListener('mousemove', done, true);
    };
  }, [from, cancel]);

  const handleProps = useCallback(
    (index: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        // Без полезной нагрузки часть браузеров не начинает перетаскивание вовсе.
        try {
          e.dataTransfer.setData('text/plain', String(index));
        } catch {
          /* Safari бывает против — на сам жест это не влияет. */
        }
        // Под курсором едет ПЛИТКА, а не ручка: снимок величиной в один глиф не даёт понять,
        // что именно переставляют.
        const tile = tiles.current[index];
        if (tile) e.dataTransfer.setDragImage(tile, 24, 24);
        setFrom(index);
      },
      onDragEnd: (e: React.DragEvent) => {
        e.stopPropagation();
        cancel();
      },
    }),
    [cancel],
  );

  // Плитка перехватывает жест, только если он ЕЁ: перестановка, начатая в ЭТОМ экземпляре, и точно
  // не файл. Чужая плитка из соседней галереи и брошенный файл проходят мимо — первую здесь никто
  // не примет, второй достанется приёмнику галереи.
  const tileProps = useCallback(
    (index: number) => ({
      onDragEnter: (e: React.DragEvent) => {
        if (from === null || isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(index);
      },
      onDragOver: (e: React.DragEvent) => {
        if (from === null || isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      },
      onDrop: (e: React.DragEvent) => {
        if (from === null || isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (from !== index) onMove(from, index);
        cancel();
      },
    }),
    [from, onMove, cancel],
  );

  return { active: from !== null, overIndex, registerTile, handleProps, tileProps, cancel };
}

const ICON_BUTTON =
  'flex size-4 shrink-0 items-center justify-center text-micro leading-none text-labelColor hover:text-textColor disabled:text-textInactiveColor disabled:hover:text-textInactiveColor';

/**
 * Подвал плитки: ручка, номер, стрелки, форма кадра и удаление.
 *
 * Действия ушли ИЗ УГЛА КАРТИНКИ вниз, под неё. В углу они дрались за один и тот же пиксель с
 * невидимой кнопкой «открыть во весь экран», растянутой на всю плитку, и промах по крестику
 * открывал просмотрщик.
 */
export function TileFooter({
  index,
  count,
  width,
  height,
  reorder,
  onMove,
  onRemove,
  unit = 'frame',
  removeTitle = 'remove from the form; the file itself stays in the library',
}: {
  index: number;
  count: number;
  width?: number;
  height?: number;
  /** Нет — порядок в этой галерее не меняется (ручка и стрелки не рисуются). */
  reorder?: ReorderApi;
  onMove?: (from: number, to: number) => void;
  onRemove?: () => void;
  /** Как галерея зовёт свою единицу: «кадр», «эскиз». Уходит в подписи для чтения с экрана. */
  unit?: string;
  removeTitle?: string;
}) {
  const ratio = calculateAspectRatio(width, height);
  return (
    <div className='flex items-center gap-1 border-t border-hairline px-1 py-0.5'>
      {reorder && onMove && count > 1 && (
        <span
          {...reorder.handleProps(index)}
          aria-hidden='true'
          title='drag to reorder'
          className='flex size-4 shrink-0 cursor-grab items-center justify-center text-micro leading-none text-labelColor active:cursor-grabbing'
        >
          ⠿
        </span>
      )}
      <Text size='nano' variant='label' component='span' className='shrink-0 tabular-nums'>
        {index + 1}
      </Text>
      {reorder && onMove && count > 1 && (
        <>
          <Button
            type='button'
            aria-label={`move ${unit} ${index + 1} earlier`}
            title='earlier in the display order'
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
            className={ICON_BUTTON}
          >
            ←
          </Button>
          <Button
            type='button'
            aria-label={`move ${unit} ${index + 1} later`}
            title='later in the display order'
            disabled={index === count - 1}
            onClick={() => onMove(index, index + 1)}
            className={ICON_BUTTON}
          >
            →
          </Button>
        </>
      )}
      <span className='ml-auto flex min-w-0 items-center gap-1 text-labelColor'>
        <RatioGlyph width={width} height={height} size={10} />
        {isKnownAspectRatio(ratio) && (
          <Text size='nano' variant='label' component='span' className='tabular-nums'>
            {ratio}
          </Text>
        )}
      </span>
      {onRemove && (
        <Button
          type='button'
          aria-label={`remove ${unit} ${index + 1}`}
          title={removeTitle}
          onClick={onRemove}
          className={ICON_BUTTON}
        >
          ×
        </Button>
      )}
    </div>
  );
}

/**
 * Сколько кадра съест рамка. Считается по РАМКЕ, а не по списку соотношений пикера: режет именно
 * рамка, и режет она только когда кадр её ЗАПОЛНЯЕТ. Там, где кадр вписывается целиком
 * (`fit='contain'`), терять нечего и говорить не о чем.
 */
export function frameLoss({
  frameAspect,
  fit,
  width,
  height,
}: {
  frameAspect?: string;
  fit?: 'cover' | 'contain';
  width?: number;
  height?: number;
}): { percent: number; side: string } | undefined {
  if (fit === 'contain' || !frameAspect || !width || !height) return undefined;
  const [a, b] = frameAspect.split(/[/:]/).map(Number);
  if (!(a > 0) || !(b > 0)) return undefined;
  const target = a / b;
  // ПОРОГ «ПОДОШЛО» ОДИН НА ВСЮ ПОДСИСТЕМУ. Диалог выбора решает то же самое через
  // `matchesSlotRatio` и на совпавшем кадре пишет «встанет»; если считать здесь по своему
  // порогу, один и тот же снимок получит в пикере «встанет», а через секунду в галерее —
  // «рамка срежет 3%». Два утверждения об одном кадре, и оба уверенные.
  if (matchesSlotRatio(width, height, [target])) return undefined;
  const loss = cropLoss(width, height, target);
  if (loss == null) return undefined;
  const percent = Math.round(loss * 100);
  if (percent < 1) return undefined;
  return { percent, side: width / height > target ? 'off the sides' : 'off the top and bottom' };
}

/**
 * Кадр не совпал с рамкой, сказанное вслух. Две ступени намеренно: пара процентов никого не
 * касается и говорится шёпотом, а от десятой части кадра — это уже решение человека, поэтому
 * синее: «в процессе, нужен человек», а не «сломано».
 */
export function FrameLossNote({
  loss,
  className,
}: {
  loss?: { percent: number; side: string };
  className?: string;
}) {
  if (!loss) return null;
  if (loss.percent < 10) {
    return (
      <Text size='nano' variant='label' component='span' className={cn('block px-1', className)}>
        the frame crops {loss.percent}% {loss.side}
      </Text>
    );
  }
  // Цифра называется ОДИН раз: пилюля говорит, что решение за человеком, строка под ней — цену
  // этого решения. Повторить в обеих «58%» значит занять две строки одним фактом.
  return (
    <span className={cn('flex flex-col items-start gap-0.5 px-1', className)}>
      {/* НЕ «не влезает»: очередь загрузки этими же словами говорит про файл тяжелее предела
          бакета («не пролезет»), и две почти одинаковые фразы про совершенно разные вещи
          человек читает как одну. Здесь режет рамка, и слово об этом. */}
      <Pill tone='attention'>will be cropped</Pill>
      <Text size='nano' variant='label' component='span'>
        the frame crops {loss.percent}% {loss.side}
      </Text>
    </span>
  );
}

/**
 * Возврат убранного.
 *
 * УДАЛЕНИЕ НЕ СПРАШИВАЕТ «ТОЧНО?», А ОБРАЩАЕТСЯ ВСПЯТЬ. Здесь не удаляют файл: его снимают с формы,
 * в медиатеке он остаётся целым, а сама форма ещё не сохранена. Модалка подтверждения на каждый
 * снятый кадр — это налог на человека, который разбирает съёмку из двадцати штук, и платится он за
 * действие, которое ничего не разрушает.
 *
 * И НИКАКОГО ТАЙМЕРА. Полоса живёт, пока её не использовали, не закрыли или не заменили следующим
 * снятым кадром. Секундомер обещал бы срок, которого в данных нет: до сохранения формы кадр не
 * уходит никуда, и «поздно» здесь не наступает.
 */
export function RemovedNotice({
  what,
  place,
  unit = 'frame',
  onRestore,
  onDismiss,
  className,
}: {
  /** Что именно убрали, словами: «кадр 4804», «эскиз „узел кармана“». */
  what: string;
  /** Место в порядке, куда кадр вернётся. */
  place: number;
  /** Как галерея зовёт свою единицу: «кадр», «эскиз». */
  unit?: string;
  onRestore: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <CalloutBox tone='note' className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <Text size='micro' variant='label' component='span'>
        <b>removed:</b> {what}, position {place}.
      </Text>
      <Button type='button' variant='secondary' size='xs' onClick={onRestore}>
        restore {unit}
      </Button>
      <Button type='button' variant='underline' size='xs' onClick={onDismiss}>
        hide
      </Button>
      <Text size='nano' variant='label' component='span' className='basis-full'>
        the file is still in the library — the {unit} only leaves the form when you save
      </Text>
    </CalloutBox>
  );
}
