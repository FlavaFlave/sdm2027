/**
 * Silnik decyzji i kosztów.
 * Nie zmieniaj id decyzji ani id pozycji modelu (petla, nocleg_nagasaki, itd.)
 * — są zapisane w data/data.json i w arkuszu.
 */
import { N_GROUP, FUJI_PER, CHOICE_IDS, num } from "./util.js";

export function groupDecisions(rows) {
  const order = [];
  const map = {};
  const hoist = ["kontekst", "opis", "tlo", "ograniczenia", "wplyw_inne", "rekomendacja_tekst"];
  (rows || []).forEach((r) => {
    if (!map[r.id]) {
      map[r.id] = { id: r.id, nazwa: r.decyzja, termin: r.termin || "", opcje: [] };
      hoist.forEach((k) => { map[r.id][k] = r[k] || ""; });
      order.push(map[r.id]);
    }
    map[r.id].opcje.push(r);
    if (r.termin) map[r.id].termin = r.termin;
    if (r.decyzja) map[r.id].nazwa = r.decyzja;
    hoist.forEach((k) => { if (r[k]) map[r.id][k] = r[k]; });
  });
  return order;
}

export function defaultChoices(groups) {
  const c = {};
  groups.forEach((g) => {
    const fallback = g.opcje.find((o) => o.domyslna) || g.opcje[0];
    c[g.id] = fallback ? fallback.opcja_id : "";
  });
  return c;
}

export function parseHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  if (!raw) return {};
  try { return Object.fromEntries(new URLSearchParams(raw)); }
  catch (_) { return {}; }
}

export function writeHash(tab, state) {
  const p = new URLSearchParams();
  p.set("tab", tab || "przeglad");
  if (globalThis.__planV) p.set("pv", globalThis.__planV);
  CHOICE_IDS.forEach((k) => { if (state.choices[k]) p.set(k, state.choices[k]); });
  if (state.choices.fuji === "tak") p.set("fuji_osob", String(state.fujiOsob || 10));
  if (state.people) {
    if (state.people.n != null) p.set("n", String(state.people.n));
    if (state.people.gratis) p.set("gratis", String(state.people.gratis));
    if (state.people.minors != null) p.set("nl", String(state.people.minors));
    if (state.people.lossPolicy === "grupa") p.set("strata", "grupa");
  }
  const next = "#" + p.toString();
  if (location.hash !== next) history.replaceState(null, "", next);
}

function applyChangeToken(amounts, token) {
  const t = token.trim();
  if (!t) return;
  let m;
  if ((m = t.match(/^([\w]+):=([\d.\-]+)$/))) amounts[m[1]] = Number(m[2]);
  else if ((m = t.match(/^([\w]+):\*([\d.\-]+)$/))) amounts[m[1]] = (amounts[m[1]] || 0) * Number(m[2]);
  else if ((m = t.match(/^([\w]+):([+\-][\d.]+)$/))) amounts[m[1]] = (amounts[m[1]] || 0) + Number(m[2]);
}

/** Decyzje, które w danym scenariuszu nie mają znaczenia (i nie doliczają się do kosztu). */
export function disabledGroups(choices) {
  const off = {};
  if (choices.petla === "C") {
    off.przylot = "Nie dotyczy w ścieżce C: lecimy do Seulu już 3.08 z Narity.";
    off.noclegi_wschod = "Nie dotyczy w ścieżce C: na wschodzie jest tylko nocleg przy lotnisku Narita.";
    off.sen = "Nie dotyczy w ścieżce C: 2.08 nocujemy przy lotnisku.";
  }
  if (choices.petla !== "B") {
    off.fuji = "Nie dotyczy: w ścieżce A (Akita) nie ma dnia na Fuji — wejście jest tylko w ścieżce B.";
    off.nie_fuji = "Nie dotyczy: tylko w ścieżce B, gdy część grupy wchodzi na Fuji.";
  } else {
    off.sen = "Nie dotyczy w ścieżce B: „lepszy sen” był liczony pod trasę do Akity.";
    if (choices.fuji !== "tak") off.nie_fuji = "Nie dotyczy: nikt nie wchodzi na Fuji.";
  }
  if (choices.pakiet === "A1") off.seul_stawka = "Nie dotyczy: w pakiecie A1+ noclegi 4–6.08 zapewnia organizator ŚDM.";
  return off;
}

