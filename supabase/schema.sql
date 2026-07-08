-- Delícias da Tai Calc — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Dashboard -> SQL Editor -> New query -> colar -> Run)

-- Extensão para gen_random_uuid()
create extension if not exists "pgcrypto";

-- =========================================================
-- Tabela: profiles
-- Um perfil por usuário autenticado, criado automaticamente no cadastro.
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Usuário vê o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Usuário atualiza o próprio perfil"
  on public.profiles for update
  using (auth.uid() = id);

-- Cria o perfil automaticamente quando um novo usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- Tabela: ingredients
-- Cadastro reutilizável de ingredientes do usuário.
-- =========================================================
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  package_price numeric not null default 0,
  package_amount numeric not null default 0,
  unit text not null default 'g',
  created_at timestamptz not null default now()
);

alter table public.ingredients enable row level security;

create policy "Usuário gerencia os próprios ingredientes"
  on public.ingredients for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- Tabela: products
-- Produtos/receitas salvos pelo usuário.
-- =========================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  packaging numeric not null default 0,
  extra_costs numeric not null default 0,
  labor numeric not null default 0,
  profit_margin numeric not null default 30,
  yield_amount integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Usuário gerencia os próprios produtos"
  on public.products for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- Tabela: product_ingredients
-- Ingredientes usados em cada produto (com quantidade usada naquela receita).
-- =========================================================
create table if not exists public.product_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  name text not null,
  package_price numeric not null default 0,
  package_amount numeric not null default 0,
  used_amount numeric not null default 0,
  unit text not null default 'g',
  position integer not null default 0
);

alter table public.product_ingredients enable row level security;

create policy "Usuário gerencia os próprios itens de produto"
  on public.product_ingredients for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- Tabela: pricing_history
-- Snapshot de cada cálculo de precificação feito.
-- =========================================================
create table if not exists public.pricing_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  ingredients_cost numeric not null,
  fixed_costs numeric not null,
  total_cost numeric not null,
  suggested_price numeric not null,
  unit_cost numeric not null,
  unit_price numeric not null,
  yield_amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.pricing_history enable row level security;

create policy "Usuário gerencia o próprio histórico"
  on public.pricing_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Índices úteis
create index if not exists ingredients_user_id_idx on public.ingredients (user_id);
create index if not exists products_user_id_idx on public.products (user_id);
create index if not exists product_ingredients_product_id_idx on public.product_ingredients (product_id);
create index if not exists pricing_history_user_id_idx on public.pricing_history (user_id, created_at desc);
