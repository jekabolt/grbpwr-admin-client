// What a failed backend call says, read from the error api.ts throws.

export function errStatus(e: unknown): number {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : 0;
}

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message.toLowerCase() : '';
}

/** A refusal the person can fix (bad code, wrong password) — not the server being down. */
export function isRefusal(e: unknown): boolean {
  const s = errStatus(e);
  return s >= 400 && s < 500;
}

/** `#token=…` / `#code=…` from the address fragment. */
export function hashParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get(name) ?? '';
}

/** Drop the fragment so a one-time token never sits in history or a shared screenshot. */
export function clearHash(): void {
  if (typeof window === 'undefined' || !window.location.hash) return;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const EMAIL_KEY = 'lekalo.email';

export function rememberEmail(email: string): void {
  try {
    sessionStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* private window */
  }
}

export function rememberedEmail(): string {
  try {
    return sessionStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}
