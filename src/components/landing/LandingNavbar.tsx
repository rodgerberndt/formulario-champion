import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { rolarAteFormulario } from "@/lib/formularioTopo";
import { Botao } from "./Botao";
import "./landingNavbar.css";

/**
 * Links do header. `alvo` é o id de uma âncora em Index.tsx (os ids ficam nos
 * <section> do Index, sem tocar nos `data-track-id`, que são outra coisa).
 * A ordem aqui é a do menu, não a da página.
 */
/**
 * "Resultados" fica oculto até existir a seção de prints de feedback. Para
 * religar: crie a seção com um id próprio (ex. "feedbacks"), troque o `alvo`
 * abaixo e mude MOSTRAR_RESULTADOS para true.
 * Desde 17/09/2026 "Cases" aponta para Cases de Sucesso (#resultados); a seção
 * de vídeos (#cases-video) saiu da página.
 */
// Ligado de volta em 19/09/2026: a seção de prints de WhatsApp (#feedbacks)
// voltou à página, então o item deixou de apontar para o vazio.
const MOSTRAR_RESULTADOS = true;

const TODOS_NAV_ITEMS = [
  // Mesma ordem em que as seções aparecem na página (Index.tsx).
  { label: "Cases", alvo: "resultados", visivel: true },
  { label: "Problema", alvo: "problema", visivel: true },
  { label: "Método", alvo: "metodo", visivel: true },
  // Os prints de WhatsApp entram entre o Método e o Portfólio, que é onde a
  // seção mora na página. O menu marca o item ativo pela seção que passou pela
  // linha de 35% da tela, então item fora de ordem acende na hora errada.
  { label: "Depoimentos", alvo: "feedbacks", visivel: MOSTRAR_RESULTADOS },
  { label: "Portfólio", alvo: "portfolio", visivel: true },
  { label: "Como funciona", alvo: "como-funciona", visivel: true },
  { label: "FAQ", alvo: "faq", visivel: true },
] as const;

type Alvo = (typeof TODOS_NAV_ITEMS)[number]["alvo"];

const NAV_ITEMS = TODOS_NAV_ITEMS.filter((item) => item.visivel);

const LOGO_SRC = "/champion-logo-transparente.webp";

function reduzMovimento() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface LandingNavbarProps {
  /** Clique no CTA do header. Padrão: só rola até o formulário do topo. */
  onCtaClick?: () => void;
}

