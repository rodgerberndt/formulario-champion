/**
 * Âncora do formulário curto no topo da landing (HeroLeadForm).
 *
 * Desde 17/09/2026 todo CTA da landing rola até o formulário em vez de abrir o
 * quiz. As constantes moram aqui, e não no componente, para os botões da página
 * não precisarem importar o formulário inteiro.
 */

export const FORMULARIO_TOPO_ID = "formulario";
export const FORMULARIO_PRIMEIRO_CAMPO_ID = "form-nome";

/** Rola suavemente até o formulário do topo e foca o primeiro campo. */
export function rolarAteFormulario() {
  if (typeof document === "undefined") return;
  const alvo = document.getElementById(FORMULARIO_TOPO_ID);
  if (!alvo) return;

  const reduzMovimento =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  alvo.scrollIntoView({ behavior: reduzMovimento ? "auto" : "smooth", block: "start" });

  // O foco espera a rolagem: focar no meio dela faz o navegador saltar direto
  // para o campo (e no iOS abre o teclado com a tela ainda andando).
  // `preventScroll` impede um segundo salto quando a rolagem já terminou.
  const campo = document.getElementById(FORMULARIO_PRIMEIRO_CAMPO_ID) as HTMLInputElement | null;
  if (!campo) return;
  window.setTimeout(() => {
    try {
      campo.focus({ preventScroll: true });
    } catch {
      campo.focus();
    }
  }, reduzMovimento ? 0 : 550);
}
