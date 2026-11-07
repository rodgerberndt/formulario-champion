// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDADE DE UMA LINHA DA TABELA "PERFORMANCE POR CRIATIVO"
//
// ── O defeito corrigido em 18/09/2026 ───────────────────────────────────────
// A rota `/creatives` agrupava tudo por NOME normalizado do anúncio
// (`normalizeKey(utm_content ?? ad_name)`). Nome não é identidade: em 12/09 o
// mesmo "Luis-Nathan Case #2 - V3" passou a rodar em TRÊS contas, e a auditoria
// de 18/09 mediu o estrago — uma chave engolindo 24 `ad_id` de 3 contas, e as
// somas batendo exatamente:
//
//   Case Ighor #7: 268,88 (CA02) + 36,82 (CA05) = 305,70  ← a linha do painel
//   H2- Luis-Nathan: 95,07 + 31,20 + 11,90     = 138,17  ← a linha do painel
//
// O R$ 176,75 por MQL que a tela mostrava para o V3 não existia em conta
// nenhuma: as contas reais eram 255,50 (CA05), 150,16 (CA02) e 180,14 (CA03).
// O experimento das 3 contas estava sendo lido por um número de ninguém.
//
// ── A regra, em uma frase ───────────────────────────────────────────────────
// ID MANDA, NOME É APRESENTAÇÃO (feedback_anuncio_nao_e_criativo). A linha é o
// par (CONTA, ANÚNCIO); `ad_name`/`utm_content` só rotulam. O mesmo desenho já
// vigora em `contas_desempenho.ts` desde 14/09/2026.
//
// ── E o que o NOME ainda faz aqui (correção da tarde de 18/09) ──────────────
// Nem todo lead histórico tem `ad_id`: 76% dos leads desde 19/08 não têm
// `session_id`, e antes de setembro quase nenhum trazia os IDs do Meta. A
// primeira versão desta cascata dava LINHA PRÓPRIA a esses registros quando o
// nome servia a mais de um anúncio. Medido no mesmo dia, no filtro "Máximo":
// 285 linhas, 82 delas de nome — sem conta, sem um centavo — e era nelas que
// estavam os leads, enquanto o gasto dos MESMOS criativos ficava em linhas de
// `ad_id` com zero lead. O painel mostrava as duas metades da mesma verdade em
// linhas que nunca se encontram, e nenhuma linha fechava.
//
// A regra agora: NOME NUNCA CRIA LINHA. Ele resolve um anúncio de verdade —
// preferindo o da MESMA CONTA, deduzida do registro, da campanha ou do
// conjunto — e, quando nenhum anúncio conhecido usa aquele nome, cai num balde
// só (`CHAVE_SEM_ANUNCIO`). Dois baldes no lugar de oitenta e duas linhas.
//
// ── Por que macro literal é um balde separado ───────────────────────────────
// Clique em PRÉVIA de anúncio dentro do Gerenciador entrega a macro CRUA na
// URL (`ad_id={{ad.id}}`). Em 16/09/2026 um lead (Vic, score 89) nasceu com
// `campaign_id/adset_id/ad_id = "{{campaign.id}}"/"{{adset.id}}"/"{{ad.id}}"`
// no banco e entrou na tabela como tráfego. Não é tráfego pago nem é orgânico:
// é gente da casa abrindo a prévia. Balde próprio, fora dos dois.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fuso PADRÃO de conta de anúncio quando a Meta não declarou o dela.
 *
 * `ad_spend.date` é o `date_start` que a Meta devolve com `time_increment=1` —
 * ou seja, o dia NO FUSO DA CONTA. Leads e sessões são filtrados por
 * `created_at` em UTC. Hoje as três contas que gastam são UTC−3
 * (CA05/CA03 `Brazil/East`, CA02 `America/Belem`), idênticas ao BRT, e por isso
 * o deslocamento medido em 18/09/2026 foi de ZERO dias. Isso é coincidência de
 * cadastro, não desenho: basta uma conta fora de UTC−3 para gasto e leads
 * passarem a falar de dias diferentes sem aviso.
 */
