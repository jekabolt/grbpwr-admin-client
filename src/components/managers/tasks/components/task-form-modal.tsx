import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button, ConfirmationModal, Input, Text } from 'ui';
import { orderedMedia } from '../api/tasksService';
import { TaskFormValues } from '../api/types';
import { FINE_POINTER_QUERY, PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { clearTaskDraft, loadTaskDraft, saveTaskDraft } from '../hooks/useTaskDraft';
import { DescriptionEditor } from './description-editor';
import { isSet, LINK_TYPES, type LinkField } from './link-editor';
import {
  AssigneesPick,
  AttachField,
  BoardPick,
  DatePick,
  LabelsField,
  PriorityPick,
  StatusPick,
} from './task-form-fields';
import { TaskPageShell } from './task-form-shell';

/**
 * tskForm v3 — one column, phone first (mockup OK 19.10).
 *
 * Title → description → four property chips (status, assignees, due, priority) → a folded
 * «more» (labels, planned start, links & files) with the count of what is filled inside. Only
 * the title is required. Below 768px the form is a full-screen page (← back, board, one CREATE
 * at the bottom) and the chips open bottom sheets; on desktop it stays inside the one modal
 * shell (`ConfirmationModal`) and the chips open popovers. What is sent is unchanged.
 *
 * Create mode with a `draftKey` autosaves to localStorage, restores on reopen and clears on a
 * successful create; closing with unsaved content asks keep / discard.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: TaskFormValues;
  saving?: boolean;
  onSubmit: (values: TaskFormValues) => void;
  /**
   * Create only: autosave the form under this key (per board) and restore it on reopen. Callers
   * that seed links (tech card panel, project page) leave it out — their seed must win.
   */
  draftKey?: string;
}

/**
 * Как называется сочетание сохранения НА ЭТОЙ машине.
 *
 * «⌘» на windows — несуществующая клавиша: подпись обещала бы то, чего на клавиатуре нет.
 * Обработчик ловит и `metaKey`, и `ctrlKey`, так что различие чисто в словах — ровно как у
 * подписи поиска в читалке файлов.
 */
const SAVE_HOTKEY = /Mac|iPhone|iPad/.test(
  (typeof navigator === 'undefined' ? '' : navigator.platform) ||
    (typeof navigator === 'undefined' ? '' : navigator.userAgent),
)
  ? '⌘ + enter'
  : 'ctrl + enter';

/**
 * Подпись поля БЕЗ `<label>`. Нужна там, где под подписью стоит не одиночный контрол, а узел с
 * СОБСТВЕННЫМИ кнопками (пикер исполнителей, редактор описания): `<label>` делает клик по слову
 * вторым нажатием на первую кнопку внутри — то есть открывает пикер от щелчка по заголовку.
 */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

/**
 * Поля, которые считаются «содержимым» для черновика и для вопроса «keep / discard». Доска и
 * статус сюда не входят: их засевает точка входа (вкладка доски, колонка «+»), а не человек.
 */
const CONTENT_FIELDS: (keyof TaskFormValues)[] = [
  'title',
  'description',
  'assignees',
  'priority',
  'dueDate',
  'startDate',
  'labels',
  'mediaIds',
  'fileIds',
  'mediaAnnotations',
  ...LINK_TYPES.map((t) => t.field),
];

function sameContent(a: TaskFormValues, b: TaskFormValues): boolean {
  return CONTENT_FIELDS.every((k) => {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'string' && typeof y === 'string') return x.trim() === y.trim();
    return JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  });
}

