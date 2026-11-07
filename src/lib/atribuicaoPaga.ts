/**
 * O QUE DECIDE QUE UMA VISITA É PAGA — e o que sobrevive quando ela não é.
 *
 * ── O defeito corrigido em 18/09/2026 ──────────────────────────────────────
 * Até aqui, `useUtmCapture` decidia "esta visita tem rastreamento" por
 * `utm_source OU utm_campaign OU fbclid OU gclid OU campaign_id OU ad_id`.
 *
 * O link da bio do Instagram tem utm_source E fbclid:
 *   .../HD3?utm_source=ig&utm_medium=social&utm_content=link_in_bio
 * e o app do Instagram anexa `fbclid` a QUALQUER link externo clicado dentro
 * dele, inclusive o da bio. Decodificado, esse fbclid não tem `adid`: não
 * houve clique em anúncio nenhum.
 *
 * Consequência: toda volta pela bio entrava no ramo de MERGE, onde o valor
 * novo da URL sempre vencia o guardado — `utm_content=link_in_bio`
 * sobrescrevia `Nulle #7`, `utm_medium=social` sobrescrevia `paid_social` — e
 * o ramo de recuperação (bio recovery), que existe exatamente para este caso,
 * ficava inalcançável porque só rodava quando a URL não tinha parâmetro NENHUM.
 *
 * Medido: 4 de 36 leads dos últimos 7 dias (11%) perderam ou TROCARAM de
 * criativo. O de 17/09 (Rafael Gustavo Ryba) foi creditado ao anúncio ERRADO,
 * o que envenena a comparação de criativos do experimento das 3 contas.
 *
 * ── A regra nova, em uma frase ─────────────────────────────────────────────
 * Visita paga é a que traz IDENTIFICADOR PAGO (`campaign_id`/`adset_id`/
 * `ad_id`, ou `utm_medium=paid_social`); visita sem identificador pago nunca
 * apaga nem sobrescreve o toque pago já guardado, e um novo clique pago
 * sobrescreve o pago anterior (último clique pago vence).
 *
 * ── Por que o fbclid NÃO entra na decisão ──────────────────────────────────
 * Ele é anexado pelo app a link orgânico. `gclid` entra: o Google só o anexa
 * em clique pago. `utm_source` sozinho também não entra: a bio manda `ig`.
 *
 * ── Por que este arquivo não importa NADA ──────────────────────────────────
 * Ele é carregado direto pelo teste (`scripts/testar-atribuicao-paga.mjs`) em
 * cima de um navegador de mentira, como em `testar-session-id-fonte.mjs`. Uma
 * única dependência de React quebraria isso.
 *
 * Ver: reference_atribuicao_meta (último clique ATÉ virar lead),
 * project_placement_persistencia, project_session_id_cobertura.
 */

/** Campos de atribuição, na forma em que o lead os grava. */
export interface CamposAtribuicao {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
}

/** O mesmo objeto, guardado no localStorage com carimbo de quando foi capturado. */
export interface AtribuicaoGuardada extends Partial<CamposAtribuicao> {
  captured_at?: string;
  landing_page?: string;
  creative_id?: string | null;
  ttclid?: string | null;
}

export const ATRIBUICAO_PADRAO: CamposAtribuicao = {
  utm_source: "direct",
  utm_medium: "none",
  utm_campaign: "(not set)",
  utm_content: null,
  utm_term: null,
  fbclid: null,
  gclid: null,
  campaign_id: null,
  adset_id: null,
  ad_id: null,
  placement: null,
  site_source_name: null,
};

/** Chave do espelho em disco. A MESMA de `useAttribution`, de propósito. */
export const CHAVE_ATRIBUICAO = "champion_attribution";

/**
 * 1 ano, como o cookie do indexador do método Allan Tracker: a primeira origem
 * paga fica guardada até a pessoa converter, mesmo que ela volte pela bio meses
 * depois. Janela que já existia na recuperação por bio; não foi alterada.
 */
