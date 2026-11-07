-- Aba "Agentes" do admin (pedido do Rodger em 14/10/2026): ver os agentes trabalhando num lugar só.
-- Os agentes que rodam no PC do Rodger (postagem de Reels, carrossel e, em seguida, stories) gravam aqui com a
-- service role; o painel lê pela edge function agentes-admin. As rotinas do servidor (pg_cron) entram pela
-- função agentes_crons(), sem precisar que cada uma reporte nada.
-- Aplicada pela Management API (este projeto NUNCA usa `db push`).

create table if not exists public.agentes_status (
  agente text primary key,                    -- 'reels', 'carrossel', 'stories', 'agendador'...
  nome text not null,
  descricao text,
  onde_roda text,                             -- 'PC do Rodger' | 'servidor'
  status text not null default 'ok',          -- ok | atencao | erro | parado
  ultima_rodada timestamptz,
  proxima_rodada timestamptz,
  resumo jsonb not null default '{}'::jsonb,  -- filas, contagens, próximos posts: cada agente põe o que importa
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.agentes_eventos (
  id bigint generated always as identity primary key,
  agente text not null,
  tipo text not null,                         -- publicado | erro | gerado | arte | rodada | info
  mensagem text not null,
  link text,
  criado_em timestamptz not null default now()
);
create index if not exists agentes_eventos_agente_criado_idx on public.agentes_eventos (agente, criado_em desc);
create index if not exists agentes_eventos_criado_idx on public.agentes_eventos (criado_em desc);

-- Sem policy: só a service role lê e escreve (agentes locais e a edge function).
alter table public.agentes_status enable row level security;
alter table public.agentes_eventos enable row level security;

-- Rotinas do pg_cron com a última execução de cada uma. "succeeded" do cron quer dizer que o disparo saiu,
-- não que a edge function chamada deu certo.
create or replace function public.agentes_crons()
returns table (jobname text, schedule text, active boolean, ultimo_status text, ultima_execucao timestamptz, falhas_24h bigint)
language sql
security definer
set search_path = public, cron
as $$
  select j.jobname::text, j.schedule::text, j.active,
         u.status::text, u.start_time,
         (select count(*) from cron.job_run_details f where f.jobid = j.jobid and f.status <> 'succeeded' and f.start_time > now() - interval '24 hours')
  from cron.job j
  left join lateral (
    select d.status, d.start_time from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1
  ) u on true
  order by j.jobname;
$$;
revoke all on function public.agentes_crons() from public, anon, authenticated;
grant execute on function public.agentes_crons() to service_role;
