import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link2, Play } from "lucide-react";
import { CASES_SUCESSO, type CaseSucesso, type PerfilInstagram } from "@/config/casesSucesso";
import { Botao } from "./Botao";
import { useCopyNicho } from "@/config/nichoLanding";
import "./casesSucesso.css";

/**
 * Cases de Sucesso (seção `success_cases`).
 *
 * Um card por case (referência: cards de depoimento da assessorialpha.com).
 * O topo do card é a prova visual: vídeo (quando existir) + perfil do
 * Instagram (print, ou o cabeçalho do perfil desenhado em código enquanto o
 * print não está no disco). Embaixo: resultado, nome e bio.
 *
 * Celular: cards empilhados, cada um com a própria altura (nada de área vazia).
 * Tablet/desktop: duas colunas em CSS columns, que equilibra alturas
 * diferentes sem buraco; o card de CTA fecha a segunda coluna.
 */

/** Conta ConverteAI da Champion, a mesma da seção de criativos. */
const VTURB_ACCOUNT = "3b4a85ca-8939-45e7-ae40-d0be1d6af49b";

function iniciais(nome: string) {
  const partes = nome.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter(Boolean);
  return partes.map((p) => p[0]!.toUpperCase()).slice(0, 2).join("") || "?";
}

/** Selo de verificado do Instagram (roseta azul com check). */
function SeloVerificado() {
  return (
    <svg className="ig-verified" viewBox="0 0 40 40" aria-label="Verificado" role="img">
      <path
        fill="#0095F6"
        d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z"
      />
      <path fill="#fff" d="m17.2 27.3-6.8-6.8 2.3-2.3 4.5 4.5 9.5-9.5 2.3 2.3-11.8 11.8Z" />
    </svg>
  );
}

/** Cabeçalho de perfil do Instagram (tema escuro), clicável. */
function PerfilCard({ perfil, logo }: { perfil: PerfilInstagram; logo?: string }) {
  const href = `https://www.instagram.com/${perfil.user}/`;
  const trackProps = {
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    "data-track-click": "case_instagram",
    "data-track-id": `case_ig_${perfil.user}`,
  } as const;

  if (perfil.print) {
    return (
      <a {...trackProps} className="ig-print" aria-label={`Abrir o Instagram @${perfil.user}`}>
        <img src={perfil.print} alt={`Perfil do Instagram @${perfil.user}`} loading="lazy" decoding="async" />
      </a>
    );
  }

  const avatar = perfil.avatar || logo;

  return (
    <a {...trackProps} className="ig-card" aria-label={`Abrir o Instagram @${perfil.user}`}>
      <span className="ig-top">
        <span className="ig-handle">{perfil.user}</span>
        {perfil.verificado && <SeloVerificado />}
      </span>

      <span className="ig-head">
        <span className="ig-ring">
          <span className="ig-avatar">
            {avatar ? (
              // `eager` e com tamanho declarado (17/09/2026). A seção de cases
              // é a PRIMEIRA depois do topo; no celular ela entra na tela quase
              // junto com o formulário, e `lazy` fazia o avatar chegar depois do
              // resto do card — o círculo pintava vazio e preenchia. `width`/
              // `height` reservam a caixa antes de o arquivo chegar (o CSS
              // dimensiona em 100%, mas sem os atributos não há proporção
              // intrínseca até o download). 130 px é o tamanho real do arquivo
              // WebP; o círculo mede ~65 px em CSS, então cobre tela 2x.
              <img
                src={avatar}
                alt=""
                aria-hidden="true"
                width={130}
                height={130}
                loading="eager"
                decoding="async"
              />
            ) : (
              <span aria-hidden="true">{iniciais(perfil.nome)}</span>
            )}
          </span>
        </span>
        <span className="ig-side">
          <span className="ig-name">{perfil.nome}</span>
          <span className="ig-stats">
            <span><b>{perfil.posts}</b> posts</span>
            <span><b>{perfil.seguidores}</b> seguidores</span>
            <span><b>{perfil.seguindo}</b> seguindo</span>
          </span>
        </span>
      </span>

      {(perfil.categoria || perfil.bio.length > 0 || perfil.link) && (
        <span className="ig-bio">
          {perfil.categoria && <span className="ig-cat">{perfil.categoria}</span>}
          {perfil.bio.map((linha, i) => (
            <span key={i} className="ig-line">{linha}</span>
          ))}
          {perfil.link && (
            <span className="ig-link">
              <Link2 className="ig-link-icon" aria-hidden="true" />
              {perfil.link}
            </span>
          )}
        </span>
      )}

      <span className="ig-actions" aria-hidden="true">
        <span className="ig-btn ig-btn--follow">Seguir</span>
        <span className="ig-btn">Mensagem</span>
      </span>
    </a>
  );
}

