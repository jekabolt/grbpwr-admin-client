declare module '*.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly REACT_APP_SERVER_URL?: string;
  readonly REACT_APP_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}