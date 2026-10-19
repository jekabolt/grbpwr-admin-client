import { ROUTES } from 'constants/routes';
import { format } from 'date-fns';
import { cn } from 'lib/utility';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AddDoor, BackLink, Button, EmptyCell, Pill, Row, Section, Text } from 'ui';
import type {
  Task,
  TaskBoard,
  TaskMedia,
  TaskMediaAnnotations,
  TaskPriority,
  TaskRelation,
  TaskStatus,
} from '../api/types';
import { LinkChip } from '../components/link-chip';
import { TaskChecklist } from '../components/task-checklist';
import { TaskComments } from '../components/task-comments';
import { TaskDescriptionView } from '../components/task-description';
import type { useTaskMediaViewer } from '../components/task-media-viewer';
import { OptionRow, PickerSheet } from '../components/task-form-shell';
import { ParentPicker, TaskRelations, useChildren } from '../components/task-relations';
import { useTaskComments, type InlinePatch } from '../hooks/useTasks';
import type { TaskLink } from '../utils/links';
import { BOARD_LABEL, BOARDS, dueMeta, STATUS_LABEL, STATUSES } from '../utils/meta';
import { AttachmentTiles } from './attachment-tiles';
import { InlineDescription, InlineTitle } from './inline-fields';
import { AssigneesSheet, DateSheet, dueChip, PrioritySheet } from './phone-chips';

/**
 * КАРТОЧКА ЗАДАЧИ НА ТЕЛЕФОНЕ (tasks-mobile, макет OK 19.10). Десктоп не трогается — эта ветка
 * рисуется только ниже `md`.
 *
 * Порядок: ← и «доска · номер», «saving → saved», ⋯ → статус пятью сегментами (один тап) →
 * флажки (архив, блокер, родитель) → заголовок → описание (свёрнуто, тап правит) → три чипа
 * (исполнители, срок, приоритет) → вкладки со счётчиками. Доска, родитель, архив, удаление — в ⋯.
 * Все записи идут теми же дверями, что у десктопа: инлайн-патч и `MoveTask`.
 */

type MediaViewer = ReturnType<typeof useTaskMediaViewer>;

type TabKey = 'checklist' | 'comments' | 'linked' | 'files' | 'details';

/** Short labels for the status strip: five segments must fit 343px. */
const STATUS_SHORT: Record<TaskStatus, string> = {
  ...STATUS_LABEL,
  TASK_STATUS_IN_PROGRESS: 'in prog­ress',
};

/**
 * «saving → saved» в шапке. `busy` — летит любая запись страницы; «saved» держится секунду после
 * её окончания и не показывается, если запись упала (снекбар уже сказал своё).
 */
