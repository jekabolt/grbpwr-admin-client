import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Text from 'ui/components/text';
import { Arrow } from 'ui/icons/arrow';
import { AvatarStack } from './avatar-stack';

/**
 * ПИКЕР НЕСКОЛЬКИХ ИСПОЛНИТЕЛЕЙ.
 *
 * ── ПОЧЕМУ НЕ `SelectComponent` (Radix Select) ──────────────────────────────────────────────
 *
 * Radix Select держит рядом со своим триггером СКРЫТЫЙ нативный `<select>` и синхронизирует его
 * значением. Значение, которого нет среди пунктов, этот скрытый узел стирает — и наружу уезжает
 * фантомная пустота (замерено в этом репозитории на пикере шва). Множественный выбор в такой
 * модели невыразим в принципе: «значение» здесь — список, а у нативного select одиночного режима
 * его нет. Поэтому список собран на обычных кнопках, как `ui/components/combobox`, у которого
 * скрытого узла нет вовсе.
 *
 * ── ПОЧЕМУ НЕ ДВА `useFieldArray` ───────────────────────────────────────────────────────────
 *
 * Мутаторы field array НЕ ВЕЩАЮТ друг другу: два `useFieldArray` на одно имя расходятся молча.
 * Список исполнителей — ровно та ловушка, поэтому здесь нет field array вообще: значение
 * приходит пропом, уходит колбэком, а форма держит его одним `Controller`.
 *
 * ── ПОЧЕМУ ЗАПИСЬ ОДНА НА ЖЕСТ ──────────────────────────────────────────────────────────────
 *
 * Выбор двоих — это ДВА щелчка, а `UpdateTask` заменяет содержимое карточки ЦЕЛИКОМ. Писать на
 * каждый щелчок значило бы отправить две полные замены подряд: вторая делает своё свежее чтение
 * до того, как долетела первая, и молча уносит на сервер устаревшего соседа (тот же класс, что
 * закрыт глушением контрола на время полёта). Поэтому пикер держит ЧЕРНОВИК, пока открыт, и
 * отдаёт его ОДИН раз — на закрытии.
 *
 * `seen` во втором аргументе — список, каким человек его видел, ОТКРЫВАЯ пикер. Тот же довод,
 * что у `InlineTitle`: значение на момент закрытия могло уже приехать чужим по
 * `refetchOnWindowFocus`, и сверять чужую правку саму с собой значит не находить конфликта.
 *
 * ── КЛАВИШИ ─────────────────────────────────────────────────────────────────────────────────
 *
 * Только стрелки, Enter и Escape. Ни одного сравнения с БУКВОЙ: на кириллической раскладке
 * `e.key` перестаёт совпадать с латинской буквой, и такой ярлык был бы мёртв ровно у тех, кто
 * этой админкой пользуется.
 */

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function AssigneesPicker({
  value,
  onChange,
  disabled,
  label = 'assignees',
}: {
  value: string[];
  /**
   * `next` — новый список, `seen` — тот, что был на экране в момент ОТКРЫТИЯ пикера.
   * Зовётся ОДИН раз на жест (на закрытии) и только если состав изменился.
   */
  onChange: (next: string[], seen: string[]) => void;
  /**
   * НЕ КОСМЕТИКА, А ЗАЩИТА ОТ НАЛОЖЕНИЯ ЗАПИСЕЙ — тот же довод, что у одиночного
   * `AssigneeSelect`: пока летит одна инлайн-запись, вторая сделала бы своё свежее чтение до
   * того, как долетела первая. Пропом, а НЕ `<fieldset disabled>`: тот глушит только клик и
   * фокус, а `pointerdown` и наведение сквозь него живут.
   */
  disabled?: boolean;
  /** Доступное имя триггера. Различимое, потому что пикеров на экране может быть два. */
  label?: string;
}) {
  const { data, isError } = useAdmins();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<string[]>(value);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Что человек видел, ОТКРЫВАЯ пикер. Довод — в шапке файла. */
  const seenRef = useRef<string[]>(value);
  /** Черновик на момент закрытия — читается из обработчика, который живёт дольше рендера. */
  const draftRef = useRef<string[]>(value);
  draftRef.current = draft;

  // ЧЕРНОВИК ПЕРЕСАЖИВАЕТСЯ НА СЕРВЕРНОЕ ЗНАЧЕНИЕ ТОЛЬКО ПОКА ПИКЕР ЗАКРЫТ. Открытый пикер —
  // это начатая правка, и фоновое перечитывание карточки не имеет права выдёргивать её из-под
  // рук (тот же дефект, из-за которого у редактора описания убрали `key`).
  useEffect(() => {
    if (!open) setDraft(value);
  }, [open, value]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    const next = draftRef.current;
    const seen = seenRef.current;
    // Ничего не изменилось — записи нет вовсе. Иначе каждое открытие-и-закрытие пикера было бы
    // полной заменой содержимого карточки.
    if (!sameList(next, seen)) onChange(next, seen);
  }, [onChange]);

  // Клик мимо закрывает — и, значит, СОХРАНЯЕТ. Слушатель висит только пока открыто.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  useLayoutEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const admins = (data?.admins ?? []).filter(
    (a): a is typeof a & { username: string } => !!a.username,
  );
  const known = new Set(admins.map((a) => a.username));
  /**
   * УЖЕ НАЗНАЧЕННЫЙ, НО ОТСУТСТВУЮЩИЙ В СПИСКЕ, ОСТАЁТСЯ СВОЕЙ СТРОКОЙ. `ListAdmins` исключает
   * отключённые аккаунты — человек, на котором стоит задача, исчез бы из пикера в день, когда
   * его учётку выключили, и первое же сохранение молча сняло бы его с работы.
   */
  const names = [...admins.map((a) => a.username), ...draft.filter((n) => !known.has(n))];
  const q = query.trim().toLowerCase();
  const shown = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;

  const toggle = (name: string) => {
    setDraft((cur) => (cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) =>
        i < 0 ? (step === 1 ? 0 : shown.length - 1) : (i + step + shown.length) % shown.length,
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Без подсветки Enter молчит: человек ещё не назвал строку, и толковать «ничего» как
      // «первого из списка» — способ назначить не того одним рефлекторным нажатием.
      const pick = active >= 0 ? shown[active] : undefined;
      if (pick) toggle(pick);
    }
  };

  const summary = draft.join(', ');

  return (
    <div ref={rootRef} className='relative' data-assignees-picker>
      <button
        type='button'
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-label={label}
        data-assignees-trigger
        disabled={disabled}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          // «Увиденное» фиксируется В МОМЕНТ ОТКРЫТИЯ, а не при закрытии.
          seenRef.current = value;
          setDraft(value);
          setOpen(true);
        }}
        className={cn(
          // Та же коробка, что у Input, Select и Combobox: пикер не имеет права выглядеть иначе,
          // чем соседние контролы той же рейки.
          'flex min-h-[22px] w-full items-center justify-between gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left text-textBaseSize transition-colors focus:border-textColor focus:outline-none',
          disabled && 'opacity-60',
        )}
      >
        <span className='flex min-w-0 flex-1 items-center gap-1.5'>
          <AvatarStack names={draft} size={16} />
          <span className={cn('min-w-0 flex-1 truncate', !summary && 'text-textInactiveColor')}>
            {summary || 'unassigned'}
          </span>
        </span>
        <span className={cn('shrink-0 text-textColor', open ? 'rotate-0' : 'rotate-180')}>
          <Arrow />
        </span>
      </button>

      {open && (
        <div className='absolute left-0 right-0 top-full z-[var(--z-popover)] mt-px border border-textInactiveColor bg-bgColor'>
          <input
            ref={inputRef}
            type='text'
            value={query}
            aria-label='search people'
            data-assignees-search
            placeholder={isError ? 'people list failed to load' : 'type to search'}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(e.target.value.trim() ? 0 : -1);
            }}
            onKeyDown={onKeyDown}
            className='block min-h-[22px] w-full appearance-none rounded-none border-0 border-b border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize placeholder:text-textInactiveColor focus:outline-none'
          />
          <div className='max-h-[240px] overflow-auto' role='listbox' aria-multiselectable>
            {shown.length === 0 && (
              // ПРОМАХ НАЗЫВАЕТ ЗАПРОС. Пустота читается как «список не загрузился», и человек
              // закрывает пикер вместо того, чтобы стереть одну букву.
              <div className='px-[7px] py-1'>
                <Text size='micro' variant='label' component='span'>
                  {query ? `nothing matches “${query}”` : 'nobody to pick'}
                </Text>
              </div>
            )}
            {shown.map((name, i) => {
              const on = draft.includes(name);
              return (
                <button
                  key={name}
                  type='button'
                  role='option'
                  aria-selected={on}
                  data-assignee-option={name}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => toggle(name)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-px text-left leading-tight',
                    i === active && 'bg-[rgba(0,0,0,0.08)]',
                  )}
                >
                  {/* Квадрат-отметка, а не галочка текстом: она обязана занимать место и когда
                      пуста, иначе строки прыгают при каждом переключении. */}
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-3 shrink-0 items-center justify-center border border-textInactiveColor',
                      on && 'bg-textColor',
                    )}
                  />
                  <Text component='span' className='min-w-0 truncate'>
                    {name}
                  </Text>
                </button>
              );
            })}
          </div>
          <div className='flex items-center justify-between gap-2 border-t border-borderColor px-[7px] py-px'>
            <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
              {draft.length ? `${draft.length} selected` : 'nobody selected'}
            </Text>
            <button
              type='button'
              data-assignees-done
              onClick={close}
              className='text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
            >
              done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
