import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { LibraryFilePersonRole, LibraryFileSort } from 'api/proto-http/admin';
import { tasksKeys } from 'components/managers/tasks/hooks/useTasks';
import { filesService } from '../api/filesService';
import { topicsService } from '../api/topicsService';

/** Порядок сетки. `new` — прежний порядок по дате; имя и размер имеют свои фиксированные
 * направления (А→Я и «крупное сверху»), поэтому направлением их никто не управляет. */
export type FilesSort = 'new' | 'name' | 'size';

export const SORT_LABEL: Record<FilesSort, string> = {
  new: 'newest first',
  name: 'by name',
  size: 'by size',
};

function sortBy(sort: FilesSort): LibraryFileSort | undefined {
  if (sort === 'name') return 'LIBRARY_FILE_SORT_NAME';
  if (sort === 'size') return 'LIBRARY_FILE_SORT_SIZE';
  return undefined;
}

/**
 * РОЛЬ ЧЕЛОВЕКА ПРИ ФАЙЛЕ — ОДНО ПОЛЕ, А НЕ ДВА ОТДЕЛЬНЫХ ФИЛЬТРА.
 *
 * У файла два разных отношения к человеку, и живут они разное время. «Загрузил» — исторический
 * факт: строка `uploaded_by` переживает удаление аккаунта, потому и лежит рядом с живой ссылкой
 * `uploaded_by_id`, а не вместо неё. «Ведёт» — сегодняшняя ответственность: список владельцев
 * меняется, не меняя сам файл.
 *
 * Спрашивают про них ОДНИМ вопросом — «а что там числится за Пашей», — и выбрать между двумя
 * отдельными фильтрами человек не может до того, как разницу увидел. Поэтому человек
 * спрашивается один раз, а роль говорит, какое из двух отношений имелось в виду. `any` — оба
 * сразу, и это умолчание: именно оно и значит «где он числится».
 */
export type PersonRoleFilter = 'any' | 'uploaded' | 'owner';

/** Короткая подпись положения переключателя. */
export const PERSON_ROLE_CHIP: Record<PersonRoleFilter, string> = {
  any: 'any',
  uploaded: 'uploaded',
  owner: 'owns',
};

/**
 * Что именно окажется в сетке — словами, рядом с переключателем.
 *
 * ОДИН НАБОР строк на подпись под чипами и на их подсказки: два набора про одно и то же
 * разошлись бы на первой правке, и наведение говорило бы не то, что написано в сантиметре ниже.
 * Короткие намеренно — они стоят в полосе управления, а не в справке.
 */
export const PERSON_ROLE_HINT: Record<PersonRoleFilter, string> = {
  any: 'both what they uploaded and what they own',
  uploaded: "only what they brought in — nothing ever takes that fact off a file",
  owner: 'only what they are answerable for now',
};

function personRoleEnum(role: PersonRoleFilter): LibraryFilePersonRole | undefined {
  if (role === 'uploaded') return 'LIBRARY_FILE_PERSON_ROLE_UPLOADED';
  if (role === 'owner') return 'LIBRARY_FILE_PERSON_ROLE_OWNER';
  return undefined;
}

/**
 * ФИЛЬТР ЧЕЛОВЕКА ЕЗДИТ В АДРЕСЕ, поэтому разбор адреса живёт здесь же, рядом с машиной, а не
 * на экране: ссылку «всё, что ведёт паша» кидают в чат, и разбирать её будет тот же код,
 * который её собрал.
 *
 * РАЗБОР ГЛУХ К МУСОРУ. В адресе бывает что угодно — обрезанная ссылка, ручная правка, старое
 * имя роли, — и ни один из этих случаев не стоит того, чтобы экран упал или показал пустоту:
 * непонятое значение просто не фильтрует.
 */
/** Положительный id из адреса; всё остальное — ноль, то есть «фильтра нет». */
export function idFromUrl(v: string | null): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export function personIdFromUrl(v: string | null): number {
  return idFromUrl(v);
}