function useSaveState(busy: boolean, failed: boolean): 'saving' | 'saved' | null {
  const [saved, setSaved] = useState(false);
  const was = useRef(busy);
  useEffect(() => {
    const ended = was.current && !busy;
    was.current = busy;
    if (!ended) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [busy]);
  if (busy) return 'saving';
  return saved && !failed ? 'saved' : null;
}

export interface PhoneDetailProps {
  task: Task;
  canWrite: boolean;
  media: TaskMedia[];
  annotations: TaskMediaAnnotations[];
  links: TaskLink[];
  blockers: TaskRelation[];
  attachmentCount: number;
  /** An inline content write is in flight. */
  patching: boolean;
  /** Any write of the page is in flight (inline, move, archive). */
  busy: boolean;
  failed: boolean;
  archiveBusy: boolean;
  editLocked: boolean;
  patchInline: (patch: InlinePatch, seen: InlinePatch) => Promise<boolean>;
  moveTo: (board: TaskBoard, status: TaskStatus) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  /** Opens the full edit form — the only place for files, links and labels. */
  openEditor: () => void;
  openMedia: MediaViewer['openMedia'];
  openMediaIndex: MediaViewer['openIndex'];
}

export function PhoneTaskDetail(p: PhoneDetailProps) {
  const { task, canWrite } = p;
  const t = task.task;
  const isArchived = !!task.archivedAt;
  const due = dueMeta(t.dueDate, task.status === 'TASK_STATUS_DONE' || isArchived);
  // Отказ инлайн-записи — `false` из двери, а не флаг мутации: «saved» после него — ложь.
  const [patchFailed, setPatchFailed] = useState(false);
  const patchInline = async (patch: InlinePatch, seen: InlinePatch) => {
    const ok = await p.patchInline(patch, seen);
    setPatchFailed(!ok);
    return ok;
  };
  const saveState = useSaveState(p.busy, p.failed || patchFailed);

  const [tab, setTab] = useState<TabKey>('checklist');
  // Тап по статусу двигает сегмент сразу; истина возвращается с перечитанной карточкой (или
  // откатывается, если `MoveTask` упал — снекбар уже сказал почему).
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);
  useEffect(() => setPendingStatus(null), [task.status]);
  useEffect(() => {
    if (p.failed) setPendingStatus(null);
  }, [p.failed]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickingParent, setPickingParent] = useState(false);

  const { data: comments = [] } = useTaskComments(task.id);
  const children = useChildren(task.id);
  const checkDone = task.checklist.filter((i) => i.isDone).length;
  const linkedCount = children.length + task.relations.length + p.links.length;

  const tabs: { key: TabKey; label: string; count?: string }[] = [
    {
      key: 'checklist',
      label: 'checklist',
      count: task.checklist.length ? `${checkDone}/${task.checklist.length}` : undefined,
    },
    {
      key: 'comments',
      label: 'comments',
      count: comments.length ? `${comments.length}` : undefined,
    },
    { key: 'linked', label: 'linked', count: linkedCount ? `${linkedCount}` : undefined },
    {
      key: 'files',
      label: 'files',
      count: p.attachmentCount ? `${p.attachmentCount}` : undefined,
    },
    { key: 'details', label: 'details' },
  ];

  return (
    <div className='-mx-2.5 flex min-w-0 flex-col overflow-x-clip pb-10'>
      {/* ── Шапка: ←, «доска · номер», saving, ⋯ ─────────────────────────────────────────── */}
      <div className='flex min-h-13 items-center gap-1 border-b border-borderColor bg-bgColor px-1'>
        <BackLink
          to={ROUTES.tasks}
          aria-label='board'
          className='flex min-h-11 min-w-11 shrink-0 items-center justify-center'
        >
          {''}
        </BackLink>
        <Text
          size='micro'
          variant='label'
          tracking='label'
          component='span'
          className='min-w-0 flex-1 truncate uppercase'
        >
          <span className='font-bold text-textColor'>{BOARD_LABEL[task.board]}</span> · #{task.id}
        </Text>
        {saveState && (
          <Text
            size='micro'
            component='span'
            role='status'
            className={cn(
              'shrink-0 uppercase tracking-label',
              saveState === 'saving' ? 'text-warning' : 'text-success',
            )}
          >
            {saveState}
          </Text>
        )}
        {canWrite && (
          <PickerSheet
            phone
            open={menuOpen}
            onOpenChange={setMenuOpen}
            title='board'
            trigger={
              <Button
                type='button'
                variant='default'
                aria-label='task actions'
                className='flex min-h-11 min-w-11 shrink-0 items-center justify-center text-stat font-bold'
              >
                <span aria-hidden>⋯</span>
              </Button>
            }
          >
            {BOARDS.map((b) => (
              <OptionRow
                key={b}
                selected={b === task.board}
                onClick={() => {
                  setMenuOpen(false);
                  p.moveTo(b, task.status);
                }}
              >
                {BOARD_LABEL[b]}
              </OptionRow>
            ))}
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='block px-4 pt-4 pb-2 uppercase'
            >
              task
            </Text>
            <OptionRow
              onClick={() => {
                setMenuOpen(false);
                setPickingParent(true);
              }}
            >
              subtask of…
            </OptionRow>
            <OptionRow
              onClick={() => {
                setMenuOpen(false);
                if (!p.archiveBusy) p.onArchiveToggle();
              }}
            >
              {isArchived ? 'restore' : 'archive'}
            </OptionRow>
            <OptionRow
              className='text-error'
              onClick={() => {
                setMenuOpen(false);
                p.onDelete();
              }}
            >
              delete
            </OptionRow>
          </PickerSheet>
        )}
      </div>

      {/* ── Голова: статус, флажки, заголовок, описание, чипы ─────────────────────────────── */}
      <div className='flex flex-col gap-3.5 bg-bgColor px-4 pt-3 pb-4'>
        <StatusStrip
          value={pendingStatus ?? task.status}
          disabled={!canWrite}
          onChange={(s) => {
            setPendingStatus(s);
            p.moveTo(task.board, s);
          }}
        />

        <Flags task={task} blockers={p.blockers} />

        {canWrite && pickingParent && (
          <ParentPicker task={task} onDone={() => setPickingParent(false)} />
        )}

        <InlineTitle
          value={t.title}
          canWrite={canWrite}
          saving={p.patching}
          onSave={(title, seenTitle) => patchInline({ title }, { title: seenTitle })}
        />

        <PhoneDescription
          value={t.description}
          media={p.media}
          canWrite={canWrite}
          saving={p.patching}
          onOpen={p.openMedia}
          onSave={(description, seen) => patchInline({ description }, { description: seen })}
        />

        <div className='flex flex-wrap gap-2'>
          <AssigneesSheet
            value={t.assignees}
            canWrite={canWrite}
            busy={p.patching}
            onChange={(next, seen) => patchInline({ assignees: next }, { assignees: seen })}
          />
          <DateSheet
            value={t.dueDate}
            title='due'
            canWrite={canWrite}
            busy={p.patching}
            trigger={dueChip({
              value: t.dueDate,
              label: due.label,
              overdue: due.state === 'overdue',
              canWrite,
            })}
            onChange={(dueDate) => patchInline({ dueDate }, { dueDate: t.dueDate })}
          />
          <PrioritySheet
            value={t.priority}
            canWrite={canWrite}
            busy={p.patching}
            onChange={(priority: TaskPriority) =>
              patchInline({ priority }, { priority: t.priority })
            }
          />
        </div>
      </div>

      {/* ── Вкладки со счётчиками ─────────────────────────────────────────────────────────── */}
      <div
        role='tablist'
        aria-label='task sections'
        className='sticky top-14 z-[var(--z-sticky)] flex overflow-x-auto border-y border-borderColor bg-bgColor [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      >
        {tabs.map((x) => (
          <Button
            key={x.key}
            type='button'
            variant='default'
            role='tab'
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-3.5 text-micro uppercase tracking-label',
              tab === x.key
                ? 'border-textColor text-textColor'
                : 'border-transparent text-labelColor',
            )}
          >
            {x.label}
            {x.count && <span className='tabular-nums'>{x.count}</span>}
          </Button>
        ))}
      </div>

      <div role='tabpanel' className='flex flex-col gap-3 px-2.5 pt-3'>
        {tab === 'checklist' && (
          <TaskChecklist taskId={task.id} items={task.checklist} canWrite={canWrite} />
        )}

        {tab === 'comments' && (
          <TaskComments taskId={task.id} media={p.media} onOpenMedia={p.openMedia} />
        )}

        {tab === 'linked' && (
          <>
            <TaskRelations task={task} canWrite={canWrite} />
            {(p.links.length > 0 || canWrite) && (
              <Section title='links'>
                <div className='flex flex-wrap gap-2'>
                  {p.links.map((l) => (
                    <LinkChip key={`${l.kind}-${l.to}`} link={l} />
                  ))}
                  {canWrite && (
                    <AddDoor
                      shape='inline'
                      className='min-h-11'
                      disabled={p.editLocked}
                      onClick={p.openEditor}
                    >
                      attach
                    </AddDoor>
                  )}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'files' &&
          (p.attachmentCount > 0 ? (
            <Section>
              <AttachmentTiles
                taskId={task.id}
                media={p.media}
                files={task.files}
                annotations={p.annotations}
                onOpenMedia={p.openMediaIndex}
                onAdd={canWrite && !p.editLocked ? p.openEditor : undefined}
              />
            </Section>
          ) : (
            <Section>
              {canWrite ? (
                <AddDoor
                  shape='inline'
                  className='min-h-11'
                  disabled={p.editLocked}
                  onClick={p.openEditor}
                >
                  file
                </AddDoor>
              ) : (
                <Text size='micro' variant='label' component='span'>
                  no files
                </Text>
              )}
            </Section>
          ))}

        {tab === 'details' && <Details {...p} patchInline={patchInline} />}
      </div>
    </div>
  );
}

/** Five segments, one tap moves the card (through `MoveTask`). */
function StatusStrip({
  value,
  disabled,
  onChange,
}: {
  value: TaskStatus;
  disabled: boolean;
  onChange: (s: TaskStatus) => void;
}) {
  return (
    <div role='radiogroup' aria-label='status' className='flex min-h-11 border border-textColor'>
      {STATUSES.map((s) => {
        const on = s === value;
        return (
          <Button
            key={s}
            type='button'
            variant='default'
            role='radio'
            aria-checked={on}
            aria-label={STATUS_LABEL[s]}
            disabled={disabled}
            onClick={() => !on && onChange(s)}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-center justify-center border-r border-textColor px-0.5 text-center text-micro uppercase leading-tight [hyphens:none] break-normal last:border-r-0 disabled:cursor-default disabled:opacity-100',
              on ? 'bg-textColor text-bgColor' : 'bg-bgColor text-textColor',
            )}
          >
            {STATUS_SHORT[s]}
          </Button>
        );
      })}
    </div>
  );
}

