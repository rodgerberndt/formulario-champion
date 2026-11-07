/**
 * Tema claro e escuro do painel.
 *
 * ── Por que só o painel ──────────────────────────────────────────────────────
 * O escuro é o tema da Champion: a landing, o quiz e tudo que o cliente vê
 * foram desenhados em cima dele, com gradiente, brilho e sobreposição feitos
 * para fundo preto. Virar os tokens ali não trocaria o tema, quebraria a arte.
 *
 * O painel é outra coisa: é ferramenta de trabalho, aberta o dia inteiro, e
 * quem passa oito horas numa planilha de números costuma preferir claro. Por
 * isso o atributo `data-tema` é aplicado ao entrar no /admin e REMOVIDO ao sair.
 *
 * ── Por que escuro continua sendo o padrão ───────────────────────────────────
 * Ninguém deve ser surpreendido com a tela trocando de cor. Só quem clicar no
 * botão muda, e a escolha fica guardada no aparelho.
 */

export type Tema = "escuro" | "claro";

const CHAVE = "champion_tema_painel";

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === "claro" ? "claro" : "escuro";
  } catch {
    // Modo privado ou storage bloqueado: escuro, que é o padrão da casa.
    return "escuro";
  }
}

export function guardarTema(t: Tema): void {
  try {
    localStorage.setItem(CHAVE, t);
  } catch {
    // Sem storage a escolha vale só nesta sessão, e tudo bem.
  }
}

/** Liga o tema no documento. `escuro` remove o atributo e volta ao `:root`. */
export function aplicarTema(t: Tema): void {
  const raiz = document.documentElement;
  if (t === "claro") raiz.setAttribute("data-tema", "claro");
  else raiz.removeAttribute("data-tema");
}

/**
 * Tira o tema do documento sem apagar a preferência.
 *
 * Chamado ao sair do painel: a landing tem que voltar ao escuro mesmo que a
 * pessoa esteja usando o painel no claro.
 */
export function soltarTema(): void {
  document.documentElement.removeAttribute("data-tema");
}
