/* AUTO MM Servis – admin panel rezervácií (Supabase Auth + RLS).
   Verejný kľúč z data.js stačí: bez prihlásenia admina databáza nič neukáže. */
// supabase-js 2.49.4 je uložená priamo na webe (vendor/supabase.js), nič sa nenačítava z cudzích serverov
const { createClient } = window.supabase;

const CFG = window.AUTO_MM.supabase;
const sb = createClient(CFG.url, CFG.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'automm-admin' }
});
const $ = (id) => document.getElementById(id);

/* ---------- pomocné ---------- */
const DAYS = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
const isoToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date());
function skDate(iso, withDay = true) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${withDay ? day + ' ' : ''}${d}. ${m}. ${y}`;
}
const TIME_LABEL = { dopoludnia: 'dopoludnia', popoludni: 'popoludní', jedno: 'čas je mu jedno', konkretny: '' };
const timeText = (r) => (r.cas_typ === 'konkretny' && r.cas ? `o ${r.cas.slice(0, 5)}` : TIME_LABEL[r.cas_typ] || '');
function ago(ts) {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return 'práve teraz';
  if (min < 60) return `pred ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `pred ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'včera' : `pred ${d} dňami`;
}
const STAV = {
  caka: 'Čaká', potvrdena: 'Potvrdená', zamietnuta: 'Zamietnutá', zrusena: 'Zrušená', dokoncena: 'Dokončená'
};
const isNew = (r) => r.stav === 'caka' && !r.navrhnuty_datum;

// malý pomocník na tvorbu prvkov (text vždy cez textContent – žiadne HTML od zákazníka)
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3500);
}

/* ---------- prihlásenie ---------- */
async function showApp() {
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || ok !== true) {
    await sb.auth.signOut();
    showLogin(error ? 'Nepodarilo sa overiť účet. Skúste to znova.' : 'Tento účet nemá prístup k rezerváciám.');
    return;
  }
  $('login').hidden = true;
  $('app').hidden = false;
  await load();
}
function showLogin(msg) {
  $('app').hidden = true;
  $('login').hidden = false;
  const e = $('login-error');
  e.hidden = !msg;
  e.textContent = msg || '';
}

$('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target.elements;
  const btn = $('login-btn');
  if (!f.email.value.trim() || !f.password.value) { showLogin('Zadajte e-mail aj heslo.'); return; }
  btn.disabled = true; btn.textContent = 'Prihlasujem…';
  const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  btn.disabled = false; btn.textContent = 'Prihlásiť sa';
  if (error) {
    showLogin(/invalid/i.test(error.message) ? 'Nesprávny e-mail alebo heslo.' : `Prihlásenie zlyhalo: ${error.message}`);
    return;
  }
  f.password.value = '';
  showApp();
});
$('logout').addEventListener('click', async () => { await sb.auth.signOut(); rows = []; showLogin(); });

/* ---------- načítanie a zobrazenie ---------- */
let rows = [];
let filter = 'aktivne';
const FILTERS = [
  ['aktivne', 'Aktívne', (r) => r.stav === 'caka' || r.stav === 'potvrdena'],
  ['nove', 'Nové', isNew],
  ['potvrdena', 'Potvrdené', (r) => r.stav === 'potvrdena'],
  ['caka', 'Čakajú', (r) => r.stav === 'caka'],
  ['dokoncena', 'Dokončené', (r) => r.stav === 'dokoncena'],
  ['zamietnuta', 'Zamietnuté', (r) => r.stav === 'zamietnuta'],
  ['zrusena', 'Zrušené', (r) => r.stav === 'zrusena'],
  ['vsetky', 'Všetky', () => true]
];
try { filter = localStorage.getItem('automm-filter') || filter; } catch (_) { /* súkromné okno */ }
try { $('sort').value = localStorage.getItem('automm-sort') || 'termin'; } catch (_) { /* */ }

async function load(quiet = false) {
  if (!quiet) $('list').classList.add('loading');
  const { data, error } = await sb.from('reservations').select('*').order('datum', { ascending: true }).limit(1000);
  $('list').classList.remove('loading');
  if (error) {
    if (/JWT|session/i.test(error.message)) { showLogin('Prihlásenie vypršalo, prihláste sa znova.'); return; }
    toast(`Rezervácie sa nepodarilo načítať: ${error.message}`, true);
    return;
  }
  rows = data;
  render();
}

function render() {
  const n = rows.filter(isNew).length;
  $('new-count').hidden = !n;
  $('new-count').textContent = `${n} ${n === 1 ? 'nová' : n < 5 ? 'nové' : 'nových'}`;
  document.title = `${n ? `(${n}) ` : ''}Rezervácie – AUTO MM Servis`;

  $('filters').replaceChildren(...FILTERS.map(([id, label, fn]) => {
    const count = rows.filter(fn).length;
    return h('button', {
      type: 'button', class: 'fchip', 'aria-pressed': String(id === filter),
      onclick: () => { filter = id; try { localStorage.setItem('automm-filter', id); } catch (_) { /* */ } render(); }
    }, label, h('span', { class: 'fcount' }, String(count)));
  }));

  const fn = FILTERS.find((f) => f[0] === filter)?.[2] ?? (() => true);
  const sort = $('sort').value;
  const key = (r) => `${r.datum} ${r.cas_typ === 'konkretny' ? r.cas : r.cas_typ === 'dopoludnia' ? '08' : r.cas_typ === 'popoludni' ? '13' : '12'}`;
  const list = rows.filter(fn).sort((a, b) =>
    sort === 'prijate' ? b.vytvorene.localeCompare(a.vytvorene)
      : sort === 'termin-desc' ? key(b).localeCompare(key(a))
        : key(a).localeCompare(key(b)));

  $('list').replaceChildren(...(list.length ? list.map(card) : [h('p', { class: 'empty' }, rows.length ? 'V tomto filtri nie sú žiadne rezervácie.' : 'Zatiaľ žiadne rezervácie.')]));
}
$('sort').addEventListener('change', () => { try { localStorage.setItem('automm-sort', $('sort').value); } catch (_) { /* */ } render(); });

function card(r) {
  const past = r.datum < isoToday() && (r.stav === 'caka' || r.stav === 'potvrdena');
  const tel = r.telefon.replace(/[^\d+]/g, '');
  return h('article', { class: `res stav-${r.stav}${isNew(r) ? ' is-new' : ''}` },
    h('div', { class: 'res-head' },
      isNew(r) && h('span', { class: 'pill pill-new' }, 'NOVÁ'),
      h('span', { class: `pill pill-${r.stav}` }, r.stav === 'caka' && r.navrhnuty_datum ? 'Navrhnutý iný termín' : STAV[r.stav]),
      r.anonymizovane && h('span', { class: 'pill pill-zrusena' }, 'Anonymizované (GDPR)'),
      h('span', { class: 'res-id' }, `#${r.id}`)
    ),
    h('h2', { class: 'res-service' }, r.sluzba),
    h('p', { class: `res-when${past ? ' past' : ''}` }, `${skDate(r.datum)} · ${timeText(r)}`, past && h('small', {}, ' (termín uplynul)')),
    r.navrhnuty_datum && h('p', { class: 'res-proposal' }, `Navrhnuté: ${skDate(r.navrhnuty_datum)}${r.navrhnuty_cas ? ` · ${r.navrhnuty_cas}` : ''}`),
    h('p', { class: 'res-name' }, r.meno),
    !r.anonymizovane && h('div', { class: 'res-contact' },
      h('a', { class: 'btn btn-blue btn-sm', href: `tel:${tel}` }, '📞 ', r.telefon),
      h('a', { class: 'btn btn-ghost btn-sm', href: `mailto:${r.email}` }, '✉ ', r.email)
    ),
    h('dl', { class: 'res-info' },
      h('div', {}, h('dt', {}, 'Auto'), h('dd', {}, r.auto, r.spz ? ` · ${r.spz}` : '')),
      r.poznamka && h('div', {}, h('dt', {}, 'Poznámka zákazníka'), h('dd', { class: 'pre' }, r.poznamka)),
      r.sprava_zakaznikovi && h('div', {}, h('dt', {}, r.stav === 'zamietnuta' ? 'Dôvod zamietnutia' : 'Správa zákazníkovi'), h('dd', { class: 'pre' }, r.sprava_zakaznikovi)),
      r.poznamka_admina && h('div', { class: 'internal' }, h('dt', {}, 'Interná poznámka'), h('dd', { class: 'pre' }, r.poznamka_admina))
    ),
    h('p', { class: 'res-meta' }, `Prijaté ${ago(r.vytvorene)} (${new Date(r.vytvorene).toLocaleString('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })})`,
      r.email_odoslany ? ` · e-mail zákazníkovi ${ago(r.email_odoslany)}` : ''),
    r.anonymizovane ? h('div', { class: 'res-actions' },
      h('button', { type: 'button', class: 'btn btn-danger', onclick: () => actDelete(r) }, 'Vymazať')
    ) : h('div', { class: 'res-actions' },
      h('button', { type: 'button', class: 'btn btn-white', disabled: r.stav === 'potvrdena', onclick: () => actConfirm(r) }, 'Potvrdiť'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => actPropose(r) }, 'Iný termín'),
      h('button', { type: 'button', class: 'btn btn-ghost', disabled: r.stav === 'dokoncena', onclick: () => actDone(r) }, 'Dokončené'),
      h('button', { type: 'button', class: 'btn btn-ghost', disabled: r.stav === 'zamietnuta', onclick: () => actReject(r) }, 'Zamietnuť'),
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => actNote(r) }, 'Poznámka'),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: () => actDelete(r) }, 'Vymazať')
    )
  );
}

