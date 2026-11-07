/**
 * Testes de layout do shell do painel — trilho, logo, largura e tabelas.
 *
 * Roda contra o BUILD (`vite preview`), em três viewports, com um navegador de
 * verdade. Testar CSS lendo o arquivo não prova nada: `hover:w-56` com
 * `overflow-hidden` ou funciona no navegador, ou não funciona.
 *
 * Autenticação: o painel guarda um JWT em `sessionStorage` e o CLIENTE só olha
 * o `exp` (`src/lib/adminAuth.ts`). O teste injeta um token não assinado com
 * validade futura só para a tela montar. Isso é local, contra `localhost`, e
 * não vale nada no servidor — toda chamada de dados responde 401, que é o
 * esperado: aqui se mede layout, não dado.
 *
 * Pré-requisito:  npx vite build
 * Rode com:       node scripts/testar-shell-layout.mjs
 */
import { spawn } from "node:child_process";
import { chromium } from "file:///C:/Users/Rodge/AppData/Local/Temp/claude/e--Obsidian-conhecimentos/d7f9263c-8419-4a59-8f2a-4a8519bb8404/scratchpad/node_modules/playwright/index.mjs";

const PORTA = 4173;
// Sem argumento, sobe o preview do build local. Com argumento, valida a URL
// dada — é assim que a PRODUÇÃO é conferida depois do deploy.
const ALVO = process.argv[2] || null;
const BASE = ALVO || `http://localhost:${PORTA}`;