export const JANELA_ATRIBUICAO_PAGA_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * `utm_medium` que a casa usa em tráfego pago.
 *
 * O padrão de `url_tags` do `/meta-lote/importar` grava `paid_social` nos 16
 * anúncios ativos das 3 contas. Os demais entram porque são o vocabulário
 * universal de mídia paga e um link montado à mão pode usá-los. `social` NÃO
 * entra: é exatamente o que o link da bio manda.
 */
export const MEDIUMS_PAGOS = new Set([
  "paid_social",
  "paidsocial",
  "cpc",
  "ppc",
  "paid",
  "paid_search",
]);

export function ehMediumPago(valor: string | null | undefined): boolean {
  return !!valor && MEDIUMS_PAGOS.has(valor.trim().toLowerCase());
}

/**
 * A visita traz identificador de ANÚNCIO?
 *
 * Só isto decide "paga". Nem `utm_source`, nem `fbclid`, nem `utm_campaign`.
 */
export function temIdentificadorPago(
  dados: Partial<CamposAtribuicao> | null | undefined,
): boolean {
  if (!dados) return false;
  return !!(
    dados.campaign_id ||
    dados.adset_id ||
    dados.ad_id ||
    dados.gclid ||
    ehMediumPago(dados.utm_medium)
  );
}

/**
 * Descarta placeholder da Meta que chegou sem ser substituído (`{{ad.id}}`).
 *
 * Testa as duas pontas SEPARADAMENTE desde 18/09/2026: valor truncado no meio
 * do caminho (URL cortada, limite de coluna) chega com só `{{` ou só `}}` e
 * continua não sendo dado. O padrão anterior (`\{\{.*\}\}`) deixava passar.
 */
export function sanitizarParam(valor: string | null): string | null {
  if (!valor) return null;
  if (/\{\{|\}\}/.test(valor)) return null;
  return valor;
}

/**
 * Lê os parâmetros da URL.
 *
 * `sanitizarParam` roda também em `campaign_id`/`adset_id`/`ad_id` desde
 * 18/09/2026: duas sessões de 16/09 chegaram com `ad_id="{{ad.id}}"` literal
 * (clique em prévia de anúncio dentro do Gerenciador) e a macro crua entrou no
 * banco, poluindo `meta_ads_cache` com uma linha de `ad_id = "{{ad.id}}"`.
 */
export function lerParametrosDaUrl(search: string): Partial<CamposAtribuicao> {
  const params = new URLSearchParams(search);
  const resultado: Partial<CamposAtribuicao> = {};

  const utm_source = sanitizarParam(params.get("utm_source"));
  const utm_medium = sanitizarParam(params.get("utm_medium"));
  const utm_campaign = sanitizarParam(params.get("utm_campaign"));
  const utm_content = sanitizarParam(params.get("utm_content"));
  const utm_term = sanitizarParam(params.get("utm_term"));
  const fbclid = sanitizarParam(params.get("fbclid"));
  const gclid = sanitizarParam(params.get("gclid"));

  // Vários anúncios usam os parâmetros dinâmicos utm_campaign={{campaign.id}}/
  // utm_content={{ad.id}} em vez de campaign_id/ad_id dedicados — nesse caso o
  // ID numérico cru do Meta cai em utm_campaign/utm_content, então usa como
  // fallback pra não perder o dado (campaign_id/ad_id explícitos têm prioridade).
  const ehIdNumerico = (v: string | null) => !!v && /^\d+$/.test(v);
  const campaign_id =
    sanitizarParam(params.get("campaign_id")) || (ehIdNumerico(utm_campaign) ? utm_campaign : null);
  const adset_id = sanitizarParam(params.get("adset_id"));
  const ad_id =
    sanitizarParam(params.get("ad_id")) || (ehIdNumerico(utm_content) ? utm_content : null);

  // As URLs dos anúncios entregam `utm_placement` — o nome que a Meta usa nos
  // parâmetros dinâmicos ({{placement}}). Ler apenas `placement` fazia o valor
  // ser descartado em TODA visita paga (auditoria de placement, 09/09/2026).
  // `placement` continua aceito para não quebrar link antigo montado à mão.
  //
  // Guarda o valor BRUTO da Meta (`Instagram_Stories`, `an`, ...). Não
  // derivamos publisher_platform / platform_position aqui: a URL não manda
  // essas dimensões, e inferir do texto seria transformar suposição em dado.
  const placement = sanitizarParam(params.get("utm_placement") || params.get("placement"));
  const site_source_name = sanitizarParam(params.get("site_source_name"));

  if (utm_source) resultado.utm_source = utm_source;
  if (utm_medium) resultado.utm_medium = utm_medium;
  if (utm_campaign) resultado.utm_campaign = utm_campaign;
  if (utm_content) resultado.utm_content = utm_content;
  if (utm_term) resultado.utm_term = utm_term;
  if (fbclid) resultado.fbclid = fbclid;
  if (gclid) resultado.gclid = gclid;
  if (campaign_id) resultado.campaign_id = campaign_id;
  if (adset_id) resultado.adset_id = adset_id;
  if (ad_id) resultado.ad_id = ad_id;
  if (placement) resultado.placement = placement;
  if (site_source_name) resultado.site_source_name = site_source_name;

  return resultado;
}

