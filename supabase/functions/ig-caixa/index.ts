import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { graphGet, IG_USER_ID } from "../_shared/instagram.ts";
import { guardarMensagem, lembretes, Mensageria, normalizar, tratarComentario, tratarMensageria } from "../instagram-webhook/motor.ts";

// Leitor da caixa do Champion Direct (30/10/2026). As conversas que o ManyChat abre (boas-vindas do novo
// seguidor e o clique "Simm") NÃO chegam no webhook: de 14 a 30/10 o webhook viu 2 boas-vindas e a caixa
// tinha 26, com 3 cliques que nunca dispararam o fluxo. Este job lê a caixa pela API de conversas a cada
// 2 min e entrega ao motor o que o webhook não entregou. O mid é o mesmo nos dois caminhos, então mensagem
// que já está em ig_mensagens é pulada.
//
// 1ª execução (sem cursor em ig_config): só guarda o histórico desde 14/10 em ig_mensagens, para a métrica,
// sem acionar o motor. Daí em diante, aciona.

type AnyClient = SupabaseClient<any, any, any, any, any>;
type MsgApi = { id: string; created_time: string; from: { id: string; username?: string }; to?: { data: { id: string; username?: string }[] }; message?: string; story?: { reply_to?: { id: string } }; attachments?: unknown };
type Conversa = { id: string; updated_time: string; participants?: { data: { id: string; username?: string }[] } };

const CURSOR = "caixa_lida_ate";
const INICIO_HISTORICO = "2026-10-14T00:00:00Z";
const SOBREPOSICAO_MS = 5 * 60_000;
// O webhook leva alguns segundos para gravar o mid; mensagem mais nova que isso fica para a próxima rodada
const ESPERA_WEBHOOK_MS = 60_000;

// A boas-vindas do ManyChat é reconhecida pelo começo do texto (a dele e a nossa têm o mesmo começo)
const BOAS_VINDAS = ["seja bem vindo a champion", "seja bem-vindo a champion", "seja bem vindo à champion", "que bom ter voce aqui"];
const ehBoasVindas = (t?: string) => !!t && BOAS_VINDAS.some((p) => normalizar(t).startsWith(normalizar(p)));

async function conversasDesde(sb: AnyClient, desde: string): Promise<Conversa[]> {
  const out: Conversa[] = [];
  let pagina: Record<string, string> = { platform: "instagram", fields: "id,updated_time,participants", limit: "50" };
  for (let i = 0; i < 20; i++) {
    const j = await graphGet(sb, "me/conversations", pagina);
    if (j.error) throw new Error(`conversas: ${JSON.stringify(j.error)}`);
    const lote = (j.data ?? []) as Conversa[];
    out.push(...lote.filter((c) => c.updated_time >= desde));
    const depois = j.paging?.cursors?.after;
    if (!lote.length || lote[lote.length - 1].updated_time < desde || !depois) break;
    pagina = { ...pagina, after: depois };
  }
  return out;
}

async function mensagensDe(sb: AnyClient, conversaId: string): Promise<MsgApi[]> {
  const j = await graphGet(sb, conversaId, { fields: "messages.limit(40){id,created_time,from,to,message,story,attachments}" });
  if (j.error) throw new Error(`mensagens ${conversaId}: ${JSON.stringify(j.error)}`);
  return ((j.messages?.data ?? []) as MsgApi[]).sort((a, b) => a.created_time.localeCompare(b.created_time));
}

async function jaGuardados(sb: AnyClient, mids: string[]): Promise<Set<string>> {
  if (!mids.length) return new Set();
  const { data } = await sb.from("ig_mensagens").select("mid").in("mid", mids);
  return new Set((data ?? []).map((r: { mid: string }) => r.mid));
}

function outroLado(c: Conversa, m: MsgApi): { id: string; username?: string } | undefined {
  if (m.from.id !== IG_USER_ID) return m.from;
  return m.to?.data?.find((p) => p.id !== IG_USER_ID) ?? c.participants?.data?.find((p) => p.id !== IG_USER_ID);
}

async function rodar(sb: AnyClient) {
  const inicio = new Date();
  const { data: cfg } = await sb.from("ig_config").select("valor").eq("chave", CURSOR).maybeSingle();
  const primeira = !cfg?.valor;
  const desde = primeira ? INICIO_HISTORICO : new Date(new Date(cfg!.valor).getTime() - SOBREPOSICAO_MS).toISOString();
  const limite = new Date(inicio.getTime() - ESPERA_WEBHOOK_MS).toISOString();

  const conversas = await conversasDesde(sb, desde);
  let novas = 0, acionadas = 0;
  for (const conv of conversas) {
    try {
      const msgs = (await mensagensDe(sb, conv.id)).filter((m) => m.created_time.replace("+0000", "Z") >= desde);
      const ja = await jaGuardados(sb, msgs.map((m) => m.id));
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const quando = m.created_time.replace("+0000", "Z");
        if (ja.has(m.id) || (!primeira && quando > limite)) continue;
        const pessoa = outroLado(conv, m);
        if (!pessoa) continue;
        const nossa = m.from.id === IG_USER_ID;
        novas++;
        if (primeira) {
          await sb.from("ig_contatos").upsert({ igsid: pessoa.id, username: pessoa.username ?? null }, { onConflict: "igsid", ignoreDuplicates: true });
          const autor = !nossa ? "contato" : ehBoasVindas(m.message) ? "manychat" : "humano";
          await guardarMensagem(sb, m.id, pessoa.id, nossa ? "saida" : "entrada", autor, m.message || null, null, m.story ?? (m.attachments ? { anexo: true } : null));
          continue;
        }
        const anterior = msgs[i - 1];
        const evento: Mensageria = nossa
          ? { sender: { id: IG_USER_ID }, recipient: { id: pessoa.id }, message: { mid: m.id, text: m.message || undefined, is_echo: true, de_manychat: ehBoasVindas(m.message) } }
          : {
            sender: { id: pessoa.id, username: pessoa.username },
            recipient: { id: IG_USER_ID },
            timestamp: new Date(quando).getTime(),
            // Resposta logo depois da boas-vindas do ManyChat = clique num botão dele ("Simm", "Claro")
            manychat_clique: !!m.message && !!anterior && anterior.from.id === IG_USER_ID && ehBoasVindas(anterior.message),
            message: { mid: m.id, text: m.message || undefined, reply_to: m.story?.reply_to ? { story: { id: m.story.reply_to.id } } : undefined },
          };
        await tratarMensageria(sb, evento);
        acionadas++;
      }
    } catch (error) {
      console.error("Error in ig-caixa conversa:", conv.id, error);
    }
  }
  // Próxima rodada começa de onde esta parou de acionar (a sobreposição + o mid cobrem o resto)
  const ate = primeira ? inicio.toISOString() : limite;
  await sb.from("ig_config").upsert({ chave: CURSOR, valor: ate, atualizado_em: new Date().toISOString() });
  return { primeira, conversas: conversas.length, novas, acionadas, ate };
}

