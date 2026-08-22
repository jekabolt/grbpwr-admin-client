import { cn } from 'lib/utility';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Text from 'ui/components/text';
import { Arrow } from 'ui/icons/arrow';

// КОМБОБОКС — ВЫБОР ПОИСКОМ, А НЕ СКАНИРОВАНИЕМ СПИСКА.
//
// Селект отвечает на вопрос «какой из ЭТИХ?» и перестаёт работать, когда «этих» больше двух
// десятков: человек уже знает своё слово, а список заставляет искать его глазами. Здесь наоборот:
// печатаешь слово — остаётся то, что ему отвечает; не печатаешь — листаешь подписанные группы.
//
// ПРОМАХ ПОИСКА ≠ ПУСТОЙ СПИСОК. Пустой ответ на запрос показывается СТРОКОЙ, называющей запрос, а
// не пустотой поповера: пустота читается как «список не загрузился», и человек закрывает пикер
// вместо того, чтобы стереть одну букву.
//
// ФИЛЬТР ЖИВЁТ СНАРУЖИ, И ЭТО ГРАНИЦА ПРИМИТИВА. Что чем находится (синонимы, стадии, ранжирование)
// — знание предметной области; примитив знает только про ввод, клавиши и отрисовку. Второй, свой,
// матчер внутри разошёлся бы с настоящим молча.
//
// СТРЕЛКИ И ENTER, А НЕ БУКВЫ. Клавиатурная навигация сравнивает `e.key` только со стрелками,
// Enter и Escape — они одинаковы на любой раскладке. Сравнение с БУКВОЙ здесь было бы мёртвым на
// русской раскладке (память «кириллица убивает e.key»), поэтому его нет ни одного.

// СТРОКА НЕСЁТ ТОЛЬКО ИМЯ И ЗНАЧЕНИЕ. Ни приписки справа, ни погашенного состояния здесь нет — и
// это решение, а не пробел: обе штуки стояли в первой версии и не понадобились ни одному из двух
// вызывающих мест, то есть остались бы непроверенным кодом. Понадобятся — войдут вместе со своей
// цитатой в пробе.
export type ComboboxOption = { value: string; label: string };

export type ComboboxGroup = { key: string; label: string; options: ComboboxOption[] };

export function Combobox({
  name,
  valueLabel,
  placeholder,
  searchPlaceholder = 'type to search',
  filter,
  onSelect,
  readOnly,
  invalid,
  footer,
  className,
}: {
  name: string;
  /** Что стоит в триггере СЕЙЧАС. Пусто — плейсхолдер. Примитив значения не хранит. */
  valueLabel?: string;
  placeholder: string;
  searchPlaceholder?: string;
  /** Домен фильтрует сам: пустой запрос обязан вернуть ВСЁ, разложенное по группам. */
  filter: (query: string) => ComboboxGroup[];
  onSelect: (value: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  /** Подпись под списком: откуда список, чего в нём нет. Рисуется всегда, когда задана. */
  footer?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => (open ? filter(query) : []), [open, query, filter]);
  // Плоский список строк — по нему ходят стрелки. Шапки групп в него не входят: клавиша,
  // остановившаяся на невыбираемой строке, читается как сломанная.
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  // Клик мимо закрывает. Слушатель вешается ТОЛЬКО пока поповер открыт: постоянный слушатель на
  // документе от каждого пикера формы — это сотня обработчиков на карточке со ста шагами.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const popRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // ПОПОВЕР ЗАЕЗЖАЕТ В ВИД САМ, И ЭТО НЕ УКРАШЕНИЕ. Он позиционируется абсолютно ВНУТРИ потока,
    // а не порталом, — значит прокручиваемый предок (тело модалки создания шага — `overflow-y-auto`)
    // его обрезает. Без этой строки список открывался бы за нижним краем: «строки нет» и «до
    // строки не докрутили» стали бы неразличимы для человека ровно так же, как они неразличимы
    // для пробы.
    popRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  // Активная строка держится в виду при ходьбе стрелками — иначе выбор «уезжает» за край списка и
  // человек жмёт вслепую.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-combobox-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active, groups]);

  const choose = (value: string) => {
    onSelect(value);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + flat.length) % flat.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[active];
      if (pick) choose(pick.value);
    }
  };

  const activeValue = flat[active]?.value;

  return (
    <div ref={rootRef} className={cn('relative', className)} data-combobox={name}>
      <button
        type='button'
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-label={placeholder}
        data-combobox-trigger={name}
        disabled={readOnly}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          // Та же коробка, что у Input и триггера Select: пикер не имеет права выглядеть иначе,
          // чем соседние контролы той же сетки.
          'flex min-h-[22px] w-full items-center justify-between gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left text-textBaseSize transition-colors focus:border-textColor focus:outline-none',
          'aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error',
          readOnly && 'pointer-events-none cursor-default opacity-90',
        )}
      >
        <span
          className={cn('min-w-0 flex-1 truncate uppercase', !valueLabel && 'text-textInactiveColor')}
        >
          {valueLabel || placeholder}
        </span>
        <span className={cn('shrink-0 text-textColor', open ? 'rotate-0' : 'rotate-180')}>
          <Arrow />
        </span>
      </button>

      {open && (
        <div
          ref={popRef}
          className='absolute left-0 right-0 top-full z-[var(--z-popover)] mt-px border border-textInactiveColor bg-bgColor'
        >
          <input
            ref={inputRef}
            type='text'
            value={query}
            data-combobox-input={name}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className='block min-h-[22px] w-full appearance-none rounded-none border-0 border-b border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize placeholder:text-textInactiveColor focus:outline-none'
          />
          <div ref={listRef} className='max-h-[280px] overflow-auto' role='listbox'>
            {groups.length === 0 && (
              // ПРОМАХ НАЗЫВАЕТ ЗАПРОС. «Ничего не найдено» без слова, по которому не нашлось,
              // не даёт понять, что искать надо иначе, — а искать здесь будут по-русски.
              <div className='px-[7px] py-1' data-combobox-empty={name}>
                <Text size='micro' variant='label' component='span'>
                  {query ? `nothing matches “${query}”` : 'nothing to pick'}
                </Text>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key} data-combobox-group={g.key}>
                <div className='sticky top-0 bg-bgColor px-[7px] pb-px pt-1'>
                  <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                    {g.label}
                  </Text>
                </div>
                {g.options.map((o) => (
                  <button
                    key={o.value}
                    type='button'
                    role='option'
                    aria-selected={o.value === activeValue}
                    data-combobox-option={o.value}
                    data-combobox-active={o.value === activeValue ? 'true' : undefined}
                    onMouseEnter={() => {
                      const at = flat.findIndex((f) => f.value === o.value);
                      if (at >= 0) setActive(at);
                    }}
                    onClick={() => choose(o.value)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-2.5 py-px text-left leading-tight',
                      o.value === activeValue && 'bg-[rgba(0,0,0,0.08)]',
                    )}
                  >
                    <Text variant='uppercase' component='span' className='min-w-0 truncate'>
                      {o.label}
                    </Text>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {footer && <div className='border-t border-borderColor px-[7px] py-px'>{footer}</div>}
        </div>
      )}
    </div>
  );
}

export default Combobox;
