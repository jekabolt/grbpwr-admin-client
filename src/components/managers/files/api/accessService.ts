import { adminService } from 'api/api';

/**
 * Доступ к файлу: три уровня, список людей, публичная ссылка и журнал.
 *
 * УРОВЕНЬ ОДИН. `team | people | link` — не три тумблера, а три положения одного
 * переключателя: иначе получился бы файл, одновременно ограниченный тремя людьми и открытый
 * всему интернету. Сервер отвергает любое другое значение, а не толкует его.
 */
export type AccessLevel = 'team' | 'people' | 'link';

export const ACCESS_LEVELS: AccessLevel[] = ['team', 'people', 'link'];

/**
 * Слова уровня. Заголовок отвечает «кто увидит», пояснение — «что при этом произойдёт», и
 * второе важнее: «только эти люди» звучит как сужение списка, а на деле файл ПРОПАДАЕТ у
 * остальных отовсюду — из сетки, из поиска, из счётчиков тем и из чужой задачи.
 */
export const ACCESS_LEVEL_TITLE: Record<AccessLevel, string> = {
  team: 'вся команда',
  people: 'только эти люди',
  link: 'по ссылке',
};

export const ACCESS_LEVEL_HINT: Record<AccessLevel, string> = {
  team: 'все, у кого есть доступ к разделу «файлы». так открыт файл по умолчанию.',
  people:
    'остальные не увидят файл нигде: ни в теме, ни в поиске, ни в счётчиках, ни в задаче, к которой он прикреплён.',
  link: 'кто угодно со ссылкой, без входа в админку. ссылку можно переслать дальше — и её перешлют.',
};

/** Бейдж уровня на плитке. У `team` бейджа нет: обычное состояние не помечают. */
export const ACCESS_LEVEL_BADGE: Record<AccessLevel, string> = {
  team: '',
  people: 'ограничен',
  link: 'по ссылке',
};

export function asAccessLevel(value: string | undefined): AccessLevel | undefined {
  return value === 'team' || value === 'people' || value === 'link' ? value : undefined;
}

/**
 * Срок жизни публичной ссылки — ЦЕЛОЕ ЧИСЛО ЧАСОВ, 0 = бессрочно.
 *
 * Набор фиксирован: часы едут через json-шлюз обычным числом, и произвольное поле «сколько
 * дней» здесь было бы способом ошибиться на порядок в единственном действии раздела, которое
 * видно за пределами команды.
 */
export const LINK_TTLS: { hours: number; label: string }[] = [
  { hours: 24, label: '24 часа' },
  { hours: 168, label: '7 дней' },
  { hours: 720, label: '30 дней' },
  { hours: 0, label: 'бессрочно' },
];

export const accessService = {
  get: (fileId: number) => adminService.GetLibraryFileAccess({ id: fileId }),
  /**
   * ПОЛНАЯ ЗАМЕНА состояния доступа: уровень, набор людей и срок ссылки едут одним сообщением
   * и применяются атомарно. `adminIds` читается только на уровне `people`, `linkTtl` — только
   * на `link`, но не стирается при переключении: team → people → team не заставляет человека
   * набирать список заново.
   */
  set: (args: { fileId: number; level: AccessLevel; adminIds: number[]; linkTtl: number }) =>
    adminService.SetLibraryFileAccess(args),
  /**
   * Пересоздание ссылки — ЭТО ОТЗЫВ СТАРОЙ, а не «обновление адреса». К моменту ответа старая
   * ссылка уже мертва, и тот, кому её переслали, получит 404. Ради этого её и пересоздают.
   */
  rotate: (fileId: number) => adminService.RotateLibraryFileLink({ fileId }),
  /** Витрина открытого наружу: всё, что сейчас `people` или `link`. */
  listShared: (args: { level?: AccessLevel | ''; limit?: number; offset?: number }) =>
    adminService.ListSharedLibraryFiles({
      level: args.level ?? '',
      limit: args.limit ?? 50,
      offset: args.offset ?? 0,
    }),
};