// Conferência dos comentários (06/11/2026). A Meta parou de entregar o webhook das 04:59Z às 13:25Z de 06/11 e o
// "Imposto" do @cristianjoias18kl ficou sem DM. A cada rodada: 1 chamada lê a contagem de comentários dos 25 posts
// mais recentes; só o post cuja contagem subiu tem os comentários lidos. Comentário de até 6 h, com mais de 2 min
// (tempo do webhook chegar), que não está em ig_comentarios_processados vai para o mesmo tratarComentario do
// webhook, que grava o id antes de responder (não responde duas vezes). 1ª rodada só guarda as contagens.
const CONTAGEM = "comentarios_contagem";
const JANELA_COMENTARIO_MS = 6 * 3600_000;
type Midia = { id: string; comments_count?: number };
type ComentarioApi = { id: string; text?: string; timestamp: string; from?: { id: string; username?: string } };

async function comentariosPerdidos(sb: AnyClient) {
  const j = await graphGet(sb, "me/media", { fields: "id,comments_count", limit: "25" });
  if (j.error) throw new Error(`midias: ${JSON.stringify(j.error)}`);
  const midias = (j.data ?? []) as Midia[];
  const { data: cfg } = await sb.from("ig_config").select("valor").eq("chave", CONTAGEM).maybeSingle();
  let antes: Record<string, number> | null = null;
  try { antes = cfg?.valor ? JSON.parse(cfg.valor) : null; } catch { antes = null; }
  const agora = Date.now();
  let lidas = 0, acionados = 0;
  const depois: Record<string, number> = {};
  for (const m of midias) {
    const n = m.comments_count ?? 0;
    depois[m.id] = n;
    if (!antes || n <= (antes[m.id] ?? n)) continue; // post novo entra com a contagem atual
    try {
      const c = await graphGet(sb, `${m.id}/comments`, { fields: "id,text,timestamp,from", limit: "50" });
      if (c.error) throw new Error(JSON.stringify(c.error));
      lidas++;
      const recentes = ((c.data ?? []) as ComentarioApi[]).filter((x) => {
        const t = new Date(x.timestamp.replace("+0000", "Z")).getTime();
        return x.from?.id && x.from.id !== IG_USER_ID && agora - t < JANELA_COMENTARIO_MS && agora - t > ESPERA_WEBHOOK_MS * 2;
      });
      if (!recentes.length) continue;
      const { data: ja } = await sb.from("ig_comentarios_processados").select("comment_id").in("comment_id", recentes.map((x) => x.id));
      const feitos = new Set((ja ?? []).map((r: { comment_id: string }) => r.comment_id));
      for (const x of recentes) {
        if (feitos.has(x.id)) continue;
        await tratarComentario(sb, { id: x.id, text: x.text, from: x.from, media: { id: m.id } });
        acionados++;
        console.log("ig-caixa: comentário sem webhook acionado", x.id, x.from?.username, x.text);
      }
    } catch (error) {
      console.error("Error in ig-caixa comentarios:", m.id, error);
      depois[m.id] = antes[m.id] ?? n; // tenta de novo na próxima rodada
    }
  }
  await sb.from("ig_config").upsert({ chave: CONTAGEM, valor: JSON.stringify(depois), atualizado_em: new Date().toISOString() });
  return { primeira: !antes, midias: midias.length, lidas, acionados };
}

Deno.serve(async () => {
  const sb: AnyClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    let comentarios: unknown;
    try { comentarios = await comentariosPerdidos(sb); } catch (error) { console.error("Error in ig-caixa comentarios:", error); comentarios = { erro: String(error) }; }
    const r: Record<string, unknown> = { ...(await rodar(sb)), comentarios };
    try { r.lembretes = await lembretes(sb); } catch (error) { console.error("Error in ig-caixa lembretes:", error); r.lembretes = { erro: String(error) }; }
    console.log("ig-caixa:", JSON.stringify(r));
    return Response.json(r);
  } catch (error) {
    console.error("Error in ig-caixa:", error);
    return Response.json({ erro: String(error) }, { status: 500 });
  }
});
