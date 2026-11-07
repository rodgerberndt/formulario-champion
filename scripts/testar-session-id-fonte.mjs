/**
 * De onde o insert do lead tira o session_id.
 *
 * Este é o teste do defeito de 11/09/2026: 2 dos 11 leads nascidos depois que
 * a coluna passou a ser gravada chegaram sem sessão, os dois no navegador
 * embutido do Instagram no iOS — com a sessão INTEIRA gravada em
 * `lead_sessions` e o evento `submit` saindo com o id certo um segundo depois.
 *
 * O id existia. O insert é que lia só o armazenamento, enquanto o resto do
 * rastreamento trabalhava com o valor em memória. Quando o Web Storage
 * evaporava no meio da visita, os dois discordavam.
 *
 * Aqui o módulo real (`src/lib/metaTracking.ts`) é carregado em cima de um
 * navegador de mentira, e cada camada é derrubada de propósito:
 *
 *   memória  →  localStorage  →  cookie de domínio  →  NULL
 *
 * Nada de rede, nada de banco.
 *
 * Rode com:  node scripts/testar-session-id-fonte.mjs
 */
import fs from "node:fs";
import { transformSync } from "esbuild";

let passou = 0, falhou = 0;
const falhas = [];
const checar = (n, ok, d = "") => {
  if (ok) passou++; else { falhou++; falhas.push(`${n}${d ? " — " + d : ""}`); }
  console.log(`  ${ok ? "OK   " : "FALHA"} ${n}${d ? "  · " + d : ""}`);
};

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

/**
 * Monta um navegador de mentira e devolve o módulo recém-carregado.
 *
 * Cada chamada reimporta o módulo (query string única) para zerar a memória
 * interna — sem isso um teste vazaria estado no seguinte.
 */
let contador = 0;
async function navegadorFake({ storage = "ok" } = {}) {
  const guardado = new Map();
  const cookies = new Map();

  const quebrado = () => { throw new DOMException("acesso negado", "SecurityError"); };
  const ls = storage === "quebrado"
    ? { getItem: quebrado, setItem: quebrado, removeItem: quebrado }
    : {
        getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
        setItem: (k, v) => guardado.set(k, String(v)),
        removeItem: (k) => guardado.delete(k),
      };

  globalThis.localStorage = ls;
  globalThis.window = { location: { hostname: "www.championadstudio.com", search: "", href: "https://www.championadstudio.com/quiz" } };
  globalThis.navigator = { userAgent: "fixture" };
  globalThis.document = {
    get cookie() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(linha) {
      const [par] = linha.split(";");
      const i = par.indexOf("=");
      const nome = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      // `max-age=0` é como o navegador apaga um cookie.
      if (/max-age=0(;|$)/.test(linha)) cookies.delete(nome);
      else cookies.set(nome, valor);
    },
  };

  const fonte = fs.readFileSync("src/lib/metaTracking.ts", "utf8");
  const js = transformSync(fonte, { loader: "ts", format: "esm" }).code;
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}#${++contador}`
  );
  return { mod, guardado, cookies };
}

console.log("\n═══ 1. O CAMINHO FELIZ ═══\n");
{
  const { mod, guardado, cookies } = await navegadorFake();
  guardado.set("champion_session_id", UUID_A);
  checar("lê o id do localStorage", mod.getSessionId() === UUID_A, String(mod.getSessionId()));
  checar("não inventa cookie sozinho ao apenas ler", !cookies.has("champion_index"));
}

console.log("\n═══ 2. MEMÓRIA MANDA — era aqui que o lead perdia a sessão ═══");
console.log("O armazenamento esvazia no meio da visita; o id já está em memória.\n");
{
  const { mod, guardado, cookies } = await navegadorFake();
  mod.lembrarSessionId(UUID_A);
  checar("lembrar grava o cookie de domínio na hora", cookies.get("champion_index") === UUID_A, String(cookies.get("champion_index")));

  // O navegador embutido apaga o Web Storage no meio do caminho.
  guardado.clear();
  cookies.clear();
  checar("sem storage e sem cookie, a memória ainda entrega", mod.getSessionId() === UUID_A, String(mod.getSessionId()));
  checar("e é o MESMO id, não um novo", mod.getSessionId() === UUID_A);
}

