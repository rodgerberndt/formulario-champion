// React app entry
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy, Component, type ReactNode } from "react";
import { TrackingProvider } from "@/hooks/useTracking";
import { usePresence } from "@/hooks/usePresence";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { DateRangeProvider } from "@/context/DateRangeContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { HEADLINE_TEST_VARIANTS, getVariantByPath } from "@/config/headlineVariants";
import { SUBHEADLINE_VARIANTS } from "@/config/subheadlineVariants";
import { QUIZ_VARIANTS, QUIZ_CONTROLE } from "@/config/quizVariants";

// Component to enable presence tracking + service worker
function AppInitializer() {
  usePresence();
  useServiceWorker();
  return null;
}

// O PageView POR TROCA DE TELA SAIU EM 19/09/2026.
//
// O que havia aqui: um `PageView` a cada mudança de rota da SPA, para o Meta
// "enxergar" /quiz e /obrigado*. O efeito colateral é que um único clique no
// anúncio virava duas ou três landing page views — e landing page view é o
// numerador do connect rate. Medido em 19/09: 122% no acumulado, quando o teto
// lógico da métrica é 100%.
//
// Nada de conversão dependia disto. CompleteRegistration, Lead, MQL e Sprint
// são disparados com id próprio em `conversaoPixel.ts` e nas páginas de
// obrigado. O que se perde é só a contagem de "visualização" de tela interna,
// que nunca deveria ter entrado na conta da landing.
//
// Agora o PageView sai UMA vez, no carregamento, e só quando a URL é a landing
// que o anúncio aponta — a regra mora no `index.html`, que roda antes do React.