/** Archived, blocked and parent flags under the status strip. */
function Flags({ task, blockers }: { task: Task; blockers: TaskRelation[] }) {
  const flags: React.ReactNode[] = [];
  if (task.archivedAt)
    flags.push(
      <Pill key='arch' tone='ink'>
        archived · {format(new Date(task.archivedAt), 'MMM d')}
      </Pill>,
    );
  if (blockers.length > 0)
    flags.push(
      <Link
        key='blocked'
        to={`/tasks/${blockers[0].taskId}`}
        title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}
        className='inline-flex min-h-8 items-center'
      >
        <Pill tone='warn'>blocked · {blockers.length}</Pill>
      </Link>,
    );
  if (task.parentTaskId > 0)
    flags.push(
      <Link
        key='parent'
        to={`/tasks/${task.parentTaskId}`}
        aria-label='parent task'
        className='inline-flex min-h-8 items-center'
      >
        <Pill tone='mut'>↑ #{task.parentTaskId}</Pill>
      </Link>,
    );
  if (!flags.length) return null;
  return <div className='-my-1.5 flex flex-wrap items-center gap-1.5'>{flags}</div>;
}

/**
 * Описание читается: свёрнуто до ~пяти строк (высотой, а не `line-clamp`: внутри списки и абзацы), «more» раскрывает. Тап по тексту (не по ссылке и не
 * по чипу вложения) открывает тот же редактор, что у десктопа, с его панелью форматирования.
 */
