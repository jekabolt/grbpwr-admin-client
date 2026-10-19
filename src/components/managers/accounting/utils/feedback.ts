import {
  failureClassOfError,
  serverSentenceOf,
} from 'components/managers/tech-card/components/useTechCardAutosave';

/** The error's own sentence, else the fallback. */
export const errorText = (e: unknown, fallback?: string): string | undefined =>
  serverSentenceOf(e) ?? (e instanceof Error && e.message ? e.message : fallback);

/** A 4xx refusal of what was typed: belongs in the form, not a toast. */
export const isRefused = (e: unknown) => failureClassOfError(e) === 'refused';

/** A lost request (network, 5xx): retrying is meaningful. */
export const isTransient = (e: unknown) => failureClassOfError(e) === 'transient';

/** Short reason for `bad`: the status class of a failure with no place on the page. */
export const reasonOf = (e: unknown): string | undefined => {
  const cls = failureClassOfError(e);
  if (cls === 'transient') return 'no connection';
  if (cls === 'auth') return 'no access';
  if (cls === 'conflict') return 'conflict';
  return undefined;
};
