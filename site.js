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
  [...D.services.map((s) => [s.id, s.name]), ['ine', 'Iné / neviem']].forEach(([id, name]) => {
    select.append(new Option(name, id));
  });
  const dateInput = form.elements.datum;
  const todayISO = new Date().toISOString().slice(0, 10);
  dateInput.min = todayISO;

  function book(id) {
    if (id) select.value = id;
    $('objednavka').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => form.elements.meno.focus({ preventScroll: true }), 600);
  }
  window.addEventListener('automm:book', (e) => book(e.detail && e.detail.id));

  const phoneOk = (v) => {
    const n = v.replace(/[\s/-]/g, '');
    return /^(\+421|00421|0)\d{9}$/.test(n) || /^\+\d{8,15}$/.test(n);   // SK aj zahraničné čísla
  };
  const skDate = (iso) => { if (!iso) return 'podľa dohody'; const [y, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}. ${y}`; };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    const err = $('booking-error');
    const missing = [];
    if (!f.meno.value.trim()) missing.push('meno');
    if (!phoneOk(f.telefon.value)) missing.push('platné telefónne číslo');
    if (!f.auto.value.trim()) missing.push('značku a model auta');
    if (missing.length) {
      err.textContent = 'Prosím, doplňte: ' + missing.join(', ') + '.';
      err.hidden = false;
      (!f.meno.value.trim() ? f.meno : !phoneOk(f.telefon.value) ? f.telefon : f.auto).focus();
      return;
    }
    err.hidden = true;
    const service = select.options[select.selectedIndex].text;
    const msg = [
      'Objednávka – AUTO MM Servis',
      `Meno: ${f.meno.value.trim()}`,
      `Telefón: ${f.telefon.value.trim()}`,
      `Auto: ${f.auto.value.trim()}`,
      `Služba: ${service}`,
      `Termín: ${skDate(f.datum.value)}, ${f.cas.value}`,
      f.poznamka.value.trim() ? `Poznámka: ${f.poznamka.value.trim()}` : ''
    ].filter(Boolean).join('\n');

    $('booking-summary').textContent = msg;
    $('booking-done-text').textContent = `Posledný krok: odošlite objednávku SMS správou na číslo ${D.phoneDisplay}. Na počítači text skopírujte alebo nám zavolajte.`;
    $('booking-sms').href = `sms:${D.phone}?&body=${encodeURIComponent(msg)}`;
    form.hidden = true;
    const done = $('booking-done');
    done.hidden = false;
    done.focus();
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
