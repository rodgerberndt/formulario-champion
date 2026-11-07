import { Sparkles } from "lucide-react";
import { ShimmerText, KeywordGlow } from "@/components/landing/TextEffects";
import { HeroLeadForm } from "@/components/landing/HeroLeadForm";
import { useReveal } from "@/hooks/useReveal";
import { useEffect, useRef, useState } from "react";
import { useTracking } from "@/hooks/useTracking";
import type { Json } from "@/integrations/supabase/types";
import { HEADLINE_VARIANTS, type HeadlineVariant } from "@/config/headlineVariants";
import { type SubheadlineVariant } from "@/config/subheadlineVariants";
import { useCopyNicho } from "@/config/nichoLanding";

/**
 * VSL do topo.
 *
 * Vídeo servido pela própria página, e não pelo player da Vturb. A troca foi
 * medida, não preferência: o player daquele vídeo monta com razão 56,25 no
 * lugar de 1,78, e o defeito atravessa o `embed.html` em iframe (22.500 px de
 * altura numa janela de 333 px), desenhando o vídeo centralizado fora da área
 * visível. Dava som sem imagem, e sendo outro domínio, nenhum CSS daqui
 * alcança para corrigir.
 *
 * O que este componente recupera do que se perdeu: os eventos de audiência.
 * Grava `vsl_play` e os quartos assistidos, que é o que responde "até onde a
 * pessoa assistiu" no admin.
 */
