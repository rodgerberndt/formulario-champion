-- Champion Direct: automação de DM do Instagram (substitui o ManyChat).
-- Doc: 01-Projetos/champion-direct/docs/ENGENHARIA-REVERSA-MANYCHAT.md
-- Aplicada pela Management API (este projeto não usa db push).

-- Configuração viva (token do Instagram, renovado sozinho pelo webhook).
create table if not exists public.ig_config (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

-- Quem falou com a conta.
create table if not exists public.ig_contatos (
  igsid text primary key,
  username text,
  nome text,
  foto_url text,
  segue boolean,
  seguidores integer,
  primeira_em timestamptz not null default now(),
  ultima_msg_em timestamptz,          -- última mensagem DO USUÁRIO: abre a janela de 24h
  ultima_interacao_em timestamptz not null default now(),
  tags text[] not null default '{}',
  campos jsonb not null default '{}',
  aguardando jsonb,                   -- {automacao_id, passo, campo, proximo} quando um passo pede resposta digitada
  optout boolean not null default false,
  pausado_ate timestamptz,            -- humano respondeu pelo app: bot fica quieto até aqui
  perfil_atualizado_em timestamptz
);

-- As automações. passos = [{id, texto, botoes[], opcoes[], tags[], coletar{}, proximo, exigir_seguir}]
create table if not exists public.ig_automacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default false,
  gatilho text not null check (gatilho in ('comentario','dm','story','ref')),
  palavras text[] not null default '{}',   -- vazio = qualquer texto
  midias text[] not null default '{}',     -- só para comentario; vazio = qualquer post
  ref text,                                -- só para ref (ig.me/m/conta?ref=X)
  respostas_publicas text[] not null default '{}',
  passos jsonb not null default '[]',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Tudo que aconteceu, para os contadores.
create table if not exists public.ig_execucoes (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  automacao_id uuid references public.ig_automacoes(id) on delete set null,
  igsid text,
  tipo text not null,      -- disparo | envio | opcao | clique | coleta | erro | optout | pausa | portao
  passo text,
  detalhe jsonb
);
create index if not exists ig_execucoes_auto_idx on public.ig_execucoes (automacao_id, tipo);
create index if not exists ig_execucoes_igsid_idx on public.ig_execucoes (igsid, criado_em desc);

-- Mensagens que NÓS enviamos: o eco que não estiver aqui foi um humano pelo app.
create table if not exists public.ig_enviadas (
  mid text primary key,
  igsid text,
  automacao_id uuid,
  criado_em timestamptz not null default now()
);

-- Um comentário dispara uma vez só (a Meta reenvia evento).
create table if not exists public.ig_comentarios_processados (
  comment_id text primary key,
  criado_em timestamptz not null default now()
);

alter table public.ig_config enable row level security;
alter table public.ig_contatos enable row level security;
alter table public.ig_automacoes enable row level security;
alter table public.ig_execucoes enable row level security;
alter table public.ig_enviadas enable row level security;
alter table public.ig_comentarios_processados enable row level security;

-- Contadores por automação para o painel.
create or replace function public.ig_contadores()
returns table (automacao_id uuid, tipo text, total bigint, pessoas bigint)
language sql stable security definer set search_path = public as $$
  select automacao_id, tipo, count(*), count(distinct igsid)
  from public.ig_execucoes where automacao_id is not null
  group by 1, 2
$$;
revoke all on function public.ig_contadores() from public, anon, authenticated;
-- Champion Direct v2 (14/10/2026): conversa guardada e origem do contato.
create table if not exists public.ig_mensagens (
  mid text primary key,
  igsid text not null,
  direcao text not null check (direcao in ('entrada','saida')),
  autor text not null,            -- contato | robo | humano | manychat
  texto text,
  anexo jsonb,
  automacao_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists ig_mensagens_igsid_idx on public.ig_mensagens (igsid, criado_em);
alter table public.ig_mensagens enable row level security;

alter table public.ig_contatos add column if not exists origem text;          -- seguidor | comentario | dm | story | ref
alter table public.ig_contatos add column if not exists origem_detalhe jsonb;  -- {post, permalink, palavra, automacao}
alter table public.ig_contatos add column if not exists lead_id uuid;

-- Champion Direct v3 (14/10/2026): campanha da automação e CAPI fora do lead de DM.
alter table public.ig_automacoes add column if not exists campanha text;

-- Lead orgânico vindo do Direct não é conversão de anúncio: não vai para a Meta.
create or replace function public.notify_capi_on_lead_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
BEGIN
  IF NEW.attribution_source = 'instagram_dm' THEN
    INSERT INTO public.capi_dispatch_log (origem, lead_id, status, detalhe)
    VALUES ('trigger', NEW.id, 'ignorado', 'lead do Champion Direct (DM do Instagram)');
    RETURN NEW;
  END IF;
  PERFORM public.despachar_capi_lead(NEW.id, 'trigger');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_capi_on_lead_insert: %', SQLERRM;
  RETURN NEW;
END;
$function$;
