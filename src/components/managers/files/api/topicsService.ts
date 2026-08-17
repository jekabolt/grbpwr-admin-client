import { adminService } from 'api/api';

/**
 * Словарь тем — свой модуль, отдельно от `filesService`.
 *
 * Экран управления темами живёт своей жизнью: он не листает файлы и не грузит их, а
 * `filesService` не переименовывает и не сливает. Один общий модуль означал бы, что оба
 * экрана правят один файл каждый раз, когда меняется любой из них.
 */
export const topicsService = {
  /**
   * ЭКРАН СЛОВАРЯ ПРОСИТ АРХИВ, ХОЛСТ — НЕТ, и это не настройка, а разные вопросы.
   *
   * Холст спрашивает «чем сузить сетку», и заархивированный проект там только мешает.
   * Словарь спрашивает «что у нас вообще заведено», и без архива он врёт: тема никуда не
   * делась, её просто убрали с глаз. Поэтому умолчание здесь ПРОТИВОПОЛОЖНО умолчанию
   * `filesService.listTopics` — и это осознанно, а не рассинхрон.
   */
  list: (includeArchived = true) => adminService.ListFileTopics({ includeArchived }),
  /** Имя И описание одним вызовом: описание — это то, что объясняет новичку, что сюда класть. */
  create: (name: string, description = '') => adminService.CreateFileTopic({ name, description }),
  /** Один диалог правит и имя, и описание — контракт принимает оба поля вместе. */
  rename: (id: number, name: string, description = '') =>
    adminService.RenameFileTopic({ id, name, description }),
  remove: (id: number) => adminService.DeleteFileTopic({ id }),
  /**
   * Слияние — единственный выход из дублей свободного словаря («бирки» и «бирка»).
   * Удаление отказывает на непустой теме, а сливать надо ровно такую: связи переезжают на
   * цель, источник исчезает. Обратно не разбирается.
   */
  merge: (sourceId: number, targetId: number) =>
    adminService.MergeFileTopics({ sourceId, targetId }),
};
