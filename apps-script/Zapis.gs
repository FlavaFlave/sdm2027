/**
 * ŚDM 2027 — jeden skrypt do arkusza „dane strony organizatorów” (koszty, raty, wpłaty zbiorcze, checklista).
 *
 * Co robi:
 *  1. GET  ?action=tabele          → strona pobiera wszystkie karty arkusza (arkusz NIE musi być publiczny).
 *  2. POST {action:"checklista"}  → zapis osoby, „zrobione” i komentarza przy zadaniu.
 *  3. POST {action:"decyzje"}     → zatwierdzenie wybranych opcji jako obowiązującego planu (kolumna „Wybrana”)
 *                                   + wpis do karty „Historia decyzji”.
 *
 * Zapis wymaga kodu organizatorów (KOD_ORGANIZATOROW we Właściwościach skryptu). Kod wpisuje się raz na stronie,
 * zostaje w przeglądarce. Bez kodu można tylko czytać.
 *
 * Wdrożenie: zob. INSTRUKCJA-zapis.md
 * Wykonuj jako: Ja (właściciel arkusza) · Kto ma dostęp: Każdy
 *
 * NIE podpinaj tego skryptu do arkusza z danymi osobowymi uczestników.
 */

/** Arkusz „ŚDM 2027 – dane strony organizatorów” (konto Gmail Jakuba). */
var ARKUSZ_ID = '1ZSGVRJc9BMXGkoJjPAwyjnynXTRn42LsPZhB-l0MGvs';
function ss_() {
  try { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ARKUSZ_ID') || ARKUSZ_ID); }
  catch (e) { return SpreadsheetApp.getActiveSpreadsheet(); }
}

var TABS = ['Dni', 'Miejsca', 'Transport', 'Noclegi', 'Decyzje', 'Koszty', 'Wpłaty', 'Checklista', 'Ustawienia'];
var OSOBY = ['Artur', 'Jakub Ś.', 'Jakub Ż.', 'Staszek', 'Robert', 'Kinga', 'Dorota', 'Kasia', 'Judyta', 'Basia'];

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'tabele';
  if (action === 'tabele') {
    // Odczyt publiczny: bez komentarzy z checklisty (mogą zawierać wewnętrzne ustalenia).
    var kod = PropertiesService.getScriptProperties().getProperty('KOD_ORGANIZATOROW') || '';
    var full = kod && e && e.parameter && e.parameter.kod === kod;
    var out = readTabs_();
    if (!full && out.tabele.Checklista && out.tabele.Checklista.length) {
      var h = out.tabele.Checklista[0];
      var ci = h.indexOf('Komentarz');
      if (ci >= 0) out.tabele.Checklista = out.tabele.Checklista.map(function (r, i) { var c = r.slice(); if (i > 0 && c[ci]) c[ci] = '(komentarz widoczny po podaniu kodu)'; return c; });
    }
    return json_(out);
  }
  if (action === 'ping') return json_({ ok: true });
  return json_({ ok: false, error: 'UNKNOWN_ACTION' });
}

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'BAD_JSON' }); }
  var kod = PropertiesService.getScriptProperties().getProperty('KOD_ORGANIZATOROW') || '';
  if (!kod || String(p.kod || '') !== kod) return json_({ ok: false, error: 'BAD_CODE', message: 'Nieprawidłowy kod organizatorów.' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (p.action === 'checklista') return json_(saveChecklist_(p));
    if (p.action === 'decyzje') return json_(saveDecisions_(p));
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } finally {
    lock.releaseLock();
  }
}

function readTabs_() {
  var ss = ss_();
  var out = { ok: true, tabele: {} };
  TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    out.tabele[name] = sh ? sh.getDataRange().getDisplayValues() : [];
  });
  return out;
}

