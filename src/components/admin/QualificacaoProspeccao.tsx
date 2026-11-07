// Qualificação do lead de PROSPECÇÃO (pedido do Rodger, 24/10/2026).
//
// O lead do garimpo nasce só com o @ do Instagram: sem faturamento, sem WhatsApp
// e sem nota. Quem descobre o resto é o Miguel, conversando no direct. O que ele
// marcar aqui vai para o lead, e a nota sai no backend (admin-data, PUT
// /leads/:id) na régua do formulário curto: faturamento + mercado.
//
// O agent prospeccao-conversas.mjs, no PC, faz o mesmo sozinho lendo a conversa
// do direct. O que o Miguel marcar aqui manda: o agent não sobrescreve.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVESTIMENTO_OPTIONS, MERCADO_OPTIONS_ECOMMERCE } from "@/lib/leadScoring";
import { fetchAdmin } from "@/lib/adminAuth";
import { toast } from "@/hooks/use-toast";

interface LeadProspeccao {
  id: string;
  investimento_faixa: string | null;
  mercado: string | null;
  whatsapp: string | null;
  raw_answers_json: Record<string, unknown> | null;
}

interface Props<T extends LeadProspeccao> {
  lead: T;
  onSalvo: (atualizado: T) => void;
}

const SEM = "__sem__";

export function QualificacaoProspeccao<T extends LeadProspeccao>({ lead, onSalvo }: Props<T>) {
  const [faixa, setFaixa] = useState(lead.investimento_faixa ?? "");
  const [mercado, setMercado] = useState(lead.mercado ?? "");
  const [whatsapp, setWhatsapp] = useState(lead.whatsapp ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setFaixa(lead.investimento_faixa ?? "");
    setMercado(lead.mercado ?? "");
    setWhatsapp(lead.whatsapp ?? "");
  }, [lead.id, lead.investimento_faixa, lead.mercado, lead.whatsapp]);

  const raw = lead.raw_answers_json ?? {};
  const daConversa = raw.qualificado_conversa_em ? String(raw.resumo_conversa ?? "") : "";
  const mudou = faixa !== (lead.investimento_faixa ?? "") || mercado !== (lead.mercado ?? "") || whatsapp !== (lead.whatsapp ?? "");
  // nicho que o garimpo leu na bio e não está na lista de mercados: mostra como opção para não sumir
  const mercados = mercado && !MERCADO_OPTIONS_ECOMMERCE.includes(mercado) ? [mercado, ...MERCADO_OPTIONS_ECOMMERCE] : MERCADO_OPTIONS_ECOMMERCE;

  const salvar = async () => {
    setSalvando(true);
    try {
      const digitos = whatsapp.replace(/\D/g, "");
      const body: Record<string, unknown> = {
        investimento_faixa: faixa || null,
        mercado: mercado || "",
        whatsapp: digitos ? (digitos.startsWith("55") ? `+${digitos}` : `+55${digitos}`) : "",
      };
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-data/leads/${lead.id}`;
      const res = await fetchAdmin(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(String(res.status));
      onSalvo({ ...lead, ...(await res.json()) });
      toast({ title: "Qualificação salva" });
    } catch (e) {
      console.error("Error in QualificacaoProspeccao.salvar:", e);
      toast({ title: "Erro ao salvar a qualificação", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pt-2 border-t space-y-2">
      <div>
        <p className="text-xs font-semibold text-foreground">Qualificação da prospecção</p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Preencha conforme a conversa no direct. A nota do lead sai do faturamento e do mercado.
        </p>
      </div>
      {daConversa && (
        <p className="text-[11px] leading-snug p-2 rounded-md bg-muted/40">
          <span className="font-medium">Lido da conversa:</span> {daConversa}
        </p>
      )}
      <div className="grid gap-2">
        <Select value={faixa || SEM} onValueChange={(v) => setFaixa(v === SEM ? "" : v)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Faturamento por mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM} className="text-xs">Faturamento: ainda não sei</SelectItem>
            {INVESTIMENTO_OPTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mercado || SEM} onValueChange={(v) => setMercado(v === SEM ? "" : v)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Mercado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM} className="text-xs">Mercado: ainda não sei</SelectItem>
            {mercados.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-9 text-xs" placeholder="WhatsApp com DDD" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        <Button size="sm" className="h-9" disabled={!mudou || salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar qualificação"}
        </Button>
      </div>
    </div>
  );
}