function VslDoTopo({ src, poster, aspect }: { src: string; poster?: string; aspect: string }) {
  const { trackEvent } = useTracking();
  const marcosVistos = useRef<Set<number>>(new Set());

  const aoTocar = () => {
    trackEvent("vsl_play", { metadata: { src } as Json }).catch(() => { /* ignore */ });
  };

  /**
   * Quartos assistidos, cada um contado UMA vez.
   *
   * O `Set` é o que impede a enxurrada: `timeupdate` dispara umas quatro vezes
   * por segundo, e sem ele o mesmo marco viraria dezenas de eventos e o número
   * de retenção no admin ficaria sem sentido. Rebobinar também não reconta.
   */
  const aoAvancar = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (!v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    for (const marco of [25, 50, 75, 95]) {
      if (pct >= marco && !marcosVistos.current.has(marco)) {
        marcosVistos.current.add(marco);
        trackEvent("vsl_progresso", { metadata: { marco, src } as Json }).catch(() => { /* ignore */ });
      }
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-secondary/25 bg-black"
      style={{ aspectRatio: aspect }}
    >
      {/*
        `preload="metadata"` e não `auto`: o topo já disputa banda com a fonte,
        o formulário e o pixel, e 97,6% dos leads chegam pelo celular. Metadata
        traz só o suficiente para a barra de tempo existir; os 2,3 MB começam a
        baixar quando a pessoa aperta o play. O `faststart` do arquivo faz ele
        tocar antes de terminar o download.
      */}
      <video
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full"
        onPlay={aoTocar}
        onTimeUpdate={aoAvancar}
      />
    </div>
  );
}

/** Conta ConverteAI da Champion, a mesma do carrossel de criativos e dos cases. */
const VTURB_ACCOUNT = "3b4a85ca-8939-45e7-ae40-d0be1d6af49b";

/**
 * VSL do topo pelo player da Vturb.
 *
 * Este componente é, de propósito, uma cópia do jeito que o carrossel de
 * criativos monta os players (`VturbCreatives`), que é o que funciona nesta
 * página. Três detalhes vêm de lá e não são enfeite:
 *
 * 1. o elemento fica em FLUXO (`block w-full`), nunca `absolute inset-0`:
 *    solto dentro de uma caixa com `aspect-ratio`, ele mede a caixa de fora e
 *    não a si mesmo;
 * 2. a reserva de 9/16 sai pela ALTURA MEDIDA (ResizeObserver, acima de 40 px),
 *    e não por evento do script: entre o `onload` e o player pintar existe um
 *    intervalo, e soltar a reserva nele faz o bloco colapsar;
 * 3. o elemento entra vazio, sem o `vturb-player-placeholder` do snippet
 *    oficial: o script injeta o dele e dois placeholders duplicam a altura.
 */
function VturbHeroPlayer({
  conta = VTURB_ACCOUNT,
  player,
  aspect,
  aoFalhar,
}: { conta?: string; player: string; aspect: string; aoFalhar?: () => void }) {
  const playerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [temAlturaPropria, setTemAlturaPropria] = useState(false);

  /**
   * Rede de segurança para player com proporção corrompida na Vturb.
   *
   * O player da VSL veio com `playerInit.aspectRatio: 5625` no lugar de 177.78,
   * cem vezes o valor certo, e aplica isso como `padding: 5625%`: 270 px de
   * largura viram 15.188 px de altura, e a montagem para na capa sem nunca
   * criar o player. Medido na mesma página, no mesmo componente, contra dois
   * players sadios da mesma conta (razões 1,25 e 1,78) — ou seja, é do player,
   * não daqui, e nenhum CSS de fora conserta (forçar o padding certo não muda
   * a altura nem faz ele montar).
   *
   * Qualquer razão acima de 5 é absurda para vídeo, então serve de gatilho: o
   * Hero cai para o arquivo servido pela própria página. Quando o player for
   * recriado com a proporção certa lá na Vturb, isto nunca dispara e o player
   * volta a ser o caminho, sem mexer no código.
   */
  useEffect(() => {
    if (!aoFalhar) return;
    const t = setTimeout(() => {
      const el = playerRef.current?.querySelector("vturb-smartplayer") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height / r.width > 5) aoFalhar();
    }, 4000);
    return () => clearTimeout(t);
  }, [aoFalhar]);

  useEffect(() => {
    const alvo = playerRef.current;
    if (!alvo || temAlturaPropria) return;
    const obs = new ResizeObserver(() => {
      const el = alvo.querySelector("vturb-smartplayer") as HTMLElement | null;
      if (el && el.offsetHeight > 40) {
        setTemAlturaPropria(true);
        obs.disconnect();
      }
    });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [temAlturaPropria]);

  useEffect(() => {
    const src = `https://scripts.converteai.net/${conta}/players/${player}/v4/player.js`;
    if (document.querySelector(`script[src="${src}"]`)) {
      setScriptLoaded(true);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => setScriptLoaded(true);
    document.head.appendChild(s);
  }, [conta, player]);

  return (
    <div
      ref={playerRef}
      className="relative w-full overflow-hidden rounded-xl border border-secondary/25 bg-black/40"
      style={temAlturaPropria ? undefined : { aspectRatio: aspect }}
    >
      {/* @ts-expect-error elemento customizado da Vturb */}
      <vturb-smartplayer id={`vid-${player}`} class="block w-full" style={{ display: "block" }} />
      {!scriptLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-secondary/30 border-t-secondary animate-spin" />
        </div>
      )}
    </div>
  );
}

interface HeroProps {
  /** Variante de headline do teste A/B. Sem isso, cai na original. */
  variant?: HeadlineVariant;
  /** Variante de subheadline. Sem isso, mostra a subheadline padrão. */
  subheadline?: SubheadlineVariant;
}

/**
 * Topo da landing.
 *
 * Desde 17/09/2026 o topo é headline + formulário curto numa tela só (formato
 * V4/Alpha): no desktop, texto à esquerda e o card "Fale com a gente" à
 * direita; no mobile, headline em cima e o formulário logo abaixo. As provas
 * rápidas (clientes, criativos, ROI) vêm DEPOIS do formulário no mobile para
 * não empurrá-lo para baixo, e ficam sob a headline no desktop.
 */
export function Hero({
  variant,
  subheadline
}: HeroProps) {
  const { ref: sectionRef, isVisible } = useReveal();
  const copy = useCopyNicho();
  // Vira true quando o player da Vturb monta com proporção absurda; ver a nota
  // no `VturbHeroPlayer`. Só tem efeito se a VSL também tiver arquivo.
  const [vturbFalhou, setVturbFalhou] = useState(false);
  // A headline do nicho vence a da variante de path quando existe: é o mesmo
  // argumento da HD3, dito para o mercado com quem a página fala.
  const headline = copy.hero.headline ?? variant ?? HEADLINE_VARIANTS[0];
  // O tamanho acompanha o comprimento pra todas as variantes ocuparem o mesmo
  // espaço visual. No mobile é menor que antes: o formulário precisa aparecer
  // logo abaixo da headline sem muita rolagem.
  const headlineLength =
    headline.lead.length + (headline.highlight?.length ?? 0) + (headline.tail?.length ?? 0);
  const headlineSize =
    headlineLength > 110
      ? "text-[1.6rem] md:text-3xl lg:text-4xl"
      : headlineLength > 60
        ? "text-[1.9rem] md:text-4xl lg:text-5xl"
        : "text-[2.1rem] md:text-5xl lg:text-6xl";
  return <section ref={sectionRef} className="lg:min-h-[92vh] flex items-center justify-center pt-20 md:pt-28 lg:pt-24 pb-8 md:pb-12 relative overflow-hidden">
      {/* Simplified Background - Remove heavy effects on mobile */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow top-1/4 left-1/2 -translate-x-1/2" />
        <div className="hidden md:block absolute top-20 right-10 w-32 h-32 bg-secondary/8 rounded-full blur-2xl" />
        <div className="hidden md:block absolute bottom-40 left-10 w-24 h-24 bg-secondary/6 rounded-full blur-2xl" />
      </div>

      <div className="container mx-auto px-5 relative z-10 max-w-6xl">
        <div className="grid max-w-xl mx-auto lg:max-w-none lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-x-12 xl:gap-x-16 gap-y-6 lg:items-center">
          {/* Headline + subheadline.

              Com vídeo no topo, este bloco atravessa as DUAS colunas no
              desktop: headline e subheadline ficam largas e legíveis em cima, e
              a linha de baixo fica com o vídeo e o formulário lado a lado. Sem
              vídeo, o layout continua exatamente como era — texto à esquerda,
              formulário à direita — para as outras variantes não mudarem. */}
          <div
            className={
              "text-center lg:row-start-1 " +
              (copy.hero.vsl
                ? "lg:col-span-2 max-w-3xl mx-auto"
                : "lg:text-left lg:col-start-1 lg:self-end")
            }
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/12 border border-secondary/25 mb-4 md:mb-5">
              <Sparkles className="w-3.5 h-3.5 text-secondary" />
              <span className="text-xs text-secondary font-medium">
                {copy.hero.badge}
              </span>
            </div>

            {/* Pré-headline: o qualificador de nicho e piso, quando o nicho
                traz. Vem ANTES da headline porque é o "é pra você" do gênero,
                e o leitor decide em um segundo se a página fala com ele. */}
            {copy.hero.preHeadline && (
              <p className="rotulo-micro text-secondary/90 mb-3 max-w-2xl mx-auto">
                {copy.hero.preHeadline}
              </p>
            )}

            {/* Headline */}
            {/* Texto corrido, sem efeito palavra a palavra: o shimmer pintava
                palavras soltas, comia o espaço antes do destaque e quebrava a
                frase em blocos no celular. Só o destaque leva o dourado. */}
            <h1
              className={`font-medium text-foreground mb-3 md:mb-4 leading-[1.08] tracking-tight [text-wrap:balance] ${headlineSize}`}
            >
              {headline.lead.trimEnd()}{" "}
              {headline.highlight && (
                <span className="text-secondary">{headline.highlight.trim()}</span>
              )}
              {headline.tail && <> {headline.tail.trim()}</>}
            </h1>
            {headline.attribution && (
              <p className="text-xs md:text-sm text-secondary/90 font-medium mb-3 max-w-md mx-auto lg:mx-0">
                {headline.attribution}
              </p>
            )}

            {/* Subheadline — no teste, o bloco inteiro é a variante. SH0 não
                renderiza nada de propósito: a ausência é uma das hipóteses.

                Ela vem logo depois da headline, e não depois do vídeo: headline
                e subheadline são o par que explica a oferta, e separá-las pelo
                vídeo fazia a segunda só aparecer depois de uma tela de rolagem
                (pedido do Rodger em 28/09). */}
            {!subheadline && (
              <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-md mx-auto lg:mx-0">
                {copy.hero.subheadline}
              </p>
            )}
            {subheadline?.kind === "text" && (
              <div className="max-w-md mx-auto lg:mx-0">
                <p className="text-sm md:text-base lg:text-lg text-muted-foreground">{subheadline.text}</p>
                {subheadline.attribution && (
                  <p className="text-xs text-secondary/90 font-medium mt-2">{subheadline.attribution}</p>
                )}
              </div>
            )}
            {subheadline?.kind === "video" && (subheadline.vturbPlayerId || subheadline.videoUrl) && (
              <div className="max-w-sm mx-auto lg:mx-0">
                {subheadline.vturbPlayerId ? (
                  <VturbHeroPlayer
                    player={subheadline.vturbPlayerId}
                    aspect={subheadline.videoAspect || "9 / 16"}
                  />
                ) : (
                  <div
                    className="relative w-full overflow-hidden rounded-xl border border-secondary/25 bg-black/40"
                    style={{ aspectRatio: subheadline.videoAspect || "16 / 9" }}
                  >
                    <iframe
                      src={subheadline.videoUrl}
                      title="Depoimento de cliente"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                      loading="lazy"
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                )}
                {subheadline.attribution && (
                  <p className="text-xs text-secondary/90 font-medium mt-2">{subheadline.attribution}</p>
                )}
              </div>
            )}
          </div>

          {/* VSL do topo.

              No celular ela ocupa a largura inteira da coluna, encostando nas
              laterais, que é como o Rodger pediu em 28/09. O custo disso é
              conhecido e aceito: 9:16 em ~350 px de largura dá ~620 px de
              altura, então o formulário sai da primeira tela e passa a exigir
              uma rolagem.

              No desktop o freio é a ALTURA, não a largura: a coluna tem uns
              600 px, e largura cheia daria mais de mil px de altura. Por isso o
              teto de 22rem aqui, que deixa o vídeo do tamanho do formulário ao
              lado.

              O `justify-self-end` junta o vídeo ao formulário no meio da tela.
              Sem isso os dois iam para as pontas das colunas e sobrava um
              rombo no meio, que foi o que o Rodger chamou de feio no PC. */}
          {copy.hero.vsl && (
            <div className="w-full max-w-full lg:max-w-[22rem] mx-auto lg:mx-0 lg:col-start-1 lg:row-start-2 lg:justify-self-end">
              {copy.hero.vsl.vturb && !vturbFalhou ? (
                <VturbHeroPlayer
                  conta={copy.hero.vsl.vturb.conta}
                  player={copy.hero.vsl.vturb.player}
                  aspect={copy.hero.vsl.aspect || "9 / 16"}
                  aoFalhar={copy.hero.vsl.src ? () => setVturbFalhou(true) : undefined}
                />
              ) : (
                <VslDoTopo
                  src={copy.hero.vsl.src!}
                  poster={copy.hero.vsl.poster}
                  aspect={copy.hero.vsl.aspect || "9 / 16"}
                />
              )}
            </div>
          )}

          {/* Formulário: abaixo do vídeo no mobile, coluna direita no desktop */}
          <div
            className={
              "w-full lg:col-start-2 lg:max-w-[30rem] " +
              (copy.hero.vsl
                ? "lg:row-start-2 lg:self-start lg:justify-self-start"
                : "lg:row-start-1 lg:row-span-2 lg:justify-self-end")
            }
          >
            <HeroLeadForm />
          </div>

          {/* Micro Proofs. Com rótulo em cima ("Pessoas mentem, números não.")
              e selo de garantia embaixo quando o nicho traz: o rótulo dá
              licença para os números existirem, o selo é a prova nº 5 no
              lugar onde o cético está mais cru. */}
          <div
            className={
              "flex flex-col items-center gap-3 text-muted-foreground lg:self-start " +
              (copy.hero.vsl
                ? "lg:row-start-3 lg:col-span-2"
                : "lg:row-start-2 lg:col-start-1 lg:items-start")
            }
          >
            {copy.hero.provasRotulo && (
              <p className="rotulo-micro text-secondary/90">{copy.hero.provasRotulo}</p>
            )}
            <div
              className={
                "flex flex-wrap items-center justify-center gap-4 md:gap-6 " +
                (copy.hero.vsl ? "" : "lg:justify-start")
              }
            >
            {copy.hero.provas.map((prova) => (
              <div key={prova.rotulo} className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-secondary/12">
                  <prova.icone className="w-3.5 h-3.5 text-secondary" />
                </div>
                <span className="text-xs">
                  <strong className="text-foreground font-semibold">{prova.valor}</strong>{" "}
                  {prova.rotulo}
                </span>
              </div>
            ))}
            </div>
            {copy.hero.seloGarantia && (
              <p className="text-xs md:text-sm text-foreground/90 font-medium">
                {copy.hero.seloGarantia}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>;
}
