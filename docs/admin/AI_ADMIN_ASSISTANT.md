# AI Admin Assistant — Edge Function `ai-admin-assistant`

Camada segura para uma IA externa (ex. Claude Code) **ler** o /admin e **propor ações com Approval Gate**.

> **Nada de MQL, roteamento, Kommo, CAPI, notify-lead ou Meta Ads cron foi alterado.**
> A regra de MQL (`MQL_FAIXAS`, `isMql`, `isLeadMql`, `mql_count`) permanece intocada.
> Roteamento `/obrigado` e `/obrigadomql` permanece intocado.
>
> ⚠️ **Status do Kommo (Abril/2026): LEGADO.**
> A Champion **não usa mais Kommo como CRM principal**. Endpoints e logs do Kommo permanecem disponíveis **somente para histórico/debug**. **Não** devem ser usados como fonte de verdade para análise comercial, e a IA externa **não deve priorizar** correções de `kommo_status=pending` ou `kommo_logs` com `failed`.

---

## 1. Arquitetura

- `supabase/functions/ai-admin-assistant/index.ts` — roteador principal
- `auth.ts` — API key (Bearer) + HMAC-SHA256 + admin JWT (HS256)
- `sanitizer.ts` — denylist global de chaves sensíveis (password/secret/token/etc.)
- `filters.ts` — datas em America/Sao_Paulo (UTC-3)
- `queries.ts` — leituras (NÃO escreve)
- `approval.ts` — Approval Gate. Hard blocks NÃO executam automaticamente
- `logger.ts` — registra acessos em `ai_assistant_access_log`

### Tabelas criadas

- `ai_assistant_access_log` — toda leitura/POST registrada
- `ai_assistant_proposed_actions` — propostas (status: pending → approved/rejected → executed/failed/expired)
- `ai_assistant_action_log` — execuções aplicadas

RLS: estrita. Anon e authenticated **não** acessam. Apenas service role (Edge Function).

---

## 2. Secrets necessários

Já criados:
- `AI_ADMIN_ASSISTANT_API_KEY` — Bearer token usado pela IA externa
- `AI_ADMIN_ASSISTANT_HMAC_SECRET` — segredo do HMAC para POSTs
- `ADMIN_JWT_SECRET` — já existia (usado por `admin-login`)
- `SUPABASE_SERVICE_ROLE_KEY` — já existia

---

## 3. Endpoints

Base: `https://<project-ref>.functions.supabase.co/ai-admin-assistant`

### Leitura (GET) — apenas API key

| Path | Descrição |
|------|-----------|
| `/health` | Status |
| `/summary` | Totais agregados |
| `/leads` | Leads (sanitizado, sem `raw_answers_json` por padrão) |
| `/sessions` | Sessões |
| `/meetings` | Reuniões |
| `/manual-sales` | Vendas manuais |
| `/daily-reports` | Relatórios diários |
| `/ad-spend` | Spend Meta Ads |
| `/kommo-logs` | ⚠️ **LEGADO** — Logs Kommo (sanitizado). Apenas histórico/debug. Não usar como fonte de verdade. |
| `/proposals?status=pending` | Listar propostas |

Query params suportados:
- `start_date=YYYY-MM-DD` e `end_date=YYYY-MM-DD` — interpretadas como dias do calendário **America/Sao_Paulo**
- `limit` (≤500)
- `include_raw_answers=true` — habilita `raw_answers_json` (somente quando explícito; gera flag `contains_sensitive_free_text`)

### Ações (POST) — API key + HMAC obrigatórios

| Path | Headers extra | Descrição |
|------|---------------|-----------|
| `/propose-action` | — | Cria proposta. Hard blocks ficam só como plano. |
| `/approve-action` | `x-admin-token` | Aprova (exige JWT do admin logado) |
| `/reject-action` | `x-admin-token` | Rejeita |
| `/execute-approved-action` | — | Executa soft action aprovada (≤1h após aprovação) |

### HMAC

```
x-timestamp: <unix seconds>
x-signature: hex( HMAC-SHA256( AI_ADMIN_ASSISTANT_HMAC_SECRET, "<x-timestamp>.<raw-body>" ) )
```

- Janela de 5 min para timestamp
- Comparação timing-safe
- Rejeita se body adulterado

---

## 4. Hard blocks (NUNCA executam automaticamente)

Mesmo aprovados, geram apenas plano (`requires_manual_execution: true`):
- alterar código, layout, Edge Function, auth, secret, migration, schema, RLS
- alterar **MQL**, roteamento, Kommo config, CAPI config, Meta Ads cron

