// As etapas da esteira do orgânico. A MESMA lista mora em src/lib/esteiraFluxos.ts (a tela) e é usada pelo
// agent do carrossel (01-Projetos/instagram-postagem/esteira.mjs). Quem mudar uma etapa muda os três.
//
//   dono      quem a peça está esperando ("Agente" = o agent faz sozinho, ninguém clica)
//   aprovar   para onde a peça vai quando uma pessoa aprova / conclui a etapa
//   volta     para onde ela volta num "pedir ajuste" (só nas etapas de revisão)
//   rotulo    texto do botão de avançar

export type Etapa = { id: string; nome: string; dono: string; aprovar?: string; volta?: string; rotulo?: string; auto?: string };

export type TipoPeca = "carrossel" | "reel" | "direct";

export const FLUXOS: Record<TipoPeca, Etapa[]> = {
  carrossel: [
    // 26/10/2026: o Leo não revisa mais a copy do carrossel. A copy vai direto para a arte, e o "pedir ajuste" do Rodger
    // cai em "ajuste", onde o agent lê o texto e os prints, refaz e devolve para a revisão com o que mudou.
    // 26/10/2026 (Rodger): a copy espera ele. Aprovar a copy (botão ou arrastar para Arte) manda desenhar; reprovar é
    // "Trocar tema" (o agent escreve outra com tema viral novo)
    { id: "copy", nome: "Copy", dono: "Rodger", aprovar: "arte", rotulo: "Aprovar copy" },
    { id: "arte", nome: "Arte (agente)", dono: "Agente" },
    { id: "ajuste", nome: "Ajuste (agente)", dono: "Agente" },
    { id: "revisao_rodger", nome: "Revisão do Rodger", dono: "Rodger", aprovar: "aprovado", volta: "ajuste", rotulo: "Aprovar carrossel" },
    { id: "aprovado", nome: "Aprovado", dono: "Agente" },
    { id: "publicado", nome: "Publicado", dono: "" },
  ],
  // Reel (17/10/2026): o agent dos Reels (instagram-postagem/agente.mjs) avança sozinho quando o take cai em Gravação,
  // quando o vídeo editado cai em Edição (e vira post na Fila), e quando publica. Roteiro, revisão e gravação são do clique.
  reel: [
    { id: "roteiro", nome: "Roteiro", dono: "Copy", aprovar: "revisao_leo", rotulo: "Roteiro pronto" },
    { id: "revisao_leo", nome: "Revisão do Leo", dono: "Leo", aprovar: "gravacao", volta: "roteiro", rotulo: "Aprovar roteiro" },
    { id: "gravacao", nome: "Gravação", dono: "Rodger", aprovar: "edicao", rotulo: "Gravado" },
    { id: "edicao", nome: "Edição", dono: "Edição", auto: "avança quando o vídeo editado cai na pasta Edição" },
    { id: "revisao_rodger", nome: "Revisão do Rodger", dono: "Rodger", aprovar: "aprovado", volta: "edicao", rotulo: "Aprovar Reel" },
    { id: "aprovado", nome: "Aprovado", dono: "Agente" },
    { id: "publicado", nome: "Publicado", dono: "" },
  ],
  // Direct (30/10/2026): copy das automações de DM, uma peça por porta (GANCHO, DIAGNÓSTICO...). O Rodger aprova ou pede
  // ajuste; o Claude refaz o ajuste e, aprovada, sobe a copy em ig_automacoes e testa. "No ar" = o robô já manda esta copy.
  direct: [
    { id: "copy", nome: "Copy", dono: "Rodger", aprovar: "aprovado", volta: "ajuste", rotulo: "Aprovar copy" },
    { id: "ajuste", nome: "Ajuste (Claude)", dono: "Agente" },
    { id: "aprovado", nome: "Aprovado (subir no robô)", dono: "Agente" },
    { id: "publicado", nome: "No ar", dono: "" },
  ],
};

export const etapaDe = (tipo: string, id: string) => FLUXOS[tipo as TipoPeca]?.find((e) => e.id === id);