export const FUSO_PADRAO_CONTA = "America/Sao_Paulo";

/** Minutos de deslocamento do fuso padrão em relação a UTC (−180 = UTC−3). */
export const OFFSET_PADRAO_MIN = -180;

/** Chave e rótulo do balde de quem chegou sem criativo nenhum. */
export const CHAVE_SEM_ATRIBUICAO = "direct-link-in-bio";
export const ROTULO_SEM_ATRIBUICAO = "Direct / Link in Bio";

/**
 * Balde da PRÉVIA do Gerenciador — separado do orgânico de propósito.
 * Ver o cabeçalho: macro literal não é clique de tráfego.
 */
export const CHAVE_PREVIA = "previa-gerenciador";
export const ROTULO_PREVIA = "Prévia / interno (macro não substituída)";

/**
 * Balde de quem TEM nome de criativo mas nenhum anúncio conhecido com ele.
 *
 * ── O defeito corrigido em 18/09/2026, à tarde ──────────────────────────────
 * A primeira versão desta cascata devolvia UMA LINHA POR NOME quando o nome
 * servia a mais de um anúncio (`nome_ambiguo`). Na janela de 7 dias isso era
 * pequeno; no filtro "Máximo" virou o painel inteiro: 285 linhas, 82 delas de
 * nome, sem conta e sem um centavo de gasto — e é nelas que os leads estavam.
 * Medido no dia: "Arthur Case #1 · anúncio não identificado" com 352 leads e
 * R$ 0,00, enquanto o gasto do mesmo criativo ficava em linhas de `ad_id` com
 * 0 lead. A tabela mostrava as duas metades da mesma verdade em linhas que
 * nunca se encontram.
 *
 * Agora nome NUNCA cria linha própria: ou ele casa com um anúncio de verdade
 * (de preferência DA MESMA CONTA — ver `resolverIdentidade`), ou cai aqui, num
 * balde só. Duas linhas no lugar de oitenta e duas.
 */
export const CHAVE_SEM_ANUNCIO = "sem-anuncio-identificado";
export const ROTULO_SEM_ANUNCIO = "Sem anúncio identificado (nome sem correspondência)";

/** Conta desconhecida: o anúncio existe, a conta dele não foi encontrada. */
export const CONTA_DESCONHECIDA = "(sem conta)";

/**
 * A Meta mandou a macro crua (`{{ad.id}}`, `{{campaign.name}}`)?
 *
 * Testa `{{` E `}}` separadamente porque valor truncado no meio do caminho
 * (URL cortada, coluna com limite) chega com só uma das duas pontas — e
 * continua não sendo dado.
 */
export function ehMacroLiteral(valor: unknown): boolean {
  return typeof valor === "string" && (valor.includes("{{") || valor.includes("}}"));
}

/**
 * O valor que vale, ou nulo.
 *
 * Única porta de entrada para `campaign_id`/`adset_id`/`ad_id`/`utm_*` em
 * TODAS as leituras do painel. Vazio, `(not set)` e macro literal nunca são
 * dado.
 */
export function sanitizarIdentificador(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  if (limpo === "(not set)") return null;
  if (ehMacroLiteral(limpo)) return null;
  return limpo;
}

