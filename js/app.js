/**
 * Wejście aplikacji: wczytanie danych, zakładki, karty dni, decyzje, logistyka.
 * Ścieżki są względne (./data/data.json), żeby strona działała na GitHub Pages.
 * Nie zmieniaj atrybutów id w HTML ani kluczy w data.json — tu są one odczytywane.
 */
import { $, $$, escapeHtml, formatZl, formatZlDelta, parseCsv, rowsToObjects, num, SHEET_ID, TAB_NAMES, CHOICE_IDS, N_GROUP, FUJI_PER } from "./util.js";
import {
  groupDecisions, defaultChoices, parseHash, writeHash, computeCost, baselineCost,
  activeEffects, applyDays, scenarioLogs, normalizeChoices, parseWplatySheet, parseChecklistSheet,
} from "./cost.js";
import { getMaps, updateMap, visiblePlaces, routeLines } from "./maps.js";
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
    zmiany: r["Zmiany kosztów (id:+N / id:=N / id:*N)"] || r["Zmiany kosztów"] || "",
    efekt: r["Efekt trasy (kod wariantu)"] || r["Efekt trasy"] || "",
    wplyw: r["Wpływ"] || r["Wpływ na trasę i koszt"] || "",
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
  try {
    const fetches = TAB_NAMES.map((tab) =>
      fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    );
    const texts = await Promise.race([
      Promise.all(fetches),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    if (texts.some((t) => /<!DOCTYPE|<html|must be signed|Sign in/i.test(t) || t.length < 40)) {
      throw new Error("sheet not published");
    }
    const tables = {};
    TAB_NAMES.forEach((name, i) => { tables[name] = parseCsv(texts[i]); });
    const parsed = fromSheetTables(tables);
    const fallback = await (await fetch("./data/data.json")).json();
    const miejsca = parsed.miejsca.length ? mergePlaces(fallback.miejsca, parsed.miejsca) : fallback.miejsca;
    const model = { ...(fallback.model || {}), pozycje: parsed.pozycje.length ? parsed.pozycje : (fallback.model || {}).pozycje };
    const wplaty = { ...(fallback.wplaty || {}) };
    if (parsed.wplatyRaty && parsed.wplatyRaty.length) wplaty.raty = parsed.wplatyRaty;
    const privatePanelUrl = await loadPrivatePanelUrl((fallback.meta || {}).privatePanelUrl || "");
    return {
      ...fallback, ...parsed, miejsca, model, wplaty,
      checklista: (parsed.checklistaSheet && parsed.checklistaSheet.length) ? parsed.checklistaSheet : fallback.checklista,
      warianty: fallback.warianty, logistyka: fallback.logistyka,
      meta: { ...fallback.meta, source: "arkusz Google (opublikowany CSV)", privatePanelUrl },
    };
  } catch (_) {
    const fallback = await (await fetch("./data/data.json")).json();
    fallback.meta.source = "lokalny plik data/data.json (arkusz jeszcze nieopublikowany)";
    return fallback;
  }
}

function isJapanDay(d) {
  return /Japonia|Polska/i.test(d.kraj) && !/^5\.|^6\.|^7\.|^8\.|^9\.|^10\.|^11\./.test(d.data_pl || "");
}
function isKoreaDay(d) {
  return /Korea/i.test(d.kraj);
}
function photoForDay(day, places) {
  const ids = (day.miejsca || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    const p = places.find((x) => x.id === id && x.zdjecie_url);
    if (p) return p;
  }
  return null;
}
function dayCard(day, places, changed) {
  const photo = photoForDay(day, places);
  const chips = [];
  if (day.transport) chips.push(day.transport);
  if (day.km) chips.push(day.km.includes("km") ? day.km : `${day.km} km`);
  if (day.czas_h) chips.push(/h|ok\./i.test(day.czas_h) ? day.czas_h : `${day.czas_h} h`);
  if (day.nocleg) chips.push(`Nocleg: ${day.nocleg}`);
  const style = photo ? `style="background-image:url('${photo.zdjecie_url.replace(/'/g, "%27")}')"` : "";
  const cap = photo ? `<p class="photo-cap">${escapeHtml(photo.nazwa)}. ${escapeHtml(photo.zdjecie_zrodlo)}</p>` : "";
  const notes = day.uwagi ? `<p class="day-notes">${escapeHtml(day.uwagi)}</p>` : "";
  const dateShort = (day.data_pl || "").replace(".2027", "");
  const cls = changed ? "day-card is-changed" : "day-card";
  return `<article class="${cls}" data-day="${escapeHtml(day.data || "")}">
    <div class="day-photo" ${style}>
      <div class="date-badge"><b>${escapeHtml(dateShort)}</b><span>${escapeHtml(day.dzien || "")}</span></div>
    </div>
    <div class="day-body">
      <h3>${escapeHtml(day.miejsce)}</h3>
      <div class="day-meta">${chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>
      <p>${escapeHtml(day.program || "")}</p>
      ${notes}${cap}
    </div>
  </article>`;
}
function fujiModuleCard(places, n) {
  const photo = places.find((p) => p.id === "fuji" && p.zdjecie_url);
  const style = photo ? `style="background-image:url('${photo.zdjecie_url.replace(/'/g, "%27")}')"` : "";
  const cap = photo ? `<p class="photo-cap">${escapeHtml(photo.nazwa)}. ${escapeHtml(photo.zdjecie_zrodlo)}</p>` : "";
  return `<article class="day-card module is-changed">
    <div class="day-photo" ${style}>
      <div class="date-badge"><b>17–18.08</b><span>moduł Fuji</span></div>
    </div>
    <div class="day-body">
      <h3>Wejście na Fudżi — ${n} pełnoletnich</h3>
      <div class="day-meta"><span class="chip">+ ${formatZl(FUJI_PER, 0)} na wchodzącego</span><span class="chip">razem ${formatZl(n * FUJI_PER, 0)}</span></div>
      <p>17.08 shinkansen do Shin-Fuji, autobus na 5. stację szlaku Fujinomiya (2400 m), nocleg w schronisku na 8. stacji. 18.08 wschód słońca na szczycie (3776 m), zejście i shinkansen do Osaki. Reszta grupy jedzie bez zmian drogą Ksawerego.</p>
      <p class="day-notes">Tylko pełnoletni z zaświadczeniem lekarskim i osobnym kierownikiem. Plan B przy tajfunie: dołączenie w Hiroszimie.</p>
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
    return `<li class="${g}"><div class="when">${escapeHtml((d.data_pl || "").replace(".2027", ""))} · ${escapeHtml(d.dzien || "")}</div><div class="where">${escapeHtml(d.miejsce)}</div><div class="short">${escapeHtml(short)}${(d.program || "").length > 140 ? "…" : ""}</div></li>`;
  }).join("");
}
function renderDays(days, places, changed, fujiN) {
  const jp = days.filter((d) => isJapanDay(d) || /^1\.08|^2\.08|^3\.08|^4\.08|^1[2-9]\.08|^20\.08|^21\.08/.test(d.data_pl || ""));
  const kr = days.filter((d) => isKoreaDay(d) || /^5\.08|^6\.08|^7\.08|^8\.08|^9\.08|^10\.08|^11\.08/.test(d.data_pl || ""));
  const parts = [];
  jp.forEach((d) => {
    if (fujiN > 0 && d.data === "2027-08-17") parts.push(fujiModuleCard(places, fujiN));
    parts.push(dayCard(d, places, changed.has(d.data)));
  });
  $("#days-jp").innerHTML = parts.join("");
  $("#days-kr").innerHTML = kr.map((d) => dayCard(d, places, changed.has(d.data))).join("");
}

function warnings(choices) {
  const w = [];
  if (choices.petla === "E3") w.push("E3 jest odradzany: 90 osób w pociągach Komachi + Yamabiko i sześć ogniw 4.08. Przy braku miejsc w jednym składzie plan pada.");
  if (choices.petla === "E2") w.push("E2 wymaga 90 łóżek w Akicie w noc parady Kantō (najtrudniejsza noc w roku). Rezerwa: Ōmagari albo Kakunodate. Trybuny do 28.02.2027.");
  if (choices.petla === "E4") w.push("E4 tylko wtedy, gdy siostry w Akicie odmówią (albo Msza będzie niemożliwa). Nocleg 2.08 jest wtedy w Mito, a 3.08 w Sendai — bez markera Akity.");
  if (choices.petla === "E1") w.push("E1 pada, jeśli siostry wyznaczą Mszę po 18:00 — wtedy wracamy do E2 albo E4.");
  if (choices.fuji === "tak") w.push("Moduł Fuji jest tylko dla pełnoletnich. Koszt 1 000 zł liczy się na wchodzącego, nie na całą dziewięćdziesiątkę.");
  if (choices.sklad === "trzeci") w.push("Trzeci autokar podnosi koszt wszystkich odcinków autokarowych o 50%.");
  if (choices.pakiet === "A1") w.push("Dopłata 150 USD na pakiecie A1+ nie jest tym samym co dopłata netto. Przy drogim Seulu A1+ może wyjść taniej, bo odpada własny hotel 4–6.08.");
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
      legend: { position: chartType === "pie" ? "right" : "top", labels: { font: { family: "Source Sans 3", size: 12 } } },
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
      <td>${escapeHtml(l.pozycja)}<div class="src">${escapeHtml(l.zrodlo || "")}${l.status ? " · " + escapeHtml(l.status) : ""}</div></td>
      <td>${escapeHtml(l.grupa)}</td>
      <td class="num">${formatZl(l.perOs)}${dltCell}</td>
      <td class="num">${formatZl(l.group)}</td>
    </tr>`;
  }).join("");
  $("#cost-table").innerHTML = `<thead><tr><th>Pozycja i źródło / założenie</th><th>Grupa</th><th>Zł / os.</th><th>Zł / 90 os.</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr><td>Koszty bezpośrednie</td><td></td><td class="num">${formatZl(cost.direct)}</td><td class="num">${formatZl(cost.direct * N_GROUP)}</td></tr>
      <tr><td>Rezerwa ${cost.reservePct}%</td><td>Rezerwa</td><td class="num">${formatZl(cost.reserve)}</td><td class="num">${formatZl(cost.reserve * N_GROUP)}</td></tr>
      <tr><td>Razem program główny</td><td></td><td class="num">${formatZl(cost.total)}</td><td class="num">${formatZl(cost.group)}</td></tr>
      ${cost.fujiN ? `<tr><td>Moduł Fuji (${cost.fujiN} os. × ${formatZl(FUJI_PER, 0)})</td><td>Program i wstępy</td><td class="num">+ ${formatZl(FUJI_PER, 0)} / wchodzący</td><td class="num">${formatZl(cost.fujiAdd)}</td></tr>
      <tr><td>Razem z modułem Fuji</td><td></td><td class="num"></td><td class="num">${formatZl(cost.grandGroup)}</td></tr>` : ""}
    </tfoot>`;
}

