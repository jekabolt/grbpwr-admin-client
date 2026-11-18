// Which product this tab is, read from its address. One build serves every host:
//   <base>            root — the sign-up sheet and log in (beta.lekalo.studio)
//   console.<base>    the operator's console
//   <slug>.<base>     one team's workspace (one label only)
//   anything else     legacy: admin[.beta].grbpwr.com, localhost, preview aliases — team #1
// `VITE_BASE_DOMAIN` unset means there is no lekalo host at all, so every tab is legacy and the
// app behaves exactly as before teams existed. `VITE_DEV_HOST` (dev builds only) pretends to be
// another host so one `yarn dev` can show the root, a team or the console.

export type HostKind = 'root' | 'console' | 'team' | 'legacy';

export interface HostInfo {
  kind: HostKind;
  /** The team slug on a team host; `VITE_DEFAULT_TEAM` on a legacy host; '' otherwise. */
  slug: string;
  /** The lekalo base domain ('' when the build has none). */
  base: string;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

export function resolveHost(hostname: string, base: string, defaultTeam: string): HostInfo {
  const host = normalize(hostname);
  const b = normalize(base);
  const legacy: HostInfo = { kind: 'legacy', slug: normalize(defaultTeam), base: b };
  if (!b) return legacy;
  if (host === b) return { kind: 'root', slug: '', base: b };
  const suffix = `.${b}`;
  if (!host.endsWith(suffix)) return legacy;
  const label = host.slice(0, -suffix.length);
  if (!LABEL.test(label)) return legacy;
  if (label === 'console') return { kind: 'console', slug: '', base: b };
  return { kind: 'team', slug: label, base: b };
}

function currentHostname(): string {
  const dev = import.meta.env.DEV ? import.meta.env.VITE_DEV_HOST : undefined;
  if (dev) return String(dev);
  return typeof window === 'undefined' ? '' : window.location.hostname;
}

let cached: HostInfo | null = null;

/** The host of this tab. It cannot change without a page load, so it is read once. */
export function currentHost(): HostInfo {
  if (!cached) {
    cached = resolveHost(
      currentHostname(),
      String(import.meta.env.VITE_BASE_DOMAIN ?? ''),
      String(import.meta.env.VITE_DEFAULT_TEAM ?? ''),
    );
  }
  return cached;
}

export function useHost(): HostInfo {
  return currentHost();
}

/** True on any lekalo host (root, console, team); false on a legacy one. */
export function isLekaloHost(h: HostInfo = currentHost()): boolean {
  return h.kind !== 'legacy';
}

function protocol(): string {
  return typeof window === 'undefined' ? 'https:' : window.location.protocol;
}

/** `https://<slug>.<base><path>` — a team's own address. */
export function teamUrl(slug: string, path = '/', h: HostInfo = currentHost()): string {
  return `${protocol()}//${slug}.${h.base}${path}`;
}

/** `https://<base><path>` — the root (sign-up sheet). */
export function rootUrl(path = '/', h: HostInfo = currentHost()): string {
  return `${protocol()}//${h.base}${path}`;
}

/**
 * Leave for another host (hand-off). A dev build that only pretends to be a host keeps the path and
 * fragment on its own origin, so the flow can be walked on localhost.
 */
export function goToUrl(url: string): void {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_HOST) {
    try {
      const u = new URL(url);
      if (u.host !== window.location.host) {
        window.location.assign(`${window.location.origin}${u.pathname}${u.search}${u.hash}`);
        return;
      }
    } catch {
      /* not a URL: fall through */
    }
  }
  window.location.assign(url);
}
