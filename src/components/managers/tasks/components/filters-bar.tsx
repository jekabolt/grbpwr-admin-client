import { AvatarPicker } from 'ui/components/avatar';
import { Chip, ChipRow } from 'ui/components/chip';
import { Task, TaskPriority } from '../api/types';
import { PRIORITIES, PRIORITY_LABEL } from '../utils/meta';

/**
 * tskFilters v2 — the filter row is CHIPS, not selects. Priority is a single-select
 * chip group (click the lit one to clear it), "my tasks" scopes to the signed-in
 * assignee, and — tskArchive v3 — archived is just another chip here rather than a
 * whole-board mode flip. The old search box + column/priority selects are gone: a
 * board already IS its columns, so a status filter only emptied them, and free-text
 * search over six cards a column earned less than the chrome it cost.
 *
 * РЯД ЛИЦ (п.3 волны) — второй ярус того же ряда: «my tasks» отвечает только «по своим», а
 * доска обязана уметь и «по чужим». Сужение клиентское: вся доска и так прочитана целиком, а
 * серверный фильтр давал бы второй запрос на каждый клик и разъезжался бы со счётчиками,
 * посчитанными по уже загруженному.
 *
 * ПРОЕКТ — ЧИП ОСОБОГО РОДА: он живёт в АДРЕСЕ (`/tasks?project=N`), а не в сессионных
 * фильтрах, потому что приходят по нему ссылкой со страницы проекта. Поэтому он рисуется
 * здесь, но состояние его снаружи, и снимается он тем же жестом, что и приоритет, — щелчком
 * по зажжённому.
 */

export interface TaskFilters {
  priority: TaskPriority | '';
  mine: boolean;
  /**
   * СУЖЕНИЕ ПО ЧЕЛОВЕКУ. `undefined` = выключено, `''` = кучка «никто не взял».
   * Различать пустую строку и отсутствие обязательно: «неназначенные» — законный ответ на
   * вопрос «на чём кто стоит», и слить его с «фильтра нет» значило бы потерять целую кучку.
   */
  assignee?: string;
}

export const emptyFilters: TaskFilters = { priority: '', mine: false, assignee: undefined };

export function filtersActive(f: TaskFilters): boolean {
  return f.priority !== '' || f.mine || f.assignee !== undefined;
}

/**
 * ОДНО МЕСТО, ГДЕ «МОИ» И ЛИЦО ГАСЯТ ДРУГ ДРУГА.
 *
 * Зажечь одновременно «my tasks» и чужое лицо — значит спросить «задачи, которые у меня И у
 * него», а это на доске из нескольких человек почти всегда ПУСТО. Пустая доска после клика
 * читается как поломка, а не как честный ответ, поэтому второй выбор снимает первый.
 *
 * Правило живёт ЗДЕСЬ, а не в обработчиках чипов: обработчиков три (приоритет, «мои», лицо), и
 * три копии одного правила разошлись бы на первой же правке.
 */
export function setFilter(f: TaskFilters, patch: Partial<TaskFilters>): TaskFilters {
  const next = { ...f, ...patch };
  if (patch.mine) next.assignee = undefined;
  if (patch.assignee !== undefined) next.mine = false;
  return next;
}

export function applyFilters(tasks: Task[], f: TaskFilters, currentUser?: string): Task[] {
  return tasks.filter((t) => {
    if (f.priority && t.task.priority !== f.priority) return false;
    // «МОЯ» = Я В СПИСКЕ, а не я первый. Кучка человека отвечает на вопрос «на чём он стоит»,
    // а не «чего он единственный владелец», поэтому задача на двоих считается обоим.
    if (f.mine && !(!!currentUser && t.task.assignees.includes(currentUser))) return false;
    if (f.assignee !== undefined) {
      if (f.assignee === '') {
        if (t.task.assignees.length > 0) return false;
      } else if (!t.task.assignees.includes(f.assignee)) return false;
    }
    return true;
  });
}

