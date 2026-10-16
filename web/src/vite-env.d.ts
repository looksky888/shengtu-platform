/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly VITE_API_URL?: string;
  readonly VITE_ENABLE_CANVAS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
