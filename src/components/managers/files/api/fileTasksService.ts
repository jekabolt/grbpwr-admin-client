import { adminService } from 'api/api';

/**
 * Задачи, которые держат файл.
 *
 * Связь двусторонняя, и это ЕДИНСТВЕННЫЙ конец, где субъект — файл: `/files/{id}/tasks`
 * отвечает на вопрос «где этот файл ещё используется». Обратный конец (вложения задачи) живёт
 * в разделе задач и трогать его отсюда нечем.
 *
 * Выдача НАМЕРЕННО содержит и архивные задачи. Удаление файла отказывает, называя держателем
 * в том числе архивную, — спрячь мы её здесь, отказ стал бы необъяснимым: человек читал бы
 * «файл прикреплён к задачам» над пустым списком.
 */
export const fileTasksService = {
  list: (fileId: number) => adminService.ListLibraryFileTasks({ id: fileId }),
  attach: (fileId: number, taskId: number) =>
    adminService.AttachLibraryFileToTask({ fileId, taskId }),
  detach: (fileId: number, taskId: number) =>
    adminService.DetachLibraryFileFromTask({ fileId, taskId }),
};
