/**
 * Silnik decyzji i kosztów.
 * Nie zmieniaj id decyzji ani id pozycji modelu (petla, nocleg_nagasaki, itd.)
 * — są zapisane w data/data.json i w arkuszu.
 */
import { N_GROUP, FUJI_PER, CHOICE_IDS, num } from "./util.js";

export function groupDecisions(rows) {
  const order = [];
  const map = {};
  const hoist = ["kontekst", "opis", "ograniczenia", "wplyw_inne", "rekomendacja_tekst"];
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
  CHOICE_IDS.forEach((k) => { if (state.choices[k]) p.set(k, state.choices[k]); });
  if (state.choices.fuji === "tak") p.set("fuji_osob", String(state.fujiOsob || 10));
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

function collectChanges(groups, choices) {
  const additive = [], multi = [];
  groups.forEach((g) => {
    const opt = g.opcje.find((o) => o.opcja_id === choices[g.id]);
    if (!opt || !opt.zmiany) return;
    String(opt.zmiany).split(";").forEach((tok) => {
      if (tok.includes(":*")) multi.push(tok);
      else additive.push(tok);
    });
  });
  return { additive, multi };
}

export function computeCost(model, groups, choices, fujiOsob) {
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

  const lines = [];
  let direct = 0;
  pozycje.forEach((l) => {
    if (l.jednostka === "proc") return;
    const kwota = amounts[l.id] ?? 0;
    const perOs = l.jednostka === "grupa" ? kwota / N_GROUP : kwota;
    const group = l.jednostka === "grupa" ? kwota : kwota * N_GROUP;
    lines.push({
      id: l.id, grupa: l.grupa, pozycja: l.pozycja, jednostka: l.jednostka,
      kwota, perOs, group, zrodlo: l.zrodlo, status: l.status,
    });
    direct += perOs;
  });
  const reserve = direct * reservePct / 100;
  const total = direct + reserve;
  const fujiN = choices.fuji === "tak" ? Math.max(0, Number(fujiOsob) || 0) : 0;
  const fujiAdd = fujiN * FUJI_PER;
  return {
    lines, direct, reserve, reservePct, total,
    group: total * N_GROUP,
    fujiN, fujiAdd, grandGroup: total * N_GROUP + fujiAdd,
  };
}

export function baselineCost(model, groups) {
  return computeCost(model, groups, defaultChoices(groups), 0);
}

export function activeEffects(groups, choices) {
  const codes = [];
  groups.forEach((g) => {
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
  if (next.petla === "E4") next.noc_2 = "mito";
  return next;
}

/** Raty: udziały z modelu, kwoty od aktualnej ceny. Ostatnia rata domyka grosze. */
export function splitInstalments(total, raty) {
  const rows = (raty || []).map((r) => ({ ...r }));
  let acc = 0;
  rows.forEach((r, i) => {
    const share = Number(r.udzial) / 100;
    if (i < rows.length - 1) {
      r.kwotaOs = Math.round(total * share * 100) / 100;
      acc += r.kwotaOs;
    } else {
      r.kwotaOs = Math.round((total - acc) * 100) / 100;
    }
    r.kwotaGrupa = Math.round(r.kwotaOs * N_GROUP * 100) / 100;
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
