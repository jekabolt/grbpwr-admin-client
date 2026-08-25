import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { DatePicker } from 'ui/components/date-picker';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { MediaRefRow } from '../components/media-ref-row';
import type { TaskMedia } from '../api/types';

/**
 * КОНТРОЛЫ ИНЛАЙН-ПРАВКИ СТРАНИЦЫ ЗАДАЧИ. Живут отдельным файлом только чтобы страница не
 * разбухла — своих правил у них нет, записывают все через `useInlineTaskPatch`.
 *
 * ОБЩЕЕ ПРАВИЛО ЖЕСТА, одно на все поля: сохраняет ЯВНОЕ действие (Enter, кнопка «save»),
 * отменяет Esc, а УХОД ФОКУСА не делает НИ ТОГО НИ ДРУГОГО. Сохранение по blur записывало бы
 * карточку от случайного клика мимо, а сброс по blur — терял бы набранное от того же клика; и
 * то и другое здесь дороже лишнего нажатия, потому что каждая запись — полная замена
 * содержимого карточки.
 *
 * Enter и Escape сравниваются по `e.key` СОЗНАТЕЛЬНО: они не буквы и на любой раскладке
 * приезжают одними и теми же именами. Правило «матчить по `e.code`» касается буквенных
 * ярлыков — у них на кириллице `e.key` перестаёт совпадать с латинской буквой.
 */

/** Подпись поля в рейке — тот же микро-капс, что у соседних фактов. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

/** Обёртка «подпись сверху, контрол снизу» — тем же узором, что доска и колонка в рейке. */
export function InlineField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </label>
  );
}

/**
 * ЗАГОЛОВОК: щелчок по нему превращает его в поле. Пустой заголовок не сохраняется — карточка
 * без имени неотличима в списке от любой другой такой же.
 */
export function InlineTitle({
  value,
  canWrite,
  saving,
  onSave,
}: {
  value: string;
  canWrite: boolean;
  saving: boolean;
  /** Возвращает `true`, если запись прошла: только тогда поле закрывается. */
  onSave: (next: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Заново засеивается ТОЛЬКО при открытии: иначе фоновое перечитывание карточки затирало бы
  // набранное прямо под руками — ровно тот дефект, из-за которого правку когда-то унесли в модалку.
  useEffect(() => {
    if (editing) {
      setDraft(value);
      // Фокус — в эффекте, а не autoFocus: поле появляется в уже смонтированном дереве.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return canWrite ? (
      <button
        type='button'
        onClick={() => setEditing(true)}
        aria-label='edit title'
        className='w-fit max-w-full text-left text-lg leading-tight underline decoration-transparent underline-offset-4 outline-none hover:decoration-borderColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        {value}
      </button>
    ) : (
      <h1 className='text-lg leading-tight'>{value}</h1>
    );
  }

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      return;
    }
    // Отказ (чужая правка того же заголовка) ОСТАВЛЯЕТ поле открытым с набранным: закрыть его
    // значило бы наказать человека за чужую гонку потерей своего текста.
    if (await onSave(next)) setEditing(false);
  };

  return (
    <div className='flex items-center gap-2'>
      <Input
        ref={inputRef}
        name='inline-title'
        aria-label='task title'
        className='text-lg'
        value={draft}
        disabled={saving}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
      <Button
        type='button'
        variant='secondary'
        size='sm'
        loading={saving}
        disabled={!draft.trim()}
        onClick={commit}
      >
        save
      </Button>
      <Button type='button' variant='underline' size='xs' onClick={() => setEditing(false)}>
        cancel
      </Button>
    </div>
  );
}

/**
 * ОПИСАНИЕ: та же textarea и тот же ряд ссылок на вложения, что в модалке правки, — иначе
 * «правка описания» значила бы разное в двух местах одного экрана. Панель форматирования и
 * переключатель write/preview встают сюда пунктом 6 волны, на объединённой ветке.
 */
export function InlineDescription({
  value,
  media,
  saving,
  onSave,
  onCancel,
}: {
  value: string;
  media: TaskMedia[];
  saving: boolean;
  onSave: (next: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className='flex flex-col gap-2'>
      <Textarea
        ref={areaRef}
        name='inline-description'
        aria-label='task description'
        variant='secondary'
        placeholder='add details or acceptance criteria…'
        className='mb-0 min-h-32 border border-borderColor'
        value={draft}
        disabled={saving}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          // Голый Enter здесь — НОВАЯ СТРОКА, и отправителем быть не может: поле многострочное
          // по назначению. Сохраняет то же сочетание, что и в модалке.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(draft);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <MediaRefRow media={media} targetRef={areaRef} value={draft} onChange={setDraft} />
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          loading={saving}
          onClick={() => onSave(draft)}
        >
          save
        </Button>
        <Button type='button' variant='underline' size='xs' onClick={onCancel}>
          cancel
        </Button>
      </div>
    </div>
  );
}

/** Дата в рейке: тот же `DatePicker`, что в модалке; выбор пишет сразу. */
export function InlineDate({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | undefined;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <InlineField label={label}>
      <DatePicker
        value={value ? new Date(value) : undefined}
        disabled={disabled}
        onChange={(d) => onChange(d ? d.toISOString() : undefined)}
      />
    </InlineField>
  );
}
