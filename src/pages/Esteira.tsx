import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, AlignRight, BadgeCheck, Bookmark, Clapperboard, Heart, Home, ImagePlus, MessageCircle, Pencil, Repeat2, Search, Send, SlidersHorizontal, Check, ChevronLeft, ChevronRight, Clock, Film, FileText, Folder, Images, Instagram, Loader2, LogOut, Moon, Plus, RefreshCw, RotateCcw, Sun, Trash2, Undo2 } from "lucide-react";
import { ADMIN_TOKEN_KEY, isAdminTokenExpired } from "@/lib/adminAuth";
import { FLUXOS as FLUXOS_LOCAL, type Etapa } from "@/lib/esteiraFluxos";

/**
 * Esteira do orgânico: o caminho de cada carrossel e de cada Reel, da copy à publicação (pedido do Rodger, 17/10/2026).
 * Mora em /esteira (Leo e Oton entram com a senha do time) e dentro do admin, no menu "Orgânico" (`embutida`).
 *
 * ── Acesso ──────────────────────────────────────────────────────────────────
 * Uma senha para o time inteiro, sem usuário nem role. O token dela só abre a edge function `esteira`: o resto do
 * admin (leads, telefones, faturamento) continua fechado. Quem está logado no admin entra direto com o token do admin.
 * "Quem é você" não é segurança: é o nome que vai no histórico de cada aprovação. Fica no aparelho.
 *
 * ── Quem manda em quê ───────────────────────────────────────────────────────
 * O servidor decide qual botão vale em cada etapa (supabase/functions/esteira/fluxos.ts). As etapas do agente andam
 * sozinhas pelos agents do PC (`carrossel.mjs` e `agente.mjs`); a tela só mostra. Doc e arte continuam no Drive.
 *
 * ── Visual (v3, 19/10/2026) ────────────────────────────────────────────────
 * Kanban clássico, no molde de Trello/Linear/GitHub Projects: barra de topo simples, colunas cinza com nome e contagem,
 * card branco compacto (capa pequena, título, código, dia, etiqueta de atraso/ajuste, "Aprovar" em texto). O Rodger
 * achou a v1 (caixas grandes) "meio feia" e a v2 (faixa "Sua vez" + chips + tiras) "muito complexa": não voltar a
 * empilhar seções. O "esperando você" é só o botão "Só o meu". Claro por padrão, escuro no botão.
 * Contraste: ouro só como FUNDO, com letra azul-noite; texto em ouro sobre claro não passa.
 */

const FN = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/esteira`;
const CHAVE_TOKEN = "esteira_token";
const CHAVE_QUEM = "esteira_quem";
const CHAVE_TEMA = "esteira_tema";
const CHAVE_VISTO = "esteira_visto";
const CHAVE_APR_VISTO = "esteira_aprendizados_visto"; // ISO da última vez que ESTE aparelho abriu a aba Aprendizados
const CHAVE_APR_AREA = "esteira_aprendizados_area";
const PESSOAS = ["Rodger", "Leo", "Oton"];

type Tipo = "carrossel" | "reel" | "direct";
// Aba "Consciência alta" (03/11/2026, pedido do Rodger): carrosséis com extra.consciencia = "alta", no fluxo do carrossel; saem da aba Carrosséis
// Aba "Aprendizados" (03/11/2026, pedido do Rodger): não é coluna de peça, é a lista das regras que os squads e o Claude
// gravaram nas revisões (tabela esteira_aprendizados, escrita pelo aprendizados.mjs do PC a cada 10 min)
type Aba = "carrossel" | "reel" | "consciente" | "aprendizados";
const ehConsciente = (p: { tipo: string; extra?: Record<string, unknown> | null }) => p.tipo === "carrossel" && p.extra?.consciencia === "alta";
const daAba = (p: { tipo: string; extra?: Record<string, unknown> | null }, a: Aba) => (a === "consciente" ? ehConsciente(p) : a === "carrossel" ? p.tipo === "carrossel" && !ehConsciente(p) : p.tipo === a);
type Tema = "claro" | "escuro";
type Filtro = "tudo" | "meu";
type Peca = {
  codigo: string; tipo: Tipo; semana: number | null; titulo: string | null; dia: string | null;
  etapa: string; etapa_desde: string; ajuste: string | null; ajuste_por: string | null; ajuste_em: string | null;
  doc_url: string | null; pasta_url: string | null; post_url: string | null; previas: string[];
  extra: Record<string, unknown>; atualizado_em: string; hash?: string | null;
};
type Evento = { id: number; codigo: string; acao: string; de: string | null; para: string | null; quem: string | null; mensagem: string | null; criado_em: string };
type AreaAprendizado = "carrossel" | "consciente" | "reel" | "capa" | "copy" | "direct" | "geral";
type Aprendizado = {
  id: number; chave: string; area: AreaAprendizado; titulo: string; regra: string; porque: string | null;
  origem: "memória" | "squad" | "ata"; arquivo: string | null; data_regra: string | null; criado_em: string; atualizado_em: string;
};
type Dados = { pecas: Peca[]; eventos: Evento[]; previas: Record<string, string>; fluxos: Record<Tipo, Etapa[]>; aprendizados?: Aprendizado[]; agora: string };

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* modo privado */ } };

function tokenDoAdmin(): string | null {
  try {
    const t = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    return t && !isAdminTokenExpired(t) ? t : null;
  } catch { return null; }
}
function cabecalhos(): Record<string, string> {
  const h: Record<string, string> = { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
  const t = ler(CHAVE_TOKEN);
  if (t) h["x-esteira-token"] = t;
  const a = tokenDoAdmin();
  if (a) h["x-admin-token"] = a;
  return h;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function diaCurto(iso: string | null) {
  if (!iso) return "sem dia";
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function haQuanto(iso: string, agora: number) {
  const h = Math.max(0, (agora - Date.parse(iso)) / 3600000);
  return h < 1 ? "agora" : h < 24 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`;
}
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Pronta = já não precisa de ninguém antes do dia.
const PRONTAS = new Set(["aprovado", "publicado", "descartado"]);
const atrasoDe = (p: Peca) => {
  if (!p.dia || PRONTAS.has(p.etapa)) return null;
  const f = diasEntre(hojeSP(), p.dia);
  return f < 0 ? "atrasado" : f === 0 ? "sai hoje" : f === 1 ? "sai amanhã" : null;
};