console.log("\n═══ 3. COOKIE COMO ÚLTIMA REDE ═══");
console.log("Aba nova, memória zerada, localStorage varrido: o cookie sobrevive.\n");
{
  const { mod, cookies } = await navegadorFake();
  cookies.set("champion_index", UUID_A);
  checar("resgata do cookie", mod.getSessionId() === UUID_A, String(mod.getSessionId()));
  checar("e passa a valer em memória", mod.getSessionId() === UUID_A);
}

console.log("\n═══ 4. LOCALSTORAGE QUE LEVANTA EXCEÇÃO ═══");
console.log("É o comportamento de armazenamento bloqueado, não de armazenamento vazio.\n");
{
  const { mod, cookies } = await navegadorFake({ storage: "quebrado" });
  checar("sem nada em lugar nenhum, devolve NULL", mod.getSessionId() === null, String(mod.getSessionId()));
  cookies.set("champion_index", UUID_B);
  const { mod: m2, cookies: c2 } = await navegadorFake({ storage: "quebrado" });
  c2.set("champion_index", UUID_B);
  checar("com storage quebrado, ainda lê o cookie", m2.getSessionId() === UUID_B, String(m2.getSessionId()));
  checar("e `lembrar` não explode com storage quebrado", (() => { try { m2.lembrarSessionId(UUID_A); return true; } catch { return false; } })());
}

console.log("\n═══ 5. PRECEDÊNCIA: localStorage ganha do cookie ═══");
console.log("Cookie é rede de segurança, não fonte concorrente.\n");
{
  const { mod, guardado, cookies } = await navegadorFake();
  guardado.set("champion_session_id", UUID_A);
  cookies.set("champion_index", UUID_B);
  checar("prevalece o localStorage", mod.getSessionId() === UUID_A, String(mod.getSessionId()));
}

console.log("\n═══ 6. SESSÃO MORTA É ESQUECIDA NAS TRÊS CAMADAS ═══");
console.log("Se o banco diz que a sessão não existe, o cookie NÃO pode ressuscitá-la.\n");
{
  const { mod, guardado, cookies } = await navegadorFake();
  guardado.set("champion_session_id", UUID_A);
  mod.lembrarSessionId(UUID_A);
  mod.esquecerSessionId();
  checar("saiu do localStorage", !guardado.has("champion_session_id"));
  checar("saiu do cookie", !cookies.has("champion_index"), String(cookies.get("champion_index")));
  checar("saiu da memória — devolve NULL", mod.getSessionId() === null, String(mod.getSessionId()));
}

console.log("\n═══ 7. NADA É INVENTADO ═══");
console.log("Sem id em nenhuma camada o campo é NULL. Nunca IP, nunca user agent.\n");
{
  const { mod } = await navegadorFake();
  checar("getSessionId devolve NULL", mod.getSessionId() === null, String(mod.getSessionId()));
  checar("getNavigationForLead manda session_id NULL", mod.getNavigationForLead().session_id === null);
  checar("e ainda assim traz user_agent", typeof mod.getNavigationForLead().user_agent === "string");
  checar("lembrar(null) não cria cookie", (() => { mod.lembrarSessionId(null); return mod.getSessionId() === null; })());
  checar("lembrar(undefined) idem", (() => { mod.lembrarSessionId(undefined); return mod.getSessionId() === null; })());
}

console.log("\n═══ 8. É O MESMO ID QUE VAI NO LEAD ═══\n");
{
  const { mod, guardado } = await navegadorFake();
  guardado.set("champion_session_id", UUID_A);
  checar("getNavigationForLead.session_id = o id da sessão", mod.getNavigationForLead().session_id === UUID_A, String(mod.getNavigationForLead().session_id));
  guardado.clear();
  checar("e continua o mesmo depois do storage sumir", mod.getNavigationForLead().session_id === UUID_A, String(mod.getNavigationForLead().session_id));
}

console.log("\n" + "═".repeat(72));
console.log(`RESULTADO: ${passou} passaram, ${falhou} falharam`);
if (falhas.length) { console.log("\nFALHAS:"); falhas.forEach((f) => console.log("  · " + f)); process.exit(1); }
