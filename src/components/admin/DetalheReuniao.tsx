// Tudo que se sabe sobre uma reunião, numa tela só.
//
// ── Por que existe ───────────────────────────────────────────────────────────
// A tabela mostra sete colunas espremidas e o Processo Abóbora não aparecia em
// lugar nenhum: o SDR levantava a posição do lead, o segmento, se ele decide e
// quanto investe — e ninguém lia. Informação que só é escrita não vira decisão.
//
// ── O campo do closer ────────────────────────────────────────────────────────
// Depois da call, o Caio escreve POR QUE ela fechou ou não fechou. São dois
// campos de propósito: a categoria serve para agregar ("preço apareceu em 6 das
// 10 perdidas" é acionável) e o texto guarda o caso, que o balde perde — "a
// esposa não deixou" e "o sócio vetou" caem os dois em `decisor` e pedem
// conversas diferentes.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Video, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";
import { PERGUNTAS_ABOBORA, ROTULO_ORIGEM } from "@/lib/funis";

export const MOTIVOS: Array<{ value: string; label: string; ajuda: string }> = [
  { value: "fechou", label: "Fechou", ajuda: "A call virou venda." },
  { value: "reembolso", label: "Fechou e devolveu", ajuda: "Virou venda e depois pediu reembolso. É a perda mais cara: custou mídia, call e entrega." },
  // 07/09/2026: "preco" foi partido em dois. Não ter dinheiro e achar caro são
  // problemas opostos — o primeiro é qualificação, o segundo é oferta — e
  // enquanto os dois caíam no mesmo balde, nenhuma das duas conversas melhorava.
  { value: "sem_verba", label: "Sem verba", ajuda: "Quer e entendeu o valor, mas não tem como pagar agora." },
  { value: "preco", label: "Preço", ajuda: "Tem caixa, mas achou caro para o valor que enxergou." },
  { value: "decisor", label: "Decisor ausente", ajuda: "Quem estava na call não podia decidir, e o outro decisor não participou." },
  { value: "timing", label: "Momento", ajuda: "Há fit, mas existe um impedimento real de tempo." },
  { value: "sem_fit", label: "Sem fit", ajuda: "Operação, canal ou modelo não é o que a Champion atende." },
  { value: "nao_percebeu_valor", label: "Não percebeu valor", ajuda: "Tem condições, mas não se convenceu de que resolvemos o problema dele." },
  { value: "concorrente", label: "Foi para outro", ajuda: "Escolheu outro fornecedor." },
  { value: "sumiu", label: "Sumiu", ajuda: "Não declarou motivo nenhum e parou de responder depois da call." },
  { value: "outro", label: "Outro", ajuda: "Só quando nenhuma categoria acima representa o caso. Escreva abaixo." },
];

export interface ReuniaoDetalhe {
  id: string;
  lead_nome_resolvido?: string | null;
  lead_id?: string | null;
  utm_content?: string | null;
  creative_key?: string | null;
  headline_path?: string | null;
  origem?: string | null;
  closer?: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  created_at?: string;
  notes?: string | null;
  abobora_posicao?: string | null;
  abobora_segmento?: string | null;
  abobora_decide?: string | null;
  abobora_quem_decide?: string | null;
  abobora_investimento?: string | null;
  recording_url?: string | null;
  motivo_categoria?: string | null;
  motivo_detalhe?: string | null;
  motivo_por?: string | null;
  motivo_at?: string | null;
}

/** A aplicação do lead, como ela veio do quiz. */
interface LeadDaReuniao {
  nome_completo?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  email?: string | null;
  mercado?: string | null;
  operacoes_ativas?: number | null;
  investimento_faixa?: string | null;
  faturamento_declarado?: number | null;
  dor_desejo?: string | null;
  nps_score?: number | null;
  score?: number | null;
  tier?: string | null;
  created_at?: string | null;
  contacted_at?: string | null;
  contacted_by?: string | null;
  utm_campaign?: string | null;
  raw_answers_json?: Record<string, unknown> | null;
}