const CSS = `
.esteira,.es-dialog{--bg:#F6F5F1;--col:#ECEAE4;--sup:#FFFFFF;--sup2:#F8F7F4;--linha:#E2DFD7;--txt:#1B1D3A;--suave:#6B6E86;--fraco:#9497AC;
  --royal:#1E2BB8;--royal-f:#ECEEFC;--ouro:#D4A53C;--perigo:#C0362C;--perigo-f:#FCE9E7;--alerta:#9A6700;--alerta-f:#FFF4D4;--ok:#1A7F4B;--ok-f:#E5F4EC;
  --sombra:0 1px 2px rgba(20,22,50,.08);--sombra2:0 4px 12px rgba(20,22,50,.12);font-family:Montserrat,system-ui,sans-serif;color:var(--txt)}
.esteira[data-tema=escuro],.es-dialog[data-tema=escuro]{--bg:#0F1024;--col:#17192F;--sup:#20233C;--sup2:#1A1C33;--linha:#2C2F4A;--txt:#ECEBF3;--suave:#A3A6BD;--fraco:#7C7F98;
  --royal:#8B97FF;--royal-f:rgba(139,151,255,.14);--perigo:#FF8B80;--perigo-f:rgba(255,139,128,.14);--alerta:#F2C35B;--alerta-f:rgba(242,195,91,.13);--ok:#5CD39A;--ok-f:rgba(92,211,154,.13);
  --sombra:0 1px 2px rgba(0,0,0,.4);--sombra2:0 6px 16px rgba(0,0,0,.5)}
.esteira{background:var(--bg);max-width:100%;overflow-x:hidden;min-width:0}
.esteira *,.es-dialog *{box-sizing:border-box}
.es-titulo{font-family:'League Gothic',Oswald,sans-serif;letter-spacing:.02em;text-transform:uppercase;line-height:1;font-weight:400}

/* barra de topo: simples, como Linear/Trello */
.es-barra{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 20px;background:var(--sup);border-bottom:1px solid var(--linha)}
.es-abas{display:flex;gap:2px;background:var(--col);border-radius:9px;padding:3px}
.es-abas button{padding:5px 12px;border-radius:7px;font-size:13px;font-weight:600;color:var(--suave);white-space:nowrap}
.es-abas button[data-on=true]{background:var(--sup);color:var(--txt);box-shadow:var(--sombra)}
.es-abas em{font-style:normal;color:var(--fraco);margin-left:4px;font-weight:600}
.es-dir{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.es-tog{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:8px;border:1px solid var(--linha);background:var(--sup);font-size:13px;font-weight:600;color:var(--suave)}
.es-tog[data-on=true]{background:var(--royal-f);border-color:var(--royal);color:var(--royal)}
.es-icone{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;border:1px solid var(--linha);background:var(--sup);color:var(--suave);flex:none}
.es-icone:hover,.es-tog:hover{border-color:var(--fraco)}
.es-sel{height:32px;border-radius:8px;padding:0 8px;font-size:13px;font-weight:600;border:1px solid var(--linha);background:var(--sup);color:var(--txt)}

/* quadro */
.es-quadro{display:flex;gap:12px;overflow-x:auto;padding:16px 20px 24px;align-items:flex-start;max-width:100%}
.es-col{flex:0 0 268px;background:var(--col);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 120px);min-height:calc(100vh - 120px)} /* a coluna inteira é alvo do arrastar, até a parte vazia */
.es-col-lista{flex:1}
.es-col-topo{display:flex;align-items:center;gap:8px;padding:4px 6px 2px}
.es-ponto{width:8px;height:8px;border-radius:50%;flex:none}
.es-col-nome{font-size:13px;font-weight:700;color:var(--txt);white-space:nowrap}
.es-col-n{font-size:12px;font-weight:600;color:var(--fraco)}
.es-col-dono{margin-left:auto;font-size:11px;color:var(--fraco);white-space:nowrap}
.es-col-lista{display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:40px;padding:2px}

.es-card{background:var(--sup);border:1px solid var(--linha);border-radius:10px;padding:10px;box-shadow:var(--sombra);cursor:pointer;text-align:left;transition:box-shadow .12s,border-color .12s}
.es-card:hover{box-shadow:var(--sombra2);border-color:var(--fraco)}
.es-card-cima{display:flex;gap:10px}
.es-capa{width:40px;height:50px;border-radius:6px;object-fit:cover;flex:none;background:var(--sup2)}
.es-tit{font-size:13.5px;font-weight:600;line-height:1.35;color:var(--txt);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.es-tit[data-vazio=true]{color:var(--fraco);font-weight:500;font-style:italic;padding-right:3px}
.es-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--suave)}
.es-cod{font-weight:700;color:var(--fraco);white-space:nowrap}
.es-meta .es-cod{font-family:"League Gothic",var(--titulo,inherit);font-weight:400;font-size:21px;line-height:1;letter-spacing:.02em;color:var(--txt)}
.es-tag{font-size:11px;font-weight:700;padding:1px 7px;border-radius:5px;white-space:nowrap}
.es-tag[data-t=perigo]{background:var(--perigo-f);color:var(--perigo)}
.es-tag[data-t=alerta]{background:var(--alerta-f);color:var(--alerta)}
.es-tag[data-t=novo]{background:var(--royal);color:#fff}
.es-selo{display:inline-block;align-self:flex-start;background:var(--royal);color:var(--ouro);font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase;border-radius:5px;padding:3px 7px;margin-bottom:6px}
.es-card[data-novo=true]{border-color:var(--royal);box-shadow:0 0 0 1px var(--royal),var(--sombra)}
.es-abas b{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--royal);margin-left:5px;vertical-align:middle}
.es-aprovar{margin-left:auto;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--royal);padding:3px 8px;border-radius:6px;white-space:nowrap}
.es-aprovar:hover{background:var(--royal-f)}
.es-aprovar:disabled{opacity:.5}

/* botões e campos (modal) */
.es-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:700;font-size:13px;border-radius:8px;padding:7px 12px;white-space:nowrap}
.es-btn:disabled{opacity:.55;cursor:not-allowed}
.es-btn-ouro{background:linear-gradient(180deg,#F3D27A,#D4A53C);color:#151951}
.es-btn-royal{background:var(--royal);color:#fff}
.es-btn-linha{background:var(--sup);border:1px solid var(--linha);color:var(--txt)}
.es-btn-linha:hover{border-color:var(--fraco)}
.es-btn-perigo{background:transparent;color:var(--perigo)}
.es-campo{width:100%;border:1px solid var(--linha);background:var(--sup2);color:var(--txt);border-radius:8px;padding:9px 11px;font-size:14px}
.es-campo:focus{outline:2px solid var(--royal);outline-offset:1px}
.es-nota{font-size:12px;color:var(--suave)}
.es-dia{font-size:12.5px;font-weight:600;color:var(--suave)}
.es-pilula{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;background:var(--perigo-f);color:var(--perigo)}
.es-ajuste{background:var(--alerta-f);border-radius:8px;padding:8px 10px;font-size:13px;color:var(--txt)}
.es-ajuste b{color:var(--alerta)}
.es-gerando{display:flex;align-items:center;gap:10px;border:1px dashed var(--linha);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--suave)}
.es-card .es-gerando{padding:6px 8px;font-size:12px;gap:8px}
.es-falhou{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--perigo);background:var(--perigo-f);color:var(--perigo);border-radius:8px;padding:7px 9px;font-size:12px;line-height:1.35}
.es-falhou svg{flex:none;margin-top:2px}
.es-saida{display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px;border-radius:8px;padding:6px 9px;background:var(--royal-f);color:var(--txt);border:1px solid var(--royal)}
.es-saida[data-atrasado="true"]{background:var(--perigo-f);border-color:var(--perigo);color:var(--perigo)}
.es-giro{width:16px;height:16px;flex:none;border-radius:50%;border:2px solid var(--linha);border-top-color:var(--alerta);animation:es-giro .8s linear infinite}
@keyframes es-giro{to{transform:rotate(360deg)}}
/* agente trabalhando agora (26/10/2026): selo pulsante + o que ele está fazendo + barra de passo */
.es-vivo{display:flex;flex-direction:column;gap:5px;border:1px solid var(--royal);background:var(--royal-f);border-radius:8px;padding:7px 9px;font-size:12px;color:var(--txt)}
.es-vivo-topo{display:flex;align-items:center;gap:7px;font-weight:700;color:var(--royal);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.es-pulso{width:8px;height:8px;border-radius:50%;background:var(--royal);flex:none;animation:es-pulso 1.2s ease-in-out infinite}
@keyframes es-pulso{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.es-vivo-barra{height:5px;border-radius:99px;background:var(--linha);overflow:hidden}
.es-vivo-barra span{display:block;height:100%;background:var(--royal);border-radius:99px;transition:width .4s}
/* kanban de arrastar (26/10/2026) */
.es-card[draggable=true]{cursor:grab}
.es-card[data-arrastando=true]{opacity:.45}
.es-col[data-alvo=ok]{outline:2px dashed var(--ok);outline-offset:-2px;background:var(--ok-f)}
.es-col[data-alvo=nao]{outline:2px dashed var(--perigo);outline-offset:-2px;background:var(--perigo-f)}
.es-fantasma{position:fixed;z-index:9999;pointer-events:none;width:240px;opacity:.9;transform:rotate(2deg);box-shadow:var(--sombra2)}
.es-feito{background:var(--ok-f,#E6F4EA);border-radius:8px;padding:8px 10px;font-size:13px;color:var(--txt)}
.es-feito b{color:var(--ok,#1E7B3A)}
.es-ideia{background:var(--royal-f);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--txt);line-height:1.45;overflow-wrap:anywhere}
.es-ideia b{color:var(--royal);display:block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
.es-ideia p{margin:0 0 6px}
.es-ideia a{color:var(--royal);text-decoration:underline;margin-right:10px}
.es-aviso{margin:12px 20px 0;padding:9px 12px;border-radius:8px;background:var(--alerta-f);font-size:13px}
.es-dialog{background:var(--sup) !important;border:1px solid var(--linha) !important;color:var(--txt) !important}
.es-dialog > button{color:var(--txt)}
/* visor da arte/vídeo + copy ao lado (20/10/2026): uma peça por vez, grande, sem barra de rolagem lateral */
.es-duo{display:flex;gap:18px;align-items:flex-start}
.es-visor{flex:none;display:flex;flex-direction:column;gap:8px;align-items:center}
.es-palco{position:relative;border-radius:12px;overflow:hidden;background:var(--sup2);border:1px solid var(--linha);box-shadow:var(--sombra)}
.es-palco img,.es-palco iframe{display:block;width:100%;height:100%;object-fit:contain;border:0}
.es-seta{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.92);color:#1B1D3A;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.es-seta:disabled{opacity:0;pointer-events:none}
.es-contador{position:absolute;top:8px;left:8px;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:6px;background:rgba(15,16,36,.72);color:#fff;pointer-events:none}
.es-minis{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:100%}
.es-mini{border-radius:6px;overflow:hidden;border:2px solid transparent;opacity:.7;background:var(--sup2);display:grid;place-items:center;color:var(--suave)}
.es-mini[data-on=true]{border-color:var(--royal);opacity:1}
.es-mini img{width:100%;height:100%;object-fit:cover;display:block}
.es-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;overflow-y:auto;max-height:min(72vh,660px);padding-right:4px}
.es-copy-rot{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--royal)}
.es-copy-sl{text-align:left;border:1px solid var(--linha);border-radius:10px;padding:9px 11px;background:var(--sup);font-size:13px;line-height:1.45;color:var(--txt);white-space:pre-wrap;overflow-wrap:anywhere}
.es-copy-sl[data-on=true]{border-color:var(--royal);background:var(--royal-f)}
.es-copy-sl b{display:block;font-size:13.5px;margin:2px 0 3px}
.es-copy-n{font-size:11px;font-weight:700;color:var(--fraco)}
.es-copy-caixa{position:relative;display:grid}
.es-copy-caixa .es-copy-sl{padding-right:36px}
.es-copy-lapis{position:absolute;top:6px;right:6px;width:26px;height:26px;border-radius:8px;border:1px solid var(--linha);background:var(--sup);color:var(--royal);display:grid;place-items:center;cursor:pointer}
.es-copy-lapis:hover{border-color:var(--royal);background:var(--royal-f)}
/* moldura do Reels (medidas tiradas de um print de iPhone, 738x1600) */
.es-ig{position:absolute;inset:0;pointer-events:none;container-type:inline-size;color:#fff;font-family:-apple-system,'SF Pro Text',system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.45)}
.es-ig svg{width:7.5cqw;height:7.5cqw;stroke-width:1.8}
.es-ig-status{position:absolute;top:2.2%;left:9%;right:8%;display:flex;justify-content:space-between;font-size:4.6cqw;background:transparent}
.es-ig-status span{font-size:3.4cqw;letter-spacing:.1em}
.es-ig-topo{position:absolute;top:8.4%;left:4%;right:5%;display:flex;align-items:center;justify-content:space-between;font-size:5.6cqw}
.es-ig-topo i{font-style:normal;font-weight:700;color:rgba(255,255,255,.55);margin-left:2cqw}
.es-ig-lado{position:absolute;right:2.5%;top:40%;display:flex;flex-direction:column;align-items:center;gap:3.6cqw;font-size:3.3cqw;font-weight:600}
.es-ig-lado div{display:flex;flex-direction:column;align-items:center;gap:1cqw}
.es-ig-lado svg{width:8.2cqw;height:8.2cqw}
.es-ig-baixo{position:absolute;left:4%;right:16%;top:75%}
.es-ig-perfil{display:flex;align-items:center;gap:2.2cqw;font-size:4.1cqw}
.es-ig-perfil img{width:8.5cqw;height:8.5cqw;border-radius:50%;object-fit:cover;background:#fff}
.es-ig .es-ig-selo{width:4.2cqw;height:4.2cqw;fill:#3897F0;stroke:#fff}
.es-ig-seguir{border:1px solid rgba(255,255,255,.7);border-radius:2cqw;padding:.6cqw 2.8cqw;font-weight:600;font-size:3.7cqw}
.es-ig-leg{font-size:3.9cqw;margin-top:3cqw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.es-ig-curt{display:flex;align-items:center;gap:1.4cqw;font-size:3.3cqw;margin-top:2.6cqw;color:rgba(255,255,255,.85);white-space:nowrap}
.es-ig-bola{width:5cqw;height:5cqw;border-radius:50%;background:#8a8f9e;display:inline-block;flex:none}
.es-ig-barra{margin-top:3cqw;height:.5cqw;width:115%;background:rgba(255,255,255,.3);border-radius:1cqw}
.es-ig-barra span{display:block;width:4%;height:100%;background:#fff}
.es-ig-nav{position:absolute;left:5.5%;right:5.5%;bottom:2.6%;height:6.8%;border-radius:999px;background:rgba(38,38,42,.92);display:flex;align-items:center}
.es-ig-nav div{flex:1;display:flex;justify-content:space-around;align-items:center}
.es-ig-ativo{background:rgba(255,255,255,.14);border-radius:999px;padding:1.6cqw 5cqw;display:grid;place-items:center}
@media (max-width:760px){.es-duo{flex-direction:column;align-items:stretch}.es-copy{max-height:none}}
.es-hist li{display:flex;gap:10px;font-size:12px;padding:7px 0;border-bottom:1px solid var(--linha)}
/* aba Aprendizados (03/11/2026): lista simples, do mais novo para o mais antigo, uma regra por card */
.es-apr{max-width:880px;margin:0 auto;padding:16px 20px 32px;display:flex;flex-direction:column;gap:10px}
.es-apr-topo{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}
.es-apr-topo p{font-size:13px;color:var(--suave);margin:0;flex:1 1 260px}
.es-filtros{display:flex;flex-wrap:wrap;gap:6px}
.es-filtros button{height:30px;padding:0 11px;border-radius:99px;border:1px solid var(--linha);background:var(--sup);font-size:12.5px;font-weight:600;color:var(--suave);white-space:nowrap}
.es-filtros button[data-on=true]{background:var(--royal);border-color:var(--royal);color:var(--sup)} /* var(--sup): no escuro o royal é claro e o branco não passa no contraste */
.es-apr .es-tag[data-t=novo]{color:var(--sup)}
.es-filtros em{font-style:normal;opacity:.75;margin-left:4px}
.es-apr-item{background:var(--sup);border:1px solid var(--linha);border-radius:12px;padding:12px 14px;box-shadow:var(--sombra);display:flex;flex-direction:column;gap:6px;min-width:0}
.es-apr-item[data-novo=true]{border-color:var(--royal);box-shadow:0 0 0 1px var(--royal),var(--sombra)}
.es-apr-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11.5px;color:var(--suave)}
.es-apr-meta time{font-weight:700;color:var(--txt)}
.es-area{font-size:11px;font-weight:700;padding:2px 8px;border-radius:5px;white-space:nowrap}
.es-area[data-a=carrossel]{background:var(--royal-f);color:var(--royal)}
.es-area[data-a=consciente]{background:var(--ok-f);color:var(--ok)}
.es-area[data-a=capa]{background:var(--alerta-f);color:var(--alerta)}
.es-area[data-a=reel]{background:var(--perigo-f);color:var(--perigo)}
.es-area[data-a=copy],.es-area[data-a=direct],.es-area[data-a=geral]{background:var(--col);color:var(--txt)}
.es-apr-tit{font-size:15px;font-weight:700;line-height:1.35;color:var(--txt);margin:0;overflow-wrap:anywhere}
.es-apr-regra{font-size:13.5px;line-height:1.5;color:var(--txt);margin:0;overflow-wrap:anywhere}
.es-apr-porque{font-size:12.5px;line-height:1.45;color:var(--suave);margin:0;overflow-wrap:anywhere;border-left:3px solid var(--linha);padding-left:9px}
.es-apr-porque b{color:var(--txt);font-weight:700}
@media (max-width:640px){.es-apr{padding:12px 12px 24px}.es-apr-item{padding:11px 12px}.es-abas{flex-wrap:wrap;max-width:100%}} /* 4 abas não cabem numa linha no celular */
@media (max-width:640px){.es-barra,.es-quadro{padding-left:12px;padding-right:12px}.es-col{flex-basis:82vw}}
`;
// cor do ponto da coluna, por dono
const COR_DONO: Record<string, string> = { Leo: "#1E2BB8", Rodger: "#D4A53C", "Edição": "#0F5E57", Copy: "#0F5E57", Agente: "#A9ADC9", "": "#0F7B4D" };

