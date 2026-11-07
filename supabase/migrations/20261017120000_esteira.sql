-- Esteira do orgânico (/esteira), pedido do Rodger em 17/10/2026: o caminho de cada carrossel e de cada Reel,
-- da copy à publicação, num quadro só, para ele, o Leo e o Oton. Antes o status morava no Drive (a linha
-- "STATUS: REVISADO" no Doc e a pasta arrastada para Aprovados) e na conversa com o Claude.
--
-- Quem escreve:
--   * a edge function `esteira` (as decisões das pessoas: aprovar, pedir ajuste, descartar, mover card de Reel);
--   * o agent do carrossel no PC (01-Projetos/instagram-postagem/esteira.mjs), com a service role:
--     cria o card quando escreve a copy, avança quando a arte fica pronta e quando publica.
-- Aplicada pela Management API (este projeto NUNCA usa `db push`).

create table if not exists public.esteira_pecas (
  codigo text primary key,                      -- 'S7-C1' (carrossel), 'S3-E1' (Reel)
  tipo text not null check (tipo in ('carrossel', 'reel')),
  semana int,
  titulo text,
  dia date,                                     -- dia em que a peça sai no Instagram
  etapa text not null,                          -- ids em supabase/functions/esteira/fluxos.ts
  etapa_desde timestamptz not null default now(),
  ajuste text,                                  -- último pedido de ajuste ainda aberto (some quando a peça avança)
  ajuste_por text,
  ajuste_em timestamptz,
  doc_url text,
  pasta_url text,
  post_url text,
  previas text[] not null default '{}',         -- caminhos no bucket privado `esteira` (miniaturas da arte)
  hash text,                                    -- versão da copy que o agent conhece (carrossel)
  extra jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists esteira_pecas_tipo_etapa_idx on public.esteira_pecas (tipo, etapa);

create table if not exists public.esteira_eventos (
  id bigint generated always as identity primary key,
  codigo text not null,
  acao text not null,                           -- criado | aprovado | ajuste | descartado | movido | agente
  de text,
  para text,
  quem text,                                    -- 'Rodger', 'Leo', 'Oton' (escolhido na tela) ou 'agente'
  mensagem text,
  criado_em timestamptz not null default now()
);
create index if not exists esteira_eventos_codigo_idx on public.esteira_eventos (codigo, criado_em desc);
create index if not exists esteira_eventos_criado_idx on public.esteira_eventos (criado_em desc);

-- Sem policy: só a service role (edge function e agent do PC).
alter table public.esteira_pecas enable row level security;
alter table public.esteira_eventos enable row level security;

-- Miniaturas da arte. Privado: a edge function devolve URL assinada.
insert into storage.buckets (id, name, public) values ('esteira', 'esteira', false) on conflict (id) do nothing;