/** Tem qualquer etiqueta, paga ou não. */
export function temQualquerEtiqueta(dados: Partial<CamposAtribuicao>): boolean {
  return !!(
    dados.utm_source ||
    dados.utm_medium ||
    dados.utm_campaign ||
    dados.utm_content ||
    dados.utm_term ||
    dados.fbclid ||
    dados.gclid ||
    dados.campaign_id ||
    dados.adset_id ||
    dados.ad_id ||
    dados.placement ||
    dados.site_source_name
  );
}

function completar(
  dados: Partial<CamposAtribuicao>,
  base: CamposAtribuicao,
): CamposAtribuicao {
  return {
    utm_source: dados.utm_source || base.utm_source,
    utm_medium: dados.utm_medium || base.utm_medium,
    utm_campaign: dados.utm_campaign || base.utm_campaign,
    utm_content: dados.utm_content || base.utm_content,
    utm_term: dados.utm_term || base.utm_term,
    fbclid: dados.fbclid || base.fbclid,
    gclid: dados.gclid || base.gclid,
    campaign_id: dados.campaign_id || base.campaign_id,
    adset_id: dados.adset_id || base.adset_id,
    ad_id: dados.ad_id || base.ad_id,
    placement: dados.placement || base.placement,
    site_source_name: dados.site_source_name || base.site_source_name,
  };
}

/** É o MESMO anúncio de antes? Decide se o toque novo completa ou substitui. */
function mesmoAnuncio(
  novo: Partial<CamposAtribuicao>,
  antigo: Partial<CamposAtribuicao>,
): boolean {
  if (novo.ad_id && antigo.ad_id) return novo.ad_id === antigo.ad_id;
  if (novo.campaign_id && antigo.campaign_id) return novo.campaign_id === antigo.campaign_id;
  return false;
}

export function dentroDaJanela(guardada: AtribuicaoGuardada | null, agora: number): boolean {
  if (!guardada || !guardada.captured_at) return false;
  const carimbo = new Date(guardada.captured_at).getTime();
  if (!Number.isFinite(carimbo)) return false;
  return agora - carimbo < JANELA_ATRIBUICAO_PAGA_MS;
}

export type OrigemDecisao = "clique_pago" | "recuperado" | "organico";

export interface Decisao {
  dados: CamposAtribuicao;
  origem: OrigemDecisao;
  /** Espelha em disco o toque pago que esta visita carrega. */
  persistirEmDisco: boolean;
}