export function personRoleFromUrl(v: string | null): PersonRoleFilter {
  return v === 'up' ? 'uploaded' : v === 'own' ? 'owner' : 'any';
}

/** `undefined` — роли в адресе не будет вовсе: умолчание в ссылке только шумит. */
export function personRoleToUrl(role: PersonRoleFilter): string | undefined {
  if (role === 'uploaded') return 'up';
  if (role === 'owner') return 'own';
  return undefined;
}

/* ── группировка: проект и роль ───────────────────────────────────────────────────────── */

/**
 * ПРОЕКТ — ЭТО ТЕМА С ТИПОМ, а не отдельная сущность. Пустой `kind` значит «plain»: так
 * выглядит тема, заведённая до того, как поле появилось.
 */
export function isProjectTopic(t: { kind?: string }): boolean {
  return (t.kind ?? '') === 'project';
}

/**
 * ФИЛЬТР РОЛИ — ОДИН РЯД С ДВУМЯ РОДАМИ ПОЛОЖЕНИЙ.
 *
 * `roleId` — роль из закрытого словаря. `withoutRole` — приёмная куча ВНУТРИ проекта: «что я
 * сюда бросил и ещё не разобрал». Вместе они не встречаются: «в роли X и без роли» пусто по
 * построению, и ряд одиночного выбора этого просто не даёт собрать.
 */
export type FileRoleFilter = { roleId: number; withoutRole: boolean };

export const NO_ROLE_URL = 'none';

/**
 * РАЗБОР ГЛУХ К МУСОРУ — то же правило, что у человека выше.
 *
 * `hasProject` не украшение: «без роли» без проекта сервер ОТКАЗЫВАЕТ, а не игнорирует (в
 * одиночку это «почти вся библиотека», и тихо показанное «больше, чем просили» — ровно тот
 * способ, которым из этой библиотеки утекает имя). Поэтому положение, оставшееся в адресе
 * после снятия проекта, здесь и гасится.
 */
export function fileRoleFromUrl(v: string | null, hasProject: boolean): FileRoleFilter {
  if (v === NO_ROLE_URL) return { roleId: 0, withoutRole: hasProject };
  return { roleId: idFromUrl(v), withoutRole: false };
}

/** `undefined` — в адресе роли не будет: умолчание в ссылке только шумит. */
export function fileRoleToUrl(r: FileRoleFilter): string | undefined {
  if (r.withoutRole) return NO_ROLE_URL;
  return r.roleId > 0 ? String(r.roleId) : undefined;
}

export type FilesFilter = {
  /** Пересечение: файл обязан нести ВСЕ эти темы. */
  topicIds: number[];
  untopiced: boolean;
  search: string;
  sort: FilesSort;
  /**
   * id ЖИВОГО аккаунта, 0 — фильтра нет. Не имя: `admins.username` уникален и освобождается
   * при удалении, так что нанятый позже однофамилец унаследовал бы всю историю ушедшего.
   *
   * Необязателен намеренно: этой же машиной листают пикеры внутри задач и заметок, у которых
   * фильтра по человеку нет вовсе, и требовать от них явного нуля значило бы править чужие
   * экраны ради нашего поля.
   */
  personId?: number;
  personRole?: PersonRoleFilter;
  /**
   * ОДИН проект, а не набор. Технически это обычный id темы, поэтому он СКЛАДЫВАЕТСЯ с
   * `topicIds`, а не заменяет их.
   *
   * Одиночный выбор держится на трёх вещах: одно значение в адресе, одна семантика на весь
   * тулбар и картинка «я работаю в одном проекте». НЕ на том, что «двух ролей не бывает по
   * построению» — это неверно: файл со строками (F, съёмка, исходники) и (F, лукбук, готовое)
   * удовлетворяет обоим условиям, и «И» по двум ролям даёт не пустоту, а множество
   * ПЕРЕИСПОЛЬЗОВАННЫХ файлов. Довод записан здесь целиком, чтобы через полгода его не
   * «починили» на мультивыбор, обнаружив ложность прежнего.
   */
  projectId?: number;
  roleId?: number;
  /** Только вместе с проектом; в одиночку сервер отказывает. */
  withoutRole?: boolean;
};

