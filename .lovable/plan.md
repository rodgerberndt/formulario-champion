## Alteração

Substituir todas as menções a "CGS" por "Assessoria Completa" no arquivo `src/components/landing/QuizResult.tsx` (componente usado na página `/obrigadomql`).

### Mudanças exatas

**Linha 61** (passo 3 — Call de diagnóstico):
- Antes: `"...para entrar na CGS (nosso sistema de crescimento)."`
- Depois: `"...para entrar na Assessoria Completa."`

**Linha 64** (título do passo 4):
- Antes: `"Entrada na CGS + plano personalizado"`
- Depois: `"Entrada na Assessoria Completa + plano personalizado"`

**Linha 67** (texto do passo 4):
- Antes: `"A entrega da CGS é personalizada..."`
- Depois: `"A entrega da Assessoria Completa é personalizada..."`

**Linha 170** (texto de progresso):
- Antes: `"100% = você dentro da CGS com plano de crescimento definido."`
- Depois: `"100% = você dentro da Assessoria Completa com plano de crescimento definido."`

### Observação
A frase "(nosso sistema de crescimento)" será removida no passo 3 para evitar redundância — "Assessoria Completa" já é autoexplicativa. Se preferir manter o parêntese explicativo, me avise.

Nenhuma outra página é afetada — o termo "CGS" só aparece em `QuizResult.tsx`.