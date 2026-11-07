/**
 * A COLUNA "ORIGEM" DA TABELA DE LEADS MOSTRA O ANÚNCIO, NÃO A COPY.
 *
 * O módulo `origemAnuncio.ts` já resolvia isso e já tem 60 asserções próprias
 * (`testar-origem-anuncio.mjs`). O defeito de 11/09/2026 não estava nele: o
 * painel de DETALHE usava o módulo, e a CÉLULA DA TABELA não. Ela tinha a sua
 * própria linha, com a prioridade invertida:
 *
 *     lead.creative_name_resolved || lead.ad_name_resolved || lead.utm_content
 *
 * `creative_name` é a copy — a Meta o gera do texto do post. Resultado na tela,
 * para um lead da CA 05:
 *
 *     CA 05 - Validados - Leads
 *     Não adianta nada fazer tudo n...
 *
 * quando o nome oficial, `Luis-Nathan Case #2 – V3`, estava no banco resolvido
 * por `ad_id` o tempo todo.
 *
 * Este teste cobre as duas metades do defeito:
 *   1. a CÉLULA usa o resolvedor (leitura estática do arquivo da tela);
 *   2. o RESOLVEDOR, com a forma de dado real dos leads da CA 05, devolve o
 *      nome do anúncio e nunca a copy.
 *
 * Nenhuma rede, nenhum banco, nenhum lead de produção.
 *
 * Rode com:  node scripts/testar-origem-na-tabela.mjs
 */
import fs from "node:fs";
import { transformSync } from "esbuild";

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

// ── o módulo real, transpilado em memória ──────────────────────────────────
const fonte = fs.readFileSync("src/lib/origemAnuncio.ts", "utf8");
const js = transformSync(fonte, { loader: "ts", format: "esm" }).code;
const { resolverOrigemAnuncio } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

const TELA = fs.readFileSync("src/pages/AdminAnalytics.tsx", "utf8");

/**
 * A célula da coluna Origem, isolada do resto do arquivo.
 *
 * Começa DEPOIS do comentário explicativo: ele cita o defeito antigo pelo nome
 * (`creative_name_resolved || …`), e incluí-lo faria a asserção "a célula não
 * lê creative_name" falhar contra o próprio texto que documenta a correção.
 */
function celulaDaOrigem() {
  const marca = TELA.indexOf("ORIGEM: campanha em cima");
  if (marca === -1) return null;
  const fim = TELA.indexOf("*/", marca);
  const inicio = TELA.indexOf("{(() => {", fim);
  if (fim === -1 || inicio === -1) return null;
  return TELA.slice(inicio, inicio + 3000);
}

// A copy real, compartilhada por DOIS anúncios diferentes na base.
const COPY = "Não adianta nada fazer tudo na sua operação, e ficar limitado no quanto pode escalar.  A Champion 2026-09-09-00552b7c4b52d450385e12687bf24964";

/** Forma exata de um lead da CA 05, como o backend entrega. */
const LEAD_CA05 = {
  utm_source: "ig",
  utm_medium: "paid_social",
  utm_campaign: "CA 05 - Validados - Leads",
  utm_content: "Luis-Nathan Case #2 – V3",
  utm_term: "Luis-Nathan Case #2 – V3",
  placement: "Instagram_Reels",
  campaign_id: "120252040734020116",
  adset_id: "120252040734030116",
  ad_id: "120252040734010116",
  campaign_name_resolved: "CA 05 - Validados - Leads",
  adset_name_resolved: "Luis-Nathan Case #2 – V3",
  adset_id_resolved: "120252040734030116",
  ad_name_resolved: "Luis-Nathan Case #2 – V3",
  creative_name_resolved: COPY,
  creative_id_resolved: "1328792392752112",
  ad_account_id_resolved: "act_1592493385874898",
  account_name_resolved: "CA 05 - BMsss",
  user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) Instagram 445.0.0.34.44",
};

