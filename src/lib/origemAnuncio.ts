/**
 * ORIGEM DO ANÚNCIO — resolução da hierarquia CONTA → CAMPANHA → CONJUNTO → ANÚNCIO.
 *
 * Existe por causa de um caso real. Em 10/09/2026 o lead `74382da7` apareceu no
 * painel com "Anúncio / Criativo" preenchido pelo texto da copy:
 *
 *   "Não adianta nada fazer tudo na sua operação, e ficar limitado no quanto
 *    pode escalar.  A Champion 2026-09-09-00552b7c4b52d450385e12687bf24964"
 *
 * O nome oficial do anúncio era "Luis-Nathan Case #2 – V3", e estava no banco o
 * tempo todo. O card preferia `creative_name`, que a Meta gera automaticamente
 * a partir do texto do post quando o criativo nasce de uma publicação.
 *
 * A prioridade errada tinha um motivo histórico: os anúncios antigos se
 * chamavam literalmente "Ad" e "Ad — Cópia", e aí `creative_name` de fato
 * informava mais. A estrutura mudou, os anúncios ganharam nome próprio, e a
 * regra ficou para trás. Pior: `creative_name` NÃO IDENTIFICA o anúncio — dois
 * anúncios diferentes na base têm exatamente o mesmo `creative_name`, porque
 * reaproveitam a mesma copy.
 *
 * Três princípios, e nenhum deles é negociável aqui:
 *
 *   1. ID manda. Nome é apresentação. Nunca casar entidade por nome quando
 *      existe ID.
 *   2. ANÚNCIO e CRIATIVO são entidades diferentes. Copy nunca vira nome de
 *      anúncio.
 *   3. FONTE, PLACEMENT e DEVICE são três dimensões distintas. Nenhuma serve de
 *      fallback silencioso para outra.
 *
 * Quando falta dado, o resultado é "não identificado" com o nível de evidência
 * explícito. Nada é inventado.
 */

/** De onde veio o valor que está na tela. */
export type Evidencia =
  | "resolvido_por_id"   // veio da Meta, ancorado num ID técnico
  | "observado"          // veio na URL do clique, é o que o lead realmente viu
  | "ausente";           // não temos

export interface CampoOrigem {
  /** Texto pronto para a tela. Nunca nulo: cai em "Não identificado". */
  exibicao: string;
  /** Valor cru, preservado para auditoria. */
  bruto: string | null;
  /** ID técnico da entidade, quando existe. */
  id: string | null;
  evidencia: Evidencia;
  /** Observação curta para a tela (ex.: "não detalhado"). */
  nota?: string;
}

export interface OrigemAnuncio {
  conta: CampoOrigem;
  campanha: CampoOrigem;
  conjunto: CampoOrigem;
  anuncio: CampoOrigem;
  criativo: CampoOrigem;
  plataforma: CampoOrigem;
  placement: CampoOrigem;
  device: CampoOrigem;
  /** Houve clique em anúncio? (fbclid ou qualquer ID da hierarquia) */
  ehTrafegoPago: boolean;
}

/** Campos que o backend entrega por lead. Todos opcionais de propósito. */
export interface LeadParaOrigem {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  placement?: string | null;
  site_source_name?: string | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  ad_id?: string | null;
  fbclid?: string | null;
  user_agent?: string | null;
  device_type?: string | null;
  // resolvidos pelo backend a partir dos IDs
  account_name_resolved?: string | null;
  ad_account_id_resolved?: string | null;
  campaign_name_resolved?: string | null;
  adset_name_resolved?: string | null;
  adset_id_resolved?: string | null;
  ad_name_resolved?: string | null;
  creative_name_resolved?: string | null;
  creative_id_resolved?: string | null;
  creative_thumbnail_url_resolved?: string | null;
}

const NAO_IDENTIFICADO = "Não identificado";

/** Macro do Gerenciador que não expandiu: `{{ad.name}}` chegou literal. */
export function ehMacroCrua(v: unknown): boolean {
  return typeof v === "string" && /\{\{.*\}\}/.test(v);
}

/** Só dígitos: é um ID do Meta ocupando um campo de nome. */
function ehIdNumerico(v: unknown): v is string {
  return typeof v === "string" && /^\d+$/.test(v.trim());
}

/** Texto aproveitável: não vazio, não macro crua, não ID numérico cru. */
function textoUtil(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || ehMacroCrua(t) || ehIdNumerico(t)) return null;
  return t;
}

const ausente = (bruto: string | null = null, id: string | null = null, nota?: string): CampoOrigem => ({
  exibicao: NAO_IDENTIFICADO,
  bruto,
  id,
  evidencia: "ausente",
  ...(nota ? { nota } : {}),
});

