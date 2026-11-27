/**
 * ŚDM 2027 — jeden skrypt do arkusza „dane strony organizatorów” (koszty, raty, wpłaty zbiorcze, checklista).
 *
 * Co robi:
 *  1. GET  ?action=tabele          → strona pobiera wszystkie karty arkusza (arkusz NIE musi być publiczny).
 *  2. POST {action:"checklista"}  → zapis osoby, „zrobione” i komentarza przy zadaniu.
 *  3. POST {action:"decyzje"}     → zatwierdzenie wybranych opcji jako obowiązującego planu (kolumna „Wybrana”)
 *                                   + wpis do karty „Historia decyzji”.
 *  4. Zbiórka (zakładki „Śpiew i parafie” oraz „Zbiórka i darczyńcy”) — OSOBNY, prywatny arkusz
 *     „ŚDM 2027 — Zbiórka (dane osobowe)”, który skrypt sam zakłada przy pierwszym użyciu.
 *     GET  ?action=zbiorka&kod=…   → karty Osoby, Wydarzenia, Parafie (+ Darczyńcy, Datki tylko dla organizatorów)
 *     GET  ?action=kalendarz       → publicznie: tylko daty, parafie i notatki dla jadących (bez nazwisk i kwot)
 *     POST {action:"zb_zapisz", tab, row} · {action:"zb_usun", tab, id} · {action:"zb_import", tab:"Parafie", rows}
 *     Kod skarbnika (KOD_SKARBNIKA we Właściwościach) pozwala tylko rozliczać wydarzenia i dopisywać osoby.
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
  if (action === 'plan') {
    // Publicznie, dla strony jadących: tylko zatwierdzone opcje (bez kosztów i opisów).
    return json_({ ok: true, wybrane: approved_() });
  }
  if (action === 'tabele') {
    // Cały arkusz (koszty, raty, checklista) — tylko z kodem organizatorów.
    var kod = PropertiesService.getScriptProperties().getProperty('KOD_ORGANIZATOROW') || '';
    if (!kod || !e || !e.parameter || e.parameter.kod !== kod) return json_({ ok: false, error: 'BAD_CODE' });
    return json_(readTabs_());
  }
  if (action === 'kalendarz') return json_({ ok: true, wydarzenia: publicCalendar_() });
  if (action === 'zbiorka') {
    var rola = role_(e && e.parameter && e.parameter.kod);
    if (!rola) return json_({ ok: false, error: 'BAD_CODE' });
    return json_(readZb_(rola));
  }
  if (action === 'ping') return json_({ ok: true });
  return json_({ ok: false, error: 'UNKNOWN_ACTION' });
}

function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'BAD_JSON' }); }
  var rola = role_(p.kod);
  if (!rola) return json_({ ok: false, error: 'BAD_CODE', message: 'Nieprawidłowy kod.' });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (p.action === 'zb_zapisz') return json_(zbSave_(p, rola));
    if (p.action === 'zb_usun') return json_(zbDelete_(p, rola));
    if (p.action === 'zb_import') return json_(zbImport_(p, rola));
    if (rola !== 'org') return json_({ ok: false, error: 'BAD_CODE', message: 'Kod skarbnika pozwala tylko na zbiórkę.' });
    if (p.action === 'checklista') return json_(saveChecklist_(p));
    if (p.action === 'decyzje') return json_(saveDecisions_(p));
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } finally {
    lock.releaseLock();
  }
}

function approved_() {
  var sh = ss_().getSheetByName('Decyzje');
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getDataRange().getDisplayValues();
  var h = v[0].map(function (x) { return String(x).trim(); });
  var cD = h.indexOf('ID decyzji'), cO = h.indexOf('ID opcji'), cW = h.indexOf('Wybrana');
  if (cD < 0 || cO < 0 || cW < 0) return out;
  v.slice(1).forEach(function (r) { if (String(r[cW]).trim().toUpperCase() === 'TAK') out[String(r[cD]).trim()] = String(r[cO]).trim(); });
  return out;
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

/* ===================== ZBIÓRKA: śpiew, parafie, darczyńcy ===================== */

