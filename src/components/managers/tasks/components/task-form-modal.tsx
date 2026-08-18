import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DatePicker } from 'ui/components/date-picker';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { orderedMedia } from '../api/tasksService';
import { TaskFormValues } from '../api/types';
import {
  BOARD_LABEL,
  BOARDS,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUSES,
  toOptions,
} from '../utils/meta';
import { AssigneeSelect } from './assignee-select';
import { LinkEditor } from './link-editor';
import { FileAttachments } from './file-attachments';
import { MediaAttachments } from './media-attachments';
import { MediaRefRow } from './media-ref-row';

/**
 * tskForm v2 — a real two-column editor inside the app's one modal shell
 * (ConfirmationModal). Title is the full-width headline; the left column carries the
 * writing (description / priority / dates), the right column the associations
 * (placement / assignee / labels / links / media). Links are the single type-first
 * picker (tskLinks v2), not seven stacked fields.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: TaskFormValues;
  saving?: boolean;
  onSubmit: (values: TaskFormValues) => void;
}

const boardOptions = toOptions(BOARDS, BOARD_LABEL);
const statusOptions = toOptions(STATUSES, STATUS_LABEL);
const priorityOptions = [
  { value: 'TASK_PRIORITY_UNKNOWN', label: 'no priority' },
  ...toOptions(PRIORITIES, PRIORITY_LABEL),
];

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {children}
    </label>
  );
}

export function TaskFormModal({ open, onOpenChange, mode, initial, saving, onSubmit }: Props) {
  const {
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({ defaultValues: initial });

  // Reseed when the modal opens for a different task / column.
  useEffect(() => {
    if (open) reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // The combined type-first link picker edits all seven FKs at once, so it reads them
  // via useWatch and writes them back through setValue rather than one Controller each.
  const links = {
    techCardId: useWatch({ control, name: 'techCardId' }),
    productId: useWatch({ control, name: 'productId' }),
    orderUuid: useWatch({ control, name: 'orderUuid' }),
    archiveId: useWatch({ control, name: 'archiveId' }),
    fittingId: useWatch({ control, name: 'fittingId' }),
    sampleId: useWatch({ control, name: 'sampleId' }),
    productionRunId: useWatch({ control, name: 'productionRunId' }),
  };

  // Вставка ссылки правит поле СНАРУЖИ Controller'а: она меняет строку целиком и возвращает
  // каретку, поэтому значение читается через useWatch, а пишется через setValue — с
  // `shouldDirty`, иначе форма посчитала бы себя нетронутой и правку было бы не сохранить.
  const description = useWatch({ control, name: 'description' });
  const mediaIds = useWatch({ control, name: 'mediaIds' });
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const attachments = useMemo(() => orderedMedia(mediaIds ?? []), [mediaIds]);
  const mediaAnnotations = useWatch({ control, name: 'mediaAnnotations' }) ?? [];

  /**
   * ⌘/CTRL+ENTER СОХРАНЯЕТ КАРТОЧКУ.
   *
   * Голый Enter отправителем здесь не будет: половина формы — многострочное описание, и
   * «сохранить» на той же клавише, что «новая строка», двусмысленно по построению. Раньше
   * неявная отправка тут была, но случайной: первой кнопкой формы оказывалась «attach», и
   * Enter в заголовке ОДНОВРЕМЕННО открывал пикер и отправлял карточку.
   *
   * Обработчик висит НА ФОРМЕ, а не на двух полях: клавиатурное обещание раздела — про всю
   * форму, и заводить его отдельно на заголовке, описании и метках значило бы три копии
   * одной проверки. Проверка перед отправкой — та же, что у кнопки подвала
   * (`confirmDisabled={saving}`), иначе клавиша умеет то, чего не умеет кнопка.
   */
  const onModEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
    // ПОРТАЛ — НЕ ПОДДЕРЕВО ФОРМЫ В DOM, НО ВСПЛЫВАЕТ СЮДА. События react'а идут по дереву
    // КОМПОНЕНТОВ, а пикер файлов, библиотека медиа и редактор указаний рисуются
    // `<Portal>`ами внутри этой формы: без проверки ⌘Enter в поиске пикера сохранял бы
    // карточку ПОД ним и закрывал форму из-под открытого поверх неё окна. По DOM же
    // портал лежит в `body`, и `contains` отсекает ровно его.
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.preventDefault();
    if (saving) return;
    handleSubmit(onSubmit)();
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => handleSubmit(onSubmit)()}
      title={mode === 'create' ? 'new task' : 'edit task'}
      confirmLabel={mode === 'create' ? 'create' : 'save'}
      confirmDisabled={saving}
      // Неподписанное сочетание — то же, что отсутствующее: о нём узнают только те, кто
      // читал этот файл. Место — у самой кнопки, которую оно заменяет.
      footerHint={`${SAVE_HOTKEY} ${mode === 'create' ? 'creates' : 'saves'}`}
      closeOnConfirm={false}
      width='lg'
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={onModEnter}
        className='flex flex-col gap-4'
      >
        <div className='flex flex-col gap-1'>
          <Controller
            control={control}
            name='title'
            rules={{ required: true }}
            render={({ field }) => (
              <Input
                placeholder='task title'
                aria-label='task title'
                autoFocus
                className='text-lg'
                value={field.value}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  field.onChange(e.target.value)
                }
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.title && (
            <Text size='micro' variant='error' component='span'>
              title is required
            </Text>
          )}
        </div>

        <div className='grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2'>
          {/* Left — the writing */}
          <div className='flex min-w-0 flex-col gap-3'>
            <div className='flex flex-col gap-1'>
              <Field label='description'>
                <Controller
                  control={control}
                  name='description'
                  render={({ field }) => (
                    <Textarea
                      ref={descriptionRef}
                      variant='secondary'
                      placeholder='add details or acceptance criteria…'
                      className='mb-0 min-h-32 border border-borderColor'
                      value={field.value}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        field.onChange(e.target.value)
                      }
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </Field>
              {/* Ряд стоит ПОД полем, а не рядом с вложениями в правой колонке: вставляют его в
                  текст, и рука не должна уходить через весь модал к списку вложений. Снаружи
                  `<label>`: кнопка внутри подписи к полю — это второй адресат одного клика. */}
              <MediaRefRow
                media={attachments}
                targetRef={descriptionRef}
                value={description ?? ''}
                onChange={(next) => setValue('description', next, { shouldDirty: true })}
              />
            </div>
            <Field label='priority'>
              <Controller
                control={control}
                name='priority'
                render={({ field }) => (
                  <SelectComponent
                    name='priority'
                    items={priorityOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder='priority'
                    fullWidth
                  />
                )}
              />
            </Field>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='planned start'>
                <Controller
                  control={control}
                  name='startDate'
                  render={({ field }) => (
                    <DatePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(d) => field.onChange(d ? d.toISOString() : undefined)}
                    />
                  )}
                />
              </Field>
              <Field label='due date'>
                <Controller
                  control={control}
                  name='dueDate'
                  render={({ field }) => (
                    <DatePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(d) => field.onChange(d ? d.toISOString() : undefined)}
                    />
                  )}
                />
              </Field>
            </div>
          </div>

          {/* Right — the associations */}
          <div className='flex min-w-0 flex-col gap-3'>
            <div className='grid grid-cols-2 gap-3'>
              <Field label='board'>
                <Controller
                  control={control}
                  name='board'
                  render={({ field }) => (
                    <SelectComponent
                      name='board'
                      items={boardOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder='board'
                      fullWidth
                    />
                  )}
                />
              </Field>
              <Field label='column'>
                <Controller
                  control={control}
                  name='status'
                  render={({ field }) => (
                    <SelectComponent
                      name='status'
                      items={statusOptions}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder='column'
                      fullWidth
                    />
                  )}
                />
              </Field>
            </div>
            <Field label='assignee'>
              <Controller
                control={control}
                name='assignee'
                render={({ field }) => (
                  <AssigneeSelect value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
            <Field label='labels (comma separated)'>
              <Controller
                control={control}
                name='labels'
                render={({ field }) => (
                  <Input
                    name='labels'
                    placeholder='fw26, urgent, drop-3'
                    value={field.value.join(', ')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      field.onChange(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                )}
              />
            </Field>
            <Field label='links'>
              <LinkEditor
                links={links}
                setLink={(f, v) => setValue(f, v as never, { shouldDirty: true })}
              />
            </Field>
            {/* Одно поле «attachments» на два источника. Разделение публичного медиа-бакета
                и приватной библиотеки — факт хранилища, а не различие, которое человек
                должен держать в голове, заполняя карточку. Подпись «site media» говорит
                единственное, что здесь практически важно: это уедет на CDN.

                ЯЗЫК ЭКРАНА, А НЕ ЯЗЫК ВОЛНЫ: раздел задач английский целиком, и подписи
                блока, пришедшего сюда из русского раздела «файлы», английские — как у
                плиток вложений на самой карточке (`task-detail/attachment-tiles.tsx`). */}
            <Field label='attachments'>
              <div className='flex flex-col gap-2.5'>
                <div className='flex flex-col gap-1'>
                  <Text size='micro' variant='label' className='uppercase'>
                    site media · public
                  </Text>
                  <Controller
                    control={control}
                    name='mediaIds'
                    render={({ field }) => (
                      <MediaAttachments
                        value={field.value}
                        onChange={field.onChange}
                        // Указания живут в СВОЁМ поле формы, а не внутри списка вложений: сервер
                        // заменяет их вместе с содержимым карточки, и сохраняет их та же кнопка.
                        annotations={mediaAnnotations}
                        onAnnotationsChange={(next) =>
                          setValue('mediaAnnotations', next, { shouldDirty: true })
                        }
                      />
                    )}
                  />
                </div>
                <Controller
                  control={control}
                  name='fileIds'
                  render={({ field }) => (
                    <FileAttachments value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
            </Field>
          </div>
        </div>
      </form>
    </ConfirmationModal>
  );
}
