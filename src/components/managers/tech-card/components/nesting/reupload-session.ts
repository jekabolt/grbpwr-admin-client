// Две ручки перезалива DXF, которые живут дольше одного вызова: причина снимка для ПЕРВОГО
// сохранения после перезалива и восстановление прошлой версии листа.
import { REUPLOAD_SNAPSHOT_REASON } from './dxf-reupload';

// ─── причина снимка: одна, на первое сохранение ──────────────────────────────────────────────
//
// Перезалив пишет форму, а сохраняет её автосейв когда-нибудь потом. Первое удачное сохранение
// карточки после перезалива несёт `snapshotReason: 'dxf-reupload'` — и только оно. Поколение
// нужно, чтобы удачный сейв, улетевший ДО второго перезалива, не снял причину второго.

const armed = new Map<number, number>();
let generation = 0;

/** Перезалив применён на карточке `cardId`: следующее сохранение несёт причину снимка. */
export function armReuploadSnapshot(cardId: number | undefined): void {
  if (!cardId) return;
  armed.set(cardId, ++generation);
}

/** Причина для сохранения, которое сейчас уйдёт; null — причины нет. */
export function peekReuploadSnapshot(
  cardId: number | undefined,
): { reason: string; generation: number } | null {
  const g = cardId ? armed.get(cardId) : undefined;
  return g === undefined ? null : { reason: REUPLOAD_SNAPSHOT_REASON, generation: g };
}

/** Сохранение с этой причиной прошло — снять её (если за это время не взвели новую). */
export function consumeReuploadSnapshot(
  cardId: number | undefined,
  taken: { generation: number } | null,
): void {
  if (!cardId || !taken) return;
  if (armed.get(cardId) === taken.generation) armed.delete(cardId);
}

// ─── восстановление версии листа ─────────────────────────────────────────────────────────────
//
// ОДНА ТОЧКА ВХОДА для всех, кто восстанавливает: `restoreSheetVersion(rev)`. Сегодня это
// повторная заливка старого файла тем же путём, что и загрузка (reapplySheet в панели выкроек, —
// новая ревизия, метки на шагах); завтра — серверный RPC восстановления снимка. Вызывающие при
// этой замене не меняются.

/** Версия листа из `history` строки выкройки + чья она. */
export type SheetRevisionRef = {
  /** lineKey строки выкройки, к которой относится версия */
  sheetLineKey: string;
  url: string;
  fileName?: string;
  revision?: number;
  sha256?: string;
  /** снимок карты при этой версии (TechCardPatternRevision.snapshot_id); 0/нет — только перезаливка */
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