let passou = 0, falhou = 0;
const falhas = [];
function checar(nome, ok, detalhe = "") {
  if (ok) passou++; else { falhou++; falhas.push(`${nome}${detalhe ? " — " + detalhe : ""}`); }
  console.log(`   ${ok ? "OK   " : "FALHA"} ${nome}${detalhe ? "  — " + detalhe : ""}`);
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ role: "admin", exp: Math.floor(Date.now() / 1000) + 3600 })}.assinatura-invalida-de-proposito`;

// ── servidor ────────────────────────────────────────────────────────────────
const servidor = ALVO ? null : spawn("npx", ["vite", "preview", "--port", String(PORTA), "--strictPort"], {
  cwd: process.cwd(), shell: true, stdio: "ignore",
});
const encerrar = () => { try { servidor?.kill("SIGTERM"); } catch { /* já morreu */ } };
process.on("exit", encerrar);

async function esperarServidor(tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

if (ALVO) {
  console.log(`validando ${ALVO}`);
} else {
  console.log("subindo vite preview...");
  if (!(await esperarServidor())) { console.error("o servidor de preview não subiu"); encerrar(); process.exit(1); }
}

const navegador = await chromium.launch();

async function abrir(largura, altura) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  // O painel desmonta o shell quando `fetchAdmin` recebe 401: ele dispara
  // "sessão expirada" e volta para o login. Numa medição de LAYOUT isso apaga
  // o que se quer medir depois de ~2,5s.
  //
  // O stub responde 200 vazio para as rotas de dados, só para a tela ficar de
  // pé. A autenticação DO PRODUTO não é tocada: o 401 real continua existindo,
  // continua desmontando, e continua sendo o comportamento correto. Quem muda
  // é o harness.
  // AS CHAMADAS DE DADOS SÃO ABORTADAS, não respondidas com JSON falso.
  //
  // Responder 401 real faz o produto disparar "sessão expirada" e desmontar o
  // shell em ~2,5s — some justamente o que se quer medir. Responder 200 com
  // corpo inventado é pior: cada rota lê uma forma diferente e a tela morre num
  // ErrorBoundary (`button_distribution.start_btn_1`, depois `toFixed` de
  // undefined). Perseguir a forma de cada rota seria manter um dublê do backend
  // dentro do teste.
  //
  // Abortar deixa o erro na categoria que o painel já trata: as chamadas caem
  // no catch, os componentes ficam no estado inicial e o SHELL — que é o objeto
  // da medição — permanece de pé.
  //
  // A autenticação DO PRODUTO não é tocada. O 401 real continua existindo e
  // continua desmontando o shell, que é o comportamento correto.
  await pg.route((u) => u.hostname.endsWith("supabase.co"), (rota) => rota.abort("failed"));
  await pg.addInitScript((t) => { try { sessionStorage.setItem("admin_analytics_token", t); } catch { /* nada */ } }, TOKEN);
  await pg.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  // Abaixo de md o `aside` existe no DOM mas é `hidden`. Um seletor com vírgula
  // resolve o `aside` primeiro e espera por ele ficar visível — que nunca fica.
  // Cada viewport espera o elemento que É dele.
  const ancora = largura >= 768 ? "aside" : "[aria-label='Abrir menu']";
  await pg.waitForSelector(ancora, { state: "visible", timeout: 15000 });
  await pg.waitForTimeout(600);
  return { ctx, pg };
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n═══ DESKTOP 1920×1080 ═══\n");
{
  const { ctx, pg } = await abrir(1920, 1080);
  const aside = pg.locator("aside").first();

  const larguraTrilho = (await aside.boundingBox())?.width ?? 0;
  checar("trilho nasce compacto (64px)", Math.abs(larguraTrilho - 64) <= 1, `${larguraTrilho}px`);

  // Rótulos existem no DOM (leitor de tela / Tab), mas invisíveis no repouso.
  const rotulo = pg.locator("aside button[title='Métricas Criativos'] span").first();
  const opacidadeRepouso = await rotulo.evaluate((el) => getComputedStyle(el).opacity);
  checar("rótulo invisível no repouso", Number(opacidadeRepouso) < 0.05, `opacity ${opacidadeRepouso}`);

  await aside.hover();
  await pg.waitForTimeout(400);
  const larguraHover = (await aside.boundingBox())?.width ?? 0;
  const opacidadeHover = await rotulo.evaluate((el) => getComputedStyle(el).opacity);
  checar("hover expande para 224px", Math.abs(larguraHover - 224) <= 1, `${larguraHover}px`);
  checar("rótulo aparece no hover", Number(opacidadeHover) > 0.95, `opacity ${opacidadeHover}`);

  // Sair do hover recolhe.
  await pg.mouse.move(1500, 600);
  await pg.waitForTimeout(400);
  const larguraSaida = (await aside.boundingBox())?.width ?? 0;
  checar("recolhe ao sair do hover", Math.abs(larguraSaida - 64) <= 1, `${larguraSaida}px`);

  // A barra aberta NÃO empurra o conteúdo.
  const antes = await pg.evaluate(() => document.querySelector("aside")?.nextElementSibling?.getBoundingClientRect().width ?? 0);
  await aside.hover(); await pg.waitForTimeout(400);
  const depois = await pg.evaluate(() => document.querySelector("aside")?.nextElementSibling?.getBoundingClientRect().width ?? 0);
  await pg.mouse.move(1500, 600); await pg.waitForTimeout(300);
  checar("conteúdo não reflui no hover", Math.abs(antes - depois) < 1, `${antes}px → ${depois}px`);

  // Logo real, e nenhuma letra "C" solta.
  const logo = pg.locator("aside img[alt='Champion']").first();
  const src = await logo.getAttribute("src");
  checar("usa a logo real da Champion", /champion-logo(\.webp|-160\.png)$/.test(src ?? ""), src ?? "(sem img)");
  const logoOk = await logo.evaluate((el) => el.complete && el.naturalWidth > 0);
  checar("a logo carrega de fato", logoOk, logoOk ? "naturalWidth > 0" : "imagem quebrada");
  const temLetraC = await pg.evaluate(() => {
    const marca = document.querySelector("aside")?.firstElementChild?.firstElementChild;
    return Array.from(marca?.children ?? []).some((e) => e.tagName === "SPAN" && e.textContent?.trim() === "C");
  });
  checar('não existe mais o "C" desenhado', !temLetraC);

  // Botão de recolher some do desktop.
  const recolher = await pg.locator("aside button:has-text('Recolher')").count();
  checar("sem botão manual de recolher", recolher === 0, `${recolher} encontrado(s)`);

  // Largura aproveitada.
  const medida = await pg.evaluate(() => {
    const cont = document.querySelector("main, [class*='max-w-']");
    const alvo = Array.from(document.querySelectorAll("div")).find((d) => d.className.includes("max-w-[1800px]"));
    const r = (alvo ?? cont)?.getBoundingClientRect();
    return { largura: r?.width ?? 0, viewport: window.innerWidth, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  });
  const aproveitado = medida.largura / (medida.viewport - 64);
  checar("conteúdo usa >90% da largura útil", aproveitado > 0.9, `${medida.largura}px de ${medida.viewport - 64}px (${(aproveitado * 100).toFixed(0)}%)`);
  checar("página não rola na horizontal", medida.scrollW <= medida.clientW + 1, `scrollWidth ${medida.scrollW} vs clientWidth ${medida.clientW}`);

  // Tabelas: ou cabem, ou têm scroll próprio. Nunca cortadas.
  const tabelas = await pg.evaluate(() => {
    return Array.from(document.querySelectorAll("table")).map((t) => {
      let p = t.parentElement, rolavel = false;
      for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === "auto" || ov === "scroll") { rolavel = true; break; }
      }
      const caixa = t.parentElement?.getBoundingClientRect().width ?? 0;
      return { largura: t.scrollWidth, caixa, rolavel };
    });
  });
  const cortadas = tabelas.filter((t) => t.largura > t.caixa + 1 && !t.rolavel);
  checar("nenhuma tabela cortada", cortadas.length === 0, `${tabelas.length} tabela(s) visíveis, ${cortadas.length} sem saída`);

  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n═══ DESKTOP INTERMEDIÁRIO 1440×900 ═══\n");
{
  const { ctx, pg } = await abrir(1440, 900);
  const aside = pg.locator("aside").first();
  checar("trilho compacto", Math.abs(((await aside.boundingBox())?.width ?? 0) - 64) <= 1);
  await aside.hover(); await pg.waitForTimeout(400);
  checar("hover expande", Math.abs(((await aside.boundingBox())?.width ?? 0) - 224) <= 1);
  await pg.mouse.move(1200, 600); await pg.waitForTimeout(300);
  const m = await pg.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  checar("sem rolagem horizontal", m.scrollW <= m.clientW + 1, `${m.scrollW} vs ${m.clientW}`);
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
console.log("\n═══ MOBILE 390×844 ═══\n");
{
  const { ctx, pg } = await abrir(390, 844);

  const trilhoVisivel = await pg.locator("aside").first().isVisible().catch(() => false);
  checar("trilho de desktop escondido", !trilhoVisivel);

  const botao = pg.locator("[aria-label='Abrir menu']");
  checar("botão de menu presente", await botao.isVisible());

  await botao.click();
  await pg.waitForTimeout(400);
  const gaveta = pg.locator("[aria-label='Fechar menu']").last();
  checar("gaveta abre no toque", await gaveta.isVisible());

  // Sem hover no celular: os rótulos precisam estar visíveis de saída.
  // No celular EXISTEM DOIS desses spans: um dentro do `aside` do desktop, que
  // continua no DOM porém `hidden` (e portanto com opacity 0, correto), e outro
  // dentro da gaveta. `.first()` pegava o do aside e acusava um defeito que não
  // existe. A medição precisa ser a do span que está FORA do aside.
  const rotuloMobile = pg.locator("button[title='Métricas Criativos'] span").nth(1);
  const op = await rotuloMobile.evaluate((el) => getComputedStyle(el).opacity);
  checar("rótulos visíveis sem hover", Number(op) > 0.95, `opacity ${op}`);

  const logoMobile = await pg.locator("img[alt='Champion']").first().getAttribute("src");
  checar("logo na gaveta", /champion-logo/.test(logoMobile ?? ""), logoMobile ?? "(sem)");

  // Dois elementos têm aria-label="Fechar menu": o fundo escuro e o X. O fundo
  // fica atrás do painel, então clicá-lo é interceptado pela própria gaveta.
  // O X é o último.
  await pg.locator("[aria-label='Fechar menu']").last().click();
  await pg.waitForTimeout(300);
  const m = await pg.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  checar("sem rolagem horizontal no celular", m.scrollW <= m.clientW + 1, `${m.scrollW} vs ${m.clientW}`);
  await ctx.close();
}

await navegador.close();
encerrar();

console.log("\n" + "═".repeat(66));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
