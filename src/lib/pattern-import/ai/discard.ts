// A9 (Codex re-check #2) · the renders an AI call uploads are not kept. Every upload is tracked;
// when the call is over (answered, failed, timed out) each one is deleted — also an upload that
// completes AFTER the timeout, the moment it settles. A failed delete is retried once; what is still
// left is logged (devtools console, `mediaLeftovers()`) for the backend sweep. Main thread; the
// delete itself is injected (`Discard`), so probes never reach the network.

/** Delete these media; resolves to the ids it could NOT delete. */
export type Discard = (mediaIds: number[]) => Promise<number[]>;

const left: number[] = [];
/** Media ids this tab could not delete (for the sweep; shown in the console when they happen). */
export const mediaLeftovers = () => [...left];

/** Delete, retry the failures once, log the rest. Resolves to the ids left behind. */
export async function discardMedia(
  ids: readonly number[],
  discard: Discard,
  label: string,
): Promise<number[]> {
  if (!ids.length) return [];
  const all = [...new Set(ids)];
  let failed = await discard(all).catch(() => all);
  if (failed.length) failed = await discard(failed).catch(() => failed);
  if (failed.length) {
    left.push(...failed);
    console.warn(
      `[pattern-import] ${label}: ${failed.length} uploaded media could not be deleted — ids ${failed.join(', ')} (left for the backend sweep)`,
    );
  }
  return failed;
}

/** Every upload of one AI call; `close()` deletes them all, and any that settles later. */
export class UploadTracker {
  private ids = new Set<number>();
  private pending = new Set<Promise<number[]>>();
  closed = false;

  constructor(
    private readonly discard: Discard | undefined,
    private readonly label: string,
  ) {}

  /** The upload, tracked: its id is deleted when the call is over, whenever it arrives. */
  track(upload: Promise<number>): Promise<number> {
    return upload.then((id) => {
      if (id > 0) {
        if (this.closed) this.drop([id]);
        else this.ids.add(id);
      }
      return id;
    });
  }

  /** The call is over: delete what went up; later arrivals are deleted as they settle. */
  close() {
    this.closed = true;
    const ids = [...this.ids];
    this.ids.clear();
    this.drop(ids);
  }

  /** Probes: every delete started so far, settled. */
  async settled() {
    await Promise.all([...this.pending]);
  }

  private drop(ids: number[]) {
    if (!this.discard || !ids.length) return;
    const p = discardMedia(ids, this.discard, this.label);
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }
}
