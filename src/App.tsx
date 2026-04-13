// React app entry
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TrackingProvider>
          <DateRangeProvider>
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
                path={`/${ADMIN_ANALYTICS_SLUG}`}
                element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminAnalytics />
                  </Suspense>
                } 
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </DateRangeProvider>
        </TrackingProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
