-- =====================================================================
--  AUTO MM Servis – automatická anonymizácia starých rezervácií (GDPR)
--  Spustite v Supabase: SQL Editor → New query → vložiť celé → Run.  Dá sa spustiť aj opakovane.
--
--  Čo robí: každú noc o 3:15 (UTC) nájde rezervácie, ktorých termín bol pred viac ako 12 mesiacmi,
--  a vymaže z nich osobné údaje (meno, telefón, e-mail, ŠPZ, poznámky, správy). Ostane len služba,
--  dátum, stav a značka auta – na štatistiku, bez možnosti určiť zákazníka.
--  Dobu zmeníte v riadku  interval '12 months'.
-- =====================================================================

alter table public.reservations
  add column if not exists anonymizovane timestamptz;      -- kedy boli osobné údaje odstránené

create or replace function public.anonymizuj_stare_rezervacie()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pocet integer;
begin
  update public.reservations
     set meno               = 'Anonymizované',
         telefon            = '000000',
         email              = 'anonymizovane@invalid.invalid',
         spz                = null,
         poznamka           = null,
         poznamka_admina    = null,
         sprava_zakaznikovi = null,
         anonymizovane      = now()
   where anonymizovane is null
     and datum < ((now() at time zone 'Europe/Bratislava')::date - interval '12 months');
  get diagnostics pocet = row_count;
  return pocet;
end;
$$;

-- túto funkciu smie spustiť len databáza sama (nie web ani admin panel)
revoke all on function public.anonymizuj_stare_rezervacie() from public, anon, authenticated;

-- denné spúšťanie cez pg_cron
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'anonymizacia-rezervacii';
select cron.schedule('anonymizacia-rezervacii', '15 3 * * *', 'select public.anonymizuj_stare_rezervacie()');

-- hneď spracovať aj to, čo je už teraz staršie ako 12 mesiacov (vráti počet anonymizovaných)
select public.anonymizuj_stare_rezervacie() as anonymizovane_teraz;
