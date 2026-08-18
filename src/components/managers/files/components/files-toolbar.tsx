import { Link } from 'react-router-dom';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { ROUTES } from 'constants/routes';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
import {
  PERSON_ROLE_CHIP,
  PERSON_ROLE_HINT,
  SORT_LABEL,
  type FilesSort,
  type PersonRoleFilter,
} from '../hooks/useFiles';

const SORT_ITEMS = (Object.keys(SORT_LABEL) as FilesSort[]).map((k) => ({
  value: k,
  label: SORT_LABEL[k],
}));

const ROLES: PersonRoleFilter[] = ['any', 'uploaded', 'owner'];

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
 * ПЕРЕКЛЮЧАТЕЛЬ РОЛИ СПРЯТАН, ПОКА ЧЕЛОВЕК НЕ ВЫБРАН, и это осознанное отступление от правила
 * раздела «выключено и подписано, а не спрятано». То правило защищает орган, которого человеку
 * НЕ ДАЮТ: право `files:write`, круг правки владельцев — спрятанного не попросишь, и потому
 * такой орган стоит выключенным с подписью, у кого просить. Здесь просить не у кого: роль
 * бессмысленна не по чужому решению, а потому что вопрос ещё не задан, и задаётся он соседним
 * органом в одном движении мыши. Выключенный трёхпозиционный переключатель стоял бы в полосе
 * ВСЕГДА — в том числе во всех сеансах, где фильтром по человеку не пользуются вовсе, — и был
 * бы единственным неживым органом полосы. Сам пикер человека не прячется никогда: он и
 * рассказывает, что фильтр существует.
 */
function PersonFilter({
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
    <>
      <SelectComponent
        name='person'
        value={String(personId)}
        onValueChange={(v: string) => onPerson(Number(v) || 0)}
        placeholder='person'
        items={items}
        customWidth={200}
        className='max-w-[190px]'
        renderValue={(value: string | number) =>
          Number(value) > 0 ? (
            <span className='flex min-w-0 items-center gap-1.5'>
              <Avatar name={picked?.username ?? ''} size={16} />
              <Text size='micro' component='span' className='truncate uppercase'>
                {picked?.username ?? `#${personId}`}
              </Text>
            </span>
          ) : (
            <Text size='micro' variant='label' component='span' className='uppercase'>
              all people
            </Text>
          )
        }
      />
      {personId > 0 && (
        <>
          <div role='group' aria-label='the person’s role on the file' className='flex items-center gap-1'>
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
          {/* Подпись меняется вместе с положением: разницу между «загрузил» и «ведёт» проще
              один раз увидеть, чем прочитать заранее. */}
          <Text size='micro' variant='label' className='max-w-[44ch]'>
            {PERSON_ROLE_HINT[personRole]}
          </Text>
        </>
      )}
    </>
  );
}

/**
 * Полоса управления холстом.
 *
 * Подпись поиска — обязательство, а не украшение: сервер ищет по имени файла, по названию
 * темы и по имени того, кто загрузил, и НЕ смотрит внутрь файла (текст из pdf, выгруженного
 * фигмой, не извлекается вообще). Подпись уже поведения хуже её отсутствия: человек ищет по
 * имени коллеги, не находит и делает вывод, что поиск сломан.
 */