export function TaskFormModal({
  open,
  onOpenChange,
  mode,
  initial,
  saving,
  onSubmit,
  draftKey,
}: Props) {
  const phone = useMediaQuery(PHONE_QUERY);
  const finePointer = useMediaQuery(FINE_POINTER_QUERY);
  const draftOn = mode === 'create' && !!draftKey;
  const verb = mode === 'create' ? 'create' : 'save';

  const { handleSubmit, control, reset, setValue, getValues, watch } = useForm<TaskFormValues>({
    defaultValues: initial,
  });
  const values = watch();

  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  /** Засев открытия — с ним сравнивается «есть ли несохранённое». */
  const seedRef = useRef<TaskFormValues>(initial);
  /**
   * Была попытка создать. Если после неё форму закрывает РОДИТЕЛЬ (а не человек через
   * back / ✕ / cancel), значит создание прошло — и черновик стирается.
   */
  const submittedRef = useRef(false);

  /**
   * ПЕРЕСЕВ ЧЕРНОВИКА — ТОЛЬКО НА ОТКРЫТИЕ. Раньше эффект висел ещё и на `initial`, а тот
   * пересобирается от содержимого карточки: значит любое перечитывание с изменившимся полем
   * делало `reset` ПОД ОТКРЫТОЙ МОДАЛКОЙ и стирало всё набранное, молча и без отмены по ⌘Z.
   * Модалку открывают закрытой, и каждое открытие засеивает её заново (из черновика, если он
   * есть).
   */
  useEffect(() => {
    if (open) {
      const draft = draftOn && draftKey ? loadTaskDraft(draftKey) : null;
      seedRef.current = initial;
      reset(draft ? { ...initial, ...draft } : initial);
      submittedRef.current = false;
      setMoreOpen(false);
      setConfirmClose(false);
    } else if (submittedRef.current) {
      if (draftOn && draftKey) clearTaskDraft(draftKey);
      submittedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = mode === 'create' && !sameContent(values, seedRef.current);

  // Автосохранение черновика, с паузой, только пока форма открыта.
  useEffect(() => {
    if (!open || !draftOn || !draftKey) return;
    const t = setTimeout(() => {
      const v = getValues();
      if (sameContent(v, seedRef.current)) clearTaskDraft(draftKey);
      else saveTaskDraft(draftKey, v);
    }, 300);
    return () => clearTimeout(t);
  }, [values, open, draftOn, draftKey, getValues]);

  const title = values.title ?? '';
  const canSubmit = !saving && !!title.trim();

  const submit = () => {
    if (!canSubmit) return;
    handleSubmit((v) => {
      submittedRef.current = true;
      onSubmit(v);
    })();
  };

  /** back / ✕ / Escape / cancel — с несохранённым содержимым сначала спрашиваем. */
  const requestClose = () => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    submittedRef.current = false;
    if (draftOn && draftKey) clearTaskDraft(draftKey);
    onOpenChange(false);
  };
  const keepDraft = () => {
    if (draftKey) saveTaskDraft(draftKey, getValues());
    submittedRef.current = false;
    onOpenChange(false);
  };
  const discard = () => {
    if (draftKey) clearTaskDraft(draftKey);
    submittedRef.current = false;
    setConfirmClose(false);
    onOpenChange(false);
  };

  /**
   * ⌘/CTRL+ENTER СОХРАНЯЕТ КАРТОЧКУ. Голый Enter отправителем не будет: половина формы —
   * многострочное описание. Проверка перед отправкой — та же, что у кнопки.
   */
  const onModEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
    // ПОРТАЛ — НЕ ПОДДЕРЕВО ФОРМЫ В DOM, НО ВСПЛЫВАЕТ СЮДА: пикеры и шторки рисуются порталами
    // внутри формы, и ⌘Enter в их поиске не должен сохранять карточку под ними.
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    submit();
  };

  const links: Record<LinkField, number | string> = {
    techCardId: values.techCardId,
    productId: values.productId,
    orderUuid: values.orderUuid,
    archiveId: values.archiveId,
    fittingId: values.fittingId,
    sampleId: values.sampleId,
    productionRunId: values.productionRunId,
    projectTopicId: values.projectTopicId,
  };
  const mediaIds = values.mediaIds ?? [];
  const fileIds = values.fileIds ?? [];
  const attachments = useMemo(() => orderedMedia(mediaIds), [mediaIds]);
  const moreCount =
    (values.labels?.length ?? 0) +
    (values.startDate ? 1 : 0) +
    LINK_TYPES.filter((t) => isSet(links[t.field], t.config.empty)).length +
    fileIds.length +
    mediaIds.length;

  const board = (
    <Controller
      control={control}
      name='boardId'
      render={({ field }) => (
        <BoardPick phone={phone} value={field.value} onChange={field.onChange} />
      )}
    />
  );

  const body = (
    <form
      // Неявной отправки по Enter нет: создаёт только кнопка и ⌘/Ctrl+Enter.
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={onModEnter}
      className='flex min-w-0 flex-col gap-4'
    >
      <Controller
        control={control}
        name='title'
        rules={{ validate: (v) => !!v.trim() }}
        render={({ field }) => (
          <Input
            name='task-title'
            placeholder='what needs doing'
            aria-label='task title'
            autoFocus
            autoComplete='off'
            className='min-h-11 text-lg'
            value={field.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
          />
        )}
      />

      <Controller
        control={control}
        name='description'
        render={({ field }) => (
          <DescriptionEditor
            ariaLabel='task description'
            placeholder='details'
            media={attachments}
            value={field.value}
            onChange={(next) => field.onChange(next)}
          />
        )}
      />

      <div className='flex flex-wrap gap-2'>
        <Controller
          control={control}
          name='status'
          render={({ field }) => (
            <StatusPick phone={phone} value={field.value} onChange={field.onChange} />
          )}
        />
        {/* ИСПОЛНИТЕЛЕЙ МОЖЕТ БЫТЬ НЕСКОЛЬКО; один `Controller` на весь список. */}
        <Controller
          control={control}
          name='assignees'
          render={({ field }) => (
            <AssigneesPick phone={phone} value={field.value} onChange={field.onChange} />
          )}
        />
        <Controller
          control={control}
          name='dueDate'
          render={({ field }) => (
            <DatePick
              phone={phone}
              name='due'
              title='due'
              emptyLabel='—'
              showName
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name='priority'
          render={({ field }) => (
            <PriorityPick phone={phone} value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <Button
        type='button'
        variant='default'
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((v) => !v)}
        className='flex min-h-11 w-full items-center justify-between border-y border-hairline text-micro uppercase tracking-label md:min-h-8'
      >
        <span>
          more
          {moreCount > 0 && <span className='text-labelColor'> · {moreCount}</span>}
        </span>
        <span aria-hidden>{moreOpen ? '▴' : '▾'}</span>
      </Button>

      {moreOpen && (
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-1.5'>
            <FieldLabel>labels</FieldLabel>
            <Controller
              control={control}
              name='labels'
              render={({ field }) => <LabelsField value={field.value} onChange={field.onChange} />}
            />
          </div>
          <div className='flex flex-col items-start gap-1.5'>
            <FieldLabel>planned start</FieldLabel>
            <Controller
              control={control}
              name='startDate'
              render={({ field }) => (
                <DatePick
                  phone={phone}
                  name='planned start'
                  title='planned start'
                  emptyLabel='pick a date'
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <FieldLabel>links &amp; files</FieldLabel>
            {/* Ссылки правятся все восемь разом, поэтому пишутся через setValue. Указания на
                медиа живут в своём поле формы и сохраняются той же кнопкой. */}
            <AttachField
              phone={phone}
              links={links}
              setLink={(f, v) => setValue(f, v as never, { shouldDirty: true })}
              fileIds={fileIds}
              setFileIds={(ids) => setValue('fileIds', ids, { shouldDirty: true })}
              mediaIds={mediaIds}
              setMediaIds={(ids) => setValue('mediaIds', ids, { shouldDirty: true })}
              annotations={values.mediaAnnotations ?? []}
              setAnnotations={(next) => setValue('mediaAnnotations', next, { shouldDirty: true })}
            />
          </div>
        </div>
      )}
    </form>
  );

  const confirm = (
    <ConfirmationModal
      open={confirmClose}
      onOpenChange={setConfirmClose}
      onConfirm={discard}
      onCancel={draftOn ? keepDraft : undefined}
      title='unsaved task'
      confirmLabel='discard'
      cancelLabel={draftOn ? 'keep draft' : 'keep editing'}
      width='sm'
    >
      {null}
    </ConfirmationModal>
  );

  if (phone) {
    return (
      <>
        <TaskPageShell
          open={open}
          onRequestClose={requestClose}
          title={mode === 'create' ? 'new task' : 'edit task'}
          headerRight={
            <div className='flex shrink-0 items-center gap-2'>
              {draftOn && dirty && (
                <Text size='nano' variant='label' component='span' className='uppercase'>
                  draft ✓
                </Text>
              )}
              {board}
            </div>
          }
          footer={
            <Button
              type='button'
              variant='main'
              size='lg'
              className='min-h-12 w-full uppercase'
              disabled={!canSubmit}
              onClick={submit}
            >
              {verb}
            </Button>
          }
        >
          {body}
        </TaskPageShell>
        {confirm}
      </>
    );
  }

  return (
    <>
      <ConfirmationModal
        open={open}
        onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}
        onConfirm={submit}
        title={mode === 'create' ? 'new task' : 'edit task'}
        headerActions={board}
        confirmLabel={verb}
        confirmDisabled={!canSubmit}
        // Сочетание подписано только там, где есть клавиатура с мышью: на тач-экране это шум.
        footerHint={finePointer ? `${SAVE_HOTKEY} · ${verb}` : undefined}
        closeOnConfirm={false}
        width='md'
      >
        {body}
      </ConfirmationModal>
      {confirm}
    </>
  );
}