/**
 * O CORAÇÃO. Função pura: recebe os três estados e devolve o que vale.
 *
 * - `daUrl`   parâmetros desta visita
 * - `daAba`   o que o `sessionStorage` desta ABA já tem (por aba, some em aba nova)
 * - `doDisco` o toque pago espelhado no `localStorage` (entre abas, 365 dias)
 *
 * O caso do Emerson (18/09 06:54) é exatamente `daAba` vazio + `doDisco` pago:
 * o anúncio abriu o navegador embutido do Instagram (uma aba) e a bio abriu
 * outra. O `session_id` sobreviveu porque mora no localStorage; a atribuição
 * morria porque morava só no sessionStorage.
 */
export function decidirAtribuicao(entrada: {
  daUrl: Partial<CamposAtribuicao>;
  daAba: CamposAtribuicao;
  doDisco: AtribuicaoGuardada | null;
  agora: number;
}): Decisao {
  const { daUrl, daAba, doDisco, agora } = entrada;

  // 1. CLIQUE PAGO NESTA URL. Último clique pago vence o pago anterior
  //    (reference_atribuicao_meta). Anúncio diferente troca o BLOCO inteiro:
  //    campanha de um toque com conjunto de outro seria um Frankenstein.
  if (temIdentificadorPago(daUrl)) {
    const base = mesmoAnuncio(daUrl, daAba)
      ? daAba
      : { ...ATRIBUICAO_PADRAO, fbclid: daAba.fbclid, gclid: daAba.gclid };
    return { dados: completar(daUrl, base), origem: "clique_pago", persistirEmDisco: true };
  }

  // 2. VISITA SEM IDENTIFICADOR PAGO (bio, direto, orgânico, ou o fbclid que o
  //    app do Instagram anexa). O toque pago já guardado MANDA e não é tocado.
  const pagoNaAba = temIdentificadorPago(daAba) ? daAba : null;
  const pagoNoDisco =
    doDisco && dentroDaJanela(doDisco, agora) && temIdentificadorPago(doDisco) ? doDisco : null;

  if (pagoNaAba) {
    // Já estava nesta aba: nada a recuperar. Segue espelhando em disco, que é
    // o que faz a PRÓXIMA aba conseguir recuperar.
    return { dados: pagoNaAba, origem: "clique_pago", persistirEmDisco: true };
  }
  if (pagoNoDisco) {
    // RECUPERAÇÃO POR BIO — o ramo que nunca era alcançado.
    return {
      dados: completar(pagoNoDisco, ATRIBUICAO_PADRAO),
      origem: "recuperado",
      persistirEmDisco: false,
    };
  }

  // 3. Não há toque pago em lugar nenhum. Registra a origem orgânica como ela
  //    é — `utm_source=ig`, `utm_medium=social`, `utm_content=link_in_bio` —
  //    sem inventar campanha.
  return { dados: completar(daUrl, daAba), origem: "organico", persistirEmDisco: false };
}

// ── Espelho em disco ───────────────────────────────────────────────────────
// `useAttribution` grava esta MESMA chave, mas não está montado em página
// nenhuma (achado de 11/09/2026, ver project_placement_persistencia): na
// prática `champion_attribution` nunca foi escrito, e por isso a recuperação
// por bio não teria de onde recuperar mesmo se fosse alcançada. Quem passa a
// escrever é a captura de UTM, no mesmo instante em que a sessão nasce.

export function lerAtribuicaoDoDisco(): AtribuicaoGuardada | null {
  try {
    const cru = localStorage.getItem(CHAVE_ATRIBUICAO);
    if (!cru) return null;
    const objeto = JSON.parse(cru);
    return objeto && typeof objeto === "object" ? (objeto as AtribuicaoGuardada) : null;
  } catch {
    return null;
  }
}

/**
 * Espelha o toque pago no disco, para a PRÓXIMA aba conseguir recuperá-lo.
 *
 * `captured_at` só é renovado quando o anúncio muda: a janela de 365 dias
 * conta do toque pago vigente, não de cada recarregamento.
 */
