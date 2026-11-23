-- Balance Young · Esquema de base de datos para Supabase
-- Ejecuta este archivo completo en Supabase > SQL Editor.
-- Se puede ejecutar varias veces sin problema: no borra datos existentes.
--
-- Qué hace:
--   1) Crea las tablas movimientos, presupuestos y metas (si no existen).
--   2) Activa Row Level Security (RLS) para que cada persona SOLO vea y edite sus propios datos.
--   3) Crea la función delete_my_account() que usa el botón "Eliminar mi cuenta".

-- ========== 1. Tablas ==========
create table if not exists public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo        text not null check (tipo in ('ingreso', 'gasto')),
  monto       numeric(12,2) not null check (monto > 0 and monto <= 1000000),
  descripcion text not null default '' check (char_length(descripcion) <= 80),
  categoria   text not null check (categoria in ('Comida','Transporte','Estudios','Compras','Entretenimiento','Ahorro','Trabajo','Otros')),
  fecha       date not null,
  created_at  timestamptz not null default now()
);
create index if not exists movimientos_user_fecha_idx on public.movimientos (user_id, fecha desc);

create table if not exists public.presupuestos (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  semanal    numeric(12,2) not null default 0 check (semanal >= 0 and semanal <= 1000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.metas (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null default '' check (char_length(nombre) <= 60),
  objetivo   numeric(14,2) not null default 0 check (objetivo >= 0 and objetivo <= 100000000),
  ahorrado   numeric(14,2) not null default 0 check (ahorrado >= 0 and ahorrado <= 100000000),
  updated_at timestamptz not null default now()
);

-- ========== 2. Seguridad (RLS) ==========
alter table public.movimientos  enable row level security;
alter table public.presupuestos enable row level security;
alter table public.metas        enable row level security;

-- Quita permisos a visitantes sin sesión
revoke all on public.movimientos, public.presupuestos, public.metas from anon;
grant select, insert, update, delete on public.movimientos, public.presupuestos, public.metas to authenticated;

drop policy if exists "movimientos_propios" on public.movimientos;
create policy "movimientos_propios" on public.movimientos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "presupuesto_propio" on public.presupuestos;
create policy "presupuesto_propio" on public.presupuestos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "meta_propia" on public.metas;
create policy "meta_propia" on public.metas
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ========== 3. Eliminar mi cuenta ==========
-- Borra al usuario que llama (y, en cascada, todos sus datos). Nadie puede borrar a otra persona.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay sesión iniciada';
  end if;
  delete from public.movimientos  where user_id = uid;
  delete from public.presupuestos where user_id = uid;
  delete from public.metas        where user_id = uid;
  delete from auth.users          where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ========== Comprobación ==========
-- Después de ejecutar, esta consulta debe mostrar "true" en las tres tablas:
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('movimientos','presupuestos','metas');