function renderCostBoard(cost, base) {
  $("#cost-value").textContent = formatZl(cost.total);
  $("#cost-group").textContent = "na grupę (90 os.): " + formatZl(cost.group, 2);
  const delta = cost.total - base.total;
  const el = $("#cost-delta");
  el.classList.remove("is-up", "is-down", "is-same");
  if (Math.abs(delta) < 0.005) {
    el.classList.add("is-same");
    el.textContent = "wariant bazowy, bez różnicy względem " + formatZl(base.total);
  } else if (delta > 0) {
    el.classList.add("is-up");
    el.textContent = "dopłata " + formatZl(delta) + " względem bazy " + formatZl(base.total);
  } else {
    el.classList.add("is-down");
    el.textContent = "mniej o " + formatZl(Math.abs(delta)) + " względem bazy " + formatZl(base.total);
  }
  $("#cost-split").innerHTML =
    `<div><span>Bezpośrednie</span><strong>${formatZl(cost.direct)}</strong></div>` +
    `<div><span>Rezerwa ${cost.reservePct}%</span><strong>${formatZl(cost.reserve)}</strong></div>`;
  const fujiEl = $("#cost-fuji");
  if (cost.fujiN > 0) {
    fujiEl.hidden = false;
    fujiEl.innerHTML = `Moduł Fuji: <strong>${cost.fujiN} os. × ${formatZl(FUJI_PER, 0)} = ${formatZl(cost.fujiAdd, 0)}</strong>. Grupa z modułem: <strong>${formatZl(cost.grandGroup, 0)}</strong>. Nie wchodzi do ceny na osobę programu głównego.`;
  } else {
    fujiEl.hidden = true;
    fujiEl.textContent = "";
  }
  $("#cost-note").textContent = `Baza ${formatZl(base.total)} zakłada E1, Iwaki, B1+, standardowe hotele w Nagasaki (5 × 360 zł), Seul 290 zł/noc, 90 osób, bez Fuji, Generali Elastyczny 1, rezerwę ${base.reservePct}% i licencjonowane biuro bez dodatkowej marży. Fable v3 podawał ok. 15 200 zł bez wydzielonej rezerwy — to zbliżone do samych kosztów bezpośrednich (${formatZl(base.direct)}).`;
  const hero = $("#hero-cost");
  if (hero) hero.textContent = formatZl(cost.total);
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
function renderWarnings(choices) {
  const w = warnings(choices);
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
function scenarioLabel(choices, fujiOsob) {
  const bits = [choices.petla || "E1"];
  if (choices.nagasaki === "tani") bits.push("tani Nagasaki");
  else if (choices.nagasaki === "drogi") bits.push("drogi Nagasaki");
  if (choices.pakiet === "A1") bits.push("A1+");
  if (choices.fuji === "tak") bits.push("Fuji ×" + fujiOsob);
  if (choices.sklad === "trzeci") bits.push("3. autokar");
  if (choices.polisa === "e2r") bits.push("rezygnacja");
  if (choices.biuro === "marza") bits.push("marża 8%");
  if (choices.rezerwa && choices.rezerwa !== "6") bits.push("rezerwa " + choices.rezerwa + "%");
  if (bits.length === 1) bits.push("wariant bazowy");
  return bits.join(" · ");
}
function renderCompare(ctx) {
  const saved = loadSaved();
  const row = $("#saved-row");
  if (!row) return;
  if (!saved.length) {
    row.innerHTML = `<p class="muted">Nie zapisano jeszcze scenariusza. Ustaw decyzje i kliknij „Zapisz scenariusz”.</p>`;
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
    ["petla", "Pętla wschodnia"], ["noc_2", "Nocleg 2.08"], ["sen", "Sen przed ŚDM"],
    ["nagasaki", "Nagasaki"], ["seul_stawka", "Seul, stawka"], ["pakiet", "Pakiet"],
    ["fuji", "Fuji"], ["sklad", "Skład"], ["biuro", "Biuro"], ["polisa", "Ubezpieczenie"], ["rezerwa", "Rezerwa"],
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
  const money = [
    ["Na osobę", (s) => formatZl(s.total)],
    ["Delta vs baza", (s) => formatZlDelta((s.total || 0) - ctx.base.total)],
    ["Grupa (90 os.)", (s) => formatZl(s.group)],
    ["Fuji (dodatek)", (s) => s.fujiAdd ? formatZl(s.fujiAdd, 0) : "—"],
    ["Grupa z Fuji", (s) => s.fujiAdd ? formatZl(s.grandGroup, 0) : formatZl(s.group)],
  ].map(([label, fn]) => `<tr><th>${label}</th>${saved.map((s) => `<td class="num">${fn(s)}</td>`).join("")}</tr>`).join("");
  $("#compare-table").innerHTML = `<thead>${head}</thead><tbody>${choiceRows}${money}</tbody>`;
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
    });
    if (write) onShow(id);
  };
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (btn) show(btn.dataset.tab, true);
  });
  return show;
}

