import { currentHost } from 'lib/host';

// The one place that reads the session token and builds the headers every backend call carries.
// The token lives in this origin's localStorage: each team host keeps its own session.

const KEY = 'authToken';

export function readAuthToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeAuthToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private window: the session lasts this tab only */
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

/** `Bearer <token>`, or '' when signed out. */
export function bearer(): string {
  const token = readAuthToken();
  return token ? `Bearer ${token}` : '';
}

/**
 * The team this tab talks to. A team host names it; a legacy host sends `VITE_DEFAULT_TEAM` only when
 * the build sets it, so a build without it (admin.beta.grbpwr.com today) sends exactly the headers
 * it always did.
 */
export function teamHeader(): string {
  const h = currentHost();
  return h.kind === 'team' || h.kind === 'legacy' ? h.slug : '';
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const auth = bearer();
  if (auth) headers['Grpc-Metadata-Authorization'] = auth;
  const team = teamHeader();
  if (team) headers['Grpc-Metadata-X-Team'] = team;
  return headers;
}

/** Just the team header, for the few callers that build their own auth line. */
export function teamHeaders(): Record<string, string> {
  const team = teamHeader();
  return team ? { 'Grpc-Metadata-X-Team': team } : {};
}
