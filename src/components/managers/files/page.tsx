import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { ROUTES, SECTION } from 'constants/routes';
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
  RoleChips,
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
  useLibraryFiles,
  type FileRoleFilter,
  type FilesSort,
  type PersonRoleFilter,
} from './hooks/useFiles';
import { previewExpected } from './utils/format';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Библиотека файлов — холст.
 *
 * Макет узнают ГЛАЗАМИ, а не по имени: в жизни оно выглядит как «grbpwr_graphic (1).pdf».
 * Поэтому экран несут крупные превью, а поиск — запасной путь, что противоположно тому, как
 * обычно строят список документов. Рейла тем нет намеренно: одна тема за раз не выражает
 * «packaging и atelier сразу», а именно этим вопросом сотни файлов и сужают до десятка.
 */
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

  const topicsQuery = useFileTopics();
  // Тот же общий список людей, что читают пикер в полосе и оба блока карточки: один ключ, один
  // запрос на 5 минут. Здесь он нужен ровно на подпись выбранного человека в пустом экране.
  const { data: adminsData } = useAdmins();
  // ОДИН ОБЪЕКТ ФИЛЬТРА на страницу и на оба вторых счёта: ослабленные варианты собираются из
  // него же (`{...filter, topicIds: []}`), поэтому число в кнопке не может оказаться посчитанным
  // не тем условием, под которым его потом покажут.
  const filter = {
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
  const filesQuery = useLibraryFiles(filter);
  // Без архива: заархивированную роль сервер разрешает снять, но не назначить, и предлагать её
  // в ряду чипов значило бы предлагать фильтр, который потом никому не проставить.
  const rolesQuery = useFileRoles();
  const roles = rolesQuery.data?.roles ?? [];

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
  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  const total = filesQuery.data?.pages?.[0]?.total;
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
  // Смена фильтра снимает выбор. Набранное в одном пересечении на экране следующего не видно
  // целиком, а полоса продолжала бы обещать действие над файлами, которых на экране нет.
  const filterKey = `${topicIds.join(',')}|${untopiced}|${urlSearch}|${personId}|${personRole}|${projectId}|${fileRole.roleId}|${fileRole.withoutRole}`;
  const seenFilter = useRef(filterKey);
  const clearSelection = selection.clear;
  useEffect(() => {
    if (seenFilter.current === filterKey) return;
    seenFilter.current = filterKey;
    clearSelection();
  }, [filterKey, clearSelection]);

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
  const nothingFound = !filesQuery.isLoading && !filesQuery.isError && files.length === 0;
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
  const roleNarrowed = fileRole.roleId > 0 || fileRole.withoutRole;
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
        {/* ТРИ РЯДА, А НЕ ОДИН, и разделяет их волосяная линия — та же внутренняя структура
            блока, что и у остальных полос этой поверхности. Ряды разные по смыслу: темы —
            пересечение ярлыков, проект — один контейнер, роль — связь файла с этим
            контейнером. Один ряд на всё означал бы, что одинаковые на вид чипы значат три
            разные вещи и переключаются тремя разными правилами. */}
        <div className='border-t border-hairline px-2.5 py-2'>
          <TopicChips
            topics={topics}
            selected={topicIds}
            untopiced={untopiced}
            totalFiles={totalFiles}
            untopicedCount={untopicedCount}
            matched={total === undefined ? undefined : Number(total)}
            searching={!!urlSearch}
            onChange={onTopics}
          />
        </div>
        <div className='border-t border-hairline px-2.5 py-2'>
          <ProjectChips
            projects={projects}
            selected={projectId}
            matched={total === undefined ? undefined : Number(total)}
            // Смена проекта СНИМАЕТ роль: роль осмысленна только на связи с проектом, и
            // перенесённая в соседнюю съёмку она означала бы уже другой вопрос — тот, который
            // человек не задавал. «Без роли» уходит вместе с проектом тем же правилом в `patch`.
            onChange={(next) =>
              patch({ projectId: next, fileRole: { roleId: 0, withoutRole: false } })
            }
          />
        </div>
        <div className='border-t border-hairline px-2.5 py-2'>
          <RoleChips
            roles={roles}
            value={fileRole}
            // ПРОЕКТ ЕСТЬ и ИМЯ ПРОЕКТА ЕСТЬ — это два разных факта, и рядом ролей управляет
            // первый. Пока чипом «без роли» управляло имя, прямая ссылка на архивный проект
            // (`?project=4&frole=none`) фильтровала по «без роли», а ряд не показывал ничего
            // нажатого: имя — это то, что мы не сумели показать, а не то, чего нет.
            hasProject={projectId > 0}
            projectName={activeProject?.name ?? undefined}
            matched={total === undefined ? undefined : Number(total)}
            onChange={(next) => patch({ fileRole: next })}
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
        {/* Описание печатает и проект: у него оно и есть та самая «страница проекта» без
            заведения новой сущности — «что сюда класть» словами человека, который проект
            завёл. Приоритет у проекта, потому что он — более узкое и более свежее сужение. */}
        {(activeProject?.description || activeTopic?.description) && (
          <div className='border-t border-hairline px-2.5 py-2'>
            <Text size='micro' variant='label' className='max-w-[80ch]'>
              {activeProject?.description || activeTopic?.description}
            </Text>
          </div>
        )}
      </div>

      {filesQuery.isLoading ? (
        <GallerySkeleton />
      ) : filesQuery.isError && !files.length ? (
        <ListFailedState error={filesQuery.error} onRetry={() => filesQuery.refetch()} />
      ) : files.length === 0 ? (
        emptyState()
      ) : (
        <Tiles min={190}>
          {files.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              selectable
              selected={selection.isSelected(Number(f.id))}
              onToggleSelect={() => selection.toggle(f)}
              onOpen={() => openCard(Number(f.id))}
              onPreviewError={onPreviewError}
            >
              {/* Кнопка есть только там, где превью ОБЯЗАНО было получиться: на .zip она
                  обещала бы невозможное. В режиме чтения она ВЫКЛЮЧЕНА, а не спрятана — то же
                  правило, что и у остальных писателей раздела. */}
              {!f.previewUrl && previewExpected(f.contentType ?? undefined, f.fileName ?? '') && (
                <RebuildPreview file={f} writable={writable} />
              )}
            </FileTile>
          ))}
        </Tiles>
      )}

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
      <FilesSelectionBar
        selected={selectedFresh}
        topics={topics}
        projects={writerProjects}
        roles={roles}
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
          query, а не на голый /files: иначе оно стирало бы выбранные чипы и строку поиска. */}
      {id && (
        <FileCardModal
          id={Number(id)}
          topics={topics}
          projects={writerProjects}
          roles={roles}
          writable={writable}
          onClose={closeCard}
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
          roles={roles}
          presetTopicIds={topicIds}
          presetProjectId={projectId}
          onClose={() => setNewNote(false)}
        />
      )}
    </div>
  );
}
