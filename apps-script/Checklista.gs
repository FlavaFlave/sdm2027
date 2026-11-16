/**
 * ŚDM 2027 — prosty zapis checklisty do PUBLICZNEGO arkusza
 * „ŚDM 2027 – dane strony organizatorów”.
 *
 * Wklej do: ten arkusz → Rozszerzenia → Apps Script
 * (osobny projekt niż panel danych osobowych).
 * Wdrożenie: zob. INSTRUKCJA-checklista.md
 *
 * Wykonuj jako: Użytkownik uzyskujący dostęp do aplikacji internetowej
 * Kto ma dostęp: Wszyscy użytkownicy posiadający konto Google
 *
 * Zapis wymaga uprawnień edytora arkusza. Brak wdrożenia nie psuje strony:
 * strona publiczna wtedy tylko pokazuje dane i link „Edytuj w arkuszu”.
 *
 * Nie przechowuj tu danych uczestników — tylko zadania organizatorów.
 */

var SHEET_NAME = 'Checklista';
var OSOBY = ['Artur', 'Jakub Ś.', 'Jakub Ż.', 'Staszek', 'Robert', 'Kinga', 'Dorota', 'Kasia', 'Judyta', 'Basia'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('checklista')
    .setTitle('ŚDM 2027 — checklista organizatorów')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getChecklist() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return { ok: false, error: 'NO_ACCESS' };
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) return { ok: false, error: 'MISSING_SHEET', message: 'Brak karty Checklista.' };
    var values = sh.getDataRange().getDisplayValues();
    if (!values.length) return { ok: true, items: [], osoby: OSOBY, mozeEdytowac: false };
    var heads = values[0].map(function (h) { return String(h || '').trim(); });
    var items = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!String(row[0] || '').trim()) continue;
      var o = {};
      heads.forEach(function (h, idx) { o[h] = row[idx] != null ? String(row[idx]) : ''; });
      items.push({
        row: i + 1,
        id: o['ID'],
        kat: o['Kategoria'],
        zadanie: o['Zadanie'],
        osoba: o['Osoba odpowiedzialna'] || o['Osoba'] || '',
        termin: o['Termin (data)'] || '',
        status: o['Status'] || '',
        zrobione: isTak_(o['Zrobione']),
        komentarz: o['Komentarz'] || '',
        zmieniono: o['Zmieniono'] || '',
        uwagi: o['Uwagi'] || ''
      });
    }
    var canEdit = false;
    try { canEdit = sh.getRange('A1').canEdit(); } catch (e) { canEdit = false; }
    return { ok: true, items: items, osoby: OSOBY, mozeEdytowac: canEdit };
  } catch (e) {
    return { ok: false, error: 'NO_ACCESS', message: String(e && e.message || e) };
  }
}

function saveChecklistItem(payload) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) return { ok: false, error: 'MISSING_SHEET' };
    if (!sh.getRange('A1').canEdit()) {
      return { ok: false, error: 'NO_WRITE', message: 'Do zapisu potrzebujesz uprawnień edytora arkusza.' };
    }
    var p = payload || {};
    var row = Number(p.row);
    if (!row || row < 2) return { ok: false, error: 'VALIDATION', message: 'Nieznany wiersz.' };
    var heads = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var col = function (name) {
      for (var i = 0; i < heads.length; i++) {
        if (String(heads[i]).trim() === name) return i + 1;
      }
      return 0;
    };
    var cOsoba = col('Osoba odpowiedzialna') || col('Osoba');
    var cZrob = col('Zrobione');
    var cKom = col('Komentarz');
    var cZmien = col('Zmieniono');
    var cStatus = col('Status');
    var now = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm');
    if (cOsoba) sh.getRange(row, cOsoba).setValue(String(p.osoba || ''));
    if (cZrob) sh.getRange(row, cZrob).setValue(p.zrobione ? 'TAK' : 'NIE');
    if (cKom) sh.getRange(row, cKom).setValue(String(p.komentarz || ''));
    if (cZmien) sh.getRange(row, cZmien).setValue(now);
    if (cStatus) sh.getRange(row, cStatus).setValue(p.zrobione ? 'zrobione' : (p.status || 'do zrobienia'));
    return getChecklist();
  } catch (e) {
    return { ok: false, error: 'NO_WRITE', message: String(e && e.message || e) };
  }
}

function isTak_(v) {
  var s = String(v || '').trim().toLowerCase();
  return s === 'tak' || s === 'true' || s === 'prawda' || s === '1' || s === 'yes';
}
