import { useQueryClient } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FormatBar } from 'components/managers/files/note/format-bar';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { SECTION } from 'constants/routes';
import { format, startOfDay } from 'date-fns';
import { useContext, useMemo, useRef, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { Button, Dropdown, LineInputField, NoteBlock, Segmented, Text, WheelDatePicker } from 'ui';
import { orderedMedia } from '../api/tasksService';
import type { Task, TaskPriority, TaskStatus } from '../api/types';
import { TaskDescriptionView } from '../components/task-description';
import { useAddTaskBoard, useTaskBoards, tasksKeys } from '../hooks/useTasks';
import { SheetEmbedsContext } from '../task-detail/file-view/sheet-context';
import { COLUMN_LABEL, PRIORITIES, PRIORITY_TITLE, STATUSES } from '../utils/meta';
import type { TaskPanelValues } from './task-session';

const DESCRIPTION_MAX = 20000;

/** «What's need to be done» — the owner's frame copy. */
export function TitleField() {
  return <LineInputField name='title' placeholder={"What's need to be done"} autoComplete='off' />;
}

/**
 * TASK DESCRIPTION: the yellow `NoteBlock` (Upload a Text File, Write Here…) and under it the
 * description editor's tools as a row of square yellow tiles (`FormatBar tiles` — the same edits as
 * the library notes and the old task form: bold, italic, heading, lists, quote, code, link, file,
 * file preview, table, media, and the markdown preview).
 */
export function DescriptionField() {
  const { control, getValues, setValue } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'description' });
  const area = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);
  const mediaIds = (useWatch({ control, name: 'mediaIds' }) ?? []) as number[];
  const media = useMemo(() => orderedMedia(mediaIds), [mediaIds]);
  const embeds = useContext(SheetEmbedsContext);
  // A new task has no files yet: a table goes into the form's set and lands with the create.
  const attachTable = embeds
    ? (file: LibraryFile) => embeds.attachFile(Number(file.id))
    : async (file: LibraryFile) => {
        const id = Number(file.id);
        const ids = getValues('fileIds') ?? [];
        if (!ids.includes(id)) setValue('fileIds', [...ids, id], { shouldDirty: true });
        return true;
      };
  const value = field.value ?? '';

  return (
    <div className='flex flex-col gap-1'>
      {preview ? (
        <div className='min-h-32 bg-note p-2 text-textBaseSize text-ink'>
          {value.trim() ? (
            <TaskDescriptionView text={value} media={media} />
          ) : (
            <Text className='text-noteInk'>Write Here...</Text>
          )}
        </div>
      ) : (
        <NoteBlock
          ref={(node) => {
            area.current = node;
            field.ref(node);
          }}
          name={field.name}
          value={value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          maxLength={DESCRIPTION_MAX}
          placeholder='Write Here...'
          aria-label='task description'
          uploadLabel='Upload a Text File'
          onUploadText={(text) => {
            const clean = text.replace(/\r\n/g, '\n').trim();
            field.onChange(value.trim() ? `${value.trimEnd()}\n\n${clean}` : clean);
          }}
          className='max-h-[60vh] overflow-y-auto'
        />
      )}
      <FormatBar
        tiles={{ previewing: preview }}
        areaRef={area}
        value={value}
        onChange={(next) => field.onChange(next)}
        onTogglePreview={() => setPreview((p) => !p)}
        attachTable={attachTable}
      />
    </div>
  );
}

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: COLUMN_LABEL[s] }));

export function StatusField() {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'status' });
  return (
    <Dropdown
      label='Status'
      options={STATUS_OPTIONS}
      value={field.value}
      onChange={(next) => next && field.onChange(next as TaskStatus)}
    />
  );
}

/** Category = the board (Development, Design, …); «+ Add Custom Board» creates one by the typed name. */
export function CategoryField() {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'boardId' });
  const { data: boards } = useTaskBoards();
  const addBoard = useAddTaskBoard();
  const [open, setOpen] = useState(false);
  const writer = usePermissions().canWrite(SECTION.tasks);
  const options = useMemo(
    () => (boards ?? []).map((b) => ({ value: String(b.id), label: b.name })),
    [boards],
  );
  return (
    <Dropdown
      label='Category'
      searchable
      open={open}
      onOpenChange={setOpen}
      options={options}
      value={field.value ? String(field.value) : null}
      onChange={(next) => next && field.onChange(Number(next))}
      addLabel={writer ? 'Add Custom Board' : undefined}
      onAdd={
        writer
          ? (name) => {
              if (!name) return;
              void addBoard.mutateAsync(name).then((created) => {
                if (created.id) field.onChange(created.id);
                setOpen(false);
              });
            }
          : undefined
      }
    />
  );
}

const PRIORITY_ITEMS = [
  { value: 'TASK_PRIORITY_UNKNOWN', label: PRIORITY_TITLE.TASK_PRIORITY_UNKNOWN },
  ...PRIORITIES.map((p) => ({ value: p as string, label: PRIORITY_TITLE[p] })),
];

