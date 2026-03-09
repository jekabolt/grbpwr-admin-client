/// <reference types="vite/client" />

declare module 'react-simple-maps' {
  import type { ReactNode } from 'react';
  export interface Geography {
    rsmKey: string;
    id: string;
    properties?: { name?: string };
    geography: unknown;
  }
  export function ComposableMap(props: Record<string, unknown>): ReactNode;
  export function Geographies(props: {
    geography: string;
    children: (params: { geographies: Geography[] }) => ReactNode;
  }): ReactNode;
  export function Geography(props: Record<string, unknown>): ReactNode;
  export function ZoomableGroup(props: Record<string, unknown>): ReactNode;
}

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  /** URL for media proxy (bypasses CORS when cropping). Default: /media-proxy (dev only). Set in prod if backend has proxy. */
  readonly VITE_MEDIA_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
