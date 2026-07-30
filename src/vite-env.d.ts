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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