function collectChanges(groups, choices) {
  const additive = [], multi = [];
  const off = disabledGroups(choices);
  groups.forEach((g) => {
    if (off[g.id]) return;
    const opt = g.opcje.find((o) => o.opcja_id === choices[g.id]);
    if (!opt || !opt.zmiany) return;
    String(opt.zmiany).split(";").forEach((tok) => {
      if (tok.includes(":*")) multi.push(tok);
      else additive.push(tok);
    });
  });
  return { additive, multi };
}

/** Domyślne osoby z modelu. */
export function defaultPeople(model) {
  const o = (model && model.osoby) || {};
  return {
    n: Number(o.uczestnicy) || N_GROUP,
    gratis: Number(o.gratis) || 0,
    minors: Number(o.niepelnoletni ?? 29),
    max: Number(o.max) || N_GROUP,
    lossPolicy: "rezygnujacy",
  };
}

/**
 * Dobór floty dla jednego kraju: najtańszy zestaw, który mieści uczestników + kadrę (1 osoba na pojazd).
 * factor = koszt względem pary dużych pojazdów (tak jest wyceniona pozycja w modelu).
 */
export function fleetFor(cfg, n, opts = {}) {
  if (!cfg) return null;
  const big = cfg.duzy, small = cfg.sredni || cfg.maly;
  const staff = Number(cfg.kadra_na_pojazd ?? 1);
  const smallCost = small ? Number(small.koszt ?? 0.5) : 1;
  const combos = [];
  for (let b = 1; b <= 4; b++) {
    for (let s = 0; s <= (small ? 2 : 0); s++) {
      const veh = b + s;
      const seats = b * big.miejsca + s * (small ? small.miejsca : 0);
      const need = n + staff * veh;
      if (seats < need) continue;
      if (opts.minBig && b < opts.minBig) continue;
      const lug = b * (big.bagaz || 0) + s * (small ? small.bagaz || 0 : 0);
      if (opts.luggageNeed && lug < opts.luggageNeed) continue;
      const factor = (b + s * smallCost) / 2;
      const luggage = b * (big.bagaz || 0) + s * (small ? small.bagaz || 0 : 0);
      combos.push({ big: b, small: s, seats, staff: staff * veh, free: seats - need, factor, luggage });
    }
  }
  combos.sort((a, b) => a.factor - b.factor || (a.big + a.small) - (b.big + b.small) || b.free - a.free);
  const best = combos[0] || {
    overflow: true, big: 4, small: 0, seats: 4 * big.miejsca, staff: 4 * staff, free: 0, factor: 2, luggage: 0 };
  const parts = [];
  if (best.big) parts.push(`${best.big} × ${big.nazwa}`);
  if (best.small) parts.push(`${best.small} × ${small.nazwa}`);
  return { ...best, label: parts.join(" + "), cfg };
}

