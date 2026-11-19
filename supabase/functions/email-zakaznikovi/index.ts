// E-mail zákazníkovi po zmene stavu. Volá ju admin panel s { id } a prihláseným adminom.
// Rezerváciu číta s právami prihláseného používateľa – kto nie je admin, nič neprečíta (RLS).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json, esc, rows, layout, sendEmail, skDate, skTime } from '../_shared/email.ts';

const PHONE = '0917 973 170';
const p = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
const note = (t: string | null) =>
  t ? `<div style="margin:0 0 16px;padding:12px 14px;border-left:4px solid #1441b5;background:#f2f5fd;white-space:pre-wrap">${esc(t)}</div>` : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  // verejný kľúč, ktorý poslal admin panel (funguje so starými aj novými typmi kľúčov)
  const key = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: isAdmin } = await db.rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'Nemáte oprávnenie.' }, 403);

  const { id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return json({ error: 'missing id' }, 400);
  const { data: r, error } = await db.from('reservations').select('*').eq('id', id).single();
  if (error || !r) return json({ error: 'Rezervácia sa nenašla.' }, 404);

  const termin = `${skDate(r.datum)}, ${skTime(r)}`;
  const detail = rows([['Služba', r.sluzba], ['Termín', termin], ['Auto', r.spz ? `${r.auto} (${r.spz})` : r.auto]]);
  const hi = p(`Dobrý deň${r.meno ? `, ${esc(r.meno.split(' ')[0])}` : ''},`);
  let subject: string, title: string, body: string;

  if (r.stav === 'potvrdena') {
    subject = `Termín potvrdený – ${skDate(r.datum)}`;
    title = 'Váš termín je potvrdený';
    body = hi + p('ďakujeme za objednávku. Tešíme sa na vás:') + detail + note(r.sprava_zakaznikovi) +
      p(`Ak by vám termín nevyhovoval, dajte nám vedieť odpoveďou na tento e-mail alebo na čísle ${PHONE}.`);
  } else if (r.stav === 'zamietnuta') {
    subject = 'Vašu rezerváciu nemôžeme prijať';
    title = 'Rezerváciu nemôžeme prijať';
    body = hi + p('ďakujeme za záujem. Žiaľ, túto rezerváciu nemôžeme prijať:') + detail +
      note(r.sprava_zakaznikovi ? `Dôvod: ${r.sprava_zakaznikovi}` : null) +
      p(`Radi sa s vami dohodneme na inom riešení – zavolajte nám na ${PHONE} alebo odpovedzte na tento e-mail.`);
  } else if (r.stav === 'dokoncena') {
    subject = 'Vaše auto je pripravené';
    title = 'Hotovo – auto je pripravené';
    body = hi + p('práce na vašom aute sú dokončené a auto si môžete vyzdvihnúť.') +
      rows([['Služba', r.sluzba], ['Auto', r.spz ? `${r.auto} (${r.spz})` : r.auto]]) + note(r.sprava_zakaznikovi) +
      p(`Ak máte otázky, zavolajte nám na ${PHONE}. Ďakujeme, že ste si vybrali AUTO MM Servis.`);
  } else if (r.stav === 'zrusena') {
    subject = 'Rezervácia bola zrušená';
    title = 'Rezervácia zrušená';
    body = hi + p('vaša rezervácia bola zrušená:') + detail + note(r.sprava_zakaznikovi) +
      p(`Ak ste sa chceli objednať znova, zavolajte nám na ${PHONE}.`);
  } else if (r.stav === 'caka' && r.navrhnuty_datum) {
    const novy = `${skDate(r.navrhnuty_datum)}${r.navrhnuty_cas ? `, ${r.navrhnuty_cas}` : ''}`;
    subject = `Navrhujeme iný termín – ${skDate(r.navrhnuty_datum)}`;
    title = 'Navrhujeme iný termín';
    body = hi + p(`vami zvolený termín (${esc(termin)}) nemáme voľný. Môžeme vám ponúknuť:`) +
      `<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1441b5">${esc(novy)}</p>` + note(r.sprava_zakaznikovi) +
      p(`Vyhovuje vám? Odpovedzte prosím na tento e-mail alebo zavolajte na ${PHONE} a termín potvrdíme.`);
  } else {
    return json({ error: 'Pre tento stav sa e-mail neposiela.' }, 400);
  }

  try {
    await sendEmail({ to: r.email, subject, html: layout(title, body), replyTo: Deno.env.get('OWNER_EMAIL') ?? undefined });
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
  await db.from('reservations').update({ email_odoslany: new Date().toISOString() }).eq('id', id);
  return json({ ok: true });
});
