/**
 * ŚDM 2027 — panel organizatorów (dane osobowe).
 *
 * Ten plik wklejasz do prywatnego arkusza:
 *   ŚDM 2027 – dane osobowe (PRYWATNE) → Rozszerzenia → Apps Script
 *
 * Wdrożenie krok po kroku: zob. INSTRUKCJA.md w tym samym folderze.
 *
 * Wymagane ustawienia wdrożenia:
 *   - Wykonuj jako: Użytkownik uzyskujący dostęp do aplikacji internetowej
 *     (Execute as: User accessing the web app)
 *   - Kto ma dostęp: Wszyscy użytkownicy posiadający konto Google
 *     (Who has access: Anyone with Google account)
 *
 * Skrypt czyta i zapisuje arkusz uprawnieniami osoby, która otwiera panel.
 * Kto nie ma udostępnionego arkusza, zobaczy komunikat o braku dostępu.
 * Dodawanie wpłat wymaga uprawnień edytora (podgląd nie wystarczy).
 *
 * Nie wklejaj tu prawdziwych danych osobowych — pochodzą wyłącznie z arkusza.
 */

/** Prywatny arkusz „ŚDM 2027 – dane osobowe (PRYWATNE)” (konto Gmail Jakuba). */
var ARKUSZ_ID = '1yTlwsYqsuSs5nvESWlcCOPF_yIC-4dyoUllngWTmjuo';

/** Źródło listy jadących: arkusz „Lista Seul 27” (pierwsza karta). Organizatorzy edytują listę tylko tam. */
var LISTA_ID = '1SEGl2NcbZMEkPQN7qO5v2knHl6xCdRRdZCIlYKK3stg';

/** Kolumny dopisywane na końcu listy, jeśli ich brakuje (istniejących kolumn nie ruszamy). */
var DODATKOWE_KOLUMNY = ['id', 'lista', 'płeć', 'data urodzenia', 'opiekun', 'bilet', 'paszport ważny do', 'K-ETA',
  'Visit Japan Web', 'ubezpieczenie', 'zgody', 'regulamin podpisany', 'zgoda rodziców', 'uwagi zdrowotne/dieta'];

var SHEET_UCZESTNICY = 'Uczestnicy';
var SHEET_WPLATY = 'Wpłaty';
var SHEET_PODSUMOWANIE = 'Podsumowanie';

var HEAD_UCZESTNICY = [
  'id', 'lista', 'imię', 'nazwisko', 'wspólnota/miasto', 'płeć', 'data urodzenia', 'wiek',
  'niepełnoletni', 'opiekun', 'bilet', 'paszport ważny do', 'K-ETA', 'Visit Japan Web', 'zgody',
  'zgoda rodziców', 'regulamin podpisany', 'ubezpieczenie', 'uwagi zdrowotne/dieta', 'telefon', 'email', 'status', 'braki'
];

/** Harmonogram rat (jak na stronie organizatorów): [rata, termin, udział %]. */
var RATY = [['I', '2026-11-30', 20], ['II', '2027-02-28', 20], ['III', '2027-04-30', 20], ['IV', '2027-06-30', 25], ['V', '2027-07-31', 15]];

/** Terminy dokumentów: przed terminem brak jest „do zrobienia”, po terminie — zaległy. */
var TERMINY = {
  plec: '2026-12-31', wiek: '2026-12-31', bilet: '2026-12-31', regulamin: '2026-12-31', zgodyRodzicow: '2026-12-31', zgody: '2026-12-31',
  paszport: '2027-03-31', ubezpieczenie: '2027-06-30', kEta: '2027-06-30', vjw: '2027-07-25'
};
var PASZPORT_MIN = '2028-02-21'; // 6 miesięcy po powrocie (21.08.2027)
var START = '2027-08-01';

