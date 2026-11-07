/**
 * APOSENTADA EM 10/09/2026.
 *
 * Esta função era a gêmea manual do `meta-ads-cron`: mesma leitura de insights,
 * mesma gravação em `ad_spend`, disparada à mão com token de admin. Uma cópia
 * mais velha, com menos campos (não trazia `purchases`, `purchase_value` nem
 * `meta_leads`) e com a lógica antiga que o checkpoint de 10/09/2026 corrigiu
 * no cron:
 *
 *   - contas vindas dos secrets `META_AD_ACCOUNT_ID`/`_IDS_EXTRA`, e não do
 *     cadastro `meta_ad_accounts`;
 *   - `META_AD_ACCOUNT_CURRENCY` global aplicado a TODAS as contas — o
 *     parâmetro `accountId` chegava à função de moeda e não era lido. Com CA 05,
 *     CA 02, CA 03 e CA 04 em USD e CA03 BM NOVA, BR 1 e Conta 03 em BRL, isso
 *     multiplica ou divide o gasto por ~5,1 conforme a conta;
 *   - cotação buscada por conta a cada execução, sem cache por moeda;
 *   - `DELETE` por `(date, ad_id)` sem `ad_account_id`, seguido de `INSERT`,
 *     com o erro do DELETE não verificado;
 *   - 5xx da Meta devolvendo lista vazia, indistinguível de "conta sem gasto".
 *
 * Auditoria de chamadores em 10/09/2026: **nenhum**. Não é chamada pelo front
 * (zero ocorrências em `src/`), não é chamada por nenhum job do `pg_cron` (o
 * job `meta-ads-sync-5min` tem esse nome por herança, mas aponta para
 * `/functions/v1/meta-ads-cron`), não é chamada por script nem por outra edge
 * function. A única referência a ela no repositório era a própria entrada em
 * `config.toml`.
 *
 * Manter duas pipelines financeiras com regras divergentes de conta, moeda,
 * FX, upsert e erro é como um número errado nasce sem ninguém perceber. O corpo
 * foi removido em vez de corrigido: não havia nada aqui que o
 * `meta-ads-cron?days=N` não faça melhor.
 *
 * ESTA FUNÇÃO NÃO GRAVA MAIS EM `ad_spend`. Não há cliente Supabase, não há
 * token da Meta, não há INSERT, UPDATE, DELETE nem UPSERT neste arquivo.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return new Response(
    JSON.stringify({
      error: "meta-ads-sync foi aposentada em 10/09/2026",
      motivo:
        "Pipeline financeira duplicada com regras divergentes de conta, moeda, FX, upsert e erro da Meta.",
      use: "POST /functions/v1/meta-ads-cron?days=N",
      detalhes: {
        contas: "vêm da tabela meta_ad_accounts (sync_enabled = true), não de secrets",
        moeda: "é da conta, resolvida e validada; não existe mais moeda global",
        fx: "cache por moeda com procedência e tolerância de validade",
        gravacao: "upsert por (ad_account_id, date, ad_id); nenhuma conta toca linha de outra",
        erro_meta: "5xx é erro explícito, nunca lista vazia",
      },
    }, null, 2),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
