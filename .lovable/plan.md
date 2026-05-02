## Atualizar mensagem de atenção do quiz

Trocar o texto na tela de aviso (etapa intro do quiz) em `src/pages/Quiz.tsx` (linhas 744–749).

**Texto atual:**
> Ao preencher esse quiz, você concorda que **trabalha com o mercado digital**. Se você não trabalha com o mercado digital, **saia desse quiz agora**.

**Texto novo:**
> Ao preencher esse quiz, você concorda que **trabalha com o digital**. Se você não trabalha com o digital, e não quer vender mais, **saia deste formulário imediatamente**.

### Detalhes técnicos
- Único arquivo alterado: `src/pages/Quiz.tsx`.
- Mantém os mesmos `<span className="text-secondary font-bold">` para destacar em dourado:
  - "trabalha com o digital"
  - "saia deste formulário imediatamente"
- Sem alterações em layout, animação da barra de progresso, timing, MQL, banco ou roteamento.

> Dica: para edições simples de texto como esta, você pode usar o **Visual Edits** (botão no canto inferior esquerdo do chat) — é gratuito e instantâneo.