/** Vídeo de depoimento: poster + play; o <video> só monta depois do clique. */
function VideoCase({ item }: { item: CaseSucesso }) {
  const [tocando, setTocando] = useState(false);
  const capa = item.poster || item.foto;

  return (
    <div className={`cs-video ${tocando ? "is-playing" : ""}`}>
      {tocando ? (
        <video src={item.video} poster={capa || undefined} controls autoPlay playsInline preload="none" />
      ) : (
        <>
          {capa ? (
            <img src={capa} alt={`Depoimento de ${item.nomes}`} loading="lazy" decoding="async" />
          ) : (
            <span className="cs-video-ph" aria-hidden="true">{iniciais(item.nomes)}</span>
          )}
          <span className="cs-video-shade" />
          <button
            type="button"
            className="cs-play"
            onClick={() => setTocando(true)}
            aria-label={`Assistir depoimento de ${item.nomes}`}
            data-track-click="case_video_play"
            data-track-id={`case_video_${item.slug}`}
          >
            <span className="cs-play-icon">
              <Play className="w-6 h-6 ml-0.5" fill="currentColor" aria-hidden="true" />
            </span>
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Depoimento hospedado no Vturb (ConverteAI). O script do player só entra
 * quando o card chega perto da tela: são vídeos verticais e a seção fica logo
 * abaixo do topo, então carregar os três de uma vez pesaria no celular.
 */
function VturbCase({ item }: { item: CaseSucesso }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visivel) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisivel(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visivel]);

  useEffect(() => {
    if (!visivel || !item.vturb) return;
    const src = `https://scripts.converteai.net/${VTURB_ACCOUNT}/players/${item.vturb}/v4/player.js`;
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  }, [visivel, item.vturb]);

  return (
    <div className="cs-video cs-video--vturb" ref={ref} data-track-id={`case_video_${item.slug}`}>
      {visivel && (
        // @ts-expect-error elemento customizado do player
        <vturb-smartplayer id={`vid-${item.vturb}`} class="cs-vturb" style={{ display: "block" }} />
      )}
    </div>
  );
}

/**
 * Number reveal do destaque do case (17/09/2026).
 *
 * Os números do texto sobem de zero até o valor quando o card chega na tela,
 * uma vez só; o que não é dígito ("k", "→", "dígitos", "+") fica parado. Uma
 * rAF por card, que se encerra no fim da contagem, e nada roda com
 * `prefers-reduced-motion`.
 *
 * O valor é zerado num `useLayoutEffect` (antes do primeiro pintar), então o
 * número final nunca aparece para depois voltar a zero. Sem
 * IntersectionObserver no navegador, o texto fica como veio e nada anima.
 */
function NumeroDestaque({ valor }: { valor: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [texto, setTexto] = useState(valor);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const reduz =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const partes = valor.split(/(\d+)/);
    const eDigito = (p: string) => /^\d+$/.test(p);
    if (reduz || !partes.some(eDigito)) return;

    setTexto(partes.map((p) => (eDigito(p) ? "0" : p)).join(""));

    let raf = 0;
    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        obs.disconnect();
        const inicio = performance.now();
        const DURACAO = 900;
        const passo = (agora: number) => {
          const t = Math.min(1, (agora - inicio) / DURACAO);
          const suave = 1 - Math.pow(1 - t, 3);
          setTexto(
            partes.map((p) => (eDigito(p) ? String(Math.round(Number(p) * suave)) : p)).join(""),
          );
          if (t < 1) raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [valor]);

  return <p className="cs-num" ref={ref}>{texto}</p>;
}

function CardCase({ item, mostrarVideo }: { item: CaseSucesso; mostrarVideo: boolean }) {
  return (
    // Ordem pedida pelo Rodger (17/09): perfis pequenos lado a lado, depois o
    // resultado e a bio, e o vídeo do depoimento por último, embaixo da bio.
    <article className="cs-card">
      <div className={`cs-proof ${item.perfis.length > 1 ? "cs-proof--dupla" : ""}`}>
        {item.perfis.map((perfil) => (
          <PerfilCard key={perfil.user} perfil={perfil} logo={item.logo || undefined} />
        ))}
      </div>

      <div className="cs-body">
        <div className="cs-result">
          <NumeroDestaque valor={item.destaque.valor} />
          <p className="cs-num-label">{item.destaque.rotulo}</p>
        </div>
        <h3 className="cs-name">
          {item.nomes}
          {item.empresa && <span className="cs-company">{item.empresa}</span>}
        </h3>
        <p className="cs-bio">{item.bio}</p>
      </div>

      {/* O vídeo do case só entra quando o nicho pede. Na página com VSL no
          topo ele sai: quatro depoimentos em vídeo logo abaixo do vídeo
          principal competem com ele, e o card continua provando pelo perfil,
          pelo número e pela bio. */}
      {mostrarVideo &&
        (item.vturb ? <VturbCase item={item} /> : item.video && <VideoCase item={item} />)}
    </article>
  );
}

interface CasesSucessoProps {
  /** CTA ao fim da seção (rola até o formulário do topo). Ausente = sem CTA. */
  onCtaClick?: (buttonId: string) => void;
}

export function CasesSucesso({ onCtaClick }: CasesSucessoProps) {
  const { cases } = useCopyNicho();
  // A ordem vem do nicho; quem não está na lista entra depois, na ordem do
  // arquivo. A copy de cada case continua literal (ver `casesSucesso.ts`):
  // aqui só muda QUAL prova aparece primeiro.
  const ordenados = cases.ordem
    ? [...CASES_SUCESSO].sort((a, b) => {
        const pos = (slug: string) => {
          const i = cases.ordem!.indexOf(slug);
          return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        return pos(a.slug) - pos(b.slug);
      })
    : CASES_SUCESSO;

  return (
    <div className="cs-root py-14 md:py-24 relative">
      <div className="container mx-auto px-5 max-w-5xl relative z-10">
        <header className="mb-8 md:mb-12">
          <p className="cs-eyebrow">{cases.eyebrow}</p>
          <h2 className="cs-title text-foreground">{cases.titulo}</h2>
        </header>

        <div className="cs-grid">
          {ordenados.map((item) => (
            <CardCase key={item.slug} item={item} mostrarVideo={cases.mostrarVideo} />
          ))}

          {onCtaClick && (
            <div className="cs-card cs-cta">
              <p className="cs-cta-title">{cases.ctaTitulo}</p>
              <p className="cs-cta-sub">{cases.ctaSub}</p>
              <Botao
                rotulo="Preencher aplicação"
                bloco
                className="mt-5"
                onClick={() => onCtaClick("cases_cta")}
                data-track-click="cta_primary"
                data-track-id="cases_cta_btn"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
