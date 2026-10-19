import { format } from 'date-fns';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Button, DatePicker, Input, Text } from 'ui';
import { DescriptionEditor } from '../components/description-editor';
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
export function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
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
      <Button
        type='button'
        variant='default'
        onClick={() => setEditing(true)}
        aria-label='edit title'
        className='min-h-11 w-fit max-w-full text-left text-lg font-bold leading-tight underline decoration-transparent underline-offset-4 outline-none hover:decoration-borderColor sm:min-h-0 sm:text-statBig'
      >
        {value}
      </Button>
    ) : (
      <h1 className='text-lg font-bold leading-tight sm:text-statBig'>{value}</h1>
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
    <div className='flex flex-col items-stretch gap-2 sm:flex-row sm:items-center'>
      <Input
        ref={inputRef}
        name='inline-title'
        aria-label='task title'
        className='min-h-11 min-w-0 flex-1 text-lg font-bold sm:min-h-0 sm:text-statBig'
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
        className='min-h-11 sm:min-h-0'
        data-inline-save='title'
        loading={saving}
        disabled={!draft.trim()}
        onClick={commit}
      >
        save
      </Button>
      <Button
        type='button'
        variant='underline'
        size='xs'
        className='min-h-11 sm:min-h-0'
        onClick={() => setEditing(false)}
      >
        cancel
      </Button>
    </div>
  );
}

/**
 * ОПИСАНИЕ: тот же `DescriptionEditor`, что в модалке правки, — иначе «правка описания» значила
 * бы разное в двух местах одного экрана. Он же приносит панель форматирования заметок и
 * переключатель «пишу ↔ смотрю» (п.6 волны).
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

  /**
   * ОДИН ПУТЬ СОХРАНЕНИЯ НА ОБА ЖЕСТА — кнопку и ⌘Enter. Раньше их было два, и оба правила ниже
   * стояли бы только на одном из них: кнопка гаснет на время записи сама (`loading` у примитива),
   * а сочетание клавиш не гаснет ничем.
   */
  const commit = () => {
    // ПОКА ЛЕТИТ ЗАПИСЬ — НИЧЕГО. Второе сохранение поверх первого унесло бы соседнее поле
    // устаревшим: `UpdateTask` заменяет содержимое целиком. Дверь (`useInlineTaskPatch`) такую
    // запись всё равно отвергнет, но отвергнет СНЕКБАРОМ — а нажатие по кнопке, которая и так
    // показывает крутилку, ошибкой называть не за что.
    if (saving) return;
    // ПУСТОЕ СОХРАНЕНИЕ — НЕ ЗАПИСЬ. Открыл редактор, ничего не набрал, нажал «save»: писать
    // нечего, а полная замена содержимого не бывает бесплатной — она и чужую правку соседнего
    // поля способна откатить, и снекбар конфликта способна вызвать на ровном месте. Сверяется с
    // `baseRef`, а не с живым `value`: чужой текст, доехавший в кэш, пока редактор открыт, — это
    // как раз НЕ то, что человек видел, и молчаливо принимать его за свой черновик нельзя.
    if (draft === baseRef.current) {
      onCancel();
      return;
    }
    onSave(draft, baseRef.current);
  };

  return (
    <div className='flex flex-col gap-2'>
      <DescriptionEditor
        ariaLabel='task description'
        autoFocus
        media={media}
        value={draft}
        disabled={saving}
        onChange={setDraft}
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          // Голый Enter здесь — НОВАЯ СТРОКА, и отправителем быть не может: поле многострочное
          // по назначению. Сохраняет то же сочетание, что и в модалке.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className='flex items-center gap-2'>
        {/* `data-inline-save` — ЯКОРЬ ДЛЯ СТЕНДА, и он нужен именно здесь: когда открыты и
            заголовок, и описание, кнопок с надписью «save» на странице две, и поиск по имени
            брал бы первую попавшуюся — то есть проверял бы не тот контрол, о котором говорит
            случай. */}
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='min-h-11 sm:min-h-0'
          data-inline-save='description'
          loading={saving}
          onClick={commit}
        >
          save
        </Button>
        <Button
          type='button'
          variant='underline'
          size='xs'
          className='min-h-11 sm:min-h-0'
          onClick={onCancel}
        >
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
      <div className='[&_button]:min-h-11 sm:[&_button]:min-h-0'>
        <DatePicker
          value={value ? new Date(value) : undefined}
          disabled={disabled}
          onChange={(d) => onChange(d ? d.toISOString() : undefined)}
        />
      </div>
    </InlineField>
  );
}

/**
 * ДАТА В РЯДУ ПОД ЗАГОЛОВКОМ (detail v2): «due · дата», просрочка — красной рамкой И словом
 * `overdue` (цвет не несёт состояние в одиночку). Тот же `DatePicker`; выбор пишет сразу.
 * Без права записи — та же рамка с текстом, без контрола.
 */
export function DueField({
  label,
  value,
  overdue,
  canWrite,
  disabled,
  onChange,
}: {
  label: string;
  value: string | undefined;
  overdue?: boolean;
  canWrite: boolean;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  // ОДНА СТРОКА ОДНОГО РАЗМЕРА: подпись, дата, ×/▾ — всё 11px капсом, как соседние чипы. Просрочка
  // меняет саму подпись `due` → `overdue` (слово несёт состояние без цвета) и красит всю рамку.
  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-2 border border-borderColor bg-bgColor px-2.5 text-control uppercase leading-none tracking-label sm:min-h-8',
        overdue && 'border-error text-error',
      )}
    >
      <Text
        size='control'
        component='span'
        className={cn('shrink-0 uppercase tracking-label', !overdue && 'text-labelColor')}
      >
        {overdue ? 'overdue' : label}
      </Text>
      {canWrite ? (
        <div className='min-w-0 [&>button]:min-h-11 sm:[&>button]:min-h-0'>
          <DatePicker
            compact
            value={value ? new Date(value) : undefined}
            disabled={disabled}
            placeholder='none'
            onChange={(d) => onChange(d ? d.toISOString() : undefined)}
          />
        </div>
      ) : (
        <Text
          size='control'
          component='span'
          className={cn('uppercase', !value && 'text-labelColor')}
        >
          {value ? format(new Date(value), 'd MMM yyyy') : 'none'}
        </Text>
      )}
    </div>
  );
}

/**
 * Дата строкой списка полей: только сам `DatePicker`, без подписи — подпись держит строка.
 */
export function RowDate({
  value,
  disabled,
  onChange,
}: {
  value: string | undefined;
  disabled?: boolean;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <div className='w-full [&>button]:min-h-11 [&>button]:border-b-0 [&>button]:py-0 sm:[&>button]:min-h-8'>
      <DatePicker
        value={value ? new Date(value) : undefined}
        disabled={disabled}
        placeholder='none'
        onChange={(d) => onChange(d ? d.toISOString() : undefined)}
      />
    </div>
  );
}
