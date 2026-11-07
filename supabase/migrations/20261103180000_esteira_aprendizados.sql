-- Aprendizados da esteira (/esteira, aba "Aprendizados"), pedido do Rodger em 03/11/2026: o time (Rodger, Leo, Oton)
-- vê, em tempo real, as melhorias que os squads e o Claude entenderam nas revisões e gravaram para os próximos
-- carrosséis, Reels e capas.
--
-- Quem escreve: só o script do PC `01-Projetos/instagram-postagem/aprendizados.mjs` (service role), a cada 10 min pela
-- tarefa "Champion Aprendizados - sincronizar esteira". Ele lê as memórias de conteúdo do Claude, o repertório do squad
-- social e as atas das gravações, passa pelo filtro de temas PERMITIDOS e faz upsert pela `chave`.
-- Quem lê: a edge function `esteira` (GET devolve os 200 mais novos).
-- Aplicada pela Management API (este projeto NUNCA usa `db push`).

create table if not exists public.esteira_aprendizados (
  id bigint generated always as identity primary key,
  chave text not null unique,                   -- estável entre rodadas: origem + arquivo + seção + título (upsert)
  area text not null check (area in ('carrossel', 'consciente', 'reel', 'capa', 'copy', 'direct', 'geral')),
  titulo text not null,
  regra text not null,
  porque text,
  origem text not null check (origem in ('memória', 'squad', 'ata')),
  arquivo text,                                 -- nome do arquivo de onde saiu (sem caminho de máquina)
  data_regra date,                              -- dia em que a regra foi dita ou gravada
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now() -- muda só quando o texto muda: é o que acende o selo "Novo"
);
create index if not exists esteira_aprendizados_data_idx on public.esteira_aprendizados (data_regra desc, atualizado_em desc);

-- Sem policy, igual a esteira_pecas: só a service role (edge function e script do PC).
alter table public.esteira_aprendizados enable row level security;
