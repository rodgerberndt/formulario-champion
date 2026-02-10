
# Destaque visual na pergunta da Dor/Desejo (Step 7)

## O que muda
Vamos transformar a pergunta 7 (dor/desejo) em um momento especial do quiz, com um bloco de destaque visual que chama a atenção do usuario e reforça a importancia de responder com cuidado.

## Detalhes da mudanca

No **case 7** do `src/pages/Quiz.tsx` (linhas 478-497), vamos substituir o label e o paragrafo simples por:

1. **Bloco de destaque** com fundo em gradiente dourado/azul sutil, borda dourada e padding generoso
2. **Titulo grande e chamativo** com texto em dourado (cor `secondary`) dizendo algo como: "Essa e a pergunta mais importante de todo o diagnostico"
3. **Texto explicativo** abaixo, com destaque em dourado nas palavras-chave, pedindo para o usuario ser detalhista e honesto na resposta
4. **Icone** (ex: estrela ou alvo) para reforcar visualmente a importancia
5. O campo de texto (Textarea) permanece igual

### Estrutura visual do bloco

```text
+------------------------------------------+
|  [icone]                                  |
|  ESSA E A PERGUNTA MAIS IMPORTANTE       |
|  DE TODO O DIAGNOSTICO.                  |
|                                           |
|  Quanto mais detalhada for sua resposta,  |
|  mais preciso sera o nosso diagnostico.   |
|  Seja honesto e especifico.              |
+------------------------------------------+

[ Textarea - campo de texto ]
```

### Detalhes tecnicos

- Arquivo: `src/pages/Quiz.tsx`, linhas 478-497
- O bloco de destaque usara classes Tailwind com `bg-secondary/10`, `border border-secondary/30`, `rounded-2xl`, `p-4 sm:p-5`
- Titulo com `text-secondary font-bold text-lg sm:text-xl md:text-2xl`
- Texto explicativo com `text-muted-foreground` e palavras-chave em `text-secondary font-semibold`
- Icone `Target` ou `Star` do lucide-react
- Nenhuma alteracao na logica, apenas visual
