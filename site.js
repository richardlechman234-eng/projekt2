/* AUTO MM Servis – časti webu mimo 3D scény (fungujú aj bez WebGL). */
(function () {
  "use strict";
  const D = window.AUTO_MM;
  const $ = (id) => document.getElementById(id);
  const DAYS = ["", "Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
  const DAYS_LONG = [
    "",
    "v pondelok",
    "v utorok",
    "v stredu",
    "vo štvrtok",
    "v piatok",
    "v sobotu",
    "v nedeľu",
  ];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smooth = reduceMotion ? "auto" : "smooth";

  /* ---------- otváracie hodiny + „Teraz otvorené“ ---------- */
  function bratislavaNow() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Bratislava",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
      get("weekday").slice(0, 3),
    );
    return { day: idx + 1, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
  }
  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  function renderHours() {
    const H = D.hours;
    if (!H) return; // kým nie sú zadané, ostáva „[doplniť]“
    // zoskupiť rovnaké dni: Po – Št 8:00 – 17:00
    const rows = [];
    for (let d = 1; d <= 7; d++) {
      const v = H[d] ? `${H[d][0]} – ${H[d][1]}` : "zatvorené";
      const last = rows[rows.length - 1];
      if (last && last.v === v) last.to = d;
      else rows.push({ from: d, to: d, v });
    }
    const html = rows
      .map((r) => `${DAYS[r.from]}${r.to !== r.from ? " – " + DAYS[r.to] : ""}: ${r.v}`)
      .join("<br>");
    document.querySelectorAll("[data-hours]").forEach((el) => {
      el.innerHTML = html;
    });

    const { day, minutes } = bratislavaNow();
    if (day < 1) return; // neznámy deň (nezvyčajné nastavenie prehliadača): stav neukazovať
    const today = H[day];
    let text,
      open = false;
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
        text = `Teraz zatvorené · otvárame ${i === 0 ? "dnes" : i === 1 ? "zajtra" : DAYS_LONG[d]} o ${h[0]}`;
        break;
      }
    }
    document.querySelectorAll("[data-open-status]").forEach((el) => {
      el.textContent = text || "";
      el.classList.toggle("is-open", open);
      el.hidden = !text;
    });
  }
  renderHours();
  setInterval(renderHours, 60000);

  /* ---------- cenník ----------
     Riadky sú vopred v HTML (scripts/prerender-services.mjs), aby ich videli aj vyhľadávače.
     Tu sa nahradia rovnakými riadkami z data.js a dostanú tlačidlá „Objednať“ (bez duplicít). */
  const priceRows = $("price-rows");
  const rowEls = D.services.map((s) => {
    const row = document.createElement("div");
    row.className = "price-row";
    row.dataset.id = s.id;
    row.setAttribute("role", "row");
    row.innerHTML =
      '<span role="cell" class="p-name"></span><span role="cell" class="p-items"></span><span role="cell" class="p-price"></span>';
    row.querySelector(".p-name").textContent = s.name;
    row.querySelector(".p-items").textContent = s.items
      .filter((t) => !t.startsWith("["))
      .join(" · ");
    const price = row.querySelector(".p-price");
    price.textContent = s.price;
    const btn = document.createElement("a");
    btn.href = "#objednavka";
    btn.className = "p-book";
    btn.textContent = "Objednať";
    btn.setAttribute("aria-label", `Objednať: ${s.name}`);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      book(s.id);
    });
    price.append(btn);
    return row;
  });
  priceRows.replaceChildren(...rowEls);

  /* ---------- objednávkový formulár ---------- */
  const form = $("booking");
  const select = $("booking-service");
  [...(D.extraBookingServices || []), ...D.services, { id: "ine", name: "Iné / neviem" }].forEach(
    (s) => {
      select.append(new Option(s.name, s.id));
    },
  );
  // dnešok a „o rok“ podľa slovenského času (nie UTC – inak by po polnoci neskoro večer nesedel deň)
  const isoInBratislava = (date) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(date);
  const todayISO = () => isoInBratislava(new Date());
  const yearAheadISO = () => isoInBratislava(new Date(Date.now() + 365 * 864e5));
  const dateInput = form.elements.datum;
  dateInput.min = todayISO();
  dateInput.max = yearAheadISO();
  const timeType = $("booking-time-type");
  const timeWrap = $("booking-time-wrap");
  timeType.addEventListener("change", () => {
    // fokus sa nepresúva (WCAG 3.2.2): pole sa len zobrazí
    timeWrap.hidden = timeType.value !== "konkretny";
  });

  // ochrana proti spamu: čas sa počíta od prvého kliknutia do formulára, nie od načítania stránky
  let firstFocusAt = 0;
  form.addEventListener("focusin", () => {
    firstFocusAt ||= Date.now();
    dateInput.min = todayISO(); // aktuálne aj keď stránka beží cez polnoc
    dateInput.max = yearAheadISO();
  });

  function book(id) {
    if (id) select.value = id;
    $("objednavka").scrollIntoView({ behavior: smooth });
    setTimeout(() => form.elements.datum.focus({ preventScroll: true }), reduceMotion ? 0 : 600);
  }
  window.addEventListener("automm:book", (e) => book(e.detail && e.detail.id));

  /* ---------- náhrada za 3D: tlačidlá so službami ----------
     app.js zavolá D.no3d(dôvod), keď nejde WebGL, model sa nenačíta alebo je mobil príliš pomalý.
     Ak sa 3D vôbec nespustí (napr. nenačíta sa knižnica), zapne sa to samo po čase. */
  const NO3D_MSG = {
    webgl: "Váš prehliadač nevie zobraziť 3D auto.",
    model: "3D auto sa nepodarilo načítať.",
    slow: "Na tomto zariadení 3D zobrazenie nebeží plynulo.",
    lost: "3D zobrazenie sa prerušilo.",
    timeout: "3D auto sa načítava príliš dlho.",
  };
  function no3d(reason) {
    if (document.body.classList.contains("no3d")) return;
    document.body.classList.remove("locked"); // stránka sa nesmie ostať zamknutá
    D.failed3d = reason || "timeout";
    document.body.classList.add("no3d");
    $("fallback-msg").textContent =
      (NO3D_MSG[D.failed3d] || "") + " Vyberte službu a objednajte sa:";
    const chips = $("fallback-chips");
    D.services.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = s.name;
      b.addEventListener("click", () => book(s.id));
      chips.append(b);
    });
    $("fallback").hidden = false;
  }
  D.no3d = no3d;
  if (D.failed3d) no3d(D.failed3d);
  const t0 = performance.now();
  const watch = setInterval(() => {
    if (D.ready3d || D.failed3d) {
      clearInterval(watch);
      return;
    }
    const now = performance.now();
    // 10 s bez pokroku v sťahovaní alebo 60 s celkovo (2 MB model na pomalej sieti trvá aj 40 s)
    if (now - Math.max(t0, D.progress3d || 0) > 10000 || now - t0 > 60000) {
      clearInterval(watch);
      no3d("timeout");
    }
  }, 1000);

  const phoneOk = (v) => {
    const n = v.replace(/[\s().-]/g, "");
    return /^(\+|00)?\d{6,15}$/.test(n); // rovnaké pravidlo ako v databáze
  };
  const skDate = (iso) => {
    if (!iso) return "podľa dohody";
    const [y, m, d] = iso.split("-");
    return `${Number(d)}. ${Number(m)}. ${y}`;
  };

  const emailOk = (v) =>
    /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(v.trim()); // pravidlo z databázy
  const SB = D.supabase || {};
  const useSupabase = !!(SB.url && SB.publishableKey);
  const err = $("booking-error");
  const clearInvalid = () => {
    form.querySelectorAll("[aria-invalid]").forEach((el) => {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
  };
  form.addEventListener("input", (e) => {
    e.target.removeAttribute?.("aria-invalid");
    e.target.removeAttribute?.("aria-describedby");
  });
  const showError = (text, field) => {
    clearInvalid();
    err.textContent = text;
    err.hidden = false;
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", "booking-error");
      field.focus();
    }
  };

  // dátum (YYYY-MM-DD) -> deň v týždni 1 = pondelok … 7 = nedeľa
  const weekdayOf = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
  };
  // povolený rozsah presného času: podľa otváracích hodín, kým nie sú zadané, 7:00 – 18:00
  const timeRange = (iso) => {
    const fmt = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
    if (D.hours && iso) {
      const h = D.hours[weekdayOf(iso)];
      if (!h) return { closed: true };
      return { from: toMin(h[0]), to: toMin(h[1]), fmt };
    }
    return { from: 7 * 60, to: 18 * 60, fmt };
  };

  // uloženie do Supabase cez REST (bez knižnice). Verejný kľúč smie iba vkladať – čítať nemôže (RLS).
  async function saveReservation(row) {
    const headers = {
      "Content-Type": "application/json",
      apikey: SB.publishableKey,
      Prefer: "return=minimal",
    };
    if (SB.publishableKey.startsWith("eyJ")) headers.Authorization = `Bearer ${SB.publishableKey}`; // starší „anon“ kľúč
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${SB.url.replace(/\/+$/, "")}/rest/v1/reservations`, {
        method: "POST",
        headers,
        body: JSON.stringify(row),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    } finally {
      clearTimeout(timer);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const v = (name) => f[name].value.trim();

    // presný čas v minútach a povolený rozsah
    const exact = f.cas.value === "konkretny" && v("cas_presny");
    const tMin = exact ? toMin(v("cas_presny")) : null;
    const range = timeRange(v("datum"));
    const nowBA = bratislavaNow();

    // kontrola polí (v poradí, ako sú vo formulári)
    const checks = [
      [!v("datum"), "Vyberte preferovaný dátum.", f.datum],
      [
        v("datum") && v("datum") < todayISO(),
        "Dátum nemôže byť v minulosti. Vyberte dnešný alebo neskorší deň.",
        f.datum,
      ],
      [v("datum") > yearAheadISO(), "Termín si môžete rezervovať najviac rok dopredu.", f.datum],
      [
        f.cas.value === "konkretny" && !v("cas_presny"),
        "Zadajte konkrétny čas, alebo zvoľte dopoludnia / popoludní.",
        f.cas_presny,
      ],
      [tMin !== null && range.closed, "V tento deň máme zatvorené. Vyberte iný dátum.", f.datum],
      [
        tMin !== null &&
          !range.closed &&
          (tMin < range.from || tMin > range.to || Number.isNaN(tMin)),
        range.closed
          ? ""
          : `Čas musí byť medzi ${range.fmt?.(range.from)} a ${range.fmt?.(range.to)}.`,
        f.cas_presny,
      ],
      [
        tMin !== null && v("datum") === todayISO() && tMin <= nowBA.minutes,
        "Tento čas už uplynul. Vyberte neskorší čas.",
        f.cas_presny,
      ],
      [v("meno").length < 2, "Doplňte meno a priezvisko.", f.meno],
      [
        !phoneOk(f.telefon.value),
        "Zadajte platné telefónne číslo (napr. 0917 123 456).",
        f.telefon,
      ],
      [!emailOk(f.email.value), "Zadajte platný e-mail.", f.email],
      [v("auto").length < 2, "Doplňte značku a model auta.", f.auto],
    ];
    const bad = checks.find(([fail]) => fail);
    if (bad) {
      showError(bad[1], bad[2]);
      return;
    }
    err.hidden = true;
    clearInvalid();

    const service = select.options[select.selectedIndex].text;
    const timeText =
      f.cas.value === "konkretny"
        ? `o ${v("cas_presny")}`
        : f.cas.options[f.cas.selectedIndex].text;

    if (useSupabase) {
      // ochrana proti spamu: vyplnené skryté pole alebo odoslanie do 0,8 s od prvého kliknutia do
      // formulára = robot. Robotovi ukážeme „úspech“, ale nič neuložíme.
      const isBot =
        v("kontakt_poznamka_2") !== "" || (firstFocusAt && Date.now() - firstFocusAt < 800);
      const btn = $("booking-submit");
      btn.disabled = true;
      btn.textContent = "Odosielam…";
      try {
        if (!isBot) {
          await saveReservation({
            sluzba: service,
            datum: v("datum"),
            cas_typ: f.cas.value,
            cas: f.cas.value === "konkretny" ? v("cas_presny") : null,
            meno: v("meno"),
            telefon: v("telefon"),
            email: v("email"),
            auto: v("auto"),
            spz: v("spz").toUpperCase().replace(/\s+/g, "") || null,
            poznamka: v("poznamka") || null,
          });
        }
        $("booking-sent-text").textContent =
          `${service}, ${skDate(v("datum"))} ${timeText}. Termín vám potvrdíme telefonicky alebo e-mailom. Ak je to súrne, zavolajte na ${D.phoneDisplay}.`;
        form.hidden = true;
        const sent = $("booking-sent");
        sent.hidden = false;
        sent.focus();
        form.reset();
        timeWrap.hidden = true;
      } catch (ex) {
        console.error("Objednávku sa nepodarilo uložiť", ex);
        showError(
          /RATE_LIMIT/.test(String(ex && ex.message))
            ? `Príliš veľa rezervácií naraz. Zavolajte nám prosím na ${D.phoneDisplay}.`
            : `Objednávku sa nepodarilo odoslať. Skúste to o chvíľu znova alebo nám zavolajte na ${D.phoneDisplay}.`,
        );
      } finally {
        btn.disabled = false;
        btn.textContent = "Odoslať objednávku";
      }
      return;
    }

    // Supabase ešte nie je nastavený: pripraviť SMS ako doteraz
    const msg = [
      "Objednávka – AUTO MM Servis",
      `Meno: ${v("meno")}`,
      `Telefón: ${v("telefon")}`,
      `E-mail: ${v("email")}`,
      `Auto: ${v("auto")}${v("spz") ? ` (${v("spz").toUpperCase()})` : ""}`,
      `Služba: ${service}`,
      `Termín: ${skDate(v("datum"))}, ${timeText}`,
      v("poznamka") ? `Poznámka: ${v("poznamka")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    $("booking-summary").textContent = msg;
    $("booking-done-text").textContent =
      `Posledný krok: odošlite objednávku SMS správou na číslo ${D.phoneDisplay}. Na počítači text skopírujte alebo nám zavolajte.`;
    $("booking-sms").href = `sms:${D.phone}?&body=${encodeURIComponent(msg)}`;
    $("booking-copy").textContent = "Skopírovať text";
    form.hidden = true;
    const done = $("booking-done");
    done.hidden = false;
    done.focus();
  });

  $("booking-again").addEventListener("click", () => {
    $("booking-sent").hidden = true;
    $("booking-done").hidden = true;
    form.hidden = false;
    form.elements.sluzba.focus();
  });

  $("booking-copy").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText($("booking-summary").textContent);
      e.target.textContent = "Skopírované ✓";
    } catch (_) {
      e.target.textContent = "Označte text a skopírujte ho";
    }
  });

  /* ---------- mapa Google: až po súhlase (cookie lišta) alebo po kliknutí ----------
     Bez súhlasu sa mapa načíta len po kliknutí na „Zobraziť mapu“ (jednorazovo, len pre túto návštevu).
     So súhlasom „Mapy Google“ sa načíta sama, keď k nej návštevník doscrolluje. */
  const mapBox = $("map");
  const mapPlaceholder = [...mapBox.childNodes];
  function loadMap() {
    if (mapBox.classList.contains("loaded")) return;
    const hadFocus = mapBox.contains(document.activeElement);
    const iframe = document.createElement("iframe");
    iframe.title = "Mapa – AUTO MM Servis, Pasienková 66, Bratislava";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.src =
      "https://maps.google.com/maps?q=AUTO%20MM%20Servis%2C%20Pasienkov%C3%A1%2066%2C%20Bratislava&z=16&output=embed";
    mapBox.replaceChildren(iframe);
    mapBox.classList.add("loaded");
    if (hadFocus) iframe.focus(); // fokus nesmie spadnúť na <body>
  }
  function unloadMap() {
    // súhlas odvolaný: mapu hneď odstrániť
    if (!mapBox.classList.contains("loaded")) return;
    const hadFocus = mapBox.contains(document.activeElement);
    mapBox.replaceChildren(...mapPlaceholder);
    mapBox.classList.remove("loaded");
    if (hadFocus) $("map-load").focus();
  }
  $("map-load").addEventListener("click", loadMap);
  let mapWatch = null;
  function loadMapWhenVisible() {
    if (!("IntersectionObserver" in window)) {
      loadMap();
      return;
    }
    mapWatch?.disconnect();
    mapWatch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          mapWatch.disconnect();
          loadMap();
        }
      },
      { rootMargin: "300px" },
    );
    mapWatch.observe(mapBox);
  }
  if (window.AutoMMConsent && window.AutoMMConsent.maps) loadMapWhenVisible();
  window.addEventListener("automm:consent", (e) => {
    if (e.detail.maps) loadMapWhenVisible();
    else {
      mapWatch?.disconnect();
      unloadMap();
    }
  });
})();