const reais = (v: number | null | undefined) =>
  v == null ? null : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Rótulos das respostas que o quiz grava em código. */
const VALOR_LEGIVEL: Record<string, string> = {
  faturei: "Foi o que faturei no mês passado",
  media: "É a minha média dos últimos meses",
  espera: "É o que eu espero faturar",
};

/** A nota do site tem três significados, não é escala contínua. */
function entendimentoDoSite(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (n <= 2) return `${n}/10 · não leu a página`;
  if (n <= 7) return `${n}/10 · leu e não entendeu`;
  return `${n}/10 · leu e entendeu`;
}

interface Props {
  reuniao: ReuniaoDetalhe | null;
  aoFechar: () => void;
  /** Rótulo legível da variante de página. */
  rotuloPagina: (path: string | null | undefined) => string;
  /** Quem está usando o painel, para assinar o motivo. */
  autor?: string;
  aoSalvarMotivo: (id: string, categoria: string, detalhe: string, por: string) => void;
}

const dataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{rotulo}</p>
      <div className="text-sm">{children || "—"}</div>
    </div>
  );
}

export default function DetalheReuniao({ reuniao, aoFechar, rotuloPagina, autor = "Caio", aoSalvarMotivo }: Props) {
  const [categoria, setCategoria] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [lead, setLead] = useState<LeadDaReuniao | null>(null);
  const [carregandoLead, setCarregandoLead] = useState(false);

  useEffect(() => {
    setCategoria(reuniao?.motivo_categoria || "");
    setDetalhe(reuniao?.motivo_detalhe || "");
  }, [reuniao]);

  // A aplicação só é buscada quando a reunião abre. Carregar o quiz inteiro de
  // trinta reuniões para desenhar a tabela seria pagar caro por nada.
  useEffect(() => {
    if (!reuniao?.id) { setLead(null); return; }
    let vivo = true;
    setCarregandoLead(true);
    (async () => {
      try {
        const base = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetchAdmin(`${base}/functions/v1/admin-data/meetings/${reuniao.id}/detalhe`, {
          headers: { "x-admin-token": getAdminToken() || "" },
        });
        const j = await res.json();
        if (vivo && res.ok) setLead((j.lead as LeadDaReuniao) || null);
      } catch {
        if (vivo) setLead(null);
      } finally {
        if (vivo) setCarregandoLead(false);
      }
    })();
    return () => { vivo = false; };
  }, [reuniao?.id]);

  if (!reuniao) return null;

  /**
   * Quando o campo de desfecho abre.
   *
   * Era só `realizada`/`no_show`, e isso criava um impasse (17/09/2026): marcar
   * como realizada exige motivo, e o campo de motivo só aparecia depois de
   * marcar como realizada. O closer clicava, o painel abria a reunião e não
   * tinha onde escrever. Agora a call que JÁ PASSOU da hora também abre o
   * campo: a data no passado é o que prova que ela aconteceu (ou não).
   */
  const quando = reuniao.scheduled_at || reuniao.created_at;
  const jaPassou = quando ? new Date(quando).getTime() <= Date.now() : false;
  const jaAconteceu = reuniao.status === "realizada" || reuniao.status === "no_show" || jaPassou;

  const salvar = async () => {
    if (!categoria) {
      toast({ title: "Escolha o que aconteceu na call", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetchAdmin(`${base}/functions/v1/admin-data/meetings/${reuniao.id}`, {
        method: "PUT",
        headers: { "x-admin-token": getAdminToken() || "", "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo_categoria: categoria,
          motivo_detalhe: detalhe,
          motivo_por: autor,
        }),
      });
      if (!res.ok) throw new Error("falha ao salvar");
      aoSalvarMotivo(reuniao.id, categoria, detalhe, autor);
      toast({ title: "Desfecho registrado!" });
    } catch (e) {
      toast({
        title: "Não deu para salvar o desfecho",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  const abobora = [
    { q: PERGUNTAS_ABOBORA[0], v: reuniao.abobora_posicao },
    { q: PERGUNTAS_ABOBORA[1], v: reuniao.abobora_segmento },
    {
      q: PERGUNTAS_ABOBORA[2],
      v: reuniao.abobora_decide === "sim" ? "Sim, ele decide"
        : reuniao.abobora_decide === "nao" ? "Não, depende de outra pessoa"
          : null,
    },
    { q: PERGUNTAS_ABOBORA[3], v: reuniao.abobora_quem_decide },
    { q: PERGUNTAS_ABOBORA[4], v: reuniao.abobora_investimento },
  ].filter((x) => x.v);

  return (
    <Dialog open={!!reuniao} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {reuniao.lead_nome_resolvido || "Reunião"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── A APLICAÇÃO ─────────────────────────────────────────────────
              O que o lead declarou no quiz. É a preparação do closer: ele entra
              na call sabendo o faturamento, a dor escrita com as palavras da
              pessoa, e se ela prometeu responder. Estava tudo no banco e em
              nenhuma tela do lado da reunião. */}
          <div className="border border-sky-500/25 bg-sky-500/5 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-sky-300">A aplicação</p>
              {carregandoLead && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
              {!carregandoLead && !lead && (
                <span className="text-[10px] text-muted-foreground">sem lead no sistema</span>
              )}
            </div>

            {lead && (() => {
              const raw = (lead.raw_answers_json || {}) as Record<string, unknown>;
              const texto = (v: unknown) => {
                const bruto = v === null || v === undefined || v === "" ? null : String(v);
                return bruto ? (VALOR_LEGIVEL[bruto] || bruto) : null;
              };
              const faturamento = lead.faturamento_declarado != null
                ? `${reais(lead.faturamento_declarado)}${lead.investimento_faixa ? ` · ${lead.investimento_faixa}` : ""}`
                : lead.investimento_faixa;
              const compromisso = texto(raw.compromisso_whatsapp);
              return (
                <>
                  {/* Contato primeiro: é o que o Caio usa nos dois minutos
                      antes da call. */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {lead.whatsapp && (
                      <a
                        href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        {lead.whatsapp}
                      </a>
                    )}
                    {lead.instagram && (
                      <a
                        href={`https://instagram.com/${lead.instagram.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pink-400 hover:underline"
                      >
                        {lead.instagram}
                      </a>
                    )}
                    {lead.email && <span className="text-muted-foreground">{lead.email}</span>}
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <Campo rotulo="Faturamento declarado">{faturamento}</Campo>
                    <Campo rotulo="Mercado">{lead.mercado}</Campo>
                    <Campo rotulo="Operações ativas">
                      {lead.operacoes_ativas === 0 ? "Nenhuma" : lead.operacoes_ativas}
                    </Campo>
                    <Campo rotulo="Nota de qualificação">
                      {lead.score != null ? `${lead.score}/100${lead.tier ? ` · ${lead.tier}` : ""}` : lead.tier}
                    </Campo>
                    <Campo rotulo="Entendeu a página">{entendimentoDoSite(lead.nps_score)}</Campo>
                    <Campo rotulo="Aceita call de diagnóstico">{texto(raw.aceita_call_diagnostico)}</Campo>
                    <Campo rotulo="Se compromete a responder">
                      {compromisso && (
                        <span className={
                          compromisso === "Sim" ? "text-emerald-400"
                            : compromisso === "Talvez" ? "text-amber-400" : "text-rose-400"
                        }>
                          {compromisso}
                        </span>
                      )}
                    </Campo>
                    <Campo rotulo="Caixa ou expectativa">{texto(raw.faturamento_confirmado)}</Campo>
                    <Campo rotulo="Entrou em">{dataHora(lead.created_at)}</Campo>
                    <Campo rotulo="Chamado no WhatsApp">
                      {lead.contacted_at
                        ? `${dataHora(lead.contacted_at)}${lead.contacted_by ? ` por ${lead.contacted_by}` : ""}`
                        : "ainda não"}
                    </Campo>
                  </div>

                  {/* A dor, com as palavras da pessoa. É a única coisa aqui que
                      não é campo fechado, e costuma ser a melhor abertura de
                      call que existe. */}
                  {lead.dor_desejo && (
                    <div className="border-t border-sky-500/20 pt-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Dor / desejo, nas palavras dele
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{lead.dor_desejo}</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <p className="text-sm font-semibold">A reunião</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Campo rotulo="Data da call">{dataHora(reuniao.scheduled_at)}</Campo>
            <Campo rotulo="Agendada em">{dataHora(reuniao.created_at)}</Campo>
            <Campo rotulo="Closer">{reuniao.closer}</Campo>
            <Campo rotulo="Situação">
              <span className={
                reuniao.status === "realizada" ? "text-emerald-400"
                  : reuniao.status === "no_show" ? "text-rose-400" : "text-amber-400"
              }>
                {reuniao.status === "realizada" ? "Realizada"
                  : reuniao.status === "no_show" ? "No-show" : "Agendada"}
              </span>
            </Campo>
            <Campo rotulo="Origem">{ROTULO_ORIGEM[reuniao.origem || "midia_paga"]}</Campo>
            <Campo rotulo="Criativo">{reuniao.utm_content || reuniao.creative_key}</Campo>
            <Campo rotulo="Página de entrada">{rotuloPagina(reuniao.headline_path)}</Campo>
            <Campo rotulo="Gravação">
              {reuniao.recording_url ? (
                <a
                  href={reuniao.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Video className="w-3.5 h-3.5" /> abrir
                </a>
              ) : "não subida"}
            </Campo>
          </div>

          {reuniao.notes && (
            <Campo rotulo="Observação">
              <p className="whitespace-pre-wrap">{reuniao.notes}</p>
            </Campo>
          )}

          {/* Processo Abóbora — o que o SDR levantou antes de passar a call. */}
          <div className="border border-orange-500/25 bg-orange-500/5 rounded-lg p-3 space-y-3">
            <p className="text-sm font-semibold text-orange-300">Processo Abóbora</p>
            {abobora.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Reunião registrada antes de 03/09/2026, quando o Abóbora passou a ser obrigatório.
              </p>
            ) : (
              abobora.map(({ q, v }) => (
                <div key={q.campo}>
                  <p className="text-[11px] text-muted-foreground leading-snug">{q.titulo}</p>
                  <p className="text-sm whitespace-pre-wrap">{v}</p>
                </div>
              ))
            )}
          </div>

          {/* O desfecho, escrito pelo closer. Só aparece depois da call: pedir
              antes seria pedir adivinhação. */}
          {jaAconteceu ? (
            <div className="border border-border rounded-lg p-3 space-y-3">
              <div>
                <p className="text-sm font-semibold">O que aconteceu na call</p>
                <p className="text-[11px] text-muted-foreground">
                  Por que fechou, ou por que não fechou. É daqui que sai a resposta de
                  qual objeção derruba mais venda.
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Motivo *</label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Escolha o que pesou" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-sm">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoria && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {MOTIVOS.find((m) => m.value === categoria)?.ajuda}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground">O que rolou</label>
                <Textarea
                  rows={4}
                  className="mt-1 text-sm"
                  placeholder="Ex: gostou da proposta, mas disse que precisa falar com a esposa antes de tirar do caixa. Ficou de responder na segunda."
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                />
              </div>

              {reuniao.motivo_at && (
                <p className="text-[10px] text-muted-foreground">
                  Registrado por {reuniao.motivo_por || "—"} em {dataHora(reuniao.motivo_at)}.
                </p>
              )}

              {/* "Outro" sem texto não agrega nada: é o balde onde o caso se perde.
                  As demais categorias já dizem o que precisam dizer sozinhas. */}
              <Button
                onClick={salvar}
                disabled={salvando || !categoria || (categoria === "outro" && detalhe.trim().length < 3)}
                className="w-full"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {reuniao.motivo_categoria ? "Atualizar desfecho" : "Salvar desfecho"}
              </Button>
            </div>
          ) : (
            <p className="flex gap-2 text-[11px] text-muted-foreground border border-border/60 rounded-lg p-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              O campo de desfecho abre depois que a call for marcada como realizada ou no-show.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
