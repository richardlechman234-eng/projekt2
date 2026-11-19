// Upozornenie majiteľovi: volá ju databáza (trigger po vložení rezervácie) s { id }.
// Údaje si načíta sama a e-mail pošle každej rezervácii najviac raz a len do 15 minút
// od vytvorenia – cudzí človek ňou teda nemôže majiteľa zahltiť.
// Pripája sa priamo k databáze (SUPABASE_DB_URL má funkcia automaticky) – nezávisí od typu API kľúčov.
import postgres from 'npm:postgres@3.4.5';
import { cors, json, esc, rows, layout, sendEmail, skDate, skTime } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return json({ error: 'missing id' }, 400);

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
  try {
    // „zaber“ rezerváciu: označ ju ako oznámenú, iba ak ešte nebola a je čerstvá
    const [r] = await sql`
      update public.reservations set upozornenie_odoslane = now()
      where id = ${id} and upozornenie_odoslane is null and vytvorene > now() - interval '15 minutes'
      returning id, sluzba, datum::text as datum, cas_typ, cas::text as cas, meno, telefon, email, auto, spz, poznamka`;
    if (!r) return json({ ok: true, skipped: true });
    return await notify(r, async () => { await sql`update public.reservations set upozornenie_odoslane = null where id = ${id}`; });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end();
  }
});

// deno-lint-ignore no-explicit-any
async function notify(r: any, undo: () => Promise<void>) {
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
    await undo();
    return json({ error: String(e) }, 502);
  }
  return json({ ok: true });
}
