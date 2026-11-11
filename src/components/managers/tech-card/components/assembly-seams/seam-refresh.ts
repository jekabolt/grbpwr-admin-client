/**
 * One read of a card's seam list at a time, per card: writes queued on a card share its read, and a
 * card opened meanwhile never waits on — or trusts — another card's read. Resolves false when the
 * read failed, so the caller does not write a new row against a list it could not check.
 */
export function seamRefresher(read: (cardId: number) => Promise<void>) {
  const inFlight = new Map<number, Promise<boolean>>();
  return (cardId: number): Promise<boolean> => {
    const running = inFlight.get(cardId);
    if (running) return running;
    const next = read(cardId)
      .then(
        () => true,
        () => false,
      )
      .finally(() => inFlight.delete(cardId));
    inFlight.set(cardId, next);
    return next;
  };
}
