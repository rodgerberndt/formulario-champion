// A volta do Google, servida pelo NOSSO domínio.
//
// ── Por que esta página existe ───────────────────────────────────────────────
// O callback do OAuth mora numa edge function do Supabase, e ela terminava
// desenhando uma paginazinha em HTML que avisava a aba de origem e se fechava.
// Só que o Supabase se RECUSA a servir HTML de edge function: ele reescreve o
// Content-Type para `text/plain` e manda `X-Content-Type-Options: nosniff`.
// Resultado, em 03/09/2026: o popup abriu mostrando o código-fonte da página em
// vez de executá-lo, o script nunca rodou, a janela não fechou e o painel
// continuou dizendo "DESCONECTADA" — mesmo com a conexão gravada e funcionando.
//
// A função agora só redireciona para cá com o resultado na query, e quem
// executa o script é o nosso próprio site, onde HTML é HTML.
//
// Ela não lê token nem segredo nenhum: a troca de código por token acontece
// inteira no servidor, antes do redirecionamento. O que chega aqui é só "deu
// certo" ou "deu errado", e o e-mail conectado para a tela mostrar.

import { useEffect, useState } from "react";

const FONTE = "champion-google-calendar-oauth";

export default function GoogleCalendarCallback() {
  const [texto, setTexto] = useState("Conectando ao Google Calendar…");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ok = q.get("ok") === "1";
    const email = q.get("email") || undefined;
    const erro = q.get("erro") || undefined;

    try {
      if (window.opener) {
        window.opener.postMessage({ source: FONTE, ok, email, error: erro }, "*");
        // Um respiro antes de fechar: sem ele o postMessage às vezes não chega,
        // porque a janela morre antes de a mensagem sair da fila.
        setTimeout(() => window.close(), 400);
        setTexto(ok ? "Conectado. Fechando…" : `Erro: ${erro || "desconhecido"}`);
        return;
      }
      // Aberto fora de popup (alguém colou a URL no navegador). Aqui não há
      // ninguém para avisar, então a página só conta o que aconteceu.
      setTexto(
        ok
          ? `Conectado como ${email || "conta Google"}. Pode fechar esta janela e voltar ao painel.`
          : `Não deu para conectar: ${erro || "erro desconhecido"}`,
      );
    } catch (e) {
      setTexto(e instanceof Error ? e.message : "erro");
    }
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-8">
      <div className="text-center max-w-sm">
        <p className="text-sm">{texto}</p>
      </div>
    </div>
  );
}
