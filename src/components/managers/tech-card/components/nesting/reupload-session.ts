// Две ручки перезалива DXF, которые живут дольше одного вызова: причина снимка для сохранения,
// несущего перезалив, и восстановление прошлой версии листа.
import { REUPLOAD_SNAPSHOT_REASON } from './dxf-reupload';

// ─── причина снимка: одна, на сохранение С ЭТИМ перезаливом ───────────────────────────────────
//
// Перезалив пишет форму, а сохраняет её автосейв когда-нибудь потом. Причина `dxf-reupload` едет
// ровно с тем сохранением, чей ПЕЙЛОАД несёт результат перезалива — новый url листа (у каждой
// загрузки свой). Привязка к пейлоаду, а не ко времени: сейв, который собрал данные ДО перезалива
// и дошёл до провода после (валидация, очередь), url не несёт — причину не берёт и не снимает.
// Снимается причина только удачным сейвом именно этого пейлоада (L4c).

type Armed = { generation: number; sheetUrl: string };
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
  const list = (armed.get(cardId) ?? []).filter((a) => a.sheetUrl !== replacedUrl);
  list.push({ generation: ++generation, sheetUrl });
  armed.set(cardId, list);
}

/**
 * Причина для сохранения с этим пейлоадом (`payloadUrls` — url листов, которые оно отправит);
 * null — пейлоад не несёт ни одного взведённого перезалива.
 */
export function peekReuploadSnapshot(
  cardId: number | undefined,
  payloadUrls: Iterable<string | undefined>,
): { reason: string; generations: number[] } | null {
  const list = cardId ? armed.get(cardId) : undefined;
  if (!list?.length) return null;
  const urls = new Set([...payloadUrls].filter(Boolean));
  const hits = list.filter((a) => urls.has(a.sheetUrl));
  return hits.length
    ? { reason: REUPLOAD_SNAPSHOT_REASON, generations: hits.map((a) => a.generation) }
    : null;
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
