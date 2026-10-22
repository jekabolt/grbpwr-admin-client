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
 * Swap the file of sheet row `at` in place (set units, a legacy PDF row → DXF): the new file's
 * url/filename/size/digest, version 0 ("assign one"), and the snapshot reason armed for the save
 * whose payload carries the new url — the replaced file is archived with a restorable card snapshot.
 */
export function swapSheetFile(
  cardId: number | undefined,
  set: (path: string, value: unknown) => void,
  at: number,
  replacedUrl: string | undefined,
  up: { url: string; filename: string; sizeBytes: number; sha256?: string },
  extra: Record<string, unknown> = {},
): void {
  set(`patterns.${at}.url`, up.url);
  set(`patterns.${at}.filename`, up.filename);
  set(`patterns.${at}.sizeBytes`, up.sizeBytes);
  // The new file's digest, never the old one's (0423).
  set(`patterns.${at}.sha256`, up.sha256 ?? '');
  for (const [k, v] of Object.entries(extra)) set(`patterns.${at}.${k}`, v);
  // 0 = "assign one": the server numbers a url it has not seen on this card.
  set(`patterns.${at}.version`, 0);
  set(`patterns.${at}.uploadedAt`, '');
  armReuploadSnapshot(cardId, up.url, replacedUrl);
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

// ─── хвост удаления швов после удаления листа ────────────────────────────────────────────────

const seamDeleteRetries = new Map<number, Set<string>>();
const seamDeleteKey = (cardId: number) => `plm.techcard.seam-delete.v1.${cardId}`;

function storedSeamDeleteRetries(cardId: number): Set<string> {
  const cached = seamDeleteRetries.get(cardId);
  if (cached) return cached;
  let keys: string[] = [];
  try {
    const raw = globalThis.localStorage?.getItem(seamDeleteKey(cardId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed))
      keys = parsed.filter((x): x is string => typeof x === 'string' && !!x);
  } catch {
    // Memory still carries the retry when storage is unavailable or corrupt.
  }
  const next = new Set(keys);
  seamDeleteRetries.set(cardId, next);
  return next;
}

function storeSeamDeleteRetries(cardId: number, keys: ReadonlySet<string>): void {
  try {
    if (keys.size)
      globalThis.localStorage?.setItem(seamDeleteKey(cardId), JSON.stringify([...keys]));
    else globalThis.localStorage?.removeItem(seamDeleteKey(cardId));
  } catch {
    // Best effort: the module copy still retries for this page session.
  }
}

/** A post-save seam cascade failed. Keep every missing key until an RPC accepts it. */
export function armSeamDeleteRetry(cardId: number | undefined, seamKeys: Iterable<string>): void {
  if (!cardId) return;
  const pending = storedSeamDeleteRetries(cardId);
  for (const key of seamKeys) if (key) pending.add(key);
  storeSeamDeleteRetries(cardId, pending);
}

/** The seam keys whose cascade must run after this card next saves. */
export function peekSeamDeleteRetry(cardId: number | undefined): string[] {
  return cardId ? [...storedSeamDeleteRetries(cardId)] : [];
}

/** One retry landed; do not consume keys added while its RPC was in flight. */
export function consumeSeamDeleteRetry(
  cardId: number | undefined,
  seamKeys: Iterable<string>,
): void {
  if (!cardId) return;
  const pending = storedSeamDeleteRetries(cardId);
  for (const key of seamKeys) pending.delete(key);
  if (!pending.size) seamDeleteRetries.delete(cardId);
  storeSeamDeleteRetries(cardId, pending);
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

const sheetRestoreAt = new Map<number, number>();
const sheetRestoreKey = (cardId: number) => `plm.techcard.sheet-restore-at.v1.${cardId}`;

/** Remember the server time of a restore so markers made against the replaced geometry go stale. */
export function noteSheetRestore(cardId: number | undefined, restoredAt?: string): void {
  if (!cardId) return;
  const parsed = restoredAt ? new Date(restoredAt).getTime() : NaN;
  const at = Number.isFinite(parsed) ? parsed : Date.now();
  sheetRestoreAt.set(cardId, Math.max(sheetRestoreAt.get(cardId) ?? 0, at));
  try {
    globalThis.localStorage?.setItem(sheetRestoreKey(cardId), String(sheetRestoreAt.get(cardId)));
  } catch {
    // Best effort: the module copy still protects this page session.
  }
}

export function lastSheetRestoreAt(cardId: number | undefined): number | null {
  if (!cardId) return null;
  const cached = sheetRestoreAt.get(cardId);
  if (cached != null) return cached;
  let stored = NaN;
  try {
    stored = Number(globalThis.localStorage?.getItem(sheetRestoreKey(cardId)) ?? '');
  } catch {
    // No persisted restore marker in this browser.
  }
  if (!Number.isFinite(stored) || stored <= 0) return null;
  sheetRestoreAt.set(cardId, stored);
  return stored;
}

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
