import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

/**
 * Mantém o painel na última versão, sem depender do SDR lembrar de recarregar.
 *
 * O problema: o app instalado no celular fica dias aberto em memória. Cada
 * deploy muda o sistema e o aparelho continua rodando o JavaScript de antes —
 * no iPhone, fechar e abrir o app nem sempre recarrega a página.
 *
 * Três gatilhos, do mais barato ao mais forte:
 * 1. Checagem de /version.json ao voltar para o app e a cada 2 min.
 * 2. Push "atualizar" do painel (o service worker avisa as abas abertas).
 * 3. Clique na notificação, que abre /admin?atualizar=... (HTML novo sempre).
 *
 * Recarregar com um formulário aberto perderia o que a pessoa digitou. Com um
 * diálogo aberto, vira aviso no topo em vez de recarga.
 */

const INTERVALO_MS = 2 * 60 * 1000;
/** Tempo para o deploy chegar a todos os edges antes de recarregar sozinho. */
const ESPERA_PROPAGACAO_MS = 90 * 1000;
const TENTATIVA_KEY = "champion_reload_para_versao";

function temDialogoAberto(): boolean {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

export function useAtualizacaoSistema(ativo: boolean) {
  const [novaVersao, setNovaVersao] = useState(false);
  const [pedidoReinstalar, setPedidoReinstalar] = useState(false);
  const verificandoRef = useRef(false);
  const vistaRef = useRef<{ build: string; em: number } | null>(null);

  const recarregar = useCallback((motivo: string, alvo?: string) => {
    if (temDialogoAberto()) {
      setNovaVersao(true);
      return;
    }
    // Trava contra loop: se o HTML servido ainda é o velho (propagação do CDN),
    // recarregar de novo não resolve. Uma tentativa por versão a cada minuto.
    try {
      const chave = alvo || motivo;
      const anterior = JSON.parse(sessionStorage.getItem(TENTATIVA_KEY) || "null");
      if (anterior && anterior.chave === chave && Date.now() - anterior.em < 60_000) {
        setNovaVersao(true);
        return;
      }
      sessionStorage.setItem(TENTATIVA_KEY, JSON.stringify({ chave, em: Date.now() }));
    } catch { /* modo privado */ }

    const atualizarSw = "serviceWorker" in navigator
      ? navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
      : Promise.resolve();
    void atualizarSw.finally(() => window.location.reload());
  }, []);

  const verificar = useCallback(async () => {
    if (verificandoRef.current) return;
    verificandoRef.current = true;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return; // dev: não existe
      const { build } = await res.json();
      if (!build || build === __BUILD_ID__) {
        vistaRef.current = null;
        return;
      }
      // Não recarrega no primeiro instante em que a versão nova aparece. O
      // version.json chega ao edge antes de todos os chunks, e recarregar nessa
      // janela pede um .js que ainda não existe ali: vem o index.html, que o
      // cache de /assets guarda por um ano no lugar do código (14/09/2026).
      if (!vistaRef.current || vistaRef.current.build !== build) {
        vistaRef.current = { build, em: Date.now() };
        return;
      }
      if (Date.now() - vistaRef.current.em >= ESPERA_PROPAGACAO_MS) recarregar("versao", build);
    } catch {
      // sem rede: tenta no próximo gatilho
    } finally {
      verificandoRef.current = false;
    }
  }, [recarregar]);

  // URL vinda do clique na notificação.
  useEffect(() => {
    if (!ativo) return;
    const params = new URLSearchParams(window.location.search);
    const atualizou = params.has("atualizar");
    const reinstalar = params.has("reinstalar");
    if (!atualizou && !reinstalar) return;
    params.delete("atualizar");
    params.delete("reinstalar");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    if (reinstalar) setPedidoReinstalar(true);
    else toast({ title: "Sistema atualizado ✅", description: "Você está na versão mais recente do painel." });
  }, [ativo]);

  useEffect(() => {
    if (!ativo) return;
    void verificar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") {
        void verificar();
        navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    const t = setInterval(() => void verificar(), INTERVALO_MS);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      clearInterval(t);
    };
  }, [ativo, verificar]);

  // Push "atualizar"/"reinstalar" com o painel aberto.
  useEffect(() => {
    if (!ativo || !("serviceWorker" in navigator)) return;
    const aoReceber = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.origem !== "champion-sw" || msg.tipo !== "push") return;
      // Mesmo cuidado da checagem: o pedido costuma sair logo depois do deploy.
      if (msg.tipoPush === "atualizar") setTimeout(() => recarregar("push", msg.tag), ESPERA_PROPAGACAO_MS);
      if (msg.tipoPush === "reinstalar") setPedidoReinstalar(true);
    };
    navigator.serviceWorker.addEventListener("message", aoReceber);
    return () => navigator.serviceWorker.removeEventListener("message", aoReceber);
  }, [ativo, recarregar]);

  return {
    novaVersao,
    atualizarAgora: () => {
      try { sessionStorage.removeItem(TENTATIVA_KEY); } catch { /* modo privado */ }
      window.location.reload();
    },
    pedidoReinstalar,
    fecharReinstalar: () => setPedidoReinstalar(false),
    abrirReinstalar: () => setPedidoReinstalar(true),
  };
}