export function LandingNavbar({ onCtaClick }: LandingNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [ativo, setAtivo] = useState<Alvo | null>(null);

  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Estado "rolado" + link ativo, calculados no mesmo rAF do scroll.
  useEffect(() => {
    let raf = 0;
    const medir = () => {
      raf = 0;
      const y = window.scrollY;
      setScrolled(y > 16);

      // Seção ativa: a que cruza uma linha a 35% da tela.
      const linha = window.innerHeight * 0.35;
      let achado: Alvo | null = null;
      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.alvo);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Fica marcada a última seção que já passou da linha, então o menu
        // acompanha também nos trechos entre seções (CTA intermediário etc.).
        if (r.top <= linha) achado = item.alvo;
        if (r.bottom <= linha && item === NAV_ITEMS[NAV_ITEMS.length - 1]) achado = null;
      }
      setAtivo(achado);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const fecharMenu = useCallback((devolverFoco: boolean) => {
    setMenuOpen(false);
    if (devolverFoco) toggleRef.current?.focus();
  }, []);

  // Menu aberto: foco no primeiro link, Esc fecha, clique fora fecha.
  useEffect(() => {
    if (!menuOpen) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fecharMenu(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) fecharMenu(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen, fecharMenu]);

  // Voltou para o desktop com o menu aberto: fecha.
  useEffect(() => {
    if (!menuOpen || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => mq.matches && setMenuOpen(false);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [menuOpen]);

  const rolarPara = useCallback((e: MouseEvent<HTMLAnchorElement>, alvo: Alvo) => {
    const el = document.getElementById(alvo);
    if (!el) return; // sem a seção, deixa o href agir
    e.preventDefault();
    setMenuOpen(false);
    // Compensa o header fixo (posição + altura) com uma folga de 12px. Mede a
    // barra, não o <header>: com o painel do mobile aberto o <header> fica alto.
    const barra = headerRef.current?.querySelector(".lnav-shell");
    const offset = barra ? barra.getBoundingClientRect().bottom + 12 : 88;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: reduzMovimento() ? "auto" : "smooth" });
  }, []);

  const clicarCta = useCallback(() => {
    setMenuOpen(false);
    if (onCtaClick) onCtaClick();
    else rolarAteFormulario();
  }, [onCtaClick]);

  // Função de render (não componente): recriar um componente a cada render
  // remontaria o botão e perderia foco/hover quando o link ativo muda.
  //
  // O CTA do header é SECUNDÁRIO desde 17/09/2026. Ele ficava em dourado cheio
  // logo acima do botão dourado do formulário, e os dois disputavam o olho na
  // mesma tela. Regra da página: um primário por seção, e o do topo é o do
  // formulário.
  const renderCta = (id: string, full?: boolean) => (
    <Botao
      rotulo="Falar com especialista"
      variante="secundario"
      tamanho="sm"
      bloco={full}
      onClick={clicarCta}
      data-track-click="cta_header"
      data-track-id={id}
    />
  );

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 z-50 px-3 pt-3 md:px-5 md:pt-4 ${scrolled ? "lnav-scrolled" : ""} ${menuOpen ? "lnav-open" : ""}`}
    >
      <div className="lnav-shell mx-auto max-w-6xl">
        <div className="lnav-glass" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-4 pl-3 pr-2 py-2 md:pl-4 md:pr-2.5">
          <a
            href="#topo"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              window.scrollTo({ top: 0, behavior: reduzMovimento() ? "auto" : "smooth" });
            }}
            data-track-click="nav_logo"
            data-track-id="nav_logo"
            aria-label="Champion, voltar ao topo"
            className="lnav-toggle shrink-0 rounded-lg"
          >
            <span className="lnav-logo">
              <img
                src={LOGO_SRC}
                alt="Champion"
                width={145}
                height={160}
                className="h-8 md:h-9 w-auto"
                loading="eager"
                decoding="async"
              />
              <span className="lnav-logo-shine" aria-hidden="true" />
            </span>
          </a>

          {/* Desktop */}
          <nav aria-label="Seções da página" className="hidden lg:flex items-center gap-7">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.alvo}
                href={`#${item.alvo}`}
                onClick={(e) => rolarPara(e, item.alvo)}
                data-track-click="nav_link"
                data-track-id={`nav_${item.alvo}`}
                aria-current={ativo === item.alvo ? "true" : undefined}
                className="lnav-link py-1"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:block">
            {renderCta("header_cta")}
          </div>

          <button
            ref={toggleRef}
            type="button"
            className="lnav-toggle lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl text-foreground"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="lnav-painel"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            data-track-click="nav_menu_toggle"
            data-track-id="nav_menu_toggle"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile */}
      {menuOpen && (
        <div id="lnav-painel" ref={panelRef} className="lnav-panel lg:hidden mx-auto max-w-6xl mt-2 px-4 pt-1 pb-4">
          <nav aria-label="Seções da página">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.alvo}
                href={`#${item.alvo}`}
                onClick={(e) => rolarPara(e, item.alvo)}
                data-track-click="nav_link"
                data-track-id={`nav_mobile_${item.alvo}`}
                aria-current={ativo === item.alvo ? "true" : undefined}
                className="lnav-panel-link"
              >
                {item.label}
                <ArrowRight className="w-3.5 h-3.5 opacity-40" aria-hidden="true" />
              </a>
            ))}
          </nav>
          <div className="pt-4">
            {renderCta("header_cta_mobile", true)}
          </div>
        </div>
      )}
    </header>
  );
}
