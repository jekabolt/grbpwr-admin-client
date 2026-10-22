import { interliningIdentityKey } from './interlining-import';

const memory = new Map<string, Set<string>>();
const storageKey = (techCardId: number, slotLineKey: string) =>
  `grbpwr.interlining-skips.v1.${techCardId}.${slotLineKey}`;

export function readInterliningSkips(
  techCardId: number | undefined,
  slotLineKey: string,
): Set<string> {
  if (!techCardId || !slotLineKey) return new Set();
  const key = storageKey(techCardId, slotLineKey);
  const cached = memory.get(key);
  if (cached) return new Set(cached);
  let values: string[] = [];
  try {
    const raw = globalThis.localStorage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      values = parsed.filter((value): value is string => typeof value === 'string');
    }
  } catch {
    // Best effort: the in-memory copy still remembers decisions for this page session.
  }
  const next = new Set(values.map(interliningIdentityKey).filter(Boolean));
  memory.set(key, next);
  return new Set(next);
}

export function writeInterliningSkips(
  techCardId: number | undefined,
  slotLineKey: string,
  identities: Iterable<string>,
): void {
  if (!techCardId || !slotLineKey) return;
  const key = storageKey(techCardId, slotLineKey);
  const next = new Set([...identities].map(interliningIdentityKey).filter(Boolean));
  memory.set(key, next);
  try {
    if (next.size > 0) globalThis.localStorage?.setItem(key, JSON.stringify([...next]));
    else globalThis.localStorage?.removeItem(key);
  } catch {
    // Best effort: the in-memory copy still remembers decisions for this page session.
  }
}