function useFonteLeague() {
  useEffect(() => {
    if (document.getElementById("fonte-league-gothic")) return;
    const l = document.createElement("link");
    l.id = "fonte-league-gothic"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=League+Gothic&display=swap";
    document.head.appendChild(l);
  }, []);
}

function Login({ onEntrar, tema }: { onEntrar: () => void; tema: Tema }) {
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true); setErro(null);
    try {
      const r = await fetch(`${FN}/login`, { method: "POST", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ password: senha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) throw new Error(j.error || "Não deu para entrar");
      gravar(CHAVE_TOKEN, j.token);
      onEntrar();
    } catch (e) {
      setErro((e as Error).message);
    } finally { setCarregando(false); }
  };
  return (
    <div className="esteira" data-tema={tema} style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <style>{CSS}</style>
      <form onSubmit={entrar} style={{ width: "100%", maxWidth: 380, background: "var(--sup)", border: "1px solid var(--linha)", borderRadius: 18, boxShadow: "var(--sombra2)", overflow: "hidden" }}>
        <div style={{ padding: "22px 22px 18px", background: "linear-gradient(115deg,#1E2BB8,#151951)", color: "#F4EEDF" }}>
          <img src="/champion-logo.webp" alt="" width={34} height={34} style={{ borderRadius: 8, marginBottom: 10 }} />
          <h1 className="es-titulo" style={{ fontSize: 40 }}>Esteira do orgânico</h1>
          <p style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Carrosséis e Reels, da copy à publicação.</p>
        </div>
        <div style={{ padding: 22, display: "grid", gap: 12 }}>
          <input className="es-campo" type="password" autoFocus placeholder="Senha do time" value={senha} onChange={(e) => setSenha(e.target.value)} />
          {erro && <p style={{ color: "var(--perigo)", fontSize: 13 }}>{erro}</p>}
          <button type="submit" className="es-btn es-btn-ouro" style={{ padding: 11 }} disabled={carregando || !senha}>
            {carregando ? <Loader2 size={16} className="animate-spin" /> : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

const IconeTipo = ({ t }: { t: Tipo }) => (t === "reel" ? <Film size={11} /> : t === "direct" ? <MessageCircle size={11} /> : <Images size={11} />);
// Copy de Direct (30/10/2026, pedido do Rodger): o nível de consciência do lead aparece de cara no card e no diálogo
const Selo = ({ p }: { p: Peca }) => (typeof p.extra?.consciencia === "string" ? <span className="es-selo">Consciência {p.extra.consciencia as string}</span> : null);

type ItemVisor = { video: string } | { url: string };
type CopyDoc = { slides: { papel: string | null; titulo: string; texto: string }[]; legenda: string | null };
const semMarcas = (t: string) => t.replace(/\*/g, "").trim();

// Uma peça por vez, grande. Setas, teclas ← → e as miniaturas embaixo trocam o slide.
// A tela do Reels no iPhone por cima do vídeo (print do Rodger, 20/10/2026): mostra o que a interface cobre para quem
// assiste. Os números são de exemplo. Nada aqui recebe clique (pointer-events: none): o player do Drive continua tocando.
function MolduraReels({ legenda }: { legenda: string }) {
  const lado: [typeof Heart, string][] = [[Heart, "3.011"], [MessageCircle, "106"], [Repeat2, "63"], [Send, "299"], [Bookmark, "196"]];
  return (
    <div className="es-ig" aria-hidden>
      <div className="es-ig-status"><b>18:38</b><span>▮▮▮ ◔ ▭</span></div>
      <div className="es-ig-topo"><Plus /><span><b>Reels</b> <i>Amigos</i></span><SlidersHorizontal /></div>
      <div className="es-ig-lado">
        {lado.map(([I, t], k) => <div key={k}><I />{t}</div>)}
        <AlignRight />
      </div>
      <div className="es-ig-baixo">
        <div className="es-ig-perfil"><img src="/champion-logo.webp" alt="" /><b>assessoriachampion</b><BadgeCheck className="es-ig-selo" /><span className="es-ig-seguir">Seguir</span></div>
        <div className="es-ig-leg">{legenda} ...</div>
        <div className="es-ig-curt"><span className="es-ig-bola" />Curtido por <b>flavioluz</b> e outras <b>3.010</b> pessoas</div>
        <div className="es-ig-barra"><span /></div>
      </div>
      <div className="es-ig-nav"><div><Home /><span className="es-ig-ativo"><Clapperboard /></span><Send /><Search /><span className="es-ig-bola" /></div></div>
    </div>
  );
}

function Visor({ itens, tipo, i, setI, onErro, legenda = "" }: { itens: ItemVisor[]; tipo: Tipo; i: number; setI: (n: number) => void; onErro: () => void; legenda?: string }) {
  const n = itens.length;
  const at = Math.min(i, n - 1);
  const item = itens[at];
  const [moldura, setMoldura] = useState(true);
  const comMoldura = moldura && "video" in item;
  const alto = tipo === "reel" ? "min(68vh, 620px)" : "min(62vh, 560px)";
  const proporcao = tipo === "reel" ? "9 / 16" : "4 / 5";
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName)) return;
      if (e.key === "ArrowRight" && at < n - 1) setI(at + 1);
      if (e.key === "ArrowLeft" && at > 0) setI(at - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [at, n, setI]);
  return (
    <div className="es-visor">
      <div className="es-palco" style={comMoldura ? { height: "min(72vh, 680px)", aspectRatio: "9 / 19.5", background: "#000", borderRadius: 26 } : { height: alto, aspectRatio: proporcao }}>
        {"video" in item
          ? <>
              <iframe key={item.video} src={`https://drive.google.com/file/d/${item.video}/preview`} title="Vídeo" allow="autoplay; fullscreen" allowFullScreen
                style={comMoldura ? { position: "absolute", top: "8%", left: 0, height: "82.1%", background: "#000" } : { background: "#000" }} />
              {comMoldura && <MolduraReels legenda={legenda} />}
            </>
          : <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={`Slide ${at + 1}`} onError={onErro} /></a>}
        {n > 1 && !comMoldura && <span className="es-contador">{at + 1} / {n}</span>}
        {n > 1 && !comMoldura && <>
          <button className="es-seta" style={{ left: 8 }} disabled={at === 0} onClick={() => setI(at - 1)} aria-label="Anterior"><ChevronLeft size={20} /></button>
          <button className="es-seta" style={{ right: 8 }} disabled={at === n - 1} onClick={() => setI(at + 1)} aria-label="Próximo"><ChevronRight size={20} /></button>
        </>}
      </div>
      {"video" in item && (
        <button className="es-btn es-btn-linha" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setMoldura((m) => !m)}>
          {moldura ? "Só o vídeo" : "Ver como no Reels"}
        </button>
      )}
      {n > 1 && (
        <div className="es-minis">
          {itens.map((it, k) => (
            <button key={k} className="es-mini" data-on={k === at} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`}
              style={tipo === "reel" ? { width: 34, height: 60 } : { width: 40, height: 50 }}>
              {"video" in it ? <Film size={16} /> : <img src={it.url} alt="" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// O que o lápis manda para a edge function (acao "editar_copy"): só os campos que mudaram
type EdicaoCopy = { slides?: Record<string, { titulo?: string; texto?: string }>; legenda?: string; capa_imagem?: string };

// A copy do Doc, slide a slide. O slide aberto no visor fica marcado; clicar num slide da copy mostra a arte dele.
// 27/10/2026 (Rodger: "um botãozinho pra alteração" em cada slide): com `onSalvar`, cada slide e a legenda ganham um lápis.
// No título, *asteriscos* marcam a palavra gigante da capa e o destaque dos outros slides.
function Copy({ copy, i, setI, onSalvar, enviando, unidade = "Slide" }: { copy: CopyDoc; i: number; setI: (n: number) => void; onSalvar?: (e: EdicaoCopy) => Promise<boolean>; enviando?: boolean; unidade?: string }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { refs.current[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [i]);
  const [editando, setEditando] = useState<number | "legenda" | null>(null);
  const [titulo, setTitulo] = useState(""), [texto, setTexto] = useState(""), [capa, setCapa] = useState("");
  const abrir = (k: number | "legenda") => {
    setEditando(k); setCapa("");
    if (k === "legenda") { setTexto(copy.legenda || ""); return; }
    setTitulo(copy.slides[k].titulo || ""); setTexto(copy.slides[k].texto || ""); setI(k);
  };
  const salvar = async () => {
    if (editando === null || !onSalvar) return;
    let e: EdicaoCopy;
    if (editando === "legenda") e = { legenda: texto };
    else {
      const s = copy.slides[editando], m: { titulo?: string; texto?: string } = {};
      if (titulo.trim() !== (s.titulo || "").trim()) m.titulo = titulo;
      if (texto.trim() !== (s.texto || "").trim()) m.texto = texto;
      e = { ...(Object.keys(m).length ? { slides: { [editando + 1]: m } } : {}), ...(editando === 0 && capa.trim() ? { capa_imagem: capa } : {}) };
    }
    if (!e.slides && !e.legenda && !e.capa_imagem) { setEditando(null); return; }
    if (await onSalvar(e)) setEditando(null);
  };
  const lapis = (k: number | "legenda") => onSalvar && editando === null && (
    <button type="button" className="es-copy-lapis" onClick={() => abrir(k)} title="Alterar" aria-label="Alterar"><Pencil size={13} /></button>
  );
  const form = (capaTambem: boolean, soTexto: boolean) => (
    <div className="es-copy-sl" data-on="true" style={{ cursor: "default", display: "grid", gap: 6 }}>
      <span className="es-copy-n">{editando === "legenda" ? "Legenda" : `Slide ${(editando as number) + 1}`} · alterando</span>
      {!soTexto && <input className="es-campo" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título (palavra gigante entre *asteriscos*)" />}
      <textarea className="es-campo" autoFocus={soTexto} rows={soTexto ? 8 : 3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Texto" />
      {capaTambem && <textarea className="es-campo" rows={3} value={capa} onChange={(e) => setCapa(e.target.value)} placeholder="Imagem da capa (opcional): descreva a cena que você quer" />}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="es-btn es-btn-linha" onClick={() => setEditando(null)}>Cancelar</button>
        <button type="button" className="es-btn es-btn-royal" disabled={enviando} onClick={salvar}><Check size={14} />Salvar</button>
      </div>
    </div>
  );
  return (
    <div className="es-copy">
      <span className="es-copy-rot">Copy</span>
      {copy.slides.map((s, k) => editando === k ? <div key={k} ref={(el) => { refs.current[k] = el; }}>{form(k === 0, false)}</div> : (
        <div key={k} ref={(el) => { refs.current[k] = el; }} className="es-copy-caixa">
          <button className="es-copy-sl" data-on={k === i} onClick={() => setI(k)}>
            <span className="es-copy-n">{unidade} {k + 1}{s.papel ? ` · ${s.papel}` : ""}</span>
            {s.titulo && <b>{semMarcas(s.titulo)}</b>}
            {s.texto && semMarcas(s.texto)}
          </button>
          {lapis(k)}
        </div>
      ))}
      {copy.legenda && (editando === "legenda" ? form(false, true) : (
        <div className="es-copy-caixa">
          <div className="es-copy-sl" style={{ cursor: "default" }}>
            <span className="es-copy-n">Legenda</span>
            <div style={{ marginTop: 3, whiteSpace: "pre-line" }}>{copy.legenda}</div>
          </div>
          {lapis("legenda")}
        </div>
      ))}
    </div>
  );
}

// 26/10/2026 (Rodger: "aparecia a imagem onde era revisão" e "não tem o carrossel ali"): em Arte e Ajuste o agente ainda
// está trabalhando, então a prévia antiga não aparece e o card mostra que está gerando. Em Copy só a copy.
function gerandoDe(p: Peca): string | null {
  if (p.tipo !== "carrossel") return null;
  if (p.etapa === "ajuste") return "Aplicando seu ajuste…";
  // 26/10/2026 (Rodger: "um botão pra rejeitar as copys"): tema trocado, a copy nova ainda não chegou
  if (p.etapa === "copy" && p.extra?.trocar_tema) return "Esperando novo tema…";
  if (p.etapa === "arte" && (!(p.previas || []).length || p.extra?.previas_de !== p.hash)) return "Gerando a arte…";
  return null;
}
// "Trocar tema" (26/10/2026): o carrossel volta para a copy e o agent escreve outro, com tema viral novo; vale até a revisão
const TROCA_TEMA = ["copy", "arte", "ajuste", "revisao_rodger"];
const podeTrocarTema = (p: Peca) => p.tipo === "carrossel" && TROCA_TEMA.includes(p.etapa);
const semPrevia = (p: Peca) => p.tipo === "carrossel" && (p.etapa === "copy" || !!gerandoDe(p));

// 26/10/2026 (Rodger: "ver quais estão sendo alteradas, montando as copys, ou os designs na hora"): o agent grava em
// extra.agente o que está fazendo agora ({fase, texto, em, passo?, total?}) e apaga quando termina. Mais de 20 min sem
// atualizar = o agent caiu; o selo some para não mentir.
type Agente = { fase?: string; texto?: string; em?: string; passo?: number; total?: number };
function agenteDe(p: Peca, agora: number): Agente | null {
  const a = p.extra?.agente as Agente | null | undefined;
  if (!a || !a.em || agora - Date.parse(a.em) > 20 * 60000) return null;
  return a;
}
const FASE: Record<string, string> = { copy: "Escrevendo a copy", arte: "Desenhando", ajuste: "Aplicando seu ajuste" };
function Vivo({ a }: { a: Agente }) {
  const pct = a.total ? Math.min(100, Math.round(((a.passo || 0) / a.total) * 100)) : null;
  return (
    <div className="es-vivo">
      <span className="es-vivo-topo"><span className="es-pulso" />Fazendo agora{a.fase && FASE[a.fase] ? ` · ${FASE[a.fase]}` : ""}</span>
      {a.texto && <span>{a.texto}</span>}
      {pct !== null && <div className="es-vivo-barra" title={`${a.passo} de ${a.total}`}><span style={{ width: `${pct}%` }} /></div>}
    </div>
  );
}

// estado claro de todo carrossel nas etapas do agente (Rodger, 26/10/2026: "estão prontos ou estão sendo feitos? preciso ter
// essa informação clara no sistema"): fazendo agora (extra.agente), tentou e não conseguiu (resposta do agent mais nova que o
// pedido e o card ainda em Ajuste) ou na fila até a próxima rodada do agente, que roda de hora em hora no minuto 20
const ETAPAS_AGENTE = ["copy", "arte", "ajuste"];
// copy só é do agente quando o Rodger trocou o tema (esperando a copy nova); sem isso a copy espera a aprovação dele
const comAgente = (p: Peca) => p.etapa === "arte" || p.etapa === "ajuste" || (p.etapa === "copy" && !!p.extra?.trocar_tema);
function proximaRodada(agora: number): string {
  const d = new Date(agora);
  if (d.getUTCMinutes() >= 20) d.setUTCHours(d.getUTCHours() + 1);
  d.setUTCMinutes(20, 0, 0);
  return `${String((d.getUTCHours() + 21) % 24).padStart(2, "0")}:20`; // horário de Brasília (UTC-3)
}
function falhouDe(p: Peca): string | null {
  if (p.etapa !== "ajuste") return null;
  const resp = p.extra?.ajuste_resposta as string | undefined, em = p.extra?.ajuste_resposta_em as string | undefined;
  const lista = (p.extra?.ajustes as { em?: string }[] | undefined) || [];
  const pedido = p.ajuste_em || lista[lista.length - 1]?.em;
  if (!resp || !em || (pedido && Date.parse(em) < Date.parse(pedido))) return null;
  const nf = resp.split(/Não ficou feito:s*/)[1] || resp.replace(/^Não consegui aplicar este ajuste sozinho:s*/, "");
  return (nf.split(/(?<=[.;])s/)[0] || nf).replace(/[;.]+$/, "").slice(0, 160);
}
function EstadoAgente({ p, agora, longo = false }: { p: Peca; agora: number; longo?: boolean }) {
  if (p.tipo !== "carrossel" || !ETAPAS_AGENTE.includes(p.etapa)) return null;
  const vivo = agenteDe(p, agora);
  if (!vivo && !comAgente(p)) return null;
  if (vivo) return <Vivo a={vivo} />;
  const falhou = falhouDe(p);
  if (falhou) return <div className="es-falhou"><AlertTriangle size={13} /><span><b>Tentou e não conseguiu:</b> {falhou}{longo ? ". Veja abaixo o que o agente respondeu." : ""}</span></div>;
  const g = gerandoDe(p);
  return <div className="es-gerando"><Clock size={13} />{g ? `${g.replace(/…$/, "")} · ` : ""}Na fila · o agente pega na rodada das {proximaRodada(agora)}{longo ? ". O card volta para a sua revisão quando estiver pronto." : ""}</div>;
}
// quando o post sai (Rodger: "mostrar o horário que será postado quando está aprovado"); passou e não publicou = atrasado
function saidaDe(p: Peca, agora: number): { texto: string; atrasado: boolean } | null {
  if (p.etapa !== "aprovado" && p.etapa !== "revisao_rodger") return null;
  const ex = (p.extra || {}) as { publica_em?: string; hora?: string };
  const iso = ex.publica_em || (p.dia ? `${p.dia}T${ex.hora || "18:00"}` : null);
  if (!iso) return null;
  const t = Date.parse(iso + "-03:00");
  if (isNaN(t)) return null;
  const [dia, hora] = iso.split("T"), [, mm, dd] = dia.split("-");
  const sem = DIAS[new Date(dia + "T12:00:00-03:00").getUTCDay()];
  if (agora > t) return { texto: `Atrasado · era ${sem} ${dd}/${mm} às ${hora.slice(0, 5)}`, atrasado: true };
  return { texto: `Sai ${sem} ${dd}/${mm} às ${hora.slice(0, 5)}`, atrasado: false };
}

// ── Aprendizados (03/11/2026, pedido do Rodger) ─────────────────────────────
// O time vê o que os squads e o Claude entenderam nas revisões e gravaram para os próximos carrosséis, Reels e capas.
// Só leitura: a lista vem pronta da edge (200 mais novos, por data da regra). O que entra (e o que nunca entra: credencial,
// pessoa, dinheiro, infra) é decidido no aprendizados.mjs do PC. "Novo" = mudou depois da última vez que este aparelho
// abriu a aba (localStorage, com try/catch pelo `ler`/`gravar`).
const AREAS: { id: AreaAprendizado; nome: string }[] = [
  { id: "carrossel", nome: "Carrossel" }, { id: "consciente", nome: "Consciência alta" }, { id: "capa", nome: "Capa" },
  { id: "reel", nome: "Reels" }, { id: "copy", nome: "Copy" }, { id: "direct", nome: "Direct" }, { id: "geral", nome: "Geral" },
];
const nomeArea = (a: string) => AREAS.find((x) => x.id === a)?.nome ?? a;
const ORIGEM: Record<string, string> = { "memória": "Claude", squad: "Squad", ata: "Ata da revisão" };
const dataLonga = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "sem data");

function Aprendizados({ itens, vistoAntes }: { itens: Aprendizado[]; vistoAntes: string | null }) {
  const [area, setArea] = useState<string>(() => ler(CHAVE_APR_AREA) || "tudo");
  const escolher = (a: string) => { setArea(a); gravar(CHAVE_APR_AREA, a); };
  const novo = (i: Aprendizado) => !!vistoAntes && Date.parse(i.atualizado_em) > Date.parse(vistoAntes);
  const lista = itens.filter((i) => area === "tudo" || i.area === area);
  const nNovos = itens.filter(novo).length;
  return (
    <main className="es-apr">
      <div className="es-apr-topo">
        <p>O que os squads e o Claude aprenderam nas revisões e vale para os próximos carrosséis, Reels e capas. Atualiza sozinho.{nNovos ? ` ${nNovos} novo${nNovos > 1 ? "s" : ""} desde a sua última visita.` : ""}</p>
      </div>
      <div className="es-filtros" role="group" aria-label="Filtrar por área">
        <button data-on={area === "tudo"} onClick={() => escolher("tudo")}>Tudo<em>{itens.length}</em></button>
        {AREAS.filter((a) => itens.some((i) => i.area === a.id)).map((a) => (
          <button key={a.id} data-on={area === a.id} onClick={() => escolher(a.id)}>{a.nome}<em>{itens.filter((i) => i.area === a.id).length}</em></button>
        ))}
      </div>
      {!lista.length && <p className="es-nota" style={{ padding: "24px 0", textAlign: "center" }}>Nenhum aprendizado {area === "tudo" ? "ainda" : "nessa área"}.</p>}
      {lista.map((i) => (
        <article key={i.chave} className="es-apr-item" data-novo={novo(i)}>
          <div className="es-apr-meta">
            {novo(i) && <span className="es-tag" data-t="novo">Novo</span>}
            <time dateTime={i.data_regra || undefined}>{dataLonga(i.data_regra)}</time>
            <span className="es-area" data-a={i.area}>{nomeArea(i.area)}</span>
            <span>{ORIGEM[i.origem] ?? i.origem}</span>
          </div>
          <h3 className="es-apr-tit">{i.titulo}</h3>
          <p className="es-apr-regra">{i.regra}</p>
          {i.porque && <p className="es-apr-porque"><b>Por quê: </b>{i.porque}</p>}
        </article>
      ))}
    </main>
  );
}

function Cartao({ p, etapa, previas, enviando, novo, agora, arrastando, onAbrir, onAprovar, onArrastar, onToque }: { p: Peca; etapa?: Etapa; previas: Record<string, string>; enviando: boolean; novo: boolean; agora: number; arrastando: boolean; onAbrir: () => void; onAprovar: () => void; onArrastar: (on: boolean) => void; onToque: (e: React.PointerEvent) => void }) {
  const atraso = atrasoDe(p);
  const vivo = agenteDe(p, agora);
  const gerando = vivo ? null : gerandoDe(p);
  const capa = semPrevia(p) ? undefined : (p.previas || []).map((c) => previas[c]).find(Boolean);
  const saida = saidaDe(p, agora);
  return (
    <div role="button" tabIndex={0} className="es-card" data-novo={novo} data-arrastando={arrastando} onClick={onAbrir} onKeyDown={(e) => e.key === "Enter" && onAbrir()}
      draggable={p.etapa !== "publicado"} onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.codigo); e.dataTransfer.effectAllowed = "move"; window.setTimeout(() => onArrastar(true), 0); /* mexer no DOM dentro do dragstart faz o Chrome cancelar o arrasto */ }} onDragEnd={() => onArrastar(false)}
      onPointerDown={(e) => { if (e.pointerType !== "mouse" && p.etapa !== "publicado") onToque(e); }}>
      <Selo p={p} />
      <div className="es-card-cima">
        {capa && <img className="es-capa" src={capa} alt="" loading="lazy" draggable={false} />}
        <p className="es-tit" data-vazio={!p.titulo}>{p.titulo || "Tema ainda não definido"}</p>
      </div>
      <EstadoAgente p={p} agora={agora} />
      {!ETAPAS_AGENTE.includes(p.etapa) && vivo && <Vivo a={vivo} />}
      {!ETAPAS_AGENTE.includes(p.etapa) && gerando && <div className="es-gerando"><span className="es-giro" />{gerando}</div>}
      {saida && <div className="es-saida" data-atrasado={saida.atrasado}><Clock size={13} />{saida.texto}</div>}
      <div className="es-meta">
        {novo && <span className="es-tag" data-t="novo">Novo</span>}
        <span className="es-cod">{p.codigo}</span>
        <span>{diaCurto(p.dia)}</span>
        {atraso && <span className="es-tag" data-t="perigo">{atraso}</span>}
        {p.ajuste && <span className="es-tag" data-t="alerta">ajuste</span>}
        {p.etapa === "revisao_rodger" && typeof p.extra?.ajuste_resposta === "string" && <span className="es-tag" data-t="novo">ajuste feito</span>}
        {etapa?.aprovar && (
          <button className="es-aprovar" disabled={enviando} title={etapa.rotulo} onClick={(e) => { e.stopPropagation(); onAprovar(); }}>
            <Check size={13} />{/^Aprovar/.test(etapa.rotulo || "Aprovar") ? "Aprovar" : etapa.rotulo}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Esteira({ embutida = false }: { embutida?: boolean }) {
  useFonteLeague();
  const [tema, setTema] = useState<Tema>(() => (ler(CHAVE_TEMA) === "escuro" ? "escuro" : "claro"));
  const [logado, setLogado] = useState(() => !!ler(CHAVE_TOKEN) || !!tokenDoAdmin());
  const [quem, setQuem] = useState<string | null>(() => ler(CHAVE_QUEM));
  const [tipo, setTipo] = useState<Aba>(() => { const t = ler("esteira_tipo"); return t === "reel" || t === "consciente" || t === "aprendizados" ? t : "carrossel"; });
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  // ordem das colunas (Rodger, 26/10/2026: "ver em ordem crescente as demandas"), lembrada no aparelho
  const [ordem, setOrdem] = useState<string>(() => ler("esteira_ordem") || "data");
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [pedindoAjuste, setPedindoAjuste] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [trocandoTema, setTrocandoTema] = useState(false);
  const [motivoTema, setMotivoTema] = useState("");
  const [prints, setPrints] = useState<string[]>([]);
  const inputPrint = useRef<HTMLInputElement>(null);
  // print colado (Ctrl+V), arrastado ou escolhido vira JPEG de até 1600 px antes de subir (21/10/2026)
  const anexar = useCallback(async (arquivos: File[]) => {
    const imgs = arquivos.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    const novos = await Promise.all(imgs.map((f) => new Promise<string>((ok, erro) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => erro(new Error("Não abriu a imagem"));
      img.src = URL.createObjectURL(f);
    }))).catch((e) => { toast.error((e as Error).message); return [] as string[]; });
    setPrints((p) => {
      if (p.length + novos.length > 4) toast.error("No máximo 4 prints por ajuste");
      return [...p, ...novos].slice(0, 4);
    });
  }, []);
  const [enviando, setEnviando] = useState(false);
  const [slide, setSlide] = useState(0);
  // "Novo" (pedido do Rodger, 20/10/2026): card que mudou (coluna, arte, vídeo, copy, aprovação) desde a última vez que
  // ESTE aparelho abriu o card. Guarda o `atualizado_em` visto de cada peça; no primeiro acesso tudo começa como visto.
  const [visto, setVisto] = useState<Record<string, string> | null>(() => { try { return JSON.parse(ler(CHAVE_VISTO) || "null"); } catch { return null; } });
  const acoesMinhas = useRef(new Set<string>());
  const marcarVisto = useCallback((lista: Peca[]) => setVisto((v) => {
    const n = { ...(v || {}) };
    for (const p of lista) n[p.codigo] = p.atualizado_em;
    gravar(CHAVE_VISTO, JSON.stringify(n));
    return n;
  }), []);
  const [novo, setNovo] = useState<null | { codigo: string; titulo: string; dia: string; doc_url: string; pasta_url: string }>(null);

  const trocarTema = () => { const t: Tema = tema === "claro" ? "escuro" : "claro"; setTema(t); gravar(CHAVE_TEMA, t); };
  const sair = useCallback(() => { gravar(CHAVE_TOKEN, null); setLogado(!!tokenDoAdmin()); setDados(null); }, []);

  // `silencioso`: a atualização automática não gira o botão nem mostra erro a cada 15 s (a rede do celular oscila)
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const r = await fetch(FN, { headers: cabecalhos() });
      if (r.status === 401) { sair(); return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setDados(j);
    } catch (e) {
      if (!silencioso) toast.error((e as Error).message);
    } finally { if (!silencioso) setCarregando(false); }
  }, [sair]);

  // 26/10/2026 (Rodger: ver o agente trabalhando "na hora"): atualiza sozinho a cada 15 s com a aba visível, e na hora
  // em que a aba volta a aparecer. Modal aberto, filtro e ordem ficam (são estado da tela, não dos dados).
  useEffect(() => {
    if (!logado) return;
    carregar();
    const t = window.setInterval(() => { if (!document.hidden) carregar(true); }, 15000);
    const ver = () => { if (!document.hidden) carregar(true); };
    document.addEventListener("visibilitychange", ver);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", ver); };
  }, [logado, carregar]);

  useEffect(() => { if (!embutida) document.title = "Esteira · Champion"; }, [embutida]);

  const chamar = useCallback(async (rota: string, corpo: Record<string, unknown>) => {
    if (!quem) { toast.error("Escolha quem é você no topo da esteira."); return false; }
    setEnviando(true);
    try {
      const r = await fetch(`${FN}${rota}`, { method: "POST", headers: cabecalhos(), body: JSON.stringify({ ...corpo, quem }) });
      if (r.status === 401) { sair(); return false; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      await carregar();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally { setEnviando(false); }
  }, [quem, carregar, sair]);

  const acao = useCallback(async (codigo: string, a: string, extra: Record<string, unknown> = {}) => {
    acoesMinhas.current.add(codigo); // o que eu mesmo fiz não vira "Novo" para mim
    const ok = await chamar("/acao", { codigo, acao: a, ...extra });
    if (ok) toast.success(a === "aprovar" ? "Aprovado" : a === "ajuste" ? "Ajuste pedido" : a === "descartar" ? "Descartado" : a === "trocar_tema" ? "Tema rejeitado: o agente vai escrever outro" : a === "editar_copy" ? "Copy alterada: o agente passa para o Doc na próxima rodada" : "Feito");
    return ok;
  }, [chamar]);

  const fluxos = dados?.fluxos ?? FLUXOS_LOCAL;
  const fluxo = fluxos[tipo === "consciente" || tipo === "aprendizados" ? "carrossel" : tipo];

  // "Novo" dos aprendizados: o que mudou depois da última vez que este aparelho abriu a aba. No primeiro acesso tudo
  // começa como visto; ao entrar na aba, guarda o "antes" (para marcar os novos) e grava o agora a cada atualização.
  const aprendizados = useMemo(() => dados?.aprendizados ?? [], [dados]);
  const [aprVisto, setAprVisto] = useState<string | null>(() => ler(CHAVE_APR_VISTO));
  const [aprVistoAntes, setAprVistoAntes] = useState<string | null>(null);
  const naAbaApr = useRef(false);
  useEffect(() => {
    if (!dados) return;
    if (tipo !== "aprendizados") {
      naAbaApr.current = false;
      if (!aprVisto) { gravar(CHAVE_APR_VISTO, dados.agora); setAprVisto(dados.agora); }
      return;
    }
    if (!naAbaApr.current) { naAbaApr.current = true; setAprVistoAntes(aprVisto || dados.agora); }
    gravar(CHAVE_APR_VISTO, dados.agora); setAprVisto(dados.agora);
  }, [dados, tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  const aprTemNovo = tipo !== "aprendizados" && !!aprVisto && aprendizados.some((i) => Date.parse(i.atualizado_em) > Date.parse(aprVisto));
  const agora = dados ? Date.parse(dados.agora) : Date.now();
  const etapaDa = useCallback((p: Peca) => fluxos[p.tipo]?.find((e) => e.id === p.etapa), [fluxos]);
  const numCod = (c: string) => { const m = c.match(/S(\d+)-[A-Z]+(\d+)/); return m ? +m[1] * 1000 + +m[2] : 1e9; };
  const chaveDia = (p: Peca) => `${p.dia || "9"}T${(p.extra as { hora?: string } | null)?.hora || "99:99"}`;
  const porDia = (a: Peca, b: Peca) =>
    ordem === "codigo" ? numCod(a.codigo) - numCod(b.codigo) || a.codigo.localeCompare(b.codigo)
    : ordem === "data_desc" ? chaveDia(b).localeCompare(chaveDia(a)) || numCod(a.codigo) - numCod(b.codigo)
    : chaveDia(a).localeCompare(chaveDia(b)) || numCod(a.codigo) - numCod(b.codigo);

  const todas = useMemo(() => dados?.pecas ?? [], [dados]);
  const minhas = useMemo(() => (quem ? todas.filter((p) => etapaDa(p)?.dono === quem).sort(porDia) : []), [todas, quem, etapaDa, ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  const doTipo = useMemo(() => todas.filter((p) => daAba(p, tipo)).sort(porDia), [todas, tipo, ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  const visiveis = useMemo(() => doTipo.filter((p) => (filtro === "meu" ? etapaDa(p)?.dono === quem : true)), [doTipo, filtro, quem, etapaDa]);
  const descartados = visiveis.filter((p) => p.etapa === "descartado");

  const peca = aberta ? todas.find((p) => p.codigo === aberta) ?? null : null;
  useEffect(() => {
    if (!dados) return;
    if (visto === null) { marcarVisto(dados.pecas); return; }
    const ver = dados.pecas.filter((p) => (p.codigo === aberta || acoesMinhas.current.has(p.codigo)) && visto[p.codigo] !== p.atualizado_em);
    for (const p of ver) acoesMinhas.current.delete(p.codigo);
    if (ver.length) marcarVisto(ver);
  }, [dados, aberta, visto, marcarVisto]);
  // "Novo" (Rodger, 26/10/2026): em Aprovado não aparece (não tem o que olhar); em Publicado e Descartados some depois de 1 dia
  const ehNovo = (p: Peca) => {
    if (!visto || visto[p.codigo] === p.atualizado_em) return false;
    if (p.etapa === "aprovado") return false;
    if (p.etapa === "publicado" || p.etapa === "descartado") return agora - Date.parse(p.atualizado_em || "") < 86400000;
    return true;
  };
  const etapaAberta = peca ? etapaDa(peca) : undefined;
  const historico = peca ? (dados?.eventos ?? []).filter((e) => e.codigo === peca.codigo) : [];
  const nomeEtapa = (t: Tipo, id: string | null) => (id === "descartado" ? "Descartado" : fluxos[t].find((e) => e.id === id)?.nome ?? id ?? "");
  const abrir = (codigo: string) => { setAberta(codigo); setPedindoAjuste(false); setMotivo(""); setPrints([]); setSlide(0); setTrocandoTema(false); setMotivoTema(""); };
  // o link assinado da miniatura vale 1 h: imagem que não abre pede links novos (no máximo uma vez a cada 30 s)
  const ultimoRecarregar = useRef(0);
  const linkVencido = useCallback(() => {
    if (Date.now() - ultimoRecarregar.current < 30000) return;
    ultimoRecarregar.current = Date.now();
    carregar();
  }, [carregar]);

  // ── Kanban de arrastar (Rodger, 26/10/2026: "arrastar cada post caso eu queira aprovar, igual kanban") ──────────────
  // A tela não inventa movimento: soltar numa coluna vira uma das ações que o servidor já valida. Para a etapa de
  // "aprovar" = Aprovar; para a de "volta" = pedir ajuste (abre o pedido e só move quando ele enviar); Descartados =
  // descartar (confirma); de Descartados para a etapa de antes = reabrir; Reel anda livre ("mover"). O resto não solta.
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [fantasma, setFantasma] = useState<{ x: number; y: number } | null>(null);
  // 26/10/2026 (Rodger: "dá pra arrastar, só que ele não cai no lugar que eu quero"): qualquer coluna aceita qualquer card do
  // mesmo tipo. Para a etapa de aprovar = Aprovar; Ajuste (ou a de volta) = pedir ajuste; Copy = trocar tema; Descartados =
  // descartar; o resto = mover (o servidor grava e registra no histórico)
  const movimento = useCallback((p: Peca, para: string): string | null => {
    if (para === p.etapa || p.etapa === "publicado") return null;
    if (para === "descartado") return "descartar";
    if (p.etapa === "descartado" && para === ((p.extra?.etapa_antes_de_descartar as string) || fluxos[p.tipo][0].id)) return "reabrir";
    const e = etapaDa(p);
    if (e?.aprovar === para) return "aprovar";
    if (e?.volta === para || (p.tipo === "carrossel" && para === "ajuste")) return "ajuste";
    if (para === "copy" && podeTrocarTema(p)) return "trocar_tema";
    if (fluxos[p.tipo]?.some((x) => x.id === para)) return "mover";
    return null;
  }, [etapaDa, fluxos]);
  const soltar = useCallback(async (codigo: string, para: string) => {
    setArrastando(null); setAlvo(null); setFantasma(null);
    fimArrasto.current = Date.now();
    const p = todas.find((x) => x.codigo === codigo);
    const a = p && movimento(p, para);
    if (!p || !a) return;
    if (a === "ajuste") { abrir(codigo); setPedindoAjuste(true); return; }
    if (a === "trocar_tema") { abrir(codigo); setTrocandoTema(true); return; }
    if (a === "descartar" && !window.confirm(`Descartar ${codigo}? Sai da esteira e não é publicado.`)) return;
    // otimista: o card já aparece na coluna nova; se o servidor recusar, volta (o `chamar` mostra o motivo)
    const antes = dados;
    setDados((d) => d && { ...d, pecas: d.pecas.map((x) => (x.codigo === codigo ? { ...x, etapa: para } : x)) });
    const ok = await acao(codigo, a, a === "mover" ? { para } : {});
    if (!ok) { setDados(antes); carregar(true); }
  }, [todas, movimento, dados, acao, carregar]);
  // toque (celular): segurar 350 ms no card começa a arrastar; o dedo leva um "fantasma" do card e solta na coluna de baixo
  const toque = useRef<{ codigo: string; timer: number; ativo: boolean } | null>(null);
  const fimArrasto = useRef(0); // o clique que vem logo depois de soltar não abre o card
  const colunaEm = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-col]") as HTMLElement | null)?.dataset.col ?? null;
  const comecarToque = useCallback((codigo: string, e: React.PointerEvent) => {
    const x0 = e.clientX, y0 = e.clientY;
    const t = { codigo, ativo: false, timer: window.setTimeout(() => { t.ativo = true; setArrastando(codigo); setFantasma({ x: x0, y: y0 }); navigator.vibrate?.(15); }, 350) };
    toque.current = t;
    const mover = (ev: PointerEvent) => {
      if (!t.ativo) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) fim(); return; } // rolou a tela: não é arrasto
      ev.preventDefault();
      setFantasma({ x: ev.clientX, y: ev.clientY });
      setAlvo(colunaEm(ev.clientX, ev.clientY));
    };
    const fim = (ev?: PointerEvent) => {
      window.clearTimeout(t.timer);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      if (t.ativo) fimArrasto.current = Date.now();
      if (t.ativo && ev) { const col = colunaEm(ev.clientX, ev.clientY); if (col) soltar(codigo, col); else { setArrastando(null); setAlvo(null); setFantasma(null); } }
      toque.current = null;
    };
    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
  }, [soltar]);
  // enquanto o dedo arrasta, a página não rola
  useEffect(() => {
    if (!fantasma) return;
    const travar = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", travar, { passive: false });
    return () => document.removeEventListener("touchmove", travar);
  }, [fantasma]);
  const pecaArrastada = arrastando ? todas.find((p) => p.codigo === arrastando) ?? null : null;

  if (!logado) return <Login onEntrar={() => setLogado(true)} tema={tema} />;

  return (
    <div className="esteira" data-tema={tema} style={embutida ? { borderRadius: 12, border: "1px solid var(--linha)", overflow: "hidden" } : { minHeight: "100vh" }}>
      <style>{CSS}</style>

      <header className="es-barra" style={{ position: embutida ? "relative" : "sticky", top: 0, zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <img src="/champion-logo.webp" alt="" width={24} height={24} style={{ borderRadius: 6 }} />
          <h1 className="es-titulo" style={{ fontSize: 24, color: "var(--txt)" }}>Esteira do orgânico</h1>
        </div>
        <div className="es-abas">
          {(["carrossel", "consciente", "reel"] as Aba[]).map((t) => (
            <button key={t} data-on={tipo === t} onClick={() => { setTipo(t); gravar("esteira_tipo", t); }}>
              {t === "carrossel" ? "Carrosséis" : t === "reel" ? "Reels" : "Consciência alta"}<em>{todas.filter((p) => daAba(p, t) && !PRONTAS.has(p.etapa)).length}</em>
              {todas.some((p) => daAba(p, t) && ehNovo(p)) && <b title="Tem novidade" />}
            </button>
          ))}
          <button data-on={tipo === "aprendizados"} onClick={() => { setTipo("aprendizados"); gravar("esteira_tipo", "aprendizados"); }} title="O que os squads e o Claude aprenderam nas revisões">
            Aprendizados<em>{aprendizados.length}</em>
            {aprTemNovo && <b title="Tem aprendizado novo" />}
          </button>
        </div>
        <div className="es-dir">
          {quem && tipo !== "aprendizados" && (
            <button className="es-tog" data-on={filtro === "meu"} onClick={() => setFiltro((f) => (f === "meu" ? "tudo" : "meu"))}>
              Só o meu{minhas.length ? ` (${minhas.length})` : ""}
            </button>
          )}
          {tipo !== "aprendizados" && <select className="es-sel" value={ordem} onChange={(e) => { setOrdem(e.target.value); gravar("esteira_ordem", e.target.value); }} aria-label="Ordem dos cards" title="Ordem dos cards">
            <option value="data">Data ↑ (mais antigo primeiro)</option>
            <option value="data_desc">Data ↓ (mais novo primeiro)</option>
            <option value="codigo">Código (S4-C1, S4-C2...)</option>
          </select>}
          {tipo === "reel" && <button className="es-tog" onClick={() => setNovo({ codigo: "", titulo: "", dia: "", doc_url: "", pasta_url: "" })}><Plus size={14} />Reel</button>}
          <select className="es-sel" value={quem ?? ""} onChange={(e) => { setQuem(e.target.value); gravar(CHAVE_QUEM, e.target.value); }} aria-label="Quem é você">
            <option value="" disabled>Quem é você?</option>
            {PESSOAS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="es-icone" onClick={trocarTema} aria-label={tema === "claro" ? "Tema escuro" : "Tema claro"} title={tema === "claro" ? "Tema escuro" : "Tema claro"}>
            {tema === "claro" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button className="es-icone" onClick={() => carregar()} disabled={carregando} aria-label="Atualizar" title="Atualizar">
            <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
          </button>
          {!embutida && ler(CHAVE_TOKEN) && <button className="es-icone" onClick={sair} aria-label="Sair" title="Sair"><LogOut size={15} /></button>}
        </div>
      </header>

      {!quem && <div className="es-aviso">Escolha <b>quem é você</b> no topo: o seu nome vai no histórico de cada aprovação.</div>}

      {!dados ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}><Loader2 size={24} className="animate-spin" style={{ color: "var(--suave)" }} /></div>
      ) : tipo === "aprendizados" ? (
        <Aprendizados itens={aprendizados} vistoAntes={aprVistoAntes} />
      ) : (
        <main className="es-quadro">
          {[...fluxo, ...(descartados.length || arrastando ? [{ id: "descartado", nome: "Descartados", dono: "" } as Etapa] : [])].map((e) => {
            const lista = visiveis.filter((p) => p.etapa === e.id);
            const aceita = pecaArrastada ? !!movimento(pecaArrastada, e.id) : false;
            return (
              <section key={e.id} className="es-col" data-col={e.id}
                data-alvo={pecaArrastada && alvo === e.id && e.id !== pecaArrastada.etapa ? (aceita ? "ok" : "nao") : undefined}
                // preventDefault sempre que é um card sendo arrastado (o estado do React chega depois do 1o dragover; sem isso o
                // Chrome recusa o drop e o card volta para onde estava)
                onDragOver={(ev) => { if (!ev.dataTransfer.types.includes("text/plain")) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; if (alvo !== e.id) setAlvo(e.id); }}
                onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setAlvo((a) => (a === e.id ? null : a)); }}
                onDrop={(ev) => { ev.preventDefault(); const c = ev.dataTransfer.getData("text/plain") || arrastando; if (c) soltar(c, e.id); else { setArrastando(null); setAlvo(null); } }}>
                <div className="es-col-topo">
                  <span className="es-ponto" style={{ background: e.id === "descartado" ? "var(--fraco)" : COR_DONO[e.dono] ?? "var(--fraco)" }} />
                  <span className="es-col-nome">{e.nome}</span>
                  <span className="es-col-n">{lista.length}</span>
                  <span className="es-col-dono">{e.id === "descartado" ? "" : e.dono === "Agente" ? "automático" : e.dono || "no ar"}</span>
                </div>
                <div className="es-col-lista">
                  {lista.map((p) => (
                    <Cartao key={p.codigo} p={p} etapa={e.id === "descartado" ? undefined : e} previas={dados.previas} enviando={enviando} novo={ehNovo(p)} agora={agora}
                      arrastando={arrastando === p.codigo} onArrastar={(on) => { if (on) setArrastando(p.codigo); else { setArrastando(null); setAlvo(null); } }}
                      onToque={(ev) => comecarToque(p.codigo, ev)}
                      onAbrir={() => { if (Date.now() - fimArrasto.current > 400) abrir(p.codigo); }} onAprovar={() => acao(p.codigo, "aprovar")} />
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      )}
      {fantasma && pecaArrastada && (
        <div className="es-card es-fantasma" style={{ left: fantasma.x - 120, top: fantasma.y - 30 }}>
          <p className="es-tit">{pecaArrastada.titulo || pecaArrastada.codigo}</p>
          <div className="es-meta"><span className="es-cod">{pecaArrastada.codigo}</span></div>
        </div>
      )}

      {/* Detalhe da peça */}
      <Dialog open={!!peca} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="es-dialog max-w-5xl max-h-[92vh] overflow-y-auto" data-tema={tema}>
          <style>{CSS}</style>
          {peca && (
            <>
              <DialogHeader>
                <DialogTitle style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, color: "var(--txt)" }}>
                  <span className="es-cod" style={{ fontSize: 13 }}><IconeTipo t={peca.tipo} />{peca.codigo}</span>
                  <span className="es-dia" style={{ fontSize: 13 }}>{nomeEtapa(peca.tipo, peca.etapa)} · sai {diaCurto(peca.dia)}</span>
                  {atrasoDe(peca) && <span className="es-pilula">{atrasoDe(peca)}</span>}
                  <Selo p={peca} />
                </DialogTitle>
                <DialogDescription style={{ color: "var(--txt)", fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>
                  {peca.titulo || "Sem título ainda"}
                </DialogDescription>
              </DialogHeader>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {peca.doc_url && <a className="es-btn es-btn-linha" href={peca.doc_url} target="_blank" rel="noreferrer"><FileText size={14} />{peca.tipo === "reel" ? "Roteiro no Doc" : "Copy no Doc"}</a>}
                {peca.pasta_url && <a className="es-btn es-btn-linha" href={peca.pasta_url} target="_blank" rel="noreferrer"><Folder size={14} />{peca.tipo === "reel" ? "Vídeo no Drive" : "Arte no Drive"}</a>}
                {peca.post_url && <a className="es-btn es-btn-linha" href={peca.post_url} target="_blank" rel="noreferrer"><Instagram size={14} />Post no ar</a>}
                {peca.tipo === "reel" && <button className="es-btn es-btn-linha" onClick={() => setNovo({ codigo: peca.codigo, titulo: peca.titulo || "", dia: peca.dia || "", doc_url: peca.doc_url || "", pasta_url: peca.pasta_url || "" })}>Editar</button>}
              </div>

              {peca.ajuste && (
                <div className="es-ajuste" style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
                  <b>Ajuste pedido{peca.ajuste_por ? ` por ${peca.ajuste_por}` : ""}{peca.ajuste_em ? ` em ${quando(peca.ajuste_em)}` : ""}</b>
                  <div style={{ marginTop: 4 }}>{peca.ajuste}</div>
                  {Array.isArray(peca.extra?.ajuste_prints) && (peca.extra.ajuste_prints as string[]).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {(peca.extra.ajuste_prints as string[]).map((c) => dados?.previas[c]).filter((u): u is string => !!u).map((u, k) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" title={`Abrir print ${k + 1}`}>
                          <img src={u} alt={`print ${k + 1}`} onError={linkVencido} style={{ height: 90, borderRadius: 6, border: "1px solid var(--linha)", display: "block" }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {peca.etapa === "revisao_rodger" && typeof peca.extra?.ajuste_resposta === "string" && (
                <div className="es-feito" style={{ whiteSpace: "pre-wrap" }}>
                  <b>O que mudei no seu ajuste</b>
                  <div style={{ marginTop: 4 }}>{peca.extra.ajuste_resposta as string}</div>
                </div>
              )}

              <EstadoAgente p={peca} agora={agora} longo />
              {peca.etapa === "ajuste" && typeof peca.extra?.ajuste_resposta === "string" && falhouDe(peca) && (
                <div className="es-feito" style={{ whiteSpace: "pre-wrap" }}><b>O que o agente respondeu</b><div style={{ marginTop: 4 }}>{peca.extra.ajuste_resposta as string}</div></div>
              )}
              {(() => { const sd = saidaDe(peca, agora); return sd && <div className="es-saida" data-atrasado={sd.atrasado}><Clock size={14} />{sd.texto}</div>; })()}

              {(() => {
                // a ideia do carrossel (big idea, tema e prova de viral), gravada pelo agente a partir do Doc (20/10/2026)
                const i = peca.extra?.ideia as { big_idea?: string; tema?: string; por_que?: string; links?: string[] } | undefined;
                if (!i || (!i.big_idea && !i.tema)) return null;
                return (
                  <div className="es-ideia">
                    <b>A ideia</b>
                    {i.big_idea && <p>{i.big_idea}</p>}
                    {i.tema && <p><span style={{ color: "var(--suave)" }}>Tema: </span>{i.tema}</p>}
                    {i.por_que && <p><span style={{ color: "var(--suave)" }}>Por que está viral: </span>{i.por_que}</p>}
                    {(i.links || []).length > 0 && <div>{(i.links || []).slice(0, 4).map((l, k) => <a key={l} href={l} target="_blank" rel="noreferrer">prova {k + 1}</a>)}</div>}
                  </div>
                );
              })()}

              {(() => {
                // vídeo do Reel (player do Drive) + miniaturas da arte, uma por vez, e a copy do Doc ao lado (20/10/2026)
                const itens: ItemVisor[] = [
                  ...(typeof peca.extra?.video_id === "string" ? [{ video: peca.extra.video_id }] : []),
                  ...(semPrevia(peca) ? [] : peca.previas || []).map((c) => dados?.previas[c]).filter((u): u is string => !!u).map((url) => ({ url })),
                ];
                const copy = peca.extra?.copy as CopyDoc | undefined;
                if (!itens.length && !copy?.slides?.length)
                  return ["revisao_rodger", "aprovado"].includes(peca.etapa)
                    ? <p className="es-nota">As miniaturas aparecem na próxima rodada do agente (de hora em hora). O material completo está no Drive.</p>
                    : null;
                return (
                  <div className="es-duo">
                    {itens.length > 0 && <Visor itens={itens} tipo={peca.tipo} i={slide} setI={setSlide} onErro={linkVencido} legenda={peca.titulo || ""} />}
                    {copy?.slides?.length ? <Copy copy={copy} i={slide} setI={setSlide} enviando={enviando} unidade={peca.tipo === "direct" ? "Mensagem" : "Slide"}
                      onSalvar={peca.tipo === "carrossel" && peca.etapa === "copy" && !peca.extra?.trocar_tema ? (e) => acao(peca.codigo, "editar_copy", e) : undefined} /> : null}
                  </div>
                );
              })()}

              {pedindoAjuste && (
                <div style={{ display: "grid", gap: 6 }}>
                  <textarea className="es-campo" autoFocus rows={4} placeholder="O que precisa mudar? Seja específico: slide, frase, imagem, corte. Dá para colar print aqui (Ctrl+V)." value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.some((x) => x.type.startsWith("image/"))) { e.preventDefault(); anexar(f); } }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { const f = Array.from(e.dataTransfer.files); if (f.length) { e.preventDefault(); anexar(f); } }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {prints.map((d, k) => (
                      <div key={k} style={{ position: "relative" }}>
                        <img src={d} alt={`print ${k + 1}`} style={{ height: 70, borderRadius: 6, border: "1px solid var(--linha)", display: "block" }} />
                        <button type="button" onClick={() => setPrints((p) => p.filter((_, j) => j !== k))} title="Tirar o print"
                          style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, background: "#C0362C", color: "#fff", fontSize: 12, lineHeight: "20px", border: 0, cursor: "pointer" }}>×</button>
                      </div>
                    ))}
                    {prints.length < 4 && <button type="button" className="es-btn es-btn-linha" onClick={() => inputPrint.current?.click()}><ImagePlus size={14} />Anexar print</button>}
                    <input ref={inputPrint} type="file" accept="image/*" multiple hidden onChange={(e) => { anexar(Array.from(e.target.files || [])); e.target.value = ""; }} />
                  </div>
                  <span className="es-nota">Volta para: {nomeEtapa(peca.tipo, etapaAberta?.volta ?? null)}</span>
                </div>
              )}

              {trocandoTema && podeTrocarTema(peca) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, border: "1px solid var(--linha)", borderRadius: 12, padding: 12 }}>
                  <b style={{ fontSize: 14 }}>Trocar o tema de {peca.codigo}</b>
                  <span className="es-nota">A copy e a arte deste carrossel saem. O agente escreve outro com um tema viral novo e não repete este.</span>
                  <textarea className="es-campo" rows={2} placeholder="Por quê? (opcional)" value={motivoTema} onChange={(e) => setMotivoTema(e.target.value)} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="es-btn es-btn-linha" onClick={() => { setTrocandoTema(false); setMotivoTema(""); }}>Cancelar</button>
                    <button className="es-btn es-btn-royal" disabled={enviando}
                      onClick={() => acao(peca.codigo, "trocar_tema", { motivo: motivoTema }).then((ok) => { if (ok) { setTrocandoTema(false); setMotivoTema(""); } })}>
                      <Repeat2 size={14} />Confirmar troca de tema
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {peca.etapa === "descartado" ? (
                    <button className="es-btn es-btn-linha" disabled={enviando} onClick={() => acao(peca.codigo, "reabrir")}><RotateCcw size={14} />Reabrir</button>
                  ) : peca.etapa !== "publicado" && (
                    <button className="es-btn es-btn-perigo" disabled={enviando}
                      onClick={() => { if (window.confirm(`Descartar ${peca.codigo}? Sai da esteira e não é publicado.`)) acao(peca.codigo, "descartar").then((ok) => ok && setAberta(null)); }}>
                      <Trash2 size={14} />Descartar
                    </button>
                  )}
                  {podeTrocarTema(peca) && !trocandoTema && !pedindoAjuste && (
                    <button className="es-btn es-btn-linha" disabled={enviando} onClick={() => setTrocandoTema(true)} title="Rejeitar este tema: o agente escreve outra copy com um tema viral novo">
                      <Repeat2 size={14} />Trocar tema
                    </button>
                  )}
                  {peca.tipo === "reel" && peca.etapa !== "descartado" && (
                    <select className="es-campo" style={{ width: "auto", padding: "7px 10px", fontSize: 13 }} value={peca.etapa} onChange={(e) => e.target.value !== peca.etapa && acao(peca.codigo, "mover", { para: e.target.value })}>
                      {fluxos.reel.map((e) => <option key={e.id} value={e.id}>Mover para: {e.nome}</option>)}
                    </select>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {etapaAberta?.volta && (pedindoAjuste ? (
                    <>
                      <button className="es-btn es-btn-linha" onClick={() => { setPedindoAjuste(false); setPrints([]); }}>Cancelar</button>
                      <button className="es-btn es-btn-royal" disabled={enviando || !motivo.trim()}
                        onClick={() => acao(peca.codigo, "ajuste", { motivo, prints }).then((ok) => { if (ok) { setPedindoAjuste(false); setMotivo(""); setPrints([]); } })}>
                        <Undo2 size={14} />Enviar ajuste
                      </button>
                    </>
                  ) : (
                    <button className="es-btn es-btn-linha" onClick={() => setPedindoAjuste(true)}><Undo2 size={14} />Pedir ajuste</button>
                  ))}
                  {etapaAberta?.aprovar && !pedindoAjuste && (
                    <button className="es-btn es-btn-ouro" disabled={enviando} onClick={() => acao(peca.codigo, "aprovar")}>
                      {enviando ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} />{etapaAberta.rotulo || "Aprovar"}</>}
                    </button>
                  )}
                </div>
              </div>

              {historico.length > 0 && (
                <div style={{ borderTop: "1px solid var(--linha)", paddingTop: 12 }}>
                  <p className="es-titulo" style={{ fontSize: 20, marginBottom: 4 }}>Histórico</p>
                  <ul className="es-hist">
                    {historico.map((h) => (
                      <li key={h.id}>
                        <span style={{ color: "var(--suave)", flex: "none", width: 92 }}>{quando(h.criado_em)}</span>
                        <span>
                          <b>{h.quem === "agente" ? "Agente" : h.quem}</b>{" "}
                          {h.acao === "criado" ? `criou em ${nomeEtapa(peca.tipo, h.para)}` : h.acao === "ajuste" ? `pediu ajuste (volta para ${nomeEtapa(peca.tipo, h.para)})` : h.acao === "aprovado" ? `aprovou: ${nomeEtapa(peca.tipo, h.de)} → ${nomeEtapa(peca.tipo, h.para)}` : h.acao === "descartado" ? "descartou" : h.acao === "trocar_tema" ? "trocou o tema" : h.acao === "editado" ? "alterou a copy" : `${nomeEtapa(peca.tipo, h.de)} → ${nomeEtapa(peca.tipo, h.para)}`}
                          {h.mensagem && <span style={{ display: "block", color: "var(--suave)", whiteSpace: "pre-wrap" }}>"{h.mensagem}"</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Novo Reel / editar */}
      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent className="es-dialog max-w-md" data-tema={tema}>
          <style>{CSS}</style>
          {novo && (
            <>
              <DialogHeader>
                <DialogTitle className="es-titulo" style={{ fontSize: 28, color: "var(--txt)" }}>{todas.some((p) => p.codigo === novo.codigo.toUpperCase()) ? "Editar Reel" : "Novo Reel"}</DialogTitle>
                <DialogDescription style={{ color: "var(--suave)" }}>As 7 vagas da semana (E1, P1, V1, E2, P2, E3, P3) já entram sozinhas. Use para dar tema, dia e links, ou para um Reel extra.</DialogDescription>
              </DialogHeader>
              <div style={{ display: "grid", gap: 10 }}>
                <input className="es-campo" placeholder="Código (S5-E1)" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
                <input className="es-campo" placeholder="Tema ou gancho" value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
                <label style={{ fontSize: 12, color: "var(--suave)", fontWeight: 600 }}>Dia em que sai
                  <input className="es-campo" type="date" value={novo.dia} onChange={(e) => setNovo({ ...novo, dia: e.target.value })} style={{ marginTop: 4 }} />
                </label>
                <input className="es-campo" placeholder="Link do roteiro (Doc)" value={novo.doc_url} onChange={(e) => setNovo({ ...novo, doc_url: e.target.value })} />
                <input className="es-campo" placeholder="Link da pasta do vídeo (Drive)" value={novo.pasta_url} onChange={(e) => setNovo({ ...novo, pasta_url: e.target.value })} />
                <button className="es-btn es-btn-ouro" style={{ padding: 11 }} disabled={enviando || !novo.codigo.trim()}
                  onClick={() => chamar("/peca", { tipo: "reel", ...novo }).then((ok) => { if (ok) { toast.success("Salvo"); setNovo(null); } })}>
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