export function computeCost(model, groups, choices, fujiOsob, people) {
  const P = { ...defaultPeople(model), ...(people || {}) };
  const n = Math.max(1, Math.round(P.n));
  const gratis = Math.max(0, Math.min(n - 1, Math.round(P.gratis || 0)));
  const payers = n - gratis;
  const pozycje = (model && model.pozycje) || [];
  const amounts = {};
  pozycje.forEach((l) => { amounts[l.id] = Number(l.kwota) || 0; });
  const { additive, multi } = collectChanges(groups, choices);
  additive.forEach((t) => applyChangeToken(amounts, t));
  multi.forEach((t) => applyChangeToken(amounts, t));
  if (choices.pakiet === "A1") amounts.nocleg_seul = 0;

  const reservePct = (() => {
    const rec = pozycje.find((l) => l.id === "rezerwa" && l.jednostka === "proc");
    const basePct = rec ? Number(rec.kwota) : 6;
    return amounts.rezerwa != null ? Number(amounts.rezerwa) : basePct;
  })();

  // Flota: osobno Japonia i Korea; pozycje autokarowe skalują się współczynnikiem floty.
  const flota = (model && model.flota) || {};
  const fleet = {
    // Walizka z limitem 65 cm liczy się jak ok. 0,85 dużej (90 × 0,85 ≈ 77 ≤ 80 miejsc w lukach); duże walizki = 1.
    jp: fleetFor(flota.jp, n, { minBig: choices.sklad === "trzeci" ? 3 : 0,
      luggageNeed: choices.sklad === "bagazowka" ? 0 : n * (choices.sklad === "trzeci" ? 1 : 0.85) }),
    kr: fleetFor(flota.kr, n, { luggageNeed: n * (choices.sklad === "90" || !choices.sklad ? 0.85 : 1) }),
  };
  const lineFactor = {};
  Object.entries(fleet).forEach(([k, f]) => {
    if (!f) return;
    (f.cfg.linie || []).forEach((id) => { lineFactor[id] = f.factor; });
  });

  const noReserve = new Set((model && model.bez_rezerwy) || []);
  const lines = [];
  let groupSum = 0, reservable = 0;
  pozycje.forEach((l) => {
    if (l.jednostka === "proc") return;
    const kwota = amounts[l.id] ?? 0;
    const factor = l.jednostka === "grupa" ? (lineFactor[l.id] ?? 1) : 1;
    const group = l.jednostka === "grupa" ? kwota * factor : kwota * n;
    const perOs = group / payers;
    lines.push({
      id: l.id, grupa: l.grupa, pozycja: l.pozycja, jednostka: l.jednostka,
      kwota, perOs, group, zrodlo: l.zrodlo, status: l.status, factor,
      rezerwa: !noReserve.has(l.id),
    });
    groupSum += group;
    if (!noReserve.has(l.id)) reservable += group;
  });

  // Rezygnacje: bilety ponad klauzulę przepadają.
  const LR = (model && model.loty_rezygnacje) || {};
  const maxN = Number(P.max) || N_GROUP;
  const dropouts = Math.max(0, maxN - n);
  const free = Math.floor((Number(LR.grupowe) || 0) * (Number(LR.klauzula_pct) || 0) / 100);
  const lost = Math.max(0, dropouts - free);
  const lostValue = lost * (Number(LR.cena) || 0);
  if (lostValue && P.lossPolicy === "grupa") {
    lines.push({
      id: "bilety_przepadle", grupa: "Loty", pozycja: `Bilety przepadłe po rezygnacjach (${lost} × ${Number(LR.cena).toLocaleString("pl-PL")} zł)`,
      jednostka: "grupa", kwota: lostValue, perOs: lostValue / payers, group: lostValue,
      zrodlo: `${dropouts} rezygnacji względem ${maxN}; ok. ${free} miejsc grupowych zwalnia klauzula ${LR.klauzula_pct}%. Pokrywa grupa.`,
      status: "skutek rezygnacji", factor: 1, rezerwa: false,
    });
    groupSum += lostValue;
  }

  const reserveGroup = reservable * reservePct / 100;
  const directGroup = groupSum;
  const direct = directGroup / payers;
  const reserve = reserveGroup / payers;
  const total = direct + reserve;
  const fujiPer = Number(model && model.fuji_na_osobe) || FUJI_PER;
  const fujiN = (choices.fuji === "tak" && !disabledGroups(choices).fuji) ? Math.max(0, Number(fujiOsob) || 0) : 0;
  const fujiAdd = fujiN * fujiPer;
  const fixedGroup = lines.filter((l) => l.jednostka === "grupa").reduce((a, l) => a + l.group, 0);
  return {
    lines, direct, reserve, reservePct, total,
    group: total * payers,
    fujiN, fujiAdd, fujiPer, grandGroup: total * payers + fujiAdd,
    n, gratis, payers, fleet, dropouts, lost, lostValue, lossPolicy: P.lossPolicy, minors: P.minors,
    fixedGroup,
  };
}

/** Krzywa ceny od liczby osób (pozostałe ustawienia bez zmian). */
export function priceCurve(model, groups, choices, people, from, to) {
  const out = [];
  for (let k = from; k <= to; k++) {
    const c = computeCost(model, groups, choices, 0, { ...people, n: k });
    out.push({ n: k, total: c.total, jp: c.fleet.jp && c.fleet.jp.label, kr: c.fleet.kr && c.fleet.kr.label });
  }
  return out;
}

export function baselineCost(model, groups) {
  return computeCost(model, groups, defaultChoices(groups), 0, defaultPeople(model));
}

export function activeEffects(groups, choices) {
  const codes = [];
  const off = disabledGroups(choices);
  groups.forEach((g) => {
    if (off[g.id]) return;
    const opt = g.opcje.find((o) => o.opcja_id === choices[g.id]);
    if (opt && opt.efekt) codes.push(opt.efekt);
  });
  return codes;
}

export function applyDays(baseDays, warianty, effects) {
  const days = baseDays.map((d) => ({ ...d }));
  const changed = new Set();
  effects.forEach((code) => {
    const w = warianty[code];
    if (!w || !w.dni) return;
    Object.entries(w.dni).forEach(([data, patch]) => {
      const i = days.findIndex((d) => d.data === data);
      if (i < 0) return;
      days[i] = { ...days[i], ...patch };
      changed.add(data);
    });
  });
  return { days, changed };
}

