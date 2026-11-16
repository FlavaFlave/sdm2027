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

var SHEET_UCZESTNICY = 'Uczestnicy';
var SHEET_WPLATY = 'Wpłaty';
var SHEET_PODSUMOWANIE = 'Podsumowanie';

var HEAD_UCZESTNICY = [
  'id', 'imię', 'nazwisko', 'wspólnota/miasto', 'data urodzenia',
  'niepełnoletni', 'opiekun', 'paszport ważny do', 'K-ETA', 'zgody',
  'uwagi zdrowotne/dieta', 'telefon', 'email', 'status', 'braki'
];

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

    var uczestnicy = readTable_(ss, SHEET_UCZESTNICY, HEAD_UCZESTNICY);
    var wplaty = readTable_(ss, SHEET_WPLATY, HEAD_WPLATY).map(normalizeWplata_);

    var sumaImienne = 0;
    var sumaOgolne = 0;
    wplaty.forEach(function (w) {
      if (w.typ === 'imienna') sumaImienne += w.kwota;
      else if (w.typ === 'ogolna') sumaOgolne += w.kwota;
    });

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
        saldo: wplacono - cena
      };
    });

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

/* ——— pomocnicze ——— */

function getSpreadsheet_() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
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
