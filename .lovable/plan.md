## Objetivo

Substituir o `score` atual (apenas 1–5 derivado do tier de faturamento) por um **Lead Score 0–100%** calculado com **todas as perguntas do quiz**, e exibir essa métrica:

1. No card de detalhes do lead (`LeadReportsTab` drill).
2. Nas métricas principais da aba **Criativos** (média geral).
3. Na tabela **Performance por criativo** (média por criativo).

A regra de tier (Small/Medium/Large/Enterprise/Enterprise+) e MQL (≥10k) **não muda** — continuam usando `investimento_faixa` diretamente. Só o `score` numérico ganha significado novo.

---

## Fórmula proposta (total = 100 pts)

Pesos definidos por relevância comercial real (não por opinião arbitrária):

| Pergunta | Peso | Critério |
|---|---:|---|
| **Faturamento mensal** (`investimento_faixa`) | **35** | Maior sinal de fit. Escala progressiva: 0 (não vende) → 5 (até 5k) → 15 (5–10k) → 22 (10–20k) → 27 (20–30k) → 30 (30–50k) → 32 (50–75k) → 33 (75–100k) → **35** (≥100k) |
| **Aceita call de diagnóstico** | **12** | Sim = 12 / Não = 0. Intenção altíssima. |
| **Estágio do negócio** | **12** | Iniciando = 2 · Validação = 6 · Pré-escala = 10 · Escala = 12 |
| **Compromisso WhatsApp** | **10** | Sim = 10 / Não = 0. Filtra curiosos. |
| **Mercado** | **8** | Fit alto (Infoproduto, E-com, SaaS, Serviços, Agência, Nutra Produtor) = 8 · Médio (Drop, Afiliado, Lowticket) = 5 · Baixo (Igaming, Hot, X1, Outro) = 3 |
| **Operações ativas** | **6** | 0 = 1 · 1 = 4 · 2 = 5 · 3+ = 6 |
| **Quer vender mais** | **5** | Sim = 5 / Não = 0 |
| **Dor / desejo** (texto livre) | **5** | Qualidade pela densidade: <10 chars = 0 · 10–30 = 2 · 30–80 = 4 · 80+ = 5 |
| **NPS Champion (0–10)** | **4** | `nps_score × 0,4` (proporcional) |
| **LGPD aceito** | **3** | Sim = 3 (marca completude do funil) |
| **TOTAL** | **100** | — |

> Score final é **arredondado** e clamped em 0–100. Lead que parou no meio do quiz pontua só o que respondeu (não é injusto: ele literalmente não se qualificou).

### Faixas qualitativas (apenas visuais)

- 0–24 — **Frio** (cinza)
- 25–49 — **Morno** (azul)
- 50–74 — **Quente** (âmbar)
- 75–100 — **Hot** (verde/dourado)

---

## Onde aparece

### 1. Card do lead (LeadReportsTab → drill)
Substituir o atual `Score: 3` por uma barra horizontal + percentual + badge da faixa:
```
Lead Score    78 / 100   [Hot]
████████████████░░░░  78%
```

### 2. Criativos — Métricas principais
Adicionar um `MetricItem` nova "**Lead Score Médio**" na faixa de KPIs principais, com:
- Valor: média ponderada dos leads do criativo no range.
- Sub: badge da faixa dominante.

### 3. Criativos — Performance por criativo (tabela)
Adicionar coluna **"Score"** (largura ~6%), ordenável, mostrando `XX%` colorido pela faixa. Também aparece no drill do criativo.

---

## Detalhes técnicos

### Arquivos a alterar

- `src/lib/leadScoring.ts`
  - Adicionar `computeLeadScore100(lead)` aceitando objeto com todos os campos do quiz (`investimento_faixa`, `estagio_negocio`, `mercado`, `operacoes_ativas`, `quer_vender_mais`, `compromisso_whatsapp`, `aceita_call_diagnostico`, `nps_score`, `dor_desejo`, `lgpd`).
  - Retornar `{ score: number /* 0-100 */, band: "Frio"|"Morno"|"Quente"|"Hot", breakdown: Record<string, number> }`.
  - Manter `calculateLeadScore` e `getTierFromFaturamento` intactos para não quebrar tier/MQL.

- `src/pages/Quiz.tsx` (submit)
  - No payload de `leads`, salvar `score = computeLeadScore100(formData).score` em vez do 1–5 atual.
  - Tier continua sendo gravado pela coluna `tier` via `getTierFromFaturamento`.

- `src/components/admin/LeadReportsTab.tsx`
  - No drill, renderizar barra de progresso 0–100% + badge da faixa.
  - O número exibido vem de: se `lead.score >= 0 && lead.score <= 100` (novo), usa direto; senão recomputa client-side a partir dos campos disponíveis no `lead` + `raw_answers_json`. Isso evita migração pesada e cobre leads antigos.

- `src/components/admin/CreativesTab.tsx`
  - Consumir `avg_lead_score` por criativo vindo do backend.
  - Card novo "Lead Score Médio" no bloco de totais.
  - Coluna nova na tabela ordenável.

- `supabase/functions/admin-data/index.ts`
  - Replicar `computeLeadScore100` em TS (mesma fórmula).
  - Ao agregar leads por criativo (na consulta que monta `creatives[]`), calcular `avg_lead_score` (média simples dos scores 0–100) e devolver no objeto do criativo + totals globais.

### Backfill / leads antigos
- **Sem migração SQL**. A lib recomputa on-read para todos os pontos de exibição (tanto admin-data quanto LeadReportsTab têm acesso aos campos brutos do lead).
- A coluna `leads.score` passa a guardar o valor 0–100 só para inserts novos. Display sempre passa pelo `computeLeadScore100` para garantir consistência mesmo se a coluna estiver desatualizada.

### Compatibilidade
- Não mexe em: roteamento SDR, MQL flag, Kommo payload, Meta CAPI, notificações WhatsApp, tier mapping.
- O payload do Kommo (`score: lead.score`) passa a enviar 0–100 — não é breaking porque Kommo trata como número livre.

---

## Fora de escopo

- Recalcular score por trás de relatórios diários antigos.
- Mudar definição de MQL ou tier.
- Adicionar coluna nova no banco (score já existe e cabe 0–100).
