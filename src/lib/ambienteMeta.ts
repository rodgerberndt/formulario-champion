/**
 * Produção x teste, para o Meta (17/09/2026).
 *
 * O problema: o pixel e a CAPI são os MESMOS em localhost, na prévia do
 * Cloudflare (`*.pages.dev`) e em produção. Toda vez que alguém testa o
 * formulário — e ele é testado a cada deploy — nascem um `Lead`, um
 * `CompleteRegistration` e um `MQL` de verdade na conta. Eles entram na
 * otimização, no custo por resultado e no ROAS, e não dá para tirar depois.
 *
 * A regra, em duas partes:
 *
 *   1. FORA DE PRODUÇÃO O PIXEL DO NAVEGADOR NÃO DISPARA. O `fbq` não aceita
 *      `test_event_code` (é parâmetro só da Conversions API), então não existe
 *      forma de mandar um evento de navegador que o Meta trate como teste. A
 *      única saída honesta é não disparar.
 *
 *   2. A CAPI DISPARA COM `test_event_code`. O evento aparece no "Testar
 *      eventos" do Gerenciador — que é o ponto de testar — e o Meta NÃO o conta
 *      em nenhuma métrica, entrega ou público. O `fire-capi-events` já repassa
 *      o parâmetro ao `meta-capi`, que o coloca no corpo enviado ao Meta.
 *
 * "Produção" é o domínio, não a variável de build: uma prévia do Cloudflare é
 * buildada em modo production e mesmo assim não pode mandar evento real.
 * `import.meta.env.DEV` entra junto porque o dev server roda em 127.0.0.1, que
 * também não está na lista.
 *
 * O código vem de `VITE_META_TEST_EVENT_CODE`. Ele MUDA a cada sessão de teste
 * no Gerenciador de Eventos (Gerenciador → Origens de dados → o pixel → Testar
 * eventos → o código aparece como `TEST#####`); por isso é env e não constante.
 * Sem a variável, cai no padrão abaixo: o evento continua marcado como teste e
 * continua fora das métricas, só não aparece na janela de quem está olhando.
 */

/** Os únicos hosts em que um evento do Meta é real. */
const DOMINIOS_DE_PRODUCAO = new Set([
  "www.championadstudio.com",
  "championadstudio.com",
  // 25/09/2026: o domínio antigo expirou e o tráfego mudou para este. Sem
  // ele aqui, TODO evento de conversão saía com test_event_code, ou seja,
  // como teste, invisível para a otimização das campanhas.
  "www.assessoriachampion.com",
  "assessoriachampion.com",
]);

/** Padrão quando `VITE_META_TEST_EVENT_CODE` não está definida. */
const CODIGO_PADRAO = "TEST00000";

export const META_TEST_EVENT_CODE: string =
  (import.meta.env.VITE_META_TEST_EVENT_CODE as string | undefined)?.trim() || CODIGO_PADRAO;

/** O navegador está no domínio de produção? */
export function ehProducaoMeta(): boolean {
  if (import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return DOMINIOS_DE_PRODUCAO.has(window.location.hostname.toLowerCase());
}

/**
 * O código de teste a mandar junto do evento de CAPI, ou `null` em produção.
 *
 * Use espalhando no corpo: `...(codigoDeTesteMeta() ? { test_event_code } : {})`
 * — mandar `null` explícito faria o `fire-capi-events` tratar como ausente de
 * qualquer forma, mas o corpo fica mais limpo sem a chave.
 */
export function codigoDeTesteMeta(): string | null {
  return ehProducaoMeta() ? null : META_TEST_EVENT_CODE;
}

/**
 * O pixel do navegador pode disparar?
 *
 * Só em produção. Fora dela o evento não teria como ser marcado como teste e
 * viraria conversão real na conta.
 */
export function pixelPermitido(): boolean {
  return ehProducaoMeta();
}

/** Uma linha só no console, para quem está testando saber por que nada saiu. */
export function avisarPixelBloqueado(onde: string): void {
  console.log(
    `[meta] ${onde}: pixel do navegador NÃO disparado (host "${
      typeof window === "undefined" ? "?" : window.location.hostname
    }" não é produção). A CAPI sai com test_event_code=${META_TEST_EVENT_CODE}.`,
  );
}
