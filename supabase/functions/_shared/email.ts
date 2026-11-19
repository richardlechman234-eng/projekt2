// Spoločný kód pre e-maily (Brevo alebo Resend), používajú ho obe funkcie.
// Nastavenia (Supabase → Edge Functions → Secrets):
//   BREVO_API_KEY  alebo  RESEND_API_KEY   – kľúč služby, ktorá e-maily odosiela
//   EMAIL_FROM     – odosielateľ, napr.  AUTO MM Servis <automm.servis@gmail.com>
//   OWNER_EMAIL    – kam chodia upozornenia na nové rezervácie (e-mail majiteľa)
//   ADMIN_URL      – (nepovinné) adresa admin panelu do upozornenia

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const DAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
export function skDate(iso: string | null) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${day} ${d}. ${m}. ${y}`;
}
export function skTime(r: { cas_typ: string; cas: string | null }) {
  if (r.cas_typ === 'konkretny' && r.cas) return `o ${r.cas.slice(0, 5)}`;
  return ({ dopoludnia: 'dopoludnia', popoludni: 'popoludní', jedno: 'čas podľa dohody' } as Record<string, string>)[r.cas_typ] ?? '';
}

// jednoduchá šablóna v štýle webu: tmavá hlavička, modrý pruh, biele telo
export function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="sk"><body style="margin:0;background:#f2f3f7;font-family:Arial,Helvetica,sans-serif;color:#0a0202">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0a0202;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:700">AUTO MM Servis</td></tr>
<tr><td style="background:#1441b5;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.55">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#f7f7fa;color:#555;font-size:13px;line-height:1.5">
AUTO MM Servis · Pasienková 66, 821 06 Bratislava – Podunajské Biskupice<br>
Tel. <a href="tel:+421917973170" style="color:#1441b5">0917 973 170</a>
</td></tr></table></td></tr></table></body></html>`;
}

export function rows(pairs: [string, unknown][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px">${pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`)
    .join('')}</table>`;
}

function parseFrom(from: string) {
  const m = from.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1] || 'AUTO MM Servis', email: m[2] } : { name: 'AUTO MM Servis', email: from.trim() };
}

export async function sendEmail(o: { to: string; subject: string; html: string; replyTo?: string }) {
  const fromRaw = Deno.env.get('EMAIL_FROM');
  if (!fromRaw) throw new Error('Chýba nastavenie EMAIL_FROM');
  const from = parseFrom(fromRaw);
  const brevo = Deno.env.get('BREVO_API_KEY');
  const resend = Deno.env.get('RESEND_API_KEY');
  let res: Response;
  if (brevo) {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevo, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: from, to: [{ email: o.to }], subject: o.subject, htmlContent: o.html,
        ...(o.replyTo ? { replyTo: { email: o.replyTo } } : {}),
      }),
    });
  } else if (resend) {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${from.name} <${from.email}>`, to: [o.to], subject: o.subject, html: o.html,
        ...(o.replyTo ? { reply_to: o.replyTo } : {}),
      }),
    });
  } else {
    throw new Error('Chýba BREVO_API_KEY alebo RESEND_API_KEY');
  }
  if (!res.ok) throw new Error(`E-mailová služba vrátila ${res.status}: ${await res.text()}`);
}
