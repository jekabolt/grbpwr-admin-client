import { FormatBar } from 'components/managers/files/note/format-bar';
import { cn } from 'lib/utility';
import { useRef, useState } from 'react';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import type { TaskMedia } from '../api/types';
import { MediaRefRow } from './media-ref-row';
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
}: {
  value: string;
  onChange: (next: string) => void;
  /** Вложения карточки — из них ряд `▣` собирает ссылки на вложения. */
  media: TaskMedia[];
  /** Заморозка на время летящей записи. Пропом, а не `fieldset` (см. шапку). */
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center justify-between gap-2'>
        {preview ? (
          <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
            preview
          </Text>
        ) : (
          <FormatBar areaRef={areaRef} value={value} onChange={onChange} />
        )}
        <button
          type='button'
          aria-label={preview ? 'back to writing' : 'preview markdown'}
          onClick={() => setPreview((p) => !p)}
          className='shrink-0 text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
        >
          {preview ? 'write' : 'preview'}
        </button>
      </div>

      {preview ? (
        <div
          className={cn(
            // Та же коробка, что у поля, — иначе переключение прыгает рамкой.
            'min-h-32 border border-borderColor px-[7px] py-[3px]',
            className,
          )}
        >
          {value.trim() ? (
            <TaskDescriptionView text={value} media={media} />
          ) : (
            <Text size='micro' variant='label' component='span'>
              nothing to preview yet
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
          /**
           * ПОТОЛОК ВЫСОТЫ — ЗАЩИТА, А НЕ ВКУС, и он назван замером.
           *
           * Примитив поля в ЭТОЙ базе под текст не растёт, но в волне он этому учится, и тогда
           * описание на сорок строк станет полем в полторы тысячи пикселей. Замерено на стенде
           * (`task-queue-b-probe.mjs`, Ц14): у такого поля ЛЮБОЕ нажатие на панели форматирования
           * уносит прокрутку страницы к его верху — причём не автогроу, а `area.focus()` внутри
           * самой панели, который браузер сопровождает прокруткой к элементу. След замера
           * однозначен: прокрутка уже равна нулю в обработчике `focus`, ДО того как автогроу
           * что-либо померил.
           *
           * `max-height` побеждает inline-`height`, которым автогроу выставляет размер, поэтому
           * потолок работает и против будущей версии примитива, не зная о ней ничего.
           */
          className={cn('mb-0 max-h-[60vh] min-h-32 border border-borderColor', className)}
          value={value}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}

      {!preview && (
        <MediaRefRow media={media} targetRef={areaRef} value={value} onChange={onChange} />
      )}
    </div>
  );
}
