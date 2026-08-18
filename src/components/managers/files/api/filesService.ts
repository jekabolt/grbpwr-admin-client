import { adminService } from 'api/api';
import type {
  common_OrderFactor,
  LibraryFileSort,
  LibraryFilePersonRole,
  ListLibraryFilesRequest,
} from 'api/proto-http/admin';

/**
 * Загрузка файла и замена превью НЕ идут через сгенерированный gRPC-клиент: тело —
 * multipart, а не поле сообщения. Этот модуль — единственное место клиента, которое ходит в
 * бэкенд мимо `adminService`.
 *
 * Сама загрузка живёт в `upload/transport.ts`, а не здесь: очереди нужен КОД ОТВЕТА (им и
 * только им обрыв связи отличается от отказа сервера), а готовая фраза об ошибке его теряет.
 */

/** Mirrors the server's own cap. Checked here so a person is refused in the file
 * picker rather than after minutes of uploading. */
export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

function authHeader(): string {
  const token = localStorage.getItem('authToken') ?? '';
  return token ? `Bearer ${token}` : '';
}

function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}

/**
 * ЗАМЕНА ПРЕВЬЮ у уже загруженного файла.
 *
 * Отдельный HTTP-эндпоинт по той же причине, что и загрузка: картинка — это multipart-тело,
 * а не поле gRPC-сообщения. Тело — ровно одна часть `preview`, лимит на сервере 2 МиБ.
 */