/**
 * РОЛЬ БЕЗ ЧЕЛОВЕКА — НЕ ФИЛЬТР, и обнуляется она ОДИН раз, здесь.
 *
 * Сервер роль без `person_id` игнорирует. Пока то же самое не было сказано на этой стороне,
 * рукописный адрес `?role=own` давал бы свой ключ кэша и второй запрос на ту же самую выдачу, а
 * экран рисовал бы нажатое положение переключателя, которого в ответе нет.
 */
function normalizePerson(f: FilesFilter): { id: number; role: PersonRoleFilter } {
  const raw = Number(f.personId ?? 0);
  const id = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
  return { id, role: id > 0 ? (f.personRole ?? 'any') : 'any' };
}

/**
 * ГРУППИРОВКА ПРИВОДИТСЯ К ВИДУ ОДИН РАЗ, здесь же, — и по трём разным причинам.
 *
 * «Без роли» без проекта сервер ОТКАЗЫВАЕТ. Ослабление фильтра собирается из этого же объекта
 * (`{...filter, projectId: 0}` в кнопках пустого экрана), и забудь оно снять флажок — кнопка
 * «показать шире» вернула бы отказ вместо более широкой выдачи. Одно правило в одном месте
 * вместо трёх согласованных на трёх экранах.
 *
 * «РАЗОБРАТЬ» С ПРОЕКТОМ ИЛИ РОЛЬЮ СЕРВЕР ТОЖЕ ОТКАЗЫВАЕТ — `untopiced cannot be combined with
 * a project or a role`, и это не придирка: «разобрать» значит «ни одной темы», а проект и есть
 * тема, так что пара по построению пуста. Молча отбросить одно плечо нельзя (показали бы
 * больше, чем просили), значит гасить надо здесь, до провода. Пока этого не было, человек,
 * стоящий в съёмке и нажавший «разобрать», получал вместо сетки красную плашку отказа, и
 * «повторить» не помогало: отказ был не сбоем, а ответом.
 *
 * РОЛЬ БЕЗ ПРОЕКТА ТЕПЕРЬ ТОЖЕ ГАСНЕТ, И ЭТО ПЕРЕМЕНА (0323). Раньше это был полноценный
 * вопрос — «все исходники по всем съёмкам», — и обнулять роль здесь было НЕЛЬЗЯ. С владельцем у
 * роли вопроса не стало: «исходники» съёмки и «исходники» лукбука это разные строки словаря, и
 * фильтр по одной из них вне её проекта отвечает либо тем же самым (роль и так одна на проект),
 * либо пустотой на допереносном id. Сквозной ответ теперь даёт ПОИСК ПО СЛОВУ.
 *
 * Гасить надо именно здесь, вместе с `withoutRole`, и по той же причине, что и его: ослабление
 * фильтра собирается из этого же объекта (`{...filter, projectId: 0}` в кнопках пустого экрана).
 * Не гаси мы роль — кнопка «искать во всех темах (N)» считала бы число ОДНИМ условием, а после
 * нажатия адрес разрешил бы осиротевшую роль обратно в её проект и показал ДРУГОЕ, более узкое.
 * То есть орган, который на глаз не работает: нажал — и ничего не изменилось.
 */
function normalizeGrouping(f: FilesFilter): {
  project: number;
  role: number;
  withoutRole: boolean;
} {
  if (f.untopiced) return { project: 0, role: 0, withoutRole: false };
  const project = Math.max(0, Math.trunc(Number(f.projectId ?? 0) || 0));
  const raw = Math.max(0, Math.trunc(Number(f.roleId ?? 0) || 0));
  const withoutRole = project > 0 && !!f.withoutRole;
  const role = project > 0 && !withoutRole ? raw : 0;
  return { project, role, withoutRole };
}

/**
 * ОДНО МЕСТО, ГДЕ ФИЛЬТР ПРЕВРАЩАЕТСЯ В ЗАПРОС.
 *
 * Страницу и счёт «сколько нашлось бы шире» спрашивают два разных хука, и разойдись они хоть
 * одним полем — кнопка обещала бы число, посчитанное не тем условием, под которым его потом
 * покажут.
 */
