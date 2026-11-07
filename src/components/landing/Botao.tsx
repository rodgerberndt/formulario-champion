import { forwardRef, type ButtonHTMLAttributes } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import "./botao.css";

/**
 * Botão da landing. Componente único para TODOS os CTAs da página
 * (formulário do topo, cases, CTA intermediário, CTA final, header e barra fixa
 * do celular). O desenho e os estados moram em `botao.css`.
 *
 * Regras que vieram junto com o desenho:
 * - Um botão `primario` por seção. O resto é `secundario` ou `link`.
 * - O rótulo é sempre uma linha só, em caixa alta: a troca de rótulo do hover
 *   acontece dentro de uma máscara de altura fixa e texto que quebra estoura.
 * - `data-track-click` e `data-track-id` continuam indo no <button> (é o que o
 *   `closest()` do useLandingTracking encontra), então passe-os por props
 *   normalmente.
 */

export type BotaoVariante = "primario" | "secundario" | "link";
export type BotaoTamanho = "sm" | "md" | "lg";

interface BotaoProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Texto do botão. Vai em caixa alta pelo CSS; escreva como preferir. */
  rotulo: string;
  variante?: BotaoVariante;
  tamanho?: BotaoTamanho;
  /** Largura total em qualquer tela. */
  bloco?: boolean;
  /** Largura total só no celular (abaixo de 768 px). */
  blocoMobile?: boolean;
  /** Seta à direita, que anda 4 px no hover. Ligada por padrão. */
  seta?: boolean;
  /** Estado de envio: troca o rótulo e desabilita o clique. */
  carregando?: boolean;
  /** Rótulo mostrado enquanto `carregando`. */
  rotuloCarregando?: string;
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    rotulo,
    variante = "primario",
    tamanho = "md",
    bloco = false,
    blocoMobile = false,
    seta = true,
    carregando = false,
    rotuloCarregando = "Enviando...",
    className = "",
    disabled,
    type = "button",
    ...resto
  },
  ref,
) {
  const classes = [
    "btn",
    `btn--${variante}`,
    tamanho !== "md" ? `btn--${tamanho}` : "",
    bloco ? "btn--bloco" : "",
    blocoMobile ? "btn--bloco-mobile" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || carregando}
      {...resto}
    >
      {carregando ? (
        <>
          <Loader2 className="btn-girando" aria-hidden="true" />
          <span className="btn-simples">{rotuloCarregando}</span>
        </>
      ) : (
        <>
          {/* O data-rotulo é a cópia que entra por baixo no hover (::after). */}
          <span className="btn-rotulo" data-rotulo={rotulo}>
            <span>{rotulo}</span>
          </span>
          {seta && <ArrowRight className="btn-seta" aria-hidden="true" />}
        </>
      )}
    </button>
  );
});
