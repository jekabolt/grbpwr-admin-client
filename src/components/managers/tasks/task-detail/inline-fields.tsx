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
  /**
   * `seen` — заголовок, каким человек его видел, НАЧИНАЯ править. Второй аргумент, а не
   * подразумеваемый: значение, взятое на момент сохранения, конфликт по этому же полю
   * пропускает (см. довод у `baseRef` ниже).
   *
   * Возвращает `true`, если запись прошла: только тогда поле закрывается.
   */
  onSave: (next: string, seen: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * ЧТО ЧЕЛОВЕК ВИДЕЛ, ОТКРЫВАЯ ПОЛЕ. Не то же самое, что `value` на момент нажатия «save»:
   * `value` живой, и `refetchOnWindowFocus` намеренно делает его освежение частым. Пока
   * открыт этот input, чужое переименование доезжает в кэш НЕЗАМЕТНО — на экране стоит моя
   * правка, а не серверный заголовок. Сверять с живым значением означало бы сверять чужую
   * правку саму с собой: конфликт не находится, и запись молча затирает её.
   */
  const baseRef = useRef(value);

  // Заново засеивается ТОЛЬКО при открытии: иначе фоновое перечитывание карточки затирало бы
  // набранное прямо под руками — ровно тот дефект, из-за которого правку когда-то унесли в модалку.
  useEffect(() => {
    if (editing) {
      setDraft(value);
      baseRef.current = value;
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
    if (await onSave(next, baseRef.current)) setEditing(false);
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
  /** `seen` — описание, каким человек его видел, ОТКРЫВАЯ редактор (довод — у `baseRef`). */
  onSave: (next: string, seen: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  /**
   * ЧЕРНОВИК ЗАСЕИВАЕТСЯ ОДИН РАЗ — ПРИ МОНТИРОВАНИИ, то есть при открытии редактора, и
   * НИКОГДА не пересаживается на новое серверное значение.
   *
   * Здесь стоял `key={t.description}` на месте вызова, и комментарий при нём утверждал, что
   * ключ меняется «только при повторном открытии». По семантике React это неправда: ключ
   * меняется тогда, когда меняется описание, — в том числе пока редактор ОТКРЫТ. Замерено:
   * человек печатает, коллега правит описание, возврат в окно приносит чужой текст по
   * `refetchOnWindowFocus`, ключ становится новым, редактор размонтируется — и набранное
   * молча замещается чужим, без снекбара и без конфликта. Ключа больше нет; расхождение с
   * сервером разрешает конфликт-проверка при сохранении, а не выдёргивание поля из-под рук.
   */
  const [draft, setDraft] = useState(value);
  /** То же, что у заголовка: «увиденное» фиксируется в начале правки, а не в момент записи. */
  const baseRef = useRef(value);
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
            onSave(draft, baseRef.current);
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
          onClick={() => onSave(draft, baseRef.current)}
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