/**
 * КУЧКИ ПО ЛЮДЯМ ДЛЯ РЯДА ЛИЦ. Считаются по НЕсуженным задачам той доски, что открыта: ряд
 * отвечает на вопрос «кто сколько тянет на этой доске», и пересчитывать его по уже
 * отфильтрованному значило бы, что нажатие на лицо обнуляет соседние числа.
 *
 * Задача с двумя исполнителями считается ОБОИМ — кучка человека это «на чём он стоит», а не
 * «чего он единственный владелец». Поэтому сумма кучек законно больше числа карточек.
 *
 * Кучка `''` («никто не взял») стоит ПОСЛЕДНЕЙ, а не по величине: это не человек, и место
 * среди людей по счёту читалось бы как ещё один сотрудник.
 */
export function assigneePiles(tasks: Task[]): { name: string; count: number }[] {
  const piles = new Map<string, number>();
  let unassigned = 0;
  for (const t of tasks) {
    const names = t.task.assignees.filter((n) => !!n.trim());
    if (names.length === 0) {
      unassigned++;
      continue;
    }
    // Один и тот же человек, названный в карточке дважды, — это одна карточка у него.
    for (const name of new Set(names)) piles.set(name, (piles.get(name) ?? 0) + 1);
  }
  const people = [...piles.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return unassigned > 0 ? [...people, { name: '', count: unassigned }] : people;
}

export function FiltersBar({
  filters,
  onChange,
  showMine,
  people,
  showArchived,
  onToggleArchived,
  onClear,
  projectLabel,
  onClearProject,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  showMine: boolean;
  /** Кучки по людям для ряда лиц (`assigneePiles`); пусто = ряд не рисуется. */
  people?: { name: string; count: number }[];
  showArchived: boolean;
  onToggleArchived: () => void;
  onClear: () => void;
  /** Имя проекта из адреса; пусто = доска не сужена проектом. */
  projectLabel?: string;
  onClearProject?: () => void;
}) {
  const set = (patch: Partial<TaskFilters>) => onChange(setFilter(filters, patch));
  const dirty = filtersActive(filters) || showArchived || !!projectLabel;

  return (
    <ChipRow className='gap-1.5'>
      {/* Сужение проектом стоит ПЕРВЫМ: остальные чипы работают внутри него, и человек,
          пришедший сюда ссылкой, обязан видеть, почему на доске не все карточки. */}
      {projectLabel && (
        <Chip selected pressed aria-label={`project: ${projectLabel}`} onClick={onClearProject}>
          project: {projectLabel}
        </Chip>
      )}
      {PRIORITIES.map((p) => {
        const on = filters.priority === p;
        return (
          <Chip
            key={p}
            selected={on}
            pressed={on}
            onClick={() => set({ priority: on ? '' : p })}
          >
            {PRIORITY_LABEL[p]}
          </Chip>
        );
      })}

      {showMine && (
        <Chip selected={filters.mine} pressed={filters.mine} onClick={() => set({ mine: !filters.mine })}>
          my tasks
        </Chip>
      )}

      <Chip selected={showArchived} pressed={showArchived} onClick={onToggleArchived}>
        archived
      </Chip>

      {/* РЯД ЛИЦ — ЭТО «ПО ЧУЖИМ». «my tasks» рядом умеет ровно одну кучку — мою; здесь их
          столько, сколько людей на доске, и у каждого написано, сколько он тянет. Готовый
          `AvatarPicker` — тот же узор, что в fulfillment: клик по зажжённому снимает. */}
      {!!people?.length && (
        <AvatarPicker
          people={people}
          selected={filters.assignee}
          onSelect={(name) => set({ assignee: name })}
          className='ml-1'
        />
      )}

      {dirty && (
        <button
          type='button'
          onClick={onClear}
          className='ml-1 text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
        >
          clear
        </button>
      )}
    </ChipRow>
  );
}