export function FilesToolbar({
  search,
  onSearch,
  sort,
  onSort,
  personId,
  personRole,
  onPerson,
  onPersonRole,
  mode,
  onMode,
  canWrite,
  onUpload,
  onNewNote,
  className,
}: {
  search: string;
  onSearch: (v: string) => void;
  sort: FilesSort;
  onSort: (v: FilesSort) => void;
  /**
   * ФИЛЬТР, А НЕ ПРАВО: режим «только чтение» его не касается — читать можно всё. Поэтому он и
   * стоит слева, с поиском и порядком, а не справа с писателями полосы.
   */
  personId: number;
  personRole: PersonRoleFilter;
  onPerson: (id: number) => void;
  onPersonRole: (role: PersonRoleFilter) => void;
  /** Добровольный режим. Без `files:write` принудительно `read` и заблокирован. */
  mode: 'write' | 'read';
  onMode: (v: 'write' | 'read') => void;
  canWrite: boolean;
  onUpload: () => void;
  onNewNote: () => void;
  /** Полоса — часть общего блока со словарём тем, поэтому свой внешний бордер она снимает. */
  className?: string;
}) {
  const writing = canWrite && mode === 'write';
  return (
    <Toolbar className={className}>
      <Input
        name='search'
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        placeholder='file name, topic or person'
        className='max-w-[260px]'
      />
      <Text size='micro' variant='label' className='max-w-[40ch]'>
        searches by names, topics and people, not by the contents of a file
      </Text>
      <SelectComponent
        name='sort'
        value={sort}
        onValueChange={(v: string) => onSort(v as FilesSort)}
        placeholder='order'
        items={SORT_ITEMS}
        customWidth={160}
        className='max-w-[170px]'
      />
      <PersonFilter
        personId={personId}
        personRole={personRole}
        onPerson={onPerson}
        onPersonRole={onPersonRole}
      />
      {/* ПРАВАЯ ГРУППА ПЕРЕНОСИТСЯ ЦЕЛИКОМ, а не рассыпается. `ToolbarSpacer` — это `ml-auto` на
          отдельном элементе, и в переносимой строке он растаскивал четыре кнопки по двум
          строкам: «темы» одиноко у правого края первой, остальные три у левого края второй.
          Пока полоса помещалась в одну строку, этого не было видно; фильтр по человеку сделал
          перенос обычным делом. Отступ переехал на саму группу — теперь она едет вправо и
          переносится как одно целое. */}
      <div className='ml-auto flex flex-wrap items-center justify-end gap-2'>
        {/* Словарь тем правится на своём экране: здесь чип по клику фильтрует, и правка имени
            на том же элементе потребовала бы второго жеста. */}
        <Button asChild size='xs' variant='secondary'>
          <Link to={ROUTES.fileTopics}>topics</Link>
        </Button>
        {/* Тумблер и права — ОДИН механизм. Без files:write он не «спрятан», а заблокирован в
            «чтении»: спрятанного не попросишь, а строка над сеткой объясняет, чего не хватает.

            ПОДПИСЬ НАЗЫВАЕТ СОСТОЯНИЕ, А НАЖАТИЕ ДЕЛАЕТ ОБРАТНОЕ — и это законно ровно потому,
            что кнопка объявлена `aria-pressed`: положение переключателя и есть то, что она
            показывает. Глазами это всё равно двусмысленно («запись» — я в ней или включаю её?),
            поэтому действие названо подсказкой. Тот же приём, что у «разворота» в читалке, только
            зеркальный: там подпись — действие, а состояние ушло в подсказку. */}
        <Button
          size='xs'
          variant='secondary'
          aria-pressed={mode === 'write'}
          disabled={!canWrite}
          title={
            canWrite
              ? writing
                ? 'switch writing off — only reading will be left'
                : 'switch writing on'
              : 'the files:write right is needed'
          }
          onClick={() => onMode(mode === 'write' ? 'read' : 'write')}
        >
          {writing ? 'mode: writing' : 'mode: read-only'}
        </Button>
        {/* Заметка стоит РЯДОМ с загрузкой, а не в отдельном месте: и то и другое кладёт в
            библиотеку новый файл, и для читающего полосу разницы между ними нет. Глушится тем же
            `writing`, потому что создание — это запись. */}
        <Button size='xs' variant='secondary' disabled={!writing} onClick={onNewNote}>
          note
        </Button>
        <Button size='xs' variant='main' disabled={!writing} onClick={onUpload}>
          upload
        </Button>
      </div>
    </Toolbar>
  );
}
