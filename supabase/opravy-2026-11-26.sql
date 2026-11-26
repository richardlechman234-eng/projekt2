-- =====================================================================
--  AUTO MM Servis – opravy po kontrole backendu (2026-11-26)
--  Spustite v Supabase: SQL Editor → New query → vložiť celé → Run.
--  Dá sa spustiť aj opakovane. Beží ako jedna transakcia: ak niečo zlyhá, nezmení sa nič.
--  Spustite AŽ po rezervacie.sql, admin.sql, gdpr.sql (všetky už bežia).
--
--  Čo robí:
--   1) Vkladanie rezervácie už nikdy nezlyhá kvôli upozorneniu (chyba pg_net sa len zaloguje).
--   2) Poistka proti zahlteniu: max 3 rezervácie za hodinu na jeden e-mail/telefón a max 30 za 10 minút
--      celkovo. Platí len pre NOVÉ rezervácie – admin pri úprave starých riadkov nič nenarazí.
--   3) Prísnejšia kontrola e-mailu, mena, auta a telefónu pri vkladaní (len pri INSERT).
--   4) Opakovanie upozornení: každých 5 minút sa znova skúsia rezervácie, o ktorých majiteľ ešte nevie
--      (do 60 minút od vytvorenia). Pri záplave pošle funkcia jeden súhrnný e-mail.
--   5) Ak ich je v 10 minútach už 5+ oznámených, ďalšie sa neposielajú jednotlivo (ostanú na súhrn).
--
--  Chyby, ktoré môže web zobraziť zákazníkovi (text správy začína kódom):
--   RATE_LIMIT_*   príliš veľa rezervácií  (HTTP 400, pole "message" z PostgREST)
--   INVALID_EMAIL / INVALID_PHONE / INVALID_NAME
-- =====================================================================

begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create index if not exists reservations_vytvorene_idx on public.reservations (vytvorene);

-- 1) + 5) Upozornenie majiteľovi – nikdy nezhodí vloženie ------------------------------
create or replace function public.upozorni_na_novu_rezervaciu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    -- záplava: ak už bolo v poslednom 10 minútach oznámených 5+ rezervácií, jednotlivý e-mail sa nepošle
    -- (rezervácia ostane neoznámená a zahrnie ju súhrnný e-mail z opakovania)
    if (select count(*) from public.reservations
         where upozornenie_odoslane > now() - interval '10 minutes') < 5 then
      perform net.http_post(
        url     := 'https://erjopcachzansloyywas.supabase.co/functions/v1/nova-rezervacia',
        body    := jsonb_build_object('id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
    end if;
  exception when others then
    raise warning 'upozorni_na_novu_rezervaciu: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$$;
revoke all on function public.upozorni_na_novu_rezervaciu() from public, anon, authenticated;

drop trigger if exists po_vlozeni_rezervacie on public.reservations;
create trigger po_vlozeni_rezervacie
  after insert on public.reservations
  for each row execute function public.upozorni_na_novu_rezervaciu();

-- 2) + 3) Kontrola a poistka pri vkladaní (len INSERT) --------------------------------
create or replace function public.skontroluj_novu_rezervaciu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tel_koniec text;
begin
  -- e-mail: bez znakov ? & % , ; < > " ' a pod. (mailto odkazy, hlavičky, e-mailová služba)
  if new.email !~ '^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' then
    raise exception 'INVALID_EMAIL: Zadajte platný e-mail.';
  end if;

  if btrim(new.meno) = '' or btrim(new.auto) = '' then
    raise exception 'INVALID_NAME: Meno a auto nesmú byť prázdne.';
  end if;

  -- telefón: čísla, voliteľne + alebo 00 na začiatku; medzery, pomlčky, lomky, bodky, zátvorky sa ignorujú
  if regexp_replace(new.telefon, '[\s/().-]', '', 'g') !~ '^(\+|00)?[0-9]{6,15}$' then
    raise exception 'INVALID_PHONE: Zadajte platné telefónne číslo.';
  end if;

  -- poistka proti zahlteniu
  tel_koniec := right(regexp_replace(new.telefon, '\D', '', 'g'), 9);
  if (select count(*) from public.reservations
       where vytvorene > now() - interval '1 hour'
         and (lower(email) = lower(new.email)
              or right(regexp_replace(telefon, '\D', '', 'g'), 9) = tel_koniec)) >= 3 then
    raise exception 'RATE_LIMIT_CONTACT: Z tohto e-mailu alebo telefónu už prišlo veľa rezervácií. Zavolajte nám prosím.';
  end if;
  if (select count(*) from public.reservations
       where vytvorene > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMIT_GLOBAL: Rezervácie sú dočasne preťažené. Skúste to o chvíľu alebo nám zavolajte.';
  end if;

  return new;
end;
$$;
revoke all on function public.skontroluj_novu_rezervaciu() from public, anon, authenticated;

drop trigger if exists pred_vlozenim_rezervacie on public.reservations;
create trigger pred_vlozenim_rezervacie
  before insert on public.reservations
  for each row execute function public.skontroluj_novu_rezervaciu();

-- 4) Opakovanie upozornení každých 5 minút ---------------------------------------------
-- Zavolá funkciu nova-rezervacia v režime { sweep: true } len vtedy, keď je niečo neoznámené.
create or replace function public.opakuj_upozornenia()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reservations
              where upozornenie_odoslane is null
                and vytvorene > now() - interval '60 minutes'
                and vytvorene < now() - interval '2 minutes') then
    perform net.http_post(
      url     := 'https://erjopcachzansloyywas.supabase.co/functions/v1/nova-rezervacia',
      body    := jsonb_build_object('sweep', true),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  end if;
exception when others then
  raise warning 'opakuj_upozornenia: % (%)', sqlerrm, sqlstate;
end;
$$;
revoke all on function public.opakuj_upozornenia() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'opakuj-upozornenia';
select cron.schedule('opakuj-upozornenia', '*/5 * * * *', 'select public.opakuj_upozornenia()');

commit;
