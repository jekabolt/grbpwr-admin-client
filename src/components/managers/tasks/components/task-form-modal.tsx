import * as Dialog from '@radix-ui/react-dialog';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { DatePicker } from 'ui/components/date-picker';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
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
import {
  archiveConfig,
  fittingConfig,
  orderConfig,
  productConfig,
  runConfig,
  sampleConfig,
  techCardConfig,
} from '../utils/entity-configs';
import { AssigneeSelect } from './assignee-select';
import { EntityPicker } from './entity-picker';
import { MediaAttachments } from './media-attachments';

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1'>
      <Text variant='label' size='small' component='span'>
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
    formState: { errors },
  } = useForm<TaskFormValues>({ defaultValues: initial });

  // Reseed when the modal opens for a different task / column.
  useEffect(() => {
    if (open) reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          aria-describedby={undefined}
          className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[92vh] w-auto -translate-y-1/2 flex-col overflow-hidden border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[34rem] lg:-translate-x-1/2'
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className='flex items-center justify-between gap-2 border-b border-textInactiveColor px-4 py-3'>
            <Dialog.Title className='text-lg uppercase'>
              {mode === 'create' ? 'new task' : 'edit task'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button type='button' aria-label='close'>
                [x]
              </Button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4'
          >
            <div className='flex flex-col gap-1'>
              <Controller
                control={control}
                name='title'
                rules={{ required: true }}
                render={({ field }) => (
                  <Input
                    placeholder='Task title'
                    aria-label='task title'
                    autoFocus
                    className='border-textInactiveColor pb-1 text-lg'
                    value={field.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      field.onChange(e.target.value)
                    }
                    onBlur={field.onBlur}
                  />
                )}
              />
              {errors.title && (
                <Text variant='error' size='small'>
                  title is required
                </Text>
              )}
            </div>

            <Field label='description'>
              <Controller
                control={control}
                name='description'
                render={({ field }) => (
                  <Textarea
                    variant='secondary'
                    placeholder='Add details or acceptance criteria…'
                    className='mb-0 min-h-24 border-b border-textInactiveColor'
                    value={field.value}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      field.onChange(e.target.value)
                    }
                    onBlur={field.onBlur}
                  />
                )}
              />
            </Field>

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
              <Field label='start date'>
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

            <Field label='attachments'>
              <Controller
                control={control}
                name='mediaIds'
                render={({ field }) => (
                  <MediaAttachments value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>

            <details className='border-t border-textInactiveColor pt-2'>
              <summary className='cursor-pointer text-textBaseSize uppercase text-labelColor'>
                links (optional)
              </summary>
              <div className='mt-3 flex flex-col gap-3'>
                <Field label='техкарта'>
                  <Controller
                    control={control}
                    name='techCardId'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={techCardConfig}
                      />
                    )}
                  />
                </Field>
                <Field label='product'>
                  <Controller
                    control={control}
                    name='productId'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={productConfig}
                      />
                    )}
                  />
                </Field>
                <Field label='примерка'>
                  <Controller
                    control={control}
                    name='fittingId'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={fittingConfig}
                      />
                    )}
                  />
                </Field>
                <Field label='образец'>
                  <Controller
                    control={control}
                    name='sampleId'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={sampleConfig}
                      />
                    )}
                  />
                </Field>
                <Field label='партия'>
                  <Controller
                    control={control}
                    name='productionRunId'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={runConfig}
                      />
                    )}
                  />
                </Field>
                <Field label='order'>
                  <Controller
                    control={control}
                    name='orderUuid'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={orderConfig}
                      />
                    )}
                  />
                </Field>
                <Field label='timeline drop'>
                  <Controller
                    control={control}
                    name='archiveId'
                    render={({ field }) => (
                      <EntityPicker
                        value={field.value}
                        onChange={field.onChange}
                        config={archiveConfig}
                      />
                    )}
                  />
                </Field>
              </div>
            </details>
          </form>

          <div className='flex justify-end gap-2 border-t border-textInactiveColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              loading={saving}
              onClick={handleSubmit(onSubmit)}
            >
              {mode === 'create' ? 'create' : 'save'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
