/**
 * Wejście aplikacji: wczytanie danych, zakładki, karty dni, decyzje, logistyka.
 * Ścieżki są względne (./data/data.json), żeby strona działała na GitHub Pages.
 * Nie zmieniaj atrybutów id w HTML ani kluczy w data.json — tu są one odczytywane.
 */
import { $, $$, escapeHtml, formatZl, formatZlDelta, parseCsv, rowsToObjects, num, SHEET_ID, setSheetId, sheetUrl, TAB_NAMES, CHOICE_IDS, N_GROUP, FUJI_PER } from "./util.js";
import {
  groupDecisions, defaultChoices, parseHash, writeHash, computeCost, baselineCost,
  activeEffects, applyDays, scenarioLogs, normalizeChoices, parseWplatySheet, parseChecklistSheet,
  disabledGroups, defaultPeople, priceCurve,
} from "./cost.js";
import { validateDays, dayChecksHtml, mealsHtml, renderFlags } from "./checks.js";
import { setAppUrl, fetchTables, post, hasApp, askCred } from "./zapis.js";
import { initZbiorka, setCostInfo } from "./zbiorka.js";
import { initKontakty, drawContactLayers, renderKontakty } from "./kontakty.js";
import { setDetailState, bindDayClicks, openDay } from "./details.js";
import { tileHtml, bestPhoto } from "./tiles.js";
import { getMaps, updateMap, visiblePlaces, routeLines, focusMap, isJapanPlace, isKoreaPlace, legendHtml } from "./maps.js";
import { renderBudget, resizeBudgetChart } from "./budget.js";
import { renderChecklist } from "./checklist.js";

/* stałe localStorage — dopisane tutaj, gdyby util ich nie eksportował */
const STORAGE_KEY = "sdm2027-org-decisions";
const SCENARIO_KEY = "sdm2027-org-scenarios";
const CHECK_KEY = "sdm2027-org-checks";

function fromSheetTables(tables) {
  const dni = rowsToObjects(tables.Dni).map((r) => ({
    data: r["Data"],
    data_pl: (r["Data"] || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}`),
    dzien: r["Dzień tygodnia"], miejsce: r["Miejsce"], program: r["Program"], nocleg: r["Nocleg"],
    transport: r["Transport"], km: r["Km"], czas_h: r["Czas (h)"], uwagi: r["Uwagi"], kraj: r["Kraj"],
    status: r["Status"], miejsca: r["ID miejsc"] || "",
  }));
  const miejsca = rowsToObjects(tables.Miejsca).map((r) => ({
    id: r["ID"], nazwa: r["Nazwa"], kraj: r["Kraj"], lat: parseFloat(r["Szerokość (lat)"]),
    lng: parseFloat(r["Długość (lng)"]), typ: r["Typ"], dni: r["Dni"], opis: r["Opis"],
    zwiedzamy: r["Co zwiedzamy"], zdjecie_url: r["URL zdjęcia"], zdjecie_zrodlo: r["Autor i licencja zdjęcia"],
    wariant: String(r["Wariant"] || "").toLowerCase() === "tak",
  }));
  const decyzje = rowsToObjects(tables.Decyzje).filter((r) => r["ID decyzji"]).map((r) => ({
    id: r["ID decyzji"], decyzja: r["Decyzja"], opcja_id: r["ID opcji"], opcja: r["Opcja"],
    domyslna: String(r["Domyślna"]).toLowerCase() === "tak",
    rekomendacja: String(r["Rekomendacja"]).toLowerCase() === "tak",
    wybrana: String(r["Wybrana"] || "").toLowerCase() === "tak",
    zmiany: r["Zmiany kosztów (id:+N / id:=N / id:*N)"] || r["Zmiany kosztów"] || "",
    efekt: r["Efekt trasy (kod wariantu)"] || r["Efekt trasy"] || "",
    wplyw: r["Wpływ"] || r["Wpływ na trasę i koszt"] || "",
    plusy: r["Plusy"] || "",
    minusy: r["Minusy"] || "",
    kontekst: r["Kontekst"] || "",
    opis: r["Opis decyzji"] || r["Opis"] || "",
    ograniczenia: r["Co wpływa na decyzję"] || r["Ograniczenia"] || "",
    wplyw_inne: r["Wpływ na inne elementy"] || "",
    rekomendacja_tekst: r["Uzasadnienie rekomendacji"] || "",
    termin: r["Termin"],
  }));
  const pozycje = rowsToObjects(tables.Koszty).filter((r) => r["ID"]).map((r) => ({
    id: r["ID"],
    grupa: r["Grupa (wykres)"] || r["Grupa"] || r["Kategoria"] || "",
    pozycja: r["Pozycja"] || r["Kategoria"] || "",
    jednostka: (r["Jednostka (os/grupa/proc)"] || r["Jednostka"] || "os").toLowerCase(),
    kwota: num(r["Kwota"]) ?? 0,
    zrodlo: r["Źródło / założenie"] || r["Źródło"] || "",
    status: r["Status"] || "",
  }));
  const transport = rowsToObjects(tables.Transport).map((r) => ({
    odcinek: r["Odcinek"], srodek: r["Środek"], przewoznik: r["Przewoźnik"], kontakt: r["Kontakt"],
    cena_os: r["Cena zł/os."], cena_uwaga: r["Uwaga do ceny"], status: r["Status"], uwagi: r["Uwagi"],
  }));
  const noclegi = rowsToObjects(tables.Noclegi).map((r) => ({
    miasto: r["Miasto"], noce: r["Liczba nocy"], daty: r["Daty"], obiekt: r["Nazwa obiektu"],
    kontakt: r["Kontakt"], cena_os_noc: r["Cena zł/os/noc"], status: r["Status"], uwagi: r["Uwagi"],
  }));
  return { dni, miejsca, decyzje, pozycje, transport, noclegi,
    wplatyRaty: tables.Wpłaty ? parseWplatySheet(tables.Wpłaty) : null,
    checklistaSheet: tables.Checklista ? parseChecklistSheet(tables.Checklista) : null,
  };
}

function mergePlaces(base, incoming) {
  const byId = {};
  base.forEach((p) => { byId[p.id] = { ...p }; });
  incoming.forEach((p) => { if (p.id) byId[p.id] = { ...byId[p.id], ...p }; });
  return Object.values(byId);
}


function parseUstawieniaSheet(rows) {
  const out = {};
  if (!rows || !rows.length) return out;
  const objects = rowsToObjects(rows);
  const looksLikeKv = objects.some((r) => r["Klucz"] || r["klucz"] || r["Key"]);
  if (looksLikeKv) {
    objects.forEach((r) => {
      const k = String(r["Klucz"] || r["klucz"] || r["Key"] || "").trim();
      const v = String(r["Wartość"] || r["Wartosc"] || r["Value"] || r["wartość"] || "").trim();
      if (k) out[k] = v;
    });
    return out;
  }
  // fallback: first column key, second value, even without header names
  rows.slice(1).forEach((row) => {
    const k = String((row && row[0]) || "").trim();
    const v = String((row && row[1]) || "").trim();
    if (k) out[k] = v;
  });
  return out;
}

async function loadUstawienia(fallbackMeta) {
  const fb = fallbackMeta || {};
  const out = {
    privatePanelUrl: fb.privatePanelUrl || "",
    checklistAppUrl: fb.checklistAppUrl || "",
  };
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("Ustawienia")}`);
    if (!r.ok) return out;
    const text = await r.text();
    if (/<!DOCTYPE|<html|must be signed|Sign in/i.test(text) || text.length < 8) return out;
    const ust = parseUstawieniaSheet(parseCsv(text));
    if (String(ust.privatePanelUrl || "").trim()) out.privatePanelUrl = String(ust.privatePanelUrl).trim();
    if (String(ust.checklistAppUrl || "").trim()) out.checklistAppUrl = String(ust.checklistAppUrl).trim();
    return out;
  } catch (_) {
    return out;
  }
}

async function loadPrivatePanelUrl(fallbackUrl) {

  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("Ustawienia")}`);
    if (!r.ok) return fallbackUrl || "";
    const text = await r.text();
    if (/<!DOCTYPE|<html|must be signed|Sign in/i.test(text) || text.length < 8) return fallbackUrl || "";
    const ust = parseUstawieniaSheet(parseCsv(text));
    const url = String(ust.privatePanelUrl || "").trim();
    return url || fallbackUrl || "";
  } catch (_) {
    return fallbackUrl || "";
  }
}

async function loadData() {
  // Dane publiczne (plan, miejsca) + plik organizatorów (koszty, decyzje, ustawienia, uwagi do dni).
  const pub = await (await fetch("./data/data.json")).json();
  const org = await (await fetch("./data/org-j14atsfq5n.json")).json();
  const orgDays = org.dni_org || {};
  const fallback = {
    ...pub, ...org,
    meta: { ...(pub.meta || {}), ...(org.meta || {}) },
    dni: (pub.dni || []).map((x) => ({ ...x, ...(orgDays[x.data] || {}) })),
    miejsca: pub.miejsca,
    decyzje: org.decyzje || pub.decyzje,
    warianty: org.warianty || pub.warianty,
  };
  delete fallback.dni_org;
  setSheetId(fallback.meta.sheet_id);
  const meta0 = fallback.meta || {};
  let tables = null, source = "";
  // 1) Apps Script (arkusz nie musi być publiczny) — gdy w data.json jest meta.zapisAppUrl.
  if (meta0.zapisAppUrl) {
    tables = await fetchTables(meta0.zapisAppUrl);
    if (tables) source = "arkusz Google (przez skrypt zapisu)";
  }
  // 2) Opublikowany / udostępniony arkusz (gviz CSV).
  if (!tables) {
    try {
      const fetches = TAB_NAMES.map((tab) =>
        fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`)
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      );
      const texts = await Promise.race([
        Promise.all(fetches),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
      if (texts.some((t) => /<!DOCTYPE|<html|must be signed|Sign in/i.test(t) || t.length < 40)) throw new Error("sheet not published");
      tables = {};
      TAB_NAMES.forEach((name, i) => { tables[name] = parseCsv(texts[i]); });
      source = "arkusz Google (udostępniony CSV)";
    } catch (_) { tables = null; }
  }
  if (!tables) {
    fallback.meta.source = "lokalny plik data/data.json (arkusz niepodłączony)";
    fallback.meta.sheetLive = false;
    return fallback;
  }
  const parsed = fromSheetTables(tables);
  // Podział ról: TEKSTY (program dni, miejsca, opisy decyzji) są w data.json,
  // LICZBY i STANY (kwoty kosztów, raty i wpłaty, checklista, „Wybrana” przy decyzjach, transport, noclegi) — w arkuszu.
  const miejsca = fallback.miejsca;
  parsed.dni = fallback.dni;
  const chosen = new Set(parsed.decyzje.filter((x) => x.wybrana).map((x) => x.id + "|" + x.opcja_id));
  parsed.decyzje = (fallback.decyzje || []).map((x) => ({ ...x, wybrana: chosen.has(x.id + "|" + x.opcja_id) }));
  const sheetPoz = Object.fromEntries(parsed.pozycje.map((x) => [x.id, x]));
  const pozycje = ((fallback.model || {}).pozycje || []).map((x) => {
    const sp = sheetPoz[x.id];
    return sp && Number.isFinite(Number(sp.kwota)) ? { ...x, kwota: Number(sp.kwota), status: sp.status || x.status, zrodlo: sp.zrodlo || x.zrodlo } : x;
  });
  const model = { ...(fallback.model || {}), pozycje };
  const wplaty = { ...(fallback.wplaty || {}) };
  if (parsed.wplatyRaty && parsed.wplatyRaty.length) wplaty.raty = parsed.wplatyRaty;
  const ust = tables.Ustawienia ? parseUstawieniaSheet(tables.Ustawienia) : {};
  return {
    ...fallback, ...parsed, miejsca, model, wplaty,
    transport: parsed.transport.length ? parsed.transport : fallback.transport,
    noclegi: parsed.noclegi.length ? parsed.noclegi : fallback.noclegi,
    checklista: (parsed.checklistaSheet && parsed.checklistaSheet.length) ? parsed.checklistaSheet : fallback.checklista,
    warianty: fallback.warianty, logistyka: fallback.logistyka,
    meta: { ...fallback.meta, source, sheetLive: true,
      privatePanelUrl: ust.privatePanelUrl || fallback.meta.privatePanelUrl || "" },
  };
}