export function salvarAtribuicaoNoDisco(
  dados: CamposAtribuicao,
  agora: number,
  pagina: string,
): void {
  if (!temIdentificadorPago(dados)) return;
  const anterior = lerAtribuicaoDoDisco();
  const continuacao = !!anterior && mesmoAnuncio(dados, anterior);
  const registro: AtribuicaoGuardada = {
    ...(anterior || {}),
    ...dados,
    captured_at:
      continuacao && anterior?.captured_at ? anterior.captured_at : new Date(agora).toISOString(),
    landing_page: continuacao && anterior?.landing_page ? anterior.landing_page : pagina,
  };
  try {
    localStorage.setItem(CHAVE_ATRIBUICAO, JSON.stringify(registro));
  } catch {
    /* armazenamento bloqueado: a visita não pode ser perdida por causa disso */
  }
}

// ── A visita, de ponta a ponta ─────────────────────────────────────────────

/** Onde a atribuição da ABA vive. Por aba: some em aba nova, sobrevive a reload. */
export const CHAVE_UTM = "champion_utm";
/** Marca que a atribuição desta aba veio de resgate, não do clique desta visita. */
export const CHAVE_RECUPERADO = "champion_utm_recovered";

export function lerAtribuicaoDaAba(): CamposAtribuicao {
  try {
    const cru = sessionStorage.getItem(CHAVE_UTM);
    if (cru) {
      const objeto = JSON.parse(cru);
      return { ...ATRIBUICAO_PADRAO, ...objeto };
    }
  } catch (e) {
    console.error("Error reading UTM data:", e);
  }
  return ATRIBUICAO_PADRAO;
}

/**
 * A visita inteira: lê URL + aba + disco, decide, grava.
 *
 * Mora aqui, e não no hook, para que o teste exercite ESTE código e não uma
 * cópia dele. O hook só chama esta função uma vez por carregamento.
 */
export function capturarAtribuicaoDaVisita(
  search: string,
  pathname: string,
  agora: number = Date.now(),
): Decisao {
  const daUrl = lerParametrosDaUrl(search);
  const daAba = lerAtribuicaoDaAba();
  const doDisco = lerAtribuicaoDoDisco();

  const decisao = decidirAtribuicao({ daUrl, daAba, doDisco, agora });

  // Visita orgânica numa URL sem etiqueta nenhuma: não há o que registrar.
  // Gravar o padrão aqui só sobrescreveria com `direct`/`none` o que a aba já
  // tivesse — e `direct`/`none` é justamente o padrão, não um dado observado.
  if (decisao.origem === "organico" && !temQualquerEtiqueta(daUrl)) {
    return decisao;
  }

  try {
    sessionStorage.setItem(CHAVE_UTM, JSON.stringify(decisao.dados));
    if (decisao.origem === "recuperado") {
      sessionStorage.setItem(CHAVE_RECUPERADO, "true");
    } else if (decisao.origem === "clique_pago") {
      // Clique pago novo apaga a marca de resgate da aba: a partir daqui a
      // origem é o clique, não o resgate.
      sessionStorage.removeItem(CHAVE_RECUPERADO);
    }
  } catch {
    /* armazenamento bloqueado (webview do Instagram): segue sem travar */
  }

  if (decisao.persistirEmDisco) {
    salvarAtribuicaoNoDisco(decisao.dados, agora, pathname);
  }

  return decisao;
}

// ── Rede de baixo no insert do lead ────────────────────────────────────────

/** Campos de anúncio que o resgate preenche quando vierem vazios. */
export const CAMPOS_RESGATAVEIS = [
  "campaign_id",
  "adset_id",
  "ad_id",
  "utm_content",
  "placement",
  "site_source_name",
] as const;

function vazio(v: unknown): boolean {
  return v === null || v === undefined || v === "" || v === "(not set)";
}

/** Campos do lead em que a macro literal da Meta pode aparecer. */
export const CAMPOS_COM_MACRO = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "adset_id",
  "ad_id",
  "placement",
  "site_source_name",
] as const;

