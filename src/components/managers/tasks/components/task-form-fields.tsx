import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { filesService } from 'components/managers/files/api/filesService';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { addDays, format, startOfDay } from 'date-fns';
import { cn } from 'lib/utility';
import { useMemo, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { AddDoor, Button, Chip, ChipRow, Close, Input, Text } from 'ui';
import type { Task, TaskBoard, TaskMediaAnnotations, TaskPriority, TaskStatus } from '../api/types';
import { tasksKeys } from '../hooks/useTasks';
import {
  BOARD_LABEL,
  BOARDS,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUSES,
} from '../utils/meta';
import { AvatarStack } from './avatar-stack';
import { EntityPicker } from './entity-picker';
import { FilePicker } from './file-attachments';
import { isSet, LINK_TYPES, type LinkField, type LinkType } from './link-editor';
import { MediaAttachments, mergePickedMedia } from './media-attachments';
import { OptionRow, PickerSheet } from './task-form-shell';

/** Property chip footprint: 44px on the phone, compact on desktop. */
const PROP = 'min-h-11 px-3 md:min-h-7';
/** A chip whose property is set: ink outline, not an ink fill (fill = toggle). */
const SET = 'border-textColor text-textColor';

// ── board ───────────────────────────────────────────────────────────────────────────────────

export function BoardPick({
  phone,
  value,
  onChange,
}: {
  phone: boolean;
  value: TaskBoard;
  onChange: (b: TaskBoard) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PickerSheet
      phone={phone}
      open={open}
      onOpenChange={setOpen}
      title='board'
      trigger={
        <Chip onClick={() => {}} className={cn(PROP, SET, 'md:min-h-6')} aria-label='board'>
          {BOARD_LABEL[value]} ▾
        </Chip>
      }
    >
      {BOARDS.map((b) => (
        <OptionRow
          key={b}
          selected={b === value}
          onClick={() => {
            onChange(b);
            setOpen(false);
          }}
        >
          {BOARD_LABEL[b]}
        </OptionRow>
      ))}
    </PickerSheet>
  );
}

// ── status / priority ───────────────────────────────────────────────────────────────────────

export function StatusPick({
  phone,
  value,
  onChange,
}: {
  phone: boolean;
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PickerSheet
      phone={phone}
      open={open}
      onOpenChange={setOpen}
      title='status'
      trigger={
        <Chip onClick={() => {}} className={cn(PROP, SET)} aria-label='status'>
          {STATUS_LABEL[value]}
        </Chip>
      }
    >
      {STATUSES.map((s) => (
        <OptionRow
          key={s}
          selected={s === value}
          onClick={() => {
            onChange(s);
            setOpen(false);
          }}
        >
          {STATUS_LABEL[s]}
        </OptionRow>
      ))}
    </PickerSheet>
  );
}

const PRIORITY_CHOICES: TaskPriority[] = [...PRIORITIES].reverse();

export function PriorityPick({
  phone,
  value,
  onChange,
}: {
  phone: boolean;
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = value !== 'TASK_PRIORITY_UNKNOWN';
  return (
    <PickerSheet
      phone={phone}
      open={open}
      onOpenChange={setOpen}
      title='priority'
      trigger={
        <Chip onClick={() => {}} className={cn(PROP, set && SET)} aria-label='priority'>
          <span className='text-labelColor'>!</span>
          {set ? PRIORITY_LABEL[value] : 'priority'}
        </Chip>
      }
    >
      {[...PRIORITY_CHOICES, 'TASK_PRIORITY_UNKNOWN' as TaskPriority].map((p) => (
        <OptionRow
          key={p}
          selected={p === value}
          onClick={() => {
            onChange(p);
            setOpen(false);
          }}
        >
          {PRIORITY_LABEL[p]}
        </OptionRow>
      ))}
    </PickerSheet>
  );
}

// ── assignees ───────────────────────────────────────────────────────────────────────────────

export function AssigneesPick({
  phone,
  value,
  onChange,
}: {
  phone: boolean;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isError } = useAdmins();
  const admins = (data?.admins ?? []).map((a) => a.username).filter((n): n is string => !!n);
  const known = new Set(admins);
  // Назначенный, но отключённый человек остаётся строкой — иначе сохранение молча сняло бы его.
  const names = [...admins, ...value.filter((n) => !known.has(n))];
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((n) => n !== name) : [...value, name]);

  return (
    <PickerSheet
      phone={phone}
      open={open}
      onOpenChange={setOpen}
      title='assignees'
      trigger={
        <Chip
          onClick={() => {}}
          className={cn(PROP, value.length > 0 && SET)}
          aria-label='assignees'
        >
          <AvatarStack names={value} size={16} />
          <span className='max-w-[16ch] truncate'>
            {value.length ? value.join(', ') : 'assignee'}
          </span>
        </Chip>
      }
    >
      {names.length === 0 && (
        <Text size='micro' variant='label' component='p' className='px-4 py-2 md:px-1'>
          {isError ? 'people list failed' : 'nobody to pick'}
        </Text>
      )}
      {names.map((name) => (
        <OptionRow key={name} selected={value.includes(name)} onClick={() => toggle(name)}>
          <AvatarStack names={[name]} size={20} />
          <span className='min-w-0 truncate'>{name}</span>
        </OptionRow>
      ))}
      <OptionRow onClick={() => setOpen(false)} className='justify-center uppercase'>
        done
      </OptionRow>
    </PickerSheet>
  );
}

// ── dates ───────────────────────────────────────────────────────────────────────────────────

const iso = (d: Date) => startOfDay(d).toISOString();

export function DatePick({
  phone,
  value,
  onChange,
  name,
  emptyLabel,
  title,
  showName,
}: {
  phone: boolean;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Accessible name of the chip. */
  name: string;
  emptyLabel: string;
  title: string;
  /** Prefix the value with the name («due 23 oct»). */
  showName?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;
  const valid = date && !Number.isNaN(date.getTime()) ? date : undefined;
  const pick = (next: string | undefined) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <PickerSheet
      phone={phone}
      open={open}
      onOpenChange={setOpen}
      title={title}
      trigger={
        <Chip onClick={() => {}} className={cn(PROP, valid && SET)} aria-label={name}>
          {showName && <span className='text-labelColor'>{name}</span>}
          {valid ? format(valid, 'd MMM') : emptyLabel}
        </Chip>
      }
    >
      <OptionRow onClick={() => pick(iso(new Date()))}>today</OptionRow>
      <OptionRow onClick={() => pick(iso(addDays(new Date(), 1)))}>tomorrow</OptionRow>
      <OptionRow onClick={() => pick(iso(addDays(new Date(), 7)))}>next week</OptionRow>
      {valid && <OptionRow onClick={() => pick(undefined)}>none</OptionRow>}
      <div className='flex justify-center px-4 pt-2 md:px-0'>
        <DayPicker
          mode='single'
          weekStartsOn={1}
          showOutsideDays
          selected={valid}
          defaultMonth={valid}
          onSelect={(d) => d && pick(d.toISOString())}
        />
      </div>
    </PickerSheet>
  );
}

// ── labels ──────────────────────────────────────────────────────────────────────────────────

/** Labels already used on tasks this tab has read (board lists, open cards) — most used first. */
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

export function LabelsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState('');
  const known = useKnownLabels();
  const q = text.trim().toLowerCase();
  const suggestions = known
    .filter((l) => !value.includes(l) && (!q || l.toLowerCase().includes(q)))
    .slice(0, 6);

  const commit = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s, i, all) => all.indexOf(s) === i && !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setText('');
  };

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex min-h-11 flex-wrap items-center gap-1.5 border border-borderColor p-1.5'>
        {value.map((l) => (
          <Chip key={l} onRemove={() => onChange(value.filter((x) => x !== l))}>
            {l}
          </Chip>
        ))}
        <Input
          name='label-input'
          aria-label='add label'
          placeholder='add'
          autoComplete='off'
          value={text}
          className='min-h-8 min-w-20 flex-1 border-0'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            // Вставленное «a, b» разбирается сразу; одиночная запятая — то же, что Enter.
            if (v.includes(',')) commit(v);
            else setText(v);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              // ⌘/Ctrl+Enter всплывает к форме и создаёт задачу — набранная метка не теряется.
              if (e.metaKey || e.ctrlKey) {
                commit(text);
                return;
              }
              e.preventDefault();
              commit(text);
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <ChipRow className='gap-1.5'>
          {suggestions.map((l) => (
            <Chip
              key={l}
              dashed
              className='min-h-11 md:min-h-0'
              onClick={() => onChange([...value, l])}
            >
              {l}
            </Chip>
          ))}
        </ChipRow>
      )}
    </div>
  );
}

