/* AUTO MM Servis – súhlas s cookies a externým obsahom (§ 109 ods. 8 zákona č. 452/2021 Z. z.)
   Web sám nepoužíva žiadne sledovacie ani analytické cookies. Jediná nenevyhnutná vec je mapa Google
   (ukladá cookies spoločnosti Google). Voľba sa uloží do localStorage (nevyhnutné) na 12 mesiacov.
   Iné skripty: window.AutoMMConsent.maps (true/false) a udalosť „automm:consent“. */
(function () {
  'use strict';
  const KEY = 'automm-consent';
  const VERSION = 1;
  const MAX_AGE = 365 * 24 * 3600 * 1000;      // po roku sa opýtame znova

  function read() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === VERSION && Date.now() - s.ts < MAX_AGE) return s;
    } catch (_) { /* súkromné okno / zablokované úložisko */ }
    return null;
  }
  let state = read();

  window.AutoMMConsent = {
    get decided() { return !!state; },
    get maps() { return !!(state && state.maps); },
    open: openSettings
  };

  function save(maps) {
    state = { v: VERSION, maps: !!maps, ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* voľba platí aspoň do zatvorenia stránky */ }
    banner?.remove();
    banner = null;
    if (dlg?.open) dlg.close();
    window.dispatchEvent(new CustomEvent('automm:consent', { detail: { maps: !!maps } }));
  }

  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

  /* ---------- lišta ---------- */
  let banner = null;
  function showBanner() {
    banner = el(`
      <section class="cc" role="region" aria-label="Súhlas s cookies">
        <div class="cc-in">
          <p><strong>Cookies a externý obsah.</strong> Používame len nevyhnutné úložisko v prehliadači (napr. zapamätanie tejto voľby).
          S vaším súhlasom zobrazíme aj mapu Google, ktorá ukladá cookies spoločnosti Google.
          <a href="cookies.html">Viac o cookies</a></p>
          <div class="cc-btns">
            <button type="button" class="cc-btn" data-cc="all">Prijať všetko</button>
            <button type="button" class="cc-btn" data-cc="none">Odmietnuť</button>
            <button type="button" class="cc-btn" data-cc="settings">Nastavenia</button>
          </div>
        </div>
      </section>`);
    banner.addEventListener('click', (e) => {
      const a = e.target.closest('[data-cc]')?.dataset.cc;
      if (a === 'all') save(true);
      else if (a === 'none') save(false);
      else if (a === 'settings') openSettings();
    });
    document.body.append(banner);
  }

  /* ---------- nastavenia ---------- */
  let dlg = null;
  function openSettings() {
    if (!dlg) {
      dlg = el(`
        <dialog class="cc-dlg" aria-labelledby="cc-dlg-title">
          <form method="dialog">
            <h2 id="cc-dlg-title">Nastavenia cookies</h2>
            <p>Vyberte, čo smieme na tomto webe používať. Súhlas môžete kedykoľvek zmeniť cez odkaz „Nastavenia cookies“ v pätičke.</p>
            <div class="cc-cat">
              <label><input type="checkbox" checked disabled> <span><strong>Nevyhnutné</strong> – vždy aktívne</span></label>
              <p>Zapamätanie vašej voľby o cookies (localStorage, 12 mesiacov). Bez nich web nemôže fungovať, súhlas nepotrebujú.</p>
            </div>
            <div class="cc-cat">
              <label><input type="checkbox" name="maps"> <span><strong>Externý obsah – Mapy Google</strong></span></label>
              <p>Zobrazenie mapy s polohou servisu priamo na stránke. Google Ireland Ltd. pri tom získa vašu IP adresu a môže ukladať cookies.
              Bez súhlasu mapu načítame len vtedy, keď na ňu sami kliknete.</p>
            </div>
            <div class="cc-btns">
              <button type="button" class="cc-btn" data-cc="save">Uložiť výber</button>
              <button type="button" class="cc-btn" data-cc="all">Prijať všetko</button>
              <button type="button" class="cc-btn" data-cc="none">Odmietnuť všetko</button>
            </div>
            <p class="cc-more"><a href="cookies.html">Podrobnosti o cookies</a> · <a href="ochrana-osobnych-udajov.html">Ochrana osobných údajov</a></p>
          </form>
        </dialog>`);
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) { dlg.close(); return; }
        const a = e.target.closest('[data-cc]')?.dataset.cc;
        if (a === 'save') save(dlg.querySelector('[name=maps]').checked);
        else if (a === 'all') save(true);
        else if (a === 'none') save(false);
      });
      document.body.append(dlg);
    }
    dlg.querySelector('[name=maps]').checked = !!(state && state.maps);   // nikdy nie predvyplnené bez súhlasu
    dlg.showModal();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); openSettings(); }
  });

  const start = () => { if (!state) showBanner(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
