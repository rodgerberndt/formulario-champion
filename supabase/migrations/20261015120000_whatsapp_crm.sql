-- WhatsApp no CRM (app "Champion CRM Mensagens", Cloud API).
-- Uma linha por pessoa e uma por mensagem, no mesmo desenho do Champion Direct.

create table if not exists public.wa_contatos (
  wa_id text primary key,              -- telefone em formato internacional, só dígitos
  nome text,                           -- nome do perfil no WhatsApp
  lead_id uuid,                        -- lead com o mesmo telefone, quando existe
  ultima_msg_em timestamptz,           -- última mensagem DA PESSOA (abre a janela de 24h)
  ultima_interacao_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create table if not exists public.wa_mensagens (
  wamid text primary key,
  wa_id text not null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  autor text not null default 'contato' check (autor in ('contato', 'crm', 'app')), -- app = enviada pelo celular (coexistência)
  tipo text not null default 'text',
  texto text,
  status text,                         -- sent / delivered / read / failed (só saída)
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists wa_mensagens_wa_id_idx on public.wa_mensagens (wa_id, criado_em);
create index if not exists wa_mensagens_criado_idx on public.wa_mensagens (criado_em desc);

create table if not exists public.wa_webhook_eventos (
  id bigserial primary key,
  recebido_em timestamptz not null default now(),
  corpo jsonb not null
);

alter table public.wa_contatos enable row level security;
alter table public.wa_mensagens enable row level security;
alter table public.wa_webhook_eventos enable row level security;
