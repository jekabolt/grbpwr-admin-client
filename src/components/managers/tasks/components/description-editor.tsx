import { FormatBar } from 'components/managers/files/note/format-bar';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Button, Text, Textarea } from 'ui';
import type { TaskMedia } from '../api/types';
import { TaskDescriptionView } from './task-description';

/**
 * ПОЛЕ ОПИСАНИЯ ЗАДАЧИ — ОДНО НА ДВА МЕСТА (инлайн-правка на детальной и модалка
 * создания/правки). Разъехаться им нельзя: «правка описания» обязана значить одно и то же на
 * одном экране, а панель форматирования, стоящая только в одном из двух, читалась бы как
 * поломка второго.
 *
 * ПАНЕЛЬ БЕРЁТСЯ ГОТОВАЯ — `files/note/format-bar`, та же, что у заметок библиотеки. Владелец
 * просил «тот же самый функционал», и это буквально он: те же кнопки, та же работа с кареткой,
 * та же вставка файлов библиотеки. Своя похожая панель означала бы вторую реализацию правил
 * разметки, которая разойдётся с разметчиком на первой же правке.
 *
 * ПОЛОСА ОДНА И КОМПАКТНАЯ — ПОД ПОЛЕМ: пять частых инструментов и «⋯», остальное и «preview»
 * под «⋯». Полная панель в три ряда кнопок на телефоне съедала пол-экрана над полем (жалоба
 * владельца по скриншоту). Ряда «link to attachment» под полем больше нет — владелец снял его.
 *
 * ── ПЕРЕКЛЮЧАТЕЛЬ «ПИШУ ↔ СМОТРЮ» ───────────────────────────────────────────────────────────
 *
 * Разметку надо видеть до сохранения, иначе «поддержка маркдауна» проверяется только записью.
 * Переключатель МЕНЯЕТ КОМПОНЕНТ, а не гасит его: `<fieldset disabled>` глушит клик и фокус, но
 * `pointerdown` и наведение сквозь него живут — то есть «замороженное» поле продолжает отвечать
 * на часть жестов. Здесь замораживать нечего: в режиме просмотра поля просто нет.
 *
 * Панель форматирования в режиме просмотра ТОЖЕ СНИМАЕТСЯ: она работает по каретке живого
 * `textarea`, и кнопка, которая молча ничего не делает, хуже отсутствующей.
 */
export function DescriptionEditor({
  value,
  onChange,
  media,
  disabled,
  ariaLabel,
  placeholder = 'add details or acceptance criteria…',
  className,
  onKeyDown,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Вложения карточки — по ним показ разметки рисует ссылки `▣`. */
  media: TaskMedia[];
  /** Заморозка на время летящей записи. Пропом, а не `fieldset` (см. шапку). */
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Поле получает фокус при открытии. Инлайн-правку открывают жестом по самому описанию
   * (двойной щелчок, кнопка «edit») — после него печатают, а не ищут поле второй раз.
   */
  autoFocus?: boolean;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [toolsShown, setToolsShown] = useState(false);

  /** Фокус ставится ОДИН раз за открытие — но именно поставится, а не «попытается». */
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!autoFocus || focusedRef.current || disabled) return;
    const el = areaRef.current;
    if (!el) return;
    // ПОЛЕ МОГЛО ОТКРЫТЬСЯ ЗАМОРОЖЕННЫМ: запись у всех инлайн-полей страницы общая, и двойной
    // щелчок во время сохранения заголовка монтирует поле с `disabled`, на котором `focus()` не
    // делает ничего. Поэтому эффект ждёт разморозки — но фокус не отбирает, если человек за это
    // время уже ушёл в другой контрол.
    const active = document.activeElement;
    if (active && active !== document.body && active !== el) {
      focusedRef.current = true;
      return;
    }
    focusedRef.current = true;
    // Каретка — В НАЧАЛО: высота поля ограничена, и каретка в конце длинного описания
    // прокрутила бы поле к хвосту, спрятав начало текста.
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, 0);
    // ПОЛЕ ПРИВОДИТСЯ В ВИД ЯВНО. Отрисованное описание бывает в несколько экранов, а поле на
    // его месте — не выше потолка; прокрутка страницы остаётся прежней, и двойной щелчок в
    // нижней половине длинного описания оставлял бы фокус в поле, чей верх далеко над экраном,
    // — человек печатал бы вслепую. `nearest` не двигает страницу, если поле уже видно.
    // Сам `focus` — с `preventScroll`: его прокрутка ставит к краю по своему усмотрению.
    el.scrollIntoView({ block: 'nearest' });
  }, [autoFocus, disabled]);

  const showTools = toolsShown || preview || !!value.trim();
  return (
    <div className='flex flex-col border border-borderColor'>
      {preview ? (
        <div className={cn('min-h-24 px-3 py-2', className)}>
          {value.trim() ? (
            <TaskDescriptionView text={value} media={media} />
          ) : (
            <Text size='micro' variant='label' component='span'>
              nothing yet
            </Text>
          )}
        </div>
      ) : (
        <Textarea
          ref={areaRef}
          name='task-description'
          aria-label={ariaLabel}
          variant='secondary'
          placeholder={placeholder}
          className={cn('mb-0 max-h-[60vh] min-h-24 border-0 px-3 py-2', className)}
          value={value}
          disabled={disabled}
          onFocus={() => setToolsShown(true)}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      {showTools &&
        (preview ? (
          <div className='flex border-t border-hairline'>
            <Button
              type='button'
              variant='default'
              aria-label='back to writing'
              onClick={() => setPreview(false)}
              className='min-h-11 flex-1 text-micro uppercase tracking-label md:min-h-8'
            >
              write
            </Button>
          </div>
        ) : (
          <FormatBar
            compact
            areaRef={areaRef}
            value={value}
            onChange={onChange}
            onTogglePreview={() => setPreview(true)}
          />
        ))}
    </div>
  );
}