/**
 * Tira a macro não substituída da Meta de TODOS os campos de atribuição.
 *
 * O painel e o gatilho do banco fazem a mesma coisa do lado de lá; esta é a
 * porta do navegador. Campo com macro vira NULO e não `"{{ad.id}}"`: um ID que
 * não identifica nada é pior que nenhum ID, porque casa com "um anúncio"
 * inexistente em toda leitura que fizer join por igualdade.
 */
export function sanitizarPayloadDeAtribuicao(
  payload: Record<string, string | null>,
): Record<string, string | null> {
  let mudou = false;
  const saida: Record<string, string | null> = { ...payload };
  for (const campo of CAMPOS_COM_MACRO) {
    const valor = saida[campo];
    if (typeof valor === "string" && /\{\{|\}\}/.test(valor)) {
      saida[campo] = null;
      mudou = true;
    }
  }
  if (mudou) {
    console.log("[atribuicao] macro literal da Meta descartada no insert do lead (clique de prévia no Gerenciador)");
  }
  return saida;
}

/**
 * REDE DE BAIXO: preenche o que o navegador não entregou no insert do lead.
 *
 * É o mesmo princípio do resgate de `placement` no gatilho
 * `recover_attribution_from_session` (migration 20260911150000) — o motivo de
 * o placement do Emerson ter vindo certo enquanto os utm_* vieram errados.
 *
 * A fonte aqui é o espelho em disco, e NÃO um SELECT em `lead_sessions`: essa
 * tabela não tem policy de SELECT pública desde 27/05/2026 (removida de
 * propósito, leitura só via service_role no `admin-data`), então uma consulta
 * do navegador voltaria vazia SEM ERRO — a pior forma de falhar. O espelho é
 * escrito no mesmo instante e a partir dos mesmos dados que criam a linha em
 * `lead_sessions`, então é a mesma informação, do lado de cá. O resgate pela
 * tabela, no servidor, continua sendo trabalho do gatilho.
 *
 * Só preenche campo VAZIO: valor entregue pelo navegador sempre manda.
 * Não toca em `utm_source`/`utm_medium`/`utm_campaign` — são eles que decidem
 * `attribution_source` no caminho curto do gatilho, e mexer neles aqui mudaria
 * a semântica dessa coluna sem passar pelo banco.
 */
export function resgatarAtribuicaoDoLead(
  payload: Record<string, string | null>,
  agora: number = Date.now(),
): Record<string, string | null> {
  // ── SANITIZAÇÃO NA PORTA DO INSERT (18/09/2026) ─────────────────────────
  //
  // `lerParametrosDaUrl` já descarta macro, mas ela roda na CAPTURA. Um
  // `sessionStorage` escrito ANTES desta correção, ou um payload montado por
  // outro caminho, ainda entrega `{{ad.id}}` literal ao insert — foi assim que
  // o lead do Vic (16/09, score 89) nasceu com os três IDs como macro crua no
  // banco e entrou na tabela de criativos como se fosse tráfego. Esta é a
  // última porta antes do banco, e é onde ela morre.
  const limpo = sanitizarPayloadDeAtribuicao(payload);

  const faltando = CAMPOS_RESGATAVEIS.filter((campo) => vazio(limpo[campo]));
  if (faltando.length === 0) return limpo;

  const guardada = lerAtribuicaoDoDisco();
  if (!dentroDaJanela(guardada, agora) || !temIdentificadorPago(guardada)) return limpo;

  const resgatado: Record<string, string | null> = { ...limpo };
  const usados: string[] = [];
  for (const campo of faltando) {
    const valor = sanitizarParam(
      ((guardada as Record<string, unknown>)[campo] as string | null) ?? null,
    );
    if (valor) {
      resgatado[campo] = valor;
      usados.push(campo);
    }
  }
  if (usados.length) {
    console.log("[atribuicao] rede de baixo no insert: resgatado do toque pago —", usados.join(", "));
  }
  return resgatado;
}
