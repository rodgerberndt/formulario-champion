# Tier Mapping & MQL — Auditoria (somente leitura)

> **Status desta auditoria:** apenas diagnóstico. **Nada foi alterado** no código,
> banco, layout, lógica de roteamento, Kommo, SDR, notificações, relatórios ou
> qualquer função que impacte o sistema.

---

## 1. Classificação comercial oficial dos tiers

| Tier            | Faturamento mensal       |
|-----------------|--------------------------|
| Desqualificado  | R$ 0 / não vende ainda   |
| Small           | até R$ 5 mil             |
| Medium          | R$ 5 mil a R$ 30 mil     |
| Large           | R$ 30 mil a R$ 100 mil   |
| Enterprise      | R$ 100 mil a R$ 1 milhão |
| Enterprise+     | R$ 1 milhão+             |

## 2. Conferência do Tier Mapping atual

Fonte da verdade: `src/lib/leadScoring.ts` → `FATURAMENTO_TIER`.

| Faixa (quiz `investimento_faixa`)  | Tier no código  | Esperado     | Status |
|------------------------------------|-----------------|--------------|--------|
| Não vendo ainda (R$0/mês)          | Desqualificado  | Desq         | ✅ |
| Até R$ 5 mil                       | Small           | Small        | ✅ |
| R$ 5 mil a R$ 10 mil               | Medium          | Medium       | ✅ |
| R$ 10 mil a R$ 20 mil              | Medium          | Medium       | ✅ |
| R$ 20 mil a R$ 30 mil              | Medium          | Medium       | ✅ |
| R$ 30 mil a R$ 50 mil              | Large           | Large        | ✅ |
| R$ 50 mil a R$ 75 mil              | Large           | Large        | ✅ |
| R$ 75 mil a R$ 100 mil             | Large           | Large        | ✅ |
| R$ 100 mil a R$ 150 mil            | Enterprise      | Enterprise   | ✅ |
| R$ 150 mil a R$ 200 mil            | Enterprise      | Enterprise   | ✅ |
| R$ 200 mil a R$ 300 mil            | Enterprise      | Enterprise   | ✅ |
| R$ 300 mil a R$ 500 mil            | Enterprise      | Enterprise   | ✅ |
| **R$ 500 mil a R$ 750 mil**        | **Enterprise+** | Enterprise   | ⚠️ divergência |
| **R$ 750 mil a R$ 1 milhão**       | **Enterprise+** | Enterprise   | ⚠️ divergência |
| R$ 1 milhão a R$ 2 milhões         | Enterprise+     | Enterprise+  | ✅ |
| R$ 2 milhões a R$ 3 milhões        | Enterprise+     | Enterprise+  | ✅ |
| ... acima                          | Enterprise+     | Enterprise+  | ✅ |

**Conclusão:** o Tier Mapping está **quase totalmente alinhado** à classificação
oficial. Há **uma única divergência visual/comercial**:

- Faixas **R$ 500 mil → R$ 1 milhão** estão classificadas como `Enterprise+`,
  mas pela regra oficial `Enterprise+` começa apenas em **R$ 1 milhão+**. Essas
  duas faixas deveriam ser `Enterprise`.

### Correção sugerida (NÃO aplicada — aguardando aprovação)

Em `src/lib/leadScoring.ts`, mudar:

```ts
"De R$ 500 mil a R$ 750 mil": "Enterprise",   // hoje: "Enterprise+"
"De R$ 750 mil a R$ 1 milhão": "Enterprise",  // hoje: "Enterprise+"
```

**Impacto:** puramente de **nomenclatura/badge** no painel (`LeadReportsTab`,
drill de leads, ranking de tiers, `enterprise_share` no `rulesEngine`).
**Não afeta MQL**, pois a regra de MQL não depende do nome do tier — depende da
faixa de faturamento diretamente (`MQL_FAIXAS` / `MQL_FATURAMENTO`). Mesmo
assim, **não foi aplicada**.

## 3. Onde o Tier aparece (arquivos)

- `src/lib/leadScoring.ts` — fonte única (`FATURAMENTO_TIER`, `getTierFromFaturamento`, `TierType`)
- `src/components/admin/LeadReportsTab.tsx` — badge de tier, ordenação, export CSV, drill
- `src/lib/rulesEngine.ts` — `enterprise_share` (insights)
- `src/components/admin/InsightsTab.tsx` — consome share Enterprise/Enterprise+
- `src/components/landing/QuizResult.tsx` — exibição opcional pós-quiz

## 4. Onde MQL é avaliado (PRESERVADO — apenas documentação)

