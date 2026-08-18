import Text from 'ui/components/text';
import { cn } from 'lib/utility';

/** Auto-filling grid of small cards. Used for anything picked by looking at it. */
export function Tiles({
  children,
  min = 96,
  className,
}: {
  children: React.ReactNode;
  min?: number;
  className?: string;
}) {
  return (
    <div
      // `[&>*]:min-w-0` НЕСУЩЕЕ, а не уборка. Дорожка здесь `minmax(Npx, 1fr)`, то есть её
      // минимум — ФИКСИРОВАННЫЕ N пикселей, и от контента она расти не умеет. А у грид-элемента
      // `min-width: auto`, то есть он не умеет быть уже своего min-content, и у обрезаемой строки
      // (`truncate` = `white-space: nowrap`) min-content — это ВСЁ название целиком. Элемент
      // вылезает из своей дорожки и ложится ПОВЕРХ соседней плитки, а обрезка при этом не
      // срабатывает вовсе: обрезать нечего, ширины хватило.
      //
      // Ставится на детей грида, а не внутри `Tile`: плитку законно заворачивают в свой div
      // (полка выкроек вешает на него drag&drop), и тогда грид-элемент — эта обёртка, до которой
      // классам самой плитки не дотянуться.
      className={`grid gap-2 [&>*]:min-w-0 ${className ?? ''}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Tile({
  media,
  name,
  sub,
  selected,
  pressed,
  dashed,
  tone,
  onClick,
  title,
  className,
  children,
}: {
  media?: React.ReactNode;
  name?: React.ReactNode;
  sub?: React.ReactNode;
  selected?: boolean;
  /**
   * Ставится у плиток-ПЕРЕКЛЮЧАТЕЛЕЙ, чтобы скринридер объявлял состояние. Тот же проп и тот же
   * смысл, что у `Chip`, — намеренно, чтобы у выбора не завелось третьей формы записи.
   *
   * Отдельно от `selected` потому, что `selected` — это только рисунок (вес рамки), и его ставят
   * и там, где выбор снять нельзя: одиночный пикер, подсветка текущей карточки в каталоге. Такая
   * плитка не переключатель, и обещать скринридеру `aria-pressed` она не вправе.
   */
  pressed?: boolean;
  dashed?: boolean;
  tone?: 'default' | 'error';
  onClick?: () => void;
  /**
   * Полное название на hover. Имя в плитке обрезается по ширине дорожки, а дорожка узкая по
   * замыслу — так что у длинного имени должен быть способ дочитаться, не открывая плитку.
   */
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      aria-pressed={pressed}
      title={title}
      className={cn(
        // ПОЧЕМУ ЗДЕСЬ ЧЕТЫРЕ КЛАССА РАСКЛАДКИ, А НЕ ОДИН `block`.
        //
        // Кликабельная плитка — это `<button>`, а кнопка меряется ПО КОНТЕНТУ (shrink-to-fit) по
        // обеим осям, и `display:block` этого не отменяет:
        //  · `w-full` — иначе плитка с длинным именем распирала себя до max-content и ложилась
        //    ПОВЕРХ соседней, а `truncate` внутри при этом молчал: обрезать нечего, ширины
        //    хватило. Это и был «плейсхолдеры залазят друг на друга» на полке выкроек.
        //  · `min-w-0` — то же правило для плитки, которая САМА является грид-элементом (без
        //    обёртки): у грид-элемента `min-width: auto`, то есть «не уже своего содержимого», а
        //    у нерасторжимой строки min-content — это всё имя целиком.
        //  · `h-full` — кнопка не тянулась до высоты ряда, и низы плиток в ряду вставали
        //    вразнобой.
        //  · `flex flex-col` — а вот это ПАРА к `h-full`: растянутую кнопку браузер центрирует по
        //    вертикали (UA-поведение кнопки), и миниатюры в одном ряду разъезжались бы по высоте
        //    тем сильнее, чем разнее подписи. Флекс-колонка кладёт содержимое от верха.
        'flex h-full w-full min-w-0 flex-col bg-bgColor p-1.5 text-left',
        // Weight carries selection, colour carries health — so a tile can be both.
        selected ? 'border-2' : 'border',
        dashed ? 'border-dashed' : '',
        tone === 'error' ? 'border-error' : selected ? 'border-textColor' : 'border-borderColor',
        onClick ? 'hover:border-textColor' : '',
        className,
      )}
    >
      {media}
      {name && (
        <Text size='micro' className='mt-1 truncate font-bold uppercase'>
          {name}
        </Text>
      )}
      {sub && (
        <Text size='micro' variant='label' className='truncate'>
          {sub}
        </Text>
      )}
      {children}
    </Component>
  );
}
