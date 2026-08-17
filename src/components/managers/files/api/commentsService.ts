import { adminService } from 'api/api';

/**
 * Обсуждение файла — плоская лента реплик, без веток и без ответов на реплику.
 *
 * Правит и удаляет реплику ТОЛЬКО её автор (супер — любую), и проверяет это сервер. Интерфейс
 * повторяет то же правило, но не вместо сервера, а чтобы не показывать кнопку, которая
 * гарантированно ответит отказом.
 *
 * `@упоминания` сервер не разбирает: он хранит ровно набранный текст. Подсветка и подстановка
 * целиком клиентские — и потому подсвечивается только тот, кто действительно есть в
 * `ListAdmins`: выдуманное имя должно остаться обычным текстом, а не обещать несуществующего
 * человека.
 */
export const commentsService = {
  list: (fileId: number) => adminService.ListLibraryFileComments({ id: fileId }),
  add: (fileId: number, body: string) => adminService.AddLibraryFileComment({ fileId, body }),
  update: (id: number, body: string) => adminService.UpdateLibraryFileComment({ id, body }),
  remove: (id: number) => adminService.DeleteLibraryFileComment({ id }),
};
