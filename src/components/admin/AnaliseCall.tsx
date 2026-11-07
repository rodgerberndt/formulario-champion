// A leitura da call pela IA, na tela.
//
// O botão fica ao lado da reunião porque a pergunta que ele responde ("por que
// esta não fechou?") só aparece olhando para uma call específica. A leitura
// fica gravada na reunião: reanalisar sobrescreve, e a data ao pé diz se a
// leitura é anterior ou posterior ao desfecho.
//
// O bloco de fontes não é decoração. A IA NÃO ouviu a gravação — ela leu o
// Processo Abóbora, o quiz e o histórico — e quem lê o resultado precisa saber
// disso para não tratar a leitura como transcrição.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchAdmin, getAdminToken } from "@/lib/adminAuth";

export interface Analise {
  desfecho?: string;
  fator_principal?: string;
  fatores?: string[];
  sinais_do_abobora?: string[];
  o_que_repetir?: string;
  o_que_evitar?: string;
  confianca?: string;
  fontes?: string[];
  base_historica?: number;
  modelo?: string;
}

interface Props {
  meetingId: string;
  titulo: string;
  analise: Analise | null;
  analisadaEm: string | null;
  aoAnalisar: (a: Analise) => void;
}

const COR_CONFIANCA: Record<string, string> = {
  baixa: "border-amber-500/40 text-amber-300",
  media: "border-sky-500/40 text-sky-300",
  alta: "border-emerald-500/40 text-emerald-300",
};

export default function AnaliseCall({ meetingId, titulo, analise, analisadaEm, aoAnalisar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [atual, setAtual] = useState<Analise | null>(analise);

  const rodar = async () => {
    setRodando(true);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetchAdmin(
        `${base}/functions/v1/admin-data/meetings/${meetingId}/analise?_method=POST`,
        { headers: { "x-admin-token": getAdminToken() || "" } },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha na análise");
      setAtual(j);
      aoAnalisar(j);
    } catch (e) {
      toast({
        title: "Não deu para analisar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setRodando(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        title={atual ? "Ver a leitura da IA" : "Analisar esta call com IA"}
        className={atual ? "text-violet-400" : "text-muted-foreground"}
      >
        <Sparkles className="w-4 h-4" />
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Leitura da call</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{titulo}</p>

            {!atual ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  A IA lê o Processo Abóbora, as respostas do quiz, o desfecho e o
                  histórico de todas as outras reuniões com Abóbora preenchido. Ela
                  não ouve a gravação.
                </p>
                <Button onClick={rodar} disabled={rodando} className="w-full">
                  {rodando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Analisar esta call
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {atual.desfecho && (
                    <Badge variant="outline" className="text-[10px]">
                      {atual.desfecho === "fechou" ? "Fechou"
                        : atual.desfecho === "nao_fechou" ? "Não fechou"
                          : "Indefinido"}
                    </Badge>
                  )}
                  {atual.confianca && (
                    <Badge variant="outline" className={`text-[10px] ${COR_CONFIANCA[atual.confianca] || ""}`}>
                      confiança {atual.confianca}
                    </Badge>
                  )}
                  {typeof atual.base_historica === "number" && (
                    <span className="text-[10px] text-muted-foreground">
                      base: {atual.base_historica} reuniões
                    </span>
                  )}
                </div>

                {/* Base pequena vira aviso na cara, não nota de rodapé: é o
                    erro mais fácil de cometer aqui, o de tratar padrão de cinco
                    calls como regra da casa. */}
                {(atual.base_historica ?? 0) < 15 && (
                  <p className="flex gap-2 text-[11px] text-amber-400 border border-amber-500/25 bg-amber-500/5 rounded-md p-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      Só {atual.base_historica ?? 0} reuniões com Abóbora preenchido até
                      agora. Isto é hipótese, não padrão: use para conversar, não para
                      mudar o processo.
                    </span>
                  </p>
                )}

                {atual.fator_principal && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fator principal</p>
                    <p className="text-sm font-medium">{atual.fator_principal}</p>
                  </div>
                )}

                {!!atual.fatores?.length && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Outros fatores</p>
                    <ul className="space-y-1">
                      {atual.fatores.map((f, i) => (
                        <li key={i} className="text-xs text-muted-foreground">· {f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {!!atual.sinais_do_abobora?.length && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">O que o Abóbora já indicava</p>
                    <ul className="space-y-1">
                      {atual.sinais_do_abobora.map((f, i) => (
                        <li key={i} className="text-xs text-muted-foreground">· {f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  {atual.o_que_repetir && (
                    <div className="border border-emerald-500/25 bg-emerald-500/5 rounded-md p-2">
                      <p className="text-[10px] text-emerald-300 uppercase tracking-wider">Repetir</p>
                      <p className="text-xs">{atual.o_que_repetir}</p>
                    </div>
                  )}
                  {atual.o_que_evitar && (
                    <div className="border border-rose-500/25 bg-rose-500/5 rounded-md p-2">
                      <p className="text-[10px] text-rose-300 uppercase tracking-wider">Evitar</p>
                      <p className="text-xs">{atual.o_que_evitar}</p>
                    </div>
                  )}
                </div>

                {!!atual.fontes?.length && (
                  <p className="text-[10px] text-muted-foreground">
                    Leitura feita em cima de: {atual.fontes.join(" · ")}. A gravação não foi ouvida.
                  </p>
                )}
                {analisadaEm && (
                  <p className="text-[10px] text-muted-foreground">
                    Analisada em {new Date(analisadaEm).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}.
                  </p>
                )}

                <Button variant="outline" onClick={rodar} disabled={rodando} className="w-full">
                  {rodando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Analisar de novo
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
