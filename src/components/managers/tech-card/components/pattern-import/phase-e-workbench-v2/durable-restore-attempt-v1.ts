export type PatternImportDxfPhaseEDurableRestoreAttemptTicketV1 = {
  readonly key: string;
  readonly controller: AbortController;
  status: 'in-flight' | 'completed';
};

export type PatternImportDxfPhaseEDurableRestoreAttemptSlotV1 = {
  current: PatternImportDxfPhaseEDurableRestoreAttemptTicketV1 | null;
};

/** Starts one keyed attempt. A completed identical attempt is retained until its binding changes. */
export function beginPatternImportDxfPhaseEDurableRestoreAttemptV1(
  slot: PatternImportDxfPhaseEDurableRestoreAttemptSlotV1,
  key: string,
): PatternImportDxfPhaseEDurableRestoreAttemptTicketV1 | null {
  if (!key || slot.current?.key === key) return null;
  slot.current?.controller.abort();
  const ticket: PatternImportDxfPhaseEDurableRestoreAttemptTicketV1 = {
    key,
    controller: new AbortController(),
    status: 'in-flight',
  };
  slot.current = ticket;
  return ticket;
}

/** Marks success only if this exact effect ticket still owns the publication attempt. */
export function completePatternImportDxfPhaseEDurableRestoreAttemptV1(
  slot: PatternImportDxfPhaseEDurableRestoreAttemptSlotV1,
  ticket: PatternImportDxfPhaseEDurableRestoreAttemptTicketV1,
): boolean {
  if (slot.current !== ticket || ticket.status !== 'in-flight' || ticket.controller.signal.aborted)
    return false;
  ticket.status = 'completed';
  return true;
}

/**
 * Cancels one setup. Only its own still-in-flight ticket is cleared, so an older promise cannot
 * erase a StrictMode replay or a newer dependency-generation attempt with the same key.
 */
export function releasePatternImportDxfPhaseEDurableRestoreAttemptV1(
  slot: PatternImportDxfPhaseEDurableRestoreAttemptSlotV1,
  ticket: PatternImportDxfPhaseEDurableRestoreAttemptTicketV1,
): void {
  ticket.controller.abort();
  if (slot.current === ticket && ticket.status === 'in-flight') slot.current = null;
}