## 5. Soft-executable (executam após aprovação humana, ≤1h)

- `update_lead_lido`
- `update_lead_sdr_override`
- `insert_manual_sale` / `update_manual_sale`
- `insert_meeting` / `update_meeting_attended`
- `insert_daily_report` / `update_daily_report`

---

## 6. Sanitização

Denylist global (recursiva) para chaves contendo:
`password, secret, token, service_role, jwt, vapid, api_key, apikey, access_token, refresh_token, authorization, private_key, client_secret, webhook_secret`

→ valor substituído por `[REDACTED]` em qualquer profundidade.

`raw_answers_json` é **omitido** por padrão. Aparece apenas com `include_raw_answers=true` + flag `contains_sensitive_free_text: true` + warning explícito + log no `access_log`.

---

## 7. Exemplos de curl

### Health
```bash
curl -H "Authorization: Bearer $AI_ADMIN_ASSISTANT_API_KEY" \
  https://<ref>.functions.supabase.co/ai-admin-assistant/health
```

### Leads dos últimos 7 dias (timezone São Paulo)
```bash
curl -H "Authorization: Bearer $AI_ADMIN_ASSISTANT_API_KEY" \
  "https://<ref>.functions.supabase.co/ai-admin-assistant/leads?start_date=2026-04-22&end_date=2026-04-29&limit=200"
```

### Propor ação (com HMAC)
```bash
BODY='{"action_type":"update_lead_lido","target":"leads","proposed_change":{"lead_id":"<uuid>","lido":true},"expected_impact":"Marcar lead como lido","risks":"Nenhum","rollback_plan":"UPDATE leads SET lido=false WHERE id=<uuid>"}'
TS=$(date +%s)
SIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$AI_ADMIN_ASSISTANT_HMAC_SECRET" -hex | awk '{print $2}')
curl -X POST \
  -H "Authorization: Bearer $AI_ADMIN_ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-timestamp: $TS" -H "x-signature: $SIG" \
  -d "$BODY" \
  https://<ref>.functions.supabase.co/ai-admin-assistant/propose-action
```

### Aprovar (admin no /admin)
- Abrir aba **AI Proposals** em `/admin`
- Clicar **Aprovar** → confirmação dupla
- Frontend assina com HMAC, envia `x-admin-token` (JWT da sessão admin)

### Executar ação aprovada (Claude Code)
```bash
BODY='{"approval_id":"<uuid>"}'
TS=$(date +%s); SIG=$(printf "%s.%s" "$TS" "$BODY" | openssl dgst -sha256 -hmac "$AI_ADMIN_ASSISTANT_HMAC_SECRET" -hex | awk '{print $2}')
curl -X POST -H "Authorization: Bearer $AI_ADMIN_ASSISTANT_API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-timestamp: $TS" -H "x-signature: $SIG" \
  -d "$BODY" \
  https://<ref>.functions.supabase.co/ai-admin-assistant/execute-approved-action
```

---

## 8. Conectando ao Claude Code

Configure variáveis no Claude Code:
- `AI_ADMIN_BASE_URL` = `https://<ref>.functions.supabase.co/ai-admin-assistant`
- `AI_ADMIN_API_KEY` = valor de `AI_ADMIN_ASSISTANT_API_KEY`
- `AI_ADMIN_HMAC_SECRET` = valor de `AI_ADMIN_ASSISTANT_HMAC_SECRET`

Fluxo recomendado:
1. Claude lê `/summary`, `/leads`, etc. para diagnóstico
2. Claude propõe via `/propose-action` (recebe `approval_id`)
3. Você aprova no `/admin` → aba **AI Proposals**
4. Claude executa via `/execute-approved-action` (≤1h após aprovação)
5. Hard blocks: Claude apenas devolve o plano para você executar manualmente

---

## 9. Confirmações finais

- ✅ MQL não foi alterado (`MQL_FAIXAS`, `isMql`, `isLeadMql`, `mql_count` intocados)
- ✅ Roteamento `/obrigado` e `/obrigadomql` intocado
- ✅ `notify-lead`, Kommo, CAPI, Meta Ads cron intocados
- ✅ Nenhum secret aparece nas respostas (denylist global)
- ✅ Hard blocks nunca executam automaticamente
- ✅ RLS estrita nas 3 novas tabelas (apenas service role)
- ✅ HMAC obrigatório em todos os POSTs
- ✅ `x-admin-token` obrigatório em approve/reject
- ✅ Aprovação expira em 1h
- ✅ Toda leitura e ação registradas em `ai_assistant_access_log` / `action_log`
