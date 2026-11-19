// Čas termínu rezervácie: pre Google Kalendár, prílohu .ics a odkaz „Pridať do Google Kalendára“.
// Nastavenie (nepovinné) v Supabase Secrets:  TERMIN_DLZKA_MIN – dĺžka termínu s konkrétnym časom (predvolené 120 min)
export const TZ = 'Europe/Bratislava';
export const ADRESA = 'AUTO MM Servis, Pasienková 66, 821 06 Bratislava';

// orientačné bloky pre „dopoludnia“ / „popoludní“ (podľa otváracích hodín ich môžete zmeniť)
const BLOKY: Record<string, [string, string]> = { dopoludnia: ['08:00', '12:00'], popoludni: ['12:00', '16:00'] };

export type Termin =
  | { allDay: true; date: string; endDate: string }
  | { allDay: false; date: string; start: string; end: string; startUtc: Date; endUtc: Date };

// posun časového pásma Bratislavy v danom okamihu (zohľadní letný čas)
function offsetMs(utcMs: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}
export function localToUtc(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - offsetMs(guess - offsetMs(guess)));
}
const nextDay = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};
const addMin = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.min(h * 60 + m + min, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

// deno-lint-ignore no-explicit-any
export function terminOf(r: any): Termin {
  let start: string | null = null, end: string | null = null;
  if (r.cas_typ === 'konkretny' && r.cas) {
    start = String(r.cas).slice(0, 5);
    end = addMin(start, Number(Deno.env.get('TERMIN_DLZKA_MIN') ?? 120));
  } else if (BLOKY[r.cas_typ]) {
    [start, end] = BLOKY[r.cas_typ];
  }
  if (!start || !end) return { allDay: true, date: r.datum, endDate: nextDay(r.datum) };
  return { allDay: false, date: r.datum, start, end, startUtc: localToUtc(r.datum, start), endUtc: localToUtc(r.datum, end) };
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20261127T090000Z
const dateStamp = (iso: string) => iso.replace(/-/g, '');

// ---------- odkaz „Pridať do Google Kalendára“ ----------
export function googleCalendarLink(title: string, details: string, t: Termin) {
  const dates = t.allDay ? `${dateStamp(t.date)}/${dateStamp(t.endDate)}` : `${utcStamp(t.startUtc)}/${utcStamp(t.endUtc)}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates, details, location: ADRESA, ctz: TZ });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// ---------- príloha .ics (funguje v Google, Apple aj Outlook kalendári) ----------
const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {                 // riadky max. 75 bajtov (RFC 5545)
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
export function icsFile(id: number, title: string, description: string, t: Termin) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AUTO MM Servis//Rezervacie//SK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:rezervacia-${id}@automm-servis`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,      // novší e-mail prepíše starší termín v kalendári
    ...(t.allDay
      ? [`DTSTART;VALUE=DATE:${dateStamp(t.date)}`, `DTEND;VALUE=DATE:${dateStamp(t.endDate)}`]
      : [`DTSTART:${utcStamp(t.startUtc)}`, `DTEND:${utcStamp(t.endUtc)}`]),
    `SUMMARY:${icsEsc(title)}`,
    `DESCRIPTION:${icsEsc(description)}`,
    `LOCATION:${icsEsc(ADRESA)}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Termín v AUTO MM Servis', 'TRIGGER:-PT2H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
