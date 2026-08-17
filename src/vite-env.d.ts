/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  /** URL for media proxy (bypasses CORS when cropping). Default: /media-proxy (dev only). Set in prod if backend has proxy. */
  readonly VITE_MEDIA_PROXY_URL?: string;
  /** Storefront base URL for the hero live-preview iframe (/preview/hero). */
  readonly VITE_STOREFRONT_URL?: string;
  /** Seller VAT/NIP printed on commercial invoices. Unset -> invoices carry a visible
   *  "SELLER VAT ID NOT CONFIGURED" marker instead of a number. */
  readonly VITE_SELLER_VAT_ID?: string;
  /** Origin baked into printed QR codes of the public viewers (/p/{token} patterns,
   *  /r/{token} run pack) — see src/utils/viewer-origin.ts. Set it on EVERY deployed
   *  contour to that contour's stable admin host; unset it falls back to
   *  window.location.origin, so paper printed from a Vercel preview points at an
   *  ephemeral SSO-protected alias and the QR dies silently later. */
  readonly VITE_PATTERN_VIEWER_ORIGIN?: string;
  /** Origin of the public file-share landing page (/f/{token}) copied out of the access
   *  block and the shared-files screen. Optional: unset it falls back to
   *  VITE_PATTERN_VIEWER_ORIGIN, which is the same host — all public pages are one SPA.
   *  Set it only if /f/ ever moves to a domain of its own. With NEITHER variable set the
   *  tab's own origin is used, but only when that origin is not provably ephemeral
   *  (localhost / bare IP / *.vercel.app) — there the address and its copy button are
   *  hidden instead of handing out a link that dies off this machine. */
  readonly VITE_FILE_SHARE_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
