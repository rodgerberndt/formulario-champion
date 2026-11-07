/**
 * Testes da resolução de "Origem do Anúncio".
 *
 * O caso que originou tudo: o lead 74382da7 (10/09/2026) apareceu no painel com
 * o texto da copy no lugar do nome do anúncio. O nome oficial estava no banco.
 *
 * Rode com:  node scripts/testar-origem-anuncio.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import esbuild from "esbuild";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fonte = readFileSync(resolve(raiz, "src/lib/origemAnuncio.ts"), "utf8");
const js = esbuild.transformSync(fonte, { loader: "ts", format: "esm" }).code;
const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { resolverOrigemAnuncio } = mod;

let passou = 0, falhou = 0;
const falhas = [];

function checar(caso, campo, obtido, esperado) {
  const ok = obtido === esperado;
  if (ok) passou++;
  else { falhou++; falhas.push(`${caso} → ${campo}\n      esperado: ${JSON.stringify(esperado)}\n      obtido:   ${JSON.stringify(obtido)}`); }
  console.log(`   ${ok ? "OK  " : "FALHA"}  ${campo.padEnd(34)} ${JSON.stringify(obtido)}`);
}

function checarQue(caso, campo, condicao, descricao) {
  if (condicao) passou++;
  else { falhou++; falhas.push(`${caso} → ${campo}: ${descricao}`); }
  console.log(`   ${condicao ? "OK  " : "FALHA"}  ${campo.padEnd(34)} ${descricao}`);
}

const COPY_LONGA =
  "Não adianta nada fazer tudo na sua operação, e ficar limitado no quanto pode escalar.\n\nA Champion 2026-09-09-00552b7c4b52d450385e12687bf24964";

// ════════════════════════════════════════════════════════════════════════════
console.log("\n═══ CASO REAL — lead 74382da7 (Eric, 10/09/2026) ═══");
console.log("Regressão do defeito: a copy não pode aparecer como nome do anúncio.\n");
{
  const c = "lead real";
  const o = resolverOrigemAnuncio({
    utm_source: "an", utm_medium: "paid_social",
    utm_campaign: "CA 05 - Validados - Leads",
    utm_content: "Luis-Nathan Case #2 – V3",
    utm_term: "Luis-Nathan Case #2 – V3",
    placement: "an",
    campaign_id: "120252040734020116",
    adset_id: "120252040734030116",
    ad_id: "120252040734010116",
    fbclid: "IwY2xjawUPXfRw",
    user_agent: "Mozilla/5.0 (Linux; Android 10; Redmi Note 7 Build/QKQ1.190910.002; wv) AppleWebKit/537.36",
    ad_account_id_resolved: "act_1592493385874898",
    account_name_resolved: "CA 05 - BMsss",
    campaign_name_resolved: "CA 05 - Validados - Leads",
    adset_name_resolved: "Case Ighor #2",
    adset_id_resolved: "120252040734030116",
    ad_name_resolved: "Luis-Nathan Case #2 – V3",
    creative_name_resolved: COPY_LONGA,
  });
  checar(c, "conta.exibicao", o.conta.exibicao, "CA 05 - BMsss");
  checar(c, "campanha.exibicao", o.campanha.exibicao, "CA 05 - Validados - Leads");
  checar(c, "conjunto.exibicao", o.conjunto.exibicao, "Case Ighor #2");
  checar(c, "anuncio.exibicao", o.anuncio.exibicao, "Luis-Nathan Case #2 – V3");
  checarQue(c, "anuncio NÃO é a copy", !o.anuncio.exibicao.includes("Não adianta nada"), "a copy não vazou para o nome do anúncio");
  checar(c, "criativo.exibicao", o.criativo.exibicao, COPY_LONGA);
  checar(c, "plataforma.exibicao", o.plataforma.exibicao, "Audience Network");
  checar(c, "placement.exibicao", o.placement.exibicao, "Audience Network (não detalhado)");
  checar(c, "device.exibicao", o.device.exibicao, "Android · Redmi Note 7 · webview");
  checarQue(c, "nada de 'an' cru na tela", ![o.plataforma.exibicao, o.placement.exibicao].some((v) => v === "an"), "nenhum campo exibe o código cru");
  checar(c, "anuncio.evidencia", o.anuncio.evidencia, "resolvido_por_id");
  checar(c, "conta.id", o.conta.id, "act_1592493385874898");
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n═══ A) Instagram Stories ═══");
{
  const c = "A";
  const o = resolverOrigemAnuncio({
    utm_source: "ig", placement: "Instagram_Stories", ad_id: "1", fbclid: "x",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  });
  checar(c, "plataforma.exibicao", o.plataforma.exibicao, "Instagram");
  checar(c, "placement.exibicao", o.placement.exibicao, "Instagram Stories");
  checar(c, "device.exibicao", o.device.exibicao, "iPhone");
  checarQue(c, "placement ≠ plataforma", o.placement.exibicao !== o.plataforma.exibicao, "as duas dimensões seguem distintas");
}

console.log("\n═══ B) Facebook Right Column ═══");
{
  const c = "B";
  const o = resolverOrigemAnuncio({
    utm_source: "fb", placement: "Facebook_Right_Column", ad_id: "2", fbclid: "x",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  });
  checar(c, "plataforma.exibicao", o.plataforma.exibicao, "Facebook");
  checar(c, "placement.exibicao", o.placement.exibicao, "Facebook Right Column");
  checar(c, "device.exibicao", o.device.exibicao, "Desktop");
}

console.log("\n═══ C) Audience Network (sem granularidade) ═══");
{
  const c = "C";
  const o = resolverOrigemAnuncio({ utm_source: "an", placement: "an", ad_id: "3", fbclid: "x" });
  checar(c, "plataforma.exibicao", o.plataforma.exibicao, "Audience Network");
  checar(c, "placement.exibicao", o.placement.exibicao, "Audience Network (não detalhado)");
  checarQue(c, "não virou Instagram/Facebook", !/Instagram|Facebook/.test(o.plataforma.exibicao + o.placement.exibicao), "`an` não foi convertido em outra plataforma");
  checarQue(c, "placement tem nota", !!o.placement.nota, "a tela sabe dizer por que não há detalhe");
}

console.log("\n═══ D) ad_id conhecido → nome oficial vence ═══");
{
  const c = "D";
  const o = resolverOrigemAnuncio({
    ad_id: "999", utm_content: "texto-qualquer-da-url",
    ad_name_resolved: "Arthur Case #1", creative_name_resolved: COPY_LONGA, fbclid: "x",
  });
  checar(c, "anuncio.exibicao", o.anuncio.exibicao, "Arthur Case #1");
  checar(c, "anuncio.evidencia", o.anuncio.evidencia, "resolvido_por_id");
  checar(c, "anuncio.bruto (observado preservado)", o.anuncio.bruto, "texto-qualquer-da-url");
}

console.log("\n═══ E) ad_id ausente ═══");
{
  const c = "E";
  const o = resolverOrigemAnuncio({ utm_source: "ig", utm_content: "Case Ighor #4", fbclid: "x" });
  checar(c, "anuncio.exibicao", o.anuncio.exibicao, "Case Ighor #4");
  checar(c, "anuncio.evidencia", o.anuncio.evidencia, "observado");
  checar(c, "anuncio.id", o.anuncio.id, null);
  checar(c, "conta.exibicao", o.conta.exibicao, "Não identificado");
  checar(c, "conjunto.exibicao", o.conjunto.exibicao, "Não identificado");
}

console.log("\n═══ E2) nada de nada ═══");
{
  const c = "E2";
  const o = resolverOrigemAnuncio({});
  for (const campo of ["conta", "campanha", "conjunto", "anuncio", "criativo", "plataforma", "placement"]) {
    checar(c, `${campo}.exibicao`, o[campo].exibicao, "Não identificado");
  }
  checar(c, "ehTrafegoPago", o.ehTrafegoPago, false);
}

console.log("\n═══ F) utm_content contendo a copy (não pode virar nome oficial) ═══");
{
  const c = "F";
  const o = resolverOrigemAnuncio({ utm_content: COPY_LONGA, ad_id: "7", fbclid: "x" });
  checar(c, "anuncio.evidencia", o.anuncio.evidencia, "observado");
  checarQue(c, "nunca 'resolvido_por_id' sem nome da Meta", o.anuncio.evidencia !== "resolvido_por_id", "sem ad_name da Meta, não se afirma nome oficial");
  checarQue(c, "criativo segue vazio", o.criativo.exibicao === "Não identificado", "copy na URL não vira creative_name");
}

console.log("\n═══ G) placement ausente ═══");
{
  const c = "G";
  const o = resolverOrigemAnuncio({ utm_source: "ig", ad_id: "8", fbclid: "x" });
  checar(c, "placement.exibicao", o.placement.exibicao, "Não identificado");
  checar(c, "placement.evidencia", o.placement.evidencia, "ausente");
  checarQue(c, "NÃO copiou a fonte", o.placement.exibicao !== "Instagram", "placement não caiu em fallback silencioso para a fonte");
  checar(c, "plataforma segue certa", o.plataforma.exibicao, "Instagram");
}

console.log("\n═══ H) macros não expandidas ═══");
{
  const c = "H";
  const o = resolverOrigemAnuncio({
    utm_campaign: "{{campaign.name}}", utm_content: "{{ad.name}}", utm_term: "{{adset.name}}",
    utm_source: "{{site_source_name}}", placement: "{{placement}}",
    campaign_id: "{{campaign.id}}", ad_id: "5", fbclid: "x",
  });
  for (const campo of ["campanha", "conjunto", "anuncio", "plataforma", "placement"]) {
    checar(c, `${campo}.exibicao`, o[campo].exibicao, "Não identificado");
  }
  checarQue(c, "nenhuma chave dupla na tela", !JSON.stringify([o.campanha.exibicao, o.anuncio.exibicao, o.plataforma.exibicao, o.placement.exibicao]).includes("{{"), "nenhum `{{` chega ao usuário");
  checarQue(c, "placement explica o motivo", (o.placement.nota || "").includes("macro"), "a nota diz que a macro não expandiu");
}

console.log("\n═══ I) utm_term repetindo o nome do anúncio ═══");
console.log("No padrão em uso, utm_term vem igual a utm_content. Usá-lo como nome");
console.log("do conjunto exibiria o ANÚNCIO no lugar do CONJUNTO.\n");
{
  const c = "I";
  const o = resolverOrigemAnuncio({ utm_content: "Case Ighor #4", utm_term: "Case Ighor #4", adset_id: "42", fbclid: "x" });
  checar(c, "conjunto.exibicao", o.conjunto.exibicao, "Não identificado");
  checarQue(c, "conjunto ≠ anúncio", o.conjunto.exibicao !== o.anuncio.exibicao, "o anúncio não foi exibido como conjunto");
  checarQue(c, "conjunto guarda o id", o.conjunto.id === "42", "o ID técnico segue disponível");
}

console.log("\n═══ J) utm_term com informação própria ═══");
{
  const c = "J";
  const o = resolverOrigemAnuncio({ utm_content: "Case Ighor #4", utm_term: "SH 4", adset_id: "43", fbclid: "x" });
  checar(c, "conjunto.exibicao", o.conjunto.exibicao, "SH 4");
  checar(c, "conjunto.evidencia", o.conjunto.evidencia, "observado");
}

console.log("\n═══ K) IDs numéricos crus em campos de nome ═══");
{
  const c = "K";
  const o = resolverOrigemAnuncio({ utm_campaign: "120252040734020116", utm_content: "120252040734010116", ad_id: "9", fbclid: "x" });
  checar(c, "campanha.exibicao", o.campanha.exibicao, "Não identificado");
  checar(c, "anuncio.exibicao", o.anuncio.exibicao, "Não identificado");
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(70));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) {
  console.log("\nFALHAS:");
  falhas.forEach((f) => console.log("  · " + f));
  process.exit(1);
}
console.log("Nenhum caso inventou dado. Nenhuma copy virou nome de anúncio.");
