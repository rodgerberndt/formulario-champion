// Os três funis da Champion, lado a lado.
//
// Até 03/09/2026 o painel media um funil só, porque só existia um jeito de
// entrar: o formulário. Indicação e social selling sempre venderam e sempre
// ficaram invisíveis aqui — ou fora do sistema, ou disfarçados de tráfego.
//
// A pergunta que este bloco responde é a única que importa no começo: quanto do
// faturamento depende de anúncio. Se a resposta for "quase tudo", o teto da
// operação é o teto da mídia. Se não for, existe uma alavanca que ninguém está
// medindo.
//
// O custo por venda aparece SÓ na linha de mídia paga, e de propósito. Indicação
// e social selling custam tempo de time, mas esse custo não está em lugar nenhum
// do sistema, e inventar um número seria pior do que deixar em branco.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, Share2 } from "lucide-react";

interface Funil {
  origem: string;
  rotulo: string;
  reunioes: number;
  realizadas: number;
  no_show: number;
  agendadas: number;
  abobora_completo: number;
  com_gravacao: number;
  vendas: number;
  receita: number;
  recebido: number;
  reembolsadas?: number;
  gasto: number | null;
  custo_por_venda: number | null;
  pct_receita: number | null;
  taxa_comparecimento: number | null;
}

interface Resposta {
  funis: Funil[];
  receita_total: number;
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<unknown>;
  startISO: string;
  endISO: string;
}

const reais = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v * 100)}%`;

export default function PainelFunis({ fetchAdminData, startISO, endISO }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const j = (await fetchAdminData("/funis", { from: startISO, to: endISO })) as Resposta;
      setDados(j);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [fetchAdminData, startISO, endISO]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando && !dados) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando os funis…
      </CardContent></Card>
    );
  }
  if (erro || !dados) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Funis indisponíveis: {erro}</CardContent></Card>;
  }

  // Funil sem nada no período não vira linha: três colunas zeradas ocupam a
  // mesma tela e não dizem nada. Mídia paga fica sempre, porque a ausência dela
  // é informação.
  const linhas = dados.funis.filter(f => f.origem === "midia_paga" || f.reunioes > 0 || f.vendas > 0);

  return (
    <Card className="border-violet-500/20">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Share2 className="w-3.5 h-3.5 text-violet-400" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Funis de origem
            </p>
          </div>
          <button
            type="button"
            onClick={carregar}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/50">
                <th className="text-left font-medium py-1.5">Funil</th>
                <th className="text-right font-medium">Reuniões</th>
                <th className="text-right font-medium">Realizadas</th>
                <th className="text-right font-medium">Compareceu</th>
                <th className="text-right font-medium">Vendas</th>
                <th className="text-right font-medium">Receita</th>
                <th className="text-right font-medium">% da receita</th>
                <th className="text-right font-medium">Custo/venda</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((f) => (
                <tr key={f.origem} className="border-b border-border/30 last:border-0">
                  <td className="py-1.5 font-medium">{f.rotulo}</td>
                  <td className="text-right tabular-nums">{f.reunioes}</td>
                  <td className="text-right tabular-nums">{f.realizadas}</td>
                  <td className="text-right tabular-nums">{pct(f.taxa_comparecimento)}</td>
                  <td className="text-right tabular-nums">
                    {f.vendas}
                    {(f.reembolsadas || 0) > 0 && (
                      <span className="text-[10px] text-rose-400 ml-1" title="reembolsadas, fora da receita">+{f.reembolsadas} reemb.</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums font-semibold">{reais(f.receita)}</td>
                  <td className="text-right tabular-nums">{pct(f.pct_receita)}</td>
                  <td className="text-right tabular-nums">
                    {f.origem === "midia_paga" ? reais(f.custo_por_venda) : (
                      <span className="text-muted-foreground" title="Só mídia paga tem custo medido no sistema">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Custo por venda existe só na mídia paga: é o único funil cujo custo o sistema
          conhece. Indicação e social selling custam tempo de time, e esse número ainda
          não está em lugar nenhum.
        </p>
      </CardContent>
    </Card>
  );
}