Regra atual: **MQL = faturamento ≥ R$ 10 mil/mês** (com `sdr_override !== "Dara"`
em alguns pontos de InsightsTab).

- `src/components/admin/InsightsTab.tsx` — `MQL_FAIXAS` + `isLeadMql` (≥ 10k, exclui Dara)
- `src/components/admin/LeadReportsTab.tsx` — `MQL_FATURAMENTO` + `isMql(lead)`
- `src/components/admin/CreativesTab.tsx` — `MQL_FAT_MIN_FAIXAS`, `mql_count`, `topMql`, CPMQL, drill
- `src/hooks/useLeadNotifications.tsx` — flag visual de notificação
- `src/pages/AdminAnalytics.tsx` — KPIs agregados
- `supabase/functions/admin-data/index.ts` — agrega `mql_count` por criativo (backend)
- `supabase/functions/notify-lead/index.ts` — roteamento WhatsApp/SDR (Caio/Rodger vs Dara)
- `supabase/functions/kommo-webhook/index.ts` — sincronização CRM
- `supabase/functions/fire-capi-events/index.ts` — evento MQL para Meta CAPI
- `src/pages/Obrigado.tsx` / `src/pages/ObrigadoMql.tsx` — páginas de redirect
- `src/lib/rulesEngine.ts` — alertas baseados em `mql_rate`, `cpmql`

### Confirmação explícita

- ✅ `MQL_FAIXAS` **não foi alterado**.
- ✅ `isMQL` / `isLeadMql` / `isMql` **não foram alterados**.
- ✅ `mql_count` (frontend e edge function) **não foi alterado**.
- ✅ Roteamento pós-quiz (`/obrigado` vs `/obrigadomql`) **não foi alterado**.
- ✅ `notify-lead`, Kommo, CAPI, SDR — **não foram alterados**.
- ✅ Banco, RLS, layout, autenticação — **não foram alterados**.

## 5. Riscos de alterar MQL no futuro

Qualquer mudança em `MQL_FAIXAS` / `isMql` é uma **alteração crítica de sistema**
porque cascateia em:

1. **Roteamento WhatsApp** (Caio/Rodger recebem MQLs; Dara recebe não-MQL).
2. **Redirect pós-quiz** (`/obrigadomql` vs `/obrigado`) — discurso ao lead muda.
3. **Kommo (CRM)** — pipelines, etapas e responsáveis dependem da classificação
   no momento da entrada.
4. **Meta CAPI / Pixel** — o evento MQL alimenta a otimização das campanhas.
   Mudar a régua retroativamente “envenena” o algoritmo.
5. **CreativesTab / InsightsTab / LeadReportsTab / AdminAnalytics** —
   `mql_count`, `mql_rate`, `cpmql`, rankings e alertas mudam de patamar,
   quebrando comparação histórica.
6. **Daily Reports** — referências a "MQLs respondidos" perdem continuidade.
7. **Notificações em tempo real** — sons, badges, dashboards.

Qualquer alteração deve ser **release coordenada**, nunca tweak isolado.

## 6. Recomendação de arquitetura futura (NÃO implementar agora)

Hoje, **um único conceito** ("MQL = faturamento ≥ R$ 10k") é usado para
propósitos diferentes. Recomendação: separar em **camadas independentes**:

| Camada               | Responsabilidade                                       | Onde viveria                       |
|----------------------|--------------------------------------------------------|------------------------------------|
| `commercialTier`     | Classificação puramente comercial (Small…Ent+)         | `lib/leadScoring.ts` (já existe)   |
| `sdrEligibility`     | Quem atende (Dara / Caio / Rodger), overrides          | `lib/sdrRouting.ts` (novo)         |
| `marketingMql`       | O que é enviado ao Meta como MQL (CAPI/Pixel)          | `lib/marketingEvents.ts` (novo)    |
| `operationalRouting` | Para qual página redireciona, qual webhook chama       | `lib/postQuizRouting.ts` (novo)    |

Vantagens:
- Mudar a régua de marketing **não** muda quem o SDR atende.
- Mudar quem atende **não** quebra histórico de CPMQL.
- A IA externa (Claude Code) consome cada camada separadamente.

## 7. Selo desta auditoria

- **MQL preservado intencionalmente.** Nenhuma alteração foi feita.
- **Qualquer mudança futura em MQL = alteração crítica de sistema**, com release
  coordenada (frontend + edge functions + Kommo + CAPI + comunicação interna).
- **Nada será implementado** (nem a correção do tier R$ 500k–1M) **sem
  aprovação explícita.**
