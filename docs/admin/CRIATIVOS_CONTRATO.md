# `GET /admin-data/creatives` — o contrato, depois de 18/09/2026

Este arquivo existe por um motivo só: a aba **Criativos** foi corrigida em
18/09/2026 e a correção **mudou o significado de uma chave que já existia**
(`avg_lead_score`) enquanto adicionava outras. Quem for mexer nessa rota ou em
`CreativesTab.tsx` precisa saber qual é qual.

A auditoria que motivou tudo está resumida nos comentários de
`supabase/functions/admin-data/identidade_criativo.ts`.

---

## 1. A linha é o par (CONTA, ANÚNCIO)

Até 18/09 a chave de agregação era o **nome normalizado** do anúncio. Nome não
é identidade: `luis-nathan-case-2-v3` engolia **24 `ad_id` de 3 contas**, e as
somas batiam exatamente — Case Ighor #7 = 268,88 (CA02) + 36,82 (CA05) = 305,70;
H2 = 95,07 + 31,20 + 11,90 = 138,17. O painel mostrava R$ 176,75 por MQL para o
V3, um número que não existia em conta nenhuma (as reais: **255,50** na CA05,
**150,16** na CA02, **180,14** na CA03).

A resolução mora em `identidade_criativo.ts` e é a mesma regra de
`contas_desempenho.ts`: **ID manda, nome é apresentação**.

### Chaves NOVAS em cada item de `creatives[]`

| chave | o que é |
|---|---|
| `row_key` | **a chave da linha**: `${ad_account_id}::${ad_id}`, ou `nome::<chave>`, `previa-gerenciador`, `direct-link-in-bio`. É o que a tela usa como identidade de linha, chave de React e chave dos "extras". |
| `ad_id` | o anúncio da linha. Nulo nos baldes e nas linhas de nome ambíguo. |
| `ad_account_id` / `account_name` | a conta da linha (a conta em que o `ad_spend` registrou o anúncio). |
| `identidade_metodo` | `ad_id` · `utm_content_id` · `nome_unico` · `nome_ambiguo` · `previa` · `sem_atribuicao`. Método fraco é para aparecer. |

### Chaves que MUDARAM de significado

| chave | antes | agora |
|---|---|---|
| `creative_key` | a chave da linha | a identidade do **criativo** (nome normalizado). **Duas linhas podem compartilhá-la** — é por ela que a soma opcional junta, e é a forma gravada em `manual_sales.creative_key` / `meetings.creative_key`, por isso não pode mudar de formato. |
| `leads_separaveis_por_conta` | sempre `false` | `true` quando a linha tem `ad_id` (ou seja, quase sempre). |
| `contas[]` / `fusao_de_contas` | a lista das contas fundidas na linha | a linha já é de uma conta só, então `contas` tem 0 ou 1 item e `fusao_de_contas` é sempre `false`. Ficam como **prova**: se voltarem a ter mais de um item, a fusão voltou. |

Nenhuma chave foi removida.

---

## 2. Tx.Qualif. — duas réguas de score nunca entram na mesma média

`v2.3` (quiz de 14 passos, seis componentes) e `v3-form` (formulário curto da
landing, só faturamento + mercado renormalizados) são ambas 0–100 e **não são a
mesma régua**. Medido em setembro, na mesma faixa de faturamento:

| faixa | v2.3 | v3-form |
|---|---|---|
| Não vendo ainda | 20,0 | 5,0 |
| Até R$ 5 mil | 42,5 | 9,0 |
| De R$ 10 a 20 mil | 43,8 | 20,0 |
| setembro inteiro | 52,8 (n=34) | 11,8 (n=4) |

| chave | o que é |
|---|---|
| `avg_lead_score` | **mudou de significado**: agora é a média da **versão dominante** da linha, não a média de todos os leads. Mesmo nome e mesmo tipo, para o front não quebrar. |
| `score_por_versao` | `{ "v2.3": { media, n }, "v3-form": { media, n } }` — cada régua separada. |
| `score_versao_dominante` | a versão com mais leads na linha. |
| `score_misturado` | `true` quando a linha tem mais de uma régua. |
| `score_leads_fora_da_media` | quantos leads ficaram fora da média mostrada. |

As mesmas cinco chaves existem em `campaigns_performance[]`,
`variants_performance[]` e em `totals`.

**O corte de HQL não foi tocado** — ele já era por versão (`ehHighQualityLead`,
73 no quiz e 67 no formulário) e continua igual.

---

## 3. Prévia do Gerenciador é um balde próprio

Clique em **prévia de anúncio** dentro do Gerenciador entrega a macro CRUA na
URL (`ad_id={{ad.id}}`). Em 16/09/2026 um lead (score 89) nasceu com os três IDs
como macro literal no banco e entrou na tabela como tráfego.

`sanitizarIdentificador` é a única porta de entrada de
`campaign_id`/`adset_id`/`ad_id`/`utm_*` na rota, e qualquer macro manda o
registro para `previa-gerenciador` — **separado do orgânico**.

| chave | onde | o que é |
|---|---|---|
| `data_quality.leads_previa_gerenciador` | `/creatives` | quantos leads eram prévia. |
| `data_quality.identidade_por_metodo` | `/creatives` | quantas linhas por método de identificação. |
| `leads_previa` | `/contas-desempenho` | mesma coisa, na outra visão. |

---

## 4. Fuso

`ad_spend.date` é o dia **no fuso da conta** (`date_start` com
`time_increment=1`); leads e sessões são filtrados em UTC contra um `from`/`to`
já convertido do fuso do navegador. Hoje não há deslocamento porque as três
contas que gastam são UTC−3, igual ao BRT — **coincidência de cadastro, não
desenho**.

```jsonc
"fuso": {
  "padrao": "America/Sao_Paulo",   // usado quando a conta não declara o dela
  "offset_filtro_min": -180,       // deduzido do `from` recebido
  "divergencia": false,            // true = gasto e leads podem falar de dias diferentes
  "contas": [{ "ad_account_id", "account_name", "timezone_name", "fuso_usado", "offset_min", "divergente" }]
}
```

O fuso por conta vem de `meta_ad_accounts.timezone_name`, criado pela migration
`20260918160000_fuso_da_conta_de_anuncio.sql` (opcional — a rota lê a coluna
defensivamente e cai no padrão se ela não existir).

Dois usos de UTC que estavam tortos e foram corrigidos: o **mês do CAC**
(`hojeISO`) e o corte de "ativo" (`threeDaysAgo` / `tresDiasAtras`), ambos agora
pelo dia no fuso da conta. O primeiro fazia o mês virar às 21:00 BRT do último
dia do mês.

---

## 5. A soma por criativo continua existindo — mas explícita

A tela tem o botão **"Somar por criativo"**, desligado por padrão. Quando ligado,
`src/lib/criativosAgregado.ts` junta as linhas que compartilham `creative_key`,
recalculando **toda derivada sobre os totais** (nunca média de taxas), mantendo
as réguas de score separadas, e acrescentando `linhas_somadas`, `contas_somadas`
e `contas_na_soma[]`. A linha somada não finge pertencer a uma conta:
`ad_account_id` e `ad_id` saem nulos e `identidade_metodo` vira `"agregado"`.

---

## Testes

- `scripts/testar-identidade-criativo.mjs` — as funções puras dos dois módulos (79 verificações, sem banco).
- `scripts/testar-desempenho-conta.mjs` — a outra visão por ID, com dados reais.
