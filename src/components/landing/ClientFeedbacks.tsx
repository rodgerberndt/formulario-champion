import { useEffect, useRef, useState } from "react";
import { useReveal } from "@/hooks/useReveal";
import "./casesSucesso.css";
import "./depoimentos.css";

/**
 * Esteira de depoimentos de cliente: prints de WhatsApp e vídeos.
 *
 * Histórico curto, porque explica as escolhas:
 *   • a seção saiu do ar em 17/09/2026, junto com a troca do quiz pelo
 *     formulário curto, e voltou em 19/09 — a auditoria daquele dia mostrou
 *     que a queda de MQL tinha quatro variáveis misturadas, e a saída dos
 *     depoimentos era uma delas;
 *   • voltou como UMA imagem de 1080 px com os três prints colados. No celular
 *     ela encolhia inteira e o texto das conversas virava borrão;
 *   • agora cada print é um arquivo e a esteira passa devagar, dois por vez.
 *
 * Os OITO VÍDEOS entraram aqui em 19/09/2026. Eles já existiam no repositório,
 * mas só apareciam em `/obrigado` e `/obrigadosprint` — ou seja, só para quem
 * JÁ tinha convertido. Prova social depois da conversão não convence ninguém;
 * é antes que ela trabalha.
 */

type Depoimento =
  | { tipo: "print"; src: string; alt: string }
  | { tipo: "video"; src: string; alt: string };

const DEPOIMENTOS: Depoimento[] = [
  {
    tipo: "print",
    src: "/proofs/depoimento-pedro-rivano.webp",
    alt: "Print de WhatsApp de Pedro Rivano, cliente da Champion, com um painel de métricas marcando ROI 4,90 e o comentário 'Tá com ROI bacana'",
  },
  {
    tipo: "print",
    src: "/proofs/depoimento-roi-18-dias.webp",
    alt: "Print de WhatsApp de cliente da Champion mostrando R$ 263.566,65 em 18 dias e o comentário 'Tudo com nossos ads'",
  },
  {
    tipo: "print",
    src: "/proofs/depoimento-bruno-martins.webp",
    alt: "Print de WhatsApp de Bruno Martins, cliente da Champion, no primeiro mês de assessoria, comemorando vendas aprovadas",
  },
  ...Array.from({ length: 8 }, (_, i) => ({
    tipo: "video" as const,
    src: `/testimonials/video-${i + 1}.mp4`,
    alt: `Depoimento em vídeo de cliente da Champion (${i + 1} de 8)`,
  })),
];

/**
 * Duas voltas da lista.
 *
 * A animação corre até -50%, que é exatamente uma cópia: no fim do ciclo o
 * quadro é idêntico ao começo e o retorno não aparece. Com 11 depoimentos, duas
 * cópias já passam da largura de qualquer monitor.
 */
const VOLTAS = 2;

/** Ícone de play. Inline para não puxar a biblioteca de ícones só por isto. */
function IconePlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CartaoVideo({ src, alt, tocando, aoTocar }: {
  src: string; alt: string; tocando: boolean; aoTocar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visivel, setVisivel] = useState(false);

  // Só carrega quando a esteira chega perto da tela. São 4,4 MB somados; puxar
  // isso no carregamento da landing seria pagar com o LCP do tráfego pago.
  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisivel(true); obs.disconnect(); } },
      { rootMargin: "300px" },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, []);

  // Avança para 1 s: o quadro 0 de vídeo quase sempre é preto, e um cartão
  // preto não é prova de nada.
  useEffect(() => {
    const v = video.current;
    if (!visivel || !v) return;
    const aoCarregar = () => { try { v.currentTime = 1; } catch { /* ignora */ } };
    v.addEventListener("loadedmetadata", aoCarregar, { once: true });
    return () => v.removeEventListener("loadedmetadata", aoCarregar);
  }, [visivel]);

  // Tocar um vídeo para todos os outros: dois depoimentos falando juntos é
  // ruído, não prova.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (tocando) { v.muted = false; void v.play().catch(() => undefined); }
    else if (!v.paused) { v.pause(); v.muted = true; }
  }, [tocando]);

  return (
    <figure
      ref={caixa}
      className={`dep-item dep-item--video ${tocando ? "dep-item--tocando" : ""}`}
      onClick={aoTocar}
      role="button"
      tabIndex={0}
      aria-label={alt}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoTocar(); } }}
    >
      {visivel ? (
        <video ref={video} src={src} muted playsInline preload="metadata" controls={tocando} />
      ) : (
        <div className="dep-esqueleto" />
      )}
      <div className="dep-play"><span><IconePlay /></span></div>
    </figure>
  );
}

export function ClientFeedbacks() {
  const { ref } = useReveal(0.08);
  const [parada, setParada] = useState(false);
  const [tocando, setTocando] = useState<string | null>(null);
  const arrastou = useRef(false);

  return (
    <section ref={ref} className="py-16 md:py-24 relative">
      <div className="container mx-auto px-5 max-w-6xl">
        <header className="mb-8 md:mb-12">
          <p className="cs-eyebrow">Prova real</p>
          <h2 className="cs-title text-foreground">O que chega no nosso WhatsApp diariamente</h2>
        </header>
      </div>

      {/* Fora do container: a esteira sangra até as bordas da tela, que é o que
          faz parecer que ela continua em vez de acabar numa margem. */}
      <div
        className={`dep-esteira ${parada || tocando ? "dep-parada" : ""}`}
        onPointerDown={() => { arrastou.current = true; setParada(true); }}
        onPointerUp={() => { if (arrastou.current) setParada(false); arrastou.current = false; }}
        onPointerCancel={() => { setParada(false); arrastou.current = false; }}
      >
        <div className="dep-faixa">
          {Array.from({ length: VOLTAS }).flatMap((_, volta) =>
            DEPOIMENTOS.map((d, i) => {
              const chave = `${volta}-${i}`;
              if (d.tipo === "video") {
                return (
                  <CartaoVideo
                    key={chave}
                    src={d.src}
                    alt={d.alt}
                    tocando={tocando === chave}
                    aoTocar={() => setTocando((atual) => (atual === chave ? null : chave))}
                  />
                );
              }
              return (
                <figure className="dep-item" key={chave}>
                  <img
                    src={d.src}
                    /* `alt` só na primeira volta: o leitor de tela não precisa
                       ouvir os mesmos depoimentos duas vezes. */
                    alt={volta === 0 ? d.alt : ""}
                    aria-hidden={volta === 0 ? undefined : true}
                    width={317}
                    height={550}
                    loading={volta === 0 ? "eager" : "lazy"}
                    decoding="async"
                  />
                </figure>
              );
            }),
          )}
        </div>
      </div>

      <div className="container mx-auto px-5 max-w-6xl">
        <p className="dep-dica">Encoste para parar. Toque no vídeo para ouvir.</p>
      </div>
    </section>
  );
}