function renderDecisionForm(groups, choices, fujiOsob, onChange) {
  const list = $("#decision-list");
  list.innerHTML = groups.map((g) => {
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
    return `<article class="decision-card" data-id="${escapeHtml(g.id)}">
      <h3>${escapeHtml(g.nazwa)}${g.opcje.some((o) => o.rekomendacja) ? `<span class="rec-tag">jest rekomendacja</span>` : ""}</h3>
      <div class="termin">Termin: ${escapeHtml(g.termin || "—")}</div>
      <select aria-label="${escapeHtml(g.nazwa)}">${opts}</select>
      ${fujiExtra}
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
      handler({ choices: { [id]: e.target.value } });
    });
  }
  list._onDecision = onChange;
}

async function main() {
  const data = await loadData();
  const groups = groupDecisions(data.decyzje);
  const baseDays = data.dni.map((d) => ({ ...d }));
  const baseChoices = defaultChoices(groups);

  let tab = "przeglad";
  let choices = { ...baseChoices };
  let fujiOsob = 10;

  const hash = parseHash();
  if (hash.tab) tab = hash.tab;
  CHOICE_IDS.forEach((k) => {
    if (hash[k] && groups.some((g) => g.id === k && g.opcje.some((o) => o.opcja_id === hash[k]))) {
      choices[k] = hash[k];
    }
  });
  if (hash.fuji_osob) fujiOsob = Math.max(1, Math.min(90, parseInt(hash.fuji_osob, 10) || 10));
  if (!hash.tab) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      CHOICE_IDS.forEach((k) => {
        if (saved[k] && groups.some((g) => g.id === k && g.opcje.some((o) => o.opcja_id === saved[k]))) {
          choices[k] = saved[k];
        }
      });
      if (saved.fuji_osob) fujiOsob = Math.max(1, Math.min(90, Number(saved.fuji_osob) || 10));
    } catch (_) {}
  }

  const base = baselineCost(data.model, groups);
  renderCredits(data.miejsca, data.meta);
  renderLogistyka(data);
  renderChecklist(data.checklista || []);
  $("#legend-all").innerHTML = `
    <span><i class="legend-dot jp"></i>Japonia</span>
    <span><i class="legend-dot kr"></i>Korea</span>
    <span><i class="legend-dot air"></i>Lotniska i przesiadki</span>
    <span>Linia ciągła: autokar / droga lądowa · kreska: lot albo prom</span>`;

  const showTab = initTabs((id) => {
    tab = id;
    writeHash(tab, { choices, fujiOsob });
  });

  function applyAll() {
    choices = normalizeChoices(choices);
    const nocSel = document.querySelector('[data-id="noc_2"] select');
    if (nocSel && nocSel.value !== choices.noc_2) nocSel.value = choices.noc_2;

    const cost = computeCost(data.model, groups, choices, fujiOsob);
    const effects = activeEffects(groups, choices);
    const { days, changed } = applyDays(baseDays, data.warianty || {}, effects);
    const logs = scenarioLogs(data.warianty || {}, effects);
    const vis = visiblePlaces(data.miejsca, data.warianty || {}, effects, choices);
    const lines = routeLines(choices);

    renderCostBoard(cost, base);
    renderCostTable(cost, base);
    renderChart(cost);
    renderImpact(groups, choices, logs);
    renderWarnings(choices);
    renderScenarioLog(logs);
    renderDays(days, data.miejsca, changed, cost.fujiN);
    renderTimeline(days);
    renderBudget(data, cost);

    const jpVis = vis.filter((p) => /Japonia|Polska|Katar/.test(p.kraj) || p.id === "prom" || p.id === "fuji");
    const krVis = vis.filter((p) => /Korea/.test(p.kraj) || p.id === "prom");
    updateMap("map-all", vis, lines.all);
    updateMap("map-jp", jpVis, lines.jp);
    updateMap("map-kr", krVis, lines.kr);

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...choices, fuji_osob: fujiOsob })); } catch (_) {}
    writeHash(tab, { choices, fujiOsob });
  }

  const onDecision = (patch) => {
    if (patch.choices) Object.assign(choices, patch.choices);
    if (patch.fujiOsob) fujiOsob = Math.max(1, Math.min(90, patch.fujiOsob));
    applyAll();
  };
  renderDecisionForm(groups, choices, fujiOsob, onDecision);

  $("#btn-copy-link")?.addEventListener("click", async () => {
    writeHash(tab, { choices, fujiOsob });
    const url = location.href;
    const status = $("#copy-status");
    try {
      await navigator.clipboard.writeText(url);
      status.hidden = false;
      status.textContent = "Skopiowano link do tego scenariusza.";
    } catch (_) {
      status.hidden = false;
      status.textContent = "Skopiuj adres z paska: " + url;
    }
  });
  $("#btn-reset")?.addEventListener("click", () => {
    choices = { ...baseChoices };
    fujiOsob = 10;
    renderDecisionForm(groups, choices, fujiOsob, onDecision);
    applyAll();
  });
  $("#btn-save-scenario")?.addEventListener("click", () => {
    const cost = computeCost(data.model, groups, choices, fujiOsob);
    const saved = loadSaved();
    const nazwa = scenarioLabel(choices, fujiOsob);
    if (saved.length >= 3) saved.shift();
    saved.push({ nazwa, choices: { ...choices }, fujiOsob, total: cost.total, group: cost.group, fujiAdd: cost.fujiAdd, grandGroup: cost.grandGroup });
    storeSaved(saved);
    renderCompare({ groups, base });
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
      renderDecisionForm(groups, choices, fujiOsob, onDecision);
      applyAll();
    }
  });
  $$(".chart-toggle .btn").forEach((b) => {
    b.addEventListener("click", () => {
      chartType = b.dataset.chart;
      $$(".chart-toggle .btn").forEach((x) => x.classList.toggle("is-on", x === b));
      renderChart(computeCost(data.model, groups, choices, fujiOsob));
    });
  });

  applyAll();
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
