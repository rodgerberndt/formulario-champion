import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BarChart3, Bot, FileText, Image, KanbanSquare, ListChecks, Menu, MessageCircle, Phone, Target, Users, X } from "lucide-react";

/**
 * O shell do painel: navegação principal numa barra lateral de vidro.
 *
 * ── Por que a navegação saiu do topo ────────────────────────────────────────
 * A fila abriu espaço para o painel virar um produto com áreas, e quatro abas
 * horizontais já estavam no limite. A barra lateral cresce para baixo sem
 * disputar espaço com os filtros.
 *
 * ── Uma fonte de verdade ────────────────────────────────────────────────────
 * Este componente NÃO tem estado de seção. Ele recebe `secaoAtiva` e chama
 * `onSelecionar` — quem manda continua sendo o `activeTab` do painel, o mesmo
 * que as `TabsContent` já liam. Sem isso a barra diria "Leads" enquanto a tela
 * mostrasse outra coisa.
 *
 * ── Trilho que abre no hover ────────────────────────────────────────────────
 * No desktop a barra vive estreita, só com ícones, e se abre ao passar o mouse.
 * Duas decisões guardadas aqui:
 *
 * 1. **A barra aberta FLUTUA sobre o conteúdo.** O recuo do conteúdo é fixo em
 *    `md:pl-16` e não acompanha a abertura. Se acompanhasse, a página inteira
 *    se reorganizaria a cada passada de mouse pela lateral — gráfico redesenha,
 *    tabela recalcula coluna, o olho perde a linha que estava lendo. O custo de
 *    flutuar é cobrir uma faixa de conteúdo por instantes; o de empurrar é
 *    reflow contínuo.
 *
 * 2. **Não há mais botão de recolher no desktop.** Ele existia para devolver
 *    largura ao conteúdo; com o trilho permanentemente estreito, a largura já
 *    está devolvida e o botão virou um estado a mais para o usuário administrar.
 *
 * `focus-within` abre junto com o hover: quem navega por teclado precisa ver os
 * rótulos ao chegar nos botões pelo Tab.
 *
 * ── Camadas ─────────────────────────────────────────────────────────────────
 * A barra é fixa à esquerda e o conteúdo ganha recuo equivalente, então ela e o
 * cabeçalho pegajoso nunca se sobrepõem. Menus e modais do Radix saem em portal
 * com z-50, acima dos dois. A gaveta do celular fica abaixo de 50 de propósito,
 * para um modal aberto nunca ficar atrás dela.
 *
 * ── Celular ─────────────────────────────────────────────────────────────────
 * Hover não existe em toque. No celular continua valendo a gaveta: botão de
 * menu, painel deslizante, rótulos sempre visíveis. Nada aqui depende de hover
 * abaixo de `md`.
 */

interface Item {
  /** Identifica o ITEM de menu. Dois itens podem apontar para a mesma seção. */
  chave: string;
  /** A seção (`activeTab`) que este item abre. */
  id: string;
  rotulo: string;
  Icone: typeof Users;
  /** Ação extra além de trocar a seção (ex.: rolar até a fila). */
  aoClicar?: () => void;
}

interface Grupo { titulo: string; itens: Item[] }

interface Props {
  secaoAtiva: string;
  onSelecionar: (secao: string) => void;
  /** Leva à fila, que hoje vive no topo da seção de Leads. */
  onIrParaFila: () => void;
  children: ReactNode;
}

/**
 * A logo real da Champion, do próprio repositório.
 *
 * O `.webp` tem 2,8 KB contra 20 KB do `.png` e é o mesmo brasão; o PNG entra
 * como reserva se o navegador recusar o webp. Antes daqui saía a letra "C"
 * desenhada em CSS, com a logo verdadeira parada em `public/` o tempo todo.
 */
function LogoChampion({ className = "" }: { className?: string }) {
  return (
    <img
      src="/champion-logo.webp"
      alt="Champion"
      width={28}
      height={28}
      loading="eager"
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.src.endsWith("champion-logo-160.png")) img.src = "/champion-logo-160.png";
      }}
      className={`w-7 h-7 rounded-lg object-cover shrink-0 ring-1 ring-white/10 ${className}`}
    />
  );
}

