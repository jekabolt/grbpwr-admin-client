import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { notePath, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ACCESS_LEVEL_TITLE, asAccessLevel } from '../api/accessService';
import {
  isProjectTopic,
  useFileRoles,
  useFilesMutations,
  useLibraryFile,
} from '../hooks/useFiles';
import { extensionOf, formatBytes, kindWord } from '../utils/format';
import { isMarkdownNote, isReadablePdf } from '../utils/reader-find';
import { FailureText } from './failure-text';
import { FileAccessSection } from './file-access-section';
import { FileComments } from './file-comments';
import { FileOwnersSection } from './file-owners-section';
import { FileReaderModal } from './file-reader';
import { FileTasksSection, useFileTasks } from './file-tasks-section';
import { ProjectArchiveMark, projectHint } from './topic-chips';

/** Что из карточки свёрнуто в строку. Ключи — те же четыре, что и строк. */
type CardLineKey = 'own' | 'acc' | 'task' | 'talk';

/** Одна строка «в каком проекте — с какой ролью». */
type ProjectRole = { id: number; name: string; role?: { roleId: number; roleName: string } };

/**
 * СТРОКА РОЛИ — СВОЙ СЛОВАРЬ НА КАЖДЫЙ ПРОЕКТ (0323), а не один общий на карточку.
 *
 * Файл лежит в трёх проектах — значит и словарей три, РАЗНЫХ: с тех пор как у роли появился
 * владелец, «исходники» съёмки и «исходники» лукбука это две строки, и предложить слово одного
 * проекта в другом значит предложить жест, на который сервер отвечает
 * `role belongs to another project`.
 *
 * Отдельный компонент, а не `useQueries` в карточке: число строк меняется от ответа сервера, и
 * хук на строку живёт в самой строке — она монтируется и размонтируется вместе со своим
 * запросом. Цена названа вслух: файл в трёх проектах стоит трёх `ListFileRoles`, по одному на
 * строку. Дешевле было бы одним «индексом всех ролей», но им нельзя ПРЕДЛАГАТЬ — он отдаёт и
 * чужие слова, и отличить их в нём можно только тем же самым проектом.
 */
function ProjectRoleRow({
  row,
  writable,
  saving,
  onPick,
}: {
  row: ProjectRole;
  writable: boolean;
  saving: boolean;
  onPick: (projectTopicId: number, roleId: number) => void;
}) {
  const rolesQuery = useFileRoles(row.id, false, row.id > 0);
  const roles = rolesQuery.data?.roles ?? [];
  const known = roles.some((r) => Number(r.id) === row.role?.roleId);

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        {row.name}
      </Text>
      <ChipRow>
        <Chip
          selected={!row.role?.roleId}
          pressed={!row.role?.roleId}
          disabled={!writable || saving}
          onClick={() => onPick(row.id, 0)}
        >
          without a role
        </Chip>
        {roles.map((r) => {
          const rid = Number(r.id);
          const on = row.role?.roleId === rid;
          return (
            <Chip
              key={rid}
              selected={on}
              pressed={on}
              disabled={!writable || saving}
              title={writable ? undefined : "read-only — the role can't be changed"}
              onClick={() => onPick(row.id, on ? 0 : rid)}
            >
              {r.name}
            </Chip>
          );
        })}
        {/* Роль, которой нет в словаре этого проекта, — заархивированная (словарь просят без
            архива). Показать её обязательно: она стоит на файле, и без чипа человек видел бы
            «без роли» там, где роль есть. Снять её можно, назначить заново — нет.

            Пока словарь в пути, чипа НЕТ: иначе живая роль на полсекунды объявлялась бы
            архивной — утверждение, которого никто не проверял. */}
        {!!row.role?.roleId && rolesQuery.isFetched && !known && (
          <Chip selected pressed title='the role is archived: it can be taken off, but not put on again'>
            {row.role?.roleName || `#${row.role?.roleId}`}
          </Chip>
        )}
      </ChipRow>
      {/* У ПРОЕКТА МОЖЕТ НЕ БЫТЬ НИ ОДНОГО СВОЕГО СЛОВА — и это состояние, а не сбой пикера. */}
      {rolesQuery.isFetched && roles.length === 0 && !row.role?.roleId && (
        <Text size='micro' variant='label' component='span'>
          no roles in this project yet
        </Text>
      )}
    </div>
  );
}

