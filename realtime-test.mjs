// Dois clientes reais: um escuta, o outro envia. É o teste que o navegador faria.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const CANAL = "champion-admin-ao-vivo";

const ouvinte = createClient(URL, KEY);
const emissor = createClient(URL, KEY);
let recebeu = null;

const c1 = ouvinte.channel(CANAL, { config: { broadcast: { self: false } } });
c1.on("broadcast", { event: "mudou" }, (m) => { recebeu = m.payload; })
  .subscribe((s) => console.log("ouvinte:", s));

const c2 = emissor.channel(CANAL, { config: { broadcast: { self: false } } });
await new Promise((r) => c2.subscribe((s) => { console.log("emissor:", s); if (s === "SUBSCRIBED") r(); }));
await new Promise((r) => setTimeout(r, 1200));

await c2.send({ type: "broadcast", event: "mudou", payload: { tipo: "lead_lido", lead_id: "teste-123", lido: true, por: "Miguel" } });
console.log("enviado");

await new Promise((r) => setTimeout(r, 2500));
console.log(recebeu ? "RECEBIDO: " + JSON.stringify(recebeu) : "NADA RECEBIDO");
process.exit(recebeu ? 0 : 1);
