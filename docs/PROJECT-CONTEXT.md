# PROJECT-CONTEXT — Formulário Champion

> Carregado na Fase 1 do [Protocolo de Execução](../../../docs/PROTOCOLO-DE-EXECUCAO.md) antes de qualquer mexida neste projeto.
> Dono: Rodger · Criado: 2026-09-24 · Revisado: 2026-09-24
> Template: `squads/nexus-champion/templates/contexto-projeto.md`

## Em uma frase

Landing de captação com quiz de qualificação e painel administrativo: recebe o tráfego pago da Meta, pontua o lead, dispara eventos para a Meta e entrega a leitura do funil para o Rodger.

## Estado atual

- **Em produção?** Sim. Landing pública + `/admin` protegido.
- **Quem acessa:** o público vem de anúncios da Meta; o admin é do Rodger e do time comercial.
- **Volume real (30 dias até 23/09/2026):** 6.533 sessões, 5.491 de gente, 172 leads, 22 HQL73, 22 reuniões, 6 vendas.
- **Código em produção == repo?** Não verificado nesta data. Enquanto não for, tratar como **débito bloqueante** ao mexer (regra da classe `codigo-brownfield`).

## Stack e como roda

- **Front:** Vite + React + TypeScript + Tailwind (shadcn/ui). Gráficos em Recharts, validação em Zod.
- **Back:** Supabase — Postgres + 24 edge functions em Deno.
- **Scripts:** `npm run dev` · `npm run build` · `npm run lint` · `npm run preview`. **Não há script de teste nem de typecheck** — ver débito abaixo.
- **Banco:** 42 tabelas. As que importam: `lead_sessions`, `leads`, `quiz_leads`, `landing_hits`, `ad_spend`, `meetings`, `manual_sales`, `meta_ads_cache`, `capi_events_log`.
- **Migrations:** `supabase/migrations/`, nomeadas por timestamp. **Nunca rodar `db push`** — SQL vai pela Management API com o token `sbp_`.
- **Segredos:** `.env` na raiz do repo (Supabase URL, anon, service role). Os segredos da Meta e do WhatsApp vivem **só** nos secrets do Supabase e voltam hasheados do painel — não são recuperáveis.

## Regras específicas deste projeto

1. **O deploy publica o disco inteiro**, não a mudança. Conferir o diff de rotas antes. Push no GitHub não publica.
2. **Verificar deploy pela `pages.dev`**, nunca pelo `www` — o Cloudflare cacheia por um ano.
3. Clicar numa opção do quiz **não avança de tela**: o lead precisa poder corrigir.
4. Variante de página se lê por **`first_page`**, nunca por `utm_term`.
5. Sem travessão em copy que vai para o lead.
6. As rotas `/HD0` a `/HD4` e `/SH0` a `/SH6` seguem no ar: há anúncios apontando para elas.

## Decisões que valem

- [ADR - Adotar o Protocolo de Execução](../../../02-Areas/Empresa/Decisoes/ADR-20260923-adotar-protocolo-de-execucao.md)
- Atribuição: vale o **último clique até virar lead**; nada depois conta.
- Score **≥ 73** é o portão: responde por 98% da receita com 16% dos leads.
- Desde 24/09/2026, a leitura padrão do painel é **só a CA02** — é a única conta em veiculação e a que tem atribuição confiável (898 de 900 sessões com `ad_id`).

## Débitos abertos que tocam este projeto

Registro completo em [docs/DEBITOS.md](../../../docs/DEBITOS.md).

| ID | O que | Bloqueante |
|---|---|---|
| D-007 | crawler da Meta dispara `started_quiz`: 73% dos inícios em 7 dias | sim, para teste A/B |
| D-009 | 66% dos leads sem `session_id` | sim, para leitura por criativo |
| D-010 | `quiz_leads` (182) e `leads` (170) discordam | sim, para número de lead |
| D-018 | perda de atribuição de página não é uniforme entre variantes | sim, para teste de página |
| D-019 | `ad_spend.clicks` é clique total, não clique de link | sim, para CTR |
| D-021 | `fbp` gravado em 13,6% das sessões, só no envio | sim, para first touch |
| D-006 / D-013 | painel conta crawler e escritório como pessoa | não |
| D-011 | 474 de 684 linhas de investimento sem prova de câmbio | não |
| D-012 | venda de R$ 8.000 sem `lead_id` | não |
| D-015 | `landing_hits` cobre 51,6% das sessões | não |

## Mapa do código (só o que importa)

```
src/
├── App.tsx                     rotas, incluindo as variantes HD/SH geradas do config
├── config/headlineVariants.ts  as variantes de headline; mexer aqui exige mexer em admin-data
├── hooks/usePresence.tsx       o "ao vivo" do admin; não filtra bot (D-006)
├── pages/AdminAnalytics.tsx    o painel; todo hook novo vai ACIMA das saídas antecipadas
└── integrations/supabase/      client e tipos gerados

supabase/functions/
├── admin-data/       o que alimenta o painel
├── meta-ads-sync/    traz gasto e métricas da Meta para ad_spend
├── hermes/           agente de tráfego: sobe e corta anúncio (meta.ts fala com a Graph API)
├── fire-capi-events/ envia eventos para a Meta
└── landing-hit/      registra a chegada na landing
```

## Integrações e segredos

- **Meta Graph API** — token em `META_ACCESS_TOKEN` (secret do Supabase). Contas em **dólar**; conversão para BRL via `exchange_rate` no `ad_spend`.
- **WhatsApp / WAHA** — notificação de lead novo.
- **Kommo** — CRM; **não está em uso** (todos os 172 leads em `pending`).
- **Google Calendar** — agendamento de reunião.

## Histórico curto

| Data | O que mudou |
|---|---|
| 2026-09-11 | `score_breakdown` e `HighQualityLead` deployados |
| 2026-09-18 | último toque pago na sessão, atribuição em uma ida |
| 2026-09-21 | resgate por IP com janela (60min/24h), `attribution_confidence` |
| 2026-09-22 | a fila comercial virou a lista de leads |
| 2026-09-24 | este arquivo nasceu, quitando parte do D-002 |

## Próximas stories

As três da frente de instrumentação: `fbp` na entrada da sessão (D-021), `inline_link_clicks` no sync (D-019), destino do anúncio no HERMES (D-014).