/**
 * СТРОКА-СВОД: ярлык, значение и тело под ними.
 *
 * Карточка держала восемь вещей развёрнутыми сразу, и «что это за файл» приходилось искать
 * прокруткой между лентой обсуждения и списком людей. Четыре нижних блока — владельцы, доступ,
 * задачи, обсуждение — свёрнуты в строки: ЗНАЧЕНИЕ каждой видно и свёрнутой («nobody»,
 * «the whole team», «#141», число реплик), поэтому разворачивают их ради правки, а не ради
 * ответа на вопрос.
 *
 * Тела строк — те же самые секции, что стояли здесь раньше, целиком и без переделки: у каждой
 * своя мутация и свой заголовок с действием, и переписывать их ради складывания было бы
 * заменой работающего на новое в самом чувствительном месте.
 *
 * Значок ▸/▾ — `aria-hidden`: доступное имя кнопки обязано остаться словом («kept by»), иначе
 * скринридер читает название юникодного треугольника. Состояние сказано `aria-expanded`.
 */
function CardLine({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className='border-b border-hairline'>
      <div className='flex min-w-0 items-center gap-1.5 py-1'>
        <Button
          size='xs'
          variant='secondary'
          aria-expanded={open}
          onClick={onToggle}
          className='min-w-[92px] max-w-full text-left'
        >
          <span aria-hidden>{open ? '▾ ' : '▸ '}</span>
          {label}
        </Button>
        <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 truncate'>
          {value}
        </Text>
      </div>
      {open && <div className='pb-2 pl-3'>{children}</div>}
    </div>
  );
}

/**
 * Карточка файла — МОДАЛКА ПОВЕРХ СЕТКИ, а не отдельная страница.
 *
 * Каркас строится здесь один раз: шапка с именем и подвал с действиями закреплены, тело
 * скроллит. Секции следующих фаз (ответственность, задачи, обсуждение, доступ) дописываются
 * в это тело — своей модалки никто из них не заводит, иначе «сохранить» в одном месте начнёт
 * отличаться от «сохранить» в другом.
 *
 * Адрес /files/:id остаётся: ссылку на файл кидают в чат вместо самого файла, и на неё же
 * ссылаются очередь загрузки («показать тот файл») и заметки.
 */
