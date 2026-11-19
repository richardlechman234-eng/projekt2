// Prihlásenie do Google Calendar API cez service account (bez knižníc, Web Crypto).
// Supabase Secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON – celý obsah JSON kľúča service accountu
//   GOOGLE_CALENDAR_ID          – ID kalendára servisu (Nastavenia kalendára → Integrovať kalendár)
const b64url = (bytes: Uint8Array) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let cached: { token: string; exp: number } | null = null;

// ID kalendára bez medzier, úvodzoviek a prípadnej adresy (ak sa skopíroval celý odkaz)
export function calendarId() {
  let id = (Deno.env.get('GOOGLE_CALENDAR_ID') ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  const m = id.match(/[?&]src=([^&]+)/);
  if (m) id = decodeURIComponent(m[1]);
  return id;
}
export function serviceAccountEmail() {
  try { return JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '{}').client_email ?? '?'; } catch { return '(neplatný JSON v GOOGLE_SERVICE_ACCOUNT_JSON)'; }
}

export function calendarConfigured() {
  return !!(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') && Deno.env.get('GOOGLE_CALENDAR_ID'));
}

export async function googleToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`Prihlásenie do Google zlyhalo (${res.status}): ${await res.text()}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function calendarFetch(path: string, init: RequestInit = {}) {
  const cal = encodeURIComponent(calendarId());
  return fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
