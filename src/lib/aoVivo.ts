/**
 * Sincronização ao vivo entre quem está no painel.
 *
 * O problema: o painel é usado por três pessoas ao mesmo tempo e cada uma via
 * uma foto diferente. O Miguel marcava um lead como lido e o Caio continuava
 * vendo o mesmo lead em negrito; alguém agendava uma reunião e ela só aparecia
 * para os outros no F5 seguinte. Duas pessoas ligavam para o mesmo lead.
 *
 * ── Por que broadcast, e não Postgres Changes ────────────────────────────────
 * O caminho óbvio seria escutar as mudanças das tabelas direto. Só que o
 * Realtime respeita RLS, e `leads`, `meetings` e `manual_sales` são fechadas: só
 * a service role enxerga. Para o navegador receber as linhas, seria preciso
 * abrir uma policy de SELECT para o anon — ou seja, publicar a base de leads
 * inteira para quem tiver a chave pública, que está dentro do bundle. Nunca.
 *
 * Broadcast não passa por tabela nenhuma. Quem escreve avisa "mudou isto", e
 * quem escuta vai buscar o dado novo pelo caminho autenticado de sempre.
 *
 * ── O que pode viajar aqui ───────────────────────────────────────────────────
 * O canal usa a chave anônima, que é pública. Então o payload NÃO carrega nome,
 * telefone, valor de venda ou qualquer dado de lead — só o tipo do evento, um
 * id e quem fez. O id sozinho não abre nada: para ler o lead ainda é preciso o
 * token de admin. Se um dia alguém for tentado a mandar o objeto inteiro para
 * "evitar um fetch", é este parágrafo que diz por que não.
 */

import { supabase } from "@/integrations/supabase/client";

const CANAL = "champion-admin-ao-vivo";

export type EventoAoVivo =
  | { tipo: "lead_lido"; lead_id: string; lido: boolean; por: string }
  | { tipo: "lead_contato"; lead_id: string; por: string }
  | { tipo: "lead_excluido"; lead_ids: string[]; por: string }
  | { tipo: "reuniao"; acao: "criada" | "atualizada" | "removida"; por: string }
  | { tipo: "venda"; acao: "criada" | "atualizada" | "removida"; por: string };

type Ouvinte = (e: EventoAoVivo) => void;
type OuvinteStatus = (conectado: boolean) => void;

const ouvintes = new Set<Ouvinte>();
const ouvintesStatus = new Set<OuvinteStatus>();
let canal: ReturnType<typeof supabase.channel> | null = null;
let conectado = false;

/**
 * Avisos disparados antes de o websocket terminar de subir.
 *
 * Isto não é zelo excessivo: o canal leva algumas centenas de milissegundos para
 * ficar SUBSCRIBED, e quem abre o painel e clica logo em "lido" cai exatamente
 * nessa janela. Um `send` antes disso é descartado em silêncio — o clique
 * funciona, o banco grava, e só o aviso aos outros some. Fila resolve.
 */
const fila: EventoAoVivo[] = [];

function despejarFila() {
  if (!conectado || !canal) return;
  while (fila.length > 0) {
    const e = fila.shift()!;
    canal.send({ type: "broadcast", event: "mudou", payload: e });
  }
}

function garantirCanal() {
  if (canal) return canal;
  canal = supabase.channel(CANAL, {
    // `self: false` é o padrão e é o que queremos: quem envia já atualizou a
    // própria tela de forma otimista, e receber o próprio eco causaria um
    // segundo refresh à toa.
    config: { broadcast: { self: false } },
  });
  canal
    .on("broadcast", { event: "mudou" }, (msg) => {
      const e = msg.payload as EventoAoVivo;
      if (!e?.tipo) return;
      for (const ouvinte of ouvintes) {
        try {
          ouvinte(e);
        } catch (err) {
          console.warn("[ao vivo] ouvinte falhou:", err);
        }
      }
    })
    .subscribe((status) => {
      conectado = status === "SUBSCRIBED";
      console.info(`[ao vivo] canal ${CANAL}: ${status}`);
      for (const cb of ouvintesStatus) cb(conectado);
      if (conectado) despejarFila();
    });
  return canal;
}

/** Acompanha a conexão, para a tela poder dizer se o tempo real está de pé. */
export function assinarStatusAoVivo(cb: OuvinteStatus): () => void {
  ouvintesStatus.add(cb);
  garantirCanal();
  cb(conectado);
  return () => { ouvintesStatus.delete(cb); };
}

/** Registra um ouvinte. Devolve a função que o remove. */
export function assinarAoVivo(cb: Ouvinte): () => void {
  ouvintes.add(cb);
  garantirCanal();
  return () => {
    ouvintes.delete(cb);
    // O canal fica de pé mesmo sem ouvintes: derrubar e reabrir a cada troca de
    // aba custa mais do que manter um websocket ocioso, e a reconexão perde
    // eventos na janela em que está fechado.
  };
}

/**
 * Avisa os outros painéis. Nunca falha para quem chamou: se o websocket estiver
 * fora do ar, a escrita já aconteceu no banco e o pior caso é o outro lado
 * demorar até o próximo refresh. Perder o aviso não pode derrubar a ação.
 */
export function avisarAoVivo(evento: EventoAoVivo): void {
  try {
    garantirCanal();
    if (!conectado) {
      fila.push(evento);
      return;
    }
    canal!.send({ type: "broadcast", event: "mudou", payload: evento });
  } catch (err) {
    console.warn("[ao vivo] não deu para avisar:", err);
  }
}

export function estaConectadoAoVivo(): boolean {
  return conectado;
}