function toRequest(filter: FilesFilter) {
  const { id, role } = normalizePerson(filter);
  const g = normalizeGrouping(filter);
  return {
    topicIds: filter.topicIds,
    untopiced: filter.untopiced,
    search: filter.search,
    sortBy: sortBy(filter.sort),
    personId: id,
    personRole: personRoleEnum(role),
    projectTopicId: g.project,
    roleId: g.role,
    withoutRole: g.withoutRole,
  };
}

/**
 * Условие фильтра, приведённое к виду, — ОДНОЙ функцией на все три ключа.
 *
 * Ключей стало три (страница, счёт, секция режима проекта), и три вписанных вручную копии
 * одного и того же перечисления разошлись бы на первой правке: забытое поле в одном из них
 * означает не ошибку сборки, а ДВА РАЗНЫХ ФИЛЬТРА ПОД ОДНИМ КЛЮЧОМ — то есть чужой ответ,
 * молча отданный из кэша.
 *
 * Список тем СОРТИРУЕТСЯ: [3,1] и [1,3] — один и тот же фильтр, и два ключа под ним означали
 * бы два запроса и две копии кэша на одну выдачу.
 */
function keyParts(f: FilesFilter) {
  const p = normalizePerson(f);
  const g = normalizeGrouping(f);
  return [
    [...f.topicIds].sort((a, b) => a - b).join(','),
    f.untopiced,
    f.search,
    p.id,
    p.role,
    g.project,
    g.role,
    g.withoutRole,
  ] as const;
}

export const filesKeys = {
  all: ['files'] as const,
  list: (f: FilesFilter) => [...filesKeys.all, 'list', ...keyParts(f), f.sort] as const,
  /**
   * Сколько ВСЕГО отвечает набору условий — для кнопок, которые предлагают фильтр пошире
   * («искать во всех темах (N)», «в любой роли (N)»).
   *
   * Порядка в ключе нет: сортировка на размер выдачи не влияет, и держи мы её здесь — смена
   * порядка перезапрашивала бы то же самое число.
   */
  total: (f: FilesFilter) => [...filesKeys.all, 'total', ...keyParts(f)] as const,
  /**
   * ОДНА СЕКЦИЯ РЕЖИМА ПРОЕКТА — своя ветка кэша, а не `list` с другим пределом.
   *
   * Под `list` лежит бесконечный запрос, и его данные — это `{pages, pageParams}`, а не
   * `{files, total}`. Положи мы сюда обычный `useQuery` под тем же ключом — два хука начали бы
   * писать в одну ячейку данные разной формы, и первый же переход «секции → плоская сетка»
   * отдал бы одному из них чужую структуру.
   */
  section: (f: FilesFilter) => [...filesKeys.all, 'section', ...keyParts(f), f.sort] as const,
  file: (id: number) => [...filesKeys.all, 'file', id] as const,
  /**
   * АРХИВ ВХОДИТ В КЛЮЧ, И ЭТО НЕ УКРАШЕНИЕ. Один и тот же хук зовут пять экранов, и они
   * спрашивают РАЗНОЕ: холст, полоса загрузки, пикер заметки и вложения задачи — «чем сузить
   * сетку» (архив там мешает), словарь тем — «что вообще заведено» (без архива он врёт: тема
   * никуда не делась, её убрали с глаз).
   *
   * Один ключ на два ответа означал бы, что первый пришедший экран кладёт свою версию в кэш, а
   * следующий получает чужую — молча и через раз. Ровно этот класс уже ловился в волне.
   */
  topics: (includeArchived = false) => [...filesKeys.all, 'topics', includeArchived] as const,
  /**
   * ПРОЕКТ В КЛЮЧЕ ОБЯЗАТЕЛЕН (0323), и это не украшение: у роли появился владелец, словари
   * двух проектов — РАЗНЫЕ ответы на один и тот же вопрос, и один ключ на них отдал бы чужой
   * набор слов. Тот же класс, которым архив разводит ключ у тем: первый пришедший экран кладёт
   * свою версию в кэш, следующий молча получает её же.
   *
   * `projectId = 0` — не «все проекты», а ИНДЕКС РАЗРЕШЕНИЯ старой ссылки (см. `useRoleIndex`):
   * ключ у него свой по тому же правилу, потому что и ответ у него свой.
   *
   * Архив по-прежнему в ключе: пикеры архив не предлагают, словарь — показывает.
   */
  roles: (projectId: number, includeArchived = false) =>
    [...filesKeys.all, 'roles', projectId, includeArchived] as const,
  /** Вещи, чья карточка показывает на эту тему. Спрашивается поштучно и только в модалках. */
  topicStyles: (topicId: number) => [...filesKeys.all, 'topicStyles', topicId] as const,
};

