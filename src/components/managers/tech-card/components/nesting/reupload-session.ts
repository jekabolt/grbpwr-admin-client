// Две ручки перезалива DXF, которые живут дольше одного вызова: причина снимка для сохранения,
// несущего перезалив, и восстановление прошлой версии листа.
import { DELETE_SNAPSHOT_REASON } from './dxf-delete';
import { REUPLOAD_SNAPSHOT_REASON } from './dxf-reupload';

// ─── причина снимка: одна, на сохранение С ЭТИМ перезаливом ───────────────────────────────────
//
// Перезалив пишет форму, а сохраняет её автосейв когда-нибудь потом. Причина `dxf-reupload` едет
// ровно с тем сохранением, чей ПЕЙЛОАД несёт результат перезалива — новый url листа (у каждой
// загрузки свой). Привязка к пейлоаду, а не ко времени: сейв, который собрал данные ДО перезалива
// и дошёл до провода после (валидация, очередь), url не несёт — причину не берёт и не снимает.
// Снимается причина только удачным сейвом именно этого пейлоада (L4c).

// Удаление листа (L6b) взводится тем же механизмом, но наоборот: причина `dxf-delete` едет с
// сохранением, чей пейлоад УЖЕ НЕ несёт url удалённого листа. Сейв, собранный до удаления, этот url
// ещё несёт — причину не берёт. Сейв, несущий и перезалив, и удаление, едет с `dxf-delete`: снимок
// один (до сейва), и restore отменяет оба.

type Armed = {
  generation: number;
  reason: string;
  sheetUrl: string;
  /** true — сейв должен нести sheetUrl (перезалив); false — не должен (удаление) */
  carried: boolean;
};
const armed = new Map<number, Armed[]>();
let generation = 0;

/**
 * Перезалив применён на карточке `cardId`: строка листа получила `sheetUrl` вместо `replacedUrl`.
 * Взведённая ранее причина на `replacedUrl` (второй перезалив той же строки до сейва) поглощается
 * новой — того url в форме уже нет.
 */
export function armReuploadSnapshot(
  cardId: number | undefined,
  sheetUrl: string,
  replacedUrl?: string,
): void {
  if (!cardId || !sheetUrl) return;
  const list = (armed.get(cardId) ?? []).filter((a) => !a.carried || a.sheetUrl !== replacedUrl);
  list.push({
    generation: ++generation,
    reason: REUPLOAD_SNAPSHOT_REASON,
    sheetUrl,
    carried: true,
  });
  armed.set(cardId, list);
}

/**
 * Лист `removedUrl` удалён из формы карточки `cardId`. Перезалив этой строки, взведённый до сейва,
 * поглощается: его url в форме больше нет.
 */
export function armDeleteSnapshot(cardId: number | undefined, removedUrl: string): void {
  if (!cardId || !removedUrl) return;
  const list = (armed.get(cardId) ?? []).filter((a) => a.sheetUrl !== removedUrl);
  list.push({
    generation: ++generation,
    reason: DELETE_SNAPSHOT_REASON,
    sheetUrl: removedUrl,
    carried: false,
  });
  armed.set(cardId, list);
}

/**
 * Причина для сохранения с этим пейлоадом (`payloadUrls` — url листов, которые оно отправит);
 * null — пейлоад не несёт ни одного взведённого перезалива или удаления.
 */
export function peekReuploadSnapshot(
  cardId: number | undefined,
  payloadUrls: Iterable<string | undefined>,
): { reason: string; generations: number[] } | null {
  const list = cardId ? armed.get(cardId) : undefined;
  if (!list?.length) return null;
  const urls = new Set([...payloadUrls].filter(Boolean));
  const hits = list.filter((a) => urls.has(a.sheetUrl) === a.carried);
  if (!hits.length) return null;
  const reason = hits.some((a) => a.reason === DELETE_SNAPSHOT_REASON)
    ? DELETE_SNAPSHOT_REASON
    : REUPLOAD_SNAPSHOT_REASON;
  return { reason, generations: hits.map((a) => a.generation) };
}

/** Сохранение с этой причиной прошло — снять взведённое ровно для его пейлоада. */
export function consumeReuploadSnapshot(
  cardId: number | undefined,
  taken: { generations: readonly number[] } | null,
): void {
  if (!cardId || !taken) return;
  const done = new Set(taken.generations);
  const left = (armed.get(cardId) ?? []).filter((a) => !done.has(a.generation));
  if (left.length) armed.set(cardId, left);
  else armed.delete(cardId);
}

// ─── восстановление версии листа ─────────────────────────────────────────────────────────────
//
// ОДНА ТОЧКА ВХОДА для всех, кто восстанавливает: `restoreSheetVersion(rev)`. Восстанавливается
// только СНИМОК карточки этой версии (RestoreTechCardSnapshot, `snapshotId > 0`): карта, шаги и лист
// возвращаются целиком, призраки оживают. Повторной заливки старого файла нет (L4c): она не
// возвращала призраков, а заводила блоки новыми деталями. Версия без снимка не восстанавливается.

/** Версия листа из `history` строки выкройки + чья она. */
export type SheetRevisionRef = {
  /** lineKey строки выкройки, к которой относится версия */
  sheetLineKey: string;
  url: string;
  fileName?: string;
  revision?: number;
  sha256?: string;
  /** снимок карты при этой версии (TechCardPatternRevision.snapshot_id); 0/нет — не восстановить */
  snapshotId?: number;
};

export type RestoreOutcome = 'applied' | 'noop' | 'refused' | 'unavailable';

type Restorer = (rev: SheetRevisionRef) => Promise<RestoreOutcome>;
let restorer: Restorer | null = null;

/** Панель выкроек регистрирует свою реализацию на время монтирования. Возвращает отписку. */
export function provideSheetRestorer(fn: Restorer): () => void {
  restorer = fn;
  return () => {
    if (restorer === fn) restorer = null;
  };
}

/** Восстановить версию листа. 'unavailable' — панель выкроек не смонтирована. */
export function restoreSheetVersion(rev: SheetRevisionRef): Promise<RestoreOutcome> {
  return restorer ? restorer(rev) : Promise.resolve('unavailable');
}
