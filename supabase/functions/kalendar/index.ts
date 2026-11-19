// Synchronizácia rezervácie s Google Kalendárom servisu. Volá ju admin panel s { id } (alebo { id, remove: true }
// tesne pred vymazaním rezervácie). Podľa stavu udalosť vytvorí, upraví alebo zmaže:
//   potvrdena                    → vytvoriť / upraviť (napr. po zmene termínu)
//   caka (iný termín), zamietnuta, zrusena, remove → zmazať
//   dokoncena                    → nechať tak (ostane ako história)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/email.ts';
import { calendarConfigured, calendarFetch, calendarId, serviceAccountEmail } from '../_shared/google.ts';

// zrozumiteľná chyba pre admina (404 = kalendár s týmto ID tento účet nevidí)
async function googleError(res: Response) {
  const text = await res.text();
  if (res.status === 404) {
    return new Error(`Kalendár s ID „${calendarId()}“ nevidí účet ${serviceAccountEmail()}. Skontrolujte, či je kalendár zdieľaný presne s týmto e-mailom (Vykonávať zmeny udalostí) a či je ID kalendára správne.`);
  }
  if (res.status === 403) {
    return new Error(`Účet ${serviceAccountEmail()} nemá právo meniť kalendár „${calendarId()}“ – pri zdieľaní nastavte „Vykonávať zmeny udalostí“. (${text.slice(0, 200)})`);
  }
  return new Error(`Google ${res.status}: ${text.slice(0, 300)}`);
}
import { ADRESA, TZ, terminOf } from '../_shared/termin.ts';

const TIME_NOTE: Record<string, string> = {
  dopoludnia: 'Zákazník chce prísť dopoludnia (orientačne 8:00 – 12:00).',
  popoludni: 'Zákazník chce prísť popoludní (orientačne 12:00 – 16:00).',
  jedno: 'Čas je zákazníkovi jedno – celodenná udalosť.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isAdmin } = await db.rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'Nemáte oprávnenie.' }, 403);

  const { id, remove } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return json({ error: 'missing id' }, 400);
  if (!calendarConfigured()) return json({ ok: true, skipped: 'Google Kalendár nie je nastavený.' });

  const { data: r, error } = await db.from('reservations').select('*').eq('id', id).single();
  if (error || !r) return json({ error: 'Rezervácia sa nenašla.' }, 404);
  const setEventId = (v: string | null) => db.from('reservations').update({ google_event_id: v }).eq('id', id);

  try {
    // ---------- zmazať ----------
    if (remove || ['caka', 'zamietnuta', 'zrusena'].includes(r.stav)) {
      if (!r.google_event_id) return json({ ok: true, action: 'none' });
      const res = await calendarFetch(`/${encodeURIComponent(r.google_event_id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404 && res.status !== 410) throw await googleError(res);
      if (!remove) await setEventId(null);
      return json({ ok: true, action: 'deleted' });
    }
    if (r.stav !== 'potvrdena') return json({ ok: true, action: 'none' });

    // ---------- vytvoriť / upraviť ----------
    const t = terminOf(r);
    const event = {
      summary: `${r.sluzba} – ${r.auto}${r.spz ? ` (${r.spz})` : ''}`,
      description: [
        `Meno: ${r.meno}`,
        `Telefón: ${r.telefon}`,
        r.poznamka ? `Poznámka: ${r.poznamka}` : null,
        TIME_NOTE[r.cas_typ] ?? null,
        '',
        `Rezervácia #${r.id} z webu`,
      ].filter((x) => x !== null).join('\n'),
      location: ADRESA,
      start: t.allDay ? { date: t.date } : { dateTime: `${t.date}T${t.start}:00`, timeZone: TZ },
      end: t.allDay ? { date: t.endDate } : { dateTime: `${t.date}T${t.end}:00`, timeZone: TZ },
      status: 'confirmed',          // aj keď udalosť niekto medzitým v kalendári zmazal
      extendedProperties: { private: { rezervacia: String(r.id) } },
    };

    if (r.google_event_id) {
      const res = await calendarFetch(`/${encodeURIComponent(r.google_event_id)}`, { method: 'PUT', body: JSON.stringify(event) });
      if (res.ok) return json({ ok: true, action: 'updated' });
      if (res.status !== 404 && res.status !== 410) throw await googleError(res);
      // udalosť niekto v kalendári ručne zmazal → vytvoríme novú
    }
    const res = await calendarFetch('', { method: 'POST', body: JSON.stringify(event) });
    if (!res.ok) throw await googleError(res);
    const created = await res.json();
    await setEventId(created.id);
    return json({ ok: true, action: 'created' });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