/**
 * ПРОТУХАНИЕ ПОСЛЕ ПРАВКИ ФАЙЛА — ДВУМЯ КОРНЯМИ, а не одним.
 *
 * Плитка файла рисуется не только на холсте: ту же `FileTile` показывают вложения карточки
 * задачи, и там она приезжает из `['tasks','detail',id]` — ключа, который `['files']` не
 * накрывает, потому что деревья не пересекаются. Пока корень был один, карточка задачи до
 * получаса держала СТАРЫЙ счётчик обсуждения и СТАРЫЙ БЕЙДЖ УРОВНЯ.
 *
 * ГРАНИЦА ОБЕЩАНИЯ — ВКЛАДКА, и это надо называть вслух, потому что главный путь к карточке
 * файла её пересекает: плитка вложения открывает карточку в СОСЕДНЕЙ вкладке
 * (`tasks/task-detail/attachment-tiles.tsx`), а у соседней вкладки свой `QueryClient`. Правка
 * уровня, сделанная там, здешний кэш не трогает никак: плитка в задаче будет говорить «вся
 * команда», пока страницу задачи не смонтируют заново. Синхронизации кэшей между вкладками в
 * приложении нет, и заводить её ради одного бейджа дороже, чем она стоит.
 *
 * Значит, эта функция закрывает ровно ОДИН случай — правку и просмотр в одной вкладке: экран
 * файлов и карточка задачи, открытые подряд по маршруту, обсуждение или уровень, изменённые с
 * витрины открытого доступа. Это не весь случай, но это тот, который дешевле починить, чем
 * объяснить.
 *
 * `refetchType: 'none'` намеренно: задачи нужно ПОМЕТИТЬ устаревшими, а не тянуть заново с
 * экрана файлов. Смонтированная карточка задачи перечитается сама, когда до неё дойдут; со
 * стороны файлов лишний поход в чужой раздел на каждую реплику был бы платой ни за что.
 *
 * Ключ задач взят из `tasksKeys.all` — импорт живой, чтобы переименование корня задач ломало
 * сборку здесь, а не молчало.
 */
export function invalidateFileViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: filesKeys.all });
  qc.invalidateQueries({ queryKey: tasksKeys.all, refetchType: 'none' });
  /**
   * ТРЕТИЙ КОРЕНЬ — БЛОК ПРОЕКТОВ НА КАРТОЧКЕ ВЕЩИ. Он живёт под `['fileStyleProjects', id]`,
   * то есть снаружи и `['files']`, и `['tasks']`, и держит ответ пять минут.
   *
   * Без этой строки экран противоречил тосту сразу после операции, о которой тост только что
   * отчитался числом: удалил проект, прочёл «3 garments lost the link», вернулся на карточку —
   * а там прежний проект, «open ▸» ведёт на удалённый id, и «unlink» упирается в отказ «either
   * the project or the style is gone».
   *
   * Ключ вписан СТРОКОЙ, а не импортом, и это осознанно: он принадлежит разделу тех-карт, а
   * тянуть сюда его модуль значило бы завести зависимость файлов от тех-карт ради одного
   * массива из двух элементов. Префикс без id накрывает все карточки разом — какая именно вещь
   * потеряла привязку, отсюда не видно и знать не нужно.
   */
  qc.invalidateQueries({ queryKey: ['fileStyleProjects'] });
}