// Lazy load pages for performance
const Quiz = lazy(() => import("./pages/Quiz"));
const Obrigado = lazy(() => import("./pages/Obrigado"));
const ObrigadoMql = lazy(() => import("./pages/ObrigadoMql"));
const ObrigadoSprint = lazy(() => import("./pages/ObrigadoSprint"));
const Agendar = lazy(() => import("./pages/Agendar"));
const GoogleCalendarCallback = lazy(() => import("./pages/GoogleCalendarCallback"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const Esteira = lazy(() => import("./pages/Esteira"));

const queryClient = new QueryClient();

// Admin analytics route slug
const ADMIN_ANALYTICS_SLUG = "admin";

// Minimal loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Error boundary that auto-recovers from chunk-load failures (common in Lovable preview iframe)
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    const msg = String(error?.message || "");
    // Stale lazy chunk after deploy: force a one-time hard reload
    if (
      /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)
    ) {
      const KEY = "__champion_chunk_reload__";
      try {
        // A flag guarda QUANDO foi o último auto-reload, não apenas que houve
        // um. Antes ela era um "1" permanente: o primeiro deploy do dia
        // recuperava sozinho e todos os seguintes caíam na tela de erro, porque
        // a marca de "já tentei" nunca saía. Com aba aberta e vários deploys no
        // mesmo dia, isso é a diferença entre recarregar sozinho e travar.
        //
        // A janela de 30s separa os dois casos: dois erros em segundos
        // significam que recarregar não resolve (e um loop seria pior);
        // minutos depois é um deploy novo, que merece a própria tentativa.
        const ultimo = Number(sessionStorage.getItem(KEY) || 0);
        const agora = Date.now();
        if (!ultimo || agora - ultimo > 30_000) {
          sessionStorage.setItem(KEY, String(agora));
          window.location.reload();
        }
      } catch {
        // ignore
      }
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
          <p className="text-foreground/80">Não foi possível carregar esta página.</p>
          {/* Sem a mensagem, todo erro de runtime vira a mesma tela muda e o
              diagnóstico depende de alguém abrir o console. */}
          {this.state.error?.message && (
            <pre className="max-w-xl overflow-x-auto rounded-md bg-muted/40 p-3 text-left text-[11px] text-muted-foreground whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * A landing de e-commerce (rota /HD3 com `nicho="ecommerce"`) fica FORA do ar
 * até o Rodger aprovar. Em desenvolvimento ela aparece normalmente.
 */
/*
 * A bandeira vem do AMBIENTE DO BUILD, e não de um `true`/`false` escrito aqui.
 *
 * Motivo, que já custou caro em 22/09: o deploy publica o disco inteiro, então
 * uma linha `= true` esquecida no arquivo sobe junto com qualquer deploy feito
 * para outra coisa, e a /HD3 (a variante para onde o tráfego pago aponta) muda
 * de copy sem ninguém pedir. Com env var, o padrão é SEMPRE desligado: só vai
 * ao ar o build que foi feito de propósito com `VITE_LP_ECOM=1`.
 *
 * Preview com a página ligada:  VITE_LP_ECOM=1 npm run build
 * Produção (padrão):            npm run build
 *
 * DESDE 29/09/2026 A PRODUÇÃO É O BUILD COM A BANDEIRA LIGADA. O Rodger
 * aprovou a /HD3 = copy geral + VSL no topo + cases sem vídeo (`geral-vsl`),
 * e foi isso que subiu para `main`. Um `npm run build` sem a bandeira, seguido
 * de deploy, tira a VSL da /HD3 sem ninguém pedir. O build de produção agora
 * é: `VITE_LP_ECOM=1 npm run build`.
 *
 * 29/10/2026: O PADRÃO INVERTEU. Em 28/10 um deploy feito para o admin saiu com
 * `npm run build` puro e tirou a VSL da raiz e da /HD3 com tráfego pago rodando.
 * Agora a bandeira vem LIGADA: `npm run build` já é o build de produção, com a
 * VSL. Para desligar de propósito: `VITE_LP_ECOM=0 npm run build`.
 */
const LP_ECOMMERCE_NO_AR = import.meta.env.VITE_LP_ECOM !== "0";
const mostrarLpEcommerce = LP_ECOMMERCE_NO_AR || import.meta.env.DEV;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TrackingProvider>
          <AppInitializer />
          <Routes>
            {/* A raiz é para onde TODO o tráfego pago cai desde 25/09/2026, e
                em 29/09 o Rodger abriu o site e não viu a VSL porque ela só
                estava na /HD3. A raiz recebe a mesma configuração: copy geral,
                VSL no topo, cases sem vídeo. Mesma bandeira das outras. */}
            <Route path="/" element={<Index nicho={mostrarLpEcommerce ? "geral-vsl" : "geral"} />} />
            {/* Teste de headline: mesma página, só o Hero muda. Cada variante
                tem seu próprio path pra o tracking separar os funis. As rotas
                em minúsculas existem porque o React Router é case-sensitive e
                a URL pode chegar digitada de outro jeito do anúncio. */}
            {/* A /HD3 é a versão nichada para e-commerce (21/09/2026): mesma
                headline vencedora, mesma estrutura de seções, copy inteira
                falando com dono de loja. Ela sai do map porque é a única que
                passa `nicho`; as outras variantes seguem na copy geral, senão
                o nicho mudaria as cinco páginas de uma vez e o teste de
                headline perderia a base de comparação.

                SÓ LOCAL ATÉ APROVAÇÃO. Em 22/09/2026 ela foi ao ar por engano:
                um deploy feito para publicar o painel admin carregou junto tudo
                que estava no disco, e a /HD3 — que é a variante VENCEDORA, para
                onde o tráfego pago aponta — passou a mostrar copy de e-commerce
                para todo mundo. A página inteira continua aqui e pronta; é esta
                bandeira que decide se ela vai para o ar.

                Para publicar: `LP_ECOMMERCE_NO_AR = true`. Em `npm run dev` ela
                aparece sempre, sem mexer em nada. */}
            {HEADLINE_TEST_VARIANTS.filter((v) => v.path !== "/HD3" || !mostrarLpEcommerce).map((variant) => (
              <Route
                key={variant.path}
                path={variant.path}
                element={<Index variant={variant} />}
              />
            ))}
            {/* 28/09/2026: a /HD3 volta à copy GERAL, com a VSL no topo
                (`nicho="geral-vsl"`). A versão e-commerce continua pronta em
                `nicho="ecommerce"`, fora do ar. A bandeira segue mandando: sem
                ela a /HD3 é a copy geral sem vídeo, como sempre foi em produção. */}
            {mostrarLpEcommerce && (
              <Route
                path="/HD3"
                element={<Index variant={getVariantByPath("/HD3")} nicho="geral-vsl" />}
              />
            )}
            {HEADLINE_TEST_VARIANTS.map((variant) => (
              <Route
                key={`${variant.path}-lower`}
                path={variant.path.toLowerCase()}
                // Redireciona em vez de renderizar: cada variante precisa de UMA
                // URL só, senão o mesmo teste grava metade dos eventos em /hd1 e
                // metade em /HD1 e o funil fica partido ao meio.
                element={<Navigate to={variant.path} replace />}
              />
            ))}
            {/* Teste de subheadline: a headline é sempre a HD3, vencedora do
                teste anterior. Só o bloco abaixo dela muda, e cada variante tem
                seu próprio path para o funil não se misturar. */}
            {SUBHEADLINE_VARIANTS.map((sub) => (
              <Route
                key={sub.path}
                path={sub.path}
                element={<Index variant={getVariantByPath("/HD3")} subheadline={sub} />}
              />
            ))}
            {SUBHEADLINE_VARIANTS.map((sub) => (
              <Route
                key={`${sub.path}-lower`}
                path={sub.path.toLowerCase()}
                element={<Navigate to={sub.path} replace />}
              />
            ))}
            {/*
              Uma rota por célula do teste de quiz. O controle é a própria
              /quiz, então quem já tem o link antigo continua entrando — e cai
              no controle, que é o comportamento certo.
            */}
            {QUIZ_VARIANTS.map((v) => (
              <Route
                key={v.path}
                path={v.path}
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Quiz />
                  </Suspense>
                }
              />
            ))}
            {/* O React Router é case-sensitive; /QUIZ/Q3 digitado à mão cai aqui. */}
            {QUIZ_VARIANTS.filter((v) => v.path !== QUIZ_CONTROLE.path).map((v) => (
              <Route
                key={`${v.path}-upper`}
                path={v.path.toUpperCase()}
                element={<Navigate to={v.path} replace />}
              />
            ))}
            <Route 
              path="/obrigado" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Obrigado />
                </Suspense>
              } 
            />
            <Route 
              path="/obrigadomql" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ObrigadoMql />
                </Suspense>
              } 
            />
            {/* Agendamento automático da call (lead >= R$ 100 mil, 17/09/2026). */}
            <Route
              path="/agendar"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Agendar />
                </Suspense>
              }
            />
            <Route 
              path="/obrigadosprint" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ObrigadoSprint />
                </Suspense>
              } 
            />
            {/* Backward compat: old slug ainda aponta pra mesma página */}
            <Route 
              path="/obrigado5k" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <ObrigadoSprint />
                </Suspense>
              } 
            />
            {/* Volta do OAuth do Google. Serve de dentro do nosso domínio porque
                o Supabase não entrega HTML de edge function — ver o comentário
                em GoogleCalendarCallback.tsx. */}
            <Route
              path="/google-calendar-callback"
              element={
                <Suspense fallback={<PageLoader />}>
                  <GoogleCalendarCallback />
                </Suspense>
              }
            />
            <Route
              path={`/${ADMIN_ANALYTICS_SLUG}`}
              element={
                <ChunkErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <DateRangeProvider>
                      <AdminAnalytics />
                    </DateRangeProvider>
                  </Suspense>
                </ChunkErrorBoundary>
              } 
            />
            {/* Esteira do orgânico (17/10/2026): senha própria do time, não abre o resto do admin. */}
            <Route
              path="/esteira"
              element={
                <ChunkErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Esteira />
                  </Suspense>
                </ChunkErrorBoundary>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TrackingProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