var HEAD_WPLATY = [
  'data', 'typ', 'id uczestnika lub darczyńca', 'kwota zł', 'rata', 'forma', 'uwagi'
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('panel')
    .setTitle('ŚDM 2027 — panel organizatorów (prywatny)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Zwraca dane do panelu albo { ok: false, error: 'NO_ACCESS' }.
 * Wywoływane z panel.html przez google.script.run.
 */
function getPanelData() {
  try {
    var ss = getSpreadsheet_();
    var cena = 0;
    var platnicy = 0;
    var pod = ss.getSheetByName(SHEET_PODSUMOWANIE);
    if (pod) {
      cena = toNumber_(pod.getRange('B5').getValue());
      platnicy = toNumber_(pod.getRange('B6').getValue());
    }

    var uczestnicy = readLista_();
    if (!uczestnicy) uczestnicy = readTable_(ss, SHEET_UCZESTNICY, HEAD_UCZESTNICY);
    var wplaty = readTable_(ss, SHEET_WPLATY, HEAD_WPLATY).map(normalizeWplata_);

    var sumaImienne = 0;
    var sumaOgolne = 0;
    wplaty.forEach(function (w) {
      if (w.typ === 'imienna') sumaImienne += w.kwota;
      else if (w.typ === 'ogolna') sumaOgolne += w.kwota;
    });

    var today = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd');
    var udzialDoDzis = 0;
    RATY.forEach(function (r) { if (r[1] <= today) udzialDoDzis += r[2]; });
    var lista = uczestnicy.map(function (u) {
      var wplacono = 0;
      wplaty.forEach(function (w) {
        if (w.typ === 'imienna' && String(w.kto) === String(u.id)) wplacono += w.kwota;
      });
      return {
        id: u.id,
        imie: u.imie,
        nazwisko: u.nazwisko,
        wspolnota: u.wspolnota,
        dataUrodzenia: u.dataUrodzenia,
        niepelnoletni: u.niepelnoletni,
        opiekun: u.opiekun,
        paszportWaznyDo: u.paszportWaznyDo,
        kEta: u.kEta,
        zgody: u.zgody,
        uwagi: u.uwagi,
        telefon: u.telefon,
        email: u.email,
        status: u.status,
        braki: u.braki,
        przyklad: isPrzyklad_(u.status, u.uwagi, u.id),
        wplaconoImiennie: wplacono,
        naleznosc: cena,
        saldo: wplacono - cena,
        lista: listaNorm_(u.lista),
        plec: u.plec,
        wiekLiczba: wiekOf_(u.dataUrodzenia, u.wiek),
        bilet: String(u.bilet || '').toLowerCase(),
        vjw: u.vjw,
        zgodaRodzicow: u.zgodaRodzicow,
        regulamin: u.regulamin,
        ubezpieczenie: u.ubezpieczenie,
        naleznoDoDzis: Math.round(cena * udzialDoDzis) / 100
      };
    }).map(function (o) { return withChecks_(o, today); });

    var aktywni = lista.filter(function (o) { return o.lista === 'główna'; });
    var count = function (arr, f) { return arr.filter(f).length; };
    var nl = aktywni.filter(function (o) { return o.niepelnoletniBool; });
    var stats = {
      glowna: aktywni.length,
      rezerwowa: count(lista, function (o) { return o.lista === 'rezerwowa'; }),
      rezygnacja: count(lista, function (o) { return o.lista === 'rezygnacja'; }),
      niepelnoletni: nl.length,
      nlK: count(nl, function (o) { return o.plec === 'K'; }),
      nlM: count(nl, function (o) { return o.plec === 'M'; }),
      opiekunowieMin: Math.ceil(count(nl, function (o) { return o.plec === 'K'; }) / 5) + Math.ceil(count(nl, function (o) { return o.plec === 'M'; }) / 5),
      bezWieku: count(aktywni, function (o) { return o.wiekLiczba == null; }),
      imienne: count(aktywni, function (o) { return o.bilet === 'imienny'; }),
      grupowe: count(aktywni, function (o) { return o.bilet === 'grupowy'; }),
      bezBiletu: count(aktywni, function (o) { return o.bilet !== 'imienny' && o.bilet !== 'grupowy'; }),
      zalegli: count(aktywni, function (o) { return o.wplaconoImiennie + 0.5 < o.naleznoDoDzis; }),
      zBrakami: count(aktywni, function (o) { return o.zalegle.length > 0; }),
      paszportyOk: count(aktywni, function (o) { return o.checks.paszport === 'ok'; }),
      zgodyOk: count(aktywni, function (o) { return o.checks.zgody === 'ok' && (o.niepelnoletniBool ? o.checks.zgodaRodzicow === 'ok' : true); }),
      udzialDoDzis: udzialDoDzis
    };

    var naleznoscGrupy = cena * platnicy;
    var razem = sumaImienne + sumaOgolne;

    return {
      ok: true,
      arkusz: ss.getName(),
      email: tryEmail_(),
      mozeEdytowac: canEdit_(ss),
      cenaNaOsobe: cena,
      platnicy: platnicy,
      naleznoscGrupy: naleznoscGrupy,
      sumaImienne: sumaImienne,
      sumaOgolne: sumaOgolne,
      razemWplynelo: razem,
      saldoGrupy: razem - naleznoscGrupy,
      uczestnicy: lista,
      stats: stats,
      dzis: today,
      raty: RATY,
      wplaty: wplaty
    };
  } catch (e) {
    return accessError_(e);
  }
}

/**
 * Dopisuje wpłatę do karty Wpłaty.
 * payload: { data, typ, kto, kwota, rata, forma, uwagi }
 */
function addPayment(payload) {
  try {
    var ss = getSpreadsheet_();
    if (!canEdit_(ss)) {
      return {
        ok: false,
        error: 'NO_WRITE',
        message: 'Do dodawania wpłat potrzebujesz uprawnień edytora tego arkusza. Sam podgląd nie wystarczy.'
      };
    }

    var p = payload || {};
    var typ = String(p.typ || '').trim().toLowerCase();
    if (typ === 'ogólna') typ = 'ogolna';
    if (typ !== 'imienna' && typ !== 'ogolna') {
      return { ok: false, error: 'VALIDATION', message: 'Typ wpłaty musi być „imienna” albo „ogólna”.' };
    }

    var kto = String(p.kto || '').trim();
    if (!kto) {
      return {
        ok: false,
        error: 'VALIDATION',
        message: typ === 'imienna'
          ? 'Wybierz uczestnika, za którego jest wpłata.'
          : 'Podaj nazwę darczyńcy albo sponsora.'
      };
    }

    var kwota = toNumber_(p.kwota);
    if (!kwota || kwota <= 0) {
      return { ok: false, error: 'VALIDATION', message: 'Podaj kwotę większą od zera.' };
    }

    var dataWp = parseDate_(p.data);
    if (!dataWp) {
      return { ok: false, error: 'VALIDATION', message: 'Podaj datę wpłaty (RRRR-MM-DD).' };
    }

    var typZapis = typ === 'ogolna' ? 'ogólna' : 'imienna';
    var sh = ss.getSheetByName(SHEET_WPLATY);
    if (!sh) return { ok: false, error: 'MISSING_SHEET', message: 'Brak karty Wpłaty w arkuszu.' };

    sh.appendRow([
      dataWp,
      typZapis,
      kto,
      kwota,
      String(p.rata || '').trim(),
      String(p.forma || '').trim(),
      String(p.uwagi || '').trim()
    ]);

    return getPanelData();
  } catch (e) {
    var fail = accessError_(e);
    if (fail.error === 'NO_ACCESS') return fail;
    return {
      ok: false,
      error: 'NO_WRITE',
      message: 'Nie udało się zapisać wpłaty. Sprawdź, czy masz uprawnienia edytora arkusza. (' + String(e.message || e) + ')'
    };
  }
}

/* ——— lista jadących z arkusza „Lista Seul 27” ——— */

/**
 * Czyta pierwszą kartę listy. Przy pierwszym otwarciu przez edytora dopisuje brakujące kolumny
 * (DODATKOWE_KOLUMNY), nazywa pustą kolumnę z uwagami („uwagi”) i nadaje stałe id (U001…) osobom bez id.
 * Zwraca null, gdy lista jest niedostępna (wtedy panel czyta kartę Uczestnicy prywatnego arkusza).
 */
function readLista_() {
  var sh;
  try {
    var id = PropertiesService.getScriptProperties().getProperty('LISTA_ID') || LISTA_ID;
    sh = SpreadsheetApp.openById(id).getSheets()[0];
  } catch (e) { return null; }
  var values = sh.getDataRange().getDisplayValues();
  if (!values.length) return [];
  var heads = values[0].map(function (h) { return String(h || '').trim(); });
  var editable = false;
  try { editable = sh.getRange('A1').canEdit(); } catch (e2) { editable = false; }
  if (editable) {
    // pusta kolumna nagłówka z treścią (np. „nieletnia”, „zgłosiła rezygnację”) → „uwagi”
    for (var c = 0; c < heads.length; c++) {
      if (!heads[c] && values.slice(1).some(function (r) { return String(r[c] || '').trim(); })) {
        sh.getRange(1, c + 1).setValue('uwagi'); heads[c] = 'uwagi';
      }
    }
    var lower = heads.map(function (h) { return h.toLowerCase(); });
    DODATKOWE_KOLUMNY.forEach(function (name) {
      if (lower.indexOf(name.toLowerCase()) === -1) {
        var col = heads.length + 1;
        sh.getRange(1, col).setValue(name);
        heads.push(name); lower.push(name.toLowerCase());
      }
    });
    var idCol = lower.indexOf('id');
    var nameCols = [lower.indexOf('imię'), lower.indexOf('nazwisko')];
    var used = {};
    values.slice(1).forEach(function (r) { var v = String(r[idCol] || '').trim(); if (v) used[v] = true; });
    var next = 1;
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var hasName = nameCols.some(function (ci) { return ci >= 0 && String(r[ci] || '').trim(); });
      if (!hasName || String(r[idCol] || '').trim()) continue;
      while (used['U' + ('00' + next).slice(-3)]) next++;
      var nid = 'U' + ('00' + next).slice(-3);
      used[nid] = true;
      sh.getRange(i + 1, idCol + 1).setValue(nid);
    }
    values = sh.getDataRange().getDisplayValues();
  }
  var out = [];
  for (var j = 1; j < values.length; j++) {
    var row = values[j];
    var o = {};
    heads.forEach(function (h, k) { o[h] = row[k] != null ? String(row[k]) : ''; });
    if (!String(pick_(o, ['Imię', 'imię', 'imie']) || '').trim() && !String(pick_(o, ['Nazwisko', 'nazwisko']) || '').trim()) continue;
    var uwagi = String(pick_(o, ['uwagi']) || '');
    var nr = String(pick_(o, ['Nr', 'nr']) || '').trim();
    var lista = pick_(o, ['lista']);
    if (!lista) lista = /rezyg/i.test(uwagi) ? 'rezygnacja' : (nr ? 'główna' : 'rezerwowa');
    var wiek = pick_(o, ['Wiek', 'wiek']);
    out.push({
      id: pick_(o, ['id']) || ('Nr ' + nr),
      nr: nr,
      lista: lista,
      imie: pick_(o, ['Imię', 'imię', 'imie']),
      nazwisko: pick_(o, ['Nazwisko', 'nazwisko']),
      wspolnota: pick_(o, ['parafia', 'wspólnota/miasto', 'wspólnota']),
      plec: String(pick_(o, ['płeć', 'plec']) || '').toUpperCase().slice(0, 1),
      dataUrodzenia: pick_(o, ['data urodzenia']),
      wiek: wiek,
      niepelnoletni: /nielet/i.test(uwagi) ? 'TAK' : '',
      opiekun: pick_(o, ['opiekun']),
      bilet: pick_(o, ['bilet']),
      paszportWaznyDo: pick_(o, ['paszport ważny do']),
      kEta: pick_(o, ['K-ETA']),
      vjw: pick_(o, ['Visit Japan Web']),
      ubezpieczenie: pick_(o, ['ubezpieczenie']),
      zgody: pick_(o, ['zgody']),
      regulamin: pick_(o, ['regulamin podpisany', 'regulamin']),
      zgodaRodzicow: pick_(o, ['zgoda rodziców']),
      uwagi: [uwagi, pick_(o, ['uwagi zdrowotne/dieta'])].filter(String).join(' · '),
      telefon: pick_(o, ['telefon']),
      email: String(pick_(o, ['mail', 'email', 'e-mail']) || '').trim(),
      status: uwagi,
      braki: ''
    });
  }
  return out;
}

/* ——— statusy uczestnika ——— */

function listaNorm_(v) {
  var s = String(v || '').toLowerCase();
  if (s.indexOf('rezyg') !== -1) return 'rezygnacja';
  if (s.indexOf('rezerw') !== -1) return 'rezerwowa';
  return 'główna';
}

function wiekOf_(dataUr, wiek) {
  var d = parseDate_(dataUr);
  if (d) {
    var start = new Date(2027, 7, 1);
    var a = start.getFullYear() - d.getFullYear();
    if (start.getMonth() < d.getMonth() || (start.getMonth() === d.getMonth() && start.getDate() < d.getDate())) a--;
    return a;
  }
  var n = toNumber_(wiek);
  return n > 0 ? n : null;
}

function tak_(v) { var s = String(v || '').trim().toUpperCase(); return s === 'TAK' || s === 'T' || s === 'OK' || s === 'X' || s === 'YES'; }
function nd_(v) { return String(v || '').toLowerCase().indexOf('nie dotyczy') !== -1; }

/** Dla każdej pozycji: 'ok' | 'todo' (przed terminem) | 'late' (po terminie) | 'nd' (nie dotyczy). */
function withChecks_(o, today) {
  var st = function (ok, key) { return ok ? 'ok' : (today > TERMINY[key] ? 'late' : 'todo'); };
  var nlBool = o.wiekLiczba != null ? o.wiekLiczba < 18 : tak_(o.niepelnoletni);
  var pas = parseDate_(o.paszportWaznyDo);
  var pasOk = pas && Utilities.formatDate(pas, 'Europe/Warsaw', 'yyyy-MM-dd') >= PASZPORT_MIN;
  var c = {
    plec: st(o.plec === 'K' || o.plec === 'M', 'plec'),
    wiek: st(o.wiekLiczba != null, 'wiek'),
    bilet: st(o.bilet === 'imienny' || o.bilet === 'grupowy', 'bilet'),
    paszport: pas && !pasOk ? 'late' : st(!!pasOk, 'paszport'),
    kEta: nd_(o.kEta) ? 'nd' : st(tak_(o.kEta), 'kEta'),
    vjw: nd_(o.vjw) ? 'nd' : st(tak_(o.vjw), 'vjw'),
    zgody: st(tak_(o.zgody), 'zgody'),
    zgodaRodzicow: nlBool ? st(tak_(o.zgodaRodzicow), 'zgodyRodzicow') : 'nd',
    opiekun: nlBool ? st(String(o.opiekun || '').trim() !== '', 'zgodyRodzicow') : 'nd',
    regulamin: st(tak_(o.regulamin), 'regulamin'),
    ubezpieczenie: nd_(o.ubezpieczenie) ? 'nd' : st(tak_(o.ubezpieczenie), 'ubezpieczenie'),
    kontakt: (o.telefon || o.email) ? 'ok' : 'late',
    wplaty: o.wplaconoImiennie + 0.5 >= o.naleznoDoDzis ? 'ok' : 'late'
  };
  if (pas && !pasOk) c.paszportUwaga = 'wygasa przed 21.02.2028';
  var NAZWY = { plec: 'płeć', wiek: 'wiek / data ur.', bilet: 'rodzaj biletu', paszport: 'paszport', kEta: 'K-ETA', vjw: 'Visit Japan Web', zgody: 'zgody',
    zgodaRodzicow: 'zgoda rodziców', opiekun: 'opiekun', regulamin: 'regulamin', ubezpieczenie: 'ubezpieczenie', kontakt: 'kontakt', wplaty: 'wpłaty' };
  var zalegle = [], doZrobienia = [];
  Object.keys(NAZWY).forEach(function (k) {
    if (c[k] === 'late') zalegle.push(NAZWY[k]);
    if (c[k] === 'todo') doZrobienia.push(NAZWY[k]);
  });
  o.niepelnoletniBool = nlBool;
  o.checks = c;
  o.zalegle = o.lista === 'główna' ? zalegle : [];
  o.doZrobienia = o.lista === 'główna' ? doZrobienia : [];
  o.braki = o.zalegle.join(', ');
  return o;
}

/* ——— pomocnicze ——— */

function getSpreadsheet_() {
  // Dokumentacja Google nie gwarantuje getActiveSpreadsheet() w aplikacji internetowej,
  // dlatego najpierw otwieramy arkusz po ID (z Właściwości skryptu ARKUSZ_ID albo stałej niżej).
  var ss = null;
  var id = PropertiesService.getScriptProperties().getProperty('ARKUSZ_ID') || ARKUSZ_ID;
  try { ss = SpreadsheetApp.openById(id); } catch (e0) { ss = null; }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  }
  if (!ss) {
    var err = new Error('NO_ACCESS');
    err.code = 'NO_ACCESS';
    throw err;
  }
  try {
    ss.getName();
    ss.getSheets();
  } catch (e2) {
    var err2 = new Error('NO_ACCESS');
    err2.code = 'NO_ACCESS';
    throw err2;
  }
  return ss;
}

