// Provider sign-in (Google, Apple): the start is a real top-level form POST to the API host, the
// end is `/auth/oauth#code=…` or `#error=<key>` on the root host (spec O §1).

import { currentHost, goToUrl, rootUrl } from 'lib/host';

import { stubTeamLogo } from './stub-logos';

export type Provider = 'google' | 'apple';

/** The fixed keys the callback may answer with (spec O §1, §12). */
export const OAUTH_ERRORS = [
  'cancelled',
  'expired',
  'unverified',
  'invite_mismatch',
  'disabled',
  'try_again',
  'use_password',
] as const;
export type OAuthError = (typeof OAUTH_ERRORS)[number];

export type OAuthReturn = { code: string } | { error: OAuthError } | null;

/** `#code=…` / `#error=…` → what came back; anything else (or an unknown key) reads as try_again. */
export function parseOAuthFragment(hash: string): OAuthReturn {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const code = p.get('code');
  if (code) return { code };
  const error = p.get('error');
  if (error === null) return null;
  return {
    error: (OAUTH_ERRORS as readonly string[]).includes(error)
      ? (error as OAuthError)
      : 'try_again',
  };
}

/**
 * The word the `log in` sheet shows for a key: only words the auth copy already has. Keys without
 * a word of their own get the generic `try again`.
 */
export function oauthErrorWord(key: OAuthError): string {
  return key === 'expired' ? 'link expired' : 'try again';
}

/** The API host, as every other auth call reaches it; `https://api.<base>` when the build has none. */
export function apiBase(): string {
  const env = String(import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
  if (env) return env;
  return `${typeof window === 'undefined' ? 'https:' : window.location.protocol}//api.${currentHost().base}`;
}

/** The public `GET /api/auth/team-logo/{slug}` (404 when the team has none). */
export function teamLogoUrl(slug: string): string {
  if (import.meta.env.DEV && import.meta.env.VITE_AUTH_STUB) return stubTeamLogo(slug);
  return `${apiBase()}/api/auth/team-logo/${encodeURIComponent(slug)}`;
}

export function oauthStartUrl(provider: Provider): string {
  return `${apiBase()}/api/auth/oauth/${provider}/start`;
}

/** Leave for the provider: a plain HTML form POST (never fetch), so the API can set its cookie. */
export function startProvider(provider: Provider, fields: Record<string, string>): void {
  if (import.meta.env.DEV && import.meta.env.VITE_AUTH_STUB) {
    // the dev stub has no API: land straight on the return page
    goToUrl(rootUrl('/auth/oauth#code=stub'));
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = oauthStartUrl(provider);
  form.style.display = 'none';
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
