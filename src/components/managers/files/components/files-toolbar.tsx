import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { ROUTES } from 'constants/routes';
import { Avatar, Button, Chip, GenericPopover, Input, Select, Text, ViewSwitch } from 'ui';
import {
  PERSON_ROLE_CHIP,
  PERSON_ROLE_HINT,
  SORT_LABEL,
  type FilesSort,
  type PersonRoleFilter,
} from '../hooks/useFiles';
import { MAX_TOPIC_FILTERS, toggleTopic, type TopicSelection } from './topic-chips';

const ROLES: PersonRoleFilter[] = ['any', 'uploaded', 'owner'];

/** Вид выдачи. Живёт в адресе (`?view=grid`), умолчание — список. */
export type FilesView = 'list' | 'grid';

const VIEWS = [
  { value: 'list', label: 'list' },
  { value: 'grid', label: 'grid' },
] as const;

/** Порядок называется коротко и со стрелкой: это кнопка-слово, а не выпадающий список. */
const SORT_SHORT: Record<FilesSort, string> = {
  new: 'newest ↓',
  name: 'by name',
  size: 'by size',
};
/** Телефон: строка фильтров обязана влезть в одну прокрутку — порядок короче. */
const SORT_TINY: Record<FilesSort, string> = {
  new: 'new ↓',
  name: 'a–z',
  size: 'size ↓',
};
const SORT_CYCLE: FilesSort[] = ['new', 'name', 'size'];

/**
 * ФИЛЬТР ПО ЧЕЛОВЕКУ: один пикер человека и переключатель роли при нём.
 *
 * Не два фильтра («чьё загружено» и «кто ведёт»), а один вопрос и уточнение к нему. Человек
 * приходит сюда со «что там числится за Пашей» и разницы между двумя ролями ещё не видел —
 * выбрать между двумя отдельными органами он в этот момент не может, а выбрав не тот, решит,
 * что фильтр врёт.
 *
 * УЕЗЖАЕТ id, А НЕ ИМЯ. Подставить имя в строку поиска было бы дешевле на один экран и неверно
 * навсегда: `search` матчит загрузившего СТРОКОЙ, а строка переживает аккаунт — `username`
 * уникален и освобождается при удалении, так что нанятый позже однофамилец унаследовал бы всю
 * историю ушедшего. Поэтому список людей здесь — источник ВЫБОРА (`ListAdmins` отдаёт только
 * живые аккаунты), а не источник подписи.
 *
 * ПЕРЕКЛЮЧАТЕЛЬ РОЛИ СПРЯТАН, ПОКА ЧЕЛОВЕК НЕ ВЫБРАН: роль бессмысленна, пока вопрос не задан, и
 * задаётся он соседним органом в одном движении. Разница ролей — в подсказке чипа, а не строкой.
 *
 * МЕСТО — ПОПОВЕР В СТРОКЕ ФИЛЬТРОВ: это уточнение выдачи, которым пользуются редко, поэтому
 * список ролей появляется только после выбора человека.
 */
