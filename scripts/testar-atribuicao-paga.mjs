/**
 * Atribuição: quem decide que a visita é PAGA, e o que sobrevive quando não é.
 *
 * Este é o teste do defeito de 18/09/2026. O link da bio do Instagram carrega
 * `utm_source=ig&utm_medium=social&utm_content=link_in_bio`, e o app anexa
 * `fbclid` a QUALQUER link externo clicado dentro dele — inclusive o da bio.
 * A regra antiga ("tem utm_source OU fbclid → tem rastreamento") lia isso como
 * visita rastreada, entrava no ramo de merge onde o valor NOVO sempre vence, e
 * trocava o criativo de quem já tinha clicado no anúncio. A recuperação por
 * bio, que existe exatamente para este caso, ficava inalcançável.
 *
 * Medido na base: 4 de 36 leads dos últimos 7 dias (11%) perderam ou TROCARAM
 * de anúncio. O caso do Emerson (18/09 06:54) é o cenário 1 daqui, inteiro:
 * clique no anúncio numa aba (navegador embutido do Instagram), volta pela bio
 * em OUTRA aba. O `session_id` sobrevivia porque mora no localStorage; a
 * atribuição morria porque morava só no sessionStorage.
 *
 * O módulo real (`src/lib/atribuicaoPaga.ts`) é carregado em cima de um
 * navegador de mentira, como em `testar-session-id-fonte.mjs`. É o MESMO código
 * que roda em produção — a decisão e o armazenamento moram lá, e o hook
 * `useUtmCapture` só o chama. Nada de rede, nada de banco.
 *
 * Rode com:  node scripts/testar-atribuicao-paga.mjs
 */
import fs from "node:fs";
import { transformSync } from "esbuild";

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

// ── Fixtures de URL, copiadas do que a base realmente registrou ────────────

/** url_tags padrão do /meta-lote/importar. Anúncio "Nulle #7", CA02. */
const PAGA_NULLE7 =
  "?utm_source=ig&utm_medium=paid_social&utm_campaign=CA02+-+Bid+Cap+-+MQL+-+Portfolio" +
  "&utm_content=Nulle+%237&utm_term=Case+Nulle+C&utm_placement=Instagram_Reels" +
  "&campaign_id=120255214000000054&adset_id=120255214111110054&ad_id=120255214874290054" +
  "&site_source_name=ig&fbclid=PAQ0xDSwABclique_no_anuncio";

/** Outro anúncio pago, conjunto e campanha diferentes. */
const PAGA_IGHOR7 =
  "?utm_source=ig&utm_medium=paid_social&utm_campaign=CA02+-+Ads+validados" +
  "&utm_content=Case+Ighor+%237+(30-08)&utm_term=Case+Ighor+-+Validados&utm_placement=Facebook_Feed" +
  "&campaign_id=120255118000000054&adset_id=120255118222220054&ad_id=120255118649680054" +
  "&site_source_name=fb&fbclid=PAQ0xDSwABsegundo_clique";

/** O link da bio, com o fbclid que o app do Instagram anexa sozinho. */
const BIO = "?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAQ0xDSwABapp_do_ig";

/** Clique em prévia de anúncio dentro do Gerenciador: macro não expandida. */
const MACRO_CRUA =
  "?utm_source=%7B%7Bsite_source_name%7D%7D&utm_medium=paid_social" +
  "&utm_campaign=%7B%7Bcampaign.name%7D%7D&utm_content=%7B%7Bad.name%7D%7D" +
  "&utm_placement=%7B%7Bplacement%7D%7D&campaign_id=%7B%7Bcampaign.id%7D%7D" +
  "&adset_id=%7B%7Badset.id%7D%7D&ad_id=%7B%7Bad.id%7D%7D";

// ── Navegador de mentira ───────────────────────────────────────────────────

