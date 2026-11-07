// O orgânico aberto por canal e por peça (pedido do Rodger, 21/10/2026).
//
// Antes disso o orgânico era uma linha só, "organic", e o lead da bio aparecia
// como pago sem anúncio. Aqui ele se divide em direct (comentário, story, DM,
// seguidor), link da bio, link no story e prospecção, e cada peça publicada
// mostra quantos contatos, leads, MQL, reuniões e vendas puxou.
//
// Contato é quem falou no direct, virando lead ou não. Peça marcada "janela" é
// o post de funil da bio publicado nos 8 dias antes do lead: a bio não diz de
// qual post a pessoa veio, então é atribuição por proximidade, não observada.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Instagram, Loader2, RefreshCw } from "lucide-react";

interface Linha {
  chave: string;
  rotulo: string;
  contatos: number;
  leads: number;
  mql: number;
  reunioes: number;
  realizadas: number;
  vendas: number;
  receita: number;
  link?: string | null;
  tipo?: string | null;
  confianca?: string | null;
}

interface Resposta {
  canais: Linha[];
  pecas: Linha[];
}

interface Props {
  fetchAdminData: (path: string, params?: Record<string, string>) => Promise<unknown>;
  startISO: string;
  endISO: string;
}

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Tabela({ titulo, linhas, comPeca }: { titulo: string; linhas: Linha[]; comPeca?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50">
            <th className="text-left font-medium py-1.5">{titulo}</th>
            <th className="text-right font-medium">Contatos</th>
            <th className="text-right font-medium">Leads</th>
            <th className="text-right font-medium">MQL</th>
            <th className="text-right font-medium">Reuniões</th>
            <th className="text-right font-medium">Realizadas</th>
            <th className="text-right font-medium">Vendas</th>
            <th className="text-right font-medium">Receita</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-border/30 last:border-0">
              <td className="py-1.5 font-medium">
                {comPeca && l.link ? (
                  <a href={l.link} target="_blank" rel="noreferrer" className="hover:underline">{l.rotulo}</a>
                ) : l.rotulo}
                {comPeca && l.confianca === "janela" && (
                  <span className="text-[10px] text-amber-400 ml-1" title="Lead da bio atribuído ao post de funil da semana">janela</span>
                )}
              </td>
              <td className="text-right tabular-nums">{l.contatos || "·"}</td>
              <td className="text-right tabular-nums">{l.leads}</td>
              <td className="text-right tabular-nums">{l.mql}</td>
              <td className="text-right tabular-nums">{l.reunioes}</td>
              <td className="text-right tabular-nums">{l.realizadas}</td>
              <td className="text-right tabular-nums">{l.vendas}</td>
              <td className="text-right tabular-nums font-semibold">{l.receita > 0 ? reais(l.receita) : "·"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PainelOrganico({ fetchAdminData, startISO, endISO }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const j = (await fetchAdminData("/organico", { from: startISO, to: endISO })) as Resposta;
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
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando o orgânico…
      </CardContent></Card>
    );
  }
  if (erro || !dados) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Orgânico indisponível: {erro}</CardContent></Card>;
  }

  return (
    <Card className="border-pink-500/20">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Instagram className="w-3.5 h-3.5 text-pink-400" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Orgânico por canal
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

        {dados.canais.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum lead nem contato orgânico no período.</p>
        ) : (
          <Tabela titulo="Canal" linhas={dados.canais} />
        )}

        {dados.pecas.length > 0 && <Tabela titulo="Peça" linhas={dados.pecas} comPeca />}

        <p className="text-[10px] text-muted-foreground">
          Contato é quem falou no direct, virando lead ou não. "Site sem origem" é lead do
          formulário sem anúncio e sem marcação de bio ou story. Peça "janela" é o post de
          funil da bio publicado até 8 dias antes do lead.
        </p>
      </CardContent>
    </Card>
  );
}
