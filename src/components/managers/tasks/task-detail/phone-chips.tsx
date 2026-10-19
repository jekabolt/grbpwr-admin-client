import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { addDays, format, startOfDay } from 'date-fns';
import { cn } from 'lib/utility';
import { useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { Chip, Text } from 'ui';
import type { TaskPriority } from '../api/types';
import { AvatarStack } from '../components/avatar-stack';
import { OptionRow, PickerSheet } from '../components/task-form-shell';
import { PRIORITIES, PRIORITY_LABEL } from '../utils/meta';

/**
 * ЧИПЫ КАРТОЧКИ НА ТЕЛЕФОНЕ (tasks-mobile, макет детали): исполнители, срок, приоритет. Каждый
 * открывает шторку снизу — те же `PickerSheet` / `OptionRow`, что у формы заведения. Запись —
 * через переданный `onChange`, то есть через ту же инлайн-дверь страницы (`useInlineTaskPatch`).
 */

/** 44px chip; a set value wears an ink outline, not a fill. */
const CHIP = 'min-h-11 gap-1.5 px-3';
const SET = 'border-textColor text-textColor';

const PRIORITY_CHOICES: TaskPriority[] = [...PRIORITIES].reverse();

export function AssigneesSheet({
  value,
  canWrite,
  busy,
  onChange,
}: {
  value: string[];
  canWrite: boolean;
  busy: boolean;
  /** `seen` — the list as it was when the sheet opened (or after the last own write). */
  onChange: (next: string[], seen: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const seenRef = useRef(value);
  const { data, isError } = useAdmins(open);
  const admins = (data?.admins ?? []).map((a) => a.username).filter((n): n is string => !!n);
  const known = new Set(admins);
  // Назначенный, но отключённый человек остаётся строкой — иначе снять его было бы нечем.
  const names = [...admins, ...value.filter((n) => !known.has(n))];

  const toggle = async (name: string) => {
    if (busy) return;
    const next = value.includes(name) ? value.filter((n) => n !== name) : [...value, name];
    if (await onChange(next, seenRef.current)) seenRef.current = next;
  };

  const chip = (
    <Chip
      onClick={canWrite ? () => {} : undefined}
      className={cn(CHIP, value.length > 0 && SET)}
      aria-label='assignees'
    >
      <AvatarStack names={value} size={16} />
      <span className='max-w-[16ch] truncate'>{value.length ? value.join(', ') : 'assignee'}</span>
    </Chip>
  );
  if (!canWrite) return chip;

  return (
    <PickerSheet
      phone
      open={open}
      onOpenChange={(o) => {
        if (o) seenRef.current = value;
        setOpen(o);
      }}
      title='assignees'
      trigger={chip}
    >
      {names.length === 0 && (
        <Text size='micro' variant='label' component='p' className='px-4 py-2'>
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

export function PrioritySheet({
  value,
  canWrite,
  busy,
  onChange,
}: {
  value: TaskPriority;
  canWrite: boolean;
  busy: boolean;
  onChange: (next: TaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const set = value !== 'TASK_PRIORITY_UNKNOWN';
  const chip = (
    <Chip
      onClick={canWrite ? () => {} : undefined}
      className={cn(CHIP, set && SET)}
      aria-label='priority'
    >
      <span className='text-labelColor'>!</span>
      {set ? PRIORITY_LABEL[value] : 'priority'}
    </Chip>
  );
  if (!canWrite) return chip;
  return (
    <PickerSheet phone open={open} onOpenChange={setOpen} title='priority' trigger={chip}>
      {[...PRIORITY_CHOICES, 'TASK_PRIORITY_UNKNOWN' as TaskPriority].map((p) => (
        <OptionRow
          key={p}
          selected={p === value}
          onClick={() => {
            setOpen(false);
            if (!busy && p !== value) onChange(p);
          }}
        >
          {PRIORITY_LABEL[p]}
        </OptionRow>
      ))}
    </PickerSheet>
  );
}

const iso = (d: Date) => startOfDay(d).toISOString();

/**
 * Дата шторкой: быстрые варианты + календарь. Чип (`trigger`) рисует вызывающий — у срока он
 * красный при просрочке, у плановой даты это строка списка.
 */
export function DateSheet({
  value,
  title,
  canWrite,
  busy,
  trigger,
  onChange,
}: {
  value: string | undefined;
  title: string;
  canWrite: boolean;
  busy: boolean;
  trigger: React.ReactElement;
  onChange: (next: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;
  const valid = date && !Number.isNaN(date.getTime()) ? date : undefined;
  const pick = (next: string | undefined) => {
    setOpen(false);
    if (!busy) onChange(next);
  };
  if (!canWrite) return trigger;
  return (
    <PickerSheet phone open={open} onOpenChange={setOpen} title={title} trigger={trigger}>
      <OptionRow onClick={() => pick(iso(new Date()))}>today</OptionRow>
      <OptionRow onClick={() => pick(iso(addDays(new Date(), 1)))}>tomorrow</OptionRow>
      <OptionRow onClick={() => pick(iso(addDays(new Date(), 7)))}>next week</OptionRow>
      {valid && <OptionRow onClick={() => pick(undefined)}>none</OptionRow>}
      <div className='flex justify-center px-4 pt-2'>
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

/**
 * The due chip: «due · 2d overdue» in red when overdue, the date otherwise. A plain function, not
 * a component: the sheet's Radix `asChild` must reach `Chip` itself to merge its handlers.
 */
export function dueChip({
  value,
  label,
  overdue,
  canWrite,
}: {
  value: string | undefined;
  /** `dueMeta(...).label` — «today», «2d overdue», «Oct 17». */
  label: string;
  overdue: boolean;
  canWrite: boolean;
}) {
  return (
    <Chip
      onClick={canWrite ? () => {} : undefined}
      className={cn(CHIP, value && SET, overdue && 'border-error text-error')}
      aria-label='due'
    >
      <span className={overdue ? 'text-error' : 'text-labelColor'}>due</span>
      {value ? label || format(new Date(value), 'MMM d') : 'none'}
    </Chip>
  );
}