function armazenamento(inicial = new Map(), quebrado = false) {
  const erro = () => { throw new Error("acesso negado ao armazenamento"); };
  if (quebrado) return { getItem: erro, setItem: erro, removeItem: erro, _mapa: inicial };
  return {
    getItem: (k) => (inicial.has(k) ? inicial.get(k) : null),
    setItem: (k, v) => inicial.set(k, String(v)),
    removeItem: (k) => inicial.delete(k),
    _mapa: inicial,
  };
}

/**
 * Abre uma ABA.
 *
 * sessionStorage é POR ABA (nasce vazio); localStorage é COMPARTILHADO entre
 * abas do mesmo navegador. É essa diferença que produz o defeito, então o
 * teste a reproduz literalmente: `disco` é o mesmo Map entre abas.
 */
function abrirAba(disco, { sessionQuebrado = false, localQuebrado = false } = {}) {
  globalThis.sessionStorage = armazenamento(new Map(), sessionQuebrado);
  globalThis.localStorage = armazenamento(disco, localQuebrado);
  return globalThis.sessionStorage._mapa;
}

const fonte = fs.readFileSync("src/lib/atribuicaoPaga.ts", "utf8");
const js = transformSync(fonte, { loader: "ts", format: "esm" }).code;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const AGORA = Date.parse("2026-09-18T09:54:00Z");
const DIA = 24 * 60 * 60 * 1000;

const visitar = (search, agora = AGORA, pathname = "/HD3") =>
  mod.capturarAtribuicaoDaVisita(search, pathname, agora);
