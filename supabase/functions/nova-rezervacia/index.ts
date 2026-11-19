// Upozornenie majiteľovi: volá ju databáza (trigger po vložení rezervácie) s { id }.
// Údaje si načíta sama a e-mail pošle každej rezervácii najviac raz a len do 15 minút
// od vytvorenia – cudzí človek ňou teda nemôže majiteľa zahltiť.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json, esc, rows, layout, sendEmail, skDate, skTime } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return json({ error: 'missing id' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // „zaber“ rezerváciu: označ ju ako oznámenú, iba ak ešte nebola a je čerstvá
  const { data: r, error } = await db
    .from('reservations')
    .update({ upozornenie_odoslane: new Date().toISOString() })
    .eq('id', id)
    .is('upozornenie_odoslane', null)
    .gte('vytvorene', new Date(Date.now() - 15 * 60_000).toISOString())
    .select()
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!r) return json({ ok: true, skipped: true });

  const owner = Deno.env.get('OWNER_EMAIL');
  if (!owner) return json({ error: 'Chýba OWNER_EMAIL' }, 500);
  const adminUrl = Deno.env.get('ADMIN_URL') ?? 'https://richardlechman234-eng.github.io/projekt2/admin.html';

  const html = layout('Nová rezervácia z webu', `
    <p style="margin:0 0 8px">Zákazník čaká na potvrdenie termínu.</p>
    ${rows([
      ['Služba', r.sluzba],
      ['Termín', `${skDate(r.datum)}, ${skTime(r)}`],
      ['Meno', r.meno],
      ['Telefón', r.telefon],
      ['E-mail', r.email],
      ['Auto', r.spz ? `${r.auto} (${r.spz})` : r.auto],
      ['Poznámka', r.poznamka],
    ])}
    <p style="margin:0 0 18px"><a href="${esc(adminUrl)}" style="display:inline-block;background:#1441b5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Otvoriť rezervácie</a></p>
    <p style="margin:0;color:#666;font-size:14px">Na tento e-mail môžete odpovedať – odpoveď pôjde priamo zákazníkovi. Alebo zavolajte: <a href="tel:${esc(r.telefon.replace(/\s+/g, ''))}" style="color:#1441b5">${esc(r.telefon)}</a></p>`);

  try {
    await sendEmail({ to: owner, subject: `Nová rezervácia: ${r.sluzba} – ${skDate(r.datum)}`, html, replyTo: r.email });
  } catch (e) {
    // nepodarilo sa – zruš označenie, aby sa dalo skúsiť znova
    await db.from('reservations').update({ upozornenie_odoslane: null }).eq('id', id);
    return json({ error: String(e) }, 502);
  }
  return json({ ok: true });
});