// ── PLATAFORMA ──────────────────────────────────────────────────────────────
//
// `{{site_source_name}}` da Meta devolve exatamente estes quatro códigos. Eles
// são a PLATAFORMA onde o anúncio apareceu, não o placement.
const PLATAFORMAS: Record<string, string> = {
  ig: "Instagram",
  fb: "Facebook",
  an: "Audience Network",
  msg: "Messenger",
};

/** Código bruto → nome legível. `an` NUNCA vira Instagram ou Facebook. */
export function nomePlataforma(bruto: string | null | undefined): string | null {
  const t = textoUtil(bruto);
  if (!t) return null;
  return PLATAFORMAS[t.toLowerCase()] ?? null;
}

// ── PLACEMENT ───────────────────────────────────────────────────────────────
//
// `{{placement}}` devolve valores como `Instagram_Stories` ou
// `Facebook_Right_Column`. Mas em Audience Network a Meta devolve só `an` —
// o mesmo código da plataforma. Isso NÃO é o nosso sistema usando source como
// placement: é a Meta não tendo granularidade ali. Provado no lead `74382da7`,
// cuja URL trouxe `utm_source=an` E `utm_placement=an` como parâmetros
// separados e independentes.
//
// Quando isso acontece, a tela precisa dizer "não detalhado" em vez de repetir
// um código que o leitor vai confundir com a plataforma.
export function descreverPlacement(bruto: string | null | undefined): { exibicao: string; nota?: string; granular: boolean } {
  if (ehMacroCrua(bruto)) {
    return { exibicao: NAO_IDENTIFICADO, nota: "macro não expandida no Gerenciador", granular: false };
  }
  const t = textoUtil(bruto);
  if (!t) return { exibicao: NAO_IDENTIFICADO, nota: "não informado na URL", granular: false };

  const plataforma = PLATAFORMAS[t.toLowerCase()];
  if (plataforma) {
    // Valor no nível da plataforma: a Meta não detalhou.
    return { exibicao: `${plataforma} (não detalhado)`, nota: "a Meta não informou placement granular para este clique", granular: false };
  }
  // `Instagram_Stories` → `Instagram Stories`
  return { exibicao: t.replace(/_/g, " ").trim(), granular: true };
}

// ── DEVICE ──────────────────────────────────────────────────────────────────
//
// Dimensão própria, derivada do user agent. NUNCA usada para inferir placement.
export function descreverDevice(userAgent: string | null | undefined, deviceType?: string | null): CampoOrigem {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (!ua && !deviceType) return ausente();

  const inApp = /Instagram|FBAN|FBAV|FB_IAB/i.test(ua) ? " · navegador in-app" : (/\bwv\b/i.test(ua) ? " · webview" : "");
  let base: string | null = null;
  if (/iPhone/i.test(ua)) base = "iPhone";
  else if (/iPad/i.test(ua)) base = "iPad";
  else if (/Android/i.test(ua)) {
    // "Redmi Note 7 Build/..." → "Redmi Note 7"
    const modelo = ua.match(/Android [\d.]+;\s*([^;)]+?)\s*(?:Build\/|\))/i)?.[1]?.trim();
    base = modelo ? `Android · ${modelo}` : "Android";
  } else if (/Windows|Macintosh|X11|Linux/i.test(ua)) base = "Desktop";

  if (!base) {
    if (!deviceType) return ausente(ua || null);
    return { exibicao: deviceType, bruto: deviceType, id: null, evidencia: "observado" };
  }
  return { exibicao: base + inApp, bruto: ua || deviceType || null, id: null, evidencia: "observado", nota: "derivado do user agent" };
}

// ── A RESOLUÇÃO ─────────────────────────────────────────────────────────────

