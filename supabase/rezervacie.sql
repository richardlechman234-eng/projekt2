-- =====================================================================
--  AUTO MM Servis – rezervácie (Supabase / PostgreSQL)
--  Spustite celé naraz v Supabase: SQL Editor → New query → vložiť → Run.
--  Skript sa dá spustiť aj opakovane (nič existujúce nezmaže).
-- =====================================================================

-- 1) Tabuľka rezervácií ------------------------------------------------
create table if not exists public.reservations (
  id               bigint generated always as identity primary key,
  sluzba           text        not null check (char_length(sluzba) between 1 and 80),
  datum            date        not null,
  cas_typ          text        not null check (cas_typ in ('dopoludnia', 'popoludni', 'jedno', 'konkretny')),
  cas              time,                                    -- len pri cas_typ = 'konkretny'
  meno             text        not null check (char_length(meno) between 2 and 100),
  telefon          text        not null check (char_length(telefon) between 6 and 30),
  email            text        not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  auto             text        not null check (char_length(auto) between 2 and 100),   -- značka a model
  spz              text                 check (char_length(spz) <= 15),               -- nepovinné
  poznamka         text                 check (char_length(poznamka) <= 1000),
  stav             text        not null default 'caka'
                               check (stav in ('caka', 'potvrdena', 'zamietnuta', 'zrusena', 'dokoncena')),
  poznamka_admina  text,
  vytvorene        timestamptz not null default now(),
  constraint cas_len_pri_konkretnom check ((cas_typ = 'konkretny') = (cas is not null))
);

comment on table  public.reservations is 'Objednávky z webu. Verejnosť ich môže iba vkladať, čítať a meniť ich môže len admin.';
comment on column public.reservations.cas_typ is 'dopoludnia | popoludni | jedno (je mi to jedno) | konkretny (vtedy je vyplnený stĺpec cas)';
comment on column public.reservations.stav    is 'caka | potvrdena | zamietnuta | zrusena | dokoncena';

create index if not exists reservations_datum_idx on public.reservations (datum);
create index if not exists reservations_stav_idx  on public.reservations (stav);

-- 2) Kto je admin --------------------------------------------------------
-- Admin = používateľ zo Supabase Auth, ktorého user_id je v tejto tabuľke.
-- (Nestačí byť len prihlásený – keby sa niekto zaregistroval sám, rezervácie neuvidí.)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;     -- bez pravidiel = z webu sa nedá čítať ani meniť

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 3) Row Level Security --------------------------------------------------
alter table public.reservations enable row level security;

-- verejnosť (aj neprihlásený návštevník) smie iba VLOŽIŤ novú rezerváciu
--   – vždy so stavom „čaká“, bez poznámky admina, s dátumom od dnes do 1 roka
drop policy if exists "verejnost_moze_vlozit" on public.reservations;
create policy "verejnost_moze_vlozit" on public.reservations
  for insert to anon, authenticated
  with check (
    stav = 'caka'
    and poznamka_admina is null
    and datum >= (now() at time zone 'Europe/Bratislava')::date
    and datum <= (now() at time zone 'Europe/Bratislava')::date + 365
  );

-- čítať, meniť a mazať smie iba admin
drop policy if exists "admin_cita" on public.reservations;
create policy "admin_cita" on public.reservations
  for select to authenticated using (public.is_admin());

drop policy if exists "admin_meni" on public.reservations;
create policy "admin_meni" on public.reservations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_maze" on public.reservations;
create policy "admin_maze" on public.reservations
  for delete to authenticated using (public.is_admin());

-- 4) Práva na stĺpce -----------------------------------------------------
-- návštevník smie vyplniť len stĺpce z formulára (nie id, stav, poznámku admina ani dátum vytvorenia)
revoke all on public.reservations from anon;
grant insert (sluzba, datum, cas_typ, cas, meno, telefon, email, auto, spz, poznamka)
  on public.reservations to anon;
revoke all on public.reservations from authenticated;
grant insert (sluzba, datum, cas_typ, cas, meno, telefon, email, auto, spz, poznamka),
      select, update (stav, poznamka_admina), delete
  on public.reservations to authenticated;
revoke all on public.admins from anon, authenticated;

-- =====================================================================
--  5) Pridanie admina (spustiť AŽ po vytvorení používateľa v Authentication → Users)
--     E-mail nahraďte e-mailom admina a spustite tento riadok zvlášť:
--
--  insert into public.admins (user_id)
--  select id from auth.users where email = 'admin@example.sk'
--  on conflict do nothing;
-- =====================================================================