export function PersonFilter({
  personId,
  personRole,
  onPerson,
  onPersonRole,
}: {
  personId: number;
  personRole: PersonRoleFilter;
  onPerson: (id: number) => void;
  onPersonRole: (role: PersonRoleFilter) => void;
}) {
  const { data } = useAdmins();
  const admins = (data?.admins ?? []).filter((a) => Number(a.id ?? 0) > 0);
  const picked = admins.find((a) => Number(a.id ?? 0) === personId);

  const items = [
    { value: '0', label: 'all people' },
    ...admins.map((a) => ({
      value: String(a.id),
      label: a.username ?? `#${a.id}`,
    })),
    // ID ИЗ АДРЕСА, КОТОРОГО НЕТ В СПИСКЕ, всё равно получает строку. Ссылку кидают в чат, а
    // `ListAdmins` отдаёт только включённые аккаунты — за месяц человек мог уйти. Без этой
    // строки пикер молча показал бы «все люди», хотя сетка отфильтрована: экран спорил бы сам
    // с собой, а пустая выдача читалась бы как поломка. `#id` — честно: имени у нас нет.
    ...(personId > 0 && !picked ? [{ value: String(personId), label: `#${personId}` }] : []),
  ];

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        name='person'
        value={String(personId)}
        onValueChange={(v: string) => onPerson(Number(v) || 0)}
        placeholder='person'
        items={items}
        customWidth={200}
        className='w-full'
        renderValue={(value: string | number) =>
          Number(value) > 0 ? (
            <span className='flex min-w-0 items-center gap-1.5'>
              <Avatar name={picked?.username ?? ''} size={16} />
              <Text component='span' className='truncate'>
                {picked?.username ?? `#${personId}`}
              </Text>
            </span>
          ) : (
            <Text variant='label' component='span'>
              all people
            </Text>
          )
        }
      />
      {personId > 0 && (
        <div role='group' aria-label='role on the file' className='flex items-center gap-1'>
          {ROLES.map((r) => (
            <Chip
              key={r}
              selected={personRole === r}
              pressed={personRole === r}
              title={PERSON_ROLE_HINT[r]}
              onClick={() => onPersonRole(r)}
            >
              {PERSON_ROLE_CHIP[r]}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function Count({ children }: { children: number }) {
  return <span className='text-control tabular-nums opacity-70'>{children}</span>;
}

/**
 * ЕДИНСТВЕННАЯ СТРОКА ФИЛЬТРОВ НАД ВЫДАЧЕЙ: темы, человек, «разобрать», выбранные темы,
 * затем порядок и вид. На узком экране строка прокручивается целиком, а не раскладывает один
 * набор органов на несколько этажей.
 *
 * ПОПОВЕР ТЕМ ПОКАЗЫВАЕТ ТОЛЬКО НЕПУСТЫЕ ТЕМЫ. Пустая тема из старой ссылки остаётся снаружи
 * выбранным чипом: сетка по-прежнему сужена её id, и снять фильтр можно независимо от словаря.
 */
export function FilesFilters({
  topics,
  selected,
  untopiced,
  untopicedCount,
  onTopics,
  personId,
  personLabel,
  personRole,
  onPerson,
  onPersonRole,
  sort,
  onSort,
  view,
  onView,
}: {
  topics: FileTopic[];
  selected: number[];
  untopiced: boolean;
  untopicedCount: number;
  onTopics: (next: TopicSelection) => void;
  personId: number;
  personLabel: string;
  personRole: PersonRoleFilter;
  onPerson: (id: number) => void;
  onPersonRole: (role: PersonRoleFilter) => void;
  sort: FilesSort;
  onSort: (sort: FilesSort) => void;
  view: FilesView;
  onView: (view: FilesView) => void;
}) {
  const [topicQuery, setTopicQuery] = useState('');
  const query = topicQuery.trim().toLocaleLowerCase();
  const availableTopics = topics.filter(
    (topic) =>
      Number(topic.filesCount ?? 0) > 0 &&
      (!query || (topic.name ?? '').toLocaleLowerCase().includes(query)),
  );
  const atLimit = selected.length >= MAX_TOPIC_FILTERS;
  const toggle = (id: number) => onTopics(toggleTopic(selected, id));
  const nextSort = SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length];
  const menuItem =
    'flex w-full items-center gap-2 border-b border-hairline px-1 py-1.5 text-left last:border-b-0';

  return (
    <div
      role='toolbar'
      aria-label='file filters'
      className='flex items-center gap-1.5 border-t border-hairline px-block py-2.5'
    >
      <div className='flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain pr-1.5'>
        <GenericPopover
          title='topics'
          noTail
          triggerProps={{ asChild: true }}
          openElement={
            <Chip
              selected={selected.length > 0}
              pressed={selected.length > 0}
              onClick={() => undefined}
            >
              topics
              {selected.length > 0 && <Count>{selected.length}</Count>}
            </Chip>
          }
        >
          <Input
            name='topic-find'
            value={topicQuery}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setTopicQuery(event.target.value)}
            placeholder='find'
            aria-label='find topic'
            className='w-full'
          />
          <div role='group' aria-label='topics' className='mt-1 flex flex-col'>
            {availableTopics.map((topic) => {
              const id = Number(topic.id);
              const on = selected.includes(id);
              const disabled = atLimit && !on;
              return (
                <Button
                  key={id}
                  aria-pressed={on}
                  disabled={disabled}
                  title={disabled ? `max ${MAX_TOPIC_FILTERS} topics` : topic.name ?? undefined}
                  className={menuItem}
                  onClick={() => toggle(id)}
                >
                  <span aria-hidden className='w-3 shrink-0 text-textColor'>
                    {on ? '✓' : ''}
                  </span>
                  <span className='min-w-0 flex-1 truncate'>{topic.name ?? `#${id}`}</span>
                  <Count>{Number(topic.filesCount ?? 0)}</Count>
                </Button>
              );
            })}
          </div>
          <div className='mt-1.5 flex items-center gap-3 border-t border-hairline pt-1.5'>
            <Button asChild variant='underline' className='text-labelColor'>
              <Link to={ROUTES.fileTopics}>manage</Link>
            </Button>
            {selected.length > 0 && (
              <Button
                variant='underline'
                className='ml-auto text-labelColor'
                onClick={() => onTopics({ topicIds: [], untopiced: false })}
              >
                clear
              </Button>
            )}
          </div>
        </GenericPopover>

        <GenericPopover
          title='person'
          noTail
          triggerProps={{ asChild: true }}
          openElement={
            <Chip
              selected={personId > 0}
              pressed={personId > 0}
              title={personLabel || 'person'}
              onClick={() => undefined}
            >
              <span className='max-w-[16ch] truncate'>{personLabel || 'person'}</span>
            </Chip>
          }
        >
          <div className='p-2.5'>
            <PersonFilter
              personId={personId}
              personRole={personRole}
              onPerson={onPerson}
              onPersonRole={onPersonRole}
            />
          </div>
        </GenericPopover>

        <Chip
          tone='error'
          selected={untopiced}
          pressed={untopiced}
          onClick={() => onTopics({ topicIds: [], untopiced: !untopiced })}
        >
          unsorted
          <Count>{untopicedCount}</Count>
        </Chip>

        {selected.map((id) => {
          const name = topics.find((topic) => Number(topic.id) === id)?.name ?? `#${id}`;
          return (
            <Chip
              key={id}
              selected
              pressed
              title={name}
              onClick={() => toggle(id)}
              onRemove={() => toggle(id)}
            >
              <span className='max-w-[24ch] truncate'>{name}</span>
            </Chip>
          );
        })}
      </div>

      <span className='flex shrink-0 items-center gap-2.5'>
        <Button
          className='whitespace-nowrap text-labelColor hover:text-textColor'
          title={`${SORT_LABEL[sort]} · next: ${SORT_LABEL[nextSort]}`}
          onClick={() => onSort(nextSort)}
        >
          <span className='sm:hidden'>{SORT_TINY[sort]}</span>
          <span className='hidden sm:inline'>{SORT_SHORT[sort]}</span>
        </Button>
        <ViewSwitch value={view} options={VIEWS} onChange={onView} label='view' />
      </span>
    </div>
  );
}

/**
 * ОДИН «+» ВМЕСТО ТРЁХ КНОПОК. Загрузка, заметка и вставка — три способа положить в библиотеку
 * новый файл, и для читающего шапку разницы между ними нет; рядом с ними словарь тем, потому что
 * правится он на своём экране. Тумблера «запись / чтение» больше нет: есть право — можно писать.
 */
export function AddMenu({
  writable,
  onUpload,
  onNewNote,
  onPaste,
}: {
  writable: boolean;
  onUpload: () => void;
  onNewNote: () => void;
  onPaste: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const item = 'w-full border-b border-hairline px-3.5 py-3 text-left last:border-b-0';
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      noTail
      triggerProps={{ asChild: true }}
      contentProps={{ align: 'end' }}
      className='w-44'
      openElement={
        <Button
          variant='main'
          aria-label='add'
          className='flex h-10 min-w-10 items-center justify-center px-3.5 uppercase tracking-label'
        >
          <span aria-hidden className='lg:hidden'>
            +
          </span>
          <span className='hidden lg:inline'>+ add</span>
        </Button>
      }
    >
      <Button className={item} disabled={!writable} onClick={run(onUpload)}>
        upload file
      </Button>
      <Button className={item} disabled={!writable} onClick={run(onNewNote)}>
        new note
      </Button>
      <Button className={item} disabled={!writable} onClick={run(onPaste)}>
        paste
      </Button>
      <Button asChild className={`${item} text-labelColor hover:text-textColor`}>
        <Link to={ROUTES.fileTopics}>manage topics</Link>
      </Button>
      <Button asChild className={`${item} text-labelColor hover:text-textColor`}>
        <Link to={ROUTES.filesShared}>shared</Link>
      </Button>
    </GenericPopover>
  );
}

/**
 * Строка статуса: сколько найдено, чем сужено, как сбросить — одной строкой под шапкой.
 *
 * Она заменяет подписи под рядами чипов: «пересечение» сказано знаком `&` между темами, а не
 * фразой. «unsorted» красным — тем же цветом, что и его чип.
 */
export function StatusLine({
  matched,
  parts,
  untopiced,
  filtered,
  onReset,
  selecting,
  selectedCount = 0,
  onToggleSelecting,
}: {
  /** `undefined` — ответ ещё не приехал. */
  matched?: number;
  /** Названия действующих фильтров, уже собранные: «design & atelier», «pasha», «“logo”». */
  parts: string[];
  untopiced: boolean;
  /** Есть ли что сбрасывать. Без этого «reset» не рисуется вовсе. */
  filtered: boolean;
  onReset: () => void;
  /**
   * ТЕЛЕФОННЫЙ ВХОД В ВЫБОР — САМО ЧИСЛО. «6 files» подчёркнуто и включает выбор; в режиме
   * то же место говорит «N selected · done». Отдельного слова «select» нет: оно стояло рядом с
   * сортировкой и видом и читалось третьим переключателем. На десктопе пропы не передаются.
   */
  selecting?: boolean;
  selectedCount?: number;
  onToggleSelecting?: () => void;
}) {
  return (
    <div
      role='status'
      className='flex items-center gap-2.5 border-t border-hairline px-block py-2.5 text-textBaseSize text-labelColor'
    >
      {/* Одна строка всегда: число впереди и не режется, фильтры уходят в многоточие. */}
      <span className='flex min-w-0 items-center gap-2.5'>
        {selecting && onToggleSelecting ? (
          <span className='flex min-w-0 items-center gap-1'>
            <span className='min-w-0 truncate'>
              <span className='font-bold tabular-nums text-textColor'>{selectedCount}</span>{' '}
              selected
            </span>
            <span aria-hidden>·</span>
            <Button
              variant='underline'
              aria-pressed
              className='shrink-0 text-textColor'
              onClick={onToggleSelecting}
            >
              done
            </Button>
          </span>
        ) : (
          <span className='min-w-0 truncate'>
            {onToggleSelecting ? (
              <Button variant='underline' aria-pressed={false} onClick={onToggleSelecting}>
                <span className='font-bold tabular-nums text-textColor'>{matched ?? '…'}</span>{' '}
                {matched === 1 ? 'file' : 'files'}
              </Button>
            ) : (
              <>
                <span className='font-bold tabular-nums text-textColor'>{matched ?? '…'}</span>{' '}
                {matched === 1 ? 'file' : 'files'}
              </>
            )}
            {untopiced && (
              <>
                {' · '}
                <span className='text-error'>unsorted</span>
              </>
            )}
            {parts.map((p) => (
              <span key={p}>
                {' · '}
                <span className='text-textColor'>{p}</span>
              </span>
            ))}
          </span>
        )}
        {filtered && (
          <Button variant='underline' className='shrink-0 text-textColor' onClick={onReset}>
            reset
          </Button>
        )}
      </span>
    </div>
  );
}

/**
 * ШАПКА ХОЛСТА — содержимое первым.
 *
 * Проект и добавление стоят в заголовке на любой ширине; поиск лежит под ними, затем единая
 * строка фильтров. Строка статуса и описание темы остаются внутри того же блока.
 */
export function FilesHeader({
  title,
  search,
  onSearch,
  actions,
  filters,
  children,
}: {
  title: ReactNode;
  search: string;
  onSearch: (v: string) => void;
  actions: ReactNode;
  filters: ReactNode;
  /** Строка статуса и всё, что ниже линии. */
  children?: ReactNode;
}) {
  return (
    <div className='border border-borderColor bg-bgColor'>
      <div className='flex flex-col gap-stack p-block'>
        <div className='flex min-w-0 items-center gap-2'>
          {title}
          <div className='ml-auto flex shrink-0 items-center gap-2'>{actions}</div>
        </div>
        <Input
          name='search'
          type='text'
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
          placeholder='name, topic, person'
          aria-label='search'
          className='h-10 w-full px-3 lg:max-w-md'
        />
      </div>
      {filters}
      {children}
    </div>
  );
}
