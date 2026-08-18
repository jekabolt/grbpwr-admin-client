import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { FileRole, LibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { notePath, ROUTES, SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { FilesDropOverlay } from './components/drop-overlay';
import { FileCardModal } from './components/file-card-modal';
import { FilesToolbar } from './components/files-toolbar';
import { FileTile } from './components/file-tile';
import { NewNoteModal } from './components/new-note-modal';
import { PasteIntakeModal } from './components/paste-intake-modal';
import {
  NARROWED_HEAD_ID,
  NarrowedSectionHeader,
  ProjectHeader,
  ProjectSections,
  type ProjectSectionView,
} from './components/project-sections';
import { ProjectDescription } from './components/project-description';
import { ProjectEditModal } from './components/project-edit-modal';
import { ProjectRolesModal } from './components/project-roles-modal';
import { ProjectTasks } from './components/project-tasks';
import {
  EmptyGroupingState,
  EmptyLibraryState,
  EmptyPersonState,
  EmptySearchState,
  EmptyTopicState,
  EmptyUntopicedState,
  GallerySkeleton,
  ListFailedState,
  NextPageFailure,
  NoAccessState,
  RebuildPreview,
} from './components/gallery-states';
import { FilesSelectionBar } from './components/selection-bar';
import {
  MAX_TOPIC_FILTERS,
  ProjectChips,
  TopicChips,
  type TopicSelection,
} from './components/topic-chips';
import { FilesUploadBar } from './components/upload-bar';
import { useFileSelection } from './hooks/useFileSelection';
import {
  fileRoleFromUrl,
  fileRoleToUrl,
  filesKeys,
  NO_ROLE_URL,
  idFromUrl,
  isProjectTopic,
  personIdFromUrl,
  personRoleFromUrl,
  personRoleToUrl,
  useFileRoles,
  useFilesTotal,
  useFileTopics,
  useFileTopicStyles,
  useLibraryFiles,
  useProjectSections,
  useRoleIndex,
  type FileRoleFilter,
  type FilesFilter,
  type FilesSort,
  type PersonRoleFilter,
  type ProjectSectionSpec,
} from './hooks/useFiles';
import { previewExpected } from './utils/format';
import { isMarkdownNote } from './utils/reader-find';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Библиотека файлов — холст.
 *
 * Макет узнают ГЛАЗАМИ, а не по имени: в жизни оно выглядит как «grbpwr_graphic (1).pdf».
 * Поэтому экран несут крупные превью, а поиск — запасной путь, что противоположно тому, как
 * обычно строят список документов. Рейла тем нет намеренно: одна тема за раз не выражает
 * «packaging и atelier сразу», а именно этим вопросом сотни файлов и сужают до десятка.
 */
/** Мишень ссылки-пропуска: узел сразу за сеткой. Имя одно на обе стороны жеста. */
const AFTER_GRID_ID = 'files-after-grid';

export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { canRead, canWrite, resolved } = usePermissions();
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  // Тумблер добровольный, право — нет. Без files:write режим всегда «чтение», и оба положения
  // глушат ОДИН И ТОТ ЖЕ набор контролов: иначе «только чтение» означало бы разное в двух местах.
  //
  // ТУМБЛЕР ЖИВЁТ В СТОРЕ, А НЕ ЗДЕСЬ. Писатели раздела шире холста: полоса загрузки стоит и на
  // экране тем, темы правятся там же. Пока положение было состоянием этого компонента, уход на
  // соседний экран молча возвращал человека в запись — тумблер переставал действовать ровно
  // тогда, когда он единственный и защищал.
  const mode = useFilesModeStore((s) => s.mode);
  const setMode = useFilesModeStore((s) => s.setMode);
  const writable = useFilesWritable(mayWrite);

  // ФИЛЬТР ЖИВЁТ В URL. Ссылку на пересечение кидают в чат («вот всё, что и packaging, и
  // atelier»), и состояние, которого нет в адресе, такой ссылкой не передашь.
  const untopiced = params.get('untopiced') === '1';
  const topicIds = useMemo(
    () =>
      // При `untopiced` темы игнорируются — так же, как их игнорирует сервер (приоритет
      // untopiced > topic_ids). Иначе рукописный адрес рисовал бы горящие чипы, которых в
      // выдаче нет, и экран спорил бы сам с собой.
      untopiced
        ? []
        : params
            .getAll('topic')
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .slice(0, MAX_TOPIC_FILTERS),
    [params, untopiced],
  );
  const urlSearch = params.get('q') ?? '';
  const sort = ((): FilesSort => {
    const v = params.get('sort');
    return v === 'name' || v === 'size' ? v : 'new';
  })();

  // ЧЕЛОВЕК — ТОЖЕ АДРЕС. «Вот всё, что ведёт паша» кидают в чат ровно так же, как ссылку на
  // пересечение тем, и фильтр, живущий в состоянии компонента, такой ссылкой не передашь.
  //
  // Разбор ГЛУХ К МУСОРУ (`personIdFromUrl` / `personRoleFromUrl`): нечисловой id, отрицательный
  // id, неизвестное слово роли — всё это не фильтрует и не роняет экран. Обрезанную ссылку
  // присылают чаще, чем правят адрес руками, и отказ вместо выдачи был бы худшим из ответов.
  //
  // Роль без человека здесь ЖЕ и обнуляется — тем же приёмом, что `untopiced` глушит темы двумя
  // десятками строк выше: сервер роль без `person_id` игнорирует, и рукописный `?role=own`
  // иначе рисовал бы нажатое положение переключателя, которого в выдаче нет.
  const personId = personIdFromUrl(params.get('person'));
  const personRole: PersonRoleFilter = personId
    ? personRoleFromUrl(params.get('role'))
    : 'any';

  // ГРУППИРОВКА — ТОЖЕ АДРЕС, и по той же причине: «вот вся съёмка» и «вот её исходники»
  // кидают в чат ссылкой.
  //
  // ПАРАМЕТР РОЛИ НАЗВАН `frole`, А НЕ `role`, И ЭТО НЕ КАПРИЗ. `role` на этом же экране уже
  // занят ролью ЧЕЛОВЕКА при файле (`up` / `own`), и одно имя на два разных фильтра стоило бы
  // ровно одного молчаливого дефекта: снятие человека вычищает `role` из адреса одной строкой
  // ниже — и унесло бы вместе с ним роль файла, которую никто не трогал.
  //
  // Разбор глух к мусору так же, как разбор человека: непонятое значение не фильтрует и не
  // роняет экран.
  //
  // «РАЗОБРАТЬ» ГАСИТ ГРУППИРОВКУ ТОЧНО ТАК ЖЕ, КАК ГАСИТ ТЕМЫ ДВАДЦАТЬЮ СТРОКАМИ ВЫШЕ, и по
  // более жёсткой причине: пару untopiced × проект/роль сервер не игнорирует, а ОТКАЗЫВАЕТ
  // (`untopiced cannot be combined with a project or a role`). Рукописный `?untopiced=1&project=2`
  // без этой строки клал бы всю сетку красной плашкой отказа. Побеждает «разобрать» — тем же
  // правилом старшинства, что уже действует для тем, чтобы у одного вопроса не оказалось двух
  // разных ответов в зависимости от того, какое плечо смотреть.
  const projectId = untopiced ? 0 : idFromUrl(params.get('project'));
  const fileRole: FileRoleFilter = untopiced
    ? { roleId: 0, withoutRole: false }
    : fileRoleFromUrl(params.get('frole'), projectId > 0);

  // Строка ввода отзывается сразу, а URL догоняет: писать в адрес на каждую букву значит
  // гонять запрос на каждую букву.
  const [searchInput, setSearchInput] = useState(urlSearch);
  // Что мы сами только что записали в адрес. Без этой отметки эффект синхронизации откатывал
  // бы поле к записанному значению, и символ, набранный между срабатыванием таймера и
  // коммитом навигации, пропадал бы.
  const pushedSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === pushedSearch.current) return;
    // Отметку двигаем ВМЕСТЕ с полем. Без этой строки «вперёд» в браузере ломался: назад
    // приводило адрес к пустому поиску, поле пустело, а отметка оставалась на старом слове —
    // и «вперёд», вернув слово в адрес, не возвращало его в поле. Дальше срабатывал таймер
    // и переписывал адрес обратно на пустой: кнопка «вперёд» переставала работать вовсе.
    pushedSearch.current = urlSearch;
    setSearchInput(urlSearch);
    // Синхронизация только при ВНЕШНЕЙ смене адреса (переход по ссылке, «очистить поиск»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const patch = useCallback(
    (
      next: Partial<{
        topicIds: number[];
        untopiced: boolean;
        q: string;
        sort: FilesSort;
        personId: number;
        personRole: PersonRoleFilter;
        projectId: number;
        fileRole: FileRoleFilter;
      }>,
    ) => {
      const p = new URLSearchParams(params);
      if (next.topicIds !== undefined) {
        p.delete('topic');
        next.topicIds.forEach((t) => p.append('topic', String(t)));
      }
      if (next.untopiced !== undefined) {
        if (next.untopiced) p.set('untopiced', '1');
        else p.delete('untopiced');
      }
      if (next.q !== undefined) {
        if (next.q) p.set('q', next.q);
        else p.delete('q');
      }
      if (next.sort !== undefined) {
        if (next.sort === 'new') p.delete('sort');
        else p.set('sort', next.sort);
      }
      if (next.personRole !== undefined) {
        const v = personRoleToUrl(next.personRole);
        if (v) p.set('role', v);
        else p.delete('role');
      }
      if (next.personId !== undefined) {
        if (next.personId > 0) p.set('person', String(next.personId));
        else p.delete('person');
      }
      // РОЛЬ БЕЗ ЧЕЛОВЕКА ИЗ АДРЕСА ВЫЧИЩАЕТСЯ ОДНОЙ СТРОКОЙ, а не в каждой ветке выше. Иначе
      // порядок веток становится значимым (снять человека и поставить роль одним вызовом — и
      // роль пережила бы человека), а в ссылке оставался бы фильтр, которого сервер не
      // применяет. Одно правило в одном месте вместо двух согласованных.
      if (personIdFromUrl(p.get('person')) <= 0) p.delete('role');
      if (next.projectId !== undefined) {
        if (next.projectId > 0) p.set('project', String(next.projectId));
        else p.delete('project');
      }
      if (next.fileRole !== undefined) {
        const v = fileRoleToUrl(next.fileRole);
        if (v) p.set('frole', v);
        else p.delete('frole');
      }
      // «БЕЗ РОЛИ» БЕЗ ПРОЕКТА ВЫЧИЩАЕТСЯ ОДНОЙ СТРОКОЙ — тем же приёмом, что роль человека
      // выше, и по более жёсткой причине: этот фильтр сервер не игнорирует, а ОТКАЗЫВАЕТ.
      // Разложи мы правило по веткам — «снять проект» и «поставить без роли» одним вызовом
      // оставили бы в адресе сочетание, на котором список отвечает ошибкой, а не выдачей.
      if (idFromUrl(p.get('project')) <= 0 && p.get('frole') === NO_ROLE_URL) p.delete('frole');
      // «РАЗОБРАТЬ» И ГРУППИРОВКА ВЗАИМНО СНИМАЮТ ДРУГ ДРУГА, и решает не старшинство, а то,
      // ЧТО ЧЕЛОВЕК ТОЛЬКО ЧТО НАЖАЛ. Сервер эту пару отвергает, значит один из двух чипов
      // обязан погаснуть — и гаснуть должен старый, иначе нажатие «разобрать» внутри съёмки не
      // делало бы ничего видимого, а нажатие проекта из «разобрать» — тем более. Правило стоит
      // здесь, а не в трёх обработчиках чипов, ровно потому, что обработчиков три.
      if (next.untopiced === true) {
        p.delete('project');
        p.delete('frole');
      } else if (
        (next.projectId !== undefined && next.projectId > 0) ||
        (next.fileRole !== undefined && (next.fileRole.roleId > 0 || next.fileRole.withoutRole))
      ) {
        p.delete('untopiced');
      }
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      pushedSearch.current = searchInput;
      patch({ q: searchInput });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, patch]);

  // ТРИ ВХОДА, ОДНО ПРАВИЛО ТЕМ. Кнопка «загрузить», бросок и ⌘V ставят в одну очередь и
  // наследуют ВСЕ выбранные чипы холста; при пустом выборе пачка уезжает в «разобрать».
  // Диалога загрузки больше нет: он держал очередь в своём состоянии и убивал отправку при
  // закрытии, а темы всё равно спрашивал ровно те, что уже выбраны на холсте.
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState<File[]>([]);
  const [newNote, setNewNote] = useState(false);
  // Две модалки СТРАНИЦЫ ПРОЕКТА: правка самого проекта и его словарь ролей. Живут здесь, а
  // не внутри шапки: шапка исчезает вместе с режимом проекта, а модалка, смонтированная в ней,
  // исчезла бы вместе с несохранённой правкой.
  const [editingProject, setEditingProject] = useState(false);
  const [rolesDialog, setRolesDialog] = useState(false);

  const topicsQuery = useFileTopics();
  // Тот же общий список людей, что читают пикер в полосе и оба блока карточки: один ключ, один
  // запрос на 5 минут. Здесь он нужен ровно на подпись выбранного человека в пустом экране.
  const { data: adminsData } = useAdmins();
  // ОДИН ОБЪЕКТ ФИЛЬТРА на страницу и на оба вторых счёта: ослабленные варианты собираются из
  // него же (`{...filter, topicIds: []}`), поэтому число в кнопке не может оказаться посчитанным
  // не тем условием, под которым его потом покажут.
  const filter: FilesFilter = {
    topicIds,
    untopiced,
    search: urlSearch,
    sort,
    personId,
    personRole,
    projectId,
    roleId: fileRole.roleId,
    withoutRole: fileRole.withoutRole,
  };

  // РЕЖИМ ПРОЕКТА — ЭТО ОДНА СТРОКА, А НЕ ВТОРОЙ ЭКРАН.
  //
  // Проект выбран, роль — нет: холст показывает проект целиком, разложенный по ролям. Выбрана
  // роль (любая, включая «без роли») — секции исчезают, и остаётся ровно та плоская сетка,
  // которая была до этой фазы. Режимы НЕ НАСЛАИВАЮТСЯ: сетка, разложенная по ролям, внутри
  // выбранной роли значила бы одну секцию и четыре пустых, то есть тот же экран с лишней
  // рамкой вокруг.
  const roleNarrowed = fileRole.roleId > 0 || fileRole.withoutRole;
  const sectionMode = projectId > 0 && !roleNarrowed;

  /**
   * СТАРАЯ ССЫЛКА `?frole=N` БЕЗ `project=` — РАЗРЕШАЕТСЯ, А НЕ ПОКАЗЫВАЕТСЯ ПУСТОЙ (0323).
   *
   * До появления владельца роль была общей на всю библиотеку, и адрес «все исходники по всем
   * съёмкам» уехал в чат без проекта. Теперь у роли ровно один проект, и такой адрес обязан
   * ДОПИСАТЬ его себе. А если роль в индексе не нашлась вовсе или нашлась с нулевым владельцем
   * (мёртвая строка переноса, в которую не смотрит ни одна связь) — `frole` СНИМАЕТСЯ. Это
   * единственный тихий жест окна несовместимости: фильтр по такому id отдаёт пустую выдачу
   * молча, и «в этой роли ничего нет» выглядит ровно как «этой роли больше нет».
   *
   * ВЫДАЧА ЖДЁТ РАЗРЕШЕНИЯ. Уйди список раньше — на полсекунды показалась бы пустая сетка,
   * посчитанная фильтром, который сейчас будет переписан, и человек прочёл бы её как ответ.
   */
  const needsRoleResolve = !untopiced && projectId === 0 && fileRole.roleId > 0;
  const roleIndexQuery = useRoleIndex(needsRoleResolve);
  const roleResolvePending = needsRoleResolve && !roleIndexQuery.isFetched;

  const filesQuery = useLibraryFiles(filter, !sectionMode && !roleResolvePending);
  /**
   * СЛОВАРЬ РОЛЕЙ СПРАШИВАЕТСЯ У ПРОЕКТА, А ВНЕ ПРОЕКТА НЕ СПРАШИВАЕТСЯ ВОВСЕ (0323).
   *
   * Роль принадлежит проекту: «исходники» съёмки и «исходники» лукбука — разные строки словаря.
   * Спросить «какие бывают роли» безотносительно проекта больше не у кого, и хук поэтому
   * ГЛУШИТСЯ, а не отвечает пустотой — пустой ответ рисовал бы «ролей нет» там, где вопроса не
   * задавали.
   *
   * ОДИН ЗАПРОС НА ОБА РЕЖИМА, И С АРХИВОМ. Секции ПОКАЗЫВАЮТ то, что в проекте уже лежит, а
   * роль, ушедшую в архив после того, как её проставили, никто с файлов не снимал: без архива
   * такой файл не попал бы ни в одну секцию и пропал бы с экрана целиком. Тем же ответом
   * называется роль в суженном заголовке — иначе на архивной роли он печатал бы «#9». Предлагать
   * из этого словаря нельзя (архивную роль сервер ставить не даёт), и на холсте больше некому:
   * ряда чипов ролей здесь нет.
   */
  const rolesQuery = useFileRoles(projectId, true, projectId > 0);
  const roles = rolesQuery.data?.roles ?? [];

  /**
   * РАЗРЕШЕНИЕ РОЛИ-СИРОТЫ — ОДИН ЭФФЕКТ, ДВА ИСХОДА, И ТРЕТЬЕГО НЕТ.
   *
   * Нашлась с проектом → проект дописывается в адрес, фильтр остаётся тем же самым. Не нашлась
   * или нашлась без владельца → фильтр СНИМАЕТСЯ. Оставить его значило бы показать пустую сетку
   * и промолчать о причине; выдумать проект — солгать про то, где файлы лежат.
   */
  const resolvedRole = needsRoleResolve
    ? (roleIndexQuery.data?.roles ?? []).find((r) => Number(r.id) === fileRole.roleId)
    : undefined;
  const resolvedRoleOwner = Number(resolvedRole?.projectTopicId ?? 0);
  useEffect(() => {
    if (!needsRoleResolve || !roleIndexQuery.isFetched) return;
    if (resolvedRoleOwner > 0) patch({ projectId: resolvedRoleOwner });
    else patch({ fileRole: { roleId: 0, withoutRole: false } });
  }, [needsRoleResolve, roleIndexQuery.isFetched, resolvedRoleOwner, patch]);

  const allTopics = topicsQuery.data?.topics ?? [];
  // ДВА РЯДА ИЗ ОДНОГО СЛОВАРЯ. Проект — это тема с типом, отдельного запроса у него нет; но
  // рисовать их вперемешку нельзя: у рядов разная семантика выбора (пересечение против одного)
  // и разное продолжение (у проекта — роль).
  const topics = useMemo(() => allTopics.filter((t) => !isProjectTopic(t)), [allTopics]);
  const projects = useMemo(() => allTopics.filter(isProjectTopic), [allTopics]);

  /**
   * ПРОЕКТ ИЗ АДРЕСА БЫВАЕТ АРХИВНЫМ, И ЭТО ПОДДЕРЖАННОЕ СОСТОЯНИЕ, А НЕ ПОЛОМКА.
   *
   * Холст просит словарь БЕЗ архива — там он предлагает, а предлагать архивное незачем. Но
   * ссылка на архивную съёмку живёт в чате и открывается: фильтр по ней работает, сетка
   * показывает файлы. Чипу этого хватало (он рисует сироту «#4» и объясняет её), а вот всем
   * ПИСАТЕЛЯМ — нет: они резолвили имя по тому же списку без архива, не находили и молчали.
   * Диалог роли преселектил проект, у которого не горит ни один чип, и печатал в тост
   * «в проекте «» роль …»; оверлей броска обещал «уйдут в разобрать», а пачка уезжала в
   * архивный проект; вставка и заметка уезжали туда же молча.
   *
   * ЧИНИТСЯ ОДНИМ МЕСТОМ: недостающий проект дорезолвивается из словаря С архивом и
   * дописывается в список, который получают писатели. Выбран этот способ, а не сирота «#id» у
   * каждого писателя: «#4» — честный ответ для ФИЛЬТРА (там номер и есть то, чем фильтруют), но
   * для писателя вопрос другой — «куда именно уедет пачка», и номер на него не отвечает вовсе.
   *
   * ПИСАТЬ В АРХИВНЫЙ ПРОЕКТ МОЖНО, и кнопки здесь никто не глушит. Роль — слово словаря, её
   * выводят из употребления и назначать заново нельзя; проект — коробка, её закрывают, и
   * положить в закрытую коробку ещё один файл остаётся связным действием. Обязанность клиента
   * не в отказе, а в том, чтобы НАЗВАТЬ проект и пометить его тем же словом «в архиве», которое
   * стоит на экране словаря.
   */
  const projectMissing = projectId > 0 && !projects.some((p) => Number(p.id) === projectId);
  const archivedTopicsQuery = useFileTopics(true, projectMissing);
  const archivedProject = projectMissing
    ? (archivedTopicsQuery.data?.topics ?? []).find(
        (t) => Number(t.id) === projectId && isProjectTopic(t),
      )
    : undefined;
  const activeProject = projects.find((p) => Number(p.id) === projectId) ?? archivedProject;
  /** Список для ПИСАТЕЛЕЙ: живые проекты плюс тот архивный, в котором человек сейчас стоит. */
  const writerProjects = archivedProject ? [...projects, archivedProject] : projects;

  /**
   * ПОРЯДОК СЕКЦИЙ: сначала приёмная куча, потом словарь, потом архивные хвосты.
   *
   * Куча стоит первой не из симметрии со словарём, а потому что она единственная называет
   * РАБОТУ, и потому что именно в неё попадает всё, что в проект бросают: загрузка роли не
   * ставит. Поставь её последней — свежий бросок оказался бы под четырьмя полными секциями
   * ровно в тот момент, когда человек его ищет. В разобранном проекте кучи нет вовсе, и экран
   * начинается со словаря, как и ожидается.
   *
   * АРХИВНАЯ РОЛЬ СПРАШИВАЕТСЯ, ТОЛЬКО ЕСЛИ ФАЙЛЫ С НЕЙ ЕСТЬ. `filesCount` теперь считает файлы
   * роли В ЕЁ ПРОЕКТЕ (0323), а не по всей библиотеке, — то есть это уже не верхняя оценка, а
   * ТОЧНОЕ число для этого самого проекта: ноль в нём означает, что архивной секции здесь быть
   * не может. Условие то же, что и было, а вот его сила выросла: раньше приём годился только
   * как отсечка «нигде нет», теперь он отвечает ровно на нужный вопрос.
   *
   * Для ЖИВЫХ ролей он всё равно не применяется: секция с нулём — это строка «в проекте пока
   * нет: планирование», и она обязана стоять на ответе СВОЕГО запроса, посчитанном под тем же
   * предикатом видимости, что и плитки. Число из словаря сюда не годится не потому, что оно
   * приблизительное, а потому, что оно из другого ответа.
   */
  const sectionSpecs = useMemo<ProjectSectionSpec[]>(() => {
    if (!sectionMode) return [];
    const dict = rolesQuery.data?.roles ?? [];
    const order = (a: FileRole, b: FileRole) =>
      Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
      (a.name ?? '').localeCompare(b.name ?? '');
    const spec = (r: FileRole): ProjectSectionSpec => ({
      key: `role-${r.id}`,
      title: r.name ?? `#${r.id}`,
      roleId: Number(r.id),
      withoutRole: false,
      archived: !!r.archived,
    });
    return [
      { key: 'pile', title: 'without a role', roleId: 0, withoutRole: true },
      ...dict.filter((r) => !r.archived).sort(order).map(spec),
      ...dict
        .filter((r) => r.archived && Number(r.filesCount ?? 0) > 0)
        .sort(order)
        .map(spec),
    ];
  }, [sectionMode, rolesQuery.data]);

  /**
   * ВЕЩИ, ЧЬИ КАРТОЧКИ ПОКАЗЫВАЮТ НА ЭТОТ ПРОЕКТ — ОДИН запрос на страницу.
   *
   * Ровно поэтому этого ряда нет в индексе проектов: там он стоил бы вызова на строку, то есть
   * тридцати вызовов на открытие экрана. В шапке ОДНОГО проекта это один вызов, и орган для
   * него уже существовал — им же диалоги экрана тем называют число до необратимого нажатия.
   */
  const projectStylesQuery = useFileTopicStyles(projectId, projectId > 0);

  const sectionQueries = useProjectSections(filter, sectionSpecs, sectionMode);
  const sectionsPending =
    sectionMode && (rolesQuery.isPending || sectionQueries.some((q) => q.isPending));
  const sectionsFailed = sectionQueries.filter((q) => q.isError).length;
  // Словарь не пришёл — секций не построить вовсе: спрашивать «сколько тут исходников», не
  // зная, что бывают исходники, нечем.
  const sectionsAllFailed =
    sectionMode &&
    (rolesQuery.isError ||
      (sectionSpecs.length > 0 && sectionsFailed === sectionSpecs.length));

  const flatFiles = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  // ВЫДЕЛЕНИЕ ЖИВЁТ ПОВЕРХ ВСЕГО ПРОЕКТА, а не внутри секции, и вот единственная строка, которой
  // это делается: набор свежих объектов собирается из ВСЕХ секций сразу. Полоса выделения
  // ставит роль в проекте — значит «взять шесть штук из кучи и одну лежащую не в той роли» и
  // есть тот жест, ради которого она нужна. Своего выделения у секции нет и не будет: два
  // набора на одном экране означали бы два разных ответа на вопрос «что сейчас выбрано».
  const sectionFiles = sectionMode ? sectionQueries.flatMap((q) => q.data?.files ?? []) : [];
  const files = sectionMode ? sectionFiles : flatFiles;
  const total = filesQuery.data?.pages?.[0]?.total;
  const sectionTotal = sectionQueries.reduce((n, q) => n + Number(q.data?.total ?? 0), 0);
  /**
   * Число под чипами. В плоской сетке это `total` её единственного запроса; в режиме проекта —
   * СУММА ответов, которыми нарисованы секции, и ничего другого: секции делят проект без
   * остатка (у файла ровно одна строка связи с проектом, значит ровно один раздел), а сорванный
   * или ещё не пришедший ответ обнуляет число целиком, а не занижает его молча.
   */
  const matched = sectionMode
    ? sectionsPending || sectionsFailed
      ? undefined
      : sectionTotal
    : total === undefined
      ? undefined
      : Number(total);
  const totalFiles = Number(topicsQuery.data?.totalFiles ?? 0);
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);

  // ПРОТУХШАЯ ССЫЛКА — НЕ ПОЛОМКА, а плата за приватный бакет: presigned живёт 6–12 часов, а
  // вкладку держат открытой дольше. Первый же сорвавшийся `<img>` перезапрашивает выдачу, и
  // элемент перерисовывается на месте.
  //
  // Задвижка — ПО САМОМУ АДРЕСУ, а не по времени. У по-настоящему битого объекта (а не
  // просроченной ссылки) onError возвращается и после перевыдачи, и таймер лишь замедлил бы
  // вечный цикл до раза в полминуты: каждая инвалидация перекачивает ВСЕ загруженные страницы
  // и меняет src у всех остальных плиток. Один адрес перепрашивается ровно один раз.
  const relinked = useRef<Set<string>>(new Set());
  const onPreviewError = useCallback(
    (url: string) => {
      if (!url || relinked.current.has(url)) return;
      relinked.current.add(url);
      qc.invalidateQueries({ queryKey: filesKeys.all });
    },
    [qc],
  );

  const onTopics = (next: TopicSelection) =>
    patch({ topicIds: next.topicIds, untopiced: next.untopiced });

  const selection = useFileSelection();
  /**
   * Смена фильтра снимает выбор — кроме ОДНОГО перехода, и вот чем он отличается.
   *
   * Общее правило (набранное в одном пересечении на экране следующего не видно целиком, а полоса
   * продолжала бы обещать действие над файлами, которых на экране нет) держится на том, что
   * следующая выдача — ДРУГАЯ. У «show all» она не другая, а УЖЕ: плоская сетка раздела это
   * подмножество того же проекта, и все двенадцать плиток, из которых человек выбирал, остаются
   * на экране. Сброс здесь стирал бы работу ровно в том жесте, который придуман, чтобы её
   * продолжить: «выбрал шесть из кучи, открыл кучу целиком, добираю остальные».
   *
   * Но и сохранять ВЕСЬ набор нельзя: выбранное в соседней секции в новую выдачу не попадёт, и
   * общее правило про «обещает невидимое» вернулось бы через другую дверь. Поэтому набор не
   * сбрасывается, а ПРОСЕИВАЕТСЯ по той же паре «проект × роль», которой сужается выдача, —
   * условие берётся из самих файлов (`roles` приезжает в каждом ответе), а не вторым запросом.
   *
   * Узость исключения существенна: тот же проект, и роль идёт из «не выбрана» в «выбрана», то
   * есть человек ЗАХОДИТ в раздел, а не перескакивает из раздела в раздел. Переход «роль A →
   * роль B» подмножеством не является и сбрасывает набор, как и раньше.
   */
  const viewKey = `${topicIds.join(',')}|${untopiced}|${urlSearch}|${personId}|${personRole}|${projectId}`;
  const roleKey = `${fileRole.roleId}|${fileRole.withoutRole}`;
  const NO_ROLE_KEY = '0|false';
  const seenFilter = useRef({ viewKey, roleKey });
  const clearSelection = selection.clear;
  const keepSelection = selection.keep;
  useEffect(() => {
    const was = seenFilter.current;
    if (was.viewKey === viewKey && was.roleKey === roleKey) return;
    const zoomIntoSection =
      projectId > 0 &&
      was.viewKey === viewKey &&
      was.roleKey === NO_ROLE_KEY &&
      roleKey !== NO_ROLE_KEY;
    seenFilter.current = { viewKey, roleKey };
    if (!zoomIntoSection) {
      clearSelection();
      return;
    }
    keepSelection((f) => {
      const here = (f.roles ?? []).find((r) => Number(r.projectTopicId) === projectId);
      // «Без роли» — это связь с проектом БЕЗ строки роли, а не отсутствие связи: файл, которого
      // в проекте нет вовсе, в приёмную кучу не попадает и из набора уходит.
      if (fileRole.withoutRole)
        return !here && (f.topics ?? []).some((t) => Number(t.id) === projectId);
      return !!here && Number(here.roleId) === fileRole.roleId;
    });
  }, [viewKey, roleKey, projectId, fileRole.roleId, fileRole.withoutRole, clearSelection, keepSelection]);

  const selectedFresh = useMemo(
    () => selection.selected.map((s) => files.find((f) => Number(f.id) === Number(s.id)) ?? s),
    [selection.selected, files],
  );

  // ОДИН ВХОД В ОЧЕРЕДЬ на все три жеста. Темы читаются в момент постановки: сузил фильтр
  // после броска — на уже стоящие в очереди строки это не влияет, у них свои темы.
  //
  // ЧЕЛОВЕК В НАСЛЕДОВАНИЕ НЕ ВХОДИТ, и это не упущение. Тема — свойство файла, её и вешают на
  // пачку. Выбранный человек — свойство ВЗГЛЯДА: он ничего не говорит о том, что кладут в
  // библиотеку. Загрузивший ставится сервером по сессии, а владельцем человек не становится от
  // того, что кто-то смотрел на его файлы, — назначают владельца в карточке, осознанно.
  //
  // ПРОЕКТ ВХОДИТ В НАСЛЕДОВАНИЕ, потому что это ТЕМА, а не взгляд. Пока он жил отдельным
  // параметром адреса, а очередь наследовала только чипы тем, бросок при активном проекте
  // уезжал в «разобрать»: человек стоит внутри съёмки, кладёт в неё файлы — и не находит их
  // там же. Роль при этом не ставится ни в одном из трёх входов, и это правильно: файл в
  // проекте без роли — законное состояние, та самая приёмная куча, которую разбирают потом
  // чипом «без роли» и кнопкой «проставить роль».
  const inheritedTopicIds = useMemo(
    () => (projectId > 0 ? [...topicIds, projectId] : topicIds),
    [topicIds, projectId],
  );
  const intake = useCallback(
    (list: File[]) => {
      if (!writable || !list.length) return;
      enqueue(list, { topicIds: inheritedTopicIds, newTopics: [] });
    },
    [writable, enqueue, inheritedTopicIds],
  );

  const openPicker = () => pickerRef.current?.click();

  // ⌘V ловится слушателем на document со стопкой приёмников (прецедент — медиа). Пока
  // приёмная модалка открыта, повторный ⌘V ДОПИСЫВАЕТ в неё строку: вторая модалка поверх
  // первой потеряла бы уже набранное имя.
  // `accept: 'any'` — это БИБЛИОТЕКА ФАЙЛОВ, а не медиа: по умолчанию хук берёт из буфера
  // только картинки, и ⌘V по скопированному pdf или zip молчал, ничем не объясняя молчание.
  usePasteFiles({ claims: writable, accept: 'any' }, (list) => setPasted((p) => [...p, ...list]));

  // Закрытие ЗАМЕЩАЕТ запись в истории. Иначе стек выглядит как [сетка, карточка, сетка], и
  // «назад» открывает ровно ту карточку, которую человек только что закрыл.
  const closeCard = () =>
    navigate({ pathname: ROUTES.files, search: params.toString() }, { replace: true });
  const openCard = (fileId: number) =>
    navigate({ pathname: `${ROUTES.files}/${fileId}`, search: params.toString() });
  // КНОПКА СНИМАЕТ РОВНО ТО, ЧТО НАЗЫВАЕТ, — и это одно правило на обе кнопки пустого экрана.
  //
  // «Показать все файлы» названо ВСЕМИ файлами, значит и снимает всё, чем выдача сужена:
  // темы, «разобрать» и человека. Оставь оно человека — кнопка на пустом экране, где пусто
  // именно из-за человека, не изменила бы ничего видимого, а это худший исход из возможных:
  // орган, который на глаз не работает.
  //
  // «Искать во всех темах (N)» названо ТЕМАМИ и снимает ровно темы — ВКЛЮЧАЯ ПРОЕКТ, потому
  // что проект и есть тема с типом: кнопка, оставившая его, показала бы после нажатия одну
  // съёмку, а обещала всю библиотеку. Роль при этом переживает нажатие — она не тема, и
  // «исходники во всех съёмках» остаётся осмысленным вопросом. Число рядом с кнопкой считается
  // ТЕМ ЖЕ условием (см. `everywhereQuery`): с живым человеком и с живой ролью, без тем и без
  // проекта.
  //
  // ПРОЕКТ И РОЛЬ СНИМАЮТСЯ ЗДЕСЬ ЖЕ. Проект — это тема, и кнопка, оставившая его стоять,
  // показала бы после нажатия не «все файлы», а одну съёмку; роль сузила бы их ещё раз.
  const showAll = () =>
    patch({
      topicIds: [],
      untopiced: false,
      personId: 0,
      projectId: 0,
      fileRole: { roleId: 0, withoutRole: false },
    });

  // Второй счёт спрашивается только тогда, когда в узком фильтре не нашлось ничего: это
  // и есть число в кнопке «искать во всех темах (N)». Спрашивать его заранее — лишний
  // запрос на каждую букву в поиске.
  const narrowed = topicIds.length > 0 || untopiced || projectId > 0;
  // «Ничего не нашлось» — это ОТВЕТ, а не отказ. Пока список не прочитался (`isError`), экран
  // показывает `ListFailedState`, и второй счёт под ним не будет ни показан, ни осмыслен: он
  // уйдёт в тот же не отвечающий сервер вторым запросом.
  //
  // В режиме проекта тот же вопрос задаётся секциям, а не плоской выдаче (её попросту нет), и
  // пустотой считается только СОШЕДШИЙСЯ ноль: ни одна секция не в пути и ни одна не сорвалась.
  // Иначе кнопка «искать во всех темах (N)» появлялась бы на полсекунды в каждом проекте.
  // Пока роль из старой ссылки не разрешилась, выдачи нет вовсе — и «ничего не нашлось» о ней
  // сказать нельзя: не искали. Без этой оговорки на полсекунды уходили бы вторые счёты за
  // числами для кнопок пустого экрана, которого сейчас не будет.
  const nothingFound = sectionMode
    ? !sectionsPending && !sectionsFailed && sectionSpecs.length > 0 && sectionTotal === 0
    : !roleResolvePending && !filesQuery.isLoading && !filesQuery.isError && files.length === 0;
  const everywhereQuery = useFilesTotal(
    // `withoutRole` здесь обнулять не нужно: `normalizeGrouping` гасит его вместе с проектом
    // одним правилом на весь раздел — иначе этот запрос ушёл бы за ОТКАЗОМ (сервер отказывает
    // на «без роли» без проекта), и кнопка «искать во всех темах» осталась бы без числа.
    { ...filter, topicIds: [], untopiced: false, projectId: 0 },
    narrowed && nothingFound && !!urlSearch.trim(),
  );
  // ТРЕТИЙ СЧЁТ, по тому же правилу и с той же оговоркой: он один отличает «у паши тут ничего
  // нет» от «паша это не ЗАГРУЖАЛ, но ведёт четыре штуки». Спрашивается только на пустой выдаче
  // и только когда роль сужена, — иначе он ответил бы ровно то, что уже на экране.
  const anyRoleQuery = useFilesTotal(
    { ...filter, personRole: 'any' },
    personId > 0 && personRole !== 'any' && nothingFound,
  );
  // ЧЕТВЁРТЫЙ СЧЁТ, по тому же правилу: «в этой роли пусто» и «в проекте пусто» — разные
  // ответы, и различает их одно число. Спрашивается только на пустой выдаче и только когда
  // роль действительно сузила, иначе он повторял бы то, что уже на экране.
  //
  // ПРОЕКТ ИЗ УСЛОВИЯ УБРАН. Роль сужает и БЕЗ проекта («все исходники по всем съёмкам»), и
  // пустой поиск внутри такой роли до сих пор не признавался, что искали в одной роли: ни слова
  // про роль, ни кнопки ослабления. Это тот же класс, ради которого счёт и заводился, — виноват
  // фильтр, а винить будут поиск. Одно число отвечает обоим экранам, потому что ослабление у
  // них одно и то же: снять роль.
  const noRoleQuery = useFilesTotal(
    { ...filter, roleId: 0, withoutRole: false },
    roleNarrowed && nothingFound,
  );

  if (!mayRead) return <NoAccessState />;

  const activeTopic =
    topicIds.length === 1 ? topics.find((t) => Number(t.id) === topicIds[0]) : undefined;
  const chosenTopics = topicIds
    .map((id) => topics.find((t) => Number(t.id) === id))
    .filter(Boolean) as typeof topics;

  // ИМЯ БЕРЁТСЯ ТОЛЬКО ДЛЯ ПОДПИСИ, фильтрует по-прежнему id. `ListAdmins` отдаёт лишь живые
  // аккаунты, поэтому имени может не быть вовсе — тогда пустой экран говорит `#id` и объясняет,
  // почему имени нет, а не притворяется, что фильтра нет.
  const pickedPerson = (adminsData?.admins ?? []).find((a) => Number(a.id ?? 0) === personId);
  const personLabel = personId ? (pickedPerson?.username ?? `#${personId}`) : '';

  // Роль СЛОВОМ — для тех экранов, которые обязаны назвать, чем сужена выдача. «#id» тут по той
  // же причине, что и у человека: архивную роль в словаре холста не найти, а фильтровать по ней
  // она продолжает.
  const roleLabel = fileRole.withoutRole
    ? 'without a role'
    : fileRole.roleId > 0
      ? (roles.find((r) => Number(r.id) === fileRole.roleId)?.name ?? `#${fileRole.roleId}`)
      : '';
  const noRoleTotal = noRoleQuery.data ? Number(noRoleQuery.data.total ?? 0) : undefined;
  const dropRole = () => patch({ fileRole: { roleId: 0, withoutRole: false } });

  /**
   * ПЛИТКА ОДНА НА ОБА РЕЖИМА. Секции получают ровно ту же функцию, которой рисуется плоская
   * сетка: выбор, открытие карточки, перевыдача протухшей ссылки и кнопка «построить заново»
   * написаны один раз. Копия плитки внутри секции разошлась бы с оригиналом на первой правке —
   * и разошлась бы молча, потому что обе выглядят одинаково.
   */
  const tile = (f: LibraryFile) => (
    <FileTile
      key={f.id}
      file={f}
      selectable
      selected={selection.isSelected(Number(f.id))}
      onToggleSelect={() => selection.toggle(f)}
      onDetails={() => openCard(Number(f.id))}
      /**
       * ВТОРОЙ ПУТЬ — САМ ФАЙЛ. Зовётся только там, где плитка нашла путь просмотра
       * (`hasViewPath`), поэтому обе ветки здесь — ровно два слагаемых того же условия и
       * разойтись с ним не могут.
       *
       * Заметку показывает её экран: `text/markdown` сервер в inline-аллоулист не берёт, и
       * `url` у неё пуст. Остальным — новая вкладка тем же способом, что кнопка «open»
       * карточки: уход по маршруту размонтировал бы холст вместе с выделением и позицией
       * прокрутки, а на файл смотрят В ХОДЕ разбора сетки.
       */
      onView={() => {
        if (isMarkdownNote(f.fileName ?? '', f.contentType ?? undefined)) {
          navigate(notePath(Number(f.id)));
          return;
        }
        if (f.url) window.open(f.url, '_blank', 'noopener,noreferrer');
      }}
      onPreviewError={onPreviewError}
    >
      {/* Кнопка есть только там, где превью ОБЯЗАНО было получиться: на .zip она обещала бы
          невозможное. В режиме чтения она ВЫКЛЮЧЕНА, а не спрятана — то же правило, что и у
          остальных писателей раздела. */}
      {!f.previewUrl && previewExpected(f.contentType ?? undefined, f.fileName ?? '') && (
        <RebuildPreview file={f} writable={writable} />
      )}
    </FileTile>
  );

  const sectionViews = sectionSpecs.map((s, i) => ({ spec: s, q: sectionQueries[i] }));
  // ПУСТАЯ СЕКЦИЯ НЕ РИСУЕТСЯ. Сорвавшаяся — рисуется: молча пропасть она не имеет права,
  // иначе «в проекте нет исходников» и «про исходники не спросили» выглядели бы одинаково.
  const visibleSections: ProjectSectionView[] = sectionViews
    .filter(({ q }) => q.isError || Number(q.data?.total ?? 0) > 0)
    .map(({ spec, q }) => ({
      key: spec.key,
      title: spec.title,
      archived: spec.archived,
      question: spec.withoutRole ? 'dropped into the project and not sorted out yet' : undefined,
      files: q.data?.files ?? [],
      total: Number(q.data?.total ?? 0),
      error: q.isError ? q.error : undefined,
      onRetry: () => q.refetch(),
      onShowAll: () => {
        patch({
          fileRole: spec.withoutRole
            ? { roleId: 0, withoutRole: true }
            : { roleId: spec.roleId, withoutRole: false },
        });
        // ФОКУС ПЕРЕЕЗЖАЕТ НА ЗАГОЛОВОК СУЖЕННОЙ СЕКЦИИ. Нажатая кнопка исчезает вместе с
        // секциями, и без этой строки фокус падает на `body`: клавиатурный человек начинает
        // следующий шаг с начала документа и проходит весь тулбар заново.
        //
        // МИШЕНЬ ПЕРЕЕХАЛА С ЧИПА НА ЗАГОЛОВОК вместе со смертью ряда чипов ролей: состояние,
        // поставленное нажатием, держит теперь он, и рядом с ним стоит выход обратно.
        //
        // Кадр ожидания обязателен: заголовок рисуется тем же коммитом, и фокус, поставленный
        // до него, браузер снимет вместе со старым узлом.
        requestAnimationFrame(() => document.getElementById(NARROWED_HEAD_ID)?.focus());
      },
    }));
  const emptyRoleNames = sectionViews
    .filter(
      ({ spec, q }) =>
        !spec.withoutRole && !spec.archived && !q.isError && Number(q.data?.total ?? 0) === 0,
    )
    .map(({ spec }) => spec.title);
  const pile = sectionViews.find(({ spec }) => spec.withoutRole);
  const pileEmpty = !!pile && !pile.q.isError && Number(pile.q.data?.total ?? 0) === 0;

  /**
   * КУДА ПОПАДЁТ БРОШЕННОЕ — СКАЗАНО ДО ТОГО, КАК ОТПУСТИЛИ.
   *
   * Загрузка ставит ТЕМЫ и не ставит роль: роль живёт на строке связи, а строки связи ещё нет —
   * файла нет. Значит в проекте пачка ложится в приёмную кучу, и это законное состояние, а не
   * недоделка. Но человек, стоящий в разделе «исходники» и бросающий туда файл, ждёт исходников,
   * а получит пропажу: файла не будет ни в этом разделе, ни в этой выдаче. Поэтому в выбранной
   * роли оверлей прямо говорит, что в ЭТОЙ выдаче брошенного не появится.
   *
   * СЕКЦИЯ НЕ ЯВЛЯЕТСЯ ПРИЁМНИКОМ, и это решение, а не пропуск. Приёмник — всё окно, потому что
   * промах мимо рамки уносит вкладку по ссылке на брошенный файл; вернуть прицеливание ради
   * пяти секций значило бы вернуть ровно ту поломку. Плюс роль на брошенное можно поставить
   * только вторым запросом после загрузки — и его отказ оставил бы файл в куче, хотя на глазах
   * он улетал в «исходники».
   */
  const dropLanding = (() => {
    // ПРИЧИНА НАЗВАНА, А НЕ ТОЛЬКО ИСХОД. «Роль не проставится» без «почему» читается как
    // недоделка загрузки; «её ставят на уже загруженный файл» — как устройство, и второй раз
    // человек этого не спрашивает.
    const why = 'a role is set on a file that already exists';
    const role = roles.find((r) => Number(r.id) === fileRole.roleId)?.name;
    // РОЛЬ БЕЗ ПРОЕКТА — ДОСТИЖИМОЕ СОСТОЯНИЕ, а не край карты: ряд ролей сам предлагает его
    // подписью «“raw” across all projects at once». Пропажа там ровно та же и даже обиднее —
    // проекта нет, значит и приёмной кучи, куда можно пойти посмотреть, тоже нет. Куда пачка
    // уедет, уже сказано строкой тем выше, поэтому здесь — только про роль.
    if (!activeProject) {
      if (!role) return undefined;
      return `“${role}” will not be set: ${why} — you will not see the batch in this view`;
    }
    if (fileRole.withoutRole) return `no role will be set — “without a role” is exactly this view`;
    // В ВЫБРАННОЙ РОЛИ ОБЕЩАНИЕ ОБЯЗАНО ПРЕДУПРЕДИТЬ О ПРОПАЖЕ. Плоская сетка показывает одну
    // роль, пачка ляжет без роли — и брошенного в этой выдаче не окажется вовсе. Промолчать
    // здесь значит дать человеку увидеть, как файл «загрузился» и исчез.
    if (role)
      return `“${role}” will not be set: ${why}. the batch lands in “without a role” — you will not see it in this view`;
    return `no role will be set: ${why}. the batch lands in “without a role” — sort it out later`;
  })();

  const emptyState = () => {
    if (urlSearch) {
      return (
        <EmptySearchState
          search={urlSearch}
          narrowed={narrowed}
          personLabel={personLabel || undefined}
          roleLabel={roleLabel || undefined}
          everywhereTotal={
            everywhereQuery.data ? Number(everywhereQuery.data.total ?? 0) : undefined
          }
          anyRoleTotal={noRoleTotal}
          onSearchEverywhere={() => patch({ topicIds: [], untopiced: false, projectId: 0 })}
          onAnyRole={dropRole}
          onClearPerson={() => patch({ personId: 0 })}
          onClearSearch={() => {
            setSearchInput('');
            patch({ q: '' });
          }}
        />
      );
    }
    // ЧЕЛОВЕК СТОИТ ВЫШЕ ТЕМ, потому что он и есть заданный вопрос: чипы тем видно на экране
    // всегда, а вот выбранный человек — свежее и уже действующее сужение, и «в теме пусто» на
    // непустой теме прочлось бы как поломка темы. Ниже поиска: набранное слово человек помнит
    // лучше всего, и «ничего не нашлось» про него — точнее.
    if (personId) {
      return (
        <EmptyPersonState
          personLabel={personLabel}
          known={!!pickedPerson}
          role={personRole}
          narrowed={narrowed}
          anyRoleTotal={anyRoleQuery.data ? Number(anyRoleQuery.data.total ?? 0) : undefined}
          onAnyRole={() => patch({ personRole: 'any' })}
          onShowAll={showAll}
        />
      );
    }
    // ГРУППИРОВКА СТОИТ ВЫШЕ ТЕМ И «РАЗОБРАТЬ» по тому же доводу, что и человек: это
    // свежее сужение, заданное одним движением, и «в теме пусто» на непустой теме прочлось
    // бы как поломка темы.
    if (projectId > 0 || roleNarrowed) {
      return (
        <EmptyGroupingState
          projectId={projectId}
          projectName={activeProject?.name ?? undefined}
          roleName={roles.find((r) => Number(r.id) === fileRole.roleId)?.name ?? undefined}
          roleId={fileRole.roleId}
          withoutRole={fileRole.withoutRole}
          narrowedByTopics={topicIds.length > 0 || untopiced}
          wholeProjectTotal={noRoleTotal}
          onWholeProject={dropRole}
          onShowAll={showAll}
        />
      );
    }
    if (untopiced) return <EmptyUntopicedState onShowAll={showAll} />;
    if (topicIds.length) {
      return (
        <EmptyTopicState
          topics={chosenTopics}
          writable={writable}
          onShowAll={showAll}
          onUpload={openPicker}
        />
      );
    }
    return <EmptyLibraryState writable={writable} onUpload={openPicker} />;
  };

  return (
    <div className='flex flex-col gap-gutter'>
      {/* Диалога выбора файлов у раздела больше нет: кнопка открывает системный выбор, а очередь
          показывает полоса снизу. Поле скрытое — свой вид у него нестилизуемый. */}
      <input
        ref={pickerRef}
        type='file'
        multiple
        hidden
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const list = Array.from(e.target.files ?? []);
          // Сброс значения — иначе повторный выбор ТОГО ЖЕ файла не поднимет `change`.
          e.target.value = '';
          intake(list);
        }}
      />

      {/* Один блок: полоса управления и словарь тем — это ОДНА поверхность, разделённая внутри
          волосяной линией, а не два бордера подряд. */}
      <div className='border border-borderColor bg-bgColor'>
        <FilesToolbar
          search={searchInput}
          onSearch={setSearchInput}
          sort={sort}
          onSort={(v) => patch({ sort: v })}
          personId={personId}
          personRole={personRole}
          onPerson={(id) => patch({ personId: id })}
          onPersonRole={(r) => patch({ personRole: r })}
          mode={mayWrite ? mode : 'read'}
          onMode={setMode}
          canWrite={mayWrite}
          onUpload={openPicker}
          onNewNote={() => setNewNote(true)}
          className='border-0'
        />
        {/* ДВА РЯДА, А НЕ ОДИН, и разделяет их волосяная линия — та же внутренняя структура
            блока, что и у остальных полос этой поверхности. Ряды разные по смыслу: темы —
            пересечение ярлыков, проект — один контейнер. Один ряд на всё означал бы, что
            одинаковые на вид чипы значат разные вещи и переключаются разными правилами.

            ТРЕТЬЕГО РЯДА — РОЛЕЙ — ЗДЕСЬ БОЛЬШЕ НЕТ (0323). Роль принадлежит проекту, и вне
            проекта ряд предлагал бы слова, которых не существует: словаря на всю библиотеку не
            стало. ВНУТРИ проекта роли теперь не чипы, а разделы его собственной страницы —
            орган остался, поменялось место. */}
        <div className='border-t border-hairline px-2.5 py-2'>
          <TopicChips
            topics={topics}
            selected={topicIds}
            untopiced={untopiced}
            totalFiles={totalFiles}
            untopicedCount={untopicedCount}
            matched={matched}
            searching={!!urlSearch}
            onChange={onTopics}
          />
        </div>
        <div className='border-t border-hairline px-2.5 py-2'>
          <ProjectChips
            projects={projects}
            selected={projectId}
            matched={matched}
            // Смена проекта СНИМАЕТ роль: роль осмысленна только на связи с проектом, и
            // перенесённая в соседнюю съёмку она означала бы уже другой вопрос — тот, который
            // человек не задавал. «Без роли» уходит вместе с проектом тем же правилом в `patch`.
            onChange={(next) =>
              patch({ projectId: next, fileRole: { roleId: 0, withoutRole: false } })
            }
          />
        </div>
        {/* ТОЛЬКО ЧТЕНИЕ ОБЪЯСНЯЕТСЯ СТРОКОЙ. Кнопки выключены, а не спрятаны: спрятанного не
            попросишь, а выключенную без объяснения жмут и считают поломкой. Оба положения —
            и вынужденное, и добровольное — глушат один и тот же набор контролов. */}
        {!writable && (
          <div className='border-t border-hairline px-2.5 py-2'>
            <Text size='micro' variant='label'>
              {mayWrite
                ? 'read mode is switched on by you: uploading, editing and deleting are off while it stands.'
                : "you can look and download but you can't change: there is no files:write right."}
            </Text>
          </div>
        )}
        {/* ОПИСАНИЕ ПРОЕКТА ОТСЮДА УЕХАЛО: у проекта есть своя страница, и там оно первый
            абзац, с правкой на месте. Здесь остаётся описание ОБЫЧНОГО ярлыка — у него
            страницы нет, и эта строка единственное место, где его вообще видно. */}
        {!!activeTopic?.description && (
          <div className='border-t border-hairline px-2.5 py-2'>
            <Text size='micro' variant='label' className='max-w-[80ch]'>
              {activeTopic.description}
            </Text>
          </div>
        )}
      </div>

      {/* ЦЕНА ТАБУЛЯЦИИ НА ХОЛСТЕ — ОДИН ОРГАН, А НЕ ПЕРЕДЕЛКА ПЛИТКИ.
          У плитки теперь ТРИ остановки (чекбокс выделения, кадр, подвал), и при `PAGE_SIZE = 60`
          до кнопки «show more» за сеткой набирается около 180 нажатий Tab вместо прежних 120.
          Порядок обхода при этом верный: чекбокс → кадр → подвал, DOM совпадает с картинкой.
          Дорого не устройство плитки, а её количество.

          ВЫБРАНА ССЫЛКА-ПРОПУСК, А НЕ ROVING ПО СЕТКЕ, и вот почему. Roving требует протащить
          `tabIndex` в `file-tile.tsx` — файл соседней волны, и он же рисует вложения карточки
          задачи, где стрелки означали бы совсем другое. Хуже: у плитки три остановки РАЗНОГО
          рода, и roving пришлось бы учить, что стрелка вправо внутри плитки и стрелка вправо
          между плитками — разные жесты. Это новый контракт взаимодействия, а не починка.
          Ссылка-пропуск стоит одну остановку, ничего не отнимает у мыши, невидима до фокуса и
          приводит ровно туда, куда указывала жалоба, — за сетку.

          ЧИСЛО В ПОДПИСИ НЕСУЩЕЕ: пропуск вслепую человек не нажимает, а «60 tiles» и
          «6 tiles» — это разные решения.

          СТОИТ ПОСЛЕ ТУЛБАРА, А НЕ ПЕРВОЙ НА СТРАНИЦЕ: поиск, сортировка и чипы идут ДО сетки,
          и ссылка, поставленная выше них, уносила бы и от них тоже. */}
      {files.length > 0 && (
        <Button
          size='xs'
          variant='secondary'
          className='sr-only focus:not-sr-only focus:absolute focus:z-10'
          onClick={() => {
            const el = document.getElementById(AFTER_GRID_ID);
            el?.focus();
            el?.scrollIntoView({ block: 'nearest' });
          }}
        >
          skip the grid ({files.length} {files.length === 1 ? 'tile' : 'tiles'})
        </Button>
      )}

      {/* СТРАНИЦА ПРОЕКТА — ЭТО НЕ ВТОРОЙ ЭКРАН, А ДРУГАЯ ОТРИСОВКА ТОГО ЖЕ АДРЕСА.
          `?project=N` как был режимом холста, так и остался: глубокие ссылки из задач, с
          карточек вещей и из чата продолжают работать буква в букву. Меняется то, ЧЕМ этот
          режим нарисован — крошка, имя, даты, вещи, описание и строка задач вместо одного
          чипа в ряду.

          ШАПКА ЕСТЬ И В СУЖЕННОМ ВИДЕ. Человек, нажавший «show all» в секции, не покинул
          проект — он смотрит его часть, и терять при этом имя, даты и выход в индекс не за
          что. Ниже шапки в этом случае встаёт заголовок «проект / роль». */}
      {projectId > 0 && activeProject && (
        <ProjectHeader
          project={activeProject}
          styles={projectStylesQuery.data?.styles ?? []}
          stylesFetched={projectStylesQuery.isFetched}
          writable={writable}
          onIndex={() => navigate(ROUTES.filesProjects)}
          onEdit={() => setEditingProject(true)}
        >
          {/* ОПИСАНИЕ — ПЕРВЫЙ АБЗАЦ СТРАНИЦЫ, и правится оно на месте. У обычного ярлыка
              страницы нет, и там этот орган не монтируется вовсе. */}
          <ProjectDescription project={activeProject} writable={writable} />
          {/* ЗАДАЧИ — ОДНА СТРОКА-СВОДКА ПОД ШАПКОЙ, до секций: страница про ФАЙЛЫ, задачи
              здесь гость. Компонент сам спрашивает данные, сам молчит без права и до ответа,
              и от места не зависит ничем. */}
          <ProjectTasks projectId={projectId} />
        </ProjectHeader>
      )}

      {/* СУЖЕННАЯ СЕКЦИЯ: вместо ряда чипов — заголовок «проект / роль · N» и выход обратно.
          Он же мишень фокуса после «show all» (см. `onShowAll` выше). */}
      {projectId > 0 && roleNarrowed && activeProject && (
        <NarrowedSectionHeader
          projectName={activeProject.name ?? `#${projectId}`}
          roleName={roleLabel || `#${fileRole.roleId}`}
          total={matched}
          archivedRole={
            !fileRole.withoutRole &&
            !!roles.find((r) => Number(r.id) === fileRole.roleId)?.archived
          }
          onBack={() => patch({ fileRole: { roleId: 0, withoutRole: false } })}
        />
      )}

      {/* РЕЖИМ ПРОЕКТА ЗАНИМАЕТ МЕСТО СЕТКИ, и только его. Всё, что ниже — полоса выделения,
          приём броска, очередь загрузки, карточка, — общее для обоих режимов и написано один
          раз. Скелет, отказ и пустые состояния тоже общие: в секциях они отвечают на те же
          вопросы, просто спрашивают их у пяти запросов вместо одного. */}
      {sectionMode ? (
        sectionsPending ? (
          // ОДИН СКЕЛЕТ НА ВСЕ СЕКЦИИ, а не заголовок с крутилкой вместо числа. Заголовок без
          // счётчика — это заголовок, который ничего не сообщает, а счётчик и есть смысл секции.
          // Запросы уходят одновременно, так что ждут ровно самый медленный из них.
          <GallerySkeleton />
        ) : sectionsAllFailed ? (
          <ListFailedState
            error={rolesQuery.error ?? sectionQueries.find((q) => q.isError)?.error}
            onRetry={() => {
              rolesQuery.refetch();
              sectionQueries.forEach((q) => q.refetch());
            }}
          />
        ) : nothingFound ? (
          emptyState()
        ) : (
          <ProjectSections
            sections={visibleSections}
            emptyRoles={emptyRoleNames}
            pileEmpty={pileEmpty}
            projectName={activeProject?.name ?? `#${projectId}`}
            roleNames={roles.filter((r) => !r.archived).map((r) => r.name ?? `#${r.id}`)}
            writable={writable}
            onAddRole={() => setRolesDialog(true)}
            renderTile={tile}
          />
        )
      ) : roleResolvePending || filesQuery.isLoading ? (
        <GallerySkeleton />
      ) : filesQuery.isError && !files.length ? (
        <ListFailedState error={filesQuery.error} onRetry={() => filesQuery.refetch()} />
      ) : files.length === 0 ? (
        emptyState()
      ) : (
        <Tiles min={190}>{files.map(tile)}</Tiles>
      )}

      {/* МИШЕНЬ ПРОПУСКА. `tabIndex={-1}` даёт узлу принимать фокус программно, не влезая в
          порядок обхода: следующее нажатие Tab уводит отсюда дальше по документу — в полосу
          выделения и в «show more», то есть ровно туда, ради чего пропуск и нажимали. */}
      <div id={AFTER_GRID_ID} tabIndex={-1} className='focus:outline-none' />

      {/* ОБРЫВ ПРИ ЛИСТАНИИ — ПОЛОСА ПОД СПИСКОМ, а не вместо него: уже показанные страницы
          остаются на месте, позиция прокрутки не съезжает. */}
      {filesQuery.isFetchNextPageError && (
        <NextPageFailure
          loaded={files.length}
          total={total === undefined ? undefined : Number(total)}
          retrying={filesQuery.isFetchingNextPage}
          onRetry={() => filesQuery.fetchNextPage()}
        />
      )}

      {/* Набор отдаётся СВЕЖИМИ объектами из текущей выдачи, а не снимком на момент клика:
          у снимка через несколько часов мёртвая presigned-ссылка, а после переименования из
          карточки — устаревшее имя в списке того, что сейчас удалят. */}
      {/* СЛОВАРЬ РОЛЕЙ ПОЛОСЕ БОЛЬШЕ НЕ ПЕРЕДАЁТСЯ. Он принадлежит проекту, а проект полоса
          выбирает У СЕБЯ в диалоге — значит и словарь она обязана спрашивать сама, по своему
          выбору. Проп `roles` здесь означал бы «словарь холста», то есть словарь ДРУГОГО
          проекта, чем тот, в который сейчас кладут. */}
      <FilesSelectionBar
        selected={selectedFresh}
        topics={topics}
        projects={writerProjects}
        activeProjectId={projectId}
        writable={writable}
        onClear={selection.clear}
        onDropped={selection.drop}
      />

      {filesQuery.hasNextPage && !filesQuery.isFetchNextPageError && (
        <div className='flex items-center gap-2.5'>
          <Button
            size='sm'
            variant='secondary'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
          >
            {filesQuery.isFetchingNextPage ? 'loading…' : 'show more'}
          </Button>
          <Text size='micro' variant='label'>
            shown {files.length}
            {total === undefined ? '' : ` of ${total}`}
          </Text>
        </div>
      )}

      {/* БРОСОК ПРИНИМАЕТ ВСЁ ОКНО — целиться некуда. Приёмник живёт и в режиме чтения: он
          гасит бросок, чтобы браузер не ушёл по ссылке на файл, унеся вкладку с фильтром и
          половиной очереди, и объясняет отказ словами.

          ПРИ ОТКРЫТОЙ МОДАЛКЕ ПРИЁМ ВЫКЛЮЧЕН, а бросок всё равно гасится. Полоса загрузки
          лежит НИЖЕ модалки (это её осознанное место — иначе она накрывала бы подвал
          карточки), поэтому принятая сквозь карточку пачка встала бы за модалкой: очередь
          идёт, отменить её нечем, и на экране этого не видно. */}
      <FilesDropOverlay
        enabled={writable && !id && !pasted.length}
        disabledNote={
          id || pasted.length
            ? 'close the window first: the queue stands under it, and the batch would not be visible'
            : mayWrite
              ? 'read mode is on — switch it in the bar above'
              : 'the files:write right is needed — ask a super admin for it'
        }
        // Проект называется В ТОМ ЖЕ списке, что и темы: оверлей обещает, куда попадёт пачка,
        // и умолчать о проекте значило бы пообещать «разобрать» там, где файлы уедут в съёмку.
        //
        // АРХИВ ПОМЕЧЕН ПРЯМО В ИМЕНИ, а не подсказкой: у оверлея нет ни чипов, ни наведения —
        // это одна фраза, которую читают за полсекунды до того, как отпустят кнопку мыши. Класть
        // в закрытую коробку можно, но узнать, что коробка закрыта, человек должен ДО броска.
        topicLabels={[
          ...(activeProject
            ? [`${activeProject.name ?? ''}${activeProject.archived ? ' (archived)' : ''}`]
            : []),
          ...chosenTopics.map((t) => t.name ?? ''),
        ]}
        landingNote={dropLanding}
        onFiles={intake}
      />

      {/* ВСТАВКА ИЗ БУФЕРА СПРАШИВАЕТ ИМЯ. У картинки из буфера его нет, и без этого шага
          библиотека набивается неотличимыми «image.png». */}
      {pasted.length > 0 && (
        <PasteIntakeModal
          files={pasted}
          topics={topics}
          projects={writerProjects}
          presetTopicIds={topicIds}
          presetProjectId={projectId}
          onCancel={() => setPasted([])}
          onSubmit={(list, batch) => {
            enqueue(list, batch);
            setPasted([]);
          }}
        />
      )}

      {/* Полоса загрузки — фиксирована снизу и переживает и уход на другой экран раздела, и
          открытие карточки: она только зритель стора, XHR живут не в ней. Режим чтения глушит
          и её пишущие кнопки — иначе «оба положения глушат один и тот же набор» было бы
          неправдой ровно там, где стоит единственная кнопка отправки. Полосе передаётся ПРАВО,
          а тумблер она читает из стора сама: экран, который забыл бы его подмешать, снова
          сделал бы режим чтения местным. */}
      <FilesUploadBar mayWrite={mayWrite} />

      {/* Карточка — модальный роут ПОВЕРХ сетки: сетка остаётся смонтированной, поэтому
          закрытие возвращает ровно тот экран, с которого ушли. Закрытие идёт с текущим
          query, а не на голый /files: иначе оно стирало бы выбранные чипы и строку поиска.

          СЛОВАРЬ РОЛЕЙ КАРТОЧКА СПРАШИВАЕТ САМА, и по одному на каждую строку проекта: файл
          лежит в трёх проектах — значит и словарей три, разных. Один общий проп отдал бы всем
          трём строкам слова того проекта, который случайно выбран на холсте. */}
      {id && (
        <FileCardModal
          id={Number(id)}
          topics={topics}
          projects={writerProjects}
          writable={writable}
          onClose={closeCard}
        />
      )}

      {/* ПРАВКА ПРОЕКТА И ЕГО СЛОВАРЬ — РЯДОМ С КАРТОЧКОЙ, а не внутри шапки: шапка исчезает
          вместе с режимом проекта, и модалка, смонтированная в ней, унесла бы с собой
          несохранённый текст на первом же изменении фильтра. */}
      {editingProject && activeProject && (
        <ProjectEditModal project={activeProject} onClose={() => setEditingProject(false)} />
      )}
      {rolesDialog && activeProject && (
        <ProjectRolesModal
          project={activeProject}
          writable={writable}
          onClose={() => setRolesDialog(false)}
        />
      )}

      {/* Модалка живёт РЯДОМ с карточкой, а не внутри полосы: полоса — управление сеткой, и
          модалка, смонтированная в ней, исчезла бы вместе с полосой на экране тем. */}
      {/* ЗАМЕТКА — ПЯТЫЙ ПИСАТЕЛЬ СВЯЗИ, и наследует она то же, что остальные четыре: чипы
          холста и активный проект. Пока она наследовала пустоту, созданная внутри съёмки
          заметка уезжала в «разобрать» — при том, что «планирование» стоит прямо в словаре
          ролей, то есть заметка и есть тот файл, ради которого роль заводили. */}
      {newNote && (
        <NewNoteModal
          topics={topics}
          projects={writerProjects}
          presetTopicIds={topicIds}
          presetProjectId={projectId}
          onClose={() => setNewNote(false)}
        />
      )}
    </div>
  );
}
