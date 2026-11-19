-- =====================================================================
--  AUTO MM Servis – doplnok pre admin panel a e-maily
--  Spustite AŽ PO rezervacie.sql: SQL Editor → New query → vložiť celé → Run.
--  Dá sa spustiť aj opakovane.
-- =====================================================================

-- 1) Nové stĺpce ------------------------------------------------------------
alter table public.reservations
  add column if not exists navrhnuty_datum      date,          -- „Navrhnúť iný termín“
  add column if not exists navrhnuty_cas        text check (char_length(navrhnuty_cas) <= 40),
  add column if not exists sprava_zakaznikovi   text check (char_length(sprava_zakaznikovi) <= 1000),  -- dôvod zamietnutia / odkaz v e-maile
  add column if not exists email_odoslany       timestamptz,   -- kedy dostal zákazník posledný e-mail
  add column if not exists upozornenie_odoslane timestamptz;   -- kedy dostal majiteľ upozornenie na novú rezerváciu

comment on column public.reservations.sprava_zakaznikovi is 'Text pre zákazníka (dôvod zamietnutia, odkaz k potvrdeniu alebo k inému termínu). Ide do e-mailu.';
comment on column public.reservations.poznamka_admina   is 'Interná poznámka – zákazník ju nevidí.';

-- 2) Čo smie admin meniť ---------------------------------------------------------
revoke update on public.reservations from authenticated;
-- (datum / cas_typ / cas: keď zákazník prijme navrhnutý termín a admin ho potvrdí)
grant update (stav, poznamka_admina, navrhnuty_datum, navrhnuty_cas, sprava_zakaznikovi, email_odoslany, datum, cas_typ, cas)
  on public.reservations to authenticated;

-- 3) Upozornenie majiteľovi pri novej rezervácii -----------------------------------
-- Po vložení rezervácie databáza zavolá Edge Function „nova-rezervacia“ (len s číslom rezervácie).
-- Funkcia si údaje načíta sama a pošle e-mail – každú rezerváciu najviac raz.
create extension if not exists pg_net with schema extensions;

create or replace function public.upozorni_na_novu_rezervaciu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url     := 'https://erjopcachzansloyywas.supabase.co/functions/v1/nova-rezervacia',
    body    := jsonb_build_object('id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
end;
$$;

drop trigger if exists po_vlozeni_rezervacie on public.reservations;
create trigger po_vlozeni_rezervacie
  after insert on public.reservations
  for each row execute function public.upozorni_na_novu_rezervaciu();
