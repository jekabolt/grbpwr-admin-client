import { adminService } from 'api/api';
import type {
  common_OrderFactor,
  LibraryFile,
  LibraryFileSort,
  ListLibraryFilesRequest,
} from 'api/proto-http/admin';

/**
 * Upload does NOT go through the generated gRPC client: a file cannot fit inside one
 * gRPC message, so the backend exposes it as a plain multipart POST. This module is
 * the only place in the client that talks to the backend outside `adminService`.
 */

/** Mirrors the server's own cap. Checked here so a person is refused in the file
 * picker rather than after minutes of uploading. */
export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

export type UploadMeta = {
  file_name: string;
  topic_ids: number[];
  new_topics: string[];
};

export type UploadResult = {
  file: LibraryFile;
  duplicates: { id: number; file_name: string }[];
};

function authHeader(): string {
  const token = localStorage.getItem('authToken') ?? '';
  return token ? `Bearer ${token}` : '';
}

function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}

function uploadUrl(): string {
  return apiUrl('/api/files/upload');
}

/**
 * Turns a failed upload into something a person can act on.
 *
 * The awkward case is status 0: an aborted or severed connection, which is also what
 * an infrastructure body-size ceiling looks like from the browser. It must not read
 * as "unknown error" — of the two causes, one is retryable and the other means the
 * file is simply too big for this path, and the message has to leave room for both.
 */
function uploadErrorMessage(status: number, body: string): string {
  const parsed = (() => {
    try {
      return JSON.parse(body)?.error as string | undefined;
    } catch {
      return undefined;
    }
  })();
  switch (status) {
    case 0:
      return 'connection dropped — the file was not uploaded. try again, or use a smaller file';
    case 401:
      return 'session expired — sign in again';
    case 403:
      return 'you do not have permission to upload files';
    case 413:
      return `file is larger than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} mb`;
    default:
      return parsed || `upload failed (${status})`;
  }
}

/**
 * Streams one file to the backend.
 *
 * XHR rather than fetch because only XHR reports upload progress, and a 90 mb file
 * with no progress bar is indistinguishable from a frozen tab.
 *
 * The parts go in a fixed order — meta, file, preview — because the server reads them
 * sequentially without buffering to disk. Appending them to FormData in this order is
 * what guarantees the wire order.
 */
export function uploadLibraryFile(args: {
  file: File;
  meta: UploadMeta;
  preview?: Blob | null;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<UploadResult> {
  const { file, meta, preview, onProgress, signal } = args;

  return new Promise<UploadResult>((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error(uploadErrorMessage(413, '')));
      return;
    }
    const form = new FormData();
    form.append('meta', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', file, file.name);
    if (preview) form.append('preview', preview, 'preview.webp');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl(), true);
    xhr.setRequestHeader('Grpc-Metadata-Authorization', authHeader());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error('the server returned a response the app could not read'));
        }
        return;
      }
      reject(new Error(uploadErrorMessage(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error(uploadErrorMessage(0, '')));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
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

  const res = await fetch(apiUrl(`/api/files/${id}/preview`), {
    method: 'POST',
    headers: { 'Grpc-Metadata-Authorization': authHeader() },
    body: form,
  });
  if (res.ok) return;

  const body = await res.text().catch(() => '');
  throw new Error(uploadErrorMessage(res.status, body));
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
  listTopics: () => adminService.ListFileTopics({}),
  createTopic: (name: string, description = '') =>
    adminService.CreateFileTopic({ name, description }),
  renameTopic: (id: number, name: string, description = '') =>
    adminService.RenameFileTopic({ id, name, description }),
  deleteTopic: (id: number) => adminService.DeleteFileTopic({ id }),
};