const PAGE_SIZE = 60;

/**
 * staleTime is well under the 6h life of the presigned urls a response carries. A
 * cached page older than its urls would render broken thumbnails and dead download
 * links — the data would still be correct, which is exactly what makes that failure
 * confusing to look at.
 */
const URL_SAFE_STALE_TIME = 30 * 60 * 1000;

/**
 * `enabled` — ради ОДНОГО случая: холст читает словарь без архива, но проект в адресе законно
 * бывает архивным, и тогда его имя надо где-то взять. Второй запрос ради этого уходит только
 * тогда, когда имя действительно не нашлось, а не на каждый показ сетки.
 */
export function useFileTopics(includeArchived = false, enabled = true) {
  return useQuery({
    queryKey: filesKeys.topics(includeArchived),
    queryFn: () => filesService.listTopics(includeArchived),
    enabled,
    staleTime: URL_SAFE_STALE_TIME,
  });
}

/**
 * Словарь ролей ОДНОГО ПРОЕКТА. Живёт тем же `staleTime`, что и темы: это такой же редко
 * меняющийся справочник, который читают пять мест сразу.
 *
 * `projectId` первым и обязательным — тот же довод, что у `filesService.listRoles`: спросить
 * «какие бывают роли» вообще, ни у кого, больше нельзя. Вне проекта хук ГЛУШИТСЯ вызывающим
 * (`enabled`), а не отвечает пустотой: пустой словарь и «мы не спрашивали» — разные вещи, и
 * первое рисовало бы «ролей нет» там, где их просто не у кого было спросить.
 */
export function useFileRoles(projectId: number, includeArchived = false, enabled = true) {
  return useQuery({
    queryKey: filesKeys.roles(projectId, includeArchived),
    queryFn: () => filesService.listRoles(projectId, includeArchived),
    enabled,
    staleTime: URL_SAFE_STALE_TIME,
  });
}

/**
 * ИНДЕКС РАЗРЕШЕНИЯ СТАРОЙ ССЫЛКИ — единственный законный потребитель `ListFileRoles(0)`.
 *
 * До 0323 роль была общей на всю библиотеку, и в чат уехали адреса вида `/files?frole=7` без
 * проекта. Теперь роль принадлежит проекту, и такой адрес обязан ЛИБО дописать себе проект,
 * ЛИБО снять фильтр — но не показывать пустую сетку молча: «в этой роли ничего нет» и «этой
 * роли больше нет» выглядели бы одинаково, а значат разное.
 *
 * С архивом: заархивированная роль продолжает фильтровать, и разрешить её в проект надо ровно
 * так же. Индекс НЕ словарь — предлагать из него нельзя ничего (чужую роль сервер отвергает на
 * любой записи), поэтому и хук отдельный, со своим именем и своим ключом.
 */
export function useRoleIndex(enabled: boolean) {
  return useFileRoles(0, true, enabled);
}

/**
 * `enabled` НЕ УКРАШЕНИЕ: в режиме проекта плитки рисуют секции, и плоская выдача на 60 файлов
 * ушла бы вторым запросом за данными, которых никто не покажет.
 */
/**
 * Вещи темы — ТОЛЬКО чтобы назвать число до необратимого жеста.
 *
 * `enabled` здесь несущий: спрашивать этот список на каждой отрисовке экрана словаря значило бы
 * по запросу на строку таблицы. Он уходит ровно в момент открытия модалки удаления или
 * понижения — и только для темы-проекта: у обычного ярлыка привязок вещей не бывает, сервер их
 * не принимает вовсе.
 */
export function useFileTopicStyles(topicId: number, enabled: boolean) {
  return useQuery({
    queryKey: filesKeys.topicStyles(topicId),
    queryFn: () => topicsService.listStyles(topicId),
    enabled: enabled && topicId > 0,
    staleTime: URL_SAFE_STALE_TIME,
  });
}

