/**
 * Nicho da landing: a MESMA página, com a copy falando com outro mercado.
 *
 * A estrutura da página não muda em nenhum nicho. As seções, a ordem, os
 * `data-track-id` e os `data-track-order` são os mesmos de sempre (ver
 * `landingSections.ts`) — o que muda aqui é só o texto dentro de cada seção.
 * Isso é de propósito: a estrutura já foi testada e o funil por seção do admin
 * depende dela para comparar período com período. Nicho novo NÃO abre, fecha,
 * reordena nem renomeia seção.
 *
 * Como isso chega na página: `Index` põe o nicho num contexto e cada seção lê
 * o seu pedaço com `useCopyNicho()`. Nenhum componente guarda texto próprio.
 *
 * Quem serve o quê (ver `App.tsx`):
 *   "geral"      → "/", /HD0, /HD1, /HD2, /HD4 e todas as /SHx
 *   "ecommerce"  → /HD3
 *
 * A HD3 é a headline vencedora do teste encerrado em 21/08/2026 e continua
 * sendo a headline desta versão: o que foi nichado para e-commerce é a copy,
 * não a promessa. Trocar a promessa junto com o mercado mudaria duas variáveis
 * na mesma rodada e nenhum número seguinte seria legível.
 *
 * Fonte do reposicionamento: "Champion — Reposicionamento para Assessoria de
 * Criativos de E-commerce" (doc do Rodger, lido em 21/09/2026). De lá vêm o
 * vocabulário (ROAS, CPA, ticket médio, margem de contribuição, estoque,
 * recompra), o inimigo (o editor freelancer que some e o ciclo de refazer
 * criativo do zero), a categoria ("time de criativo terceirizado para
 * e-commerce"). O piso de faturamento é o do Rodger, R$ 50 mil/mês, e não os
 * R$ 100 mil do doc: decisão dele em 21/09/2026.
 */
import { createContext, useContext } from "react";
import { MERCADO_OPTIONS, MERCADO_OPTIONS_ECOMMERCE } from "@/lib/leadScoring";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Flame,
  GraduationCap,
  Hourglass,
  LineChart,
  MessageCircle,
  ShoppingCart,
  Sparkles,
  Target,
  TrendingUp,
  UserX,
  Users,
  Video,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * "geral-vsl" (28/09/2026): a copy GERAL, sem uma vírgula de diferença, com a
 * VSL no topo. Nasceu quando o Rodger decidiu desnichar a /HD3 do e-commerce
 * ("como estava ontem, com a mesma copy") sem perder o vídeo que já tinha
 * subido. É um nicho e não um `if` no Hero porque a regra desta casa é uma só:
 * o que muda entre páginas é a copy, e a copy mora aqui.
 */
export type Nicho = "geral" | "ecommerce" | "geral-vsl" | "prova";

/** Headline do Hero, quando o nicho reescreve a da variante de path. */
export interface HeadlineNicho {
  lead: string;
  highlight?: string;
  tail?: string;
  /** Linha menor sob a headline (depoimento). Mesmo campo da variante. */
  attribution?: string;
}

export interface ProvaRapida {
  icone: LucideIcon;
  valor: string;
  rotulo: string;
}

export interface ItemDor {
  icone: LucideIcon;
  titulo: string;
  desc: string;
}

export interface PassoComoFunciona {
  icone: LucideIcon;
  titulo: string;
  subtitulo: string;
  bullets: string[];
}

export interface PerguntaFaq {
  q: string;
  a: string;
}

export interface CardSimples {
  titulo: string;
  desc: string;
}

