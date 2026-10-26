const DEPLOYED_STOREFRONT_DEFAULT = 'https://grbpwr.com';
const LOCAL_STOREFRONT_DEFAULT = 'http://localhost:3000';
const PRODUCTION_BACKEND_HOST = 'backend.grbpwr.com';

/** Storefront base URL for links and embedded previews. */
export function storefrontUrl(override?: string, localDevelopmentFallback = false): string {
  const configured = override?.trim() || import.meta.env.VITE_STOREFRONT_URL?.trim();
  const fallback =
    localDevelopmentFallback && import.meta.env.DEV
      ? LOCAL_STOREFRONT_DEFAULT
      : DEPLOYED_STOREFRONT_DEFAULT;
  return (configured || fallback).replace(/\/+$/, '');
}

/** Storefront origin for absolute customer-facing links. */
export function storefrontOrigin(): string {
  try {
    return new URL(storefrontUrl()).origin;
  } catch {
    return DEPLOYED_STOREFRONT_DEFAULT;
  }
}

/**
 * Keep the existing prod/beta tags when the new variable is absent. New
 * contours set VITE_SENTRY_ENVIRONMENT so their errors remain distinguishable.
 */
export function sentryEnvironment(): string {
  const configured = import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim();
  if (configured) return configured;

  try {
    const host = new URL(import.meta.env.VITE_SERVER_URL || '').hostname.replace(/\.$/, '');
    return host === PRODUCTION_BACKEND_HOST ? 'prod' : 'beta';
  } catch {
    return 'beta';
  }
}
