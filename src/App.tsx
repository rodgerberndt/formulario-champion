import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load pages for performance
const Quiz = lazy(() => import("./pages/Quiz"));
const Obrigado = lazy(() => import("./pages/Obrigado"));
const Admin = lazy(() => import("./pages/Admin"));

const queryClient = new QueryClient();

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
            path="/senhasenha"
            element={
              <Suspense fallback={<PageLoader />}>
                <Admin />
              </Suspense>
            } 
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