function canEdit_(ss) {
  try {
    return ss.getSheetByName(SHEET_WPLATY).getRange('A1').canEdit();
  } catch (e) {
    return false;
  }
}

function tryEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

function accessError_(e) {
  var msg = String((e && e.message) || e || '');
  var code = (e && e.code) || '';
  if (
    code === 'NO_ACCESS' ||
    msg.indexOf('NO_ACCESS') !== -1 ||
    /permission|dost[eę]p|not found|brak uprawnień|denied|does not have/i.test(msg)
  ) {
    return {
      ok: false,
      error: 'NO_ACCESS',
      message: 'Nie masz dostępu do prywatnego arkusza z danymi osobowymi. Poproś organizatora, żeby udostępnił Ci ten arkusz na Twoje konto Google (podgląd albo edycja).'
    };
  }
  return { ok: false, error: 'OTHER', message: msg };
}

function readTable_(ss, name, expectedHeads) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getDisplayValues();
  if (!values || values.length < 2) return [];
  var heads = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var allEmpty = true;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] || '').trim() !== '') { allEmpty = false; break; }
    }
    if (allEmpty) continue;
    var obj = {};
    heads.forEach(function (h, idx) { obj[h] = row[idx] != null ? String(row[idx]) : ''; });
    rows.push(mapRow_(obj, name));
  }
  expectedHeads = expectedHeads; // świadomie: nagłówki z arkusza mają pierwszeństwo
  return rows;
}

