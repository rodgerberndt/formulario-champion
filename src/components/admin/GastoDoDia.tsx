// O dia de hoje em mídia, dentro do card de Tráfego.
//
// O painel sabia dizer quanto foi gasto num período, mas não respondia a
// pergunta que se faz de manhã: "quanto eu vou gastar hoje?". São dois números
// diferentes e os dois importam. O realizado mede o passado; o orçamento das
// campanhas no ar mede o compromisso do dia que ainda está correndo.
//
// ── Por que fica colado no Total Spend ───────────────────────────────────────
// Isto morava num bloco separado no topo da aba, e o Rodger pediu para juntar:
// olhar "gastei R$ 2.129 no período filtrado" sem ver "e hoje vão sair mais R$
// 749" é meia informação, e as duas metades estavam em pontos distantes da tela.
//
// ── Por que ignora o filtro de data ──────────────────────────────────────────
// De propósito, e é o pedido explícito. Todo o resto do card responde ao
// filtro; este bloco responde SEMPRE por hoje. Orçamento de campanha é um fato
// do presente — não existe "quanto eu vou gastar em agosto passado" — e fazer
// ele acompanhar o filtro só produziria um número sem significado.
//
// ── A armadilha que este bloco existe para mostrar ───────────────────────────
// **Conjunto ligado sem nenhum anúncio ativo não gasta nada.** Ele aparece com
// orçamento no Gerenciador e entrega zero, e é assim que uma conta parece estar
// investindo R$ 900 enquanto entrega R$ 600. Quando isso acontece, a verba
// parada aparece em âmbar com o nome do conjunto.

import { useCallback, useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";

interface PorCampanha {
  campanha: string;
  usd: number;
  brl: number | null;
}

interface Dia {
  data: string;
  gasto: { brl: number; usd: number };
  sincronizado_ate: string | null;
  taxa: number | null;
  orcamento: {
    disponivel: boolean;
    motivo?: string;
    usd?: number;
    brl?: number | null;
    conjuntos_ativos?: number;
    conjuntos_entregando?: number;
    parado_usd?: number;
    parado_brl?: number | null;
    ativos_sem_anuncio?: Array<{ campanha: string; conjunto: string; usd: number }>;
    por_campanha?: PorCampanha[];
  };
}

const reais = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "13:42" a partir do timestamp UTC que o banco guarda. */
const horaBr = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(11, 16);
};

export default function GastoDoDia() {
  const [dados, setDados] = useState<Dia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { fetchAdmin } = await import("@/lib/adminAuth");
      const base = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetchAdmin(`${base}/functions/v1/admin-data/dia`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setDados(j);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando && !dados) {
    return (
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hoje em mídia</p>
        <p className="text-lg font-bold text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 animate-spin" />
        </p>
      </div>
    );
  }
  if (erro || !dados) {
    return (
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Hoje em mídia</p>
        <p className="text-lg font-bold text-muted-foreground">—</p>
        <p className="text-[10px] text-muted-foreground">indisponível</p>
      </div>
    );
  }

  const o = dados.orcamento;
  const gasto = dados.gasto.brl;
  const previsto = o.disponivel ? o.brl ?? null : null;
  // Quanto do compromisso do dia já saiu. Passa de 100% quando o orçamento foi
  // cortado depois de a verba já ter sido gasta, e isso é informação, não erro.
  const pct = previsto && previsto > 0 ? Math.min(100, (gasto / previsto) * 100) : null;
  const parado = o.parado_brl ?? 0;
  const hora = horaBr(dados.sincronizado_ate);

  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <TrendingUp className="w-3 h-3 text-sky-400" /> Hoje em mídia
        <span className="normal-case tracking-normal text-muted-foreground/60">(ignora o filtro)</span>
        <button
          type="button"
          onClick={carregar}
          className="text-muted-foreground/60 hover:text-foreground transition-colors"
          title="Atualizar"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${carregando ? "animate-spin" : ""}`} />
        </button>
      </p>

      {/* Os dois números na mesma linha e sem quebra: o que já saiu e o que
          ainda vai sair. Separados eles não conversam; juntos, a diferença é a
          leitura. Antes isto quebrava em três linhas e virava sopa. */}
      <p className="text-lg font-bold leading-tight whitespace-nowrap tabular-nums">
        {reais(gasto)}
        <span className="text-[11px] font-normal text-muted-foreground"> / </span>
        <span className="text-sky-400">{o.disponivel ? reais(previsto) : "—"}</span>
      </p>

      {pct != null && (
        <div className="relative h-1 w-full max-w-[180px] bg-muted mt-1.5 mb-1">
          <div className="absolute inset-y-0 left-0 bg-sky-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-snug">
        {o.disponivel
          ? `${pct != null ? `${pct.toFixed(0)}% já saiu · ` : ""}${o.conjuntos_entregando} conjuntos`
          : `indisponível: ${o.motivo ?? "erro"}`}
        {hora ? ` · ${hora}` : ""}
        {(o.por_campanha?.length ?? 0) > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="ml-1 underline underline-offset-2 hover:text-foreground">
                por campanha
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[320px] p-3">
              <p className="text-xs font-semibold mb-2">Orçamento de hoje por campanha</p>
              {/* Nome de campanha e longo e o popover tem 320px fixos. A celula
                  quebra a linha; o scroll aqui e so a rede de baixo. */}
              <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <tbody>
                  {o.por_campanha!.map((c) => (
                    <tr key={c.campanha} className="border-t border-border/40">
                      <td className="py-1 pr-2 text-muted-foreground break-words">{c.campanha}</td>
                      <td className="py-1 text-right tabular-nums whitespace-nowrap">{reais(c.brl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Independe do filtro de data: é o compromisso do dia de hoje.
              </p>
            </PopoverContent>
          </Popover>
        )}
      </p>

      {/* Verba parada: conjunto ligado sem anúncio ativo entrega zero. É o erro
          mais caro e mais silencioso da conta. */}
      {parado > 0 && (
        <p className="text-[10px] text-amber-400 flex gap-1 mt-0.5" title={o.ativos_sem_anuncio?.map((x) => x.conjunto).join(", ")}>
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
          <span>{reais(parado)}/dia parados sem anúncio ativo</span>
        </p>
      )}
    </div>
  );
}