export interface CopyNicho {
  hero: {
    /** Quando existe, substitui a headline da variante de path. */
    headline?: HeadlineNicho;
    /**
     * Linha acima da headline: o qualificador de nicho e piso. Sete LPs do
     * gênero dizem "para quem é" no primeiro segundo (28/09/2026).
     */
    preHeadline?: string;
    badge: string;
    subheadline: string;
    /** Rótulo acima dos três números ("Pessoas mentem, números não."). */
    provasRotulo?: string;
    provas: ProvaRapida[];
    /** Uma linha de garantia sob os números. Ausente = sem selo. */
    seloGarantia?: string;
    /**
     * VSL do topo, logo abaixo da headline. Ausente = topo sem vídeo.
     * Arquivo servido pela própria página (ver `VslDoTopo`, no Hero).
     */
    vsl?: {
      src?: string;
      poster?: string;
      aspect?: string;
      /** Player da Vturb: mede retenção do lado deles. */
      vturb?: { conta: string; player: string };
    };
  };
  cases: {
    eyebrow: string;
    titulo: string;
    ctaTitulo: string;
    ctaSub: string;
    /**
     * Mostra o depoimento em vídeo dentro de cada card. Com uma VSL no topo,
     * fica `false`: quatro players de depoimento logo abaixo do vídeo
     * principal disputam com ele a mesma atenção, e o card ainda prova com
     * perfil, número e bio.
     */
    mostrarVideo: boolean;
    /**
     * Ordem dos cases por slug. Slug fora da lista entra depois, na ordem do
     * arquivo. É assim que o nicho mostra primeiro a prova que fala a língua
     * de quem está lendo, sem reescrever a copy dos cases — que é literal e
     * não se reescreve (ver o cabeçalho de `casesSucesso.ts`).
     */
    ordem?: string[];
  };
  dor: {
    tituloInicio: string;
    tituloDestaque: string;
    sub: string;
    itens: ItemDor[];
  };
  metodo: {
    selo: string;
    tituloInicio: string;
    tituloDestaque: string;
    tituloFim: string;
    sub: string;
    entradaRotulo: string;
    entradaNome: string;
    entradaDesc: string;
    saidaRotulo: string;
    saidaNome: string;
    saidaDesc: string;
    pilares: { n: string; titulo: string; subtitulo: string }[];
    pilar1: { mapa: CardSimples; briefing: CardSimples; categorias: string[] };
    pilar2: {
      blocos: CardSimples[];
      rotuloGanchos: string;
      fechoInicio: string;
      fechoDestaque: string;
      fechoFim: string;
    };
    pilar3: { fechoInicio: string; fechoDestaque: string; fechoFim: string };
    pilar4: { cards: CardSimples[] };
  };
  criativos: {
    titulo: string;
    sub: string;
    /** Badge de nicho do vídeo (Info, Lowticket, Nutra, Hot). */
    mostrarBadgeNicho: boolean;
  };
  formulario: {
    /**
     * Opções do campo Segmento. Cada string é gravada no lead e pontuada por
     * PONTOS_MERCADO (leadScore.ts) — mudar o texto aqui muda o score, então
     * nenhuma opção nova entra sem a linha correspondente lá.
     */
    segmentos: string[];
  };
  ctaIntermediario: { texto: string; rotulo: string };
  comoFunciona: {
    tituloInicio: string;
    tituloDestaque: string;
    passos: PassoComoFunciona[];
  };
  faq: { tituloInicio: string; tituloDestaque: string; sub: string; itens: PerguntaFaq[] };
  ctaFinal: {
    tituloInicio: string;
    tituloDestaque: string;
    sub: string;
    passos: string[];
    rotulo: string;
  };
  /**
   * Seção própria de garantia (prova nº 5). Ausente = a seção não renderiza
   * e o `data-track-id` dela não existe na página.
   */
  garantia?: { nome: string; titulo: string; corpo: string[]; nota?: string };
  /** Bloco "quem te atende" (prova nº 10). Ausente = não renderiza. */
  quemAtende?: { nome: string; cargo: string; linhas: string[]; prazo?: string; foto?: string };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  GERAL — a copy que já estava no ar. Nada aqui é texto novo: é o que        */
/*  estava escrito dentro dos componentes, movido para cá sem uma vírgula     */
/*  de diferença, para que "/" e as outras variantes não mudem.               */
/* ────────────────────────────────────────────────────────────────────────── */
const GERAL: CopyNicho = {
  hero: {
    badge: "Aplicação gratuita de 2 minutos",
    subheadline:
      "A assessoria de criativos da Champion já ajudou centenas de operações do mercado digital, seja de infoprodutos, nutracêuticos, X1 do WhatsApp, mercado na gringa ou no Brasil, a escalar em múltiplos 6, 7 e até 8 dígitos.",
    provas: [
      { icone: Users, valor: "+ de 1.1k", rotulo: "clientes" },
      { icone: Sparkles, valor: "+ de 8k", rotulo: "criativos" },
      { icone: TrendingUp, valor: "3.7x", rotulo: "ROI médio" },
    ],
  },
  cases: {
    eyebrow: "Cases de Sucesso",
    titulo: "Quem já trabalha com a Champion",
    ctaTitulo: "Quer ser o próximo case?",
    ctaSub: "A aplicação leva 2 minutos.",
    mostrarVideo: true,
  },
  dor: {
    tituloInicio: "O  ANDRÔMEDA TROUXE UMA SÉRIE DE PROBLEMAS PRA SUA OPERAÇÃO.",
    tituloDestaque: "VOCÊ RECONHECE ALGUM DELES?",
    sub: "O novo motor de IA do Meta mudou as regras do jogo. Quem não se adaptou, está sentindo na pele toda semana.",
    itens: [
      {
        icone: Clock,
        titulo: "Sem tempo pra criar",
        desc: "Você é gargalo do próprio negócio. Sem delegar, não escala, e ninguém entrega no seu nível.",
      },
      {
        icone: XCircle,
        titulo: "Criativos que não vendem",
        desc: "Você posta, roda, espera, e o resultado é silêncio. Visualização não vira venda.",
      },
      {
        icone: TrendingUp,
        titulo: "Criativo não aguenta escala",
        desc: "Funciona em R$ 500/dia. Quando você dobra o orçamento, o CPA explode e a margem some.",
      },
      {
        icone: Target,
        titulo: "Lead vem desqualificado",
        desc: "Volume até existe, mas é gente sem dinheiro, sem urgência e que some no primeiro contato.",
      },
      {
        icone: Ban,
        titulo: "CRIATIVO REPROVANDO TODA HORA",
        desc: "Você produz, sobe, e a Meta derruba. Conta restrita, BM travada, anúncio em loop de revisão.",
      },
      {
        icone: LineChart,
        titulo: "Otimiza no achismo",
        desc: "Você olha o gerenciador e não sabe o que pausar, o que escalar nem onde está sangrando.",
      },
      {
        icone: GraduationCap,
        titulo: "Falta repertório técnico",
        desc: "Você aprendeu copiando guru. Falta método, falta estrutura, e isso te custa caro todo mês.",
      },
      {
        icone: Hourglass,
        titulo: "Preso no operacional",
        desc: "Você gasta o dia editando, briefando e revisando criativo. Sobra zero tempo pro que realmente faz o negócio crescer: estratégia.",
      },
      {
        icone: Flame,
        titulo: "CPA alto engolindo a margem",
        desc: "O criativo até roda, mas o custo por venda sobe e come o lucro. Você fatura mais e ganha menos no fim do mês.",
      },
      {
        icone: AlertTriangle,
        titulo: "Refém de um único criativo",
        desc: "Sua escala inteira está apoiada em um vencedor só. No dia que ele fadigar, a operação inteira despenca junto.",
      },
    ],
  },
  metodo: {
    selo: "Método Champion · 4 Pilares",
    tituloInicio: "Como traduzimos o ",
    tituloDestaque: " ANDRÔMEDA",
    tituloFim: " em resultado.",
    sub: "O novo motor de IA do Meta exige **mais formatos, ângulos e personas**. Nossa operação foi desenhada para alimentar exatamente isso.",
    entradaRotulo: "META IA",
    entradaNome: " ANDRÔMEDA",
    entradaDesc: "pede variedade em escala",
    saidaRotulo: "OUTPUT",
    saidaNome: "ROI",
    saidaDesc: "escala previsível e\nCPA controlado",
    pilares: [
      {
        n: "01",
        titulo: "Plano de Ação Personalizado",
        subtitulo: "O mapa completo da sua operação antes de qualquer criativo sair",
      },
      {
        n: "02",
        titulo: "Estratégia ANDRÔMEDA",
        subtitulo: "Mesmo corpo, múltiplas entradas: é isso que faz a Meta IA escalar.",
      },
      {
        n: "03",
        titulo: "Volume: Esteira Semanal",
        subtitulo: "Um ciclo completo, toda semana. É assim que a oxigenação acontece.",
      },
      {
        n: "04",
        titulo: "Comunicação",
        subtitulo: "Você nunca fica no escuro. A operação inteira é transparente.",
      },
    ],
    pilar1: {
      mapa: {
        titulo: "Mapa da oferta, produto e operação",
        desc: "Metas de faturamento, faturamento atual, personas, dores, desejos, para quem você vende e **como** vende. Sem isso, criativo é tiro no escuro.",
      },
      briefing: {
        titulo: "Briefing cirúrgico de criativos",
        desc: "Classificamos cada criativo seu em 4 categorias antes de produzir um único frame novo:",
      },
      categorias: [
        "Validados que estão escalando",
        "Saturados (precisam ser substituídos)",
        "Venderam, mas não escalaram",
        "Não performaram (e por quê)",
      ],
    },
    pilar2: {
      blocos: [
        {
          titulo: "Personas",
          desc: "Cada criativo é construído para uma fatia de público diferente. Mais personas = mais portas de entrada.",
        },
        {
          titulo: "Formatos",
          desc: "A mesma mensagem embalada de várias formas: UGC, VSL curta, depoimento, demonstração, captura.",
        },
        {
          titulo: "Ângulos",
          desc: "Formas diferentes de contar a mesma história para impactar públicos distintos no mesmo público.",
        },
      ],
      rotuloGanchos: "MESMO CORPO · 4 GANCHOS · 4 RESULTADOS",
      fechoInicio: "Não é sobre fazer ",
      fechoDestaque: "personas",
      fechoFim: ", do jeito certo.",
    },
    pilar3: {
      fechoInicio: "A cada ciclo, mais aprendizado, mais dados e mais ",
      fechoDestaque: "assertividade",
      fechoFim: " nos criativos seguintes.",
    },
    pilar4: {
      cards: [
        {
          titulo: "Calls de checkpoint a cada 2 semanas",
          desc: "Onboarding na 1ª semana e checkpoint nas semanas 3, 5 e 7. Cada ciclo: mais aprendizado, mais refinamento, mais assertividade.",
        },
        {
          titulo: "Acompanhamento direto na operação",
          desc: "Canal direto com a equipe responsável. Você sabe o que está acontecendo, o porquê, e o próximo passo — sempre.",
        },
      ],
    },
  },
  criativos: {
    titulo: "PORTFÓLIO",
    sub: "Alguns exemplos reais de criativos em vídeo desenvolvidos pela Champion para campanhas de performance.",
    mostrarBadgeNicho: true,
  },
  formulario: { segmentos: MERCADO_OPTIONS },
  ctaIntermediario: {
    texto: "Preencha a aplicação rápida para que o próximo feedback seja você!",
    rotulo: "Preencher aplicação (2 min)",
  },
  comoFunciona: {
    tituloInicio: "COMO",
    tituloDestaque: "FUNCIONA",
    passos: [
      {
        icone: ClipboardCheck,
        titulo: "Preencha a Aplicação",
        subtitulo: "Aplicação rápida de 2 minutos",
        bullets: [
          "Clique no botão e responda a aplicação",
          "Conte sobre sua operação, faturamento e objetivos",
          "Suas respostas vão direto pro nosso time de especialistas",
        ],
      },
      {
        icone: MessageCircle,
        titulo: "Conversa no WhatsApp",
        subtitulo: "Qualificação + agendamento",
        bullets: [
          "Um especialista entra em contato no seu WhatsApp",
          "Faz algumas perguntas pra entender seu cenário a fundo",
          "Agenda sua Call de Diagnóstico Criativo Gratuito",
        ],
      },
      {
        icone: Video,
        titulo: "Call de Diagnóstico Gratuito",
        subtitulo: "Diagnóstico criativo · sem custo",
        bullets: [
          "Analisamos sua operação, criativos e oportunidades reais",
          "Você sai com clareza dos próximos passos pra escalar",
          "Só depois disso conversamos sobre um possível próximo passo juntos",
        ],
      },
    ],
  },
  faq: {
    tituloInicio: "PERGUNTAS",
    tituloDestaque: "FREQUENTES",
    sub: "As dúvidas que mais aparecem antes de preencher a aplicação. Respondidas sem rodeio.",
    itens: [
      {
        q: "Meu criativo performa no teste, mas morre quando escalo. Vocês resolvem isso?",
        a: "Sim. Esse é exatamente o problema que a gente ataca todos os dias. Criativo que valida em R$50/dia e morre em R$500 não é criativo validado, é coincidência estatística. A nossa metodologia (Gancho + Corpo + Sustentação) nasceu para construir criativos que aguentam orçamento alto sem saturar em 48h. Se um criativo seu não fez no mínimo 2 vendas no teste, ele NÃO validou, e a gente te mostra o porquê.",
      },
      {
        q: "Eu já tenho um time interno / uma agência. Por que contratar a Champion?",
        a: "A maioria dos times internos e agências entrega VOLUME de criativo, não ESCALA. A gente não compete com seu time: a gente entrega o ativo que falta, o criativo de escala. Vários clientes nossos mantêm o time interno rodando o operacional e usam a Champion para o criativo principal que sustenta a conta.",
      },
      {
        q: "Em quanto tempo eu vejo resultado?",
        a: "Os primeiros criativos sobem em até 7 dias após o onboarding. A leitura real de performance acontece entre 14 e 30 dias, porque é o tempo necessário para validar com volume de spend, não com achismo. Quem promete resultado em 48h está vendendo sorte, não método.",
      },
      {
        q: "Funciona pro meu nicho? (Infoproduto, e-commerce, low ticket, high ticket, SaaS, afiliado…)",
        a: "Sim. A gente já rodou criativo de escala em infoproduto (R$97 a R$15k), e-commerce, SaaS, igaming, serviço local, agência B2B e afiliado. O método é agnóstico de nicho porque ataca o que TODO criativo precisa pra escalar: gancho que para o scroll, corpo que sustenta atenção e CTA que converte sem fricção.",
      },
      {
        q: "Qual o investimento? Cabe no meu orçamento?",
        a: "A Assessoria Champion é feita para quem já fatura no mínimo R$10k/mês com tráfego pago, porque abaixo disso o problema raramente é criativo, é oferta. O valor exato é apresentado na call de diagnóstico, depois que a gente entende seu cenário. O ROI médio dos clientes paga a mensalidade nas primeiras 2 semanas.",
      },
      {
        q: "Eu não tenho equipe de filmagem nem ator. Vocês produzem o criativo?",
        a: "Sim. A gente cuida da estratégia, roteiro, direção e produção. Você não precisa montar estúdio, contratar editor nem aparecer na frente da câmera (a não ser que faça sentido pro seu posicionamento). Entregamos os criativos prontos pra subir.",
      },
      {
        q: "Como vocês garantem que o criativo vai performar?",
        a: "A gente NÃO garante performance, quem garante mente. O que garantimos é metodologia, processo e iteração rápida. Cada criativo passa por uma matriz de validação antes de ir pro ar, e refazemos rapidamente o que não bate o benchmark. Performance é consequência de método, e é assim que escalamos contas de R$30k pra R$300k/mês.",
      },
      {
        q: "Qual a diferença entre a Sprint e a Assessoria Completa?",
        a: "A Sprint é uma imersão pontual de criativos para resolver um gargalo específico (ex: lançamento, escala de uma oferta). A Assessoria é a parceria contínua, com produção semanal de criativos, leitura de performance e ajuste de rota, pra quem quer estabilidade de escala mês após mês. No diagnóstico a gente recomenda o formato certo pro seu momento.",
      },
      {
        q: "Por que eu tenho que preencher uma aplicação antes de falar com vocês?",
        a: "Porque a gente não atende todo mundo. A aplicação filtra quem realmente tem fit com a Champion (faturamento, mercado, momento) e prepara a call para ser objetiva, sem perder seu tempo nem o nosso. Se você não tem fit, a gente fala na hora e indica o caminho certo.",
      },
      {
        q: "E se eu não gostar dos criativos?",
        a: "Tem ciclo de revisão estruturado em todos os formatos. Mas a verdade é que a maioria das fricções acontece quando o cliente quer 'criativo bonito' e a gente entrega 'criativo que vende'. No onboarding alinhamos expectativa: a régua aqui é performance, não estética.",
      },
    ],
  },
  ctaFinal: {
    tituloInicio: "PREENCHA SUA APLICAÇÃO DE",
    tituloDestaque: "CRIATIVOS 360 AGORA!!!!!",
    sub: "Em 2 minutos a gente entende sua operação e agenda sua call de diagnóstico criativo 360, gratuita.",
    passos: [
      "Preencha a aplicação (1–2 min)",
      "Análise do seu cenário (hoje)",
      "Especialista te chama",
      "Plano de criativos + próximos passos",
    ],
    rotulo: "Quero preencher minha aplicação",
  },
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  E-COMMERCE — mesma estrutura, mesma promessa, outro mercado.              */
/*                                                                            */
/*  As três trocas que atravessam tudo:                                       */
/*   1. Vocabulário. Sai "oferta", "front", "funil", "escalar oferta".        */
/*      Entra ROAS, CPA, ticket médio, margem de contribuição, estoque,       */
/*      recompra, checkout. Quem não reconhece o próprio vocabulário na       */
/*      página assume que o serviço não é para ele.                           */
/*   2. Inimigo. Não é mais o mercado genérico: é o editor freelancer que     */
/*      some e o ciclo de refazer criativo do zero toda vez que um cansa.     */
/*   3. Antipromessa. O piso de R$ 50 mil/mês aparece escrito, no topo e no   */
/*      texto do formulário. Filtra a aplicação ruim e sobe o valor.          */
/* ────────────────────────────────────────────────────────────────────────── */
const ECOMMERCE: CopyNicho = {
  hero: {
    // A estrutura da HD3 fica de pé: "Como a Champion gerou + de 3MI em
    // faturamento ... em apenas 1 mês". Só o destinatário passa a ser dito.
    headline: {
      lead: "Como a Champion gerou ",
      highlight: "+ de 3MI em faturamento",
      tail: " para e-commerces em apenas 1 mês",
    },
    badge: "Aplicação gratuita de 2 minutos",
    subheadline:
      "Somos o time de criativo terceirizado de lojas que já faturam de R$ 50 mil a múltiplos 7 dígitos por mês. Mais de 8 mil criativos produzidos, no Brasil e na gringa.",
    provas: [
      { icone: ShoppingCart, valor: "+ de 1.1k", rotulo: "operações atendidas" },
      { icone: Sparkles, valor: "+ de 8k", rotulo: "criativos produzidos" },
      // Entrou no lugar do "3.7x ROI médio" em 24/09/2026. O doc de
      // reposicionamento pede prova de operação (anos, verba gerida,
      // criativos por mês) no lugar de número de resultado que o leitor não
      // consegue conferir, e o 3,7x ainda estava sem confirmação de ser ROI
      // ou ROAS.
      { icone: CalendarClock, valor: "+ de 3 anos", rotulo: "de mercado" },
    ],
    /*
     * VSL DO TOPO — RELIGADA EM 22/09/2026, POR IFRAME.
     *
     * O player `6ab2e1e3d350cce060eb090f` se dimensiona errado na origem. Com
     * o snippet OFICIAL da Vturb, sem uma linha de CSS da landing, ele monta
     * com 15.188 px de altura para 270 px de largura: razão 56,25 no lugar de
     * 1,78. O número não é aleatório, é 1080/1920 multiplicado por 100 a mais
     * e invertido, e a montagem dele para no `thumbnail`, sem nunca criar o
     * `preload` e o `style` que um player inteiro cria.
     *
     * O controle fecha o caso: o player do case Luis e Nathan, no MESMO
     * markup, na MESMA página e com a MESMA largura, monta inteiro e devolve
     * 480 px, razão 1,78. Markup igual, players diferentes, resultados
     * diferentes: a causa está na configuração do player, não aqui.
     *
     * Nenhum CSS conserta isso de fora: prender o elemento numa caixa de 9/16
     * só mostra o topo de um conteúdo de 15 mil pixels, que é o retângulo azul
     * (#2e2ed6, a cor de fundo do próprio player) que apareceu nas tentativas.
     *
     * O player da Vturb foi abandonado aqui e o vídeo é servido pela própria
     * página. Motivo, medido: o player `6ab2e1e3d350cce060eb090f` monta com
     * razão 56,25 em vez de 1,78 (a proporção gravada nele está errada), e
     * isso acontece TAMBÉM dentro do `embed.html` em iframe: lá dentro ele
     * fica com 22.500 px de altura numa janela de 333 px, e desenha o vídeo
     * centralizado nessa área. O resultado é som sem imagem. Como o embed é
     * de outro domínio, nenhum CSS daqui alcança para corrigir.
     *
     * O arquivo tem 57 s e 2,3 MB, então servir direto sai barato e funciona
     * em qualquer navegador. O que se perde é a medição de retenção da Vturb,
     * compensada em parte pelos eventos próprios que `VslDoTopo` grava.
     * Quando o player for recriado lá, dá para voltar atrás.
     */
    /*
     * VSL nova (28/09/2026). Arquivo, de novo, e agora com prova de que a causa
     * NÃO era aquele player específico.
     *
     * O Rodger mandou o player novo `6aba636ed76b5fcf417eb9e9`, de outro vídeo,
     * gravado depois. Montado na página com o elemento sozinho e sem filho, do
     * jeito certo, ele mede **270 x 15.188 px (razão 56,25)** e a montagem para
     * no filho `thumbnail`, sem nunca criar o player — número por número o
     * mesmo defeito de 22/09. Dois players diferentes, dois vídeos diferentes,
     * o mesmo 56,25: o problema é da conta/configuração na Vturb, não do vídeo.
     *
     * Enquanto isso não for resolvido lá, o caminho é este: baixar o HLS
     * (`video_1.m3u8`, a faixa boa: 404x720) e servir pela própria página.
     * 1m50, 4,5 MB, remuxado com `-c copy -movflags +faststart`. O pôster sai
     * do próprio vídeo (aos 6 s, onde o número aparece) — a `cover.jpg` oficial
     * do player novo volta byte a byte IGUAL à do player antigo, então ela não
     * serve de capa para este vídeo.
     */
    vsl: {
      aspect: "9 / 16",
      // Caminho principal: o player da Vturb, que é onde a retenção é medida.
      vturb: {
        conta: "3b4a85ca-8939-45e7-ae40-d0be1d6af49b",
        player: "6aba636ed76b5fcf417eb9e9",
      },
      // Reserva, que entra sozinha se o player montar com proporção absurda
      // (ver a nota no `VturbHeroPlayer`): o mesmo vídeo, baixado do HLS da
      // Vturb, 404x720, 1m50. Quando o player for recriado lá com a proporção
      // certa, esta reserva deixa de ser usada sem precisar mexer em nada.
      src: "/vsl/vsl-ecommerce-v2.mp4",
      poster: "/vsl/vsl-capa-v2.jpg",
    },
  },
  cases: {
    eyebrow: "Cases de Sucesso",
    titulo: "Quem já trabalha com a Champion",
    ctaTitulo: "Quer ser o próximo case?",
    ctaSub: "A aplicação leva 2 minutos.",
    // Sem depoimento em vídeo: o vídeo desta página é a VSL do topo.
    mostrarVideo: false,
    // Os dois cases de produto físico abrem a seção: e-commerce no Brasil e
    // nutra. A copy de cada case continua literal (não se reescreve), o que
    // muda é qual prova aparece primeiro para quem vende produto.
    ordem: ["ighor-lopes", "nulle", "arthur-costa", "luis-e-nathan"],
  },
  dor: {
    tituloInicio: "O  Andrômeda mudou o game para quem tem e-com,",
    tituloDestaque: "reconhece algum?",
    sub: "O novo motor de IA do Meta pede mais criativo, mais ângulo e mais persona. Quem não se adaptou está pagando mais caro por venda toda semana.",
    itens: [
      {
        icone: Clock,
        titulo: "Você é o gargalo da loja",
        desc: "Entre fornecedor, estoque e atendimento, criativo é sempre o que fica pra depois. E é ele que segura a escala.",
      },
      {
        icone: XCircle,
        titulo: "Criativo que não vende",
        desc: "Você sobe, roda, espera. Impressão tem, clique tem, venda não. Visualização não paga fornecedor.",
      },
      {
        icone: TrendingUp,
        titulo: "O criativo morre quando você escala",
        desc: "Funciona a R$ 500/dia. Você dobra a verba, o CPA explode e a margem de contribuição some.",
      },
      {
        icone: Target,
        titulo: "Tráfego que não vira venda",
        desc: "Visita tem, clique tem, carrinho tem. Checkout não. Você paga pelo tráfego e a taxa de conversão não sai do lugar.",
      },
      {
        icone: Ban,
        titulo: "ANÚNCIO REPROVADO TODA HORA",
        desc: "Você produz, sobe, e a Meta derruba. Conta restrita, BM travada, anúncio em loop de revisão com o estoque parado.",
      },
      {
        icone: LineChart,
        titulo: "Otimiza no achismo",
        desc: "Você abre o gerenciador e não sabe o que pausar, o que escalar nem qual criativo está queimando a verba do dia.",
      },
      {
        icone: UserX,
        titulo: "O editor sumiu de novo",
        desc: "Freelancer que atrasa, some e volta sem contexto nenhum da sua loja. Cada criativo novo recomeça do zero.",
      },
      {
        icone: Hourglass,
        titulo: "Preso na edição",
        desc: "Seu dia vai em briefing, gravação e revisão de vídeo. Sobra zero tempo pro que faz a loja crescer: produto, margem e recompra.",
      },
      {
        icone: Flame,
        titulo: "CPA alto comendo a margem",
        desc: "A loja fatura mais e sobra menos. Com produto físico, cada real de CPA sai direto da sua margem de contribuição.",
      },
      {
        icone: AlertTriangle,
        titulo: "Refém de um criativo só",
        desc: "Sua escala inteira está apoiada num vencedor. No dia em que ele fadigar, o faturamento da loja cai junto.",
      },
    ],
  },
  metodo: {
    selo: "Método Champion · 4 Pilares",
    tituloInicio: "Como traduzimos o ",
    tituloDestaque: " ANDRÔMEDA",
    tituloFim: " em escala para sua loja.",
    sub: "O novo motor de IA do Meta exige **mais formatos, ângulos e personas**. Nossa esteira foi desenhada para alimentar exatamente isso, toda semana, na conta da sua loja.",
    entradaRotulo: "META IA",
    entradaNome: " ANDRÔMEDA",
    entradaDesc: "pede variedade em escala",
    saidaRotulo: "OUTPUT",
    saidaNome: "ROAS",
    saidaDesc: "escala previsível e\nCPA controlado",
    pilares: [
      {
        n: "01",
        titulo: "Plano de Ação Personalizado",
        subtitulo: "O mapa completo da sua loja antes de qualquer criativo sair",
      },
      {
        n: "02",
        titulo: "Estratégia ANDRÔMEDA",
        subtitulo: "Mesmo produto, múltiplas entradas: é isso que faz a Meta IA escalar.",
      },
      {
        n: "03",
        titulo: "Volume: Esteira Semanal",
        subtitulo: "Um ciclo completo, toda semana. É assim que o criativo da loja nunca fica velho.",
      },
      {
        n: "04",
        titulo: "Comunicação",
        subtitulo: "Você nunca fica no escuro. A operação inteira é transparente.",
      },
    ],
    pilar1: {
      mapa: {
        titulo: "Mapa do produto, da oferta e da loja",
        desc: "Faturamento atual e meta, ticket médio, margem, verba de mídia, quem compra, **por que** compra e o que faz devolver. Sem isso, criativo é tiro no escuro.",
      },
      briefing: {
        titulo: "Briefing cirúrgico de criativos",
        desc: "Classificamos cada criativo que já rodou na sua conta em 4 categorias antes de produzir um único frame novo:",
      },
      categorias: [
        "Validados que estão escalando",
        "Saturados (precisam ser substituídos)",
        "Venderam, mas não escalaram",
        "Não performaram (e por quê)",
      ],
    },
    pilar2: {
      blocos: [
        {
          titulo: "Personas",
          desc: "Quem compra o seu produto não é uma pessoa só. Cada criativo entra por uma fatia diferente: quem compra pra si, quem compra de presente, quem já conhece a categoria e quem nunca usou.",
        },
        {
          titulo: "Formatos",
          desc: "O mesmo produto embalado de várias formas: UGC, unboxing, demonstração de uso, antes e depois, review de cliente e oferta direta.",
        },
        {
          titulo: "Ângulos",
          desc: "Benefício, objeção, comparação com o que ela já tentou, prova de uso. Formas diferentes de vender o mesmo produto para públicos distintos.",
        },
      ],
      rotuloGanchos: "MESMO CORPO · 4 GANCHOS · 4 ROAS DIFERENTES",
      fechoInicio: "Não é sobre fazer ",
      fechoDestaque: "personas",
      fechoFim: ", do jeito certo.",
    },
    pilar3: {
      fechoInicio: "A cada ciclo, mais aprendizado sobre o seu produto e mais ",
      fechoDestaque: "assertividade",
      fechoFim: " nos criativos seguintes.",
    },
    pilar4: {
      cards: [
        {
          titulo: "Calls de checkpoint a cada 2 semanas",
          desc: "Onboarding na 1ª semana e checkpoint nas semanas 3, 5 e 7. Cada ciclo: mais aprendizado, mais refinamento, mais assertividade.",
        },
        {
          titulo: "Acompanhamento direto na operação",
          desc: "Canal direto com a equipe responsável. Você sabe qual criativo está rodando, o que ele fez de ROAS e qual é o próximo passo, sempre.",
        },
      ],
    },
  },
  criativos: {
    titulo: "PORTFÓLIO",
    sub: "Criativos em vídeo produzidos pela Champion e que rodaram em conta de cliente. É a mesma esteira que passa a rodar na sua loja.",
    // O badge de nicho do vídeo (Info, Lowticket, Nutra, Hot) sai nesta
    // versão: é o rótulo interno de outro mercado e, para dono de loja, diz
    // na cara que a página não foi escrita para ele.
    mostrarBadgeNicho: false,
  },
  formulario: { segmentos: MERCADO_OPTIONS_ECOMMERCE },
  ctaIntermediario: {
    texto: "Preencha a aplicação e descubra quantos criativos a sua loja precisa pra sair do platô.",
    rotulo: "Preencher aplicação (2 min)",
  },
  comoFunciona: {
    tituloInicio: "COMO",
    tituloDestaque: "FUNCIONA",
    passos: [
      {
        icone: ClipboardCheck,
        titulo: "Preencha a Aplicação",
        subtitulo: "Aplicação rápida de 2 minutos",
        bullets: [
          "Clique no botão e responda a aplicação",
          "Conte sobre a sua loja: faturamento, verba de mídia e quem faz o criativo hoje",
          "Suas respostas vão direto pro nosso time de especialistas",
        ],
      },
      {
        icone: MessageCircle,
        titulo: "Conversa no WhatsApp",
        subtitulo: "Qualificação + agendamento",
        bullets: [
          "Um especialista entra em contato no seu WhatsApp",
          "Faz algumas perguntas pra entender sua operação a fundo",
          "Agenda o seu Diagnóstico de Criativo, gratuito",
        ],
      },
      {
        icone: Video,
        titulo: "Diagnóstico de Criativo Gratuito",
        subtitulo: "Análise da sua conta · sem custo",
        bullets: [
          "Abrimos os criativos que já rodaram na sua conta e mostramos o que travou cada um",
          "Você sai sabendo quais ângulos ainda não foram testados no seu produto",
          "Só depois disso conversamos sobre um possível próximo passo juntos",
        ],
      },
    ],
  },
  faq: {
    tituloInicio: "PERGUNTAS",
    tituloDestaque: "FREQUENTES",
    sub: "As dúvidas que mais aparecem antes de preencher a aplicação. Respondidas sem rodeio.",
    itens: [
      {
        q: "Meu criativo vende no teste, mas morre quando eu escalo. Vocês resolvem isso?",
        a: "Sim. Esse é exatamente o problema que a gente ataca todos os dias. Criativo que valida em R$50/dia e morre em R$500 não é criativo validado, é coincidência estatística. A nossa metodologia (Gancho + Corpo + Sustentação) nasceu para construir criativos que aguentam orçamento alto sem saturar em 48h. Se um criativo seu não fez no mínimo 2 vendas no teste, ele NÃO validou, e a gente te mostra o porquê.",
      },
      {
        q: "Eu já tenho um editor / uma agência. Por que contratar a Champion?",
        a: "Editor entrega peça, e agência de tráfego entrega gestão de conta. Nenhum dos dois entrega ângulo novo toda semana, que é o que o Andrômeda consome. A gente é o time de criativo da sua loja: mineração de ângulo, roteiro, produção, teste e iteração. Vários clientes nossos mantêm o editor tocando o operacional e usam a Champion para o criativo que sustenta a escala.",
      },
      {
        q: "Em quanto tempo eu vejo resultado?",
        a: "Os primeiros criativos sobem em até 7 dias após o onboarding. A leitura real de performance acontece entre 14 e 30 dias, porque é o tempo necessário para validar com volume de spend, não com achismo. Quem promete resultado em 48h está vendendo sorte, não método.",
      },
      {
        q: "Funciona pra qualquer tipo de e-commerce? (marca própria, dropship, nutra, moda, casa, pet…)",
        a: "Funciona para loja que vende produto físico com tráfego pago próprio, seja marca própria em Shopify ou Nuvemshop, dropship, nutra, moda, casa ou pet. O que a gente não atende é quem vende só dentro de marketplace, porque ali não existe criativo em vídeo pra rodar. O método é o mesmo porque a dor é a mesma em todos: criativo é o gargalo da escala. Muda o produto, não o problema.",
      },
      {
        q: "Qual o investimento? Cabe no meu orçamento?",
        a: "A Assessoria Champion é feita para loja que já fatura no mínimo R$ 50 mil/mês, porque abaixo disso o gargalo raramente é criativo: é produto, oferta ou verba. O valor exato é apresentado no diagnóstico, depois que a gente entende o seu cenário.",
      },
      {
        q: "Eu não tenho estúdio, ator nem produto pra enviar. Vocês produzem mesmo assim?",
        a: "Sim. A gente cuida da estratégia, roteiro, direção e produção. Trabalhamos com o material que a sua operação já tem (foto de produto, vídeo de fornecedor, UGC de cliente) e produzimos o que faltar. Você não precisa montar estúdio, contratar editor nem aparecer na frente da câmera. Entregamos os criativos prontos pra subir.",
      },
      {
        q: "Como vocês garantem que o criativo vai performar?",
        a: "A gente NÃO garante performance, quem garante mente. O que garantimos é metodologia, processo e iteração rápida. Cada criativo passa por uma matriz de validação antes de ir pro ar, e refazemos rapidamente o que não bate o benchmark. Performance é consequência de método, e é assim que escalamos contas de R$30k pra R$300k/mês.",
      },
      {
        q: "Qual a diferença entre a Sprint e a Assessoria Completa?",
        a: "A Sprint é uma imersão pontual de criativos para resolver um gargalo específico (o lançamento de um produto novo, a escala de um campeão que travou). A Assessoria é a parceria contínua, com produção semanal, leitura de performance e ajuste de rota, pra quem quer estabilidade de escala mês após mês. No diagnóstico a gente recomenda o formato certo pro seu momento.",
      },
      {
        q: "Por que eu tenho que preencher uma aplicação antes de falar com vocês?",
        a: "Porque a gente não atende todo mundo. A aplicação filtra quem realmente tem fit com a Champion (faturamento, verba de mídia, momento da loja) e prepara a conversa para ser objetiva, sem perder seu tempo nem o nosso. Se você não tem fit, a gente fala na hora e indica o caminho certo.",
      },
      {
        q: "E se eu não gostar dos criativos?",
        a: "Tem ciclo de revisão estruturado em todos os formatos. Mas a verdade é que a maioria das fricções acontece quando o cliente quer 'criativo bonito' e a gente entrega 'criativo que vende'. No onboarding alinhamos expectativa: a régua aqui é ROAS, não estética.",
      },
    ],
  },
  ctaFinal: {
    tituloInicio: "PREENCHA A APLICAÇÃO E RECEBA O",
    tituloDestaque: "DIAGNÓSTICO DE CRIATIVO DA SUA LOJA",
    sub: "Em 2 minutos a gente entende a sua loja e agenda o diagnóstico de criativo, gratuito.",
    passos: [
      "Preencha a aplicação (1–2 min)",
      "Análise da sua conta (hoje)",
      "Especialista te chama",
      "Plano de criativos + próximos passos",
    ],
    rotulo: "Quero o diagnóstico da minha loja",
  },
};

/*
 * GERAL + VSL. A VSL é a mesma da versão e-commerce (player da Vturb com a
 * reserva em arquivo, ver a nota longa lá em cima). Em 29/09/2026 o Rodger
 * pediu a página exatamente como está no ar, com a VSL como única diferença;
 * no mesmo dia pediu os cases SEM vídeo, mantendo a bio. São as duas únicas
 * diferenças para a produção.
 */
const GERAL_VSL: CopyNicho = {
  ...GERAL,
  hero: { ...GERAL.hero, vsl: ECOMMERCE.hero.vsl },
  cases: { ...GERAL.cases, mostrarVideo: false },
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  PROVA (28/09/2026) — a copy geral carregada de prova.                     */
/*                                                                            */
/*  Origem: docs/copy/lp-hd3-prova-v1.md (Lápis, squad de copy) sobre a      */
/*  pilha de provas (cap. 5 das 18 provas) e a estrutura invisível de 7 LPs   */
/*  do gênero. Regras que atravessam tudo: cada promessa recebe o recibo na   */
/*  hora; número sem recorte não prova; nada inventado.                       */
/*                                                                            */
/*  O que ficou de fora de propósito, porque depende de resposta do Rodger    */
/*  (a lista [CONFIRMAR] do documento): horas até o Miguel chamar, duração e  */
/*  condutor da call, regra do contrato depois do primeiro mês, formas de     */
/*  pagamento, sobrenome e foto do Miguel, recorte dos números do topo. Onde  */
/*  o número não existia, entrou o que já era verdade sem recorte; onde a     */
/*  promessa dependia do número, a frase saiu inteira. Chute derruba o bloco. */
/* ────────────────────────────────────────────────────────────────────────── */
const PROVA: CopyNicho = {
  ...GERAL_VSL,
  hero: {
    ...GERAL_VSL.hero,
    // Piso de R$ 10 mil: é o da FAQ e o do quiz, que manda quem declara menos
    // para a Sprint. R$ 50 mil (o começo do ICP) fica como decisão do Rodger;
    // mudar aqui sem mudar a FAQ e o quiz cria contradição na própria página.
    preHeadline:
      "Para operações de infoproduto, nutra, e-commerce e X1 que faturam acima de R$ 10 mil/mês com tráfego pago",
    subheadline:
      "Somos o time de criativo terceirizado de operações de infoproduto, nutra, e-commerce e X1 que já faturam de R$ 10 mil a múltiplos 7 dígitos por mês, no Brasil e na gringa.",
    provasRotulo: "Pessoas mentem, números não.",
    provas: [
      { icone: Users, valor: "+ de 1.100", rotulo: "operações atendidas" },
      { icone: Sparkles, valor: "+ de 8.000", rotulo: "criativos produzidos" },
      // O 3,7x saiu: ainda não tem confirmação de ser ROI ou ROAS, nem período,
      // nem base (nota de 24/09 na versão e-commerce). Entra o número de
      // operação que o leitor não precisa acreditar, só conferir.
      { icone: CalendarClock, valor: "+ de 3 anos", rotulo: "de mercado, só com criativo" },
    ],
    // Um gatilho só na página inteira (Crivo, 28/09): "entrega abaixo do
    // combinado", nunca "se não valeu". Dois gatilhos são dois contratos.
    seloGarantia: "Primeiro mês: se a entrega ficou abaixo do combinado, você decide quanto paga.",
  },
  cases: {
    eyebrow: "Cases, com perfil pra conferir",
    titulo: "Quatro operações, quatro números, e o @ de cada uma pra você checar",
    ctaTitulo: "Quer ser o próximo da lista?",
    ctaSub: "A aplicação leva 2 minutos, e o Miguel te chama depois.",
    mostrarVideo: false,
    // Abre com os dois que têm número e prazo na frase.
    ordem: ["nulle", "arthur-costa", "luis-e-nathan", "ighor-lopes"],
  },
  garantia: {
    nome: "Primeiro Mês Na Sua Mão",
    titulo: "O preço é fixo. Quanto vale o primeiro mês, quem diz é você.",
    corpo: [
      "Você sabe o valor antes de assinar. Não muda no meio.",
      "No fim dos primeiros 30 dias de entrega, se a esteira ficou abaixo do combinado, você diz onde ficou e decide quanto paga daquele mês: de 10% a 100%. Sem aprovação nossa, sem discussão, sem a gente tentar te convencer.",
      "Isso não é garantia de ROAS. A gente não garante performance, quem garante mente. É garantia sobre a entrega: briefing respondido, material na mão, criativos subindo na sua conta toda semana. Quem julga se rodou do jeito combinado é você, não a gente.",
      "Gente que hoje é cliente nos contou, na call de venda, que já tinha ficado \"preso lá com custo alto sem uma prestação boa de serviço\" em outro contrato. Foi por causa disso que a regra existe.",
      "No primeiro mês, o risco de ter escolhido errado é nosso. Depois dele, você continua porque quer, não porque assinou.",
    ],
  },
  dor: {
    // Sem o Andrômeda no título (Crivo, 28/09): as cinco dores das calls são
    // do operador, não do motor da Meta. Pôr o motor no título quebrava a
    // cadeia A→B→C entre a dor e o método.
    tituloInicio: "CINCO MARCAS DE QUEM ESCALA COM META ADS.",
    tituloDestaque: "VEJA SE ALGUMA É SUA.",
    sub: "As cinco vieram de call de venda, na fala de quem sentou com a gente. Se você se reconhecer em três, a call de diagnóstico vale o seu tempo. Se não se reconhecer em nenhuma, a gente provavelmente não é pra você agora.",
    itens: [
      {
        icone: Clock,
        titulo: "Você é o criativo da empresa",
        desc: "Copy, roteiro, edição, página: tudo passa por você. \"Passo o dia quase todo pra editar dois, três criativos\", e o dia acaba antes do resto.",
      },
      {
        icone: Target,
        titulo: "Testa 5 quando precisa de 10",
        desc: "Você sabe que a régua é 10 criativos por semana e sobe 2, 3, 5. \"Não consigo testar a quantidade de oferta que eu minero fazendo tudo sozinho.\"",
      },
      {
        icone: UserX,
        titulo: "Já delegou, e voltou pra você",
        desc: "Editor, freela, agência: \"cada um entrega de uma forma\", nenhum do jeito que converte. \"No final das contas, eu acabo tendo que fazer do mesmo jeito.\"",
      },
      {
        icone: AlertTriangle,
        titulo: "Um produto, dois criativos, tudo",
        desc: "\"80% desse faturamento está baseado em um produto só que eu escalei.\" Se o criativo fadiga, a operação inteira vai junto. E ninguém te avisa disso.",
      },
      {
        icone: Sparkles,
        titulo: "O criativo que roda não é seu",
        desc: "Você pegou do TikTok, do concorrente, do grupo de afiliado, e fez \"uma variaçãozinha\". Modelar validou a oferta; não construiu um estoque que é seu.",
      },
    ],
  },
  metodo: {
    ...GERAL_VSL.metodo,
    sub: "O novo motor de IA do Meta exige **mais formatos, ângulos e personas**. Quem tenta alimentar isso sozinho testa 5 por semana quando a régua é 10. A esteira foi desenhada para fechar essa conta.",
    pilar4: {
      cards: [
        GERAL_VSL.metodo.pilar4.cards[0],
        {
          titulo: "Acompanhamento direto na operação",
          desc: "Canal direto com a equipe responsável. Você sabe o que está acontecendo, o porquê, e o próximo passo. Sempre.",
        },
      ],
    },
  },
  criativos: {
    titulo: "PORTFÓLIO",
    sub: "Isto não é galeria. São criativos em vídeo reais, feitos pela Champion para campanhas de performance, pela mesma esteira que passa a rodar na sua operação. É o produto, funcionando.",
    mostrarBadgeNicho: true,
  },
  ctaIntermediario: {
    texto: "Preencha a aplicação e descubra, antes de qualquer conversa de preço, se a sua operação está pronta pra uma esteira semanal de criativo.",
    rotulo: "Preencher aplicação (2 min)",
  },
  quemAtende: {
    nome: "Miguel",
    cargo: "SDR da Champion, o único primeiro contato que existe",
    linhas: [
      "Quem te chama é o Miguel. Não tem robô, não tem fila de atendente, não tem \"um especialista\": é ele, e ele lê a sua aplicação antes de mandar a primeira mensagem.",
      "No WhatsApp ele faz as perguntas que a aplicação não cobre (momento da operação, verba, o gargalo de hoje) e diz na hora se existe fit. Se não existir, você ouve isso dele e leva a indicação do caminho certo.",
      "Se existir, ele marca o diagnóstico: a sua conta aberta na tela, os criativos que já rodaram e o que travou cada um. Você sai com clareza dos próximos passos pra escalar, feche ou não feche com a gente.",
    ],
  },
  comoFunciona: {
    tituloInicio: "COMO",
    tituloDestaque: "FUNCIONA",
    passos: [
      {
        icone: ClipboardCheck,
        titulo: "Preencha a Aplicação",
        subtitulo: "2 minutos, do celular",
        bullets: [
          "Clique no botão e responda a aplicação",
          "Faturamento, mercado, verba de mídia e quem faz o seu criativo hoje",
          "A resposta cai no WhatsApp do Miguel, não numa fila de robô",
        ],
      },
      {
        icone: MessageCircle,
        titulo: "O Miguel te chama",
        subtitulo: "Qualificação + agendamento",
        bullets: [
          "Miguel, SDR da Champion, lê a sua aplicação antes de mandar a primeira mensagem",
          "Faz as perguntas que faltam pra saber se existe fit: momento, verba, gargalo",
          "Se tiver fit, marca o diagnóstico. Se não tiver, fala na hora e indica o caminho",
        ],
      },
      {
        icone: Video,
        titulo: "Diagnóstico de Criativo Gratuito",
        subtitulo: "A sua conta aberta na tela · sem custo",
        bullets: [
          "Abrimos os criativos que já rodaram na sua conta e mostramos o que travou cada um",
          "Você sai com clareza dos próximos passos pra escalar, feche ou não feche com a gente",
          "Preço, formato e a garantia do primeiro mês só entram depois disso",
        ],
      },
    ],
  },
  faq: {
    tituloInicio: "PERGUNTAS",
    tituloDestaque: "FREQUENTES",
    sub: "As dúvidas que mais aparecem antes de preencher a aplicação, e as que aparecem antes da call. Respondidas sem rodeio.",
    itens: [
      {
        q: "Meu criativo performa no teste, mas morre quando escalo. Vocês resolvem isso?",
        a: "Sim. Esse é exatamente o problema que a gente ataca todos os dias. Criativo que valida em R$ 50/dia e morre em R$ 500 não é criativo validado, é coincidência estatística. Um cliente nosso resumiu antes de fechar: \"ele sempre vende, só que ele é ruim de escala. Você bota o orçamento e ele não vai.\" A metodologia (Gancho + Corpo + Sustentação) nasceu para construir criativo que aguenta orçamento alto sem saturar em 48h. Se um criativo seu não fez no mínimo 2 vendas no teste, ele NÃO validou, e a gente te mostra o porquê.",
      },
      {
        q: "Eu já tenho um editor, um time interno ou uma agência. Por que contratar a Champion?",
        a: "Editor entrega peça. Agência de tráfego entrega gestão de conta. Nenhum dos dois entrega ângulo novo toda semana, que é o que o Andrômeda consome. Um lead nos disse na call: \"o cara faz tudo, mas não faz nada.\" A gente faz uma coisa: criativo de escala, da mineração do ângulo à iteração depois que rodou. Vários clientes nossos mantêm o editor tocando o operacional e usam a Champion para o criativo que sustenta a conta. A gente não compete com o seu time, entrega o ativo que falta nele.",
      },
      {
        q: "Em quanto tempo eu vejo resultado?",
        a: "Os primeiros criativos sobem em até 7 dias após o onboarding. A leitura real de performance acontece entre 14 e 30 dias, porque é o tempo necessário para validar com volume de spend, não com achismo. Dois exemplos com perfil pra conferir na seção de cases: a Nulle saiu de 80k mês pra 200k mês em 30 dias; o Arthur fez +250k em pouco mais de 1 mês. Quem promete resultado em 48h está vendendo sorte, não método.",
      },
      {
        q: "Funciona pro meu nicho? (Infoproduto, e-commerce, low ticket, high ticket, SaaS, afiliado…)",
        a: "Sim. A gente já rodou criativo de escala em infoproduto (de R$ 97 a R$ 15 mil), e-commerce, nutra, SaaS, igaming, serviço local, agência B2B e afiliado. O método é agnóstico de nicho porque ataca o que TODO criativo precisa pra escalar: gancho que para o scroll, corpo que sustenta atenção e CTA que converte sem fricção. O que muda de nicho pra nicho é o mapa que a gente faz na primeira semana: oferta, produto, persona e como você vende. Sem esse mapa, criativo é tiro no escuro, em qualquer nicho.",
      },
      {
        q: "Qual o investimento? Cabe no meu orçamento?",
        a: "A Assessoria Champion é feita para quem já fatura no mínimo R$ 10 mil/mês com tráfego pago, porque abaixo disso o problema raramente é criativo, é oferta. O valor exato é apresentado no diagnóstico, depois que a gente entende o seu cenário, e é fixo: não muda no meio. No primeiro mês vale a regra Primeiro Mês Na Sua Mão, então o risco de ter escolhido errado é nosso.",
      },
      {
        q: "Eu não tenho equipe de filmagem nem ator. Vocês produzem o criativo?",
        a: "Sim. A gente cuida da estratégia, roteiro, direção e produção. Você não precisa montar estúdio, contratar editor nem aparecer na frente da câmera, a não ser que faça sentido pro seu posicionamento. O Arthur chegou na gente dizendo que não tinha mais tempo de fazer criativo e decidiu largar na nossa mão. Entregamos os criativos prontos pra subir.",
      },
      {
        q: "Como vocês garantem que o criativo vai performar?",
        a: "A gente NÃO garante performance, quem garante mente. O que garantimos é metodologia, processo e iteração rápida: cada criativo passa por uma matriz de validação antes de ir pro ar, e refazemos rapidamente o que não bate o benchmark. Performance é consequência de método. É assim que a Nulle saiu de 80k mês pra 200k mês em 30 dias, com número e perfil lá em cima pra você conferir. E é por isso que a garantia que a gente dá é sobre a entrega, não sobre o ROAS: no primeiro mês, se a esteira ficou abaixo do combinado, você diz onde ficou e decide quanto paga.",
      },
      {
        q: "Qual a diferença entre a Sprint e a Assessoria Completa?",
        a: "A Sprint é uma imersão pontual de criativos para resolver um gargalo específico (um lançamento, a escala de uma oferta que travou). A Assessoria é a parceria contínua, com produção semanal de criativos, leitura de performance e ajuste de rota, pra quem quer estabilidade de escala mês após mês. No diagnóstico a gente recomenda o formato certo pro seu momento, e diz se o certo é nenhum dos dois ainda.",
      },
      {
        q: "Por que eu tenho que preencher uma aplicação antes de falar com vocês?",
        a: "Porque a gente não atende todo mundo, e porque o Miguel lê a sua aplicação antes de te chamar. A aplicação filtra quem tem fit com a Champion (faturamento, mercado, momento) e prepara a conversa para ser objetiva, sem perder o seu tempo nem o nosso. Se você não tem fit, a gente fala na hora e indica o caminho certo. Ninguém tenta fechar nada nessa primeira conversa.",
      },
      {
        q: "E se eu não gostar dos criativos?",
        a: "Tem ciclo de revisão estruturado em todos os formatos, e no onboarding a gente mapeia \"o jeito que a gente gosta\" da sua operação antes de produzir um frame. Mas a verdade é que a maioria das fricções acontece quando o cliente quer criativo bonito e a gente entrega criativo que vende. A régua aqui é performance, não estética. E se no fim do primeiro mês a entrega ficou abaixo do combinado, vale a regra Primeiro Mês Na Sua Mão: você diz onde ficou e decide quanto paga.",
      },
      {
        q: "E se eu fechar e no primeiro mês a entrega ficar abaixo do combinado?",
        a: "Você decide quanto paga. É a regra Primeiro Mês Na Sua Mão: o preço é fixo e você conhece antes de assinar, mas no fim dos primeiros 30 dias de entrega, se a esteira ficou abaixo do combinado, você diz onde ficou e decide quanto paga daquele mês, de 10% a 100%, sem aprovação nossa. A gente ouve muito \"já passei por muitos serviços assim, eu sou meio ressabiado\", e a resposta pra isso não é discurso, é tirar o risco do seu lado no mês em que você ainda não tem como saber.",
      },
      {
        q: "Quem conduz a call? É vendedor?",
        a: "O primeiro contato é o Miguel, SDR da Champion, no WhatsApp: ele qualifica e agenda. A call de diagnóstico não é call de apresentação de slides: é a sua conta aberta na tela, os criativos que já rodaram e o que travou cada um. Preço só entra no fim, e só se fizer sentido pros dois lados.",
      },
      {
        q: "Como eu me preparo pra call?",
        a: "Três coisas: acesso ao Gerenciador de Anúncios da sua conta (ou prints dos últimos 90 dias), os criativos que rodaram nesse período, e os números que você olha todo dia: pedidos ou vendas por mês, verba de mídia e o CPA que você aceita. Não precisa montar apresentação. Quanto mais real for o que você trouxer, mais específico é o mapa que você leva embora, feche ou não feche.",
      },
      {
        q: "Posso trazer meu sócio ou meu gestor de tráfego?",
        a: "Pode, e a gente prefere. Quem decide junto tem que ouvir junto, senão a call vira relato de segunda mão. A Nulle veio em dois, o Artur e o Alexandre, e é um dos cases lá em cima. Se o seu gestor de tráfego é quem mexe na conta, ele vê coisa na call que você não vê.",
      },
    ],
  },
  ctaFinal: {
    tituloInicio: "A CHAMPION NÃO É PRA TODO MUNDO.",
    tituloDestaque: "DESCUBRA SE É PRA VOCÊ.",
    sub: "A aplicação leva 2 minutos e filtra dos dois lados: você descobre se a gente resolve o seu gargalo, a gente descobre se a sua operação tem o porte que a esteira pede. Quem passa, o Miguel chama. Quem não passa, ouve isso na hora e leva a indicação do caminho certo.",
    passos: [
      "Aplicação (2 min)",
      "Leitura da sua operação (hoje)",
      "O Miguel te chama",
      "Diagnóstico. Só depois, a proposta",
    ],
    rotulo: "Quero saber se minha operação está pronta",
  },
};

export const COPY_POR_NICHO: Record<Nicho, CopyNicho> = {
  geral: GERAL,
  ecommerce: ECOMMERCE,
  "geral-vsl": GERAL_VSL,
  prova: PROVA,
};

/**
 * O nicho vive num contexto porque as seções são componentes irmãos, sem
 * hierarquia entre si: passar copy por prop obrigaria cada seção a repassar o
 * que não usa, e é assim que texto começa a divergir de novo.
 */
export const NichoContext = createContext<Nicho>("geral");

export function useNicho(): Nicho {
  return useContext(NichoContext);
}

export function useCopyNicho(): CopyNicho {
  return COPY_POR_NICHO[useContext(NichoContext)];
}