export async function uploadLibraryPreview(id: number, preview: Blob): Promise<void> {
  const form = new FormData();
  form.append('preview', preview, 'preview.webp');

  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/files/${id}/preview`), {
      method: 'POST',
      headers: { 'Grpc-Metadata-Authorization': authHeader() },
      body: form,
    });
  } catch {
    throw new Error('связь оборвалась — превью не заменилось');
  }
  if (res.ok) return;

  const body = await res.text().catch(() => '');
  throw new Error(previewErrorMessage(res.status, body));
}

/**
 * Слова про ПРЕВЬЮ, а не про загрузку файла.
 *
 * Заимствовать `uploadErrorMessage` здесь нельзя: у превью свой предел — 2 МиБ против 95 МБ
 * у файла, и общий обработчик 413 сообщал бы «файл больше 95 мб» про картинку в пару сотен
 * килобайт. Сервер называет причину сам, поэтому его слова идут первыми.
 */
function previewErrorMessage(status: number, body: string): string {
  const parsed = (() => {
    try {
      return JSON.parse(body)?.error as string | undefined;
    } catch {
      return undefined;
    }
  })();
  if (parsed) return parsed;
  switch (status) {
    case 401:
      return 'сессия истекла — войдите заново';
    case 403:
      return 'нужно право files:write';
    case 404:
      return 'файла больше нет';
    case 413:
      return 'превью получилось слишком большим';
    default:
      return `превью не заменилось (${status})`;
  }
}

export const filesService = {
  listFiles: (req: Partial<ListLibraryFilesRequest>) =>
    adminService.ListLibraryFiles({
      topicId: req.topicId ?? 0,
      untopiced: req.untopiced ?? false,
      search: req.search ?? '',
      limit: req.limit ?? 60,
      offset: req.offset ?? 0,
      orderFactor: (req.orderFactor ?? null) as common_OrderFactor,
      // Пересечение, а не объединение: файл обязан нести ВСЕ выбранные темы. Сузил выбор —
      // файлов стало меньше; это и есть то, ради чего чипы нажимают второй раз.
      topicIds: req.topicIds ?? [],
      sortBy: (req.sortBy ?? null) as LibraryFileSort,
      // ФИЛЬТР ПО ЧЕЛОВЕКУ БЬЁТ ПО ЖИВОМУ id АККАУНТА, а не по имени. Имя освобождается при
      // удалении аккаунта и достаётся следующему однофамильцу — на бэкенде это закрыто
      // отдельным тестом, и клиент обязан отдавать id, а не подставлять имя в `search`.
      //
      // Ноль = фильтра нет. Роль без человека сервер игнорирует, поэтому обнулять её здесь не
      // требуется, но и полагаться на роль как на самостоятельный фильтр нельзя.
      personId: req.personId ?? 0,
      personRole: (req.personRole ?? null) as LibraryFilePersonRole,
      // ГРУППИРОВКА. Проект — это тема с типом `project`, роль живёт на СТРОКЕ СВЯЗИ
      // «файл ↔ проект», а не меткой на файле: плоские метки теряют пару, и «съёмка ×
      // референс» находило бы файл, который был референсом в лукбуке. Молча.
      //
      // Поэтому роль без проекта бессмысленна, и сервер её игнорирует. `withoutRole` —
      // приёмник внутри проекта: «что я сюда положил и ещё не разобрал».
      projectTopicId: req.projectTopicId ?? 0,
      roleId: req.roleId ?? 0,
      withoutRole: req.withoutRole ?? false,
    }),
  getFile: (id: number) => adminService.GetLibraryFile({ id }),
  updateFile: (args: {
    id: number;
    fileName: string;
    topicIds: number[];
    newTopics: string[];
  }) => adminService.UpdateLibraryFile(args),
  deleteFile: (id: number) => adminService.DeleteLibraryFile({ id }),
  /**
   * ДОПИСЫВАЕТ темы пачке файлов, а не заменяет набор.
   *
   * Замена на пачке — это гонка с чужой правкой: выделение помнит темы на момент клика, а к
   * моменту отправки кто-то уже мог повесить свой ярлык, и «replace» стёр бы его молча.
   */
  assignTopics: (args: { fileIds: number[]; topicIds: number[]; newTopics: string[] }) =>
    adminService.AssignLibraryFileTopics(args),
  /**
   * ЗАМЕНЯЕТ набор владельцев файла целиком — это не «добавить владельца».
   *
   * Отправлять сюда пересечение текущих владельцев со списком `ListAdmins` НЕЛЬЗЯ: список
   * людей больше не содержит отключённых аккаунтов, и такое «очищение» молча сняло бы
   * владение с человека, который просто отключён. Набор берётся из самого файла
   * (`LibraryFile.owners`) и меняется только теми кликами, которые человек сделал.
   */
  setOwners: (fileId: number, adminIds: number[]) =>
    adminService.SetLibraryFileOwners({ fileId, adminIds }),
  // Архивные проекты копятся, роли нет: без архива ряд чипов растёт монотонно и со временем
  // делает холст хуже. Холст архив НЕ просит, экран словаря — просит.
  listTopics: (includeArchived = false) => adminService.ListFileTopics({ includeArchived }),
  /**
   * СЛОВАРЬ РОЛЕЙ ДЛЯ ХОЛСТА — без архива, по тому же правилу, что и темы выше.
   *
   * Архивную роль сервер разрешает СНЯТЬ, но не разрешает поставить заново. Предлагать её в
   * пикере значило бы предлагать жест, который отвечает отказом: архив тогда читался бы как
   * пожелание, а не как решение.
   */
  listRoles: (includeArchived = false) => adminService.ListFileRoles({ includeArchived }),
  /**
   * РОЛЬ ПАЧКЕ — В ОДНОМ ПРОЕКТЕ. Роль живёт на СТРОКЕ СВЯЗИ «файл ↔ проект», поэтому у этого
   * вызова три обязательных участника, а не два: без проекта роль ставить некуда.
   *
   * Файл, которого в проекте ещё не было, в него ПОПАДЁТ — строка связи создаётся здесь же.
   * Именно это и делает кнопку работающей на свежем броске.
   *
   * `roleId = 0` СНИМАЕТ роль, оставляя файл в проекте: «без роли» — законное состояние, это
   * приёмная куча внутри проекта, а не ошибка.
   */
  setRoles: (args: { fileIds: number[]; projectTopicId: number; roleId: number }) =>
    adminService.SetLibraryFileRoles(args),
  createTopic: (name: string, description = '') =>
    adminService.CreateFileTopic({ name, description }),
  renameTopic: (id: number, name: string, description = '') =>
    adminService.RenameFileTopic({ id, name, description }),
  deleteTopic: (id: number) => adminService.DeleteFileTopic({ id }),
};
