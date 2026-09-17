import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useFilesWritable } from 'lib/stores/files-mode';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { ARCHIVED_WORD, projectDates } from '../components/topic-chips';
import { NewProjectModal } from './new-project-modal';
import { isProjectTopic, useFileTopics } from '../hooks/useFiles';
import { plural } from '../upload/text';

/**
 * ИНДЕКС ПРОЕКТОВ.
 *
 * Ряд чипов на холсте работает, пока проектов меньше десятка; на тридцати первом он перестаёт
 * быть рядом и становится стеной. Здесь ровно то, чего ряду не хватает: сортировка, поиск и
 * отдельный блок архива — и ни одного запроса на строку. Числа берутся из `ListFileTopics`,
 * которым нарисована сама таблица.
 *
 * КОЛОНКИ «СТИЛИ» ЗДЕСЬ НЕТ, и это решение. Вещи проекта отдаёт `ListFileTopicStyles`, по
 * одному вызову на проект: тридцать строк — тридцать запросов на открытие экрана. Чипы вещей
 * остаются в шапке ОДНОГО проекта, где это один вызов.
 */

type SortKey = 'name' | 'date' | 'files';

const SORT_LABEL: Record<SortKey, string> = {
  name: 'name',
  date: 'dates',
  files: 'files',
};

/**
 * СОРТИРОВКА НАСТОЯЩАЯ, А НЕ ОБЕЩАННАЯ ПОДПИСЬЮ.
 *
 * Имя — по алфавиту. Дата — от поздней к ранней, и проект БЕЗ дат уезжает в конец: пустая
 * дата это «не событие», а не «самое старое», и смешивать её с датированными по возрастанию
 * значило бы утверждать, что бекап CLO случился раньше всех съёмок. Файлы — от большего, а на
 * равных числах имя, иначе порядок строк менялся бы от ответа к ответу.
 */
function comparator(key: SortKey): (a: FileTopic, b: FileTopic) => number {
  const byName = (a: FileTopic, b: FileTopic) => (a.name ?? '').localeCompare(b.name ?? '');
  if (key === 'name') return byName;
  if (key === 'files')
    return (a, b) => Number(b.filesCount ?? 0) - Number(a.filesCount ?? 0) || byName(a, b);
  return (a, b) => {
    const da = (a.startsAt ?? '').trim();
    const db = (b.startsAt ?? '').trim();
    if (!da && !db) return byName(a, b);
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da) || byName(a, b);
  };
}

export default function FileProjectsIndex() {
  const navigate = useNavigate();
  const { canRead, canWrite, resolved } = usePermissions();
  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  const writable = useFilesWritable(mayWrite);

  // Тот же ключ, что у экрана тем: словарь с архивом читают оба, и второго запроса за тем же
  // ответом раздел не заводит.
  const topicsQuery = useFileTopics(true);
  const all = topicsQuery.data?.topics ?? [];

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [creating, setCreating] = useState(false);

  const { live, archived } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = all
      .filter(isProjectTopic)
      .filter((p) => !needle || (p.name ?? '').toLowerCase().includes(needle))
      .sort(comparator(sort));
    return {
      live: rows.filter((p) => !p.archived),
      archived: rows.filter((p) => p.archived),
    };
  }, [all, q, sort]);

  if (!mayRead) {
    return (
      <div className='border border-borderColor bg-bgColor p-block'>
        <Text className='uppercase'>no access to files</Text>
        <Text size='micro' variant='label' className='mt-1'>
          the projects are opened by the same files:read right as the library itself.
        </Text>
      </div>
    );
  }

  const row = (p: FileTopic) => {
    const dates = projectDates(p);
    const n = Number(p.filesCount ?? 0);
    return (
      <tr key={p.id}>
        <td data-align='left'>
          {/* ИМЯ — КНОПКА В САМ ПРОЕКТ. Адрес тот же, которым живут глубокие ссылки из задач и
              с карточек вещей: индекс не заводит второго способа открыть проект. */}
          <Button asChild size='xs' variant='underline'>
            <Link to={`${ROUTES.files}?project=${p.id}`}>{p.name}</Link>
          </Button>
          {p.archived && (
            <Text size='nano' variant='label' component='span' className='ml-1.5'>
              {ARCHIVED_WORD}
            </Text>
          )}
        </td>
        <td data-align='left' className='tabular-nums'>
          {dates ? (
            <Text size='micro' variant='label' component='span'>
              {dates}
            </Text>
          ) : (
            <EmptyCell />
          )}
        </td>
        <td className='tabular-nums'>{n}</td>
      </tr>
    );
  };

  return (
    <div className='flex flex-col gap-gutter'>
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='projects'
          question={`— ${live.length} open, ${archived.length} archived`}
          action={
            <>
              <Input
                name='projectSearch'
                value={q}
                placeholder='find a project'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                className='w-[190px]'
              />
              <Button asChild size='xs' variant='secondary'>
                <Link to={ROUTES.files}>to the files</Link>
              </Button>
              {/* ЗАВЕДЕНИЕ ПРОЕКТА — ЗДЕСЬ И В ОДНО НАЖАТИЕ. Довод — ниже, у самой модалки. */}
              <Button
                size='xs'
                variant='main'
                disabled={!writable}
                title={
                  writable ? undefined : 'right now it is read-only — projects are not started'
                }
                onClick={() => setCreating(true)}
              >
                + new project
              </Button>
            </>
          }
        />

        {topicsQuery.isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : !live.length && !archived.length ? (
          <Text size='micro' variant='label'>
            {q.trim()
              ? `nothing is called “${q.trim()}”. the field searches by name only — a project is found in the library itself by what lies inside it.`
              : 'no projects yet. a project is a topic that got dates, an archive and roles on the files inside it: start one with the button above, or give the kind to a topic that already exists on the topics screen.'}
          </Text>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  {(['name', 'date', 'files'] as SortKey[]).map((k) => (
                    <th key={k} data-align={k === 'files' ? undefined : 'left'}>
                      {/* ЗАГОЛОВОК СОРТИРУЕТ, И ЭТО ВИДНО. `aria-pressed` здесь несущий: три
                          одинаковые на вид кнопки без нажатого состояния не говорят, по какой
                          из них список сейчас выстроен. */}
                      <Button
                        size='xs'
                        variant='underline'
                        aria-pressed={sort === k}
                        onClick={() => setSort(k)}
                      >
                        {SORT_LABEL[k]}
                      </Button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{live.map(row)}</tbody>
            </DataTable>

            {archived.length > 0 && (
              <div className='mt-3 flex flex-col gap-1'>
                <SectionHeader
                  title='archive'
                  question={`— ${archived.length} ${plural(archived.length, 'project')}`}
                />
                <DataTable>
                  <tbody>{archived.map(row)}</tbody>
                </DataTable>
                <Text size='micro' variant='label'>
                  an archived project stays here and on a direct link — the archive takes it out of
                  the chips and the pickers, it does not delete it. dropping another file in still
                  works: a project is a box and gets closed, and putting one more thing into a
                  closed box is a coherent action. deleting a project is not offered at all — it
                  always holds files.
                </Text>
              </div>
            )}

            <Text size='micro' variant='label' className='mt-2 block'>
              sorted by {SORT_LABEL[sort]} right now. every count is the number of files carrying
              that project, from the same answer this table is drawn with — no request per row.
            </Text>
          </>
        )}
      </div>

      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onDone={(id) => navigate(`${ROUTES.files}?project=${id}`)}
        />
      )}
    </div>
  );
}
