-- =====================================================================
--  AUTO MM Servis – prepojenie s Google Kalendárom
--  Spustite v Supabase: SQL Editor → New query → vložiť → Run.  Dá sa spustiť aj opakovane.
-- =====================================================================
alter table public.reservations
  add column if not exists google_event_id text;     -- ID udalosti v kalendári servisu (na úpravu / zmazanie)

grant update (google_event_id) on public.reservations to authenticated;
