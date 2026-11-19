/* AUTO MM Servis – časti webu mimo 3D scény (fungujú aj bez WebGL). */
(function () {
  'use strict';
  const D = window.AUTO_MM;
  const $ = (id) => document.getElementById(id);
  const DAYS = ['', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
  const DAYS_LONG = ['', 'v pondelok', 'v utorok', 'v stredu', 'vo štvrtok', 'v piatok', 'v sobotu', 'v nedeľu'];

  /* ---------- otváracie hodiny + „Teraz otvorené“ ---------- */
  function bratislavaNow() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bratislava', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
    return { day, minutes: Number(get('hour')) % 24 * 60 + Number(get('minute')) };
  }
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  function renderHours() {
    const H = D.hours;
    if (!H) return;                                   // kým nie sú zadané, ostáva „[doplniť]“
    // zoskupiť rovnaké dni: Po – Št 8:00 – 17:00
    const rows = [];
    for (let d = 1; d <= 7; d++) {
      const v = H[d] ? `${H[d][0]} – ${H[d][1]}` : 'zatvorené';
      const last = rows[rows.length - 1];
      if (last && last.v === v) last.to = d; else rows.push({ from: d, to: d, v });
    }
    const html = rows.map((r) => `${DAYS[r.from]}${r.to !== r.from ? ' – ' + DAYS[r.to] : ''}: ${r.v}`).join('<br>');
    document.querySelectorAll('[data-hours]').forEach((el) => { el.innerHTML = html; });

    const { day, minutes } = bratislavaNow();
    const today = H[day];
    let text, open = false;
    if (today && minutes >= toMin(today[0]) && minutes < toMin(today[1])) {
      open = true;
      text = `Teraz otvorené · zatvárame o ${today[1]}`;
    } else {
      // nájsť najbližšie otvorenie
      for (let i = 0; i < 8; i++) {
        const d = ((day - 1 + i) % 7) + 1;
        const h = H[d];
        if (!h) continue;
        if (i === 0 && minutes >= toMin(h[0])) continue;
        text = `Teraz zatvorené · otvárame ${i === 0 ? 'dnes' : i === 1 ? 'zajtra' : DAYS_LONG[d]} o ${h[0]}`;
        break;
      }
    }
    document.querySelectorAll('[data-open-status]').forEach((el) => {
      el.textContent = text || '';
      el.classList.toggle('is-open', open);
      el.hidden = !text;
    });
  }
  renderHours();
  setInterval(renderHours, 60000);

  /* ---------- cenník ---------- */
  const priceRows = $('price-rows');
  D.services.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'price-row';
    row.setAttribute('role', 'row');
    row.innerHTML = '<span role="cell" class="p-name"></span><span role="cell" class="p-items"></span><span role="cell" class="p-price"></span>';
    row.querySelector('.p-name').textContent = s.name;
    row.querySelector('.p-items').textContent = s.items.filter((t) => !t.startsWith('[')).join(' · ');
    const price = row.querySelector('.p-price');
    price.textContent = s.price;
    const btn = document.createElement('a');
    btn.href = '#objednavka';
    btn.className = 'p-book';
    btn.textContent = 'Objednať';
    btn.setAttribute('aria-label', `Objednať: ${s.name}`);
    btn.addEventListener('click', (e) => { e.preventDefault(); book(s.id); });
    price.append(btn);
    priceRows.append(row);
  });

  /* ---------- objednávkový formulár ---------- */
  const form = $('booking');
  const select = $('booking-service');
  [...(D.extraBookingServices || []), ...D.services, { id: 'ine', name: 'Iné / neviem' }].forEach((s) => {
    select.append(new Option(s.name, s.id));
  });
  // dnešok a „o rok“ podľa slovenského času (nie UTC – inak by po polnoci neskoro večer nesedel deň)
  const isoInBratislava = (date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(date);
  const todayISO = () => isoInBratislava(new Date());
  const yearAheadISO = () => isoInBratislava(new Date(Date.now() + 365 * 864e5));
  const dateInput = form.elements.datum;
  dateInput.min = todayISO();
  dateInput.max = yearAheadISO();
  const timeType = $('booking-time-type');
  const timeWrap = $('booking-time-wrap');
  timeType.addEventListener('change', () => {
    timeWrap.hidden = timeType.value !== 'konkretny';
    if (!timeWrap.hidden) form.elements.cas_presny.focus();
  });
  const formOpenedAt = Date.now();

  function book(id) {
    if (id) select.value = id;
    $('objednavka').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => form.elements.datum.focus({ preventScroll: true }), 600);
  }
  window.addEventListener('automm:book', (e) => book(e.detail && e.detail.id));

  /* ---------- náhrada za 3D: tlačidlá so službami ----------
     app.js zavolá D.no3d(dôvod), keď nejde WebGL, model sa nenačíta alebo je mobil príliš pomalý.
     Ak sa 3D vôbec nespustí (napr. nenačíta sa knižnica), zapne sa to samo po čase. */
  const NO3D_MSG = {
    webgl: 'Váš prehliadač nevie zobraziť 3D auto.',
    model: '3D auto sa nepodarilo načítať.',
    slow: 'Na tomto zariadení 3D zobrazenie nebeží plynulo.',
    lost: '3D zobrazenie sa prerušilo.',
    timeout: '3D auto sa načítava príliš dlho.'
  };
  function no3d(reason) {
    if (document.body.classList.contains('no3d')) return;
    D.failed3d = reason || 'timeout';
    document.body.classList.add('no3d');
    $('fallback-msg').textContent = (NO3D_MSG[D.failed3d] || '') + ' Vyberte službu a objednajte sa:';
    const chips = $('fallback-chips');
    D.services.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = s.name;
      b.setAttribute('role', 'listitem');
      b.addEventListener('click', () => book(s.id));
      chips.append(b);
    });
    $('fallback').hidden = false;
  }
  D.no3d = no3d;
  if (D.failed3d) no3d(D.failed3d);
  const t0 = performance.now();
  const watch = setInterval(() => {
    if (D.ready3d || D.failed3d) { clearInterval(watch); return; }
    const now = performance.now();
    // 10 s bez pokroku v sťahovaní alebo 30 s celkovo
    if (now - Math.max(t0, D.progress3d || 0) > 10000 || now - t0 > 30000) { clearInterval(watch); no3d('timeout'); }
  }, 1000);

  const phoneOk = (v) => {
    const n = v.replace(/[\s/-]/g, '');
    return /^(\+421|00421|0)\d{9}$/.test(n) || /^\+\d{8,15}$/.test(n);   // SK aj zahraničné čísla
  };
  const skDate = (iso) => { if (!iso) return 'podľa dohody'; const [y, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${y}`; };

  const emailOk = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
  const SB = D.supabase || {};
  const useSupabase = !!(SB.url && SB.publishableKey);
  const err = $('booking-error');
  const showError = (text, field) => {
    err.textContent = text;
    err.hidden = false;
    if (field) field.focus();
  };

  // uloženie do Supabase cez REST (bez knižnice). Verejný kľúč smie iba vkladať – čítať nemôže (RLS).
  async function saveReservation(row) {
    const headers = { 'Content-Type': 'application/json', apikey: SB.publishableKey, Prefer: 'return=minimal' };
    if (SB.publishableKey.startsWith('eyJ')) headers.Authorization = `Bearer ${SB.publishableKey}`;   // starší „anon“ kľúč
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${SB.url.replace(/\/+$/, '')}/rest/v1/reservations`, {
        method: 'POST', headers, body: JSON.stringify(row), signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } finally {
      clearTimeout(timer);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const v = (name) => f[name].value.trim();

    // kontrola polí (v poradí, ako sú vo formulári)
    const checks = [
      [!v('datum'), 'Vyberte preferovaný dátum.', f.datum],
      [v('datum') && v('datum') < todayISO(), 'Dátum nemôže byť v minulosti. Vyberte dnešný alebo neskorší deň.', f.datum],
      [v('datum') > yearAheadISO(), 'Termín si môžete rezervovať najviac rok dopredu.', f.datum],
      [f.cas.value === 'konkretny' && !v('cas_presny'), 'Zadajte konkrétny čas, alebo zvoľte dopoludnia / popoludní.', f.cas_presny],
      [v('meno').length < 2, 'Doplňte meno a priezvisko.', f.meno],
      [!phoneOk(f.telefon.value), 'Zadajte platné telefónne číslo (napr. 0917 123 456).', f.telefon],
      [!emailOk(f.email.value), 'Zadajte platný e-mail.', f.email],
      [v('auto').length < 2, 'Doplňte značku a model auta.', f.auto]
    ];
    const bad = checks.find(([fail]) => fail);
    if (bad) { showError(bad[1], bad[2]); return; }
    err.hidden = true;

    const service = select.options[select.selectedIndex].text;
    const timeText = f.cas.value === 'konkretny' ? `o ${v('cas_presny')}` : f.cas.options[f.cas.selectedIndex].text;

    if (useSupabase) {
      // ochrana proti spamu: vyplnené skryté pole alebo odoslanie do 3 s od načítania = robot.
      // Robotovi ukážeme „úspech“, ale nič neuložíme.
      const isBot = v('web') !== '' || Date.now() - formOpenedAt < 3000;
      const btn = $('booking-submit');
      btn.disabled = true;
      btn.textContent = 'Odosielam…';
      try {
        if (!isBot) {
          await saveReservation({
            sluzba: service,
            datum: v('datum'),
            cas_typ: f.cas.value,
            cas: f.cas.value === 'konkretny' ? v('cas_presny') : null,
            meno: v('meno'),
            telefon: v('telefon'),
            email: v('email'),
            auto: v('auto'),
            spz: v('spz').toUpperCase().replace(/\s+/g, '') || null,
            poznamka: v('poznamka') || null
          });
        }
        $('booking-sent-text').textContent =
          `${service}, ${skDate(v('datum'))} ${timeText}. Termín vám potvrdíme telefonicky alebo e-mailom. Ak je to súrne, zavolajte na ${D.phoneDisplay}.`;
        form.hidden = true;
        const sent = $('booking-sent');
        sent.hidden = false;
        sent.focus();
        form.reset();
        timeWrap.hidden = true;
      } catch (ex) {
        console.error('Objednávku sa nepodarilo uložiť', ex);
        showError(`Objednávku sa nepodarilo odoslať. Skúste to o chvíľu znova alebo nám zavolajte na ${D.phoneDisplay}.`);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Odoslať objednávku';
      }
      return;
    }

    // Supabase ešte nie je nastavený: pripraviť SMS ako doteraz
    const msg = [
      'Objednávka – AUTO MM Servis',
      `Meno: ${v('meno')}`,
      `Telefón: ${v('telefon')}`,
      `E-mail: ${v('email')}`,
      `Auto: ${v('auto')}${v('spz') ? ` (${v('spz').toUpperCase()})` : ''}`,
      `Služba: ${service}`,
      `Termín: ${skDate(v('datum'))}, ${timeText}`,
      v('poznamka') ? `Poznámka: ${v('poznamka')}` : ''
    ].filter(Boolean).join('\n');

    $('booking-summary').textContent = msg;
    $('booking-done-text').textContent = `Posledný krok: odošlite objednávku SMS správou na číslo ${D.phoneDisplay}. Na počítači text skopírujte alebo nám zavolajte.`;
    $('booking-sms').href = `sms:${D.phone}?&body=${encodeURIComponent(msg)}`;
    form.hidden = true;
    const done = $('booking-done');
    done.hidden = false;
    done.focus();
  });

  $('booking-again').addEventListener('click', () => {
    $('booking-sent').hidden = true;
    form.hidden = false;
    form.elements.sluzba.focus();
  });

  $('booking-copy').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText($('booking-summary').textContent);
      e.target.textContent = 'Skopírované ✓';
    } catch (_) {
      e.target.textContent = 'Označte text a skopírujte ho';
    }
  });

  /* ---------- mapa až po súhlase (GDPR) ---------- */
  $('map-load').addEventListener('click', () => {
    const box = $('map');
    const iframe = document.createElement('iframe');
    iframe.title = 'Mapa – AUTO MM Servis, Pasienková 66, Bratislava';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.src = 'https://maps.google.com/maps?q=AUTO%20MM%20Servis%2C%20Pasienkov%C3%A1%2066%2C%20Bratislava&z=16&output=embed';
    box.replaceChildren(iframe);
    box.classList.add('loaded');
  });

  /* ---------- mobilný panel akcií: skryť v úvode 3D scény ---------- */
  const bar = $('action-bar');
  const updateBar = () => bar.classList.toggle('show', window.scrollY > 40 || document.body.classList.contains('stage-services'));
  window.addEventListener('scroll', updateBar, { passive: true });
  setInterval(updateBar, 500);
  updateBar();
})();
