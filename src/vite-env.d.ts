/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  /** URL for media proxy (bypasses CORS when cropping). Default: /media-proxy (dev only). Set in prod if backend has proxy. */
  readonly VITE_MEDIA_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