/* ---------- dialóg ---------- */
const sheet = $('sheet');
let sheetSubmit = null;
function openSheet({ title, sub = '', fields = [], ok, danger = false, onSubmit }) {
  $('sheet-title').textContent = title;
  $('sheet-sub').textContent = sub;
  $('sheet-sub').hidden = !sub;
  $('sheet-fields').replaceChildren(...fields);
  $('sheet-error').hidden = true;
  const okBtn = $('sheet-ok');
  okBtn.textContent = ok;
  okBtn.className = `btn btn-lg ${danger ? 'btn-danger-solid' : 'btn-white'}`;
  okBtn.disabled = false;
  sheetSubmit = onSubmit;
  sheet.showModal();
  sheet.querySelector('textarea, input:not([type=checkbox]), select')?.focus();
}
$('sheet-cancel').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // klik mimo
$('sheet-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const okBtn = $('sheet-ok');
  const label = okBtn.textContent;
  okBtn.disabled = true; okBtn.textContent = 'Ukladám…';
  try {
    const msg = await sheetSubmit(new FormData(e.target));
    if (msg) { $('sheet-error').textContent = msg; $('sheet-error').hidden = false; return; }
    sheet.close();
  } finally {
    okBtn.disabled = false; okBtn.textContent = label;
  }
});

