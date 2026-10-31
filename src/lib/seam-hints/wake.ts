// WHEN THE HINTS RUN BY THEMSELVES (SPEC-F §5a). A card is "awake" for this tab once something the
// map depends on was written (a card save: operations, DXF; an archive import) or its construction
// screen was opened. The hook then fires one quiet Suggest per input fingerprint that has no run
// yet. The success handlers only wake the card: the input (and the atlas) is built where the
// parsed DXF lives, and the server asks the model only for what changed.

const awake = new Set<number>();
const fired = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export function wakeSeamHints(techCardId: number | undefined | null): void {
  if (!techCardId || awake.has(techCardId)) return;
  awake.add(techCardId);
  version += 1;
  for (const listener of listeners) listener();
}

export const isSeamHintsAwake = (techCardId: number | undefined) =>
  !!techCardId && awake.has(techCardId);

export function subscribeSeamHintsWake(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const seamHintsWakeVersion = () => version;

/** True the first time a fingerprint is claimed for an automatic run in this tab. */
export function claimAutoRun(techCardId: number, sig: string): boolean {
  const tag = `${techCardId}:${sig}`;
  if (fired.has(tag)) return false;
  fired.add(tag);
  return true;
}

/** Test seam only. */
export function resetSeamHintsWake(): void {
  awake.clear();
  fired.clear();
  version += 1;
}