// ── links & files ───────────────────────────────────────────────────────────────────────────

const ROW =
  'flex min-h-11 items-center gap-2.5 border-b border-hairline px-3 last:border-b-0 md:min-h-8';
const KIND = 'w-20 shrink-0 uppercase';

function LinkRow({
  type,
  value,
  onRemove,
}: {
  type: LinkType;
  value: number | string;
  onRemove: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['tasks', 'link-editor', type.field, value],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => type.config.resolve(value),
  });
  return (
    <div className={ROW}>
      <Text size='micro' variant='label' component='span' className={KIND}>
        {type.label}
      </Text>
      <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
        {data?.label ?? `#${value}`}
      </Text>
      <Close
        aria-label={`remove ${type.label}`}
        className='min-h-11 min-w-11 md:min-h-0 md:min-w-0'
        onClick={onRemove}
      />
    </div>
  );
}

type AddKind = LinkType | 'file' | 'media';

export function AttachField({
  phone,
  links,
  setLink,
  fileIds,
  setFileIds,
  mediaIds,
  setMediaIds,
  annotations,
  setAnnotations,
}: {
  phone: boolean;
  links: Record<LinkField, number | string>;
  setLink: (field: LinkField, value: number | string) => void;
  fileIds: number[];
  setFileIds: (ids: number[]) => void;
  mediaIds: number[];
  setMediaIds: (ids: number[]) => void;
  annotations: TaskMediaAnnotations[];
  setAnnotations: (next: TaskMediaAnnotations[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState<LinkType | null>(null);
  const [filePicker, setFilePicker] = useState(false);
  const mediaTrigger = useRef<HTMLButtonElement>(null);

  const setLinks = LINK_TYPES.filter((t) => isSet(links[t.field], t.config.empty));

  const files = useQueries({
    queries: fileIds.map((id) => ({
      queryKey: filesKeys.file(id),
      queryFn: () => filesService.getFile(id),
      staleTime: 30 * 60 * 1000,
    })),
  });
  const fileName = (id: number) =>
    files.map((q) => q.data?.file).find((f): f is LibraryFile => !!f && Number(f.id) === id)
      ?.fileName ?? `#${id}`;

  const openAdd = (o: boolean) => {
    setAddOpen(o);
    if (!o) setStep(null);
  };

  const choose = (kind: AddKind) => {
    if (kind === 'file' || kind === 'media') {
      openAdd(false);
      // Шторка сначала закрывается и возвращает фокус, потом открывается пикер — иначе возврат
      // фокуса шторки выдернул бы его из только что открытого окна.
      setTimeout(() => {
        if (kind === 'file') setFilePicker(true);
        else mediaTrigger.current?.click();
      }, 0);
      return;
    }
    setStep(kind);
  };

  const hasAny = setLinks.length + fileIds.length > 0;

  return (
    <div className='flex flex-col gap-2'>
      {hasAny && (
        <div className='flex flex-col border border-borderColor'>
          {setLinks.map((t) => (
            <LinkRow
              key={t.field}
              type={t}
              value={links[t.field]}
              onRemove={() => setLink(t.field, t.config.empty)}
            />
          ))}
          {fileIds.map((id) => (
            <div key={`file:${id}`} className={ROW}>
              <Text size='micro' variant='label' component='span' className={KIND}>
                library file
              </Text>
              <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                {fileName(id)}
              </Text>
              <Close
                aria-label='remove library file'
                className='min-h-11 min-w-11 md:min-h-0 md:min-w-0'
                onClick={() => setFileIds(fileIds.filter((x) => x !== id))}
              />
            </div>
          ))}
        </div>
      )}

      {mediaIds.length > 0 && (
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            site media
          </Text>
          <MediaAttachments
            hideSlot
            value={mediaIds}
            onChange={setMediaIds}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
          />
        </div>
      )}

      <PickerSheet
        phone={phone}
        open={addOpen}
        onOpenChange={openAdd}
        title={step ? step.label : 'add'}
        trigger={<AddDoor className='min-h-11 w-full md:min-h-8'>add</AddDoor>}
      >
        {step ? (
          <div className='flex flex-col gap-2 px-4 pb-2 md:px-0'>
            <EntityPicker
              key={step.field}
              config={step.config}
              value={step.config.empty}
              onChange={(v) => {
                setLink(step.field, v);
                openAdd(false);
              }}
            />
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='min-h-11 self-start md:min-h-0'
              onClick={() => setStep(null)}
            >
              other type
            </Button>
          </div>
        ) : (
          <>
            {LINK_TYPES.map((t) => (
              <OptionRow key={t.field} onClick={() => choose(t)}>
                {t.label}
              </OptionRow>
            ))}
            <OptionRow onClick={() => choose('file')}>library file</OptionRow>
            <OptionRow onClick={() => choose('media')}>site media · public</OptionRow>
          </>
        )}
      </PickerSheet>

      {/* Медиатека держит своё окно сама и открывается только своим триггером; триггер спрятан,
          а жмёт его пункт «site media» шторки. Так окно живёт вне шторки и не закрывается с ней. */}
      <MediaSelector
        label='site media'
        purpose='attachment'
        aspectRatio={['Custom']}
        allowMultiple
        showVideos
        saveSelectedMedia={(picked) => setMediaIds(mergePickedMedia(mediaIds, picked))}
        trigger={
          <Button ref={mediaTrigger} type='button' tabIndex={-1} aria-hidden className='sr-only'>
            site media
          </Button>
        }
      />

      {filePicker && (
        <FilePicker
          selected={fileIds}
          onClose={() => setFilePicker(false)}
          onToggle={(id) =>
            setFileIds(fileIds.includes(id) ? fileIds.filter((x) => x !== id) : [...fileIds, id])
          }
        />
      )}
    </div>
  );
}
