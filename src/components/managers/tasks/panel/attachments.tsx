import { useQueries, useQuery } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { filesService } from 'components/managers/files/api/filesService';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { ROUTES, SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { type ChangeEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Close, Dropdown, EmptyCell, Iconoir, Input, Media, Progress, Text } from 'ui';
import { orderedMedia } from '../api/tasksService';
import type { Task, TaskMedia } from '../api/types';
import { EntityPicker } from '../components/entity-picker';
import { FilePicker } from '../components/file-attachments';
import { isSet, LINK_TYPES, type LinkField, type LinkType } from '../components/link-editor';
import { mergePickedMedia } from '../components/media-attachments';
import { useTaskMediaViewer } from '../components/task-media-viewer';
import { useTaskAttachmentIntake } from '../hooks/useTaskAttachmentIntake';
import { useInlineTaskPatch } from '../hooks/useTasks';
import { taskFileViewOf } from '../task-detail/file-view/file-view';
import { TaskFileViewer } from '../task-detail/file-view/task-file-viewer';
import type { TaskPanelValues } from './task-session';

const TILE =
  'relative grid aspect-square w-full min-w-0 place-items-center overflow-hidden bg-segOff text-placeholder transition-colors duration-500 ease-soft motion-safe:animate-[tasks-slide-in_700ms_var(--ease-soft)_both]';
const ADD_OPTIONS = [
  { value: 'upload', label: 'Upload File' },
  { value: 'library', label: 'Library File' },
  { value: 'media', label: 'Site Media' },
];

/** The grey `+` tile: opens the three ways in — a file from the device, the library, site media. */
function AddTile({ onPick, disabled }: { onPick: (how: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dropdown
      floating
      label='Attach'
      open={open}
      onOpenChange={setOpen}
      options={ADD_OPTIONS}
      onChange={(how) => {
        setOpen(false);
        // The popover gives focus back first, then the picker opens.
        if (how) setTimeout(() => onPick(how), 0);
      }}
      disabled={disabled}
      trigger={
        <Button
          type='button'
          variant='default'
          aria-label='add attachment'
          disabled={disabled}
          className={cn(TILE, 'cursor-pointer hover:text-ink disabled:cursor-default')}
        >
          <Iconoir name='plus' strokeWidth={1.2} className='size-6' />
        </Button>
      }
    />
  );
}

function Removable({
  onRemove,
  label,
  children,
}: {
  onRemove?: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className='group/tile relative min-w-0'>
      {children}
      {onRemove && (
        <span className='absolute top-1 right-1 bg-bgColor opacity-0 transition-opacity duration-500 ease-soft group-hover/tile:opacity-100 group-focus-within/tile:opacity-100'>
          <Close size='sm' aria-label={label} onClick={onRemove} />
        </span>
      )}
    </div>
  );
}

function fileExt(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : 'FILE';
}

/**
 * The 4-up grid of square tiles (frame: grey `#F5F5F5`-like `segOff` squares with a grey `+`).
 * Pictures show their frame, files their name and type; the last tiles of the row are `+` doors.
 */
function Grid({
  media,
  files,
  fileName,
  onOpenMedia,
  onOpenFile,
  onRemoveMedia,
  onRemoveFile,
  onAdd,
  addDisabled,
}: {
  media: TaskMedia[];
  files: { id: number; name: string; file?: LibraryFile }[];
  fileName?: (id: number) => string;
  onOpenMedia: (index: number) => void;
  onOpenFile?: (file: LibraryFile) => void;
  onRemoveMedia?: (id: number) => void;
  onRemoveFile?: (id: number) => void;
  onAdd?: (how: string) => void;
  addDisabled?: boolean;
}) {
  const filled = media.length + files.length;
  // At least one door, and the row filled up to four.
  const doors = onAdd ? Math.max(1, (4 - (filled % 4)) % 4 || (filled === 0 ? 4 : 1)) : 0;
  return (
    <div className='grid grid-cols-4 gap-1.5'>
      {media.map((m, i) => {
        const thumb = m.thumbnail || m.fullSize || '';
        return (
          <Removable
            key={`m-${i}-${m.id}`}
            label={`remove picture ${i + 1}`}
            onRemove={onRemoveMedia ? () => onRemoveMedia(m.id) : undefined}
          >
            <Button
              type='button'
              variant='default'
              aria-label={`picture ${i + 1} of ${media.length}`}
              disabled={!thumb}
              onClick={() => onOpenMedia(i)}
              className={cn(TILE, 'cursor-zoom-in')}
            >
              {thumb ? <Media src={thumb} alt='' aspectRatio='1/1' fit='cover' /> : <EmptyCell />}
            </Button>
          </Removable>
        );
      })}
      {files.map((f) => (
        <Removable
          key={`f-${f.id}`}
          label={`remove ${f.name}`}
          onRemove={onRemoveFile ? () => onRemoveFile(f.id) : undefined}
        >
          <Button
            type='button'
            variant='default'
            title={f.name}
            disabled={!f.file || !onOpenFile}
            onClick={() => f.file && onOpenFile?.(f.file)}
            className={cn(TILE, 'cursor-pointer content-center gap-1 p-2 text-center')}
          >
            <Text component='span' size='micro' className='text-placeholder'>
              {fileExt(f.name)}
            </Text>
            <Text component='span' className='line-clamp-3 break-all text-textBaseSize text-ink'>
              {f.name || fileName?.(f.id)}
            </Text>
          </Button>
        </Removable>
      ))}
      {Array.from({ length: doors }, (_, i) => (
        <AddTile key={`add-${i}`} onPick={(how) => onAdd?.(how)} disabled={addDisabled} />
      ))}
    </div>
  );
}

/** Links of the task (tech card, product, order, …): one row each, and «+ Add a Link». */
function LinkRow({
  type,
  value,
  onRemove,
}: {
  type: LinkType;
  value: number | string;
  onRemove?: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['tasks', 'link-editor', type.field, value],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => type.config.resolve(value),
  });
  return (
    <div className='flex min-h-9 items-center gap-3 border-b border-hairline px-2 text-textBaseSize motion-safe:animate-[tasks-slide-in_700ms_var(--ease-soft)_both]'>
      <span className='w-24 shrink-0 truncate text-placeholder'>{type.label}</span>
      <span className='min-w-0 flex-1 truncate text-ink'>{data?.label ?? `#${value}`}</span>
      {onRemove && <Close size='sm' aria-label={`remove ${type.label}`} onClick={onRemove} />}
    </div>
  );
}

function LinksField({ writer }: { writer: boolean }) {
  const { control, setValue } = useFormContext<TaskPanelValues>();
  const values = useWatch({ control });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LinkType | null>(null);
  const set = LINK_TYPES.filter((t) =>
    isSet((values[t.field] ?? t.config.empty) as number | string, t.config.empty),
  );
  const setLink = (field: LinkField, v: number | string) =>
    setValue(field, v as never, { shouldDirty: true });
  return (
    <div className='mt-6 flex flex-col'>
      {set.map((t) => (
        <LinkRow
          key={t.field}
          type={t}
          value={values[t.field] as number | string}
          onRemove={writer ? () => setLink(t.field, t.config.empty) : undefined}
        />
      ))}
      {writer && (
        <Dropdown
          label='Add a Link'
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setType(null);
          }}
          options={LINK_TYPES.map((t) => ({ value: t.field, label: t.label }))}
          value={type?.field ?? null}
          onChange={(field) => {
            setType(LINK_TYPES.find((t) => t.field === field) ?? null);
            setOpen(false);
          }}
        />
      )}
      {writer && type && (
        <div className='mt-2 motion-safe:animate-[tasks-slide-in_700ms_var(--ease-soft)_both]'>
          <EntityPicker
            key={type.field}
            config={type.config}
            value={type.config.empty}
            onChange={(v) => {
              setLink(type.field, v);
              setType(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Opens a stored attachment the way the task page always did (see `attachment-tiles.tsx`). */
function useOpenFile(taskId: number) {
  const { canRead } = usePermissions();
  const mayOpenLibrary = canRead(SECTION.files);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const open = (f: LibraryFile) => {
    const view = taskFileViewOf(f.fileName, f.contentType);
    if (view !== 'as-is' && view !== 'download') return setViewingId(f.id ?? null);
    if (view === 'download' && f.downloadUrl) {
      window.open(f.downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (mayOpenLibrary) {
      window.open(`${ROUTES.files}/${f.id}`, '_blank', 'noopener,noreferrer');
      return;
    }
    const url = f.url || f.downloadUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    notify({
      sev: 'error',
      subject: `FILE${f.id ? ` ${f.id}` : ''}`,
      text: 'not opened',
      detail: 'no link',
    });
  };
  return {
    open,
    node: (files: LibraryFile[]) => {
      const viewing = viewingId == null ? undefined : files.find((f) => f.id === viewingId);
      return viewing ? (
        <TaskFileViewer taskId={taskId} file={viewing} onClose={() => setViewingId(null)} />
      ) : null;
    },
  };
}

/** The hidden doors the `+` tile opens. */
function useDoors({
  fileIds,
  mediaIds,
  setFileIds,
  setMediaIds,
  openFiles,
}: {
  fileIds: number[];
  mediaIds: number[];
  setFileIds: (ids: number[]) => void;
  setMediaIds: (ids: number[]) => void;
  openFiles: (files: File[]) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const mediaTrigger = useRef<HTMLButtonElement>(null);
  const [library, setLibrary] = useState(false);
  const pick = (how: string) => {
    if (how === 'upload') upload.current?.click();
    else if (how === 'media') mediaTrigger.current?.click();
    else setLibrary(true);
  };
  const node = (
    <>
      <Input
        ref={upload}
        type='file'
        multiple
        hidden
        name='task-attachment-upload'
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          openFiles(files);
        }}
      />
      <MediaSelector
        label='site media'
        purpose='attachment'
        aspectRatio={['Custom']}
        allowMultiple
        showVideos
        saveSelectedMedia={(picked) => {
          const next = mergePickedMedia(mediaIds, picked);
          if (next !== mediaIds) setMediaIds(next);
        }}
        trigger={
          <Button ref={mediaTrigger} type='button' tabIndex={-1} aria-hidden className='sr-only'>
            site media
          </Button>
        }
      />
      {library && (
        <FilePicker selected={fileIds} onClose={() => setLibrary(false)} onDone={setFileIds} />
      )}
    </>
  );
  return { pick, node };
}

function IntakeProgress({ busy, progress }: { busy: boolean; progress: number }) {
  if (!busy) return null;
  return (
    <div className='mb-3 flex flex-col gap-1.5'>
      <Text className='text-placeholder'>Adding Files</Text>
      <Progress value={progress} />
    </div>
  );
}

/**
 * Attachments of a STORED task: written at once through the inline patch (the only safe door for
 * content writes — see `useInlineTaskPatch`), as the task page did; uploads land the same way.
 */
function StoredAttachments({ task, writer }: { task: Task; writer: boolean }) {
  const inline = useInlineTaskPatch(task.id);
  const taskRef = useRef(task);
  taskRef.current = task;
  const patch = async (key: 'mediaIds' | 'fileIds', next: number[]) => {
    const seen = taskRef.current.task[key];
    try {
      await inline.mutateAsync({
        patch: { [key]: next },
        base: { ...taskRef.current.task, [key]: seen },
      });
      taskRef.current = { ...taskRef.current, task: { ...taskRef.current.task, [key]: next } };
      return true;
    } catch {
      return false;
    }
  };
  const intake = useTaskAttachmentIntake({
    enabled: writer,
    onMedia: async (id) => {
      const ids = taskRef.current.task.mediaIds;
      if (ids.includes(id)) return;
      if (!(await patch('mediaIds', [...ids, id]))) throw new Error('not attached');
    },
    onFile: async (id) => {
      const ids = taskRef.current.task.fileIds;
      if (ids.includes(id)) return;
      if (!(await patch('fileIds', [...ids, id]))) throw new Error('not attached');
    },
  });
  const media = useMemo(() => orderedMedia(task.task.mediaIds), [task.task.mediaIds]);
  const viewer = useTaskMediaViewer({ media });
  const files = useOpenFile(task.id);
  const doors = useDoors({
    fileIds: task.task.fileIds,
    mediaIds: task.task.mediaIds,
    setFileIds: (ids) => void patch('fileIds', ids),
    setMediaIds: (ids) => void patch('mediaIds', ids),
    openFiles: intake.openFiles,
  });
  return (
    <div {...intake.dropProps} className='relative'>
      <IntakeProgress busy={intake.busy} progress={intake.progress} />
      <Grid
        media={media}
        files={task.files.map((f) => ({
          id: Number(f.id),
          name: f.fileName ?? `#${f.id}`,
          file: f,
        }))}
        onOpenMedia={viewer.openIndex}
        onOpenFile={files.open}
        onRemoveMedia={
          writer
            ? (id) =>
                void patch(
                  'mediaIds',
                  task.task.mediaIds.filter((x) => x !== id),
                )
            : undefined
        }
        onRemoveFile={
          writer
            ? (id) =>
                void patch(
                  'fileIds',
                  task.task.fileIds.filter((x) => x !== id),
                )
            : undefined
        }
        onAdd={writer ? doors.pick : undefined}
        addDisabled={inline.isPending}
      />
      {intake.dragging && (
        <div className='pointer-events-none absolute inset-0 grid place-items-center bg-note'>
          <Text className='text-noteInk'>Drop Files</Text>
        </div>
      )}
      {doors.node}
      {viewer.node}
      {files.node(task.files)}
    </div>
  );
}

/** Attachments of a NEW task: kept in the form, sent with the create. */
function DraftAttachments() {
  const { control, getValues, setValue } = useFormContext<TaskPanelValues>();
  const mediaIds = (useWatch({ control, name: 'mediaIds' }) ?? []) as number[];
  const fileIds = (useWatch({ control, name: 'fileIds' }) ?? []) as number[];
  const setIds = (key: 'mediaIds' | 'fileIds', ids: number[]) =>
    setValue(key, ids, { shouldDirty: true });
  const intake = useTaskAttachmentIntake({
    enabled: true,
    onMedia: (id) => {
      const ids = getValues('mediaIds') ?? [];
      if (!ids.includes(id)) setIds('mediaIds', [...ids, id]);
    },
    onFile: (id) => {
      const ids = getValues('fileIds') ?? [];
      if (!ids.includes(id)) setIds('fileIds', [...ids, id]);
    },
  });
  const media = useMemo(() => orderedMedia(mediaIds), [mediaIds]);
  const viewer = useTaskMediaViewer({ media });
  const named = useQueries({
    queries: fileIds.map((id) => ({
      queryKey: filesKeys.file(id),
      queryFn: () => filesService.getFile(id),
      staleTime: 30 * 60 * 1000,
    })),
  });
  const nameOf = (id: number) =>
    named.map((q) => q.data?.file).find((f): f is LibraryFile => !!f && Number(f.id) === id)
      ?.fileName ?? `#${id}`;
  const doors = useDoors({
    fileIds,
    mediaIds,
    setFileIds: (ids) => setIds('fileIds', ids),
    setMediaIds: (ids) => setIds('mediaIds', ids),
    openFiles: intake.openFiles,
  });
  return (
    <div {...intake.dropProps} className='relative'>
      <IntakeProgress busy={intake.busy} progress={intake.progress} />
      <Grid
        media={media}
        files={fileIds.map((id) => ({ id, name: nameOf(id) }))}
        onOpenMedia={viewer.openIndex}
        onRemoveMedia={(id) =>
          setIds(
            'mediaIds',
            mediaIds.filter((x) => x !== id),
          )
        }
        onRemoveFile={(id) =>
          setIds(
            'fileIds',
            fileIds.filter((x) => x !== id),
          )
        }
        onAdd={doors.pick}
      />
      {intake.dragging && (
        <div className='pointer-events-none absolute inset-0 grid place-items-center bg-note'>
          <Text className='text-noteInk'>Drop Files</Text>
        </div>
      )}
      {doors.node}
      {viewer.node}
    </div>
  );
}

export function AttachmentsFields({ task, writer }: { task?: Task; writer: boolean }) {
  return (
    <div className='flex flex-col'>
      {task ? <StoredAttachments task={task} writer={writer} /> : <DraftAttachments />}
      <LinksField writer={writer} />
    </div>
  );
}
