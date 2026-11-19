/* ==================================================================
   AUTO MM Servis – údaje webu na jednom mieste.
   Tu sa upravujú služby, ceny a otváracie hodiny; 3D balóny,
   cenník aj objednávkový formulár sa z nich vytvoria automaticky.
   ================================================================== */
window.AUTO_MM = {
  phone: '+421917973170',
  phoneDisplay: '0917 973 170',

  /* Otváracie hodiny (čas Europe/Bratislava). null = zatvorené.
     Kým tu je hours: null, na webe sa zobrazí „[doplniť]“.
     Príklad: hours: { 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'],
                       4: ['08:00', '17:00'], 5: ['08:00', '16:00'], 6: null, 7: null }
     (1 = pondelok … 7 = nedeľa) */
  hours: null,

  /* Supabase – kam sa ukladajú objednávky z formulára.
     url a publishableKey nájdete v Supabase: Project Settings → API Keys / Data API.
     Sem patrí IBA verejný kľúč (sb_publishable_… alebo starší „anon public“).
     Tajný kľúč (sb_secret_… / service_role) sem NIKDY nevkladajte.
     Kým sú prázdne, formulár pripraví SMS ako doteraz. */
  supabase: {
    url: 'https://erjopcachzansloyywas.supabase.co',
    publishableKey: 'sb_publishable_Cf8JkB0-ZuM7ocM5j5uH-g_o97sM2IM'
  },

  /* Služby, ktoré sú len vo formulári (nie sú na 3D aute). */
  extraBookingServices: [
    { id: 'servis', name: 'Servis a servisná prehliadka' }
  ],

  /* Služby. anchor/normal/view = poloha balóna v 3D scéne (netreba meniť). */
  services: [
    {
      id: 'pneuservis', name: 'Prezúvanie pneumatík', anchor: 'wheelset',   // balón je na sade kolies vedľa auta
      normal: [0, 1, 0], view: [2.2, 0.85, 0.9],
      desc: 'Sezónne prezutie, vyváženie a oprava defektov.',
      items: ['Prezutie letných / zimných pneumatík', 'Vyváženie kolies', 'Oprava defektu', '[doplniť: uskladnenie pneumatík?]'],
      price: 'od [doplniť] €'
    },
    {
      id: 'brzdy', name: 'Brzdy', anchor: null, normal: [1, 0, -0.1], view: [1.8, 0.3, -0.45],
      desc: 'Kontrola a výmena brzdových dielov, aby ste zastavili vždy včas.',
      items: ['Výmena brzdových platničiek', 'Výmena brzdových kotúčov', 'Výmena brzdovej kvapaliny', 'Kontrola brzdovej sústavy'],
      price: 'od [doplniť] €'
    },
    {
      id: 'motor', name: 'Motor a olej', anchor: 'hs_motor', normal: [0, 1, 0.3], view: [1.0, 1.7, 1.6],
      desc: 'Pravidelný servis motora podľa predpisu výrobcu.',
      items: ['Výmena oleja a filtrov', 'Servisná prehliadka', 'Výmena rozvodov', 'Opravy motora'],
      price: 'od [doplniť] €'
    },
    {
      id: 'svetla', name: 'Svetlá a elektrika', anchor: 'hs_svetla', normal: [0.4, 0.15, 1], view: [1.0, 0.25, 1.75],
      desc: 'Osvetlenie, batéria a elektroinštalácia vozidla.',
      items: ['Nastavenie svetlometov', 'Výmena žiaroviek', 'Kontrola a výmena autobatérie', 'Opravy elektroinštalácie'],
      price: 'od [doplniť] €'
    },
    {
      id: 'klimatizacia', name: 'Klimatizácia', anchor: 'hs_klimatizacia', normal: [0, 0.1, 1], view: [0.35, 0.3, 2.1],
      desc: 'Plnenie a dezinfekcia klimatizácie pre čistý vzduch v kabíne.',
      items: ['Plnenie klimatizácie', 'Dezinfekcia a čistenie', 'Výmena kabínového filtra', 'Kontrola tesnosti'],
      price: 'od [doplniť] €'
    },
    {
      id: 'diagnostika', name: 'Diagnostika', anchor: 'hs_karoseria', normal: [1, 0.1, 0], view: [2.3, 0.5, 0.3],
      desc: 'Počítačová diagnostika porúch a vyčítanie chybových kódov.',
      items: ['Diagnostika riadiacich jednotiek', 'Vyčítanie a mazanie chýb', 'Kontrola pred kúpou auta', '[doplniť]'],
      price: 'od [doplniť] €'
    },
    {
      id: 'vyfuk', name: 'Výfuk', anchor: null, normal: [1, 0, -0.25], view: [1.1, 0.3, -1.9],
      desc: 'Opravy a výmeny výfukového systému.',
      items: ['Výmena tlmičov výfuku', 'Opravy výfukového potrubia', 'Kontrola úniku spalín', '[doplniť]'],
      price: 'od [doplniť] €'
    }
  ]
};
