import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { ARCHIVED_WORD, projectDates } from '../components/topic-chips';
import { invalidateFileViews, isProjectTopic, useFileTopics } from '../hooks/useFiles';
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
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
                title={writable ? undefined : 'right now it is read-only — projects are not started'}
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

      {creating && <NewProjectModal onClose={() => setCreating(false)} onDone={(id) => navigate(`${ROUTES.files}?project=${id}`)} />}
    </div>
  );
}

/**
 * ЗАВЕДЕНИЕ ПРОЕКТА — ОДИН ДИАЛОГ, А НЕ ТРИ ЭКРАНА.
 *
 * До этого проект заводился кружным путём: экран тем → создать тему → «kind and dates» →
 * переключатель. Три экрана и знание о том, что внутри проект это повышенная тема, — заказчик
 * об этот путь споткнулся, и правильно: он обязан думать «завожу съёмку», а не «завожу ярлык и
 * повышаю его».
 *
 * МОДЕЛЬ ПРИ ЭТОМ НЕ ОБХОДИТСЯ. Проект и есть тема с типом; здесь просто делаются оба вызова
 * подряд, ровно те же, что делал человек руками. Затравку ролей сервер сеет сам на повышении.
 *
 * КОМПОНЕНТ ЖИВЁТ НА УРОВНЕ МОДУЛЯ, а не внутри экрана: вложенное объявление получает новую
 * личность на каждую отрисовку родителя, и React размонтировал бы диалог вместе с набранным
 * именем от любого чужого обновления — поиска, ответа запроса, инвалидации.
 */
function NewProjectModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: number) => void;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);

  const create = useMutation({
    mutationFn: (a: { name: string; description: string }) =>
      topicsService.create(a.name, a.description),
  });
  const promote = useMutation({
    mutationFn: (a: { topicId: number; startsAt: string; endsAt: string }) =>
      topicsService.updateMeta({
        topicId: a.topicId,
        kind: 'project',
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        archived: false,
      }),
  });

  const datesReversed = ISO_DAY.test(from) && ISO_DAY.test(to) && to < from;

  /**
   * ДВА ВЫЗОВА ЗА ОДНО НАЖАТИЕ, И ВТОРОЙ — ЭТО И ЕСТЬ «СТАТЬ ПРОЕКТОМ».
   *
   * Модель не обходится: проект это тема, которой дали тип, и `UpdateFileTopicMeta` — тот же
   * самый вызов, который делает человек, идущий длинным путём (экран тем → «kind and dates» →
   * переключатель). Здесь просто нет двух экранов между намерением и результатом. Сервер на
   * повышении сам сеет стартовый набор ролей — та же затравка, что и на длинном пути.
   *
   * ПОЛУОТКАЗ НАЗЫВАЕТСЯ ПОЛУОТКАЗОМ. Упади второй вызов — тема уже создана, и молчать об
   * этом нельзя: повторное нажатие завело бы ВТОРУЮ тему с тем же именем и получило бы отказ
   * по уникальности, то есть человек прочёл бы «имя занято» про имя, которое сам только что
   * и занял. Поэтому здесь называется и что легло, и где доделать.
   */
  const submit = async () => {
    const nm = name.trim();
    if (!nm || datesReversed) return;
    setSaving(true);
    let id = 0;
    try {
      const res = await create.mutateAsync({ name: nm, description: description.trim() });
      id = Number(res.id ?? 0);
      if (!id) throw new Error('the server did not return the id of the new topic');
      await promote.mutateAsync({ topicId: id, startsAt: from.trim(), endsAt: to.trim() });
      invalidateFileViews(qc);
      showMessage(`the project “${nm}” is started`, 'success');
      onClose();
      onDone(id);
    } catch (e) {
      invalidateFileViews(qc);
      showMessage(
        id
          ? `${failureText(e, "couldn't give it the kind")} — the topic “${nm}” is created but is still an ordinary label: give it the kind on the topics screen`
          : failureText(e, "couldn't start the project"),
        'error',
      );
      setSaving(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => !o && onClose()}
      onConfirm={submit}
      title='new project'
      confirmLabel={saving ? 'starting…' : 'start the project'}
      confirmDisabled={saving || !name.trim() || datesReversed}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2'>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            name
          </Text>
          <Input
            name='newProjectName'
            value={name}
            placeholder='for example autumn shoot'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            description
          </Text>
          <textarea
            rows={5}
            value={description}
            aria-label='project description'
            placeholder='what is being shot, for whom, and what lands in here'
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setDescription(e.target.value)
            }
            className='w-full border border-borderColor bg-bgColor px-2 py-1.5 text-micro'
          />
        </div>
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            dates
          </Text>
          <div className='flex flex-wrap items-end gap-2'>
            <Input
              name='newProjectFrom'
              type='date'
              value={from}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
              className='w-[160px]'
            />
            <Input
              name='newProjectTo'
              type='date'
              value={to}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
              className='w-[160px]'
            />
          </div>
          {datesReversed && (
            <Text size='micro' variant='error'>
              the end is earlier than the start
            </Text>
          )}
          <Text size='micro' variant='label'>
            leave them empty if this is not an event: a clo backup has no dates at all, and that
            is a state, not an unfilled field.
          </Text>
        </div>
        <Text size='micro' variant='label'>
          a project IS a topic — one that has dates, an archive and roles on the files inside it.
          starting it here does both halves in one press: the topic is created and given the
          kind. if this name already exists as an ordinary label, the server refuses it — give
          that one the kind on the topics screen instead of making a second one.
        </Text>
      </div>
    </ConfirmationModal>
  );
}