function mapRow_(obj, sheetName) {
  if (sheetName === SHEET_UCZESTNICY) {
    return {
      id: pick_(obj, ['id', 'ID']),
      lista: pick_(obj, ['lista']),
      plec: String(pick_(obj, ['płeć', 'plec']) || '').toUpperCase().slice(0, 1),
      wiek: pick_(obj, ['wiek']),
      bilet: pick_(obj, ['bilet']),
      vjw: pick_(obj, ['Visit Japan Web', 'VJW']),
      zgodaRodzicow: pick_(obj, ['zgoda rodziców', 'zgoda rodzicow']),
      regulamin: pick_(obj, ['regulamin podpisany', 'regulamin']),
      ubezpieczenie: pick_(obj, ['ubezpieczenie']),
      imie: pick_(obj, ['imię', 'imie']),
      nazwisko: pick_(obj, ['nazwisko']),
      wspolnota: pick_(obj, ['wspólnota/miasto', 'wspolnota/miasto', 'wspólnota']),
      dataUrodzenia: pick_(obj, ['data urodzenia']),
      niepelnoletni: pick_(obj, ['niepełnoletni', 'niepelnoletni']),
      opiekun: pick_(obj, ['opiekun']),
      paszportWaznyDo: pick_(obj, ['paszport ważny do', 'paszport wazny do']),
      kEta: pick_(obj, ['K-ETA', 'k-eta', 'KETA']),
      zgody: pick_(obj, ['zgody']),
      uwagi: pick_(obj, ['uwagi zdrowotne/dieta', 'uwagi']),
      telefon: pick_(obj, ['telefon']),
      email: pick_(obj, ['email', 'e-mail']),
      status: pick_(obj, ['status']),
      braki: pick_(obj, ['braki'])
    };
  }
  return obj;
}