console.log("\n═══ 1. A CÉLULA DA TABELA USA O RESOLVEDOR ═══\n");
{
  const celula = celulaDaOrigem();
  checar("a célula da coluna Origem foi localizada", !!celula);
  checar("a célula chama resolverOrigemAnuncio", !!celula && /resolverOrigemAnuncio\(lead as never\)/.test(celula));
  checar("o resolvedor está importado na tela", /import \{ resolverOrigemAnuncio \} from "@\/lib\/origemAnuncio"/.test(TELA));

  // O defeito literal: a copy vindo na frente do nome do anúncio.
  const prioridadeInvertida = /const\s+criativo\s*=\s*lead\.creative_name_resolved\s*\|\|/;
  checar("a prioridade invertida NÃO existe mais", !prioridadeInvertida.test(TELA));
  checar("nenhum lugar da tela põe a copy na frente do anúncio",
    !/creative_name_resolved\s*\|\|\s*lead\.ad_name_resolved/.test(TELA));

  checar("a célula exibe o anúncio resolvido", !!celula && /origem\.anuncio\.exibicao/.test(celula));
  checar("a célula exibe a campanha resolvida", !!celula && /origem\.campanha\.exibicao/.test(celula));
  checar("o fallback explícito existe", !!celula && /Anúncio não identificado/.test(celula));
  checar("o detalhe (conjunto/placement/ad id) vai para o tooltip",
    !!celula && /origem\.conjunto\.exibicao/.test(celula) && /origem\.placement\.exibicao/.test(celula) && /Ad ID/.test(celula));
  checar("a célula NÃO lê creative_name", !!celula && !/creative_name_resolved/.test(celula.replace(/\/\*[\s\S]*?\*\//g, "")));
}

console.log("\n═══ 2. O LEAD REAL DA CA 05 ═══");
console.log("Campanha + anúncio, como o fundador quer bater o olho.\n");
{
  const o = resolverOrigemAnuncio(LEAD_CA05);
  checar("campanha", o.campanha.exibicao === "CA 05 - Validados - Leads", o.campanha.exibicao);
  checar("ANÚNCIO é o nome real, não a copy", o.anuncio.exibicao === "Luis-Nathan Case #2 – V3", o.anuncio.exibicao);
  checar("e veio ancorado no ad_id", o.anuncio.evidencia === "resolvido_por_id" && o.anuncio.id === "120252040734010116", `${o.anuncio.evidencia} / ${o.anuncio.id}`);
  checar("a copy NÃO aparece como anúncio", !o.anuncio.exibicao.startsWith("Não adianta nada"));
  checar("conjunto", o.conjunto.exibicao === "Luis-Nathan Case #2 – V3", o.conjunto.exibicao);
  checar("conta resolvida por id", o.conta.id === "act_1592493385874898", String(o.conta.id));
  checar("placement", o.placement.exibicao === "Instagram Reels", o.placement.exibicao);
  checar("a copy continua disponível, mas como CRIATIVO", o.criativo.exibicao === COPY);
}

console.log("\n═══ 3. A MESMA COPY EM DOIS ANÚNCIOS DIFERENTES ═══");
console.log("É a prova de que creative_name não identifica anúncio nenhum.\n");
{
  const arthur = resolverOrigemAnuncio({
    ...LEAD_CA05, ad_id: "120239380042020044", ad_name_resolved: "Arthur Case #1",
    utm_content: "Arthur Case #1", utm_term: "Arthur Case #1",
    adset_name_resolved: "Arthur Case #1", creative_name_resolved: COPY,
  });
  const luis = resolverOrigemAnuncio(LEAD_CA05);
  checar("os dois têm a MESMA copy", arthur.criativo.exibicao === luis.criativo.exibicao);
  checar("e nomes de anúncio DIFERENTES", arthur.anuncio.exibicao !== luis.anuncio.exibicao,
    `${arthur.anuncio.exibicao} × ${luis.anuncio.exibicao}`);
  checar("e ad_ids diferentes", arthur.anuncio.id !== luis.anuncio.id);
  checar("Arthur exibe o próprio nome", arthur.anuncio.exibicao === "Arthur Case #1", arthur.anuncio.exibicao);
}

console.log("\n═══ 4. SEM NOME RESOLVIDO, CAI PARA O QUE FOI OBSERVADO ═══\n");
{
  const o = resolverOrigemAnuncio({
    ...LEAD_CA05, ad_name_resolved: null, campaign_name_resolved: null, adset_name_resolved: null,
  });
  checar("usa utm_content como anúncio", o.anuncio.exibicao === "Luis-Nathan Case #2 – V3", o.anuncio.exibicao);
  checar("e marca a evidência como observada", o.anuncio.evidencia === "observado", o.anuncio.evidencia);
  checar("mesmo assim a copy não entra", o.anuncio.exibicao !== COPY);
  checar("o ad_id continua guardado", o.anuncio.id === "120252040734010116");
}

console.log("\n═══ 5. SEM NADA, NÃO INVENTA ═══\n");
{
  const o = resolverOrigemAnuncio({ utm_source: "direct", creative_name_resolved: COPY });
  checar("anúncio fica não identificado", o.anuncio.evidencia === "ausente", o.anuncio.exibicao);
  checar("a copy NÃO preenche o vazio", o.anuncio.exibicao !== COPY, o.anuncio.exibicao);
  checar("e o lead não é marcado como pago", o.ehTrafegoPago === false);
  const pago = resolverOrigemAnuncio({ utm_source: "ig", fbclid: "abc", creative_name_resolved: COPY });
  checar("lead pago sem nome também não vira copy", pago.anuncio.exibicao !== COPY, pago.anuncio.exibicao);
  checar("e é reconhecido como pago", pago.ehTrafegoPago === true);
}

console.log("\n═══ 6. NOME MUDOU NA META: IDENTIDADE É O AD_ID ═══\n");
{
  const antes = resolverOrigemAnuncio(LEAD_CA05);
  const depois = resolverOrigemAnuncio({ ...LEAD_CA05, ad_name_resolved: "Case Ighor #4 - V2" });
  checar("o mesmo ad_id nos dois", antes.anuncio.id === depois.anuncio.id, String(antes.anuncio.id));
  checar("a tela mostra o nome ATUAL", depois.anuncio.exibicao === "Case Ighor #4 - V2", depois.anuncio.exibicao);
  checar("e o nome novo não apaga o id", depois.anuncio.id === "120252040734010116");
  // Dois anúncios com o MESMO nome continuam distintos pelo id.
  const outro = resolverOrigemAnuncio({ ...LEAD_CA05, ad_id: "999999999999", ad_name_resolved: "Case Ighor #4 - V2" });
  checar("nomes iguais NÃO fundem anúncios", outro.anuncio.id !== depois.anuncio.id, `${outro.anuncio.id} × ${depois.anuncio.id}`);
}

console.log("\n" + "═".repeat(70));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