var ZB_COLS = {
  'Osoby': ['ID', 'Imię i nazwisko', 'Jedzie do Seulu', 'Śpiewa', 'ID uczestnika', 'Uwagi', 'Zmieniono'],
  'Wydarzenia': ['ID', 'Data', 'Godzina', 'Parafia ID', 'Parafia', 'Miejscowość', 'Diecezja', 'Typ', 'Status', 'Pomocnicy', 'Pomoc z parafii',
                 'Notatka dla jadących', 'Uwagi', 'Obecni', 'Kwota', 'Podział', 'Zmieniono', 'Osób na Mszy'],
  'Parafie': ['ID', 'Nazwa', 'Miejscowość', 'Dekanat', 'Diecezja', 'Adres', 'Telefon', 'E-mail', 'WWW', 'Msze niedzielne',
              'Wspólnoty neokatechumenalne', 'Status', 'Kontakt', 'Uwagi', 'Źródło', 'Zmieniono', 'Ranking', 'Uzasadnienie'],
  'Darczyńcy': ['ID', 'Nazwa', 'Typ', 'Kontakt', 'Prowadzi', 'Etap', 'Potencjał', 'Następny krok', 'Termin', 'Uwagi', 'Zmieniono'],
  'Datki': ['ID', 'Data', 'Darczyńca ID', 'Darczyńca', 'Kwota', 'Status', 'Przeznaczenie', 'Odbiorcy', 'Uwagi', 'Zmieniono'],
  'Kontakty': ['ID', 'Rodzaj', 'Nazwa', 'Status', 'Kto', 'Notatka', 'Zmieniono'],
};
/** Co może kod skarbnika (młodzi rozliczający niedzielę): bez darczyńców. */
var ZB_SKARBNIK = { 'Osoby': true, 'Wydarzenia': true, 'Parafie': false };

function role_(kod) {
  var pr = PropertiesService.getScriptProperties();
  var org = pr.getProperty('KOD_ORGANIZATOROW') || '';
  var sk = pr.getProperty('KOD_SKARBNIKA') || '';
  kod = String(kod || '');
  if (org && kod === org) return 'org';
  if (sk && kod === sk) return 'skarbnik';
  return '';
}

/** Prywatny arkusz zbiórki: zakładany przy pierwszym użyciu, nieudostępniany nikomu. */
function zb_() {
  var pr = PropertiesService.getScriptProperties();
  var id = pr.getProperty('ZBIORKA_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('ŚDM 2027 — Zbiórka (dane osobowe, NIE udostępniać)');
    pr.setProperty('ZBIORKA_ID', ss.getId());
  }
  Object.keys(ZB_COLS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); sh.getRange('A:Z').setNumberFormat('@'); sh.appendRow(ZB_COLS[name]); sh.setFrozenRows(1); sh.getRange(1, 1, 1, ZB_COLS[name].length).setFontWeight('bold'); }
    else if (sh.getLastRow() === 0) sh.appendRow(ZB_COLS[name]);
  });
  var def = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  return ss;
}

function readZb_(rola) {
  var ss = zb_();
  var out = { ok: true, rola: rola, tabele: {} };
  Object.keys(ZB_COLS).forEach(function (name) {
    if (rola !== 'org' && !(name in ZB_SKARBNIK)) return;
    out.tabele[name] = ss.getSheetByName(name).getDataRange().getDisplayValues();
  });
  return out;
}

