-- muse. — esquema e isolamento por usuário
-- Rode inteiro no SQL Editor do Supabase. É idempotente: pode rodar de novo.
--
-- Princípios aplicados aqui:
--   • toda tabela pessoal tem user_id e RLS ligado, sem exceção
--   • policy compara auth.uid() com user_id nas quatro operações
--   • dinheiro em centavos (integer), nunca float
--   • id gerado no cliente é TEXT, não uuid: o app já criava ids em base36
--     antes da nuvem existir, e forçar uuid exigiria remapear dados locais
--     (e toda referência entre eles). Text aceita os dois formatos e mantém
--     a idempotência, que é o que a fila offline precisa de verdade.
--   • atualizado_em serve de critério de conflito (última escrita vence)

create extension if not exists "pgcrypto";

-- ---------- função utilitária de carimbo ----------
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

-- ---------- macro: cria tabela pessoal padrão ----------
-- (repetido explicitamente abaixo para o SQL ficar legível e auditável)

-- =========================================================
-- IDENTIDADE E CONFIGURAÇÃO
-- =========================================================
create table if not exists public.perfis (
  user_id uuid primary key references auth.users on delete cascade,
  nome text,
  peso_kg numeric(5,2), altura_cm integer, idade integer,
  sexo_biologico text check (sexo_biologico in ('F','M')),
  fator_atividade numeric(4,3), objetivo text,
  meta_kcal integer, meta_prot_g integer, meta_carb_g integer, meta_lip_g integer, meta_agua_ml integer,
  estrategia_gasto text default 'fator' check (estrategia_gasto in ('fator','baseline')),
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);

create table if not exists public.config_usuario (
  user_id uuid primary key references auth.users on delete cascade,
  tema text default 'auto' check (tema in ('auto','claro','escuro')),
  modulos jsonb default '{}'::jsonb,
  lembretes jsonb default '{}'::jsonb,
  atualizado_em timestamptz default now()
);

create table if not exists public.consentimentos (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users on delete cascade,
  tipo text not null, versao text not null, aceito boolean not null,
  registrado_em timestamptz default now()
);

create table if not exists public.pedidos_exclusao (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users on delete cascade,
  escopo text not null, estado text not null default 'pendente',
  pedido_em timestamptz default now(), concluido_em timestamptz
);

-- =========================================================
-- ROTINA
-- =========================================================
create table if not exists public.blocos_rotina (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  titulo text not null, categoria text, hora_ini text, hora_fim text,
  recorrencia jsonb not null default '{"tipo":"diaria","dias":[]}'::jsonb,
  data_unica date, arquivado boolean default false,
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);
create index if not exists idx_blocos_user on public.blocos_rotina(user_id) where arquivado = false;

create table if not exists public.registros_rotina (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  bloco_id text not null, dia date not null,
  estado text not null check (estado in ('feito','pulado','adiado')),
  atualizado_em timestamptz default now(),
  unique (user_id, bloco_id, dia, estado)
);
create index if not exists idx_reg_rotina_dia on public.registros_rotina(user_id, dia);

create table if not exists public.prioridades (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, posicao smallint not null, texto text,
  atualizado_em timestamptz default now(),
  unique (user_id, dia, posicao)
);

-- =========================================================
-- ALIMENTAÇÃO E ÁGUA
-- =========================================================
create table if not exists public.itens_refeicao (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, refeicao text not null, nome text not null,
  gramas numeric(8,2), kcal numeric(9,2), prot_g numeric(8,2), carb_g numeric(8,2), lip_g numeric(8,2),
  nutrientes jsonb,                     -- ausência é null, nunca 0
  fonte text not null,                  -- TACO, Open Food Facts, rótulo, CSV
  fonte_versao text, gtin text,
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);
create index if not exists idx_itens_dia on public.itens_refeicao(user_id, dia);

create table if not exists public.alimentos_pessoais (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  nome text not null, por_100 jsonb not null, fonte text, gtin text,
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);

create table if not exists public.cache_codigo_barras (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  gtin text not null, produto jsonb not null,
  fonte text not null default 'Open Food Facts', consultado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  unique (user_id, gtin)
);

create table if not exists public.registros_agua (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, ml integer not null check (ml >= 0),
  atualizado_em timestamptz default now(),
  unique (user_id, dia)
);

-- =========================================================
-- COMPRAS
-- =========================================================
create table if not exists public.listas_compras (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  nome text not null, criada date not null, fechada boolean default false,
  fechada_em date, total_centavos integer,
  atualizado_em timestamptz default now()
);
create table if not exists public.itens_compra (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  lista_id text not null references public.listas_compras(id) on delete cascade,
  nome text not null, quantidade numeric(8,2), unidade text, categoria text,
  observacao text, no_carrinho boolean default false,
  atualizado_em timestamptz default now()
);
create index if not exists idx_itens_compra_lista on public.itens_compra(user_id, lista_id);