function PhoneDescription({
  value,
  media,
  canWrite,
  saving,
  onOpen,
  onSave,
}: {
  value: string;
  media: TaskMedia[];
  canWrite: boolean;
  saving: boolean;
  onOpen: MediaViewer['openMedia'];
  onSave: (next: string, seen: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [value, expanded, editing]);

  if (editing)
    return (
      <InlineDescription
        value={value}
        media={media}
        saving={saving}
        onSave={async (next, seen) => {
          if (await onSave(next, seen)) setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );

  if (!value)
    return canWrite ? (
      <AddDoor shape='inline' className='min-h-11 w-fit' onClick={() => setEditing(true)}>
        description
      </AddDoor>
    ) : null;

  function onTap(e: React.MouseEvent<HTMLDivElement>) {
    if (!canWrite) return;
    // Только из своего DOM: просмотрщик вложений рисуется порталом, а React ведёт всплытие по
    // дереву компонентов.
    if (!(e.target instanceof Element) || !e.currentTarget.contains(e.target)) return;
    if (
      e.target.closest(
        ['a', 'button', '[role="button"]', 'img', 'video', 'input', 'textarea', 'select'].join(),
      )
    )
      return;
    if (window.getSelection()?.toString()) return;
    setEditing(true);
  }

  return (
    <div className='flex flex-col items-start'>
      <div
        ref={boxRef}
        onClick={onTap}
        className={cn(
          'w-full',
          !expanded && 'max-h-32 overflow-hidden',
          !expanded && overflows && '[mask-image:linear-gradient(#000_60%,transparent)]',
          canWrite && 'cursor-text',
        )}
      >
        <TaskDescriptionView text={value} media={media} onOpen={onOpen} />
      </div>
      {(overflows || expanded) && (
        <Button
          type='button'
          variant='underline'
          size='xs'
          className='min-h-11 px-0 text-labelColor'
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'less' : 'more'}
        </Button>
      )}
    </div>
  );
}

/** Labels, planned start, started / created. */
function Details(p: PhoneDetailProps) {
  const { task, canWrite } = p;
  const t = task.task;
  const startRow = (
    <Button
      type='button'
      variant='default'
      onClick={canWrite ? () => {} : undefined}
      className='flex min-h-11 w-full items-center gap-3 text-left'
    >
      <Text
        size='micro'
        variant='label'
        tracking='label'
        component='span'
        className='w-28 shrink-0 uppercase'
      >
        planned start
      </Text>
      <Text component='span' className={cn('flex-1', !t.startDate && 'text-labelColor')}>
        {t.startDate ? format(new Date(t.startDate), 'MMM d') : 'none'}
      </Text>
      {canWrite && (
        <span aria-hidden className='text-labelColor'>
          ›
        </span>
      )}
    </Button>
  );
  const fact = (label: string, value: React.ReactNode) => (
    <Row
      label={
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          {label}
        </Text>
      }
      value={
        <Text size='micro' component='span'>
          {value}
        </Text>
      }
    />
  );
  return (
    <>
      <Section title='labels'>
        <div className='flex flex-wrap items-center gap-1.5'>
          {t.labels.map((l) => (
            <Pill key={l} tone='mut'>
              {l}
            </Pill>
          ))}
          {canWrite && (
            <AddDoor
              shape='inline'
              className='min-h-11'
              disabled={p.editLocked}
              onClick={p.openEditor}
            >
              label
            </AddDoor>
          )}
          {!canWrite && t.labels.length === 0 && <EmptyCell />}
        </div>
      </Section>
      <Section>
        <div className='flex flex-col'>
          <div className='border-b border-hairline'>
            <DateSheet
              value={t.startDate}
              title='planned start'
              canWrite={canWrite}
              busy={p.patching}
              trigger={startRow}
              onChange={(startDate) => p.patchInline({ startDate }, { startDate: t.startDate })}
            />
          </div>
          {fact('started', task.startedAt ? format(new Date(task.startedAt), 'MMM d') : '—')}
          {fact(
            'created',
            `${task.createdAt ? format(new Date(task.createdAt), 'MMM d') : '—'}${
              task.createdBy ? ` · ${task.createdBy}` : ''
            }`,
          )}
        </div>
      </Section>
    </>
  );
}
