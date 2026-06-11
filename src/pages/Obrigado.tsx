import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { QuizResult } from "@/components/landing/QuizResult";
import { SuccessCasesCompact } from "@/components/landing/SuccessCasesCompact";
import { SocialProofCarousel } from "@/components/landing/SocialProofCarousel";

// Declare fbq for TypeScript
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const RESULT_STORAGE_KEY = "champion_quiz_result";

function PageBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(145deg, hsl(235 50% 4%) 0%, hsl(238 65% 10%) 35%, hsl(250 55% 12%) 60%, hsl(235 50% 5%) 100%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

export default function Obrigado() {
  const navigate = useNavigate();
  const [nome, setNome] = useState<string | null>(null);
  const [investimentoFaixa, setInvestimentoFaixa] = useState<string>("");
  const [estagioNegocio, setEstagioNegocio] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem(RESULT_STORAGE_KEY);
    if (!saved) {
      navigate("/quiz");
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      setNome(parsed?.nome_completo ?? "");
      setInvestimentoFaixa(parsed?.investimento_faixa ?? "");
      setEstagioNegocio(parsed?.estagio_negocio ?? "");

      if (typeof window.fbq === 'function') {
        let eventID: string | undefined;
        try {
          const stored = localStorage.getItem('champion_event_ids');
          if (stored) {
            const parsedIds = JSON.parse(stored);
            eventID = parsedIds.event_ids?.CompleteRegistration;
          }
        } catch { /* ignore */ }

        window.fbq('track', 'PageView');
        window.fbq('track', 'CompleteRegistration', {}, { eventID });
        console.log('Facebook Pixel: CompleteRegistration fired on /obrigado with eventID:', eventID);

        // Slug-specific custom event: Lead
        window.fbq('trackCustom', 'Lead', {
          content_name: 'Lead',
          investimento_faixa: parsed?.investimento_faixa || 'unknown',
        });
        console.log('Facebook Pixel: Lead (custom) fired on /obrigado');
      }
    } catch {
      navigate("/quiz");
    }
  }, [navigate]);

  if (nome === null) return null;

  return (
    <div className="min-h-[100svh] relative w-full max-w-full overflow-x-hidden">
      <PageBackground />
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/85 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </div>
      </header>
      <main className="pt-20 pb-12 px-4 min-h-[100svh]" style={{ paddingBottom: 'calc(48px + env(safe-area-inset-bottom))' }}>
        <div className="container mx-auto max-w-lg">
          <QuizResult
            nome={nome}
            estagio_negocio={estagioNegocio}
            investimento_faixa={investimentoFaixa}
            forceSdr
            casesSlot={
              <div className="-mx-4 space-y-2 obrigadomql-cases">
                <SuccessCasesCompact />
                <SocialProofCarousel />
              </div>
            }
          />
        </div>
      </main>
    </div>
  );
}