const naAba = () => mod.lerAtribuicaoDaAba();
const noDisco = () => mod.lerAtribuicaoDoDisco();

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 0. A REGRA NOVA, ISOLADA ═══");
console.log("Identificador PAGO decide. utm_source e fbclid não decidem nada.\n");
{
  const bio = mod.lerParametrosDaUrl(BIO);
  const paga = mod.lerParametrosDaUrl(PAGA_NULLE7);

  // A regra ANTIGA, escrita aqui para mostrar o que ela responderia.
  const regraAntiga = (d) => !!(d.utm_source || d.utm_campaign || d.fbclid || d.gclid || d.campaign_id || d.ad_id);

  checar("CONTROLE: a regra antiga chamava a bio de 'visita rastreada'", regraAntiga(bio) === true);
  checar("a regra nova NÃO chama a bio de paga", mod.temIdentificadorPago(bio) === false);
  checar("e continua chamando o clique de anúncio de pago", mod.temIdentificadorPago(paga) === true);
  checar("ad_id sozinho basta", mod.temIdentificadorPago({ ad_id: "1" }) === true);
  checar("adset_id sozinho basta", mod.temIdentificadorPago({ adset_id: "1" }) === true);
  checar("campaign_id sozinho basta", mod.temIdentificadorPago({ campaign_id: "1" }) === true);
  checar("utm_medium=paid_social basta", mod.temIdentificadorPago({ utm_medium: "paid_social" }) === true);
  checar("utm_medium=social NÃO basta", mod.temIdentificadorPago({ utm_medium: "social" }) === false);
  checar("fbclid sozinho NÃO basta (o app anexa em link orgânico)", mod.temIdentificadorPago({ fbclid: "x" }) === false);
  checar("utm_source sozinho NÃO basta (a bio manda ig)", mod.temIdentificadorPago({ utm_source: "ig" }) === false);
  checar("gclid basta (o Google só anexa em clique pago)", mod.temIdentificadorPago({ gclid: "x" }) === true);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 1. (a) CLIQUE PAGO, DEPOIS BIO — EM ABAS DIFERENTES ═══");
console.log("O caso do Emerson: sessionStorage nasce vazio na aba 2, localStorage sobrevive.\n");
{
  const disco = new Map();

  // ── ABA 1: o clique no anúncio (navegador embutido do Instagram)
  abrirAba(disco);
  const d1 = visitar(PAGA_NULLE7);
  checar("aba 1 reconhece clique pago", d1.origem === "clique_pago", d1.origem);
  checar("aba 1 grava o anúncio", naAba().ad_id === "120255214874290054", String(naAba().ad_id));
  checar("aba 1 espelha o toque pago no DISCO", !!noDisco()?.ad_id, JSON.stringify(noDisco()?.ad_id));

  // ── ABA 2: a volta pela bio, 28 minutos depois
  const sessao2 = abrirAba(disco);
  checar("CONTROLE: a aba 2 começa com sessionStorage VAZIO", sessao2.size === 0);
  const d2 = visitar(BIO, AGORA + 28 * 60 * 1000);

  checar("a bio é lida como RECUPERAÇÃO, não como toque novo", d2.origem === "recuperado", d2.origem);
  const u = naAba();
  checar("utm_content continua 'Nulle #7' (era aqui que virava link_in_bio)", u.utm_content === "Nulle #7", String(u.utm_content));
  checar("campaign_id preservado", u.campaign_id === "120255214000000054", String(u.campaign_id));
  checar("adset_id preservado", u.adset_id === "120255214111110054", String(u.adset_id));
  checar("ad_id preservado", u.ad_id === "120255214874290054", String(u.ad_id));
  checar("utm_campaign preservado", u.utm_campaign === "CA02 - Bid Cap - MQL - Portfolio", String(u.utm_campaign));
  checar("utm_term preservado", u.utm_term === "Case Nulle C", String(u.utm_term));
  checar("placement preservado", u.placement === "Instagram_Reels", String(u.placement));
  checar("utm_medium continua paid_social (era aqui que virava social)", u.utm_medium === "paid_social", String(u.utm_medium));
  checar("site_source_name preservado", u.site_source_name === "ig", String(u.site_source_name));
  checar("marca de resgate gravada na aba", globalThis.sessionStorage.getItem("champion_utm_recovered") === "true");

  // ── ABA 3: recarregar sem parâmetro nenhum não desfaz o resgate
  abrirAba(disco);
  const d3 = visitar("", AGORA + 40 * 60 * 1000);
  checar("aba 3, URL limpa: recupera igual", d3.origem === "recuperado" && naAba().ad_id === "120255214874290054", String(naAba().ad_id));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 1b. MESMA ABA: a bio não sobrescreve o pago já capturado ═══\n");
{
  const disco = new Map();
  abrirAba(disco);
  visitar(PAGA_NULLE7);
  const d = visitar(BIO, AGORA + 60 * 1000);
  checar("continua sendo o clique pago da própria aba", d.origem === "clique_pago", d.origem);
  checar("utm_content intacto", naAba().utm_content === "Nulle #7", String(naAba().utm_content));
  checar("ad_id intacto", naAba().ad_id === "120255214874290054", String(naAba().ad_id));
  checar("sem marca de resgate (não houve resgate)", globalThis.sessionStorage.getItem("champion_utm_recovered") === null);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 2. (b) BIO PURA — nunca houve clique pago ═══");
console.log("Origem orgânica é gravada como ela é. Nenhuma campanha é inventada.\n");
{
  const disco = new Map();
  abrirAba(disco);
  const d = visitar(BIO);

  checar("origem orgânica", d.origem === "organico", d.origem);
  const u = naAba();
  checar("utm_source = ig", u.utm_source === "ig", String(u.utm_source));
  checar("utm_medium = social", u.utm_medium === "social", String(u.utm_medium));
  checar("utm_content = link_in_bio", u.utm_content === "link_in_bio", String(u.utm_content));
  checar("fbclid da bio é guardado (serve ao CAPI)", u.fbclid === "PAQ0xDSwABapp_do_ig", String(u.fbclid));
  checar("campaign_id NULO — nada é inventado", u.campaign_id === null, String(u.campaign_id));
  checar("adset_id NULO", u.adset_id === null, String(u.adset_id));
  checar("ad_id NULO", u.ad_id === null, String(u.ad_id));
  checar("utm_campaign fica no padrão '(not set)'", u.utm_campaign === "(not set)", String(u.utm_campaign));
  checar("placement NULO", u.placement === null, String(u.placement));
  checar("NADA é espelhado no disco (não há toque pago)", noDisco() === null, JSON.stringify(noDisco()));
  checar("sem marca de resgate", globalThis.sessionStorage.getItem("champion_utm_recovered") === null);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 3. (c) DOIS CLIQUES PAGOS — o último vence ═══");
console.log("reference_atribuicao_meta: vale o último clique ATÉ virar lead.\n");
{
  const disco = new Map();
  abrirAba(disco);
  visitar(PAGA_IGHOR7);
  checar("primeiro clique gravado", naAba().ad_id === "120255118649680054", String(naAba().ad_id));

  visitar(PAGA_NULLE7, AGORA + 2 * DIA);
  const u = naAba();
  checar("ad_id agora é o do SEGUNDO clique", u.ad_id === "120255214874290054", String(u.ad_id));
  checar("adset_id trocou junto", u.adset_id === "120255214111110054", String(u.adset_id));
  checar("campaign_id trocou junto", u.campaign_id === "120255214000000054", String(u.campaign_id));
  checar("utm_content trocou junto", u.utm_content === "Nulle #7", String(u.utm_content));
  checar("utm_term trocou junto", u.utm_term === "Case Nulle C", String(u.utm_term));
  checar("placement trocou junto", u.placement === "Instagram_Reels", String(u.placement));
  checar("NENHUM campo do primeiro anúncio sobrou (nada de Frankenstein)",
    u.utm_campaign !== "CA02 - Ads validados" && u.adset_id !== "120255118222220054");
  checar("o disco também passou a valer o segundo", noDisco()?.ad_id === "120255214874290054", String(noDisco()?.ad_id));
  checar("captured_at renovado no anúncio novo",
    Math.abs(Date.parse(noDisco().captured_at) - (AGORA + 2 * DIA)) < 1000, String(noDisco().captured_at));

  // Mesmo anúncio, URL parcial: completa em vez de zerar.
  visitar("?campaign_id=120255214000000054&utm_medium=paid_social", AGORA + 3 * DIA);
  checar("MESMO anúncio com URL parcial completa o que faltou",
    naAba().ad_id === "120255214874290054" && naAba().utm_content === "Nulle #7", String(naAba().utm_content));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 4. (d) SANITIZE — macro não expandida nunca vira dado ═══");
console.log("2 sessões de 16/09 gravaram ad_id='{{ad.id}}' literal e poluíram meta_ads_cache.\n");
{
  const p = mod.lerParametrosDaUrl(MACRO_CRUA);
  checar("campaign_id com macro é descartado", p.campaign_id === undefined, JSON.stringify(p.campaign_id));
  checar("adset_id com macro é descartado", p.adset_id === undefined, JSON.stringify(p.adset_id));
  checar("ad_id com macro é descartado", p.ad_id === undefined, JSON.stringify(p.ad_id));
  checar("utm_source com macro é descartado", p.utm_source === undefined, JSON.stringify(p.utm_source));
  checar("utm_campaign com macro é descartado", p.utm_campaign === undefined, JSON.stringify(p.utm_campaign));
  checar("utm_content com macro é descartado", p.utm_content === undefined, JSON.stringify(p.utm_content));
  checar("placement com macro é descartado", p.placement === undefined, JSON.stringify(p.placement));

  const disco = new Map();
  abrirAba(disco);
  visitar(MACRO_CRUA);
  const u = naAba();
  checar("nada de macro chega ao armazenamento", u.ad_id === null && u.campaign_id === null && u.adset_id === null,
    JSON.stringify([u.campaign_id, u.adset_id, u.ad_id]));
  checar("mas utm_medium=paid_social ainda marca a visita como paga", u.utm_medium === "paid_social", String(u.utm_medium));

  // Prévia do Gerenciador não pode APAGAR um toque pago de verdade.
  const disco2 = new Map();
  abrirAba(disco2);
  visitar(PAGA_NULLE7);
  abrirAba(disco2);
  visitar("?utm_source=%7B%7Bsite_source_name%7D%7D&utm_content=%7B%7Bad.name%7D%7D", AGORA + DIA);
  checar("URL só de macro não apaga o anúncio guardado", naAba().ad_id === "120255214874290054", String(naAba().ad_id));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 5. (e) REDE DE BAIXO NO INSERT — URL sem ids ═══");
console.log("Mesmo princípio do resgate de placement no gatilho (migration 20260911150000).\n");
{
  const disco = new Map();
  abrirAba(disco);
  visitar(PAGA_NULLE7);

  // O que o navegador entregaria numa aba que perdeu o sessionStorage.
  const payloadVazio = {
    utm_source: "ig", utm_medium: "social", utm_campaign: "(not set)",
    utm_content: null, utm_term: null, fbclid: "x", gclid: null,
    campaign_id: null, adset_id: null, ad_id: null,
    placement: null, site_source_name: null,
  };

  const r = mod.resgatarAtribuicaoDoLead({ ...payloadVazio }, AGORA + 60 * 60 * 1000);
  checar("campaign_id resgatado", r.campaign_id === "120255214000000054", String(r.campaign_id));
  checar("adset_id resgatado", r.adset_id === "120255214111110054", String(r.adset_id));
  checar("ad_id resgatado", r.ad_id === "120255214874290054", String(r.ad_id));
  checar("utm_content resgatado", r.utm_content === "Nulle #7", String(r.utm_content));
  checar("placement resgatado", r.placement === "Instagram_Reels", String(r.placement));
  checar("utm_source NÃO é tocado (decide attribution_source no gatilho)", r.utm_source === "ig", String(r.utm_source));
  checar("utm_medium NÃO é tocado", r.utm_medium === "social", String(r.utm_medium));
  checar("utm_campaign NÃO é tocado", r.utm_campaign === "(not set)", String(r.utm_campaign));
  checar("fbclid do payload preservado", r.fbclid === "x", String(r.fbclid));

  // Campo cheio manda: o navegador ganha do resgate.
  const cheio = mod.resgatarAtribuicaoDoLead(
    { ...payloadVazio, ad_id: "999", utm_content: "Anuncio da vez" }, AGORA + 60 * 60 * 1000);
  checar("ad_id entregue pelo navegador NÃO é sobrescrito", cheio.ad_id === "999", String(cheio.ad_id));
  checar("utm_content entregue pelo navegador NÃO é sobrescrito", cheio.utm_content === "Anuncio da vez", String(cheio.utm_content));
  checar("e o que faltava ainda é preenchido", cheio.adset_id === "120255214111110054", String(cheio.adset_id));

  // Fora da janela de 365 dias: não resgata.
  const velho = mod.resgatarAtribuicaoDoLead({ ...payloadVazio }, AGORA + 400 * DIA);
  checar("fora da janela de 365 dias não resgata nada", velho.ad_id === null, String(velho.ad_id));

  // Disco sem identificador pago: não resgata.
  abrirAba(new Map([["champion_attribution", JSON.stringify({
    utm_source: "ig", utm_medium: "social", utm_content: "link_in_bio",
    captured_at: new Date(AGORA).toISOString(),
  })]]));
  const organico = mod.resgatarAtribuicaoDoLead({ ...payloadVazio }, AGORA + 1000);
  checar("toque orgânico no disco não vira atribuição de anúncio", organico.utm_content === null, String(organico.utm_content));

  // Disco vazio: devolve o payload como veio.
  abrirAba(new Map());
  const semNada = mod.resgatarAtribuicaoDoLead({ ...payloadVazio }, AGORA);
  checar("sem nada guardado, o payload sai intacto",
    JSON.stringify(semNada) === JSON.stringify(payloadVazio));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 6. BORDAS ═══\n");
{
  // Janela de 365 dias na recuperação por bio.
  const disco = new Map();
  abrirAba(disco);
  visitar(PAGA_NULLE7);
  abrirAba(disco);
  visitar(BIO, AGORA + 300 * DIA);
  checar("recupera dentro de 300 dias", naAba().ad_id === "120255214874290054", String(naAba().ad_id));

  abrirAba(disco);
  visitar(BIO, AGORA + 400 * DIA);
  checar("NÃO recupera depois de 400 dias", naAba().ad_id === null, String(naAba().ad_id));
  checar("e registra a bio como orgânica", naAba().utm_content === "link_in_bio", String(naAba().utm_content));

  // Visita direta pura não apaga nada.
  const disco2 = new Map();
  const s = abrirAba(disco2);
  const d = visitar("");
  checar("URL sem parâmetro e sem nada guardado não grava lixo", s.size === 0 && d.origem === "organico");

  // Armazenamento bloqueado (webview do Instagram) não pode derrubar a visita.
  // O console.error do módulo é esperado aqui e só polui a saída: silenciado.
  abrirAba(new Map(), { sessionQuebrado: true, localQuebrado: true });
  const erroReal = console.error;
  console.error = () => {};
  let explodiu = false;
  try { visitar(PAGA_NULLE7); } catch { explodiu = true; }
  let explodiu2 = false;
  try { mod.resgatarAtribuicaoDoLead({ ad_id: null }, AGORA); } catch { explodiu2 = true; }
  console.error = erroReal;
  checar("armazenamento bloqueado não levanta exceção", explodiu === false);
  checar("resgate com armazenamento bloqueado também não", explodiu2 === false);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 a 9 — acrescentados em 18/09/2026, junto com a correção de raiz.
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n═══ 7. O QUE A SESSÃO RECEBE — a porta da RPC ═══");
console.log("Só toque com identificador PAGO pode reescrever o anúncio da sessão.\n");
{
  // `useTracking.atualizarAnuncioDaSessao` só chama a RPC quando
  // `temIdentificadorPago` aprova o toque. É esse portão que impede a bio de
  // reescrever a sessão — e é a MESMA função que o banco espelha em
  // `medium_pago` + teste de ids (migration 20260918170000).
  const daBio = mod.lerParametrosDaUrl(BIO);
  const daPaga = mod.lerParametrosDaUrl(PAGA_NULLE7);
  const daOutraPaga = mod.lerParametrosDaUrl(PAGA_IGHOR7);

  checar("clique pago abre a porta da RPC", mod.temIdentificadorPago(daPaga) === true);
  checar("bio NÃO abre a porta da RPC", mod.temIdentificadorPago(daBio) === false);
  checar("segundo anúncio também abre", mod.temIdentificadorPago(daOutraPaga) === true);
  checar("URL sem nada não abre", mod.temIdentificadorPago(mod.lerParametrosDaUrl("")) === false);
  checar("macro crua não abre pelos ids…",
    mod.lerParametrosDaUrl(MACRO_CRUA).ad_id === undefined);
  checar("…mas paid_social abre (é etiqueta de mídia paga, não é id)",
    mod.temIdentificadorPago(mod.lerParametrosDaUrl(MACRO_CRUA)) === true);

  // Dois anúncios diferentes: a RPC precisa reconhecer que TROCOU. A régua de
  // "é o mesmo anúncio?" é por ID, nunca por nome.
  const mesmo = (a, b) => (a.ad_id && b.ad_id ? a.ad_id === b.ad_id : false);
  checar("dois anúncios diferentes são reconhecidos como troca", mesmo(daPaga, daOutraPaga) === false);
  checar("o mesmo anúncio duas vezes não é troca", mesmo(daPaga, { ...daPaga }) === true);
}

console.log("\n═══ 8. fbc: o clique PAGO vence o fbclid que a bio anexa ═══");
console.log("Emerson, 18/09: fbp de 06:26 (anúncio) e fbc de 06:53 (bio).\n");
{
  const { buildSync } = await import("esbuild");
  const saida = buildSync({
    entryPoints: ["src/lib/metaTracking.ts"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const meta = await import(
    `data:text/javascript;base64,${Buffer.from(saida.outputFiles[0].text).toString("base64")}`
  );

  // fbclid de verdade é base64url com campos binários dentro. O de clique em
  // anúncio traz `adid`; o que o app do Instagram anexa a link orgânico, não.
  const b64url = (s) =>
    Buffer.from(s, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const FBCLID_ANUNCIO = b64url(
    "pdof\x02fdid\x10ABCDEFGHIJKLMNOPextn\x03aem\x010\x00adid\x01\xab;{0pC\xc6srtc\x06app_id\x0f1240245742874",
  );
  const FBCLID_BIO = b64url("pdof\x02extn\x03aem\x0211\x00srtc\x06app_id\x0f567067343352427");

  checar("fbclid de anúncio é reconhecido (tem adid)", meta.fbclidEhDeCliquePago(FBCLID_ANUNCIO) === true);
  checar("fbclid da bio NÃO é (não tem adid)", meta.fbclidEhDeCliquePago(FBCLID_BIO) === false);
  checar("fbclid vazio não é", meta.fbclidEhDeCliquePago(null) === false);
  checar("macro não é", meta.fbclidEhDeCliquePago("{{fbclid}}") === false);
  checar("formato antigo indecifrável cai no lado seguro", meta.fbclidEhDeCliquePago("IwAR0naoehbase64!!") === false);
  checar("fbc completo é lido pelo fbclid de dentro",
    meta.fbcEhDeCliquePago(`fb.1.1758000000000.${FBCLID_ANUNCIO}`) === true);

  // Navegador de mentira: cookie, URL e os dois armazenamentos.
  let jar = "";
  const navegador = (search, cookie) => {
    jar = cookie || "";
    globalThis.document = {
      get cookie() { return jar; },
      set cookie(v) { jar = jar ? `${jar}; ${String(v).split(";")[0]}` : String(v).split(";")[0]; },
    };
    globalThis.window = { location: { search, hostname: "www.championadstudio.com" } };
  };

  // (a) clique no anúncio: o fbc do anúncio é guardado no cofre do pago.
  const disco = new Map();
  abrirAba(disco);
  navegador(`?fbclid=${FBCLID_ANUNCIO}`, "");
  visitar(`${PAGA_NULLE7.replace(/fbclid=[^&]*/, `fbclid=${FBCLID_ANUNCIO}`)}`);
  const fbcDoAnuncio = meta.getFbc();
  checar("clique pago devolve o fbc do anúncio", fbcDoAnuncio.endsWith(FBCLID_ANUNCIO), String(fbcDoAnuncio).slice(0, 40));
  checar("e ele fica guardado no cofre do PAGO", (meta.getStoredFbcPago() || "").endsWith(FBCLID_ANUNCIO));

  // (b) volta pela bio, OUTRA aba, com o cookie _fbc já reescrito pelo pixel
  //     com o fbclid da bio — que era exatamente o que vencia antes.
  abrirAba(disco);
  navegador(`?fbclid=${FBCLID_BIO}`, `_fbc=fb.1.1758099999999.${FBCLID_BIO}`);
  visitar(BIO.replace(/fbclid=[^&]*/, `fbclid=${FBCLID_BIO}`), AGORA + 28 * 60 * 1000);
  checar("CONTROLE: a atribuição desta aba foi resgatada e é paga",
    mod.temIdentificadorPago(mod.lerAtribuicaoDaAba()) === true);
  const fbcNaBio = meta.getFbc();
  checar("o fbc do ANÚNCIO vence o fbc da bio", fbcNaBio.endsWith(FBCLID_ANUNCIO), String(fbcNaBio).slice(0, 40));

  // (c) visitante 100% orgânico: nada de cofre pago, o comportamento é o antigo.
  const disco2 = new Map();
  abrirAba(disco2);
  navegador(`?fbclid=${FBCLID_BIO}`, "");
  visitar(BIO.replace(/fbclid=[^&]*/, `fbclid=${FBCLID_BIO}`));
  const fbcOrganico = meta.getFbc();
  checar("sem clique pago nenhum, devolve o fbc da bio (como antes)",
    fbcOrganico.endsWith(FBCLID_BIO), String(fbcOrganico).slice(0, 40));
  checar("e o cofre do pago segue vazio", meta.getStoredFbcPago() === null);

  // (d) cookie _fbc do clique pago tem a primeira palavra.
  const disco3 = new Map();
  abrirAba(disco3);
  navegador("", `_fbc=fb.1.1758000000001.${FBCLID_ANUNCIO}`);
  checar("cookie _fbc de clique pago vence tudo",
    (meta.getFbc() || "").endsWith(FBCLID_ANUNCIO));

  delete globalThis.document;
  delete globalThis.window;
}

console.log("\n═══ 9. Instagram: '@' sozinho não é Instagram ═══");
console.log("Um lead real entrou com '@' em 18/09. Agora reprova.\n");
{
  const fonteIg = fs.readFileSync("src/lib/instagramUsuario.ts", "utf8");
  const jsIg = transformSync(fonteIg, { loader: "ts", format: "esm" }).code;
  const ig = await import(`data:text/javascript;base64,${Buffer.from(jsIg).toString("base64")}`);

  checar("'@' sozinho REPROVA", ig.instagramValido("@") === false);
  checar("'@ ' com espaço REPROVA", ig.instagramValido("@ ") === false);
  checar("vazio REPROVA", ig.instagramValido("") === false);
  checar("'@a' (1 caractere) REPROVA", ig.instagramValido("@a") === false);
  checar("'@user' APROVA", ig.instagramValido("@user") === true);
  checar("'user' sem arroba APROVA", ig.instagramValido("user") === true);
  checar("'@ab' (2 caracteres) APROVA", ig.instagramValido("@ab") === true);

  checar("normaliza '@Fulano ' → '@fulano'", ig.normalizarInstagram("@Fulano ") === "@fulano", ig.normalizarInstagram("@Fulano "));
  checar("normaliza '@ fulano' → '@fulano'", ig.normalizarInstagram("@ fulano") === "@fulano", ig.normalizarInstagram("@ fulano"));
  checar("normaliza '@@fulano' → '@fulano'", ig.normalizarInstagram("@@fulano") === "@fulano", ig.normalizarInstagram("@@fulano"));
  checar("URL completa vira usuário",
    ig.normalizarInstagram("https://www.instagram.com/champion.ads/?igshid=abc") === "@champion.ads",
    ig.normalizarInstagram("https://www.instagram.com/champion.ads/?igshid=abc"));
  checar("URL sem protocolo também",
    ig.normalizarInstagram("instagram.com/champion_ads") === "@champion_ads",
    ig.normalizarInstagram("instagram.com/champion_ads"));
  checar("ponto e underline sobrevivem", ig.normalizarInstagram("@fu.la_no") === "@fu.la_no");
  checar("emoji e acento somem", ig.normalizarInstagram("@joão🔥") === "@joo", ig.normalizarInstagram("@joão🔥"));
  checar("o usuário sem arroba é o que o instagram-follow-mql espera",
    ig.usuarioDoInstagram("https://instagram.com/Fulano/") === "fulano");
  checar("'@' normalizado vira string vazia", ig.normalizarInstagram("@") === "");
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
