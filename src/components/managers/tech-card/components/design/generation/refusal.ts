/**
 * A REFUSED PRESS OF GENERATE, AS THE SCREEN MAY HONESTLY DESCRIBE IT.
 *
 * ONE READER FOR TWO HOOKS. `useStartRun` (FLAT) and `useStartDesignRun` (FABRIC RENDER, 3D,
 * ON MODEL, PATTERN) used to classify their own errors — the first kept EVERY error as a standing
 * refusal, the second sent a 409 to the snackbar and re-read the band instead. Same server, same
 * verb, two answers to «what does this error mean» — precisely where the studios start to disagree
 * about what a retry means. Both now ask here.
 *
 * WHAT IS KNOWN DEPENDS ON WHETHER THE SERVER ANSWERED, and the shape says so instead of hiding it
 * in a sentence:
 *   · `status` set — the server answered and refused. `words` are its own, verbatim; nothing was
 *     filed, and a refusal that concerns money says so in those words.
 *   · `status` null — no answer arrived (`Failed to fetch`, a timeout, a dropped connection:
 *     `api.ts` rethrows these with no status). The request MAY have reached the server and MAY have
 *     been filed and paid; the screen cannot know. What it does know is the idempotency key the press
 *     carried, and that the server files ONE run per `client_request_id` (UNIQUE — a repeat returns
 *     the existing row with OK, `internal/store/design/design.go`). So the honest sentence is not
 *     «nothing was charged» but «a repeat with nothing changed carries the same key and cannot pay
 *     twice» — which is why the key is part of this shape rather than a private of the ledger.
 */
export type RunRefusal = {
  /** The words that came back — the server's when it answered, the transport's when it did not. */
  words: string;
  /** HTTP status of the refusal, or null when no answer reached the client. */
  status: number | null;
  /** The `client_request_id` the refused press carried; the same intent replays the same id. */
  clientRequestId: string;
};

/** grpc-gateway maps `codes.Aborted` onto HTTP 409 — somebody else moved first. */
export function isAborted(error: unknown): boolean {
  return statusOf(error) === 409;
}

function statusOf(error: unknown): number | null {
  const s = (error as { status?: unknown } | null | undefined)?.status;
  return typeof s === 'number' && s > 0 ? s : null;
}

/**
 * The refusal to keep on screen, or null when the error is not a refusal of THIS press: a 409 is
 * the band having moved under the person, answered by re-reading it, not by a standing error.
 */
export function refusalFromError(error: unknown, clientRequestId: string): RunRefusal | null {
  if (isAborted(error)) return null;
  const words = (error as Error | null | undefined)?.message?.trim() || 'the run did not start';
  return { words, status: statusOf(error), clientRequestId };
}