function zbSave_(p, rola) {
  var tab = String(p.tab || '');
  if (!ZB_COLS[tab]) return { ok: false, error: 'BAD_TAB' };
  if (rola !== 'org' && !ZB_SKARBNIK[tab]) return { ok: false, error: 'BAD_CODE', message: 'Kod skarbnika nie pozwala zmieniać tej karty.' };
  var row = p.row || {};
  var id = String(row['ID'] || '').trim();
  if (!id) return { ok: false, error: 'NO_ID' };
  var sh = zb_().getSheetByName(tab);
  var heads = heads_(sh);
  ZB_COLS[tab].forEach(function (c) { ensureCol_(sh, heads, c); });
  var autor = OSOBY.indexOf(p.autor) >= 0 ? p.autor : (rola === 'skarbnik' ? 'skarbnik' : 'organizator');
  row['Zmieniono'] = now_() + ' (' + autor + ')';
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); }) : [];
  var idx = ids.indexOf(id);
  var values = heads.map(function (h) { return row[h] !== undefined ? String(row[h]) : null; });
  if (idx < 0) {
    sh.appendRow(values.map(function (v) { return v === null ? '' : v; }));
  } else {
    var r = idx + 2;
    var cur = sh.getRange(r, 1, 1, heads.length).getValues()[0];
    sh.getRange(r, 1, 1, heads.length).setValues([values.map(function (v, i) { return v === null ? cur[i] : v; })]);
  }
  return { ok: true };
}

function zbDelete_(p, rola) {
  var tab = String(p.tab || '');
  if (!ZB_COLS[tab]) return { ok: false, error: 'BAD_TAB' };
  if (rola !== 'org') return { ok: false, error: 'BAD_CODE', message: 'Usuwać mogą tylko organizatorzy.' };
  var sh = zb_().getSheetByName(tab);
  if (sh.getLastRow() < 2) return { ok: true };
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
  var idx = ids.indexOf(String(p.id || '').trim());
  if (idx >= 0) sh.deleteRow(idx + 2);
  return { ok: true };
}

function zbImport_(p, rola) {
  if (rola !== 'org') return { ok: false, error: 'BAD_CODE' };
  if (p.tab !== 'Parafie') return { ok: false, error: 'BAD_TAB' };
  var sh = zb_().getSheetByName('Parafie');
  var heads = heads_(sh);
  ZB_COLS['Parafie'].forEach(function (c) { ensureCol_(sh, heads, c); });
  var existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, heads.length).getDisplayValues() : [];
  var cN = heads.indexOf('Nazwa'), cM = heads.indexOf('Miejscowość');
  var seen = {};
  existing.forEach(function (r) { seen[(r[cN] + '|' + r[cM]).toLowerCase()] = true; });
  var added = 0, skipped = 0;
  var rows = (p.rows || []).slice(0, 2000);
  var batch = [];
  rows.forEach(function (row) {
    var key = (String(row['Nazwa'] || '') + '|' + String(row['Miejscowość'] || '')).toLowerCase();
    if (!row['Nazwa'] || seen[key]) { skipped++; return; }
    seen[key] = true;
    row['Zmieniono'] = now_() + ' (import)';
    batch.push(heads.map(function (h) { return row[h] !== undefined ? String(row[h]) : ''; }));
    added++;
  });
  if (batch.length) sh.getRange(sh.getLastRow() + 1, 1, batch.length, heads.length).setValues(batch);
  return { ok: true, dodane: added, pominiete: skipped };
}

/** Dla strony jadących: bez nazwisk, kwot, kontaktów i uwag organizatorów. */
function publicCalendar_() {
  var pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('ZBIORKA_ID')) return [];
  var sh = zb_().getSheetByName('Wydarzenia');
  if (sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getDisplayValues();
  var h = v[0];
  function c(n) { return h.indexOf(n); }
  return v.slice(1).filter(function (r) { return r[c('Status')] !== 'odwołane' && r[c('Data')]; }).map(function (r) {
    return { data: r[c('Data')], godzina: r[c('Godzina')], parafia: r[c('Parafia')], miejscowosc: r[c('Miejscowość')],
             typ: r[c('Typ')], status: r[c('Status')], notatka: r[c('Notatka dla jadących')] };
  });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