-- =========================================================
-- FINANÇAS  (centavos, nunca float)
-- =========================================================
create table if not exists public.transacoes (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, descricao text, categoria text,
  valor_centavos integer not null,
  etiqueta text check (etiqueta in ('essencial','desejo','investimento') or etiqueta is null),
  parcelas_total smallint, origem text,
  criado_em timestamptz default now(), atualizado_em timestamptz default now()
);
create index if not exists idx_transacoes_dia on public.transacoes(user_id, dia);

create table if not exists public.renda (
  user_id uuid primary key references auth.users on delete cascade,
  fixa_centavos integer default 0, extra_centavos integer default 0,
  atualizado_em timestamptz default now()
);

create table if not exists public.orcamentos (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  categoria text not null, limite_centavos integer not null,
  atualizado_em timestamptz default now(),
  unique (user_id, categoria)
);

create table if not exists public.metas_economia (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  nome text not null, alvo_centavos integer not null,
  guardado_centavos integer default 0, prazo date,
  atualizado_em timestamptz default now()
);

-- =========================================================
-- BEM-ESTAR, MEDICAMENTOS, SONO, ATIVIDADE  (dados sensíveis)
-- =========================================================
create table if not exists public.registros_humor (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, humor smallint, energia smallint, sono smallint, nota text,
  atualizado_em timestamptz default now(),
  unique (user_id, dia)
);

create table if not exists public.diario (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, pergunta text, texto text,
  atualizado_em timestamptz default now(),
  unique (user_id, dia)
);

create table if not exists public.contatos_confianca (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  nome text not null, telefone text not null,
  atualizado_em timestamptz default now()
);

create table if not exists public.medicamentos (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  nome text not null, apresentacao text, dose text, horarios text[] not null default '{}',
  inicio date, fim date, instrucao text, ativo boolean default true,
  atualizado_em timestamptz default now()
);

create table if not exists public.registros_medicamento (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  medicamento_id text not null, dia date not null, horario text not null,
  estado text not null default 'tomado' check (estado in ('tomado','adiado','pulado')),
  atualizado_em timestamptz default now(),
  unique (user_id, medicamento_id, dia, horario)
);

create table if not exists public.registros_sono (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, deitou text, acordou text,
  horas smallint, minutos smallint, qualidade smallint check (qualidade between 1 and 5),
  nota text, atualizado_em timestamptz default now(),
  unique (user_id, dia)
);

create table if not exists public.registros_atividade (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, tipo text, nome text not null, met numeric(4,1),
  minutos integer not null, esforco text, kcal_estimadas integer,
  fonte_met text default 'Compendium of Physical Activities 2024', observacao text,
  atualizado_em timestamptz default now()
);
create index if not exists idx_ativ_dia on public.registros_atividade(user_id, dia);

-- =========================================================
-- AUTOCUIDADO
-- =========================================================
create table if not exists public.perfil_capilar (
  user_id uuid primary key references auth.users on delete cascade,
  curvatura text, espessura text, oleosidade text, quimica text, objetivo text,
  inicio_cronograma date, atualizado_em timestamptz default now()
);
create table if not exists public.etapas_capilar (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  etapa text not null check (etapa in ('H','N','R')),
  frequencia_dias smallint not null check (frequencia_dias > 0),
  atualizado_em timestamptz default now(),
  unique (user_id, etapa)
);
create table if not exists public.registros_capilar (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  dia date not null, etapa text not null, produto text,
  resultado text, observacao text,
  atualizado_em timestamptz default now(),
  unique (user_id, dia)
);

-- =========================================================
-- RLS — nenhuma tabela fica de fora
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'perfis','config_usuario','consentimentos','pedidos_exclusao',
    'blocos_rotina','registros_rotina','prioridades',
    'itens_refeicao','alimentos_pessoais','cache_codigo_barras','registros_agua',
    'listas_compras','itens_compra',
    'transacoes','renda','orcamentos','metas_economia',
    'registros_humor','diario','contatos_confianca',
    'medicamentos','registros_medicamento','registros_sono','registros_atividade',
    'perfil_capilar','etapas_capilar','registros_capilar'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists dono_le on public.%I', t);
    execute format('drop policy if exists dono_insere on public.%I', t);
    execute format('drop policy if exists dono_atualiza on public.%I', t);
    execute format('drop policy if exists dono_apaga on public.%I', t);
    execute format('create policy dono_le on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy dono_insere on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy dono_atualiza on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy dono_apaga on public.%I for delete using (auth.uid() = user_id)', t);
    -- carimbo de atualização
    execute format('drop trigger if exists tg_%I_atualizado on public.%I', t, t);
    execute format('create trigger tg_%I_atualizado before update on public.%I for each row execute function public.tocar_atualizado_em()', t, t);
  end loop;
end $$;

-- =========================================================
-- Exclusão de conta: apaga tudo de fato (o cascade cobre as tabelas acima)
-- =========================================================
create or replace function public.apagar_minha_conta()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.apagar_minha_conta() from public;
grant execute on function public.apagar_minha_conta() to authenticated;