export function useLibraryFiles(filter: FilesFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: filesKeys.list(filter),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      filesService.listFiles({
        ...toRequest(filter),
        limit: PAGE_SIZE,
        offset: pageParam as number,
      }),
    getNextPageParam: (lastPage, allPages) => {
      // Пустая страница при ненулевом total — это рассинхрон count и select под чужим
      // удалением. Без этой проверки offset не растёт, и каждое «показать ещё» подшивает
      // ещё одну пустую страницу, обещая продолжение, которого нет.
      if (!lastPage.files?.length) return undefined;
      const loaded = allPages.reduce((n, p) => n + (p.files?.length ?? 0), 0);
      const total = Number(lastPage.total ?? 0);
      return loaded < total ? loaded : undefined;
    },
    staleTime: URL_SAFE_STALE_TIME,
  });
}

/**
 * ВТОРОЙ СЧЁТ: сколько нашлось бы под ОСЛАБЛЕННЫМ фильтром.
 *
 * Спрашивается только тогда, когда узкий фильтр не нашёл ничего, — иначе это лишний запрос на
 * каждое нажатие клавиши. Ответ и есть число в кнопке пустого экрана: без него кнопка обещает
 * результат, которого может не быть.
 *
 * Ослабление передаётся ГОТОВЫМ фильтром, а не флажком «без тем»: положений у пустого экрана
 * два («искать во всех темах» снимает темы, «в любой роли» снимает роль), и оба обязаны считать
 * тем же условием, под которым потом покажут выдачу. Один хук на оба — единственный способ
 * этого не разойтись.
 */
export function useFilesTotal(filter: FilesFilter, enabled: boolean) {
  return useQuery({
    queryKey: filesKeys.total(filter),
    queryFn: () => filesService.listFiles({ ...toRequest(filter), limit: 1, offset: 0 }),
    enabled,
    staleTime: URL_SAFE_STALE_TIME,
  });
}

/* ── режим проекта: секции по ролям ───────────────────────────────────────────────────── */

/**
 * Сколько плиток показывает одна секция.
 *
 * СЕКЦИЯ НЕ ЛИСТАЕТСЯ. У проекта бывает две тысячи файлов, и «показать ещё» внутри каждой из
 * пяти секций означало бы пять независимых бесконечных лент на одном экране — с общим
 * выделением поверх них и без единого места, где написано, сколько всего. Секция показывает
 * начало и честно говорит размер; дальше — «показать все», то есть плоская сетка с той же
 * машиной листания, что была до всяких секций.
 */
export const SECTION_TILES = 12;

/** Что показывает одна секция. `withoutRole` — приёмная куча проекта. */
export type ProjectSectionSpec = {
  key: string;
  title: string;
  roleId: number;
  withoutRole: boolean;
  /** Роль в архиве: её нельзя назначить, но снять — можно, поэтому файлы под ней показываем. */
  archived?: boolean;
};

/**
 * СЕКЦИИ РЕЖИМА ПРОЕКТА — по одному запросу на секцию, и это главное решение всей фазы.
 *
 * Счётчик секции обязан быть `total` ТОГО ЖЕ ответа, которым нарисованы её плитки. Соблазн
 * сделать иначе велик: один «обзорный» запрос под поиском отдал бы все числа разом и сэкономил
 * четыре похода. Но он считает СВОИМ условием, а плитки рисуются другим, и первое же
 * расхождение (чужое удаление, предикат видимости, гонка кэша) даёт «исходники · 412» над
 * тремя плитками. Ровно этот дефект уже ловили на витрине, и в сторе про него стоит
 * комментарий: `total` считается тем же условием, что и страница.
 *
 * `useQueries`, а не список `useQuery` в цикле: словарь ролей приезжает асинхронно, число
 * секций меняется с 0 на N между двумя отрисовками — цикл хуков этого не переживёт.
 *
 * ЦЕНА НАЗВАНА ВСЛУХ, ПОТОМУ ЧТО ОНА РАСТЁТ СО СЛОВАРЁМ. Открытие проекта стоит
 * `specs.length` одновременных `listFiles`: сегодня это пять запросов, при двадцати ролях
 * будет двадцать один, и скелет ждёт самый медленный из них. Поиск умножает: каждая пауза
 * набора в режиме проекта перезапрашивает все секции разом. Это принятое решение, а не
 * упущенный предел — счётчик секции обязан быть `total` её собственного ответа, и один
 * обзорный запрос на все числа стоил бы того самого расхождения «412 над тремя плитками».
 * Но заболит при росте словаря именно это место, и чинить его надо будет серверной
 * группировкой (одна выдача, разложенная по ролям), а не сокращением числа секций.
 */