const field = (label, input) => h('label', { class: 'fld' }, label, input);
const textarea = (name, placeholder = '', value = '') => {
  const t = h('textarea', { name, rows: '3', maxlength: '1000', placeholder });
  t.value = value || '';
  return t;
};
const emailToggle = (r) => h('label', { class: 'check' },
  h('input', { type: 'checkbox', name: 'posli', checked: true }),
  h('span', {}, 'Poslať zákazníkovi e-mail na ', h('strong', {}, r.email)));

// uloží zmenu, potom (ak treba) pošle e-mail cez Edge Function
async function save(r, patch, { sendMail = false, okText = 'Uložené' } = {}) {
  const { error } = await sb.from('reservations').update(patch).eq('id', r.id);
  if (error) return `Nepodarilo sa uložiť: ${error.message}`;
  if (sendMail) {
    const { data, error: fe } = await sb.functions.invoke('email-zakaznikovi', { body: { id: r.id } });
    if (fe || data?.error) {
      let detail = data?.error || fe?.message || '';
      try { detail = (await fe?.context?.json())?.error || detail; } catch (_) { /* */ }
      toast(`${okText}, ale e-mail sa nepodarilo odoslať. ${detail}`, true);
      await load(true);
      return null;
    }
    okText += ' · e-mail odoslaný';
  }
  toast(okText);
  await load(true);
  return null;
}

/* ---------- akcie ---------- */
function actConfirm(r) {
  const fields = [];
  if (r.navrhnuty_datum) {
    const prop = `${skDate(r.navrhnuty_datum)}${r.navrhnuty_cas ? ` · ${r.navrhnuty_cas}` : ''}`;
    fields.push(h('fieldset', { class: 'radios' }, h('legend', {}, 'Ktorý termín potvrdzujete?'),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'ktory', value: 'navrh', checked: true }), h('span', {}, `Navrhnutý: ${prop}`)),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'ktory', value: 'povodny' }), h('span', {}, `Pôvodný: ${skDate(r.datum)} · ${timeText(r)}`))));
  }
  fields.push(field('Odkaz pre zákazníka (nepovinné)', textarea('sprava', 'napr. Príďte prosím o 8:00, auto necháte u nás do obeda.')), emailToggle(r));
  openSheet({
    title: 'Potvrdiť termín', sub: `${r.meno} · ${r.sluzba}`, fields, ok: 'Potvrdiť',
    onSubmit: (fd) => {
      const patch = { stav: 'potvrdena', sprava_zakaznikovi: fd.get('sprava').trim() || null, navrhnuty_datum: null, navrhnuty_cas: null };
      if (r.navrhnuty_datum && fd.get('ktory') === 'navrh') {
        patch.datum = r.navrhnuty_datum;
        const m = (r.navrhnuty_cas || '').match(/(\d{1,2}):(\d{2})/);
        if (m) { patch.cas_typ = 'konkretny'; patch.cas = `${m[1].padStart(2, '0')}:${m[2]}`; }
        else { patch.cas = null; patch.cas_typ = /dopol/.test(r.navrhnuty_cas || '') ? 'dopoludnia' : /popol/.test(r.navrhnuty_cas || '') ? 'popoludni' : 'jedno'; }
      }
      return save(r, patch, { sendMail: fd.has('posli'), okText: 'Termín potvrdený' });
    }
  });
}