export function ShellAdmin({ secaoAtiva, onSelecionar, onIrParaFila, children }: Props) {
  const [gavetaAberta, setGavetaAberta] = useState(false);

  /**
   * Qual ITEM está aceso.
   *
   * "Leads" e "Fila Comercial" abrem a MESMA seção, então `secaoAtiva` sozinha
   * não distingue os dois — sem isto, ou os dois acendem juntos, ou nenhum. Isto
   * NÃO é uma segunda fonte de verdade da seção: quem manda continua sendo
   * `secaoAtiva`; isto só lembra por qual porta se entrou.
   */
  const [chaveAtiva, setChaveAtiva] = useState<string | null>(null);

  // Trocar de seção fecha a gaveta no celular: deixá-la aberta por cima do
  // conteúdo recém-aberto é o erro clássico de menu em tela pequena.
  const ir = useCallback((item: Item) => {
    setChaveAtiva(item.chave);
    onSelecionar(item.id);
    item.aoClicar?.();
    setGavetaAberta(false);
  }, [onSelecionar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setGavetaAberta(false); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  /**
   * Só entram itens que abrem tela REAL.
   *
   * "Reuniões" e "Vendas" ficaram de fora de propósito: hoje elas não são telas
   * — são botões de registro no cabeçalho e blocos de métrica dentro de Métricas
   * Criativos. Um item de menu para elas ou levaria à mesma tela de Criativos,
   * ou exigiria construir uma tela nova, que é outra etapa.
   */
  const grupos: Grupo[] = [
    {
      titulo: "Analytics",
      itens: [
        // Primeira da seção de propósito: a cascata é por onde a leitura
        // começa, e é ela que diz se vale abrir as outras.
        { chave: "aquisicao", id: "aquisicao", rotulo: "Aquisição", Icone: Target },
        { chave: "leads", id: "leads", rotulo: "Leads", Icone: Users },
        { chave: "creatives", id: "creatives", rotulo: "Métricas Criativos", Icone: Image },
        { chave: "funnel-metrics", id: "funnel-metrics", rotulo: "Métricas Funil", Icone: BarChart3 },
        { chave: "reports", id: "reports", rotulo: "Relatórios Lead", Icone: FileText },
      ],
    },
    {
      titulo: "Comercial",
      itens: [
        // A fila vive no topo da seção de Leads. O item leva até lá e rola até
        // ela, em vez de duplicar a implementação numa seção própria.
        { chave: "fila", id: "leads", rotulo: "Fila Comercial", Icone: ListChecks, aoClicar: onIrParaFila },
        // Automação de DM do Instagram (Champion Direct), no lugar do ManyChat.
        { chave: "direct", id: "direct", rotulo: "Direct (Instagram)", Icone: MessageCircle },
        // WhatsApp do comercial pela Cloud API (app "Champion CRM Mensagens", 15/10/2026).
        { chave: "whatsapp", id: "whatsapp", rotulo: "WhatsApp", Icone: Phone },
        // Os agentes e automações trabalhando: Reels, carrossel, stories, rotinas do servidor (14/10/2026).
        { chave: "agentes", id: "agentes", rotulo: "Agentes", Icone: Bot },
      ],
    },
    {
      titulo: "Orgânico",
      itens: [
        // A esteira de carrosséis e Reels (17/10/2026). É a mesma tela de /esteira, que o Leo e o Oton abrem com a
        // senha do time; aqui ela entra com o login do admin.
        { chave: "esteira", id: "esteira", rotulo: "Esteira (carrosséis e Reels)", Icone: KanbanSquare },
      ],
    },
  ];

  // Quando a seção muda por fora (o seletor de abas que sobrevive no celular),
  // acende o PRIMEIRO item daquela seção, que é o esperado.
  const primeiroDaSecao = grupos.flatMap((g) => g.itens).find((i) => i.id === secaoAtiva)?.chave ?? null;
  const clicadoAindaVale = grupos.flatMap((g) => g.itens).some((i) => i.chave === chaveAtiva && i.id === secaoAtiva);
  const chaveEfetiva = clicadoAindaVale ? chaveAtiva : primeiroDaSecao;

  /**
   * O conteúdo é o MESMO nos dois contextos; o que muda é como o rótulo aparece.
   *
   * No trilho do desktop ele nasce transparente e acende junto com o hover do
   * `group`. Na gaveta do celular ele é sempre visível, porque toque não tem
   * hover — depender de `group-hover` ali deixaria a gaveta só com ícones.
   *
   * O ícone fica ancorado no mesmo x nos dois estados (`px-3` e `shrink-0`),
   * então abrir a barra não faz os ícones andarem de lado.
   */
  const conteudoBarra = (sempreAberta: boolean) => {
    const rotulo = sempreAberta
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";

    return (
      <div className="flex h-full flex-col">
        {/* Marca */}
        <div className="flex items-center gap-2.5 px-[18px] h-16 shrink-0 border-b border-white/10">
          <LogoChampion />
          <span className={`font-bold tracking-tight text-sm leading-tight whitespace-nowrap transition-opacity duration-150 ${rotulo}`}>
            Champion<span className="block text-[10px] font-normal text-muted-foreground">painel</span>
          </span>
        </div>

        {/* Grupos */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-4">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className={`px-[18px] pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 whitespace-nowrap transition-opacity duration-150 ${rotulo}`}>
                {g.titulo}
              </p>
              <ul className="space-y-0.5 px-2">
                {g.itens.map((it) => {
                  const aceso = it.id === secaoAtiva && it.chave === chaveEfetiva;
                  return (
                    <li key={it.chave}>
                      <button
                        type="button"
                        onClick={() => ir(it)}
                        title={it.rotulo}
                        aria-current={aceso ? "page" : undefined}
                        className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors
                          ${aceso
                            ? "bg-secondary/15 text-secondary font-semibold ring-1 ring-inset ring-secondary/30"
                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
                      >
                        <it.Icone className="w-4 h-4 shrink-0" />
                        <span className={`truncate whitespace-nowrap transition-opacity duration-150 ${rotulo}`}>
                          {it.rotulo}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    );
  };

  /** Vidro escuro: pouca opacidade, desfoque forte, borda branca quase invisível. */
  const vidro = "bg-card/40 backdrop-blur-xl supports-[backdrop-filter]:bg-card/30 border-white/10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)]";

  return (
    <>
      {/* ── Trilho, desktop ─────────────────────────────────────────────────
          `overflow-hidden` é o que recorta os rótulos enquanto a barra está
          estreita: eles continuam no DOM (leitor de tela e Tab os alcançam) e
          simplesmente não cabem na faixa de 4rem. */}
      <aside
        className={`group hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r overflow-hidden
          w-16 hover:w-56 focus-within:w-56 transition-[width] duration-200 ease-out ${vidro}`}
      >
        {conteudoBarra(false)}
      </aside>

      {/* ── Gaveta, celular ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setGavetaAberta(true)}
        aria-label="Abrir menu"
        className={`md:hidden fixed left-3 top-3 z-[46] h-9 w-9 grid place-items-center rounded-lg border ${vidro}`}
      >
        <Menu className="w-4 h-4" />
      </button>

      {gavetaAberta && (
        <div className="md:hidden fixed inset-0 z-[45]">
          <button type="button" aria-label="Fechar menu" onClick={() => setGavetaAberta(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <div className={`absolute inset-y-0 left-0 z-[46] w-64 border-r ${vidro}`}>
            <button type="button" onClick={() => setGavetaAberta(false)} aria-label="Fechar menu"
              className="absolute right-2 top-4 h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
            {conteudoBarra(true)}
          </div>
        </div>
      )}

      {/* ── Conteúdo ────────────────────────────────────────────────────── */}
      {/* Recuo FIXO de 4rem: a barra aberta flutua por cima em vez de empurrar.
          Empurrar significaria reflow da página a cada passada de mouse pela
          lateral — e reflow em tela cheia de gráfico e tabela é caro e
          desconcentra. */}
      <div className="md:pl-16">
        {children}
      </div>
    </>
  );
}

export default ShellAdmin;