function heads_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
}
function col_(heads, names) {
  for (var j = 0; j < names.length; j++) {
    var i = heads.indexOf(names[j]);
    if (i >= 0) return i + 1;
  }
  return 0;
}
function ensureCol_(sh, heads, name) {
  var c = col_(heads, [name]);
  if (c) return c;
  c = sh.getLastColumn() + 1;
  sh.getRange(1, c).setValue(name);
  heads.push(name);
  return c;
}
function now_() { return Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm'); }

function saveChecklist_(p) {
  var sh = ss_().getSheetByName('Checklista');
  if (!sh) return { ok: false, error: 'MISSING_SHEET' };
  var heads = heads_(sh);
  var cId = col_(heads, ['ID']);
  var ids = sh.getRange(2, cId, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
  var idx = ids.indexOf(String(p.id || '').trim());
  if (idx < 0) return { ok: false, error: 'NO_ROW', message: 'Nie ma zadania o ID ' + p.id };
  var row = idx + 2;
  var cOsoba = ensureCol_(sh, heads, 'Osoba odpowiedzialna');
  var cZrob = ensureCol_(sh, heads, 'Zrobione');
  var cKom = ensureCol_(sh, heads, 'Komentarz');
  var cZmien = ensureCol_(sh, heads, 'Zmieniono');
  var cStatus = col_(heads, ['Status']);
  var autor = OSOBY.indexOf(p.autor) >= 0 ? p.autor : 'organizator';
  if (p.osoba !== undefined) sh.getRange(row, cOsoba).setValue(OSOBY.indexOf(p.osoba) >= 0 ? p.osoba : '');
  if (p.zrobione !== undefined) {
    sh.getRange(row, cZrob).setValue(p.zrobione ? 'TAK' : 'NIE');
    if (cStatus) sh.getRange(row, cStatus).setValue(p.zrobione ? 'zrobione' : 'do zrobienia');
  }
  var tekst = String(p.komentarz || '').trim();
  if (tekst) {
    var prev = String(sh.getRange(row, cKom).getDisplayValue() || '');
    var line = now_() + ' · ' + autor + ': ' + tekst.replace(/\n+/g, ' ');
    sh.getRange(row, cKom).setValue(prev ? prev + '\n' + line : line);
  }
  sh.getRange(row, cZmien).setValue(now_() + ' (' + autor + ')');
  return { ok: true, tabele: { Checklista: sh.getDataRange().getDisplayValues() } };
}

function saveDecisions_(p) {
  var ss = ss_();
  var sh = ss.getSheetByName('Decyzje');
  if (!sh) return { ok: false, error: 'MISSING_SHEET' };
  var heads = heads_(sh);
  var cD = col_(heads, ['ID decyzji']);
  var cO = col_(heads, ['ID opcji']);
  var cW = ensureCol_(sh, heads, 'Wybrana');
  var choices = p.wybory || {};
  var n = sh.getLastRow() - 1;
  if (n < 1) return { ok: false, error: 'EMPTY' };
  var data = sh.getRange(2, 1, n, sh.getLastColumn()).getDisplayValues();
  var changed = [];
  data.forEach(function (r, i) {
    var d = String(r[cD - 1]).trim(), o = String(r[cO - 1]).trim();
    if (!(d in choices)) return;
    var v = String(choices[d]) === o ? 'TAK' : '';
    if (String(r[cW - 1]).trim().toUpperCase() !== v) {
      sh.getRange(i + 2, cW).setValue(v);
      if (v) changed.push(d + '=' + o);
    }
  });
  var log = ss.getSheetByName('Historia decyzji') || ss.insertSheet('Historia decyzji');
  if (log.getLastRow() === 0) log.appendRow(['Kiedy', 'Kto', 'Zmienione decyzje', 'Liczba osób', 'Cena na płacącego (zł)', 'Uwaga']);
  var autor = OSOBY.indexOf(p.autor) >= 0 ? p.autor : 'organizator';
  log.appendRow([now_(), autor, changed.join('; ') || '(bez zmian)', p.osob || '', p.cena || '', String(p.uwaga || '')]);
  return { ok: true, zmienione: changed };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