export function useProjectSections(
  base: FilesFilter,
  specs: ProjectSectionSpec[],
  enabled: boolean,
) {
  return useQueries({
    queries: specs.map((s) => {
      const f: FilesFilter = { ...base, roleId: s.roleId, withoutRole: s.withoutRole };
      return {
        queryKey: filesKeys.section(f),
        queryFn: () =>
          filesService.listFiles({ ...toRequest(f), limit: SECTION_TILES, offset: 0 }),
        enabled,
        staleTime: URL_SAFE_STALE_TIME,
      };
    }),
  });
}

export function useLibraryFile(id: number | undefined) {
  return useQuery({
    queryKey: filesKeys.file(id ?? 0),
    queryFn: () => filesService.getFile(id as number),
    enabled: !!id,
    staleTime: URL_SAFE_STALE_TIME,
  });
}

/** Every mutation invalidates both the grid and the rail: a topic change moves a file
 * between rails and shifts two counts, so refreshing one without the other leaves the
 * screen visibly disagreeing with itself.
 *
 * ЧЕРЕЗ `invalidateFileViews`, А НЕ ПО ОДНОМУ КОРНЮ. Здесь правят ровно то, что плитка
 * вложения задачи и показывает: имя файла (`updateFile`) и его темы (`assignTopics`). Свой
 * `invalidateQueries(filesKeys.all)` оставлял бы карточку задачи со старым именем и старым
 * набором тем — той же половинчатостью, из-за которой вторая инвалидация и появилась.
 * `deleteFile` тем более: удалённый файл обязан пропасть и из вложений. */
export function useFilesMutations() {
  const qc = useQueryClient();
  const invalidate = () => invalidateFileViews(qc);

  const updateFile = useMutation({
    mutationFn: filesService.updateFile,
    onSuccess: invalidate,
  });
  const deleteFile = useMutation({
    // ПОВТОР СНЯТ ТОЧЕЧНО. Глобальный `mutations.retry: 1` (см. `src/index.tsx`) шлёт второй
    // запрос на любой отказ: замерено, что 403 на удаление даёт ДВА DELETE подряд. На отказе
    // повтор не меняет ничего, а на обрыве связи он бьёт вторым разрушительным запросом по
    // файлу, который первый мог уже удалить, — и второй ответ («файла нет») человек прочтёт
    // как причину, по которой удаление не вышло.
    retry: 0,
    mutationFn: filesService.deleteFile,
    onSuccess: invalidate,
  });
  // `createTopic` здесь больше нет: тему заводят либо экраном тем (`topicsService.create`),
  // либо попутно — списком `newTopics` в самом сохранении файла. Мутация-сирота осталась от
  // третьего, снятого способа и только предлагала бы четвёртый путь к одной и той же записи.
  const assignTopics = useMutation({
    mutationFn: filesService.assignTopics,
    onSuccess: invalidate,
  });
  /**
   * Роль ходит ТЕМ ЖЕ путём, что и остальные правки: одна мутация на раздел, одна инвалидация.
   * Свой `invalidateQueries(filesKeys.all)` здесь оставил бы устаревшим счётчик самой роли
   * (`ListFileRoles` считает файлы этой роли В ЕЁ ПРОЕКТЕ) — он лежит под тем же корнем и
   * обновляется этой же строкой.
   */
  const setRoles = useMutation({
    mutationFn: filesService.setRoles,
    onSuccess: invalidate,
  });

  return { updateFile, deleteFile, assignTopics, setRoles, invalidate };
}