/** A normalização histórica do nome. NÃO muda: `manual_sales.creative_key` usa esta forma. */
export function normalizarChaveCriativo(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** O texto é o ID numérico cru do Meta? */
export function ehIdNumerico(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d+$/.test(valor);
}

/** Uma linha de `ad_spend` (ou do cache) reduzida ao que identifica um anúncio. */
export interface LinhaDeAnuncio {
  ad_account_id?: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  utm_content?: string | null;
  creative_key?: string | null;
  date?: string | null;
  /** `ad_spend.campaign_id` — é por ele que um lead sem `ad_id` acha a CONTA. */
  campaign_id?: string | null;
  /** `ad_spend.adset_id` — idem, um degrau abaixo. */
  adset_id?: string | null;
  /** Gasto da linha. Serve de DESEMPATE quando um nome serve a vários anúncios. */
  spend?: number | string | null;
}

export interface IndiceDeAnuncios {
  /** `ad_id` → conta em que o `ad_spend` registrou o anúncio. */
  contaDoAnuncio: Map<string, string>;
  /** `ad_id` → nome atual do anúncio (o da linha de gasto MAIS RECENTE). */
  nomeDoAnuncio: Map<string, string>;
  /** nome normalizado → todos os `ad_id` que já usaram esse nome. */
  anunciosPorNome: Map<string, Set<string>>;
  /** `${conta}|${nome normalizado}` → os `ad_id` DAQUELA conta com aquele nome. */
  anunciosPorContaENome: Map<string, Set<string>>;
  /** `campaign_id` → conta. O caminho do meio quando o lead não tem `ad_id`. */
  contaDaCampanha: Map<string, string>;
  /** `adset_id` → conta. */
  contaDoConjunto: Map<string, string>;
  /** `ad_id` → gasto somado nas linhas que montaram o índice. Só desempate. */
  gastoDoAnuncio: Map<string, number>;
}

/** Chave composta conta+nome. Uma função só, para os dois lados nunca divergirem. */
export function chaveContaNome(conta: string, chaveNome: string): string {
  return `${conta}|${chaveNome}`;
}

/**
 * Índice de identidade a partir das linhas de gasto.
 *
 * O nome vem da linha mais RECENTE porque nome muda no Gerenciador e a tela
 * deve mostrar o atual — mesmo critério de `contas_desempenho.ts`.
 *
 * Desde 18/09/2026 (tarde) o índice também guarda: os anúncios por CONTA e
 * nome, a conta de cada campanha e de cada conjunto, e o gasto de cada anúncio.
 * Os três existem para o mesmo fim — resolver um registro que só tem NOME sem
 * inventar uma linha nova para ele. Ver `resolverIdentidade`.
 */
export function montarIndiceDeAnuncios(linhas: LinhaDeAnuncio[]): IndiceDeAnuncios {
  const contaDoAnuncio = new Map<string, string>();
  const nomeDoAnuncio = new Map<string, string>();
  const dataDoNome = new Map<string, string>();
  const anunciosPorNome = new Map<string, Set<string>>();
  const anunciosPorContaENome = new Map<string, Set<string>>();
  const contaDaCampanha = new Map<string, string>();
  const contaDoConjunto = new Map<string, string>();
  const gastoDoAnuncio = new Map<string, number>();

  for (const linha of linhas) {
    const conta = sanitizarIdentificador(linha.ad_account_id);
    if (conta) {
      const campanha = sanitizarIdentificador(linha.campaign_id);
      if (campanha && !contaDaCampanha.has(campanha)) contaDaCampanha.set(campanha, conta);
      const conjunto = sanitizarIdentificador(linha.adset_id);
      if (conjunto && !contaDoConjunto.has(conjunto)) contaDoConjunto.set(conjunto, conta);
    }

    const adId = sanitizarIdentificador(linha.ad_id);
    if (!adId) continue;
    if (conta && !contaDoAnuncio.has(adId)) contaDoAnuncio.set(adId, conta);

    const valor = Number(linha.spend);
    if (Number.isFinite(valor) && valor > 0) {
      gastoDoAnuncio.set(adId, (gastoDoAnuncio.get(adId) ?? 0) + valor);
    }

    const nomeBruto = sanitizarIdentificador(linha.ad_name) ?? sanitizarIdentificador(linha.utm_content);
    if (nomeBruto && !ehIdNumerico(nomeBruto)) {
      const quando = String(linha.date ?? "");
      if (!nomeDoAnuncio.has(adId) || quando >= (dataDoNome.get(adId) ?? "")) {
        nomeDoAnuncio.set(adId, nomeBruto);
        dataDoNome.set(adId, quando);
      }
      const chaveNome = sanitizarIdentificador(linha.creative_key) ?? normalizarChaveCriativo(nomeBruto);
      if (chaveNome) {
        if (!anunciosPorNome.has(chaveNome)) anunciosPorNome.set(chaveNome, new Set());
        anunciosPorNome.get(chaveNome)!.add(adId);
        const contaDele = conta ?? contaDoAnuncio.get(adId);
        if (contaDele) {
          const k = chaveContaNome(contaDele, chaveNome);
          if (!anunciosPorContaENome.has(k)) anunciosPorContaENome.set(k, new Set());
          anunciosPorContaENome.get(k)!.add(adId);
        }
      }
    }
  }

  return {
    contaDoAnuncio,
    nomeDoAnuncio,
    anunciosPorNome,
    anunciosPorContaENome,
    contaDaCampanha,
    contaDoConjunto,
    gastoDoAnuncio,
  };
}

/**
 * Entre vários anúncios candidatos, QUAL fica com a linha.
 *
 * Critério: o que mais gastou na janela; empate, o `ad_id` maior (o mais novo,
 * já que o Meta emite IDs crescentes). É determinístico de propósito — dois
 * carregamentos do painel não podem colocar o mesmo lead em linhas diferentes.
 */
export function escolherAnuncio(candidatos: Iterable<string>, indice: IndiceDeAnuncios): string | null {
  let melhor: string | null = null;
  let melhorGasto = -1;
  for (const adId of candidatos) {
    const gasto = indice.gastoDoAnuncio.get(adId) ?? 0;
    if (gasto > melhorGasto || (gasto === melhorGasto && melhor !== null && adId > melhor)) {
      melhor = adId;
      melhorGasto = gasto;
    }
  }
  return melhor;
}

/** Como a linha foi identificada. Vai na resposta: método fraco é para aparecer. */
export type MetodoIdentidade =
  /** `leads.ad_id` / `ad_spend.ad_id` — o caminho forte. */
  | "ad_id"
  /** `utm_content` era o ID numérico cru do Meta. Também é ID. */
  | "utm_content_id"
  /** Só o nome, e esse nome pertence a UM único anúncio na janela. */
  | "nome_unico"
  /** Só o nome, mas a CONTA era conhecida e o nome casou com anúncio dela. */
  | "nome_na_conta"
  /** Só o nome, conta desconhecida, nome em mais de um anúncio: ficou com o que mais gastou. */
  | "nome_por_gasto"
  /** Tem nome de criativo, mas nenhum anúncio conhecido usa esse nome. Balde. */
  | "sem_anuncio"
  /** Macro literal da Meta: prévia do Gerenciador, nem pago nem orgânico. */
  | "previa"
  /** Sem criativo nenhum: bio, direto, orgânico. */
  | "sem_atribuicao";

export interface IdentidadeDaLinha {
  /** Chave ÚNICA da linha da tabela. É por ela que tudo é agregado. */
  row_key: string;
  /** Nome normalizado — a identidade do CRIATIVO, não da linha. Compat com `manual_sales.creative_key`. */
  creative_key: string;
  /** O que aparece na tela. */
  creative_label: string;
  ad_id: string | null;
  ad_account_id: string | null;
  metodo: MetodoIdentidade;
}

/** Monta o `row_key` de um par (conta, anúncio). Formato estável, é chave de React. */
export function chaveDaLinha(conta: string | null, adId: string): string {
  return `${conta ?? CONTA_DESCONHECIDA}::${adId}`;
}

/** Nomes que sempre caem no balde "sem atribuição". */
export const NOMES_DIRETOS = new Set([
  "__sem_criativo__",
  "ad-name",
  "link-in-bio",
  "link_in_bio",
  "ad.name",
]);

export interface EntradaIdentidade {
  /** `leads.ad_id` / `ad_spend.ad_id`, cru como está no banco. */
  ad_id?: string | null;
  /** `leads.ad_account_id` quando existir; normalmente vem do índice. */
  ad_account_id?: string | null;
  /** `utm_content` (lead/sessão) ou `ad_name` (gasto), cru. */
  nome?: string | null;
  /** `campaign_id` do registro. Sem `ad_id`, é por ele que se acha a CONTA. */
  campaign_id?: string | null;
  /** `adset_id` do registro. Mesmo papel, um degrau abaixo. */
  adset_id?: string | null;
  /** Qualquer outro identificador cru que possa denunciar macro (campaign_id, adset_id). */
  outrosIds?: Array<string | null | undefined>;
}

/**
 * A identidade da linha para UM registro (lead, sessão, gasto, venda, reunião).
 *
 * Cascata, do mais forte ao mais fraco. NOME NUNCA CRIA LINHA: ou ele acha um
 * anúncio de verdade, ou o registro cai num balde.
 *
 *   0. macro literal em qualquer ID/nome  → balde PRÉVIA
 *   1. `ad_id`                            → (conta, ad_id)
 *   2. `utm_content` = ID numérico cru    → idem
 *   3. nome + CONTA conhecida (do próprio registro, ou deduzida de
 *      `campaign_id`/`adset_id`) e que casa com anúncio DAQUELA conta
 *                                         → a linha desse anúncio
 *   4. nome que casa com um anúncio só    → a linha dele ("nome_unico")
 *   5. nome que casa com vários e sem conta para desempatar
 *                                         → o que MAIS GASTOU ("nome_por_gasto")
 *   6. nome que não casa com nada         → balde SEM ANÚNCIO
 *   7. sem nome nenhum                    → balde SEM ATRIBUIÇÃO
 *
 * Por que 3–5 não devolvem mais uma linha por nome: ver `CHAVE_SEM_ANUNCIO`.
 * Em resumo — no filtro "Máximo" de 18/09/2026 isso produzia 82 linhas sem
 * conta e sem gasto, que juntas seguravam a maioria dos leads da base enquanto
 * o gasto dos MESMOS criativos ficava em linhas de `ad_id` com zero lead.
 */
export function resolverIdentidade(
  entrada: EntradaIdentidade,
  indice: IndiceDeAnuncios,
): IdentidadeDaLinha {
  const adIdCru = entrada.ad_id;
  const nomeCru = entrada.nome;

  // 5 antes de tudo: se QUALQUER identificador veio como macro, esta visita é
  // prévia do Gerenciador — e nenhuma outra pista dela vale como tráfego.
  const temMacro =
    ehMacroLiteral(adIdCru) ||
    ehMacroLiteral(nomeCru) ||
    ehMacroLiteral(entrada.ad_account_id) ||
    (entrada.outrosIds ?? []).some(ehMacroLiteral);
  if (temMacro) {
    return {
      row_key: CHAVE_PREVIA,
      creative_key: CHAVE_PREVIA,
      creative_label: ROTULO_PREVIA,
      ad_id: null,
      ad_account_id: null,
      metodo: "previa",
    };
  }

  const rotuloDe = (adId: string, reserva: string | null): string =>
    indice.nomeDoAnuncio.get(adId) ?? reserva ?? adId;

  /**
   * A CONTA de um anúncio, do mais certo ao menos certo.
   *
   * `contaDoAnuncio` só conhece anúncios que aparecem em `ad_spend` na janela
   * (ou no cache). Uma sessão pode trazer o `ad_id` de um anúncio que não
   * gastou no período — e aí a linha ficava "(sem conta)" tendo `campaign_id`
   * no próprio registro. Campanha e conjunto pertencem a uma conta só, então
   * são identidade tão boa quanto o anúncio; o nome vem por último, e só
   * quando ele existe numa conta única.
   */
  const contaDoRegistro = (adId: string, chaveDoNome: string): string | null => {
    const doRegistro = sanitizarIdentificador(entrada.ad_account_id);
    if (doRegistro) return doRegistro;
    const doAnuncio = indice.contaDoAnuncio.get(adId);
    if (doAnuncio) return doAnuncio;
    const campanha = sanitizarIdentificador(entrada.campaign_id);
    if (campanha && indice.contaDaCampanha.has(campanha)) return indice.contaDaCampanha.get(campanha)!;
    const conjunto = sanitizarIdentificador(entrada.adset_id);
    if (conjunto && indice.contaDoConjunto.has(conjunto)) return indice.contaDoConjunto.get(conjunto)!;
    if (chaveDoNome) {
      const contas = new Set<string>();
      for (const outro of indice.anunciosPorNome.get(chaveDoNome) ?? []) {
        const c = indice.contaDoAnuncio.get(outro);
        if (c) contas.add(c);
      }
      if (contas.size === 1) return [...contas][0];
    }
    return null;
  };

  const montar = (adId: string, metodo: MetodoIdentidade, reserva: string | null): IdentidadeDaLinha => {
    const rotuloProvisorio = rotuloDe(adId, reserva);
    const conta = contaDoRegistro(adId, normalizarChaveCriativo(rotuloProvisorio));
    const rotulo = rotuloProvisorio;
    return {
      row_key: chaveDaLinha(conta, adId),
      creative_key: normalizarChaveCriativo(rotulo) || adId,
      creative_label: rotulo,
      ad_id: adId,
      ad_account_id: conta,
      metodo,
    };
  };

  // 1. ad_id explícito.
  const adId = sanitizarIdentificador(adIdCru);
  if (adId) return montar(adId, "ad_id", sanitizarIdentificador(nomeCru));

  const nome = sanitizarIdentificador(nomeCru);
  const chaveNome = nome ? normalizarChaveCriativo(nome) : "";

  if (!nome || !chaveNome || NOMES_DIRETOS.has(chaveNome)) {
    return {
      row_key: CHAVE_SEM_ATRIBUICAO,
      creative_key: CHAVE_SEM_ATRIBUICAO,
      creative_label: ROTULO_SEM_ATRIBUICAO,
      ad_id: null,
      ad_account_id: null,
      metodo: "sem_atribuicao",
    };
  }

  // 2. utm_content era o ID numérico cru do Meta.
  if (ehIdNumerico(nome)) return montar(nome, "utm_content_id", null);

  // 3. A CONTA primeiro. Sem `ad_id`, ela ainda pode vir do próprio registro,
  //    da campanha ou do conjunto — e é ela que torna o nome uma identidade
  //    ("Luis-Nathan Case #2 - V3 NA CA 02" é um anúncio; o nome sozinho, não).
  const contaConhecida =
    sanitizarIdentificador(entrada.ad_account_id) ??
    (sanitizarIdentificador(entrada.campaign_id)
      ? indice.contaDaCampanha.get(sanitizarIdentificador(entrada.campaign_id)!)
      : undefined) ??
    (sanitizarIdentificador(entrada.adset_id)
      ? indice.contaDoConjunto.get(sanitizarIdentificador(entrada.adset_id)!)
      : undefined) ??
    null;

  if (contaConhecida) {
    const naConta = indice.anunciosPorContaENome.get(chaveContaNome(contaConhecida, chaveNome));
    if (naConta && naConta.size > 0) {
      const escolhido = escolherAnuncio(naConta, indice)!;
      return montar(escolhido, naConta.size === 1 ? "nome_unico" : "nome_na_conta", nome);
    }
  }

  // 4 e 5. Sem conta (ou a conta não tem esse nome): vale o conjunto todo.
  const candidatos = indice.anunciosPorNome.get(chaveNome);
  if (candidatos && candidatos.size > 0) {
    const escolhido = escolherAnuncio(candidatos, indice)!;
    return montar(escolhido, candidatos.size === 1 ? "nome_unico" : "nome_por_gasto", nome);
  }

  // 6. O nome existe e não casa com anúncio nenhum. UM balde, nunca uma linha.
  return {
    row_key: CHAVE_SEM_ANUNCIO,
    creative_key: CHAVE_SEM_ANUNCIO,
    creative_label: ROTULO_SEM_ANUNCIO,
    ad_id: null,
    ad_account_id: null,
    metodo: "sem_anuncio",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTA MÉDIA — nunca some duas réguas
// ─────────────────────────────────────────────────────────────────────────────
//
// `v2.3` (quiz, 6 componentes) e `v3-form` (formulário curto, só faturamento +
// mercado renormalizado) são ambas 0–100 e NÃO são a mesma régua. Medido em
// 18/09/2026, mesma faixa de faturamento:
//
//   faixa                 v2.3    v3-form
//   Não vendo ainda       20,0      5,0
//   Até R$ 5 mil          42,5      9,0
//   De R$ 5 a 10 mil      32,0     13,0
//   De R$ 10 a 20 mil     43,8     20,0
//   setembro inteiro      52,8     11,8
//
// A média aritmética das duas é um número que não existe em régua nenhuma, e
// as cores da coluna (≥75 / ≥50 / ≥25) são as do quiz. O corte de HQL já é por
// versão (`ehHighQualityLead`) e não é tocado aqui.

/** Soma de notas de UMA versão de score. */
export interface SomaDeNota {
  soma: number;
  n: number;
}

export interface NotasPorVersao {
  /** versão → soma e contagem. Chaves: "v2.3", "v3-form", ... */
  porVersao: Record<string, SomaDeNota>;
}

export function novaNotaPorVersao(): NotasPorVersao {
  return { porVersao: {} };
}

/** Versão canônica do score de um lead. Nulo/desconhecido é o quiz, como em `hql.ts`. */
export function versaoDoScore(scoreVersion: string | null | undefined, padrao: string): string {
  const v = typeof scoreVersion === "string" ? scoreVersion.trim().toLowerCase() : "";
  return v || padrao;
}

export function acumularNota(alvo: NotasPorVersao, versao: string, nota: number): void {
  const atual = (alvo.porVersao[versao] ??= { soma: 0, n: 0 });
  atual.soma += nota;
  atual.n += 1;
}

export interface MediaPorVersao {
  /** versão → { media, n }. */
  versoes: Record<string, { media: number; n: number }>;
  /** A versão com MAIS leads na linha. É a média que a coluna mostra. */
  versao_dominante: string | null;
  /** A média da versão dominante — nunca a média das duas juntas. */
  media_dominante: number | null;
  /** Há mais de uma régua nesta linha? A tela avisa em vez de somar em silêncio. */
  misturado: boolean;
  /** Quantos leads ficaram FORA da média mostrada (as outras versões). */
  n_fora: number;
}

/** Fecha as somas em médias, sem nunca juntar réguas diferentes. */
export function fecharNotas(notas: NotasPorVersao): MediaPorVersao {
  const versoes: Record<string, { media: number; n: number }> = {};
  let dominante: string | null = null;
  let maiorN = 0;
  let total = 0;
  for (const [versao, s] of Object.entries(notas.porVersao)) {
    if (s.n <= 0) continue;
    versoes[versao] = { media: Math.round((s.soma / s.n) * 10) / 10, n: s.n };
    total += s.n;
    if (s.n > maiorN) {
      maiorN = s.n;
      dominante = versao;
    }
  }
  return {
    versoes,
    versao_dominante: dominante,
    media_dominante: dominante ? versoes[dominante].media : null,
    misturado: Object.keys(versoes).length > 1,
    n_fora: total - maiorN,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUSO — o dia da Meta contra o dia do banco
// ─────────────────────────────────────────────────────────────────────────────

/** Deslocamento de um fuso IANA em minutos, na data dada (−180 para BRT). */
export function offsetDoFusoEmMinutos(fuso: string, quando: Date = new Date()): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, string> = {};
    for (const parte of fmt.formatToParts(quando)) p[parte.type] = parte.value;
    const local = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second),
    );
    return Math.round((local - quando.getTime()) / 60000);
  } catch {
    // Fuso desconhecido nunca derruba o painel: cai no padrão declarado.
    return OFFSET_PADRAO_MIN;
  }
}

/**
 * O dia (AAAA-MM-DD) de um instante NO FUSO DA CONTA.
 *
 * Substitui os dois `new Date().toISOString().slice(0,10)` que decidiam o MÊS
 * DO CAC e a bolinha de "ativo" em UTC. Entre 21:00 e 00:00 BRT do último dia
 * do mês, o UTC já virou o mês seguinte e o CAC passava a dividir a mídia do
 * mês novo (quase zero) pelas vendas do mês novo (zero).
 */
export function diaNoFuso(quando: Date, fuso: string = FUSO_PADRAO_CONTA): string {
  const offset = offsetDoFusoEmMinutos(fuso, quando);
  return new Date(quando.getTime() + offset * 60000).toISOString().slice(0, 10);
}

export interface FusoDaConta {
  ad_account_id: string;
  account_name: string | null;
  /** O que a Meta declara. Nulo enquanto a coluna não existir / não tiver sido lida. */
  timezone_name: string | null;
  /** Fuso efetivamente usado: o da conta, ou `FUSO_PADRAO_CONTA`. */
  fuso_usado: string;
  offset_min: number;
  /** O fuso da conta difere do fuso em que a tela montou o filtro? */
  divergente: boolean;
}

/**
 * Diagnóstico de fuso por conta.
 *
 * Não reescreve dia nenhum — com `ad_spend` guardando só o dia agregado, é
 * impossível remontar as horas. O que dá para fazer, e é o que se faz aqui, é
 * DECLARAR o fuso de cada conta e avisar quando ele diverge do fuso do filtro.
 * Enquanto as três contas que gastam forem UTC−3, `divergente` é falso em todas
 * e o deslocamento é zero — que foi exatamente o medido em 18/09/2026.
 */
export function diagnosticarFusos(
  contas: Array<{ ad_account_id: string; account_name?: string | null; timezone_name?: string | null }>,
  offsetDoFiltroMin: number = OFFSET_PADRAO_MIN,
  quando: Date = new Date(),
): FusoDaConta[] {
  return contas.map((c) => {
    const declarado = sanitizarIdentificador(c.timezone_name);
    const fusoUsado = declarado ?? FUSO_PADRAO_CONTA;
    const offset = offsetDoFusoEmMinutos(fusoUsado, quando);
    return {
      ad_account_id: c.ad_account_id,
      account_name: c.account_name ?? null,
      timezone_name: declarado,
      fuso_usado: fusoUsado,
      offset_min: offset,
      divergente: offset !== offsetDoFiltroMin,
    };
  });
}

/**
 * Offset do fuso em que a TELA montou o filtro, deduzido do `from` recebido.
 *
 * O front manda `startOfDay(local).toISOString()`: "2026-09-12T03:00:00Z" é
 * 00:00 em UTC−3, e "2026-09-11T22:00:00Z" seria 00:00 em UTC+2. A hora do
 * `from` diz o offset: até meio-dia UTC ele é negativo (a oeste de Greenwich),
 * depois é o complemento de 24 h (a leste).
 */
export function offsetDoFiltro(from: string | null | undefined): number {
  if (!from || !from.includes("T")) return OFFSET_PADRAO_MIN;
  const d = new Date(from);
  if (!Number.isFinite(d.getTime())) return OFFSET_PADRAO_MIN;
  const minutosUtc = d.getUTCHours() * 60 + d.getUTCMinutes();
  return minutosUtc <= 720 ? -minutosUtc : 1440 - minutosUtc;
}
