/// <reference types="vite/client" />

/** Carimbo do build (vite.config.ts). Comparado com /version.json para saber se o painel ficou velho. */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /**
   * Código de teste do Gerenciador de Eventos do Meta (`TEST#####`), usado
   * fora do domínio de produção. Ver src/lib/ambienteMeta.ts.
   */
  readonly VITE_META_TEST_EVENT_CODE?: string;
}
