import { adminService } from 'api/api';
import type {
  common_OrderFactor,
  LibraryFileSort,
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
    throw new Error("the connection dropped — the preview wasn't replaced");
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
      return 'the session expired — sign in again';
    case 403:
      return 'the files:write right is needed';
    case 404:
      return 'the file is gone';
    case 413:
      return 'the preview came out too big';
    default:
      return `the preview wasn't replaced (${status})`;
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
    }),
  getFile: (id: number) => adminService.GetLibraryFile({ id }),
  updateFile: (args: { id: number; fileName: string; topicIds: number[]; newTopics: string[] }) =>
    adminService.UpdateLibraryFile(args),
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
  listTopics: () => adminService.ListFileTopics({}),
  createTopic: (name: string, description = '') =>
    adminService.CreateFileTopic({ name, description }),
  renameTopic: (id: number, name: string, description = '') =>
    adminService.RenameFileTopic({ id, name, description }),
  deleteTopic: (id: number) => adminService.DeleteFileTopic({ id }),
};