function isJapanDay(d) {
  return /Japonia|Polska/i.test(d.kraj) && !/^5\.|^6\.|^7\.|^8\.|^9\.|^10\.|^11\./.test(d.data_pl || "");
}
function isKoreaDay(d) {
  return /Korea/i.test(d.kraj);
}
function photoForDay(day, places) {
  return bestPhoto(day, places);
}
function dayCard(day, places, changed, checks) {
  const photo = photoForDay(day, places);
  const chips = [];
  if (day.transport) chips.push(day.transport);
  if (day.km) chips.push(day.km.includes("km") ? day.km : `${day.km} km`);
  if (day.czas_h) chips.push(/h|ok\./i.test(day.czas_h) ? day.czas_h : `${day.czas_h} h`);
  if (day.nocleg) chips.push(`Nocleg: ${day.nocleg}`);
  const t = tileHtml(day, photo);
  const notes = day.uwagi ? `<p class="day-notes">${escapeHtml(day.uwagi)}</p>` : "";
  const dateShort = (day.data_pl || "").replace(".2027", "");
  const cls = changed ? "day-card is-changed" : "day-card";
  return `<article class="${cls}" data-day="${escapeHtml(day.data || "")}">
    <div class="${t.cls}" ${t.style}>
      ${t.inner}
      <div class="date-badge"><b>${escapeHtml(dateShort)}</b><span>${escapeHtml(day.dzien || "")}</span></div>
    </div>
    <div class="day-body">
      ${t.title ? `<p class="tile-kicker">${escapeHtml(t.title)}</p>` : ""}
      <h3>${escapeHtml(day.miejsce)}</h3>
      <div class="day-meta">${chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>
      <p>${escapeHtml(day.program || "")}</p>
      ${mealsHtml(day)}
      ${dayChecksHtml(checks && checks.byDay[day.data])}
      ${notes}${t.cap}
      <button type="button" class="btn btn-more" data-open-day="${escapeHtml(day.data || "")}">Pełny opis dnia, historia miejsc i zdjęcia →</button>
    </div>
  </article>`;
}
function fujiModuleCard(places, n, per) {
  const FUJI_PER = per;
  const photo = places.find((p) => p.id === "fuji" && p.zdjecie_url);
  const style = photo ? `style="background-image:url('${photo.zdjecie_url.replace(/'/g, "%27")}')"` : "";
  const cap = photo ? `<p class="photo-cap">${escapeHtml(photo.nazwa)}. ${escapeHtml(photo.zdjecie_zrodlo)}</p>` : "";
  return `<article class="day-card module is-changed">
    <div class="day-photo" ${style}>
      <div class="date-badge"><b>4–5.08</b><span>Fuji dla chętnych</span></div>
    </div>
    <div class="day-body">
      <h3>Wejście na Fudżi — ${n} chętnych</h3>
      <div class="day-meta"><span class="chip">+ ${formatZl(FUJI_PER, 0)} na wchodzącego</span><span class="chip">razem ${formatZl(n * FUJI_PER, 0)}</span></div>
      <p>4.08 autokar na 5. stację szlaku Yoshida (2305 m), wejście do schroniska na 7.–8. stacji. 5.08 wschód słońca na szczycie (3776 m), zejście do ok. 11:00 i dołączenie do grupy nad jeziorem Yamanaka przed lotem do Seulu.</p>
      <p class="day-notes">Niepełnoletni za zgodą rodziców i z opiekunem; osobny kierownik grupy górskiej. Przy złej pogodzie wejście odwołane rano 4.08.</p>
      ${cap}
    </div>
  </article>`;
}
function renderTimeline(days) {
  const el = $("#timeline");
  if (!el) return;
  el.innerHTML = days.map((d) => {
    const g = isKoreaDay(d) ? "kr" : "jp";
    const short = (d.program || "").slice(0, 140);
    return `<li class="${g}" data-day="${escapeHtml(d.data || "")}" tabindex="0" title="Kliknij, żeby zobaczyć pełny opis dnia"><div class="when">${escapeHtml((d.data_pl || "").replace(".2027", ""))} · ${escapeHtml(d.dzien || "")}</div><div class="where">${escapeHtml(d.miejsce)}</div><div class="short">${escapeHtml(short)}${(d.program || "").length > 140 ? "…" : ""}</div>${d.sens ? `<div class="sens">${escapeHtml(d.sens)}</div>` : ""}<span class="more">Pełny opis dnia →</span></li>`;
  }).join("");
}
function koreaGapCard(krOnly) {
  if (!krOnly.length) return "";
  const a = (krOnly[0].data_pl || "").replace(".2027", ""), b = (krOnly[krOnly.length - 1].data_pl || "").replace(".2027", "");
  return `<article class="day-card korea-gap"><div class="date-badge"><b>${escapeHtml(a.split(".")[0])}–${escapeHtml(b)}</b><span>Korea</span></div>
    <div class="day-body"><h3>Pobyt w Korei: ŚDM w Seulu, Solmoe, Busan</h3>
    <p>${krOnly.length} dni w Korei — od ${escapeHtml(a)} do ${escapeHtml(b)}. Wracamy do Japonii promem do Hakaty rano 12.08.</p>
    <p><button type="button" class="btn" data-goto-tab="korea">Zobacz dni w Korei →</button></p></div></article>`;
}
function renderDays(days, places, changed, fujiN, checks, fujiPer) {
  const jp = days.filter((d) => /Japonia|Polska|Katar/i.test(d.kraj || "") || !d.kraj);
  const kr = days.filter((d) => isKoreaDay(d));
  const krOnly = kr.filter((d) => !/Japonia/i.test(d.kraj || ""));
  const parts = [];
  let gapDone = false;
  jp.forEach((d) => {
    if (!gapDone && krOnly.length && d.data > krOnly[0].data) { parts.push(koreaGapCard(krOnly)); gapDone = true; }
    if (fujiN > 0 && d.data === "2027-08-04") parts.push(fujiModuleCard(places, fujiN, fujiPer));
    parts.push(dayCard(d, places, changed.has(d.data), checks));
  });
  $("#days-jp").innerHTML = parts.join("");
  $("#days-kr").innerHTML = kr.map((d) => dayCard(d, places, changed.has(d.data), checks)).join("");
}

