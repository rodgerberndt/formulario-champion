

## Simplificar Classificacao de Tiers por Faturamento

### Problema Atual
O sistema usa pontuacao acumulada (Mercado + Faturamento) para definir tiers, resultando na maioria dos leads como "Small" porque a soma raramente ultrapassa 5 pontos.

### Nova Regra (direto pelo faturamento)

| Tier | Faturamento Mensal |
|------|-------------------|
| Desqualificado | R$ 0/mes (nao vende ainda) |
| Small | Ate R$ 5 mil |
| Medium | De R$ 5 mil a R$ 30 mil |
| Large | De R$ 30 mil a R$ 100 mil |
| Enterprise | Acima de R$ 100 mil |

### Alteracoes

**1. `src/lib/leadScoring.ts`**
- Adicionar "Desqualificado" ao tipo `TierType`
- Substituir a logica de pontos por mapeamento direto: cada faixa de faturamento mapeia para um tier
- Remover `MERCADO_POINTS`, `ESTAGIO_POINTS`, `INVESTIMENTO_POINTS` e `getTierFromScore`
- A funcao `calculateLeadScore` retornara o tier baseado apenas no valor de `investimento_faixa`

Mapeamento:
- "Nao vendo ainda (R$0/mes)" -> Desqualificado
- "Ate R$ 5 mil" -> Small
- "De R$ 5 mil a R$ 10 mil" ate "De R$ 20 mil a R$ 30 mil" -> Medium
- "De R$ 30 mil a R$ 50 mil" ate "De R$ 75 mil a R$ 100 mil" -> Large
- "De R$ 100 mil" em diante -> Enterprise

**2. `src/pages/AdminAnalytics.tsx`**
- Atualizar `recalcLeadScore` para usar a mesma logica direta por faturamento
- Adicionar "Desqualificado" ao `TIER_ORDER`
- Adicionar cor para o badge "Desqualificado" (cinza)

**3. `src/components/landing/QuizSection.tsx`**
- Nenhuma mudanca necessaria (ja usa `calculateLeadScore` que sera atualizado)

