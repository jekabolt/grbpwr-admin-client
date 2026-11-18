import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';

const sessions = new Map<number, PatternImportDxfPhaseEExactNAssemblyOrderSessionV2>();
const listeners = new Map<number, Set<() => void>>();
const retiredThroughLock = new Map<number, number>();

function notify(techCardId: number): void {
  for (const listener of listeners.get(techCardId) ?? []) listener();
}

export function storeExactNSeamProductionSession(
  techCardId: number,
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): boolean {
  const lock = session.current.row.cardLockVersion;
  if (!Number.isSafeInteger(lock) || lock <= (retiredThroughLock.get(techCardId) ?? -1))
    return false;
  sessions.set(techCardId, Object.freeze(session));
  notify(techCardId);
  return true;
}

export function readPatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
): PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 | null {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return null;
  return sessions.get(techCardId) ?? null;
}

export function subscribePatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return () => {};
  const current = listeners.get(techCardId) ?? new Set<() => void>();
  current.add(listener);
  listeners.set(techCardId, current);
  return () => {
    current.delete(listener);
    if (!current.size) listeners.delete(techCardId);
  };
}

/** Prevent an in-flight restore of the former saved document from publishing again. */
export function retireExactNSeamSessionsForDocumentWrite(
  techCardId: number,
  previousLockVersion: number,
): void {
  if (
    !Number.isSafeInteger(techCardId) ||
    techCardId < 1 ||
    !Number.isSafeInteger(previousLockVersion) ||
    previousLockVersion < 0 ||
    previousLockVersion <= (retiredThroughLock.get(techCardId) ?? -1)
  )
    return;
  retiredThroughLock.set(techCardId, previousLockVersion);
  const existing = sessions.get(techCardId);
  if (existing && existing.current.row.cardLockVersion <= previousLockVersion) {
    sessions.delete(techCardId);
    notify(techCardId);
  }
}

export function clearPatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
): void {
  if (!techCardId || !sessions.delete(techCardId)) return;
  notify(techCardId);
}
