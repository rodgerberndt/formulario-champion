/**
 * Instagram do lead: normalização e validação, num lugar só.
 *
 * ── O defeito (18/09/2026) ─────────────────────────────────────────────────
 * Os dois formulários exigiam `instagram.trim().length >= 1`. O caractere "@"
 * sozinho tem comprimento 1, então "@" PASSAVA — e um lead real entrou na base
 * exatamente assim. Um "@" não identifica ninguém: o `instagram-follow-mql`
 * normaliza tirando o "@" e fica com string vazia, o comercial não acha o
 * perfil, e a coluna parece preenchida em toda leitura que só testa NULL.
 *
 * ── A regra ────────────────────────────────────────────────────────────────
 * Vale se sobrar pelo menos 2 caracteres DEPOIS do "@". Dois e não um porque
 * usuário de 1 caractere praticamente não existe no Instagram (as contas de 1
 * letra são de 2010 e não estão em circulação), e porque "@a" digitado por
 * engano é indistinguível de desistência.
 *
 * ── A normalização ─────────────────────────────────────────────────────────
 * Copiada do `normalizeInstagram` de `supabase/functions/instagram-follow-mql`,
 * que é quem consome o campo do outro lado: URL completa vira usuário, espaço
 * some, "@" repetido some, caixa vira minúscula (o Instagram trata usuário
 * como caixa-insensível, e duas grafias do mesmo perfil viravam dois leads
 * diferentes em qualquer leitura por igualdade).
 *
 * A diferença é o prefixo: aqui o valor volta COM "@" (é o que o campo mostra
 * e o que o time lê no painel); lá ele é removido na hora de montar a URL.
 *
 * Sem dependência de React nem de navegador, de propósito: o teste
 * (`scripts/testar-atribuicao-paga.mjs`) carrega este arquivo direto.
 */

/** Caracteres que o Instagram aceita em usuário. */
const PERMITIDOS = /[^A-Za-z0-9._]/g;

/**
 * Devolve "@usuario" a partir de qualquer coisa que a pessoa digite ou cole:
 * "@ Fulano ", "instagram.com/fulano/?igshid=x", "https://www.instagram.com/fulano".
 * Devolve "" quando não sobra usuário nenhum.
 */
export function normalizarInstagram(bruto: string | null | undefined): string {
  if (!bruto) return "";
  let v = String(bruto).trim();
  if (!v) return "";

  // URL colada do app ou do navegador, com ou sem protocolo e www.
  v = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  v = v.replace(/^instagram\.com\//i, "");
  // Query, âncora e o resto do caminho não fazem parte do usuário.
  v = v.replace(/[/?#].*$/, "");
  // "@" repetido, espaço no meio ("@ fulano" é comum no teclado do celular).
  v = v.replace(/^@+/, "").replace(/\s+/g, "");
  v = v.replace(PERMITIDOS, "");
  v = v.toLowerCase();

  return v ? `@${v}` : "";
}

/** O usuário sem o "@" — o que o `instagram-follow-mql` espera. */
export function usuarioDoInstagram(bruto: string | null | undefined): string {
  return normalizarInstagram(bruto).replace(/^@/, "");
}

/** Pelo menos 2 caracteres além do "@", depois de normalizar. */
export function instagramValido(bruto: string | null | undefined): boolean {
  return usuarioDoInstagram(bruto).length >= 2;
}

/** Mensagem única para os dois formulários. */
export const ERRO_INSTAGRAM = "Informe seu @ do Instagram";