export function PriorityField() {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'priority' });
  return (
    <Segmented
      items={PRIORITY_ITEMS}
      value={field.value}
      onChange={(next) => field.onChange((next || 'TASK_PRIORITY_UNKNOWN') as TaskPriority)}
      label='priority'
    />
  );
}

/** A date field on the Dropdown's line: `+` opens the wheel picker under it; «Clear» empties it. */
function DateField({ name, label }: { name: 'dueDate' | 'startDate'; label: string }) {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name });
  const [open, setOpen] = useState(false);
  const date = field.value ? new Date(field.value) : undefined;
  const valid = date && !Number.isNaN(date.getTime()) ? date : undefined;
  return (
    <Dropdown
      label={label}
      open={open}
      onOpenChange={setOpen}
      display={valid ? format(valid, 'MMM d, yyyy') : undefined}
    >
      <div className='flex flex-col gap-2 px-2 py-2'>
        <WheelDatePicker
          size='compact'
          open={open}
          value={valid}
          onChange={(d) => field.onChange(startOfDay(d).toISOString())}
        />
        {valid && (
          <Button
            type='button'
            variant='default'
            onClick={() => {
              field.onChange(undefined);
              setOpen(false);
            }}
            className='cursor-pointer self-start text-textBaseSize text-placeholder transition-colors duration-500 ease-soft hover:text-ink press:translate-y-0 press:bg-transparent press:text-ink'
          >
            Clear
          </Button>
        )}
      </div>
    </Dropdown>
  );
}

export function DueDateField() {
  return <DateField name='dueDate' label='Due Date' />;
}

export function StartDateField() {
  return <DateField name='startDate' label='Start Date' />;
}

export function AssigneesField() {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'assignees' });
  const { data } = useAdmins();
  const me = usePermissions().account?.username;
  const value = (field.value ?? []) as string[];
  const options = useMemo(() => {
    const admins = (data?.admins ?? []).map((a) => a.username).filter((n): n is string => !!n);
    const known = new Set(admins);
    // An assigned but disabled person stays a row — otherwise a save would drop them silently.
    return [...admins, ...value.filter((n) => !known.has(n))].map((n) => ({ value: n, label: n }));
  }, [data, value]);
  return (
    <Dropdown
      label='Assignees'
      multiple
      searchable
      options={options}
      values={value}
      onValuesChange={field.onChange}
      addLabel={me && !value.includes(me) ? 'Assign Me' : undefined}
      onAdd={me && !value.includes(me) ? () => field.onChange([...value, me]) : undefined}
    />
  );
}

/** Labels used on tasks this tab has read — most used first. */
function useKnownLabels(): string[] {
  const qc = useQueryClient();
  return useMemo(() => {
    const counts = new Map<string, number>();
    const add = (t: Partial<Task> | undefined) => {
      for (const l of t?.task?.labels ?? []) counts.set(l, (counts.get(l) ?? 0) + 1);
    };
    for (const [, data] of qc.getQueriesData<unknown>({ queryKey: tasksKeys.all })) {
      if (!data || typeof data !== 'object') continue;
      const d = data as { tasks?: Task[]; task?: unknown };
      if (Array.isArray(d.tasks)) d.tasks.forEach(add);
      else if (d.task) add(d as Partial<Task>);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  }, [qc]);
}

export function LabelsField() {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'labels' });
  const value = (field.value ?? []) as string[];
  const known = useKnownLabels();
  const [query, setQuery] = useState('');
  const options = useMemo(
    () => [...new Set([...value, ...known])].map((l) => ({ value: l, label: l })),
    [known, value],
  );
  const typed = query.trim();
  return (
    <Dropdown
      label='Labels'
      multiple
      searchable
      query={query}
      onQueryChange={setQuery}
      options={options}
      values={value}
      onValuesChange={field.onChange}
      addLabel={typed && !value.includes(typed) ? `Add ${typed}` : undefined}
      onAdd={
        typed && !value.includes(typed)
          ? () => {
              field.onChange([...value, typed]);
              setQuery('');
            }
          : undefined
      }
    />
  );
}

/** The body of Required Info, in the frame's order. */
export function RequiredInfoFields() {
  return (
    <div className='@container flex flex-col'>
      <TitleField />
      <Text component='h3' className='mt-8 mb-2 text-ink'>
        Task Description
      </Text>
      <DescriptionField />
      <div className='mt-8 grid grid-cols-1 items-start gap-x-2.5 gap-y-4 @[28rem]:grid-cols-2'>
        <StatusField />
        <CategoryField />
      </div>
      <div className='mt-6'>
        <PriorityField />
      </div>
      <div className='mt-6 grid grid-cols-1 items-start gap-x-2.5 gap-y-4 @[28rem]:grid-cols-2'>
        <DueDateField />
        <AssigneesField />
        <StartDateField />
        <LabelsField />
      </div>
    </div>
  );
}
