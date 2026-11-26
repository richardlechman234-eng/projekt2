// Upozornenie majiteľovi. Volá ju databáza:
//   { id }        – trigger hneď po vložení rezervácie
//   { sweep:true } – pg_cron každých 5 minút: znova skúsi rezervácie, o ktorých majiteľ ešte nevie.
//                    Ak ich je viac ako 3, pošle jeden súhrnný e-mail namiesto mnohých.
// Údaje si načíta sama a každú rezerváciu oznámi najviac raz a len do 60 minút od vytvorenia –
// cudzí človek ňou teda nemôže majiteľa zahltiť. Chyby idú len do logov, volajúci dostane všeobecnú odpoveď.
// Pripája sa priamo k databáze (SUPABASE_DB_URL má funkcia automaticky) – nezávisí od typu API kľúčov.
import postgres from "npm:postgres@3.4.5";
import { cors, json, esc, rows, layout, sendEmail, skDate, skTime } from "../_shared/email.ts";

const WINDOW = "60 minutes";
const MAX_INDIVIDUAL = 3; // viac neoznámených naraz = jeden súhrnný e-mail

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const sweep = body?.sweep === true;
  const id = body?.id;
  if (!sweep && !Number.isInteger(id)) return json({ error: "bad request" }, 400);

  const owner = Deno.env.get("OWNER_EMAIL");
  if (!owner) {
    console.error("nova-rezervacia: chýba OWNER_EMAIL");
    return json({ error: "internal" }, 500);
  }

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  // „zaber“ rezervácie: označ ich ako oznámené, iba ak ešte neboli a sú čerstvé
  const unclaim = (ids: number[]) =>
    sql`update public.reservations set upozornenie_odoslane = null where id in ${sql(ids)}`;
  try {
    const claimed = sweep
      ? await sql`
          update public.reservations set upozornenie_odoslane = now()
          where upozornenie_odoslane is null and vytvorene > now() - ${WINDOW}::interval
          returning id, sluzba, datum::text as datum, cas_typ, cas::text as cas, meno, telefon, email, auto, spz, poznamka`
      : await sql`
          update public.reservations set upozornenie_odoslane = now()
          where id = ${id} and upozornenie_odoslane is null and vytvorene > now() - ${WINDOW}::interval
          returning id, sluzba, datum::text as datum, cas_typ, cas::text as cas, meno, telefon, email, auto, spz, poznamka`;
    if (claimed.length === 0) return json({ ok: true, skipped: true });

    // deno-lint-ignore no-explicit-any
    const list = [...claimed].sort((a: any, b: any) => a.id - b.id) as any[];
    const ids = list.map((r) => r.id as number);
    try {
      if (list.length > MAX_INDIVIDUAL) {
        await sendEmail(digest(owner, list));
      } else {
        // pri chybe jednej sa pokus zopakuje pri ďalšom behu (odznačíme len tie, čo sa nepodarili)
        const failed: number[] = [];
        for (const r of list) {
          try {
            await sendEmail(single(owner, r));
          } catch (e) {
            console.error(`nova-rezervacia: e-mail pre rezerváciu ${r.id} zlyhal:`, e);
            failed.push(r.id);
          }
        }
        if (failed.length) {
          await unclaim(failed);
          return json({ error: "send failed" }, 502);
        }
      }
    } catch (e) {
      console.error(`nova-rezervacia: súhrnný e-mail zlyhal (rezervácie ${ids.join(",")}):`, e);
      await unclaim(ids);
      return json({ error: "send failed" }, 502);
    }
    return json({ ok: true, sent: ids.length });
  } catch (e) {
    console.error("nova-rezervacia: chyba databázy:", e);
    return json({ error: "internal" }, 500);
  } finally {
    await sql.end();
  }
});

const adminUrl = () =>
  Deno.env.get("ADMIN_URL") ?? "https://richardlechman234-eng.github.io/projekt2/admin.html";

const button = () =>
  `<p style="margin:0 0 18px"><a href="${esc(adminUrl())}" style="display:inline-block;background:#1441b5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Otvoriť rezervácie</a></p>`;

// deno-lint-ignore no-explicit-any
function single(owner: string, r: any) {
  const html = layout(
    "Nová rezervácia z webu",
    `
    <p style="margin:0 0 8px">Zákazník čaká na potvrdenie termínu.</p>
    ${rows([
      ["Služba", r.sluzba],
      ["Termín", `${skDate(r.datum)}, ${skTime(r)}`],
      ["Meno", r.meno],
      ["Telefón", r.telefon],
      ["E-mail", r.email],
      ["Auto", r.spz ? `${r.auto} (${r.spz})` : r.auto],
      ["Poznámka", r.poznamka],
    ])}
    ${button()}
    <p style="margin:0;color:#666;font-size:14px">Na tento e-mail môžete odpovedať – odpoveď pôjde priamo zákazníkovi. Alebo zavolajte: <a href="tel:${esc(String(r.telefon).replace(/\s+/g, ""))}" style="color:#1441b5">${esc(r.telefon)}</a></p>`,
  );
  return {
    to: owner,
    subject: `Nová rezervácia: ${r.sluzba} – ${skDate(r.datum)}`,
    html,
    replyTo: r.email as string,
  };
}

// deno-lint-ignore no-explicit-any
function digest(owner: string, list: any[]) {
  const shown = list.slice(0, 10);
  const html = layout(
    `Nové rezervácie: ${list.length}`,
    `
    <p style="margin:0 0 8px">Prišlo viac rezervácií naraz, preto jeden súhrnný e-mail. Podrobnosti nájdete v admin paneli.</p>
    ${rows(
      shown.map((r) => [`#${r.id}`, `${r.sluzba}, ${skDate(r.datum)} – ${r.meno}, ${r.telefon}`]),
    )}
    ${list.length > shown.length ? `<p style="margin:0 0 12px;color:#666">… a ďalších ${list.length - shown.length}.</p>` : ""}
    ${button()}`,
  );
  return { to: owner, subject: `Nové rezervácie z webu: ${list.length}`, html };
}
