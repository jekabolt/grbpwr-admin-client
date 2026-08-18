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
 * второе важнее: «only these people» звучит как сужение списка, а на деле файл ПРОПАДАЕТ у
 * остальных отовсюду — из сетки, из поиска, из счётчиков тем и из чужой задачи.
 */
export const ACCESS_LEVEL_TITLE: Record<AccessLevel, string> = {
  team: 'the whole team',
  people: 'only these people',
  link: 'by link',
};

export const ACCESS_LEVEL_HINT: Record<AccessLevel, string> = {
  team: 'everyone who has access to the “files” section. this is how a file is open by default.',
  people:
    "the rest won't see the file anywhere: not in a topic, not in search, not in the counters, not in the task it is attached to.",
  link: 'anyone with the link, without signing in to the admin. the link can be forwarded on — and it will be.',
};

/**
 * БЕЙДЖ УРОВНЯ — ОДИН ИСТОЧНИК НА ТРИ ЭКРАНА: плитка холста, строка витрины открытого и шапка
 * блока доступа в карточке. Слово, цвет и подсказка едут вместе, потому что расходятся они
 * тоже вместе: пока они были вписаны строками в каждый экран, «restricted» и «by link» жили в
 * трёх местах, и переименование одного из них никак не помечало два других.
 *
 * У `team` бейджа нет вовсе: обычное состояние не помечают, иначе бейдж перестаёт что-либо
 * значить. Отсюда `undefined`, а не пустая строка — пустую строку можно нечаянно нарисовать.
 */
export const ACCESS_LEVEL_BADGE: Record<
  AccessLevel,
  { label: string; tone: 'attention' | 'ink'; title: string } | undefined
> = {
  team: undefined,
  people: {
    label: 'restricted',
    tone: 'ink',
    title: 'the file is visible only to the listed people',
  },
  link: { label: 'by link', tone: 'attention', title: 'the file is open by a public link' },
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
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
  { hours: 0, label: 'no expiry' },
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
