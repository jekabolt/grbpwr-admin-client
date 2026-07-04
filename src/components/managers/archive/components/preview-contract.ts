/**
 * The route + postMessage contract the admin uses to drive the storefront's live
 * archive preview. Mirrors the hero preview contract, names swapped hero→archive.
 *
 * The storefront (separate repo) must implement the matching route:
 *   /{country}/{locale}/preview/archive
 * which on mount posts `archive-preview-ready`, then renders each `archive-draft`
 * it receives (highest `rev` wins) and posts `archive-block-click` { index } when
 * a body block is clicked. Everything the admin needs is centralized here so a
 * storefront-side naming difference is a one-place change.
 */
export const ARCHIVE_PREVIEW = {
  /** Path segment appended after /{country}/{locale}. */
  routePath: 'preview/archive',
  /** storefront → admin: the preview page mounted and is listening. */
  readyMessage: 'archive-preview-ready',
  /** admin → storefront: the hydrated draft to render (carries a monotonic rev). */
  draftMessage: 'archive-draft',
  /** storefront → admin: a body block was clicked (carries its index). */
  blockClickMessage: 'archive-block-click',
} as const;