export function FileCardModal({
  id,
  topics,
  projects,
  writable,
  onClose,
}: {
  id: number;
  /** Только обычные темы: проекты приезжают отдельно и рисуются своей группой. */
  topics: FileTopic[];
  projects: FileTopic[];
  /** Уже с учётом и права files:write, и тумблера режима: карточка не решает это сама. */
  writable: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useLibraryFile(id);
  const { updateFile, deleteFile, setRoles } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const { canRead } = usePermissions();

  /**
   * ЗАДАЧИ СПРАШИВАЕТ И ПОДВАЛ — тот же ключ, что у секции ниже, поэтому запрос один на двоих.
   *
   * Нужно это ради одной кнопки: сервер откажется удалять файл, который держит хотя бы одна
   * задача, и сказать это ДО нажатия честнее, чем показать отказ после. Гейт `tasks:read`
   * повторён здесь буква в букву — иначе секция гасила бы запрос, а подвал его включал, и на
   * аккаунте без права он всё равно уходил бы за заведомым отказом.
   */
  const {
    data: fileTasks,
    isLoading: tasksLoading,
    isError: tasksFailed,
  } = useFileTasks(id, canRead(SECTION.tasks));
  const heldByTasks = (fileTasks?.tasks ?? []).length;

  const file = data?.file;
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Отказ хранится ОШИБКОЙ, а не строкой: разбор (`rpc-error`) один на раздел и живёт на
  // отрисовке, а запасная фраза у сохранения и у удаления разная — поэтому она едет рядом.
  const [failure, setFailure] = useState<{ e: unknown; fallback: string } | undefined>(undefined);
  const [reading, setReading] = useState(false);
  /**
   * СВЁРНУТО ПО УМОЛЧАНИЮ — И ЭТО НЕ ТОЛЬКО ПРО МЕСТО НА ЭКРАНЕ. Доступ и обсуждение спрашивают
   * сервер каждый своим запросом на монтировании; свёрнутая строка их не монтирует, и открытие
   * карточки перестало стоить три запроса там, где смотрели имя файла.
   */
  const [lines, setLines] = useState<Record<CardLineKey, boolean>>({
    own: false,
    acc: false,
    task: false,
    talk: false,
  });
  const toggleLine = (k: CardLineKey) => setLines((p) => ({ ...p, [k]: !p[k] }));
  // Куда вести после вопроса «закрыть без сохранения». Вопрос один на оба выхода, потому что
  // цена у них одна: набранное имя пропадает и там и там. Хранить намерение строкой, а не
  // функцией: setState с функцией React принимает за обновляющую и зовёт её вместо записи.
  const [closeIntent, setCloseIntent] = useState<'close' | 'note'>('close');
  const readable = isReadablePdf(file?.fileName ?? '', file?.contentType ?? undefined);
  const note = isMarkdownNote(file?.fileName ?? '', file?.contentType ?? undefined);

  // ЧТО РИСОВАТЬ ЧИПАМИ — СЛОВАРЬ ПЛЮС ТО, ЧТО ФАЙЛ УЖЕ НЕСЁТ.
  //
  // Холст просит словарь БЕЗ архива, и заархивированная тема на файле осталась бы невидимой:
  // чипа нет, а id сидит в `selected` и уезжает обратно при каждом сохранении. Снять её было
  // бы нечем — членство есть, а органа нет. Поэтому набор чипов — объединение: словарь и то,
  // что на файле уже стоит.
  const carried = useMemo(() => (file?.topics ?? []) as FileTopic[], [file]);
  const merge = (dict: FileTopic[], want: (t: FileTopic) => boolean) => {
    const out = dict.slice();
    for (const t of carried) {
      if (out.some((x) => Number(x.id) === Number(t.id))) continue;
      if (want(t)) out.push(t);
    }
    return out;
  };
  // Что проект, знает СЛОВАРЬ: `LibraryFile.topics` поле `kind` может и не нести, а вот
  // `LibraryFile.roles` называет id проектов прямо — из двух источников и собирается признак.
  const projectIds = useMemo(() => {
    const set = new Set<number>(projects.map((p) => Number(p.id)));
    for (const r of file?.roles ?? []) set.add(Number(r.projectTopicId));
    for (const t of carried) if (isProjectTopic(t)) set.add(Number(t.id));
    return set;
  }, [projects, carried, file]);
  const projectChips = merge(projects, (t) => projectIds.has(Number(t.id)));
  const topicChips = merge(topics, (t) => !projectIds.has(Number(t.id)));

  /**
   * РОЛЬ ПРАВИТСЯ СВОИМ ВЫЗОВОМ, а не общей кнопкой «сохранить», — тот же довод, что у блока
   * владельцев: у неё свой RPC и замещающая семантика, и складывать её в «грязную» форму
   * значило бы обещать откат правки, которого у замены нет.
   *
   * ИСТОЧНИК СПИСКА — СЕРВЕР, А НЕ ФОРМА. Проект, только что отмеченный чипом и ещё не
   * сохранённый, строки связи не имеет — ставить на неё роль некуда, и предложить это значило
   * бы предложить жест, который отвечает отказом.
   */
  const inProjects = useMemo(() => {
    const roleOf = new Map<number, { roleId: number; roleName: string }>();
    for (const r of file?.roles ?? []) {
      roleOf.set(Number(r.projectTopicId), {
        roleId: Number(r.roleId ?? 0),
        roleName: r.roleName ?? '',
      });
    }
    return carried
      .filter((t) => projectIds.has(Number(t.id)))
      .map((t) => ({
        id: Number(t.id),
        name: t.name ?? '',
        role: roleOf.get(Number(t.id)),
      }));
  }, [carried, projectIds, file]);

  const applyRole = async (projectTopicId: number, roleId: number) => {
    setFailure(undefined);
    try {
      await setRoles.mutateAsync({ fileIds: [id], projectTopicId, roleId });
      await refetch();
    } catch (e) {
      setFailure({ e, fallback: "couldn't change the role" });
    }
  };

  // НАБРАННОЕ, НО НЕ ЗАЭНТЕРЕННОЕ ИМЯ ТЕМЫ — ТОЖЕ ПРАВКА. Поле с текстом и мёртвая кнопка
  // рядом — тупик: человек видит заполненное поле и не понимает, чего от него ещё хотят.
  const pendingTopics = useMemo(() => {
    const typed = newTopic.trim();
    if (!typed || newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) return newTopics;
    return [...newTopics, typed];
  }, [newTopic, newTopics]);

  // Зависимость — id файла, а НЕ объект `file`. По объекту форма пересобиралась на каждый ответ
  // сервера, а ответ приходит не только при открытии: «обновить» в читалке (просроченная ссылка)
  // бьёт в тот же ключ запроса. Переименовал файл, ушёл читать, вернулся — правка стёрта молча.
  useEffect(() => {
    if (!file) return;
    setName(file.fileName ?? '');
    setSelected((file.topics ?? []).map((t) => Number(t.id)));
    setNewTopics([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  const dirty = useMemo(() => {
    if (!file) return false;
    const was = new Set((file.topics ?? []).map((t) => Number(t.id)));
    const now = new Set(selected);
    const sameTopics = was.size === now.size && [...was].every((x) => now.has(x));
    return name !== (file.fileName ?? '') || !sameTopics || pendingTopics.length > 0;
  }, [file, name, selected, pendingTopics]);

  // Уход на экран заметки — это уход СО СТРАНИЦЫ, а не модалка поверх: карточка размонтируется
  // вместе с несохранённым именем. Поэтому тот же вопрос, что и на закрытии.
  const openNote = () => {
    if (dirty) {
      setCloseIntent('note');
      setConfirmClose(true);
      return;
    }
    navigate(notePath(id));
  };

  const save = async () => {
    setFailure(undefined);
    try {
      await updateFile.mutateAsync({
        id,
        fileName: name.trim(),
        topicIds: selected,
        newTopics: pendingTopics,
      });
      // ПЕРЕСИНХРОН РОВНО ЗДЕСЬ, а не в эффекте по объекту файла. Названные на лету темы
      // существуют только после сохранения, и их id знает лишь сервер: без явного
      // перечитывания чип остался бы «новым» навсегда, а форма — вечно грязной, и второе
      // «сохранить» СНЯЛО бы только что созданную тему (её id не попал в `selected`).
      const fresh = await refetch();
      const f = fresh.data?.file;
      if (f) {
        setName(f.fileName ?? '');
        setSelected((f.topics ?? []).map((t) => Number(t.id)));
        setNewTopics([]);
        setNewTopic('');
        showMessage('saved', 'success');
      } else {
        // Сохранить вышло, перечитать — нет. Гасить чипы новых тем в этом месте нельзя: они
        // исчезли бы с экрана, хотя на сервере уже стоят, и файл выглядел бы непроставленным.
        showMessage("saved, but the topic list didn't re-read — refresh the page", 'success');
      }
    } catch (e) {
      setFailure({ e, fallback: "couldn't save" });
    }
  };

  const remove = async () => {
    setFailure(undefined);
    try {
      await deleteFile.mutateAsync(id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      // Отказ ОСТАЁТСЯ НА ЭКРАНЕ: сервер называет задачи, которые держат файл, и это
      // единственный способ узнать, почему удаление не прошло. Тост уносит эти имена через
      // шесть секунд вместе с ответом на вопрос.
      setFailure({ e, fallback: "couldn't delete" });
      setConfirmDelete(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (o) return;
        // ПРОМАХ МИМО ПАНЕЛИ НЕ СТИРАЕТ ПРАВКУ. Карточка теперь форма: имя и набор тем.
        // Клик вне модалки и Escape у Radix закрывают по умолчанию, и переименование
        // исчезало бы без единого слова — поэтому здесь стоит вопрос, а не выход.
        if (dirty) {
          setCloseIntent('close');
          setConfirmClose(true);
          return;
        }
        onClose();
      }}
      onConfirm={onClose}
      title={file?.fileName || 'file'}
      width='lg'
      hideActions
    >
      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : !file ? (
        /* УПАВШИЙ ЗАПРОС — НЕ ЗАГРУЗКА. У react-query у ошибки `isLoading` уже false, и без
           этой ветки карточка файла, удалённого после того, как ссылку кинули в чат, вечно
           показывала бы «loading…». Сюда же приходит /files/abc, где id вовсе не число. */
        <div className='flex flex-col items-start gap-2'>
          <Text className='uppercase'>the file didn't open</Text>
          <Text size='micro' variant='label'>
            {Number.isFinite(id) && id > 0 ? (
              <FailureText
                e={error}
                fallback="the server didn't answer about this file. it may have been deleted."
              />
            ) : (
              'the address holds no file number — the link is broken.'
            )}
          </Text>
          <div className='flex items-center gap-1.5'>
            <Button size='sm' variant='secondary' onClick={() => refetch()}>
              retry
            </Button>
            <Button size='sm' variant='secondary' onClick={onClose}>
              to the list
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex flex-col gap-2.5'>
          <div className='flex flex-wrap gap-2.5'>
            <div className='flex size-40 flex-none items-center justify-center border border-borderColor bg-bgSecondary'>
              {file.previewUrl ? (
                <img src={file.previewUrl} alt='' className='size-full object-contain' />
              ) : (
                <div className='flex flex-col items-center gap-0.5'>
                  {/* 12px, а не `size='stat'`: stat — это КЕГЛЬ СТАТ-ЯЧЕЙКИ (16px), и за
                      пределами stat-ячейки он пробивает потолок в 12px, объявленный
                      DESIGN.md. Вес держит жирность, а не размер. */}
                  <Text component='span' className='font-bold uppercase'>
                    {extensionOf(file.fileName ?? '')}
                  </Text>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    {kindWord(file.contentType ?? undefined, file.fileName ?? '')}
                  </Text>
                </div>
              )}
            </div>

            <div className='flex min-w-[260px] flex-1 flex-col gap-2.5'>
              <div className='flex flex-col gap-1'>
                <GroupLabel flush>name</GroupLabel>
                <Input
                  name='fileName'
                  value={name}
                  disabled={!writable}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                />
                <Text size='micro' variant='label'>
                  search goes by name — a clear name here is exactly what the file is found by later
                </Text>
              </div>

              <div>
                <GroupLabel>what this is</GroupLabel>
                <Text size='micro' variant='label'>
                  {formatBytes(Number(file.sizeBytes ?? 0))} ·{' '}
                  {kindWord(file.contentType ?? undefined, file.fileName ?? '')} ·{' '}
                  {file.contentType || 'type unknown'}
                </Text>
                {/* Кто загрузил и когда — в блоке «responsibility» ниже: там же живут
                    владельцы, и печатать загрузившего дважды значит показать одну роль как
                    две. */}
              </div>
            </div>
          </div>

          {/* ПРОЕКТЫ — ОТДЕЛЬНАЯ ГРУППА, И ЭТО НЕ КОСМЕТИКА. Чип проекта и чип темы выглядят
              одинаково, а значат разное: тема — ярлык, проект — контейнер, у которого внутри
              ещё и роль. Пока они лежали в одном ряду, снятие «съёмки» читалось как снятие
              ярлыка, а стоило роли. */}
          <div className='flex flex-col gap-1'>
            <GroupLabel>projects</GroupLabel>
            <ChipRow>
              {projectChips.map((t) => {
                const pid = Number(t.id);
                const on = selected.includes(pid);
                const d = projectHint(t);
                return (
                  <Chip
                    key={pid}
                    selected={on}
                    pressed={on}
                    disabled={!writable}
                    title={
                      writable
                        ? d || undefined
                        : "read-only — the projects can't be moved around"
                    }
                    onClick={() =>
                      setSelected((p) => (p.includes(pid) ? p.filter((x) => x !== pid) : [...p, pid]))
                    }
                  >
                    {t.name}
                    <ProjectArchiveMark project={t} />
                  </Chip>
                );
              })}
              {!projectChips.length && (
                <Text size='micro' variant='label' component='span'>
                  no projects yet
                </Text>
              )}
            </ChipRow>
            {/* ФРАЗА, КОТОРУЮ ИНАЧЕ УЗНАЮТ ОПЫТОМ. Снятие чипа проекта удаляет строку связи —
                вместе с ролью, которая на ней стоит. Это правильное поведение (роль без
                проекта не существует), но человек обязан узнать о нём отсюда, а не обнаружив
                пропажу. */}
            <Text size='micro' variant='label'>
              take the project chip off and the file's role in it goes too: the role sits on the
              link itself and is deleted along with it. it comes back by putting the project on
              again and picking a role below.
            </Text>
            {/* ПРЕДУПРЕЖДЕНИЕ ИМЕНЕМ, а не общей фразой: оно печатается ровно тогда, когда
                снятый проект действительно нёс роль, и называет, какую именно. */}
            {(() => {
              const losing = inProjects.filter(
                (p) => !selected.includes(p.id) && p.role && p.role.roleId > 0,
              );
              if (!losing.length) return null;
              return (
                <Text size='micro'>
                  not saved:{' '}
                  {losing.map((p) => `“${p.name}” — “${p.role?.roleName}”`).join(', ')} — this role
                  will go along with the link the moment you press “save”
                </Text>
              );
            })()}
          </div>

          {/* РОЛЬ ФАЙЛА В ПРОЕКТЕ — тем же жестом, что и всё остальное в карточке, но своим
              вызовом: она применяется сразу, кнопки «сохранить» не ждёт. */}
          {inProjects.length > 0 && (
            <div className='flex flex-col gap-1'>
              <GroupLabel>role in the project</GroupLabel>
              {inProjects.map((p) => (
                <ProjectRoleRow
                  key={p.id}
                  row={p}
                  writable={writable}
                  saving={setRoles.isPending}
                  onPick={applyRole}
                />
              ))}
              <Text size='micro' variant='label'>
                the role applies at once, it does not wait for “save”. a project just ticked shows
                up here only after saving: before that there is no link for the role to live on.
                the words on each line are that project's own — the shoot next door keeps its own
                set, and neither list is offered to the other.
              </Text>
            </div>
          )}

          <div className='flex flex-col gap-1'>
            <GroupLabel>topics</GroupLabel>
            <ChipRow>
              {topicChips.map((t) => (
                // В ЧТЕНИИ ЧИП ВЫКЛЮЧЕН, А НЕ ПРОСТО МЁРТВ. Раньше он оставался кликабельным
                // на вид (та же рамка, тот же курсор) и молчал на нажатие — а молчащий на
                // нажатие элемент читается как поломка, а не как запрет.
                <Chip
                  key={t.id}
                  selected={selected.includes(Number(t.id))}
                  pressed={selected.includes(Number(t.id))}
                  disabled={!writable}
                  title={writable ? undefined : "read-only — the topics can't be moved"}
                  onClick={() =>
                    setSelected((p) =>
                      p.includes(Number(t.id))
                        ? p.filter((x) => x !== Number(t.id))
                        : [...p, Number(t.id)],
                    )
                  }
                >
                  {t.name}
                </Chip>
              ))}
              {newTopics.map((n) => (
                <Chip
                  key={n}
                  selected
                  onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}
                >
                  {n}
                </Chip>
              ))}
              {!topicChips.length && !newTopics.length && (
                <Text size='micro' variant='label' component='span'>
                  no topics yet
                </Text>
              )}
            </ChipRow>
            {/* ВЫКЛЮЧЕНО, А НЕ СПРЯТАНО — то же правило, что объявлено на холсте: спрятанного
                не попросишь, а выключенное поле рядом с чипами показывает, что тему тут
                вообще заводят, и объясняет, почему сейчас нельзя. */}
            <Input
              name='newTopic'
              value={newTopic}
              disabled={!writable}
              placeholder={writable ? 'new topic' : 'read-only'}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const v = newTopic.trim();
                if (v && !newTopics.some((x) => x.toLowerCase() === v.toLowerCase())) {
                  setNewTopics((p) => [...p, v]);
                }
                setNewTopic('');
              }}
              className='max-w-[220px]'
            />
            <Text size='micro' variant='label'>
              a topic is a label, not a folder: a file carries several at once or none at all
            </Text>
          </div>

          {/* ЧЕТЫРЕ СТРОКИ ВМЕСТО ЧЕТЫРЁХ РАЗВЁРНУТЫХ БЛОКОВ.
              Порядок держится на том же доводе, что и раньше: лента обсуждения идёт последней —
              она единственная растёт без предела. Задачи стоят выше подвала, потому что
              объясняют выключенное «удалить», а объяснение обязано быть выше того, что
              объясняет.

              ЗНАЧЕНИЯ — ИЗ ТОГО ЖЕ ОТВЕТА, КОТОРЫМ НАРИСОВАНА КАРТОЧКА (`GetLibraryFile`) и из
              уже спрошенного подвалом списка задач. Второго счёта тем же вопросом здесь не
              заводится: строка «discussion · 3» ради выдержки последней реплики стоила бы
              запроса ленты на каждое открытие карточки — ровно того, от чего сворачивание и
              избавляет. */}
          <div className='mt-0.5 flex flex-col border-t border-borderColor'>
            <CardLine
              label='kept by'
              value={
                (file.owners ?? []).length
                  ? (file.owners ?? []).map((o) => o.username || `#${o.id}`).join(', ')
                  : 'nobody'
              }
              open={lines.own}
              onToggle={() => toggleLine('own')}
            >
              {/* Ответственность (Ф3) живёт СВОИМИ мутациями, а не общей кнопкой «save»:
                  владельцы меняются отдельным RPC, и складывать их в ту же «грязную» форму
                  значило бы обещать откат правки, которого у replace-набора нет. */}
              <FileOwnersSection file={file} writable={writable} />
            </CardLine>

            <CardLine
              label='access'
              value={(() => {
                const lvl = asAccessLevel(file.accessLevel ?? undefined);
                // Пустой уровень не заменяется на «team»: угадать здесь значило бы напечатать
                // «видит вся команда» про файл, о котором сервер ничего не сказал.
                return lvl ? ACCESS_LEVEL_TITLE[lvl] : 'not said';
              })()}
              open={lines.acc}
              onToggle={() => toggleLine('acc')}
            >
              <FileAccessSection file={file} writable={writable} />
            </CardLine>

            <CardLine
              label='tasks'
              value={
                /**
                 * «NONE» — ЭТО УТВЕРЖДЕНИЕ, А НЕ ЗАГЛУШКА, и говорить его можно ТОЛЬКО когда
                 * сервер ответил пустым списком.
                 *
                 * Три состояния до ответа различаются, потому что их различает и тело строки:
                 * оно говорит «loading…» и «сервер ещё не отдаёт задачи файла». Свёрнутая
                 * строка, утверждающая обратное, врёт молча — а свёрнута она по умолчанию, и
                 * тела человек не увидит. Отказ здесь навсегда: у `useFileTasks` стоит
                 * `retry: false`, то есть 404 невыкаченного роута приходит один раз и живёт до
                 * перезагрузки.
                 */
                !canRead(SECTION.tasks)
                  ? 'no access to tasks'
                  : tasksLoading
                    ? '…'
                    : tasksFailed
                      ? 'unknown'
                      : heldByTasks
                        ? (fileTasks?.tasks ?? []).map((t) => `#${t.taskId}`).join(', ')
                        : 'none'
              }
              open={lines.task}
              onToggle={() => toggleLine('task')}
            >
              <FileTasksSection file={file} writable={writable} />
            </CardLine>

            <CardLine
              label='discussion'
              value={
                Number(file.commentsCount ?? 0) > 0
                  ? `${Number(file.commentsCount ?? 0)}`
                  : 'nothing yet'
              }
              open={lines.talk}
              onToggle={() => toggleLine('talk')}
            >
              <FileComments file={file} writable={writable} />
            </CardLine>
          </div>

          {failure && (
            <div className='border border-error px-2.5 py-2'>
              <Text size='micro'>
                <FailureText e={failure.e} fallback={failure.fallback} />
              </Text>
            </div>
          )}

          {/* ПОДВАЛ ЗАКРЕПЛЁН. Тело карточки к Ф7 упрётся в 90vh, и действия, уехавшие вниз
              вместе с лентой обсуждения, пришлось бы искать прокруткой. Отрицательные поля —
              чтобы полоса шла от края до края тела, у которого свой p-2.5. */}
          <div className='sticky bottom-0 -mx-2.5 -mb-2.5 flex flex-wrap items-center gap-1.5 border-t border-borderColor bg-bgColor px-2.5 py-1.5'>
            {writable && (
              <Button size='sm' onClick={save} disabled={!dirty || updateFile.isPending}>
                {updateFile.isPending ? 'saving…' : 'save'}
              </Button>
            )}
            {/* «read» — только у pdf. Остальным читалка отвечает «this file is not readable in
                a browser», и
                приводить туда из карточки нечестно: кнопка обещала бы чтение. */}
            {readable && (
              <Button size='sm' variant='secondary' onClick={() => setReading(true)}>
                read
              </Button>
            )}
            {/* У ЗАМЕТКИ ЭТО ЕДИНСТВЕННАЯ КНОПКА ОТКРЫТИЯ. `text/markdown` в inline-аллоулист
                сервер сознательно не берёт, поэтому `file.url` у неё пуст и кнопка «open»
                ниже не рисуется вовсе; «download» отдаёт .md файлом, а не показывает текст. */}
            {note && (
              <Button size='sm' onClick={openNote}>
                open the note
              </Button>
            )}
            {/* url пуст у типов, которым inline запрещён (svg, html): сервер его не выдаёт —
                клиент не прячет кнопку, кнопки просто нет. */}
            {file.url && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.url} target='_blank' rel='noopener noreferrer'>
                  open
                </a>
              </Button>
            )}
            {file.downloadUrl && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.downloadUrl}>download</a>
              </Button>
            )}
            <div className='ml-auto flex items-center gap-1.5'>
              {!writable && (
                <Text size='micro' variant='label' component='span'>
                  read-only
                </Text>
              )}
              {/* ПРИЧИНА СТОИТ РЯДОМ С ВЫКЛЮЧЕННОЙ КНОПКОЙ, а не только в подсказке при
                  наведении: подсказку не увидит тот, кто вообще не понял, почему кнопка серая. */}
              {writable && heldByTasks > 0 && (
                <Text size='micro' variant='label' component='span'>
                  open the “tasks” row above and detach it there
                </Text>
              )}
              <Button
                size='sm'
                variant='secondary'
                disabled={!writable || deleteFile.isPending || heldByTasks > 0}
                title={
                  heldByTasks > 0
                    ? 'tasks hold the file — the server will refuse the deletion while it is listed in them'
                    : undefined
                }
                onClick={() => setConfirmDelete(true)}
              >
                delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {reading && <FileReaderModal id={id} onClose={() => setReading(false)} />}

      <ConfirmationModal
        open={confirmClose}
        onOpenChange={setConfirmClose}
        onConfirm={() => (closeIntent === 'note' ? navigate(notePath(id)) : onClose())}
        title='close without saving'
        confirmLabel={closeIntent === 'note' ? 'open the note' : 'close'}
        cancelLabel='stay'
        width='sm'
      >
        <Text>
          the name or the set of topics is changed and not saved. close it and the edit is gone,
          with nowhere to bring it back from.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title='delete the file'
        confirmLabel={deleteFile.isPending ? 'deleting…' : 'delete'}
        confirmDisabled={deleteFile.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          the file and its bytes are deleted irreversibly — there will be nowhere to bring them back
          from. if the file is attached to tasks, the deletion won't go through and the message will
          name the cards.
        </Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
