import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';

const sessions = new Map<number, PatternImportDxfPhaseEExactNAssemblyOrderSessionV2>();
const listeners = new Map<number, Set<() => void>>();
const retirementListeners = new Map<number, Set<() => void>>();
const retiredThroughLock = new Map<number, number>();

export function isExactNSeamDocumentLockCurrent(techCardId: number, lock: number): boolean {
  return Number.isSafeInteger(lock) && lock > (retiredThroughLock.get(techCardId) ?? -1);
}

export function storeExactNSeamProductionSession(
  techCardId: number,
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): boolean {
  const lock = session.current.row.cardLockVersion;
  if (!isExactNSeamDocumentLockCurrent(techCardId, lock)) return false;
  sessions.set(techCardId, Object.freeze(session));
  notify(listeners, techCardId);
  return true;
}

export function readPatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
): PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 | null {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return null;
  return sessions.get(techCardId) ?? null;
}

function notify(subscribers: Map<number, Set<() => void>>, techCardId: number): void {
  for (const listener of subscribers.get(techCardId) ?? []) listener();
}

function subscribe(
  subscribers: Map<number, Set<() => void>>,
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return () => {};
  const current = subscribers.get(techCardId) ?? new Set<() => void>();
  current.add(listener);
  subscribers.set(techCardId, current);
  return () => {
    current.delete(listener);
    if (!current.size) subscribers.delete(techCardId);
  };
}

export function subscribePatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  return subscribe(listeners, techCardId, listener);
}

export function subscribeExactNSeamDocumentRetirement(
  techCardId: number,
  listener: () => void,
): () => void {
  return subscribe(retirementListeners, techCardId, listener);
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
    notify(listeners, techCardId);
  }
  notify(retirementListeners, techCardId);
}

export function clearPatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
): void {
  if (!techCardId || !sessions.delete(techCardId)) return;
  notify(listeners, techCardId);
}
