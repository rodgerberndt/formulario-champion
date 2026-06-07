// React app entry
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, Component, type ReactNode } from "react";
import { TrackingProvider } from "@/hooks/useTracking";
import { usePresence } from "@/hooks/usePresence";
import { useServiceWorker } from "@/hooks/useServiceWorker";
import { DateRangeProvider } from "@/context/DateRangeContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Component to enable presence tracking + service worker
function AppInitializer() {
  usePresence();
  useServiceWorker();
  return null;
}

// Lazy load pages for performance
const Quiz = lazy(() => import("./pages/Quiz"));
const Obrigado = lazy(() => import("./pages/Obrigado"));
const ObrigadoMql = lazy(() => import("./pages/ObrigadoMql"));
const ObrigadoSprint = lazy(() => import("./pages/ObrigadoSprint"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));

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
        if (sessionStorage.getItem(KEY) !== "1") {
          sessionStorage.setItem(KEY, "1");
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TrackingProvider>
          <AppInitializer />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route 
              path="/quiz" 
              element={
                <Suspense fallback={<PageLoader />}>
                  <Quiz />
                </Suspense>
              } 
            />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TrackingProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