function actReject(r) {
  openSheet({
    title: 'Zamietnuť rezerváciu', sub: `${r.meno} · ${r.sluzba} · ${skDate(r.datum)}`, ok: 'Zamietnuť', danger: true,
    fields: [field('Dôvod (dostane ho zákazník)', textarea('dovod', 'napr. Na tento typ auta nemáme diagnostiku. Odporúčame značkový servis.')), emailToggle(r)],
    onSubmit: (fd) => {
      const dovod = fd.get('dovod').trim();
      if (!dovod) return 'Napíšte dôvod zamietnutia.';
      return save(r, { stav: 'zamietnuta', sprava_zakaznikovi: dovod }, { sendMail: fd.has('posli'), okText: 'Rezervácia zamietnutá' });
    }
  });
}

function actPropose(r) {
  const date = h('input', { type: 'date', name: 'datum', min: isoToday(), required: true });
  date.value = r.navrhnuty_datum || '';
  const typ = h('select', { name: 'typ' },
    h('option', { value: 'konkretny' }, 'konkrétny čas'), h('option', { value: 'dopoludnia' }, 'dopoludnia'),
    h('option', { value: 'popoludni' }, 'popoludní'), h('option', { value: 'jedno' }, 'počas dňa'));
  const time = h('input', { type: 'time', name: 'cas', step: '900', value: '08:00' });
  const timeFld = field('Čas', time);
  typ.addEventListener('change', () => { timeFld.hidden = typ.value !== 'konkretny'; });
  openSheet({
    title: 'Navrhnúť iný termín', sub: `Zákazník chcel: ${skDate(r.datum)} · ${timeText(r)}`, ok: 'Navrhnúť',
    fields: [h('div', { class: 'fld-row' }, field('Nový dátum', date), field('Kedy', typ)), timeFld,
      field('Odkaz pre zákazníka (nepovinné)', textarea('sprava', 'napr. V stredu máme plno, vo štvrtok ráno je voľné.')), emailToggle(r)],
    onSubmit: (fd) => {
      const d = fd.get('datum');
      if (!d) return 'Vyberte nový dátum.';
      if (d < isoToday()) return 'Dátum nemôže byť v minulosti.';
      const t = fd.get('typ');
      if (t === 'konkretny' && !fd.get('cas')) return 'Zadajte čas.';
      const casText = t === 'konkretny' ? `o ${fd.get('cas')}` : t === 'dopoludnia' ? 'dopoludnia' : t === 'popoludni' ? 'popoludní' : 'počas dňa';
      return save(r, { stav: 'caka', navrhnuty_datum: d, navrhnuty_cas: casText, sprava_zakaznikovi: fd.get('sprava').trim() || null },
        { sendMail: fd.has('posli'), okText: 'Nový termín navrhnutý' });
    }
  });
}

function actDone(r) {
  openSheet({
    title: 'Označiť ako dokončené', sub: `${r.meno} · ${r.auto}`, ok: 'Dokončené',
    fields: [field('Odkaz pre zákazníka (nepovinné)', textarea('sprava', 'napr. Auto si môžete vyzdvihnúť do 17:00. Cena 120 €.')), emailToggle(r)],
    onSubmit: (fd) => save(r, { stav: 'dokoncena', sprava_zakaznikovi: fd.get('sprava').trim() || null },
      { sendMail: fd.has('posli'), okText: 'Označené ako dokončené' })
  });
}

function actNote(r) {
  openSheet({
    title: 'Interná poznámka', sub: 'Zákazník ju neuvidí.', ok: 'Uložiť',
    fields: [field('Poznámka', textarea('pozn', 'napr. Volal, príde o pol hodiny neskôr.', r.poznamka_admina))],
    onSubmit: (fd) => save(r, { poznamka_admina: fd.get('pozn').trim() || null }, { okText: 'Poznámka uložená' })
  });
}

function actDelete(r) {
  openSheet({
    title: 'Natrvalo vymazať?',
    sub: `Rezervácia #${r.id} (${r.meno}, ${skDate(r.datum, false)}) sa vymaže aj so všetkými osobnými údajmi. Vrátiť sa to nedá.`,
    ok: 'Vymazať', danger: true, fields: [],
    onSubmit: async () => {
      const { error } = await sb.from('reservations').delete().eq('id', r.id);
      if (error) return `Nepodarilo sa vymazať: ${error.message}`;
      toast('Rezervácia vymazaná');
      await load(true);
      return null;
    }
  });
}

/* ---------- štart + priebežná aktualizácia ---------- */
$('refresh').addEventListener('click', () => load());
setInterval(() => { if (!document.hidden && !$('app').hidden && !sheet.open) load(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app').hidden) load(true); });

const { data: { session } } = await sb.auth.getSession();
if (session) showApp(); else showLogin();