export function resolverOrigemAnuncio(lead: LeadParaOrigem | null | undefined): OrigemAnuncio {
  const l = lead ?? {};

  // CONTA — só existe resolvida por ID. Não há UTM de conta.
  const conta: CampoOrigem = l.ad_account_id_resolved
    ? {
        exibicao: textoUtil(l.account_name_resolved) ?? l.ad_account_id_resolved,
        bruto: l.account_name_resolved ?? null,
        id: l.ad_account_id_resolved,
        evidencia: "resolvido_por_id",
      }
    : ausente(null, null, "a conta só é conhecida resolvendo o anúncio na Meta");

  // CAMPANHA — 1) nome por campaign_id  2) utm_campaign observado  3) ausente
  const campanhaObservada = textoUtil(l.utm_campaign);
  const campanha: CampoOrigem = textoUtil(l.campaign_name_resolved)
    ? { exibicao: textoUtil(l.campaign_name_resolved)!, bruto: l.utm_campaign ?? null, id: l.campaign_id ?? null, evidencia: "resolvido_por_id" }
    : campanhaObservada
      ? { exibicao: campanhaObservada, bruto: l.utm_campaign ?? null, id: l.campaign_id ?? null, evidencia: "observado", nota: "nome capturado na URL do clique" }
      : ausente(l.utm_campaign ?? null, l.campaign_id ?? null);

  // CONJUNTO — 1) nome por adset_id  2) utm_term, SÓ se ele carregar algo
  //    diferente de utm_content.
  //
  // A ressalva do utm_term não é preciosismo. No padrão em uso hoje ele vem
  // preenchido com o NOME DO ANÚNCIO, idêntico ao utm_content. Usá-lo como
  // nome do conjunto exibiria o anúncio no lugar do conjunto — trocar uma
  // entidade por outra é exatamente o defeito que este módulo existe para
  // corrigir.
  const adsetId = l.adset_id_resolved ?? l.adset_id ?? null;
  const termObservado = textoUtil(l.utm_term);
  const termEhOAnuncio = !!termObservado && termObservado === textoUtil(l.utm_content);
  const conjunto: CampoOrigem = textoUtil(l.adset_name_resolved)
    ? { exibicao: textoUtil(l.adset_name_resolved)!, bruto: l.utm_term ?? null, id: adsetId, evidencia: "resolvido_por_id" }
    : termObservado && !termEhOAnuncio
      ? { exibicao: termObservado, bruto: l.utm_term ?? null, id: adsetId, evidencia: "observado", nota: "utm_term capturado na URL" }
      : ausente(l.utm_term ?? null, adsetId, termEhOAnuncio ? "utm_term repete o nome do anúncio, não informa o conjunto" : undefined);

  // ANÚNCIO — 1) ad_name por ad_id  2) utm_content observado  3) ausente.
  //
  // `creative_name` NÃO entra nesta cadeia em hipótese nenhuma. É a copy.
  const conteudoObservado = textoUtil(l.utm_content);
  const anuncio: CampoOrigem = textoUtil(l.ad_name_resolved)
    ? { exibicao: textoUtil(l.ad_name_resolved)!, bruto: l.utm_content ?? null, id: l.ad_id ?? null, evidencia: "resolvido_por_id" }
    : conteudoObservado
      ? { exibicao: conteudoObservado, bruto: l.utm_content ?? null, id: l.ad_id ?? null, evidencia: "observado", nota: "utm_content capturado na URL, não confirmado na Meta" }
      : ausente(l.utm_content ?? null, l.ad_id ?? null);

  // CRIATIVO — entidade separada. Aqui a copy é bem-vinda, porque é o que ela é.
  const nomeCriativo = textoUtil(l.creative_name_resolved);
  const criativo: CampoOrigem = nomeCriativo
    ? { exibicao: nomeCriativo, bruto: l.creative_name_resolved ?? null, id: l.creative_id_resolved ?? null, evidencia: "resolvido_por_id", nota: "nome do criativo na Meta (costuma ser o texto da copy)" }
    : ausente(null, l.creative_id_resolved ?? null);

  // PLATAFORMA — site_source_name quando existir; senão utm_source, que é onde
  // a macro {{site_source_name}} deposita no padrão em uso.
  const plataformaBruta = textoUtil(l.site_source_name) ?? textoUtil(l.utm_source);
  const nome = nomePlataforma(plataformaBruta);
  const plataforma: CampoOrigem = nome
    ? { exibicao: nome, bruto: plataformaBruta, id: null, evidencia: "observado" }
    : plataformaBruta
      ? { exibicao: plataformaBruta, bruto: plataformaBruta, id: null, evidencia: "observado", nota: "código fora do vocabulário da Meta (ig/fb/an/msg)" }
      : ausente(l.utm_source ?? null);

  // PLACEMENT — dimensão independente. Sem fallback para a fonte.
  const desc = descreverPlacement(l.placement);
  const placement: CampoOrigem = {
    exibicao: desc.exibicao,
    bruto: l.placement ?? null,
    id: null,
    evidencia: textoUtil(l.placement) ? "observado" : "ausente",
    ...(desc.nota ? { nota: desc.nota } : {}),
  };

  const device = descreverDevice(l.user_agent, l.device_type);

  const ehTrafegoPago = !!(l.fbclid || l.ad_id || l.campaign_id || l.adset_id);

  return { conta, campanha, conjunto, anuncio, criativo, plataforma, placement, device, ehTrafegoPago };
}