export function scenarioLogs(warianty, effects) {
  const out = [];
  effects.forEach((code) => {
    const w = warianty[code];
    if (w && Array.isArray(w.log)) w.log.forEach((x) => out.push(x));
  });
  return out;
}

export function normalizeChoices(c) {
  const next = { ...c };
  // Stare warianty pętli (E1–E4, do 26.11.2026) → ścieżki A/B.
  if (["E1", "E2", "E3"].includes(next.petla)) next.petla = "A";
  if (!["A", "B", "C"].includes(next.petla)) next.petla = "A";
  if (next.petla === "E4") next.petla = "B";
  if (next.petla === "B" && next.sen === "tokio") next.sen = "standard";
  delete next.noc_2;
  return next;
}

/**
 * Raty: udziały z modelu, kwoty od aktualnej ceny.
 * Rata z wpisaną „kwotą zamrożoną” (już wysłana rodzicom) się nie zmienia;
 * różnicę rozkładamy proporcjonalnie na raty niezamrożone. Ostatnia niezamrożona domyka grosze.
 */
export function splitInstalments(total, raty, payers = N_GROUP) {
  const rows = (raty || []).map((r) => ({ ...r }));
  let frozenSum = 0, openShare = 0;
  rows.forEach((r) => {
    const z = num(r.kwota_os_zamrozona);
    r.zamrozona = z != null;
    if (r.zamrozona) { r.kwotaOs = z; frozenSum += z; }
    else openShare += Number(r.udzial) || 0;
  });
  // Gdy zamrożone raty przekraczają cenę, kolejne raty są zerowe (nadwyżka do rozliczenia, nie ujemna rata).
  const rest = Math.max(0, total - frozenSum);
  const open = rows.filter((r) => !r.zamrozona);
  let acc = 0;
  open.forEach((r, i) => {
    if (i < open.length - 1) {
      r.kwotaOs = Math.round(rest * (openShare ? (Number(r.udzial) || 0) / openShare : 0) * 100) / 100;
      acc += r.kwotaOs;
    } else {
      r.kwotaOs = Math.round((rest - acc) * 100) / 100;
    }
  });
  rows.forEach((r) => {
    r.kwotaGrupa = Math.round(r.kwotaOs * payers * 100) / 100;
    r.udzialEfektywny = total ? (r.kwotaOs / total) * 100 : 0;
  });
  return rows;
}

export function parseWplatySheet(rows) {
  return rowsToSafe(rows).filter((r) => r["ID raty"]).map((r) => ({
    id: r["ID raty"],
    rata: r["Rata"],
    termin: r["Termin (data robocza)"] || r["Termin"],
    termin_zrodlo: r["Termin w źródle (miesiąc)"] || "",
    udzial: num(r["Udział %"]) ?? 0,
    przeznaczenie: r["Przeznaczenie"] || "",
    liczba_wplaconych: r["Liczba wpłaconych"],
    suma_wplynela: r["Suma wpłynęła (zł)"],
    kwota_os_zamrozona: r["Kwota zamrożona (zł/os.)"] || "",
    uwagi: r["Uwagi"] || "",
  }));
}

export function parseChecklistSheet(rows) {
  return rowsToSafe(rows).filter((r) => r["ID"]).map((r) => {
    const zrobioneRaw = String(r["Zrobione"] || "").trim().toLowerCase();
    const zrobione = zrobioneRaw === "tak" || zrobioneRaw === "true" || zrobioneRaw === "prawda" || zrobioneRaw === "1" || zrobioneRaw === "yes";
    let status = (r["Status"] || "do zrobienia").toLowerCase();
    if (zrobione) status = "zrobione";
    const osoba = (r["Osoba"] || r["Osoba odpowiedzialna"] || "").trim();
    return {
      id: r["ID"],
      kat: r["Kategoria"],
      zadanie: r["Zadanie"],
      kto: r["Osoba odpowiedzialna"] || osoba,
      osoba,
      termin: r["Termin (data)"],
      termin_etykieta: r["Termin (opis)"] || "",
      status,
      zrobione,
      wymagane: r["Wymagane (liczba)"],
      zebrane: r["Zebrane (liczba)"],
      uwagi: r["Uwagi"] || "",
      komentarz: r["Komentarz"] || "",
      zmieniono: r["Zmieniono"] || "",
    };
  });
}

function rowsToSafe(rows) {
  if (!rows || !rows.length) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ""; });
    return o;
  });
}