function warnings(choices, cost) {
  const w = [];
  const off = disabledGroups(choices);
  Object.entries(off).filter(([k]) => !["fuji", "nie_fuji"].includes(k)).forEach(([, x]) => w.push(x));
  if (choices.sen === "tokio") w.push("„Lepszy sen” wraca do pociągu Hayabusa — to jest sprzeczne z DECYZJĄ „autokary zamiast pociągów”.");
  if (choices.nagasaki_miasto === "tramwaj") w.push("Tramwaj 14–15.08 dotyka DECYZJI „autokary zamiast pociągów” — tylko jeśli DECYZJA dotyczyła przejazdów między bazami.");
  if (cost && cost.fleet) {
    if (cost.fleet.kr && cost.fleet.kr.small && cost.fleet.kr.big >= 2) w.push(`Korea: przy ${cost.n} os. dwa autokary 45-miejscowe nie wystarczają — model dodaje mały bus na 5.08, 10.08 i 11.08.`);
    if (cost.fleet.jp && cost.fleet.jp.overflow) w.push("Japonia: brak zestawu autokarów mieszczącego ludzi i walizki — zmień decyzję o bagażu.");
  }
  if (cost && cost.lost) w.push(`Rezygnacje: ${cost.dropouts} os. względem ${cost.n + cost.dropouts}; przepada ok. ${cost.lost} biletów (${formatZl(cost.lostValue, 0)}). Pokrywa: ${cost.lossPolicy === "grupa" ? "grupa (wliczone w cenę)" : "osoby rezygnujące / ich polisa (poza ceną)"}.`);
  if (cost && cost.gratis) w.push(`${cost.gratis} miejsc bezpłatnych: ich koszt płacą pozostali (${cost.payers} płacących).`);
  if (choices.petla === "A" || !choices.petla) w.push("Ścieżka A: trzy długie dni w autokarze z rzędu (3–5.08), 4.08 ok. 500 km. Akita w noc Kantō — 90 łóżek to najtrudniejsza rezerwacja (rezerwa Ōmagari, Kakunodate). Odmowa sióstr = ścieżka B.");
  if (choices.petla === "C") w.push("Ścieżka C: odpada cała wschodnia Japonia (Akita, Matsushima, Nikkō, Yamanaka, Fuji). Lot Narita–Incheon 3.08 dla ok. 90 osób do zablokowania; hotel w Mapo od 3.08 (2 noce więcej). Koszt przewodników liczony dla 13 dni w Japonii — w C jest ich 11.");
  if (choices.petla === "B") w.push("Ścieżka B: Nikkō odpada. Chętni na Fuji muszą mieć rezerwację schroniska (bramka Yoshida 14:00–3:00 tylko z rezerwacją).");
  if (choices.przylot === "6_rano") w.push("Przylot 6.08 rano: przepada poranek 6.08 w Seulu i zostaje ok. 1 doba zapasu przed czuwaniem. Jeśli i 6.08 nie ma miejsc — powrót do lotu 4.08.");
  if (choices.fuji === "tak" && choices.petla === "B") w.push(`Fuji dla chętnych (niepełnoletni za zgodą rodziców i z opiekunem). Koszt ${formatZl(cost ? cost.fujiPer : FUJI_PER, 0)} liczy się na wchodzącego [szacunek], nie na całą grupę.`);
  if (choices.sklad === "trzeci") w.push("Trzeci autokar w Japonii: koszt autokarów w Japonii ×1,5 względem pary. Tańsza jest ciężarówka bagażowa.");
  if (choices.pakiet === "A1") w.push("Dopłata 150 USD na pakiecie A1+ nie jest tym samym co dopłata netto. Przy drogim Seulu A1+ może wyjść taniej, bo odpada własny hotel 5/6.08.");
  return w;
}

