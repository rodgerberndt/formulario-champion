import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { QuizResult } from "@/components/landing/QuizResult";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const RESULT_STORAGE_KEY = "champion_quiz_result";

interface QuizFormData {
  nome_completo: string;
  whatsapp: string;
  instagram: string;
  mercado: string;
  estagio_negocio: string;
  investimento_faixa: string;
  dor_desejo: string;
}

function PageBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            145deg, 
            hsl(235 50% 4%) 0%, 
            hsl(238 65% 10%) 35%,
            hsl(250 55% 12%) 60%,
            hsl(235 50% 5%) 100%
          )`,
        }}
      />
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(to right, hsl(0 0% 100%) 1px, transparent 1px),
                            linear-gradient(to bottom, hsl(0 0% 100%) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
      <div 
        className="absolute -top-20 left-1/4 w-[350px] h-[350px] rounded-full blur-[70px]"
        style={{
          background: 'radial-gradient(circle, hsl(238 90% 55% / 0.1) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute top-1/2 -right-20 w-[300px] h-[300px] rounded-full blur-[60px]"
        style={{
          background: 'radial-gradient(circle, hsl(43 85% 55% / 0.07) 0%, transparent 70%)',
        }}
      />
      <div 
        className="absolute -bottom-16 left-1/3 w-[280px] h-[280px] rounded-full blur-[50px]"
        style={{
          background: 'radial-gradient(circle, hsl(260 80% 50% / 0.06) 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

export default function ObrigadoMql() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<QuizFormData | null>(null);
  const conversionEventFired = useRef(false);

  useEffect(() => {
    if (formData && !conversionEventFired.current) {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'CompleteRegistration');
        console.log('Facebook Pixel: CompleteRegistration event fired (MQL)');
        conversionEventFired.current = true;
      }
    }
  }, [formData]);

  useEffect(() => {
    const saved = localStorage.getItem(RESULT_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(parsed);
      } catch {
        navigate("/quiz");
      }
    } else {
      navigate("/quiz");
    }
  }, [navigate]);

  if (!formData) {
    return null;
  }

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
          <QuizResult nome={formData.nome_completo} estagio_negocio={formData.estagio_negocio} investimento_faixa={formData.investimento_faixa} />
        </div>
      </main>
    </div>
  );
}
