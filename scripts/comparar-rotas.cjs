// Compara as rotas públicas de um build (URL de prévia) com o que está no ar (www), antes de qualquer deploy de produção.
// O deploy publica o DISCO INTEIRO: uma diferença na /HD3 (para onde o tráfego pago aponta) sobe junto sem ninguém pedir.
// Uso: node scripts/comparar-rotas.cjs <url-da-previa> [url-do-ar]
// Compara, rota a rota: data-track-id, data-rotulo, os players de vídeo (id do vturb) e o texto do h1. Sai com código 1 se houver diferença.
const { chromium } = require("E:/Obsidian/conhecimentos/squads/social-champion/ferramentas/node_modules/playwright");
const [novo, ar = "https://www.assessoriachampion.com"] = process.argv.slice(2);
const ROTAS = ["/", "/HD0", "/HD1", "/HD2", "/HD3", "/HD4", "/SH0", "/SH1", "/SH2", "/SH3", "/SH4", "/SH5", "/SH6", "/quiz", "/quiz/q1", "/quiz/q2", "/quiz/q3", "/quiz/q4"];
(async () => {
  const b = await chromium.launch();
  const foto = async (base, rota) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await p.goto(base + rota, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 350) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 300)); } });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => ({
      ids: [...document.querySelectorAll("[data-track-id]")].map((e) => e.getAttribute("data-track-id")).sort(),
      rotulos: [...document.querySelectorAll("[data-rotulo]")].map((e) => e.getAttribute("data-rotulo")).sort(),
      // player = id do vturb (ou src do iframe de vídeo); o <video> interno do vturb carrega em tempo variável e não conta
      midia: [...document.querySelectorAll("vturb-smartplayer,iframe")].map((e) => e.tagName === "IFRAME" ? (/youtube|vimeo|drive\.google|pandavideo/i.test(e.src || "") ? e.src.replace(/\?.*/, "") : null) : e.id).filter(Boolean).sort().join(","),
      h1: (document.querySelector("h1")?.textContent || "").trim().slice(0, 120),
    }));
    await p.close();
    return r;
  };
  let dif = 0;
  for (const rota of ROTAS) {
    const [a, n] = await Promise.all([foto(ar, rota), foto(novo, rota)]);
    const so = (x, y) => x.filter((v) => !y.includes(v));
    const linhas = [];
    if (so(a.ids, n.ids).length || so(n.ids, a.ids).length) linhas.push(`track-id só no ar: ${so(a.ids, n.ids).join(", ") || "-"} | só no novo: ${so(n.ids, a.ids).join(", ") || "-"}`);
    if (JSON.stringify(a.rotulos) !== JSON.stringify(n.rotulos)) linhas.push(`rótulos ar: ${a.rotulos.join(" / ")} | novo: ${n.rotulos.join(" / ")}`);
    if (a.midia !== n.midia) linhas.push(`players de vídeo: ar [${a.midia}] x novo [${n.midia}]`);
    if (a.h1 !== n.h1) linhas.push(`h1 ar "${a.h1}" x novo "${n.h1}"`);
    console.log(`${linhas.length ? "DIFERENTE" : "igual    "} ${rota}${linhas.length ? "\n   " + linhas.join("\n   ") : ""}`);
    dif += linhas.length ? 1 : 0;
  }
  await b.close();
  console.log(dif ? `\n${dif} rota(s) diferentes: NÃO publicar sem olhar.` : "\nTodas as rotas públicas iguais ao ar.");
  process.exit(dif ? 1 : 0);
})();