const CHART_COLORS = ["#1f4e79", "#8b2a32", "#c6a15b", "#1e4d5e", "#7c1e2e", "#2c6e49", "#9a5b12", "#4a3f6b", "#3d5a40", "#6b4f31", "#101929"];
let chart;
let chartType = "pie";
function groupForChart(cost) {
  const acc = {};
  cost.lines.forEach((l) => {
    if (Math.abs(l.perOs) < 0.005) return;
    acc[l.grupa] = (acc[l.grupa] || 0) + l.perOs;
  });
  if (cost.reserve) acc["Rezerwa"] = (acc["Rezerwa"] || 0) + cost.reserve;
  return Object.entries(acc).sort((a, b) => b[1] - a[1]);
}
function renderChart(cost) {
  const canvas = $("#cost-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const rows = groupForChart(cost);
  const data = {
    labels: rows.map((r) => r[0]),
    datasets: [{ label: "zł / os.", data: rows.map((r) => Math.round(r[1] * 100) / 100), backgroundColor: CHART_COLORS.slice(0, rows.length), borderColor: "#fff", borderWidth: chartType === "pie" ? 2 : 0 }],
  };
  const opt = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: {
      legend: { position: chartType === "pie" ? "right" : "top", labels: { font: { family: "Lato", size: 12 } } },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatZl(ctx.parsed.y ?? ctx.parsed)}` } },
    },
  };
  if (chartType === "bar") {
    opt.scales = { y: { ticks: { callback: (v) => v.toLocaleString("pl-PL") + " zł" }, beginAtZero: true } };
    opt.plugins.legend.display = false;
  }
  if (chart) { chart.destroy(); chart = null; }
  chart = new Chart(canvas, { type: chartType, data, options: opt });
}

function renderCostTable(cost, base) {
  const body = cost.lines.map((l) => {
    const baseLine = (base.lines || []).find((x) => x.id === l.id);
    const dlt = baseLine ? l.perOs - baseLine.perOs : 0;
    const dltCell = Math.abs(dlt) < 0.005 ? "" : `<div class="${dlt > 0 ? "diff-up" : "diff-down"}">${formatZlDelta(dlt)}</div>`;
    return `<tr>
      <td>${escapeHtml(l.pozycja)}<div class="src">${escapeHtml(l.zrodlo || "")}${l.status ? " · " + escapeHtml(l.status) : ""}${l.factor && l.factor !== 1 ? ` · flota ×${l.factor.toLocaleString("pl-PL")}` : ""}${l.rezerwa ? "" : " · bez rezerwy"}</div></td>
      <td>${escapeHtml(l.grupa)}</td>
      <td class="num">${formatZl(l.perOs)}${dltCell}</td>
      <td class="num">${formatZl(l.group)}</td>
    </tr>`;
  }).join("");
  $("#cost-table").innerHTML = `<thead><tr><th>Pozycja i źródło / założenie</th><th>Grupa</th><th>Zł / płacącego</th><th>Zł / grupa (${cost.n} os.)</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr><td>Koszty bezpośrednie</td><td></td><td class="num">${formatZl(cost.direct)}</td><td class="num">${formatZl(cost.direct * cost.payers)}</td></tr>
      <tr><td>Rezerwa ${cost.reservePct}% (tylko od pozycji nieopłaconych i walutowych)</td><td>Rezerwa</td><td class="num">${formatZl(cost.reserve)}</td><td class="num">${formatZl(cost.reserve * cost.payers)}</td></tr>
      <tr><td>Razem program główny (${cost.payers} płacących)</td><td></td><td class="num">${formatZl(cost.total)}</td><td class="num">${formatZl(cost.group)}</td></tr>
      ${cost.fujiN ? `<tr><td>Moduł Fuji (${cost.fujiN} os. × ${formatZl(cost.fujiPer, 0)})</td><td>Program i wstępy</td><td class="num">+ ${formatZl(cost.fujiPer, 0)} / wchodzący</td><td class="num">${formatZl(cost.fujiAdd)}</td></tr>
      <tr><td>Razem z modułem Fuji</td><td></td><td class="num"></td><td class="num">${formatZl(cost.grandGroup)}</td></tr>` : ""}
    </tfoot>`;
}

function renderCostBoard(cost, base) {
  $("#cost-value").textContent = formatZl(cost.total, 0);
  $("#cost-group").textContent = `na grupę (${cost.n} os., ${cost.payers} płacących): ` + formatZl(cost.group, 0);
  const lbl = $("#cost-board .cost-label");
  if (lbl) lbl.textContent = cost.gratis ? "Na płacącego (program główny)" : "Na osobę (program główny)";
  const delta = cost.total - base.total;
  const el = $("#cost-delta");
  el.classList.remove("is-up", "is-down", "is-same");
  if (Math.abs(delta) < 0.005) {
    el.classList.add("is-same");
    el.textContent = "plan wyjściowy (opcje domyślne) — " + formatZl(base.total);
  } else if (delta > 0) {
    el.classList.add("is-up");
    el.textContent = "dopłata " + formatZl(delta) + " względem planu wyjściowego " + formatZl(base.total);
  } else {
    el.classList.add("is-down");
    el.textContent = "mniej o " + formatZl(Math.abs(delta)) + " względem planu wyjściowego " + formatZl(base.total);
  }
  $("#cost-split").innerHTML =
    `<div><span>Bezpośrednie</span><strong>${formatZl(cost.direct)}</strong></div>` +
    `<div><span>Rezerwa ${cost.reservePct}%</span><strong>${formatZl(cost.reserve)}</strong></div>`;
  const fujiEl = $("#cost-fuji");
  if (cost.fujiN > 0) {
    fujiEl.hidden = false;
    fujiEl.innerHTML = `Moduł Fuji: <strong>${cost.fujiN} os. × ${formatZl(cost.fujiPer, 0)} = ${formatZl(cost.fujiAdd, 0)}</strong>. Grupa z modułem: <strong>${formatZl(cost.grandGroup, 0)}</strong>. Nie wchodzi do ceny na osobę programu głównego.`;
  } else {
    fujiEl.hidden = true;
    fujiEl.textContent = "";
  }
  $("#cost-note").textContent = `Plan wyjściowy ${formatZl(base.total, 0)} = wszystkie opcje oznaczone jako domyślne: ścieżka A (Akita), przylot do Seulu 5.08, tanie noclegi grupowe (ośrodki na wschodzie, Isahaya, Shin-Osaka YH — zakładamy, że się uda), dwóch przewodników w Japonii, B1+, Seul 290 zł/noc, ${base.n} osób, Generali Elastyczny 1, rezerwa ${base.reservePct}%. To punkt odniesienia do porównań, a nie osobna opcja. Kwoty to szacunki — dokładność do złotówki jest pozorna.`;
  const hero = $("#hero-cost");
  if (hero) hero.textContent = formatZl(cost.total, 0);
  renderTarget(cost);
  const heroN = $("#hero-n");
  if (heroN) heroN.textContent = `${cost.n} osób`;
  const heroNs = $("#hero-n-sub");
  if (heroNs) heroNs.textContent = `pułap 90 · Japonia: ${cost.fleet.jp ? cost.fleet.jp.label : "—"}`;
}

/* Cel ceny (meta.cel_cena, domyślnie 14 000 zł) i podpowiedzi, co zmienić, żeby do niego zejść. */
let tipsCtx = null;
function renderTarget(cost) {
  const target = (tipsCtx && tipsCtx.target) || 14000;
  const gap = cost.total - target;
  const el = $("#cost-target"), heroT = $("#hero-target");
  const txt = gap > 0 ? `cel ${formatZl(target, 0)} — brakuje ${formatZl(gap, 0)}` : `cel ${formatZl(target, 0)} — zapas ${formatZl(-gap, 0)}`;
  if (heroT) { heroT.textContent = txt; heroT.className = gap > 0 ? "hero-target is-up" : "hero-target is-ok"; }
  if (!el || !tipsCtx) return;
  const { groups, choices, deltaFor, off } = tipsCtx;
  const tips = [];
  groups.forEach((g) => {
    if (off[g.id] || ["petla", "przylot", "sen"].includes(g.id)) return;
    g.opcje.forEach((o) => {
      if (o.opcja_id === choices[g.id]) return;
      const d = deltaFor(g.id, o.opcja_id);
      if (d < -20) tips.push({ g, o, d });
    });
  });
  const best = {};
  tips.forEach((t) => { if (!best[t.g.id] || t.d < best[t.g.id].d) best[t.g.id] = t; });
  const list = Object.values(best).sort((a, b) => a.d - b.d).slice(0, 6);
  let acc = 0, reached = false;
  el.innerHTML = `<p class="target-line ${gap > 0 ? "is-up" : "is-ok"}"><strong>${escapeHtml(txt)}</strong></p>` + (gap > 0 && list.length ? `<p class="small muted">Co by obniżyło cenę (każda pozycja osobno, od największej; suma jest przybliżona):</p><ol class="target-tips">${list.map((t) => {
    acc += -t.d;
    return `<li><button type="button" class="btn-link" data-tip-g="${escapeHtml(t.g.id)}" data-tip-o="${escapeHtml(t.o.opcja_id)}">${escapeHtml(t.g.nazwa)}: ${escapeHtml(t.o.opcja.split(" (")[0])}</button> <strong class="diff-down">−${Math.round(-t.d).toLocaleString("pl-PL")} zł</strong>${t.o.wplyw ? `<br><span class="small muted">${escapeHtml(t.o.wplyw.slice(0, 160))}</span>` : ""}${!reached && acc >= gap ? ((reached = true), ` <span class="chip">do tego miejsca mieścimy się w celu</span>`) : ""}</li>`;
  }).join("")}</ol>` : "");
}

function renderImpact(groups, choices, logs) {
  const items = groups.map((g) => {
    const opt = g.opcje.find((o) => o.opcja_id === choices[g.id]);
    if (!opt) return "";
    return `<li><strong>${escapeHtml(g.nazwa)}:</strong> ${escapeHtml(opt.wplyw)}</li>`;
  }).join("");
  const extra = logs.length
    ? `<h3>Uwagi logistyczne tego scenariusza</h3><ul>${logs.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
    : "";
  $("#impact-box").innerHTML = `<h3>Co się zmienia w trasie i budżecie</h3><ul>${items}</ul>${extra}`;
}
function renderWarnings(choices, cost) {
  const w = warnings(choices, cost);
  const box = $("#warn-box");
  if (!box) return;
  if (!w.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<strong>Na co uważać</strong><ul>${w.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}
function renderScenarioLog(logs) {
  const el = $("#scenario-log");
  if (!el) return;
  if (!logs.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `<h3>Z decyzji wynika dodatkowo</h3><ul>${logs.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SCENARIO_KEY) || "[]"); } catch (_) { return []; }
}
function storeSaved(arr) {
  try { localStorage.setItem(SCENARIO_KEY, JSON.stringify(arr.slice(0, 3))); } catch (_) {}
}
function scenarioLabel(choices, fujiOsob, people) {
  const bits = ["ścieżka " + (choices.petla || "A")];
  if (people && people.n !== 90) bits.push(people.n + " os.");
  if (people && people.gratis) bits.push(people.gratis + " gratis");
  const lev = ["hotele_zachod", "posilki", "kadra_lok", "esim", "przewoznik", "nagasaki_miasto"].filter((k) => choices[k] && !["standard", "pelny", "jeden", "autokar"].includes(choices[k]));
  if (lev.length) bits.push(lev.length + " dźwignie kosztu");
  if (choices.nagasaki === "tani") bits.push("tani Nagasaki");
  else if (choices.nagasaki === "drogi") bits.push("drogi Nagasaki");
  if (choices.pakiet === "A1") bits.push("A1+");
  if (choices.fuji === "tak" && choices.petla === "B") bits.push("Fuji ×" + fujiOsob);
  if (choices.przylot === "6_rano") bits.push("przylot 6.08");
  if (choices.sklad === "trzeci") bits.push("3. autokar");
  if (choices.sklad === "bagazowka") bits.push("ciężarówka bagaż");
  if (choices.polisa === "e2r") bits.push("rezygnacja");
  if (choices.biuro === "marza") bits.push("marża 8%");
  if (choices.rezerwa && choices.rezerwa !== "6") bits.push("rezerwa " + choices.rezerwa + "%");
  if (bits.length === 1) bits.push("plan wyjściowy");
  return bits.join(" · ");
}
function renderCompare(ctx) {
  const saved = loadSaved();
  const row = $("#saved-row");
  if (!row) return;
  if (!saved.length) {
    row.innerHTML = `<p class="muted">Nie zapisano jeszcze wariantu roboczego. Ustaw decyzje i kliknij „Zapisz jako wariant roboczy”.</p>`;
    $("#compare-table").innerHTML = "";
    return;
  }
  row.innerHTML = saved.map((s, i) =>
    `<span class="scenario-chip"><strong>${escapeHtml(s.nazwa)}</strong> · ${formatZl(s.total)}
      <button type="button" data-load="${i}" title="Wczytaj">↵</button>
      <button type="button" data-del="${i}" title="Usuń" aria-label="Usuń">×</button>
    </span>`
  ).join("");
  const keys = [
    ["petla", "Ścieżka 2–5.08"], ["przylot", "Przylot do Seulu"], ["sen", "Sen przed ŚDM"],
    ["nagasaki", "Nagasaki"], ["seul_stawka", "Seul, stawka"], ["pakiet", "Pakiet"],
    ["fuji", "Fuji"], ["nie_fuji", "Bez Fuji: reszta"], ["sklad", "Bagaż"], ["biuro", "Biuro"], ["polisa", "Ubezpieczenie"], ["rezerwa", "Rezerwa"],
    ["hotele_zachod", "Hotele zachód"], ["posilki", "Posiłki"], ["kadra_lok", "Przewodnik"], ["esim", "eSIM"],
    ["przewoznik", "Przewoźnik zachód"], ["nagasaki_miasto", "Nagasaki 14–15.08"],
  ];
  const head = `<tr><th>Porównanie</th>${saved.map((s) => `<th class="sc">${escapeHtml(s.nazwa)}</th>`).join("")}</tr>`;
  const choiceRows = keys.map(([id, label]) => {
    const cells = saved.map((s) => {
      const g = ctx.groups.find((x) => x.id === id);
      const opt = g && g.opcje.find((o) => o.opcja_id === (s.choices || {})[id]);
      let txt = opt ? opt.opcja : (s.choices || {})[id] || "—";
      if (id === "fuji" && (s.choices || {}).fuji === "tak") txt += ` (${s.fujiOsob || 10} os.)`;
      return `<td>${escapeHtml(txt)}</td>`;
    }).join("");
    return `<tr><th>${escapeHtml(label)}</th>${cells}</tr>`;
  }).join("");
  const peopleRow = `<tr><th>Osoby / gratis</th>${saved.map((s) => `<td>${escapeHtml(String((s.people || {}).n ?? 90))} / ${escapeHtml(String((s.people || {}).gratis ?? 0))}</td>`).join("")}</tr>`;
  const money = [
    ["Na płacącego", (s) => formatZl(s.total)],
    ["Delta vs baza", (s) => formatZlDelta((s.total || 0) - ctx.base.total)],
    ["Grupa", (s) => formatZl(s.group)],
    ["Fuji (dodatek)", (s) => s.fujiAdd ? formatZl(s.fujiAdd, 0) : "—"],
    ["Grupa z Fuji", (s) => s.fujiAdd ? formatZl(s.grandGroup, 0) : formatZl(s.group)],
  ].map(([label, fn]) => `<tr><th>${label}</th>${saved.map((s) => `<td class="num">${fn(s)}</td>`).join("")}</tr>`).join("");
  $("#compare-table").innerHTML = `<thead>${head}</thead><tbody>${peopleRow}${choiceRows}${money}</tbody>`;
}

function renderLogistyka(data) {
  const L = data.logistyka;
  $("#logistyka-content").innerHTML = `
    <div class="log-grid">
      <article class="log-card wide"><h3>Rytm dnia i upał</h3><p>${escapeHtml(L.rytm)}</p></article>
      <article class="log-card"><h3>Kierowcy i bazy</h3><ul>${L.kierowcy.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></article>
      <article class="log-card"><h3>Bagaż i skład</h3><ul>${L.bagaz.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></article>
      <article class="log-card"><h3>Prom Busan–Hakata</h3><ul>${L.prom.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></article>
      <article class="log-card"><h3>Plany awaryjne</h3><ul>${L.awarie.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></article>
      <article class="log-card wide"><h3>Autostrada Jōban i Fukushima</h3><p>${escapeHtml(L.joban)}</p></article>
      <article class="log-card wide"><h3>Dokumenty, zgody i terminy</h3>
        <p>Pełna checklista (paszporty, zgody, K-ETA, ubezpieczenie, faks do Akity, daty 30.11 / 15.12 / 31.01) jest w zakładce <strong>Checklista</strong>. Tutaj tylko operacyjne przypomnienie. Żadnych danych osobowych uczestników.</p>
      </article>
      <article class="log-card wide">
        <h3>Transport — odcinki do potwierdzenia</h3>
        <div class="table-scroll"><table class="sheet-table"><thead><tr><th>Odcinek</th><th>Środek</th><th>Przewoźnik</th><th>Kontakt</th><th>Cena / os.</th><th>Status</th></tr></thead>
        <tbody>${data.transport.map((t) => `<tr><td>${escapeHtml(t.odcinek)}</td><td>${escapeHtml(t.srodek)}</td><td>${escapeHtml(t.przewoznik)}</td><td>${escapeHtml(t.kontakt || "do ustalenia")}</td><td>${t.cena_os === "" || t.cena_os == null ? "—" : escapeHtml(String(t.cena_os))}</td><td>${escapeHtml(t.status)}</td></tr>`).join("")}</tbody></table></div>
      </article>
      <article class="log-card wide">
        <h3>Noclegi</h3>
        <div class="table-scroll"><table class="sheet-table"><thead><tr><th>Miasto</th><th>Noce</th><th>Daty</th><th>Obiekt</th><th>Kontakt</th><th>Cena / os / noc</th><th>Status</th></tr></thead>
        <tbody>${data.noclegi.map((n) => `<tr><td>${escapeHtml(n.miasto)}</td><td>${escapeHtml(n.noce)}</td><td>${escapeHtml(n.daty)}</td><td>${escapeHtml(n.obiekt)}</td><td>${escapeHtml(n.kontakt || "do ustalenia")}</td><td>${escapeHtml(n.cena_os_noc || "do ustalenia")}</td><td>${escapeHtml(n.status)}</td></tr>`).join("")}</tbody></table></div>
      </article>
    </div>`;
}

function renderCredits(places, meta) {
  const items = places.filter((p) => p.zdjecie_zrodlo);
  $("#photo-credits").innerHTML = items.map((p) => `<li><strong>${escapeHtml(p.nazwa)}:</strong> ${escapeHtml(p.zdjecie_zrodlo)}</li>`).join("");
  $("#footer-sources").textContent = meta.zrodla || "";
  $("#data-source-label").textContent = meta.source || "";
}

function initTabs(onShow) {
  const tabs = $$(".tab");
  const show = (id, write) => {
    if (!id || !document.getElementById(id)) id = "przeglad";
    tabs.forEach((t) => t.classList.toggle("is-active", t.dataset.tab === id));
    $$(".panel").forEach((p) => {
      const on = p.id === id;
      p.classList.toggle("is-active", on);
      if (on) p.removeAttribute("hidden");
      else p.setAttribute("hidden", "");
    });
    requestAnimationFrame(() => {
      Object.values(getMaps()).forEach((m) => m.invalidateSize());
      if (chart) chart.resize();
      resizeBudgetChart();
      onShow(id, write);
    });
  };
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) show(btn.dataset.tab, true);
  });
  return show;
}

function optionDetailHtml(opt) {
  if (!opt) return "";
  const bits = [];
  if (opt.plusy) bits.push(`<div class="opt-side is-plus"><h4>Plusy tej opcji</h4><p>${escapeHtml(opt.plusy)}</p></div>`);
  if (opt.minusy) bits.push(`<div class="opt-side is-minus"><h4>Minusy tej opcji</h4><p>${escapeHtml(opt.minusy)}</p></div>`);
  if (opt.wplyw) bits.push(`<p class="opt-impact"><strong>Co z tego wynika:</strong> ${escapeHtml(opt.wplyw)}</p>`);
  return bits.join("");
}

function renderDecisionForm(groups, choices, fujiOsob, onChange, deltaFor) {
  const list = $("#decision-list");
  const off = disabledGroups(choices);
  const LEVERS = /^(hotele_zachod|posilki|kadra_lok|esim|przewoznik|nagasaki_miasto)$/;
  list.innerHTML = groups.map((g, gi) => {
    const current = g.opcje.find((o) => o.opcja_id === choices[g.id]) || g.opcje[0];
    const opts = g.opcje.map((o) => {
      const rec = o.rekomendacja ? " — rekomendacja" : "";
      return `<option value="${escapeHtml(o.opcja_id)}" ${choices[g.id] === o.opcja_id ? "selected" : ""}>${escapeHtml(o.opcja)}${escapeHtml(rec)}</option>`;
    }).join("");
    const fujiExtra = g.id === "fuji"
      ? `<div class="fuji-input" id="fuji-input" ${choices.fuji === "tak" ? "" : "hidden"}>
          <label for="fuji-osob">Liczba wchodzących</label>
          <input type="number" id="fuji-osob" min="1" max="90" step="1" value="${escapeHtml(String(fujiOsob))}" />
        </div>`
      : "";
    const isLever = LEVERS.test(g.id);
    const chosenOfficial = g.opcje.find((o) => o.wybrana);
    const tags = [
      isLever ? `<span class="lever-tag">tańsza opcja</span>` : "",
      chosenOfficial ? `<span class="official-tag">zatwierdzone: ${escapeHtml(chosenOfficial.opcja.split("—")[0].split(":")[0])}</span>` : "",
    ].join("");
    const tlo = Array.isArray(g.tlo) ? g.tlo : (g.tlo ? [g.tlo] : []);
    const rows = g.opcje.map((o) => {
      const d = deltaFor ? deltaFor(g.id, o.opcja_id) : 0;
      const dTxt = Math.abs(d) < 1 ? "bez zmiany" : (d > 0 ? "+" : "−") + Math.round(Math.abs(d)).toLocaleString("pl-PL") + " zł";
      const on = choices[g.id] === o.opcja_id;
      return `<tr class="${on ? "is-on" : ""}">
        <td><strong>${escapeHtml(o.opcja)}</strong>${o.rekomendacja ? ` <span class="rec-mini">rekomendacja</span>` : ""}${on ? ` <span class="now-mini">teraz w podglądzie</span>` : ""}</td>
        <td class="num ${d > 1 ? "diff-up" : d < -1 ? "diff-down" : ""}">${dTxt}</td>
        <td>${escapeHtml(o.plusy || "")}</td><td>${escapeHtml(o.minusy || "")}</td></tr>`;
    }).join("");
    const offNote = off[g.id] ? `<p class="dec-off">${escapeHtml(off[g.id])}</p>` : "";
    return `<article class="decision-card${off[g.id] ? " is-off" : ""}${isLever ? " is-lever" : ""}" data-id="${escapeHtml(g.id)}">
      <p class="dec-num">Decyzja ${gi + 1} z ${groups.length}</p>
      <h3>${escapeHtml(g.nazwa)}${tags}</h3>
      <div class="termin">Termin decyzji: ${escapeHtml(g.termin || "—")}</div>
      ${offNote}
      ${g.opis ? `<p class="dec-question"><span>O co decydujemy</span>${escapeHtml(g.opis)}</p>` : ""}
      ${tlo.length ? `<p class="dec-kicker">Co trzeba wiedzieć</p><ul class="dec-facts">${tlo.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
      ${g.kontekst ? `<p class="dec-body">${escapeHtml(g.kontekst)}</p>` : ""}
      <p class="dec-kicker">Możliwości i ich skutki</p>
      <div class="table-scroll"><table class="sheet-table dec-options"><thead><tr><th>Opcja</th><th>Cena na osobę</th><th>Zalety</th><th>Wady</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${g.ograniczenia ? `<p class="dec-kicker">Od czego to zależy</p><p class="dec-body">${escapeHtml(g.ograniczenia)}</p>` : ""}
      ${g.wplyw_inne ? `<p class="dec-kicker">Na co ta decyzja wpływa</p><p class="dec-body">${escapeHtml(g.wplyw_inne)}</p>` : ""}
      ${g.rekomendacja_tekst ? `<p class="dec-reco"><strong>Rekomendacja i dlaczego.</strong> ${escapeHtml(g.rekomendacja_tekst)}</p>` : ""}
      <label class="dec-kicker" for="sel-${escapeHtml(g.id)}">Sprawdź w podglądzie (zmienia cenę, mapę i dni)</label>
      <select id="sel-${escapeHtml(g.id)}" aria-label="${escapeHtml(g.nazwa)}" ${off[g.id] ? "disabled" : ""}>${opts}</select>
      ${fujiExtra}
      <div class="option-detail" data-role="option-detail">${current && current.wplyw ? `<p class="opt-impact"><strong>Co się zmienia w planie:</strong> ${escapeHtml(current.wplyw)}</p>` : ""}</div>
    </article>`;
  }).join("");
  if (!list.dataset.bound) {
    list.dataset.bound = "1";
    list.addEventListener("change", (e) => {
      const card = e.target.closest(".decision-card");
      if (!card) return;
      const handler = list._onDecision;
      if (!handler) return;
      if (e.target.id === "fuji-osob") { handler({ fujiOsob: Number(e.target.value) || 10 }); return; }
      const id = card.dataset.id;
      if (id === "fuji") {
        const box = $("#fuji-input");
        if (box) box.hidden = e.target.value !== "tak";
      }
      const sel = card.querySelector("select");
      const detail = card.querySelector("[data-role=option-detail]");
      const groupsNow = list._groups || [];
      const g = groupsNow.find((x) => x.id === id);
      const opt = g && g.opcje.find((o) => o.opcja_id === e.target.value);
      if (detail) detail.innerHTML = opt && opt.wplyw ? `<p class="opt-impact"><strong>Co się zmienia w planie:</strong> ${escapeHtml(opt.wplyw)}</p>` : "";
      handler({ choices: { [id]: e.target.value } });
    });
  }
  list._onDecision = onChange;
  list._groups = groups;
}

function renderPeopleBox(people, cost, onPeople) {
  const el = $("#people-box");
  if (!el) return;
  if (!el.dataset.bound) {
    el.dataset.bound = "1";
    el.innerHTML = `
      <div class="people-head">
        <p class="kicker">Liczba osób · 90 to górny pułap</p>
        <h3>Ile osób jedzie i kto płaci</h3>
      </div>
      <div class="people-grid">
        <label>Uczestnicy (z kadrą)
          <input type="range" id="pp-n" min="40" max="${people.max}" step="1" value="${people.n}" />
          <output id="pp-n-out">${people.n}</output>
        </label>
        <label>Miejsca bezpłatne
          <input type="number" id="pp-gratis" min="0" max="20" step="1" value="${people.gratis}" />
          <span class="hint">Artur: 84 płacących + 6 gratis</span>
        </label>
        <label>W tym niepełnoletni
          <input type="number" id="pp-minors" min="0" max="${people.max}" step="1" value="${people.minors}" />
          <span class="hint">opiekun 1 na 5 tej samej płci</span>
        </label>
        <label>Bilety po rezygnacjach pokrywa
          <select id="pp-loss">
            <option value="rezygnujacy" ${people.lossPolicy !== "grupa" ? "selected" : ""}>osoba rezygnująca / jej polisa</option>
            <option value="grupa" ${people.lossPolicy === "grupa" ? "selected" : ""}>cała grupa (doliczone do ceny)</option>
          </select>
        </label>
      </div>
      <div class="people-summary" id="pp-summary"></div>`;
    el.addEventListener("input", (e) => {
      const v = (id) => Number($("#" + id).value);
      if (e.target.id === "pp-n") $("#pp-n-out").textContent = e.target.value;
      onPeople({ n: v("pp-n"), gratis: v("pp-gratis") || 0, minors: v("pp-minors") || 0, lossPolicy: $("#pp-loss").value });
    });
    el.addEventListener("change", (e) => {
      if (e.target.id === "pp-loss") onPeople({ lossPolicy: e.target.value });
    });
  } else {
    const set = (id, val) => { const x = $("#" + id); if (x && String(x.value) !== String(val)) x.value = val; };
    set("pp-n", people.n); set("pp-gratis", people.gratis); set("pp-minors", people.minors); set("pp-loss", people.lossPolicy);
    const o = $("#pp-n-out"); if (o) o.textContent = people.n;
  }
  const sum = $("#pp-summary");
  if (sum) {
    const lossTxt = cost.lost
      ? `Przy ${cost.dropouts} rezygnacjach przepada ok. ${cost.lost} biletów Qatar (${formatZl(cost.lostValue, 0)}) — ${cost.lossPolicy === "grupa" ? "wliczone w cenę" : "poza ceną, po stronie rezygnujących"}.`
      : (cost.dropouts ? `${cost.dropouts} rezygnacji mieści się w klauzuli miejsc grupowych (ok. 10 miejsc).` : "Pełny skład.");
    sum.innerHTML = `<span><strong>${cost.payers}</strong> płacących</span><span>koszty stałe grupy (autokary, kadra): <strong>${formatZl(cost.fixedGroup, 0)}</strong></span><span>${escapeHtml(lossTxt)}</span>`;
  }
}

function busSplit(n, minors, veh) {
  // Podział ludzi na pojazdy proporcjonalnie do miejsc.
  const total = veh.reduce((a, v) => a + v.cap, 0);
  let leftN = n, leftM = minors;
  return veh.map((v, i) => {
    const last = i === veh.length - 1;
    const people = last ? leftN : Math.min(v.cap, Math.round(n * v.cap / total));
    const m = last ? leftM : Math.min(people, Math.round(minors * v.cap / total));
    leftN -= people; leftM -= m;
    return { ...v, people, minors: m, guardians: Math.ceil(m / 5) };
  });
}

function renderFleetBox(cost) {
  const el = $("#fleet-box");
  if (!el) return;
  const block = (key, title, days) => {
    const f = cost.fleet[key];
    if (!f) return "";
    const cfg = f.cfg;
    const small = cfg.sredni || cfg.maly;
    const veh = [];
    for (let i = 0; i < f.big; i++) veh.push({ name: `${title[0]}${i + 1} · ${cfg.duzy.nazwa}`, cap: cfg.duzy.miejsca - (cfg.kadra_na_pojazd ?? 1), lug: cfg.duzy.bagaz });
    for (let i = 0; i < f.small; i++) veh.push({ name: `${title[0]}${f.big + i + 1} · ${small.nazwa}`, cap: small.miejsca - (cfg.kadra_na_pojazd ?? 1), lug: small.bagaz });
    const split = busSplit(cost.n, cost.minors, veh);
    const rows = split.map((v) => `<tr><td>${escapeHtml(v.name)}</td><td class="num">${v.people} / ${v.cap}</td><td class="num">${v.minors}</td><td class="num">≥ ${v.guardians}</td><td class="num">${v.lug}</td></tr>`).join("");
    const lugNeed = Math.round(cost.n * 0.85);
    return `<article class="fleet-card ${f.overflow ? "is-bad" : ""}">
      <h4>${escapeHtml(title)} <span class="muted">· ${escapeHtml(days)}</span></h4>
      <p class="fleet-label">${escapeHtml(f.label)}${f.factor !== 1 ? ` · koszt ×${f.factor.toLocaleString("pl-PL")} względem pary dużych` : ""}</p>
      <div class="table-scroll"><table class="sheet-table compact"><thead><tr><th>Pojazd</th><th>Osoby / miejsca</th><th>Niepełnol.</th><th>Opiekunów</th><th>Walizki (luki)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">Wolnych miejsc: ${f.free} (po odliczeniu ${f.staff} miejsc kadry). Luki: ${f.luggage} dużych walizek przy potrzebie ok. ${lugNeed} (walizka z limitem 65 cm ≈ 0,85 dużej). ${escapeHtml(cfg.zrodlo || "")}</p>
    </article>`;
  };
  el.innerHTML = `<h3>Autokary dla ${cost.n} osób</h3>
    <p class="muted">Liczba i rodzaj pojazdów dobierają się same: najtańszy zestaw, który mieści uczestników, pilota/przewodnika w każdym pojeździe i walizki. Ludzie i niepełnoletni są rozłożeni proporcjonalnie do miejsc — faktyczny podział zależy od płci i rodzin.</p>
    <div class="fleet-grid">${block("jp", "Japonia", "2–5.08 i 12–20.08")}${block("kr", "Korea", "5.08, 10.08, 11.08")}</div>`;
}

function renderCurve(model, groups, choices, people) {
  const el = $("#curve-box");
  if (!el) return;
  const pts = priceCurve(model, groups, choices, people, 50, people.max);
  const marks = pts.filter((p) => p.n % 5 === 0 || p.n === people.max || p.n === people.n);
  const min = Math.min(...pts.map((p) => p.total)), max = Math.max(...pts.map((p) => p.total));
  el.innerHTML = `<h3>Cena na płacącego a liczba osób</h3>
    <p class="muted">Pozostałe decyzje bez zmian. Skoki to progi floty (np. trzeci pojazd w Korei) i przepadające bilety imienne.</p>
    <div class="curve">${marks.map((p) => {
      const h = max > min ? 20 + 80 * (p.total - min) / (max - min) : 50;
      return `<div class="curve-col ${p.n === people.n ? "is-on" : ""}" title="${p.n} os.: ${formatZl(p.total, 0)} · JP: ${escapeHtml(p.jp || "")} · KR: ${escapeHtml(p.kr || "")}">
        <span class="curve-val">${Math.round(p.total / 100) / 10} tys.</span><i style="height:${h}%"></i><span class="curve-n">${p.n}</span></div>`;
    }).join("")}</div>`;
}

async function main() {
  const data = await loadData();
  setAppUrl(data.meta.zapisAppUrl || "");
  const groups = groupDecisions(data.decyzje);
  const baseDays = data.dni.map((d) => ({ ...d }));
  const baseChoices = defaultChoices(groups);

  let tab = "przeglad";
  // Obowiązujący plan = opcje oznaczone „Wybrana” w arkuszu (zatwierdzone), reszta jak plan bazowy.
  const approvedChoices = { ...baseChoices };
  let hasApproved = false;
  groups.forEach((g) => { const o = g.opcje.find((x) => x.wybrana); if (o) { approvedChoices[g.id] = o.opcja_id; hasApproved = true; } });
  let choices = { ...(hasApproved ? approvedChoices : baseChoices) };
  let fujiOsob = 10;
  let people = defaultPeople(data.model);

  const hash = parseHash();
  const initialDay = hash.dzien || "";
  if (hash.n) people.n = Math.max(1, Math.min(people.max, parseInt(hash.n, 10) || people.n));
  if (hash.gratis) people.gratis = Math.max(0, parseInt(hash.gratis, 10) || 0);
  if (hash.nl) people.minors = Math.max(0, parseInt(hash.nl, 10) || 0);
  if (hash.strata === "grupa") people.lossPolicy = "grupa";
  if (hash.tab) tab = hash.tab;
  CHOICE_IDS.forEach((k) => {
    if (hash[k] && groups.some((g) => g.id === k && g.opcje.some((o) => o.opcja_id === hash[k]))) {
      choices[k] = hash[k];
    }
  });
  if (hash.fuji_osob) fujiOsob = Math.max(1, Math.min(90, parseInt(hash.fuji_osob, 10) || 10));
  const hashHasChoices = CHOICE_IDS.some((k) => hash[k]);
  if (!hashHasChoices && !hasApproved) {
    try {
      let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      // Zapisany podgląd z poprzedniej wersji planu nie nadpisuje nowych opcji domyślnych.
      if (saved.v !== (data.meta && data.meta.wersja_planu)) saved = { people: saved.people };
      CHOICE_IDS.forEach((k) => {
        if (saved[k] && groups.some((g) => g.id === k && g.opcje.some((o) => o.opcja_id === saved[k]))) {
          choices[k] = saved[k];
        }
      });
      if (saved.fuji_osob) fujiOsob = Math.max(1, Math.min(90, Number(saved.fuji_osob) || 10));
      if (saved.people && typeof saved.people === "object") people = { ...people, ...saved.people, max: people.max };
    } catch (_) {}
  }

  const base = baselineCost(data.model, groups);
  renderCredits(data.miejsca, data.meta);
  renderLogistyka(data);
  renderChecklist(data.checklista || [], data.meta);
  initZbiorka(data.meta.zapisAppUrl || "");
  initKontakty(choices).then(() => drawContactLayers(getMaps(), choices));
  $("#legend-all").innerHTML = legendHtml();

  const lastMapPlaces = { all: [], jp: [], kr: [] };
  const showTab = initTabs((id, write) => {
    tab = id;
    if (write !== false) writeHash(tab, { choices, fujiOsob, people });
    requestAnimationFrame(() => {
      if (id === "japonia") focusMap("map-jp", lastMapPlaces.jp);
      else if (id === "korea") focusMap("map-kr", lastMapPlaces.kr);
      else if (id === "przeglad") focusMap("map-all", lastMapPlaces.all);
    });
  });

  let lastOff = "";
  function applyAll() {
    choices = normalizeChoices(choices);
    const offKey = Object.keys(disabledGroups(choices)).sort().join(",");
    lastOff = offKey;
    const focusId = document.activeElement && document.activeElement.id;
    renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
    if (focusId && /^sel-|^fuji-osob/.test(focusId)) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
    const nocSel = document.querySelector('[data-id="noc_2"] select');
    if (nocSel && nocSel.value !== choices.noc_2) nocSel.value = choices.noc_2;

    const cost = computeCost(data.model, groups, choices, fujiOsob, people);
    setCostInfo(cost);
    const effects = activeEffects(groups, choices);
    const { days, changed } = applyDays(baseDays, data.warianty || {}, effects);
    const logs = scenarioLogs(data.warianty || {}, effects);
    const vis = visiblePlaces(data.miejsca, data.warianty || {}, effects, choices);
    const lines = routeLines(choices);

    tipsCtx = { groups, choices, deltaFor, off: disabledGroups(choices), target: Number(data.meta.cel_cena) || 14000 };
    renderCostBoard(cost, base);
    renderCostTable(cost, base);
    renderChart(cost);
    renderImpact(groups, choices, logs);
    renderWarnings(choices, cost);
    renderScenarioLog(logs);
    const checks = validateDays(days);
    renderFlags(checks);
    renderPeopleBox(people, cost, onPeople);
    renderFleetBox(cost);
    renderCurve(data.model, groups, choices, people);
    renderDays(days, data.miejsca, changed, cost.fujiN, checks, cost.fujiPer);
    setDetailState({ days, places: data.miejsca, checks, tile: (d) => {
      return tileHtml(d, bestPhoto(d, data.miejsca));
    } });
    renderTimeline(days);
    renderBudget(data, cost);

    const jpVis = vis.filter(isJapanPlace);
    const krVis = vis.filter(isKoreaPlace);
    const mo = { days, onDay: openDay };
    updateMap("map-all", vis, lines.all, mo);
    updateMap("map-jp", jpVis, lines.jp, mo);
    updateMap("map-kr", krVis, lines.kr, mo);
    drawContactLayers(getMaps(), choices);
    renderKontakty(choices);
    lastMapPlaces.all = vis;
    lastMapPlaces.jp = jpVis;
    lastMapPlaces.kr = krVis;
    if (tab === "japonia") focusMap("map-jp", jpVis);
    if (tab === "korea") focusMap("map-kr", krVis);
    if (tab === "przeglad") focusMap("map-all", vis);

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...choices, fuji_osob: fujiOsob, people, v: data.meta && data.meta.wersja_planu })); } catch (_) {}
    const ref = hasApproved ? approvedChoices : baseChoices;
    const diff = groups.filter((g) => choices[g.id] !== ref[g.id]).map((g) => g.nazwa);
    const pd = defaultPeople(data.model);
    if (people.n !== pd.n) diff.push(`${people.n} osób`);
    if (people.gratis) diff.push(`${people.gratis} gratis`);
    const sl = $("#state-line");
    if (sl) sl.innerHTML = diff.length
      ? `<strong>Wariant roboczy:</strong> ${diff.length} ${diff.length === 1 ? "zmiana" : diff.length < 5 ? "zmiany" : "zmian"} względem ${hasApproved ? "obowiązującego planu" : "planu wyjściowego"} (${escapeHtml(diff.join(", "))}). Nic nie jest zapisane.`
      : (hasApproved ? `<strong>Oglądasz obowiązujący plan</strong> (zatwierdzony w arkuszu). Tę wersję widzą jadący.` : `<strong>Oglądasz plan wyjściowy</strong> (wszystkie opcje domyślne). Nic nie jest jeszcze zatwierdzone — jadący widzą ten plan.`);
    writeHash(tab, { choices, fujiOsob, people });
  }

  const deltaFor = (gid, oid) => {
    const now = computeCost(data.model, groups, choices, fujiOsob, people).total;
    return computeCost(data.model, groups, { ...choices, [gid]: oid }, fujiOsob, people).total - now;
  };
  const onPeople = (patch) => {
    people = { ...people, ...patch };
    people.n = Math.max(1, Math.min(people.max, Math.round(people.n)));
    people.gratis = Math.max(0, Math.min(people.n - 1, Math.round(people.gratis || 0)));
    people.minors = Math.max(0, Math.min(people.n, Math.round(people.minors || 0)));
    applyAll();
  };
  const onDecision = (patch) => {
    if (patch.choices) Object.assign(choices, patch.choices);
    if (patch.fujiOsob) fujiOsob = Math.max(1, Math.min(90, patch.fujiOsob));
    applyAll();
  };
  renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tip-g]");
    if (t) { onDecision({ choices: { [t.dataset.tipG]: t.dataset.tipO } }); return; }
    const g = e.target.closest("[data-goto-tab]");
    if (g) { const b = document.querySelector(`.tab[data-tab="${g.dataset.gotoTab}"]`); if (b) { b.click(); window.scrollTo({ top: 0, behavior: "smooth" }); } }
  });

  const official = $("#official-plan-note");
  if (official) {
    official.innerHTML = `<strong>Obowiązujący plan zapisuje się w arkuszu, nie na tej stronie.</strong>
      Żeby wszyscy organizatorzy mieli ten sam, trwały wybór, otwórz kartę Decyzje i w kolumnie „Wybrana” wpisz TAK przy oficjalnie przyjętej opcji (jedna na każdą decyzję). Kolumna „Domyślna” to plan wyjściowy do porównań, „Rekomendacja” — wskazówka z planu v3.
      <a href="${sheetUrl(1865812908)}" target="_blank" rel="noopener">Otwórz kartę Decyzje w arkuszu</a>`;
  }

  $("#btn-official")?.addEventListener("click", () => {
    choices = { ...(hasApproved ? approvedChoices : baseChoices) };
    renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
    applyAll();
  });

  $("#btn-approve")?.addEventListener("click", async () => {
    const cost = computeCost(data.model, groups, choices, fujiOsob, people);
    const lines = groups.map((g) => {
      const o = g.opcje.find((x) => x.opcja_id === choices[g.id]);
      return `• ${g.nazwa}: ${o ? o.opcja : choices[g.id]}`;
    });
    const summary = `Obowiązujący plan (${new Date().toLocaleDateString("pl-PL")}), ${people.n} osób, ${cost.payers} płacących, ok. ${Math.round(cost.total).toLocaleString("pl-PL")} zł na płacącego:\n` + lines.join("\n");
    const status = $("#copy-status");
    status.hidden = false;
    if (!hasApp()) {
      try { await navigator.clipboard.writeText(summary); } catch (_) {}
      status.textContent = "Skrypt zapisu nie jest podłączony, więc nie mogę zapisać w arkuszu. Skopiowałem podsumowanie wyborów do schowka — w arkuszu, karta Decyzje, wpisz TAK w kolumnie „Wybrana” przy tych opcjach (albo podłącz skrypt: apps-script/INSTRUKCJA-zapis.md).";
      window.open(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, "_blank", "noopener");
      return;
    }
    if (!confirm("Zatwierdzić obecne wybory jako obowiązujący plan? Zapis trafi do arkusza i zobaczą go wszyscy organizatorzy.\n\n" + lines.join("\n"))) return;
    const res = await post("decyzje", { wybory: choices, osob: people.n, cena: Math.round(cost.total) });
    status.textContent = res && res.ok
      ? `Zapisano w arkuszu. Zmienione decyzje: ${(res.zmienione || []).join(", ") || "bez zmian względem poprzedniego planu"}.`
      : "Nie udało się zapisać: " + ((res && (res.message || res.error)) || "błąd") + ".";
  });

  $("#btn-copy-link")?.addEventListener("click", async () => {
    writeHash(tab, { choices, fujiOsob, people });
    const url = location.href;
    const status = $("#copy-status");
    try {
      await navigator.clipboard.writeText(url);
      status.hidden = false;
      status.textContent = "Skopiowano link do tego wariantu. Osoba, która go otworzy, zobaczy te same wybory. To nie zapisuje planu w arkuszu.";
    } catch (_) {
      status.hidden = false;
      status.textContent = "Skopiuj adres z paska przeglądarki: " + url;
    }
  });
  $("#btn-reset")?.addEventListener("click", () => {
    if (!confirm("Wyczyścić wszystkie zmiany w podglądzie i wrócić do planu wyjściowego? Arkusz się nie zmieni.")) return;
    choices = { ...baseChoices };
    fujiOsob = 10;
    people = defaultPeople(data.model);
    renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
    applyAll();
  });
  let lastNamedSave = loadSaved().slice(-1)[0] || null;
  $("#btn-undo-save")?.addEventListener("click", () => {
    const snap = lastNamedSave || loadSaved().slice(-1)[0];
    if (!snap) {
      const status = $("#copy-status");
      status.hidden = false;
      status.textContent = "Nie ma jeszcze zapisanego wariantu roboczego w tej przeglądarce.";
      return;
    }
    choices = { ...baseChoices, ...(snap.choices || {}) };
    fujiOsob = snap.fujiOsob || 10;
    if (snap.people) people = { ...people, ...snap.people };
    renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
    applyAll();
  });
  $("#btn-save-scenario")?.addEventListener("click", () => {
    const cost = computeCost(data.model, groups, choices, fujiOsob, people);
    const suggested = scenarioLabel(choices, fujiOsob, people);
    const nazwa = (prompt("Nazwa wariantu roboczego (zapis tylko w tej przeglądarce):", suggested) || "").trim() || suggested;
    const saved = loadSaved();
    if (saved.length >= 3) saved.shift();
    const item = { nazwa, choices: { ...choices }, fujiOsob, people: { ...people }, total: cost.total, group: cost.group, fujiAdd: cost.fujiAdd, grandGroup: cost.grandGroup };
    saved.push(item);
    lastNamedSave = item;
    storeSaved(saved);
    renderCompare({ groups, base });
    const status = $("#copy-status");
    status.hidden = false;
    status.textContent = "Zapisano wariant roboczy „" + nazwa + "” w tej przeglądarce.";
  });
  $("#saved-row")?.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    const load = e.target.closest("[data-load]");
    if (del) {
      const saved = loadSaved();
      saved.splice(Number(del.dataset.del), 1);
      storeSaved(saved);
      renderCompare({ groups, base });
      return;
    }
    if (load) {
      const s = loadSaved()[Number(load.dataset.load)];
      if (!s) return;
      choices = { ...baseChoices, ...(s.choices || {}) };
      fujiOsob = s.fujiOsob || 10;
      if (s.people) people = { ...people, ...s.people };
      renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
      applyAll();
    }
  });
  $$(".chart-toggle .btn").forEach((b) => {
    b.addEventListener("click", () => {
      chartType = b.dataset.chart;
      $$(".chart-toggle .btn").forEach((x) => x.classList.toggle("is-on", x === b));
      renderChart(computeCost(data.model, groups, choices, fujiOsob, people));
    });
  });

  $("#btn-preset-save")?.addEventListener("click", () => {
    const preset = (data.meta && data.meta.preset_oszczedny) || {};
    Object.entries(preset).forEach(([k, v]) => {
      if (groups.some((g) => g.id === k && g.opcje.some((o) => o.opcja_id === v))) choices[k] = v;
    });
    renderDecisionForm(groups, choices, fujiOsob, onDecision, deltaFor);
    applyAll();
    const status = $("#copy-status");
    status.hidden = false;
    status.textContent = "Włączono wariant oszczędny: tani nocleg w Nagasaki, Seul 174 zł, tańsze hotele na zachodzie, bento, wolontariusze, tani eSIM, zmiana przewoźnika w Hiroszimie. Program bez zmian. Tramwaj w Nagasaki zostaje wyłączony (dotyka DECYZJI).";
  });

  applyAll();
  bindDayClicks();
  if (initialDay) setTimeout(() => openDay(initialDay), 300);
  renderCompare({ groups, base });
  showTab(tab, false);

  window.addEventListener("hashchange", () => {
    const h = parseHash();
    if (h.tab && h.tab !== tab) {
      tab = h.tab;
      showTab(tab, false);
    }
  });
}

main().catch((err) => {
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="wrap" style="color:#7c1e2e">Nie udało się wczytać danych: ${escapeHtml(err.message)}</p>`);
});
