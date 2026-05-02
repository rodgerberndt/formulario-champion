import { useState, useEffect } from "react";
import { Check, MessageCircle, AlertTriangle, ArrowRight, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const DARA_WA_LINK = "https://wa.me/5548996560104?text=Oiee%2C%20furei%20a%20fila%20pra%20falar%20com%20voc%C3%AA%2C%20como%20funciona%3F";

function markSkippedQueue() {
  try {
    const leadId = localStorage.getItem('champion_lead_id');
    if (!leadId) return;
    supabase
      .from('leads')
      .update({ skipped_queue: true, skipped_queue_at: new Date().toISOString() })
      .eq('id', leadId)
      .then(({ error }) => {
        if (error) console.warn('[skip-queue] update failed:', error);
      });
  } catch (e) {
    console.warn('[skip-queue] error:', e);
  }
}

interface QuizResultDaraProps {
  nome: string;
}

export function QuizResultDara({ nome }: QuizResultDaraProps) {
  const firstName = nome.split(" ")[0];
  const [pulseVisible, setPulseVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPulseVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-lg mx-auto animate-fade-in space-y-5">
      {/* ── HERO ── */}
      <div className="text-center space-y-4">
        {/* Success badge */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mx-auto mb-1">
          <Check className="w-8 h-8 text-emerald-400" strokeWidth={3} />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">
          <span className="champion-gradient-text">{firstName}, você avançou!</span>
          <br />
          Agora falta só uma ação sua.
        </h1>

        <p className="text-muted-foreground text-base leading-relaxed max-w-md mx-auto">
          Seu cadastro foi aprovado com sucesso. Para dar continuidade ao seu atendimento,{" "}
          <strong className="text-foreground">
            você precisa chamar a Dara no WhatsApp agora.
          </strong>
        </p>
      </div>

      {/* ── PRIMARY CTA CARD ── */}
      <div className="bg-card/80 backdrop-blur-xl border-2 border-secondary/40 rounded-2xl p-5 md:p-6 space-y-4 relative overflow-hidden">
        {/* Subtle glow */}
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-[60px] pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(43 85% 55% / 0.15) 0%, transparent 70%)" }}
        />

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center shrink-0 mt-0.5">
            <MessageCircle className="w-5 h-5 text-secondary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground leading-snug">
              Clique abaixo e fale com a Dara agora
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A Dara é a consultora responsável pelo seu caso. Ela já recebeu seus dados e está pronta para te atender —{" "}
              <strong className="text-foreground">
                mas o próximo passo precisa partir de você.
              </strong>
            </p>
          </div>
        </div>

        <Button
          variant="champion"
          size="xl"
          className={`w-full text-base md:text-lg relative ${pulseVisible ? "animate-pulse-gentle" : ""}`}
          asChild
        >
          <a href={DARA_WA_LINK} target="_blank" rel="noopener noreferrer" onClick={markSkippedQueue}>
            <MessageCircle className="w-5 h-5" />
            Chamar a Dara no WhatsApp
            <ArrowRight className="w-5 h-5" />
          </a>
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Atendimento imediato • Sem fila • Direto com a consultora
        </p>
      </div>

      {/* ── WHY NOW BLOCK ── */}
      <div className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 md:p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Por que você precisa chamar agora?
        </h2>

        <div className="space-y-3">
          {[
            {
              icon: Clock,
              title: "Seu atendimento tem prazo",
              text: "Sua vaga de atendimento com a Dara é válida por tempo limitado. Se você não chamar, ela será redirecionada para outro lead.",
            },
            {
              icon: Shield,
              title: "Prioridade para quem age rápido",
              text: "Leads que iniciam a conversa primeiro recebem atendimento prioritário e mais atenção da consultora.",
            },
            {
              icon: AlertTriangle,
              title: "Não dependa de nós te chamarmos",
              text: "O processo só avança quando você inicia a conversa. Sem essa ação, seu cadastro fica parado.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
                <item.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground leading-snug">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── URGENCY NOTICE ── */}
      <div className="bg-secondary/10 border border-secondary/25 rounded-xl p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
        <p className="text-sm text-foreground leading-relaxed">
          <strong>Importante:</strong> se você sair dessa página sem chamar a Dara, seu atendimento{" "}
          <strong className="text-secondary">pode não seguir com prioridade</strong>. Garanta sua
          continuidade agora.
        </p>
      </div>

      {/* ── SECONDARY CTA ── */}
      <div className="text-center space-y-3 pb-4">
        <p className="text-sm text-muted-foreground">
          É simples, rápido e você fala direto com quem vai cuidar do seu caso.
        </p>
        <Button variant="championOutline" size="lg" className="w-full text-base" asChild>
          <a href={DARA_WA_LINK} target="_blank" rel="noopener noreferrer" onClick={markSkippedQueue}>
            <MessageCircle className="w-5 h-5" />
            Falar com a Dara agora
          </a>
        </Button>
      </div>
    </div>
  );
}