function normalizeWplata_(raw) {
  var typRaw = String(pick_(raw, ['typ']) || '').trim().toLowerCase();
  var typ = typRaw.indexOf('ogóln') !== -1 || typRaw.indexOf('ogoln') !== -1 ? 'ogolna' : 'imienna';
  if (typRaw && typRaw !== 'imienna' && typ !== 'ogolna') typ = typRaw;
  return {
    data: pick_(raw, ['data']),
    typ: typ,
    typEtykieta: typ === 'ogolna' ? 'ogólna' : 'imienna',
    kto: pick_(raw, ['id uczestnika lub darczyńca', 'id uczestnika lub darczynca', 'kto']),
    kwota: toNumber_(pick_(raw, ['kwota zł', 'kwota zl', 'kwota'])),
    rata: pick_(raw, ['rata']),
    forma: pick_(raw, ['forma']),
    uwagi: pick_(raw, ['uwagi']),
    przyklad: isPrzyklad_(pick_(raw, ['uwagi']), pick_(raw, ['id uczestnika lub darczyńca']), '')
  };
}

function pick_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] != null && String(obj[keys[i]]) !== '') return obj[keys[i]];
  }
  for (var i2 = 0; i2 < keys.length; i2++) {
    var want = keys[i2].toLowerCase();
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && String(k).toLowerCase() === want) {
        return obj[k];
      }
    }
  }
  return '';
}

function isPrzyklad_(a, b, c) {
  var s = (String(a || '') + ' ' + String(b || '') + ' ' + String(c || '')).toUpperCase();
  return s.indexOf('PRZYKŁAD') !== -1 || s.indexOf('PRZYKLAD') !== -1;
}

function toNumber_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v instanceof Date) return 0;
  var s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, '').replace(/\u00a0/g, '').replace('zł', '').replace('zl', '');
  if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  var m2 = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m2) {
    var d2 = new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]));
    return isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}
