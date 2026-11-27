/**
 * Zakładki „Śpiew i parafie” oraz „Zbiórka i darczyńcy” (strona organizatorów).
 *
 * Dane osobowe (imiona śpiewających, darczyńcy, kwoty imienne) NIE trafiają do repozytorium.
 * Z podłączonym skryptem Zapis.gs leżą w osobnym, prywatnym arkuszu „ŚDM 2027 — Zbiórka”, który skrypt sam zakłada.
 * Bez skryptu — tylko w tej przeglądarce (tryb próbny).
 *
 * Zasady podziału pieniędzy (domyślne, do zmiany przy każdym wydarzeniu i datku):
 *  - taca z niedzieli dzieli się po równo między obecnych śpiewających, którzy jadą do Seulu;
 *  - jeśli nikt z obecnych nie jedzie, kwota idzie do budżetu wspólnego;
 *  - budżet wspólny obniża cenę wszystkim płacącym (kwota / liczba płacących).
 */
import { $, escapeHtml, formatZl, num, ORGANIZATORZY } from "./util.js";
import { getCred, askCred, post, hasApp } from "./zapis.js";
import { addBase } from "./maps.js";

const LOCAL_KEY = "sdm2027-zbiorka-local";
const TABS = {
  Osoby: ["ID", "Imię i nazwisko", "Jedzie do Seulu", "Śpiewa", "ID uczestnika", "Uwagi", "Zmieniono"],
  Wydarzenia: ["ID", "Data", "Godzina", "Parafia ID", "Parafia", "Miejscowość", "Diecezja", "Typ", "Status", "Pomocnicy", "Pomoc z parafii",
    "Notatka dla jadących", "Uwagi", "Obecni", "Kwota", "Podział", "Zmieniono", "Osób na Mszy"],
  Parafie: ["ID", "Nazwa", "Miejscowość", "Dekanat", "Diecezja", "Adres", "Telefon", "E-mail", "WWW", "Msze niedzielne",
    "Wspólnoty neokatechumenalne", "Status", "Kontakt", "Uwagi", "Źródło", "Zmieniono", "Ranking", "Uzasadnienie"],
  "Darczyńcy": ["ID", "Nazwa", "Typ", "Kontakt", "Prowadzi", "Etap", "Potencjał", "Następny krok", "Termin", "Uwagi", "Zmieniono"],
  Datki: ["ID", "Data", "Darczyńca ID", "Darczyńca", "Kwota", "Status", "Przeznaczenie", "Odbiorcy", "Uwagi", "Zmieniono"],
  Kontakty: ["ID", "Rodzaj", "Nazwa", "Status", "Kto", "Notatka", "Zmieniono"],
};
const TYPY = ["Msza ze śpiewem", "Koncert", "Świadectwo", "Wystawa AR (Kolbe)", "Wyjazd (inna diecezja)"];
const STATUS_W = ["planowane", "potwierdzone", "odbyło się", "odwołane"];
const STATUS_P = ["kandydat", "do zapytania", "zapytana", "zgoda", "odmowa", "po wydarzeniu"];
const ETAPY = ["do kontaktu", "umówione", "rozmowa", "obiecał", "wpłacił", "odmowa"];
const PODZIAL = {
  obecni_jadacy: "po równo: obecni, którzy jadą do Seulu",
  obecni: "po równo: wszyscy obecni",
  wszyscy_jadacy: "po równo: wszyscy jadący śpiewający",
  budzet: "do budżetu wspólnego (obniża cenę wszystkim)",
};
const PRZEZN = { budzet: "budżet wspólny (obniża cenę wszystkim)", osoba: "konkretna osoba", grupa: "grupa osób (po równo)" };
const DIECEZJE = ["warszawska", "warszawsko-praska", "inna"];

const st = { mode: "local", rola: "org", loaded: false, tabs: {}, month: null, cost: null, error: "",
  base: [], baseMeta: {}, pf: { q: "", status: "", diec: "", ndn: false, min: 0, sort: "ranking" }, parLimit: 60 };
const STATUS_COLOR = { kandydat: "#4a6a8f", "do zapytania": "#5d6d88", zapytana: "#c6a15b", zgoda: "#2f7d4f", odmowa: "#a3303a", "po wydarzeniu": "#1f4e79" };
const HOME = { nazwa: "Parafia św. Zygmunta (baza grupy)", lat: 52.279486, lng: 20.946477 };
const OVERLAY = ["ID", "Nazwa", "Miejscowość", "Status", "Kontakt", "Uwagi", "Wspólnoty neokatechumenalne", "Zmieniono"];

/* ---------- dane ---------- */
function emptyTabs() { const t = {}; Object.keys(TABS).forEach((k) => (t[k] = [])); return t; }
function rowsFromValues(values) {
  if (!values || values.length < 1) return [];
  const h = values[0].map((x) => String(x).trim());
  return values.slice(1).filter((r) => r.some((c) => String(c).trim())).map((r) => {
    const o = {};
    h.forEach((k, i) => (o[k] = r[i] == null ? "" : String(r[i])));
    return o;
  });
}
function saveLocal() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(st.tabs)); } catch (_) {} }

let appUrl = "";
async function load() {
  st.error = "";
  if (appUrl) {
    const kod = getCred().kod || "";
    if (!kod) { st.mode = "app"; st.loaded = false; st.error = "NEED_CODE"; return; }
    try {
      const r = await fetch(appUrl + (appUrl.includes("?") ? "&" : "?") + "action=zbiorka&kod=" + encodeURIComponent(kod));
      const j = await r.json();
      if (!j.ok) { st.mode = "app"; st.loaded = false; st.error = j.error || "ERR"; return; }
      st.mode = "app"; st.rola = j.rola || "org"; st.tabs = emptyTabs();
      Object.entries(j.tabele || {}).forEach(([k, v]) => (st.tabs[k] = rowsFromValues(v)));
      parCache = null;
      st.loaded = true;
      return;
    } catch (e) { st.mode = "app"; st.loaded = false; st.error = "NETWORK"; return; }
  }
  st.mode = "local"; st.rola = "org";
  try { st.tabs = { ...emptyTabs(), ...(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}")) }; } catch (_) { st.tabs = emptyTabs(); }
  parCache = null;
  st.loaded = true;
}
function newId(prefix) { return prefix + "-" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }

async function saveRow(tab, row) {
  if (tab === "Parafie") parCache = null;
  const list = st.tabs[tab] || (st.tabs[tab] = []);
  const i = list.findIndex((r) => r.ID === row.ID);
  const merged = i >= 0 ? { ...list[i], ...row } : row;
  if (st.mode === "app") {
    const j = await post("zb_zapisz", { tab, row: merged });
    if (!j || !j.ok) { alert("Nie zapisano: " + ((j && (j.message || j.error)) || "błąd")); return false; }
  }
  if (i >= 0) list[i] = merged; else list.push(merged);
  if (st.mode === "local") saveLocal();
  return true;
}
async function deleteRow(tab, id) {
  if (tab === "Parafie") parCache = null;
  if (!confirm("Usunąć ten wpis? Tego nie da się cofnąć.")) return false;
  if (st.mode === "app") {
    const j = await post("zb_usun", { tab, id });
    if (!j || !j.ok) { alert("Nie usunięto: " + ((j && (j.message || j.error)) || "błąd")); return false; }
  }
  st.tabs[tab] = (st.tabs[tab] || []).filter((r) => r.ID !== id);
  if (st.mode === "local") saveLocal();
  return true;
}

/* ---------- dla innych zakładek (Kontakty) ---------- */
export function zbRow(tab, id) { return (st.tabs[tab] || []).find((r) => r.ID === id); }
export function zbReady() { return st.loaded; }
export function zbSave(tab, row) { return saveRow(tab, row); }
const zbListeners = [];
export function onZbRender(fn) { zbListeners.push(fn); }

/* ---------- pomocnicze ---------- */
const yes = (v) => /^(tak|true|1|x|✓)$/i.test(String(v || "").trim());
function isoDate(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
function plDate(v) { const d = isoDate(v); return d ? `${d.slice(8)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : String(v || ""); }
const DOW = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
function dow(v) { const d = isoDate(v); return d ? DOW[new Date(d + "T12:00:00").getDay()] : ""; }
const idsOf = (v) => String(v || "").split(/[,;]\s*/).map((x) => x.trim()).filter(Boolean);
const amount = (v) => num(v) || 0;
const zl = (n) => formatZl(n, 0);
function osoba(id) { return (st.tabs.Osoby || []).find((o) => o.ID === id); }
function osobaName(id) { const o = osoba(id); return o ? o["Imię i nazwisko"] : id; }
function todayIso() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

/* ---------- parafie: lista bazowa (data/parafie.json) + nasze statusy z arkusza ---------- */
const hasNdn = (v) => { const s = String(v || "").trim().toLowerCase(); return !!s && !/^(nie|brak|0|-|—)$/.test(s); };
function fromBase(b) {
  return { ID: b.id, Nazwa: b.nazwa, "Miejscowość": b.miejscowosc, Dekanat: b.dekanat, Diecezja: b.diecezja, Adres: b.adres,
    Proboszcz: b.proboszcz || "", Telefon: b.tel, "E-mail": b.email, WWW: b.www, Baza: b.baza, "Msze niedzielne": b.msze, msze_n: b.msze_n, lat: b.lat, lng: b.lng,
    odl: b.odl_km, wierni: b.wierni, zakon: b.zakon, rank_wsp: b.rank_wsp, rank_diec: b.rank_diec, podstawa: b.podstawa,
    cena: b.cena_m2, cena_txt: b.cena_m2 ? `${b.cena_m2.toLocaleString("pl-PL")} zł/m² — ${b.cena_poziom} ${b.cena_obszar}` : "", potencjal: b.potencjal,
    Status: "kandydat", base: true };
}
let parCache = null;
export function allParafie() {
  if (parCache) return parCache;
  const ov = {}; (st.tabs.Parafie || []).forEach((r) => (ov[r.ID] = r));
  const list = st.base.map((b) => {
    const p = fromBase(b); const o = ov[b.id];
    if (o) ["Status", "Kontakt", "Uwagi", "Wspólnoty neokatechumenalne", "Zmieniono"].forEach((k) => { if (o[k]) p[k] = o[k]; });
    return p;
  });
  const baseIds = new Set(st.base.map((b) => b.id));
  (st.tabs.Parafie || []).filter((r) => !baseIds.has(r.ID)).forEach((r) => list.push({ ...r, rank_wsp: num(r.Ranking) || 0, potencjal: null, lat: num(r.lat), lng: num(r.lng), Status: r.Status || "kandydat" }));
  list.forEach((p) => { p.ndn = hasNdn(p["Wspólnoty neokatechumenalne"]); p.rank = Math.min(10, (p.rank_wsp || 0) + (p.ndn ? 3 : 0)); });
  parCache = list;
  return list;
}
function findParafia(id) { return allParafie().find((p) => p.ID === id); }
function overlayRow(p, changes) {
  const o = {}; OVERLAY.forEach((k) => { if (p[k] !== undefined) o[k] = p[k]; });
  return { ...o, ...changes, ID: p.ID };
}

/* ---------- rozliczenie ---------- */
export function ledger() {
  const per = {};
  const add = (id, k, v) => { (per[id] = per[id] || { taca: 0, dar: 0, wyst: 0 })[k] += v; };
  let budzet = 0, taca = 0, dar = 0, obiecane = 0;
  const osoby = st.tabs.Osoby || [];
  const jadacy = osoby.filter((o) => yes(o["Jedzie do Seulu"]));
  (st.tabs.Wydarzenia || []).forEach((w) => {
    if (w.Status !== "odbyło się") return;
    const obecni = idsOf(w.Obecni);
    obecni.forEach((id) => add(id, "wyst", 1));
    const k = amount(w.Kwota);
    if (!k) return;
    taca += k;
    const pod = w["Podział"] || "obecni_jadacy";
    let rec = [];
    if (pod === "obecni_jadacy") rec = obecni.filter((id) => yes((osoba(id) || {})["Jedzie do Seulu"]));
    else if (pod === "obecni") rec = obecni;
    else if (pod === "wszyscy_jadacy") rec = jadacy.filter((o) => yes(o["Śpiewa"])).map((o) => o.ID);
    if (!rec.length) { budzet += k; return; }
    rec.forEach((id) => add(id, "taca", k / rec.length));
  });
  (st.tabs.Datki || []).forEach((d) => {
    const k = amount(d.Kwota);
    if (!k) return;
    if (d.Status !== "wpłynęło") { obiecane += k; return; }
    dar += k;
    const rec = d["Przeznaczenie"] === "budzet" ? [] : idsOf(d.Odbiorcy);
    if (!rec.length) { budzet += k; return; }
    rec.forEach((id) => add(id, "dar", k / rec.length));
  });
  return { per, budzet, taca, dar, obiecane, razem: taca + dar };
}

/* ---------- formularz w okienku ---------- */
export function field(f, v) {
  const val = v == null ? "" : String(v);
  const id = "zbf-" + f.k.replace(/\W+/g, "_");
  let input;
  if (f.type === "select") {
    input = `<select id="${id}" data-k="${escapeHtml(f.k)}">${f.opts.map((o) => {
      const [ov, ol] = Array.isArray(o) ? o : [o, o];
      return `<option value="${escapeHtml(ov)}" ${val === ov ? "selected" : ""}>${escapeHtml(ol)}</option>`;
    }).join("")}</select>`;
  } else if (f.type === "textarea") {
    input = `<textarea id="${id}" data-k="${escapeHtml(f.k)}" rows="${f.rows || 3}">${escapeHtml(val)}</textarea>`;
  } else if (f.type === "list") {
    input = `<input id="${id}" data-k="${escapeHtml(f.k)}" list="${id}-dl" value="${escapeHtml(val)}" autocomplete="off" /><datalist id="${id}-dl">${f.opts.map((o) => `<option value="${escapeHtml(o)}"></option>`).join("")}</datalist>`;
  } else if (f.type === "multi") {
    const cur = idsOf(val);
    input = `<div class="zb-multi" data-k="${escapeHtml(f.k)}" data-multi="1">${f.opts.map((o) => `<label class="zb-chk"><input type="checkbox" value="${escapeHtml(o)}" ${cur.includes(o) ? "checked" : ""}/> ${escapeHtml(o)}</label>`).join("")}</div>`;
  } else {
    input = `<input id="${id}" data-k="${escapeHtml(f.k)}" type="${f.type || "text"}" value="${escapeHtml(val)}" ${f.step ? `step="${f.step}"` : ""} />`;
  }
  return `<label class="${f.wide ? "wide" : ""}"><span>${escapeHtml(f.label || f.k)}</span>${input}${f.hint ? `<small>${escapeHtml(f.hint)}</small>` : ""}</label>`;
}
function readForm(root) {
  const out = {};
  root.querySelectorAll("[data-k]").forEach((el) => {
    if (el.dataset.multi) out[el.dataset.k] = [...el.querySelectorAll("input:checked")].map((x) => x.value).join(", ");
    else out[el.dataset.k] = el.value.trim();
  });
  return out;
}
export function modal(title, bodyHtml, { onSave, onDelete, saveLabel = "Zapisz", wide = false, onMount } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-back";
  wrap.innerHTML = `<div class="modal zb-modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <h3>${escapeHtml(title)}</h3>
    <div class="zb-form">${bodyHtml}</div>
    <div class="modal-actions">${onDelete ? `<button type="button" class="btn zb-del" data-x="del">Usuń</button><span class="grow"></span>` : ""}
      <button type="button" class="btn" data-x="0">Anuluj</button>${onSave ? `<button type="button" class="btn btn-gold" data-x="1">${escapeHtml(saveLabel)}</button>` : ""}</div>
  </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add("modal-open");
  const close = () => { wrap.remove(); document.body.classList.remove("modal-open"); };
  wrap.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-x]");
    if (!b) { if (e.target === wrap) close(); return; }
    if (b.dataset.x === "0") return close();
    b.disabled = true;
    const ok = b.dataset.x === "del" ? await onDelete() : await onSave(readForm(wrap), wrap);
    b.disabled = false;
    if (ok !== false) { close(); renderAll(); }
  });
  if (onMount) onMount(wrap);
  const first = wrap.querySelector("input, select, textarea");
  if (first) first.focus();
}

/* ---------- edycja ---------- */
function editOsoba(o = {}) {
  modal(o.ID ? "Osoba" : "Nowa osoba", [
    field({ k: "Imię i nazwisko", wide: true }, o["Imię i nazwisko"]),
    field({ k: "Jedzie do Seulu", type: "select", opts: ["TAK", "NIE"] }, o["Jedzie do Seulu"] || "TAK"),
    field({ k: "Śpiewa", type: "select", opts: ["TAK", "NIE"] }, o["Śpiewa"] || "TAK"),
    field({ k: "ID uczestnika", hint: "np. U012 z listy Seul 27 — łączy z wpłatami imiennymi" }, o["ID uczestnika"]),
    field({ k: "Uwagi", type: "textarea", wide: true, rows: 2 }, o.Uwagi),
  ].join(""), {
    onSave: (f) => {
      if (!f["Imię i nazwisko"]) { alert("Wpisz imię i nazwisko."); return false; }
      return saveRow("Osoby", { ...o, ...f, ID: o.ID || newId("O") });
    },
    onDelete: o.ID && st.rola === "org" ? () => deleteRow("Osoby", o.ID) : null,
  });
}

function parafiaLabel(p) { return [p.Nazwa, p["Miejscowość"]].filter(Boolean).join(", "); }
function editWydarzenie(w = {}, preset = {}) {
  const par = allParafie();
  const v = { Status: "planowane", Typ: TYPY[0], Diecezja: "warszawska", ...preset, ...w };
  modal(w.ID ? "Wydarzenie" : "Nowe wydarzenie", [
    field({ k: "Data", type: "date" }, isoDate(v.Data)),
    field({ k: "Godzina", type: "time" }, v.Godzina),
    field({ k: "Parafia", type: "list", opts: par.map(parafiaLabel), wide: true, hint: par.length ? "Zacznij pisać — podpowie z listy parafii. Nowa nazwa też jest w porządku." : "Lista parafii jest pusta — wpisz nazwę albo zaimportuj listę z Groka." }, v.Parafia ? [v.Parafia, v["Miejscowość"]].filter(Boolean).join(", ") : ""),
    field({ k: "Diecezja", type: "select", opts: DIECEZJE }, v.Diecezja),
    field({ k: "Typ", type: "select", opts: TYPY }, v.Typ),
    field({ k: "Status", type: "select", opts: STATUS_W }, v.Status),
    field({ k: "Pomocnicy", type: "multi", opts: ORGANIZATORZY, wide: true, label: "Kto z organizatorów pomaga" }, v.Pomocnicy),
    field({ k: "Pomoc z parafii", wide: true, hint: "np. proboszcz, ministranci, kto rozstawia wystawę AR" }, v["Pomoc z parafii"]),
    field({ k: "Notatka dla jadących", type: "textarea", wide: true, rows: 2, hint: "Widać na stronie jadących: zbiórka, strój, próba" }, v["Notatka dla jadących"]),
    field({ k: "Uwagi", type: "textarea", wide: true, rows: 2, label: "Uwagi organizatorów (tylko tu)" }, v.Uwagi),
  ].join(""), {
    wide: true,
    onSave: (f) => {
      if (!f.Data) { alert("Wybierz datę."); return false; }
      const hit = par.find((p) => parafiaLabel(p) === f.Parafia);
      const [nazwa, ...miej] = f.Parafia.split(",");
      const row = { ...w, ...f, ID: w.ID || newId("W"),
        Parafia: hit ? hit.Nazwa : nazwa.trim(), "Miejscowość": hit ? hit["Miejscowość"] : miej.join(",").trim(), "Parafia ID": hit ? hit.ID : "" };
      return saveRow("Wydarzenia", row).then(async (ok) => {
        if (ok && hit && ["kandydat", "do zapytania", "zapytana"].includes(hit.Status) && ["potwierdzone", "planowane"].includes(row.Status) && st.rola === "org") {
          await saveRow("Parafie", overlayRow(hit, { Status: row.Status === "potwierdzone" ? "zgoda" : hit.Status }));
        }
        return ok;
      });
    },
    onDelete: w.ID && st.rola === "org" ? () => deleteRow("Wydarzenia", w.ID) : null,
  });
}

function settle(w) {
  const osoby = (st.tabs.Osoby || []).slice().sort((a, b) => (a["Imię i nazwisko"] || "").localeCompare(b["Imię i nazwisko"] || "", "pl"));
  const cur = idsOf(w.Obecni);
  const rows = osoby.map((o) => `<label class="zb-chk ${yes(o["Śpiewa"]) ? "" : "zb-nosing"}"><input type="checkbox" value="${escapeHtml(o.ID)}" ${cur.includes(o.ID) ? "checked" : ""}/> ${escapeHtml(o["Imię i nazwisko"])}${yes(o["Jedzie do Seulu"]) ? "" : ` <em>(nie jedzie)</em>`}</label>`).join("");
  modal(`Rozliczenie: ${plDate(w.Data)} · ${w.Parafia || ""}`, `
    <div class="wide"><span class="zb-lab">Kto faktycznie śpiewał</span>
      <div class="zb-multi zb-obecni" data-k="Obecni" data-multi="1">${rows || `<p class="muted">Najpierw dodaj osoby (przycisk „+ Osoba”).</p>`}</div>
      <p class="zb-mini"><button type="button" class="btn-link" data-all="1">zaznacz śpiewających</button> · <button type="button" class="btn-link" data-all="0">odznacz</button></p></div>
    ${field({ k: "Kwota", type: "number", step: "0.01", label: "Kwota zebrana (zł)" }, w.Kwota)}
    ${field({ k: "Podział", type: "select", opts: Object.entries(PODZIAL) }, w["Podział"] || "obecni_jadacy")}
    ${field({ k: "Osób na Mszy", type: "number", step: "10", label: "Ile osób było na Mszy (szacunkowo)", hint: "Po kilku niedzielach strona policzy, ile średnio daje osoba — i sprawdzi, czy „Potencjał zbiórki” cokolwiek przewiduje." }, w["Osób na Mszy"])}
    <p class="wide zb-preview" id="zb-preview"></p>`, {
    wide: true, saveLabel: "Zapisz rozliczenie",
    onMount: (root) => {
      const upd = () => {
        const f = readForm(root);
        const k = amount(f.Kwota);
        const ob = idsOf(f.Obecni);
        let rec = ob;
        if (f["Podział"] === "obecni_jadacy") rec = ob.filter((id) => yes((osoba(id) || {})["Jedzie do Seulu"]));
        if (f["Podział"] === "wszyscy_jadacy") rec = osoby.filter((o) => yes(o["Jedzie do Seulu"]) && yes(o["Śpiewa"])).map((o) => o.ID);
        $("#zb-preview", root).textContent = !k ? `Obecnych: ${ob.length}.`
          : f["Podział"] === "budzet" || !rec.length ? `${zl(k)} idzie do budżetu wspólnego.`
          : `Obecnych: ${ob.length}. ${zl(k)} ÷ ${rec.length} = ${formatZl(k / rec.length)} na osobę.`;
      };
      root.addEventListener("input", upd); root.addEventListener("change", upd);
      root.querySelectorAll("[data-all]").forEach((b) => b.addEventListener("click", () => {
        root.querySelectorAll(".zb-obecni input").forEach((c) => { c.checked = b.dataset.all === "1" && !c.closest(".zb-nosing"); });
        upd();
      }));
      upd();
    },
    onSave: (f) => saveRow("Wydarzenia", { ...w, Obecni: f.Obecni, Kwota: f.Kwota, "Podział": f["Podział"], "Osób na Mszy": f["Osób na Mszy"], Status: "odbyło się" }),
  });
}

function editParafia(p = {}) {
  if (p.base) {
    const info = `<div class="wide zb-parinfo">
      <p><strong>${escapeHtml(p.Nazwa)}</strong>, ${escapeHtml(p["Miejscowość"] || "")} · dekanat ${escapeHtml(p.Dekanat || "")} · ${escapeHtml(p.Diecezja)}</p>
      <p>${escapeHtml(p.Adres || "")}${p.odl != null ? ` · ${escapeHtml(String(p.odl).replace(".", ","))} km od św. Zygmunta (w linii prostej)` : ""}</p>
      <p><strong>Proboszcz:</strong> ${escapeHtml(p.Proboszcz || "brak w bazie")}</p>
      <p>☎ ${escapeHtml(p.Telefon || "brak")}${p["E-mail"] ? ` · <a href="mailto:${escapeHtml(p["E-mail"])}">${escapeHtml(p["E-mail"])}</a>` : ""}${p.WWW ? ` · <a href="${escapeHtml(p.WWW)}" target="_blank" rel="noopener">strona</a>` : ""}${p.Baza ? ` · <a href="${escapeHtml(p.Baza)}" target="_blank" rel="noopener">baza diecezji</a>` : ""}</p>
      <p><strong>Msze niedzielne:</strong> ${escapeHtml(p["Msze niedzielne"] || "brak w bazie")}</p>
      <p><strong>Ranking wspólny:</strong> ${p.rank}${p.ndn ? " (z +3 za wspólnoty)" : ""} · w diecezji wg Groka: ${escapeHtml(String(p.rank_diec || ""))} · ${escapeHtml(p.podstawa || "")}</p>
      <p><strong>Potencjał zbiórki:</strong> ${p.potencjal ?? "—"}/100 [szacunek] · ${escapeHtml(p.cena_txt || "")}${p.wierni ? ` · ${p.wierni.toLocaleString("pl-PL")} wiernych` : ""}${p.zakon ? " · parafia zakonna/specjalna" : ""}</p>
    </div>`;
    return modal("Parafia", info + [
      field({ k: "Status", type: "select", opts: STATUS_P }, p.Status || "kandydat"),
      field({ k: "Wspólnoty neokatechumenalne", hint: "TAK / liczba wspólnot / NIE — daje +3 w rankingu" }, p["Wspólnoty neokatechumenalne"]),
      field({ k: "Kontakt", wide: true, hint: "z kim rozmawialiśmy, kiedy oddzwonić" }, p.Kontakt),
      field({ k: "Uwagi", type: "textarea", wide: true, rows: 3, hint: "np. zgoda na zbiórkę przy wyjściu, która Msza, sala na wystawę AR" }, p.Uwagi),
    ].join(""), {
      wide: true,
      onSave: (f) => saveRow("Parafie", overlayRow(p, f)),
    });
  }
  modal(p.ID ? "Parafia" : "Nowa parafia (spoza listy)", [
    field({ k: "Nazwa", wide: true }, p.Nazwa), field({ k: "Miejscowość" }, p["Miejscowość"]), field({ k: "Dekanat" }, p.Dekanat),
    field({ k: "Diecezja", type: "select", opts: DIECEZJE }, p.Diecezja || "inna"), field({ k: "Status", type: "select", opts: STATUS_P }, p.Status || "kandydat"),
    field({ k: "Adres", wide: true }, p.Adres), field({ k: "Telefon" }, p.Telefon), field({ k: "E-mail" }, p["E-mail"]), field({ k: "WWW", wide: true }, p.WWW),
    field({ k: "Msze niedzielne", wide: true }, p["Msze niedzielne"]), field({ k: "Wspólnoty neokatechumenalne", hint: "TAK / NIE / ile" }, p["Wspólnoty neokatechumenalne"]),
    field({ k: "Ranking", hint: "1–10" }, p.Ranking), field({ k: "Kontakt", hint: "z kim rozmawiamy" }, p.Kontakt),
    field({ k: "Uwagi", type: "textarea", wide: true, rows: 2 }, p.Uwagi),
  ].join(""), {
    wide: true,
    onSave: (f) => { if (!f.Nazwa) { alert("Wpisz nazwę."); return false; } return saveRow("Parafie", { ...p, ...f, ID: p.ID || newId("P") }); },
    onDelete: p.ID ? () => deleteRow("Parafie", p.ID) : null,
  });
}

function editDarczynca(d = {}) {
  modal(d.ID ? "Darczyńca" : "Nowy darczyńca", [
    field({ k: "Nazwa", wide: true, label: "Imię i nazwisko / firma" }, d.Nazwa),
    field({ k: "Typ", type: "select", opts: ["osoba", "firma", "fundacja", "parafia", "inne"] }, d.Typ),
    field({ k: "Prowadzi", type: "select", opts: ["", ...ORGANIZATORZY] }, d.Prowadzi),
    field({ k: "Etap", type: "select", opts: ETAPY }, d.Etap || "do kontaktu"),
    field({ k: "Potencjał", type: "number", step: "1", label: "Potencjał (zł)" }, d["Potencjał"]),
    field({ k: "Kontakt", wide: true, hint: "przez kogo / telefon / e-mail" }, d.Kontakt),
    field({ k: "Następny krok", wide: true }, d["Następny krok"]), field({ k: "Termin", type: "date" }, isoDate(d.Termin)),
    field({ k: "Uwagi", type: "textarea", wide: true, rows: 2 }, d.Uwagi),
  ].join(""), {
    wide: true,
    onSave: (f) => { if (!f.Nazwa) { alert("Wpisz nazwę."); return false; } return saveRow("Darczyńcy", { ...d, ...f, ID: d.ID || newId("D") }); },
    onDelete: d.ID ? () => deleteRow("Darczyńcy", d.ID) : null,
  });
}

function editDatek(x = {}, preset = {}) {
  const v = { Status: "wpłynęło", "Przeznaczenie": "budzet", Data: todayIso(), ...preset, ...x };
  const dar = st.tabs["Darczyńcy"] || [];
  const osoby = (st.tabs.Osoby || []).filter((o) => yes(o["Jedzie do Seulu"]));
  const cur = idsOf(v.Odbiorcy);
  modal(x.ID ? "Datek" : "Nowy datek", `
    ${field({ k: "Darczyńca ID", type: "select", label: "Darczyńca", opts: [["", "— bez nazwy / anonimowy —"], ...dar.map((d) => [d.ID, d.Nazwa])] }, v["Darczyńca ID"])}
    ${field({ k: "Data", type: "date" }, isoDate(v.Data))}
    ${field({ k: "Kwota", type: "number", step: "0.01", label: "Kwota (zł)" }, v.Kwota)}
    ${field({ k: "Status", type: "select", opts: ["wpłynęło", "obiecane"] }, v.Status)}
    ${field({ k: "Przeznaczenie", type: "select", opts: Object.entries(PRZEZN), wide: true }, v["Przeznaczenie"])}
    <div class="wide zb-odb"><span class="zb-lab">Dla kogo (przy „osoba” albo „grupa”)</span>
      <div class="zb-multi" data-k="Odbiorcy" data-multi="1">${osoby.map((o) => `<label class="zb-chk"><input type="checkbox" value="${escapeHtml(o.ID)}" ${cur.includes(o.ID) ? "checked" : ""}/> ${escapeHtml(o["Imię i nazwisko"])}</label>`).join("") || `<p class="muted">Brak osób jadących na liście.</p>`}</div>
      <p class="zb-mini"><button type="button" class="btn-link" data-allp="jad">wszyscy jadący</button> · <button type="button" class="btn-link" data-allp="spiew">jadący śpiewający</button> · <button type="button" class="btn-link" data-allp="0">odznacz</button></p></div>
    ${field({ k: "Uwagi", type: "textarea", wide: true, rows: 2 }, v.Uwagi)}`, {
    wide: true,
    onMount: (root) => {
      root.querySelectorAll("[data-allp]").forEach((b) => b.addEventListener("click", () => {
        root.querySelectorAll(".zb-odb input").forEach((c) => {
          const o = osoba(c.value) || {};
          c.checked = b.dataset.allp === "jad" ? true : b.dataset.allp === "spiew" ? yes(o["Śpiewa"]) : false;
        });
      }));
    },
    onSave: (f) => {
      if (!amount(f.Kwota)) { alert("Wpisz kwotę."); return false; }
      if (f["Przeznaczenie"] !== "budzet" && !idsOf(f.Odbiorcy).length) { alert("Zaznacz, dla kogo jest datek — albo wybierz budżet wspólny."); return false; }
      if (f["Przeznaczenie"] === "osoba" && idsOf(f.Odbiorcy).length > 1) f["Przeznaczenie"] = "grupa";
      const d = dar.find((z) => z.ID === f["Darczyńca ID"]);
      const row = { ...x, ...f, ID: x.ID || newId("T"), "Darczyńca": d ? d.Nazwa : "", Odbiorcy: f["Przeznaczenie"] === "budzet" ? "" : f.Odbiorcy };
      return saveRow("Datki", row).then(async (ok) => {
        if (ok && d && row.Status === "wpłynęło" && d.Etap !== "wpłynął" && d.Etap !== "wpłacił") await saveRow("Darczyńcy", { ...d, Etap: "wpłacił" });
        return ok;
      });
    },
    onDelete: x.ID ? () => deleteRow("Datki", x.ID) : null,
  });
}

/* ---------- import parafii (CSV z Groka) ---------- */
/** Nagłówki z Excela Groka → kolumny karty Parafie. */
const HEAD_ALIAS = {
  "parafia": "Nazwa", "nazwa parafii": "Nazwa", "nazwa": "Nazwa", "kościół": "Nazwa",
  "miejscowość": "Miejscowość", "miasto": "Miejscowość", "dzielnica": "Miejscowość", "miejscowość / dzielnica": "Miejscowość",
  "dekanat": "Dekanat", "diecezja": "Diecezja", "adres": "Adres", "telefon": "Telefon", "tel.": "Telefon",
  "e-mail": "E-mail", "email": "E-mail", "mail": "E-mail", "www": "WWW", "strona": "WWW", "strona www": "WWW",
  "msze niedzielne": "Msze niedzielne", "msze w niedzielę": "Msze niedzielne", "godziny mszy": "Msze niedzielne",
  "wspólnoty neokatechumenalne": "Wspólnoty neokatechumenalne", "neokatechumenat": "Wspólnoty neokatechumenalne", "droga neokatechumenalna": "Wspólnoty neokatechumenalne",
  "ranking": "Ranking", "pozycja": "Ranking", "miejsce w rankingu": "Ranking", "punkty": "Ranking", "ocena": "Ranking", "wynik": "Ranking",
  "uzasadnienie": "Uzasadnienie", "dlaczego": "Uzasadnienie", "komentarz": "Uzasadnienie",
  "uwagi": "Uwagi", "źródło": "Źródło", "zrodlo": "Źródło", "status": "Status", "kontakt": "Kontakt", "proboszcz": "Kontakt",
};
function mapHead(h) { const k = String(h || "").trim(); return TABS.Parafie.includes(k) ? k : (HEAD_ALIAS[k.toLowerCase()] || ""); }
let xlsxLib = null;
async function readXlsx(file) {
  if (!xlsxLib) xlsxLib = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const wb = xlsxLib.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return xlsxLib.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
}
function parseCsv(text) {
  const t = text.replace(/^\uFEFF/, "").trim();
  const first = t.split(/\r?\n/)[0] || "";
  const cnt = (ch) => first.split(ch).length - 1;
  const sep = cnt("\t") ? "\t" : cnt(";") >= cnt(",") ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  row.push(cell); rows.push(row);
  return rows;
}
function importParafie() {
  let fileRows = null;
  modal("Import parafii (Excel albo CSV z Groka)", `
    <p class="wide muted">Najprościej: wybierz plik Excel od Groka. Można też skopiować komórki z Excela (razem z wierszem nagłówków) i wkleić niżej. Rozpoznawane nagłówki m.in.: Parafia / Nazwa, Miejscowość, Dekanat, Adres, Telefon, E-mail, WWW, Msze niedzielne, Wspólnoty neokatechumenalne, Ranking (pozycja albo punkty), Uzasadnienie. Duplikaty (ta sama nazwa i miejscowość) są pomijane.</p>
    <label class="wide"><span>Plik Excel (.xlsx) albo CSV</span><input type="file" id="zb-file" accept=".xlsx,.xls,.csv,.tsv,.txt" /></label>
    <label class="wide"><span>…albo wklej tabelę</span><textarea id="zb-csv" rows="8" placeholder="Parafia	Miejscowość	Dekanat	Ranking	…"></textarea></label>
    <p class="wide zb-preview" id="zb-csv-prev"></p>`, {
    wide: true, saveLabel: "Importuj",
    onMount: (root) => {
      const prev = (r) => {
        $("#zb-csv-prev", root).textContent = r && r.length > 1 ? `Rozpoznane kolumny: ${r[0].map(mapHead).filter(Boolean).join(", ") || "brak — sprawdź nagłówki"} · wierszy: ${r.length - 1}` : "";
      };
      root.querySelector("#zb-csv").addEventListener("input", (e) => { fileRows = null; prev(parseCsv(e.target.value)); });
      root.querySelector("#zb-file").addEventListener("change", async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          fileRows = /\.xlsx?$/i.test(f.name) ? await readXlsx(f) : parseCsv(await f.text());
          prev(fileRows);
        } catch (err) { fileRows = null; alert("Nie udało się odczytać pliku: " + err.message); }
      });
    },
    onSave: async (_f, root) => {
      const r = fileRows || parseCsv(root.querySelector("#zb-csv").value);
      if (!r || r.length < 2) { alert("Brak danych."); return false; }
      const h = r[0].map(mapHead);
      const rows = r.slice(1).map((cells) => {
        const o = {}; h.forEach((k, i) => { if (k) o[k] = String(cells[i] == null ? "" : cells[i]).trim(); });
        o.Status = o.Status || "kandydat"; o.Diecezja = o.Diecezja || "warszawska"; o["Źródło"] = o["Źródło"] || "Grok";
        o.ID = newId("P");
        return o;
      }).filter((o) => o.Nazwa);
      if (st.mode === "app") {
        const j = await post("zb_import", { tab: "Parafie", rows });
        if (!j || !j.ok) { alert("Import nie wyszedł: " + ((j && (j.message || j.error)) || "błąd")); return false; }
        alert(`Dodano ${j.dodane}, pominięto ${j.pominiete} (duplikaty lub bez nazwy).`);
        await load();
        return true;
      }
      const seen = new Set(allParafie().map((p) => (p.Nazwa + "|" + p["Miejscowość"]).toLowerCase()));
      parCache = null;
      let add = 0;
      rows.forEach((o) => { const k = (o.Nazwa + "|" + o["Miejscowość"]).toLowerCase(); if (!seen.has(k)) { seen.add(k); st.tabs.Parafie.push(o); add++; } });
      saveLocal();
      alert(`Dodano ${add}, pominięto ${rows.length - add}.`);
      return true;
    },
  });
}

/* ---------- kalendarz: Google i .ics ---------- */
function evTimes(w) {
  const d = isoDate(w.Data).replace(/-/g, "");
  const t = (w.Godzina || "10:00").replace(":", "").padEnd(4, "0");
  const end = String(Math.min(23, parseInt(t.slice(0, 2), 10) + 2)).padStart(2, "0") + t.slice(2);
  return { start: `${d}T${t}00`, end: `${d}T${end}00` };
}
function evTitle(w) { return `ŚDM 2027 — ${w.Typ || "śpiew"}: ${w.Parafia || ""}`; }
function gcalUrl(w) {
  const { start, end } = evTimes(w);
  const p = new URLSearchParams({ action: "TEMPLATE", text: evTitle(w), dates: `${start}/${end}`, ctz: "Europe/Warsaw",
    location: [w.Parafia, w["Miejscowość"]].filter(Boolean).join(", "), details: w["Notatka dla jadących"] || "" });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
function icsEsc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function downloadIcs(list, name) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SDM2027//Spiew//PL", "CALSCALE:GREGORIAN"];
  list.forEach((w) => {
    const { start, end } = evTimes(w);
    lines.push("BEGIN:VEVENT", `UID:${w.ID}@sdm2027`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=Europe/Warsaw:${start}`, `DTEND;TZID=Europe/Warsaw:${end}`, `SUMMARY:${icsEsc(evTitle(w))}`,
      `LOCATION:${icsEsc([w.Parafia, w["Miejscowość"]].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${icsEsc([w["Notatka dla jadących"], w.Pomocnicy ? "Pomagają: " + w.Pomocnicy : ""].filter(Boolean).join("\n"))}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- render: Śpiew ---------- */
function banner() {
  if (st.mode === "local") return `<div class="zb-banner">Tryb próbny: skrypt zapisu nie jest jeszcze podłączony, więc wpisy zostają <strong>tylko w tej przeglądarce</strong>. Po wdrożeniu Zapis.gs dane trafią do prywatnego arkusza „ŚDM 2027 — Zbiórka”. Nie wpisuj tu teraz prawdziwych kwot od darczyńców.</div>`;
  if (!st.loaded) {
    const msg = st.error === "NEED_CODE" ? "Wpisz kod organizatorów albo kod skarbnika, żeby zobaczyć dane." : st.error === "BAD_CODE" ? "Kod nie pasuje." : "Nie udało się pobrać danych zbiórki.";
    return `<div class="zb-banner warn">${escapeHtml(msg)} <button type="button" class="btn btn-gold" data-zb="login">Podaj kod</button></div>`;
  }
  return st.rola === "skarbnik" ? `<div class="zb-banner">Zalogowano kodem skarbnika: możesz dopisywać osoby i rozliczać wydarzenia. Darczyńcy są widoczni tylko dla organizatorów.</div>` : "";
}

function monthGrid(events) {
  const [y, m] = st.month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const byDay = {};
  events.forEach((w) => { const d = isoDate(w.Data); if (d && d.startsWith(st.month)) (byDay[d] = byDay[d] || []).push(w); });
  const today = todayIso();
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="zb-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = `${st.month}-${String(d).padStart(2, "0")}`;
    const ev = byDay[iso] || [];
    const sun = new Date(y, m - 1, d).getDay() === 0;
    cells += `<div class="zb-cell ${sun ? "sun" : ""} ${iso === today ? "today" : ""}" data-newday="${iso}" title="Kliknij, żeby dodać wydarzenie">
      <span class="zb-dn">${d}</span>${ev.map((w) => `<button type="button" class="zb-ev st-${escapeHtml((w.Status || "").replace(/\s+/g, "-"))}" data-ev="${escapeHtml(w.ID)}">${escapeHtml(w.Godzina || "")} ${escapeHtml(w.Parafia || w.Typ || "")}</button>`).join("")}</div>`;
  }
  const label = first.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  return `<div class="zb-cal">
    <div class="zb-cal-head"><button type="button" class="btn" data-mon="-1" aria-label="Poprzedni miesiąc">←</button><strong>${escapeHtml(label)}</strong><button type="button" class="btn" data-mon="1" aria-label="Następny miesiąc">→</button></div>
    <div class="zb-grid">${["pn", "wt", "śr", "cz", "pt", "sb", "nd"].map((x) => `<div class="zb-dow">${x}</div>`).join("")}${cells}</div>
  </div>`;
}

function eventCard(w, L) {
  const ob = idsOf(w.Obecni);
  const k = amount(w.Kwota);
  return `<article class="zb-card st-${escapeHtml((w.Status || "").replace(/\s+/g, "-"))}">
    <div class="zb-card-date"><b>${escapeHtml(plDate(w.Data).slice(0, 5))}</b><span>${escapeHtml(dow(w.Data))}${w.Godzina ? " · " + escapeHtml(w.Godzina) : ""}</span></div>
    <div class="zb-card-body">
      <h4>${escapeHtml(w.Parafia || "(parafia do wpisania)")}${w["Miejscowość"] ? `, <span>${escapeHtml(w["Miejscowość"])}</span>` : ""}</h4>
      <p class="zb-tags"><span class="chip">${escapeHtml(w.Typ || "")}</span><span class="chip">${escapeHtml(w.Status || "")}</span>${w.Diecezja && w.Diecezja !== "warszawska" ? `<span class="chip">diec. ${escapeHtml(w.Diecezja)}</span>` : ""}</p>
      ${w.Pomocnicy || w["Pomoc z parafii"] ? `<p class="muted small">Pomagają: ${escapeHtml([w.Pomocnicy, w["Pomoc z parafii"]].filter(Boolean).join(" · "))}</p>` : ""}
      ${w["Notatka dla jadących"] ? `<p class="small">📝 ${escapeHtml(w["Notatka dla jadących"])}</p>` : ""}
      ${w.Status === "odbyło się" ? `<p class="small"><strong>${ob.length}</strong> śpiewało · zebrano <strong>${zl(k)}</strong>${amount(w["Osób na Mszy"]) ? ` · ok. ${amount(w["Osób na Mszy"])} osób na Mszy (${formatZl(k / amount(w["Osób na Mszy"]))} na osobę)` : ""} · ${escapeHtml(PODZIAL[w["Podział"]] || PODZIAL.obecni_jadacy)}</p>` : ""}
      <p class="zb-actions">
        <button type="button" class="btn" data-ev="${escapeHtml(w.ID)}">Edytuj</button>
        <button type="button" class="btn btn-gold" data-settle="${escapeHtml(w.ID)}">${w.Status === "odbyło się" ? "Popraw rozliczenie" : "Rozlicz po wydarzeniu"}</button>
        <a class="btn" href="${gcalUrl(w)}" target="_blank" rel="noopener">+ Google Calendar</a>
        <button type="button" class="btn" data-ics="${escapeHtml(w.ID)}">.ics</button>
      </p>
    </div></article>`;
}

function renderSpiew() {
  const root = $("#spiew-app");
  if (!root) return;
  if (!st.loaded) { root.innerHTML = banner(); return; }
  const ev = (st.tabs.Wydarzenia || []).slice().sort((a, b) => (isoDate(a.Data) + (a.Godzina || "")).localeCompare(isoDate(b.Data) + (b.Godzina || "")));
  const today = todayIso();
  if (!st.month) { const nx = ev.find((w) => isoDate(w.Data) >= today); st.month = (nx ? isoDate(nx.Data) : today).slice(0, 7); }
  const L = ledger();
  const future = ev.filter((w) => isoDate(w.Data) >= today && w.Status !== "odwołane");
  const past = ev.filter((w) => isoDate(w.Data) < today || w.Status === "odbyło się").reverse();
  const toSettle = ev.filter((w) => isoDate(w.Data) < today && w.Status !== "odbyło się" && w.Status !== "odwołane");
  const osoby = (st.tabs.Osoby || []).slice().sort((a, b) => (a["Imię i nazwisko"] || "").localeCompare(b["Imię i nazwisko"] || "", "pl"));
  const spiewa = osoby.filter((o) => yes(o["Śpiewa"]));

  root.innerHTML = `${banner()}
    <div class="stat-grid">
      <article class="stat-card"><p class="lbl">Zaplanowane</p><p class="val">${future.length}</p><p class="sub">wydarzeń przed nami</p></article>
      <article class="stat-card"><p class="lbl">Odbyte</p><p class="val">${ev.filter((w) => w.Status === "odbyło się").length}</p><p class="sub">${toSettle.length ? `<span class="warn-txt">${toSettle.length} do rozliczenia</span>` : "wszystkie rozliczone"}</p></article>
      <article class="stat-card"><p class="lbl">Z tacy</p><p class="val">${zl(L.taca)}</p><p class="sub">po rozliczeniach</p></article>
      <article class="stat-card"><p class="lbl">Śpiewający</p><p class="val">${spiewa.length}</p><p class="sub">${spiewa.filter((o) => yes(o["Jedzie do Seulu"])).length} jedzie do Seulu</p></article>
    </div>
    <div class="zb-toolbar">
      <button type="button" class="btn btn-gold" data-zb="new-ev">+ Wydarzenie</button>
      <button type="button" class="btn" data-zb="new-os">+ Osoba</button>
      ${st.rola === "org" ? `<button type="button" class="btn" data-zb="new-par">+ Parafia</button><button type="button" class="btn" data-zb="import">Import parafii (CSV z Groka)</button>` : ""}
      <button type="button" class="btn" data-zb="ics-all">Cały kalendarz (.ics)</button>
      ${st.mode === "app" ? `<button type="button" class="btn" data-zb="login">Zmień kod</button>` : ""}
    </div>
    ${toSettle.length ? `<div class="zb-banner warn">Do rozliczenia: ${toSettle.map((w) => `<button type="button" class="btn-link" data-settle="${escapeHtml(w.ID)}">${escapeHtml(plDate(w.Data))} ${escapeHtml(w.Parafia || "")}</button>`).join(" · ")}</div>` : ""}
    <div class="zb-two">
      ${monthGrid(ev)}
      <div class="zb-list"><h3>Najbliższe</h3>${future.slice(0, 8).map((w) => eventCard(w, L)).join("") || `<p class="muted">Brak zaplanowanych wydarzeń. Kliknij dzień w kalendarzu albo „+ Wydarzenie”.</p>`}</div>
    </div>
    ${past.length ? `<details class="zb-past"><summary>Odbyte i minione (${past.length})</summary>${past.map((w) => eventCard(w, L)).join("")}</details>` : ""}

    <h3>Śpiewający</h3>
    <p class="muted">Lista do zaznaczania obecności. Kolumna „z tacy” to udział w rozliczonych kwotach; pełne saldo z darczyńcami jest w zakładce Zbiórka.</p>
    <div class="table-scroll"><table class="sheet-table zb-table">
      <thead><tr><th>Imię i nazwisko</th><th>Jedzie</th><th>Śpiewa</th><th class="num">Wystąpienia</th><th class="num">Z tacy</th><th></th></tr></thead>
      <tbody>${osoby.map((o) => { const p = L.per[o.ID] || {}; return `<tr><td>${escapeHtml(o["Imię i nazwisko"])}</td><td>${yes(o["Jedzie do Seulu"]) ? "✓" : "—"}</td><td>${yes(o["Śpiewa"]) ? "✓" : "—"}</td><td class="num">${p.wyst || 0}</td><td class="num">${zl(p.taca || 0)}</td><td><button type="button" class="btn-link" data-os="${escapeHtml(o.ID)}">edytuj</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">Brak osób. Dodaj je przyciskiem „+ Osoba”.</td></tr>`}</tbody>
    </table></div>`;
  renderParafie();
}

/* ---------- render: Parafie (mapa + lista) ---------- */
let pmap = null, pLayer = null, pFitted = false;
function filteredParafie() {
  const f = st.pf, q = f.q.trim().toLowerCase();
  return allParafie().filter((p) => (!f.status || p.Status === f.status) && (!f.diec || p.Diecezja === f.diec) && (!f.ndn || p.ndn) && (p.rank || 0) >= f.min
    && (!q || [p.Nazwa, p["Miejscowość"], p.Dekanat, p.Adres, p.Proboszcz].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => f.sort === "potencjal" ? (b.potencjal || 0) - (a.potencjal || 0) || b.rank - a.rank
      : f.sort === "odl" ? (a.odl ?? 999) - (b.odl ?? 999)
      : b.rank - a.rank || (b.potencjal || 0) - (a.potencjal || 0));
}
function eventsByParafia() {
  const m = {};
  (st.tabs.Wydarzenia || []).forEach((w) => { if (w["Parafia ID"] && w.Status !== "odwołane") (m[w["Parafia ID"]] = m[w["Parafia ID"]] || []).push(w); });
  return m;
}
function parPopup(p, evs) {
  const nav = p.lat ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : "";
  return `<div class="zb-pop"><strong>${escapeHtml(p.Nazwa)}</strong><br><span class="muted">${escapeHtml(p["Miejscowość"] || "")} · ${escapeHtml(p.Dekanat || "")}</span>
    <p>Ranking <b>${p.rank}</b>${p.ndn ? " (wspólnoty NDN)" : ""} · potencjał <b>${p.potencjal ?? "—"}</b>/100 · <span class="chip" style="background:${STATUS_COLOR[p.Status] || "#8a94a6"};color:#fff">${escapeHtml(p.Status || "")}</span></p>
    ${p.Proboszcz ? `<p class="small">Proboszcz: ${escapeHtml(p.Proboszcz)}</p>` : ""}
    ${p["Msze niedzielne"] ? `<p class="small">Msze: ${escapeHtml(p["Msze niedzielne"])}</p>` : ""}
    ${p.Telefon ? `<p class="small">☎ <a href="tel:${escapeHtml(p.Telefon.replace(/[^\d+]/g, ""))}">${escapeHtml(p.Telefon)}</a></p>` : ""}
    ${evs && evs.length ? `<p class="small"><b>U nas:</b> ${evs.map((w) => escapeHtml(plDate(w.Data) + " " + (w.Typ || ""))).join(", ")}</p>` : ""}
    <p class="zb-actions"><button type="button" class="btn btn-gold" data-parev="${escapeHtml(p.ID)}">Zaplanuj</button><button type="button" class="btn" data-par="${escapeHtml(p.ID)}">Szczegóły</button>${nav ? `<a class="btn" href="${nav}" target="_blank" rel="noopener">Nawiguj</a>` : ""}</p></div>`;
}
function drawMap(list, evMap) {
  const el = $("#zb-map");
  if (!el || typeof L === "undefined") return;
  if (!pmap) {
    pmap = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.5 });
    pmap.setView([52.23, 21.01], 10);
    addBase(pmap);
    // Nazwy ulic i miejscowości przy przybliżeniu (po polsku) — do dojazdu.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { minZoom: 9, maxZoom: 16, pane: "overlayPane" }).addTo(pmap);
    L.marker([HOME.lat, HOME.lng], { icon: L.divIcon({ className: "pin2", html: `<span class="zb-home">★</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }), title: HOME.nazwa, zIndexOffset: 2000 })
      .bindTooltip(HOME.nazwa).addTo(pmap);
    if (typeof ResizeObserver !== "undefined") {
      let had = false;
      new ResizeObserver(() => { const ok = el.offsetWidth > 0; if (ok && !had) { pmap.invalidateSize(); if (!pFitted && pLayer && pLayer.getLayers().length) { pmap.fitBounds(pLayer.getBounds(), { padding: [10, 10], maxZoom: 11 }); pFitted = true; } } had = ok; }).observe(el);
    }
  }
  if (pLayer) pmap.removeLayer(pLayer);
  pLayer = L.featureGroup();
  list.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).forEach((p) => {
    const evs = evMap[p.ID];
    const size = 16 + Math.round((p.potencjal || 30) / 100 * 12);
    const op = evs || p.Status !== "kandydat" || p.rank >= 7 ? 1 : p.rank >= 5 ? 0.85 : 0.5;
    const bg = p.Status === "kandydat" ? (p.rank >= 7 ? "#1f4e79" : p.rank >= 5 ? "#4a6a8f" : "#8a94a6") : (STATUS_COLOR[p.Status] || "#8a94a6");
    const html = `<span class="zb-pin${evs ? " has-ev" : ""}${p.ndn ? " ndn" : ""}" style="background:${bg};opacity:${op};width:${size}px;height:${size}px">${p.rank}</span>`;
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "pin2", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] }),
      title: p.Nazwa, zIndexOffset: (p.rank || 0) * 10 + (evs ? 500 : 0) })
      .bindTooltip(`${escapeHtml(p.Nazwa)} · ${escapeHtml(p["Miejscowość"] || "")} · ranking ${p.rank}${evs ? " · " + escapeHtml(plDate(evs[0].Data)) : ""}`)
      .bindPopup(parPopup(p, evs), { maxWidth: 320 })
      .addTo(pLayer);
  });
  pLayer.addTo(pmap);
  if (!pFitted && el.offsetWidth > 0 && pLayer.getLayers().length) { pmap.fitBounds(pLayer.getBounds(), { padding: [10, 10], maxZoom: 11 }); pFitted = true; }
}
function renderParList() {
  const box = $("#zb-par-list");
  if (!box) return;
  const all = allParafie();
  const list = filteredParafie();
  const evMap = eventsByParafia();
  $("#zb-par-count").textContent = `${list.length} z ${all.length}`;
  drawMap(list, evMap);
  box.innerHTML = `<div class="table-scroll"><table class="sheet-table zb-table">
      <thead><tr><th class="num" title="Ranking wspólny 1–10 (+3 za wspólnoty neokatechumenalne)">Ranking</th><th>Parafia</th><th class="num" title="[szacunek] 60% liczba Mszy + 40% ceny m² w okolicy">Potencjał</th><th>Msze niedzielne</th><th>Status</th><th>Kontakt / uwagi</th><th>U nas</th><th></th></tr></thead>
      <tbody>${list.slice(0, st.parLimit).map((p) => `<tr>
        <td class="num"><strong>${p.rank}</strong>${p.ndn ? `<br><span class="chip">NDN</span>` : ""}</td>
        <td><strong>${escapeHtml(p.Nazwa)}</strong><br><span class="muted small">${escapeHtml(p["Miejscowość"] || "")} · ${escapeHtml(p.Dekanat || "")}${p.Diecezja !== "warszawska" ? " · " + escapeHtml(p.Diecezja) : ""}${p.odl != null ? ` · ${escapeHtml(String(p.odl).replace(".", ","))} km` : ""}</span>${p.Proboszcz ? `<br><span class="small">${escapeHtml(p.Proboszcz)}</span>` : ""}${p.Telefon ? `<br><span class="small">☎ ${escapeHtml(p.Telefon)}</span>` : ""}</td>
        <td class="num">${p.potencjal ?? "—"}${p.cena ? `<br><span class="muted small">${Math.round(p.cena / 100) / 10} tys./m²</span>` : ""}</td>
        <td class="small zb-msze">${escapeHtml(p["Msze niedzielne"] || "")}</td>
        <td><span class="chip" style="background:${STATUS_COLOR[p.Status] || "#8a94a6"};color:#fff">${escapeHtml(p.Status || "")}</span></td>
        <td class="small">${escapeHtml([p.Kontakt, p.Uwagi].filter(Boolean).join(" · "))}</td>
        <td class="small">${(evMap[p.ID] || []).map((w) => escapeHtml(plDate(w.Data))).join(", ")}</td>
        <td class="nowrap"><button type="button" class="btn-link" data-par="${escapeHtml(p.ID)}">szczegóły</button> · <button type="button" class="btn-link" data-parev="${escapeHtml(p.ID)}">zaplanuj</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">Brak parafii dla tego filtra.</td></tr>`}</tbody>
    </table></div>
    ${list.length > st.parLimit ? `<p><button type="button" class="btn" data-zb="more-par">Pokaż kolejne 100</button></p>` : ""}`;
}
function renderParafie() {
  const sec = $("#spiew-par");
  if (!sec) return;
  const show = st.loaded && st.rola === "org";
  sec.hidden = !show;
  if (!show) return;
  const f = $("#zb-par-filters");
  if (f && !f.dataset.ready) {
    f.dataset.ready = "1";
    f.innerHTML = `<input type="search" id="zb-pf-q" placeholder="Szukaj: nazwa, miejscowość, dekanat, ulica, proboszcz" />
      <select id="zb-pf-status"><option value="">wszystkie statusy</option>${STATUS_P.map((x) => `<option>${x}</option>`).join("")}</select>
      <select id="zb-pf-diec"><option value="">obie diecezje</option><option value="warszawska">warszawska</option><option value="warszawsko-praska">warszawsko-praska</option><option value="inna">inne</option></select>
      <select id="zb-pf-min"><option value="0">każdy ranking</option><option value="5">ranking 5+</option><option value="6">ranking 6+</option><option value="7">ranking 7+</option></select>
      <select id="zb-pf-sort"><option value="ranking">sortuj: ranking</option><option value="potencjal">sortuj: potencjał zbiórki</option><option value="odl">sortuj: najbliżej św. Zygmunta</option></select>
      <label class="zb-chk"><input type="checkbox" id="zb-pf-ndn" /> tylko ze wspólnotami NDN</label>
      <span class="muted small" id="zb-par-count"></span>`;
    const upd = () => {
      st.pf = { q: $("#zb-pf-q").value, status: $("#zb-pf-status").value, diec: $("#zb-pf-diec").value, ndn: $("#zb-pf-ndn").checked,
        min: Number($("#zb-pf-min").value), sort: $("#zb-pf-sort").value };
      st.parLimit = 60;
      renderParList();
    };
    f.addEventListener("input", upd); f.addEventListener("change", upd);
    const leg = $("#zb-map-legend");
    if (leg) leg.innerHTML = Object.entries(STATUS_COLOR).map(([k, c]) => `<span><span class="legend-pin sm" style="background:${c}"></span>${k}</span>`).join("")
      + `<span class="muted">kandydaci: ciemniej = wyższy ranking</span><span><span class="zb-pin has-ev legend" style="background:#4a6a8f">5</span>mamy termin</span><span><span class="zb-home">★</span>św. Zygmunta</span><span class="muted">liczba = ranking, wielkość = potencjał zbiórki</span>`;
    const m = $("#zb-par-meta");
    if (m && st.baseMeta) m.textContent = `${st.baseMeta.zrodlo || ""}. Ranking wspólny: ${st.baseMeta.ranking_wspolny || ""}; +3 za wspólnoty neokatechumenalne (wpisujecie sami w szczegółach parafii). Potencjał zbiórki: ${st.baseMeta.potencjal || ""}.`;
  }
  renderParList();
}



/* ---------- render: Zbiórka ---------- */
function renderZbiorka() {
  const root = $("#zbiorka-app");
  if (!root) return;
  if (!st.loaded) { root.innerHTML = banner(); return; }
  if (st.rola !== "org") { root.innerHTML = `<div class="zb-banner">Zbiórka i darczyńcy są widoczne tylko z kodem organizatorów.</div>`; return; }
  const L = ledger();
  const payers = st.cost && st.cost.payers ? st.cost.payers : 0;
  const perPayer = payers ? L.budzet / payers : 0;
  const osoby = (st.tabs.Osoby || []).slice();
  const rows = osoby.map((o) => { const p = L.per[o.ID] || {}; return { o, taca: p.taca || 0, dar: p.dar || 0, wyst: p.wyst || 0, razem: (p.taca || 0) + (p.dar || 0) }; })
    .sort((a, b) => b.razem - a.razem || (a.o["Imię i nazwisko"] || "").localeCompare(b.o["Imię i nazwisko"] || "", "pl"));
  const dar = st.tabs["Darczyńcy"] || [];
  const datki = (st.tabs.Datki || []).slice().sort((a, b) => isoDate(b.Data).localeCompare(isoDate(a.Data)));
  const sumBy = (id) => datki.filter((d) => d["Darczyńca ID"] === id && d.Status === "wpłynęło").reduce((s, d) => s + amount(d.Kwota), 0);
  const potencjal = dar.filter((d) => !["wpłacił", "odmowa"].includes(d.Etap)).reduce((s, d) => s + amount(d["Potencjał"]), 0);
  const price = st.cost && st.cost.total ? st.cost.total : 0;

  root.innerHTML = `${banner()}
    <div class="stat-grid">
      <article class="stat-card is-navy"><p class="lbl">Zebrane razem</p><p class="val">${zl(L.razem)}</p><p class="sub">taca ${zl(L.taca)} · darczyńcy ${zl(L.dar)}</p></article>
      <article class="stat-card"><p class="lbl">Budżet wspólny</p><p class="val">${zl(L.budzet)}</p><p class="sub">${payers ? `obniża cenę o ok. ${formatZl(perPayer, 0)} na płacącego (${payers} płacących)` : "obniża cenę wszystkim"}</p></article>
      <article class="stat-card"><p class="lbl">Na konta osób</p><p class="val">${zl(L.razem - L.budzet)}</p><p class="sub">odlicza się od rat tych osób</p></article>
      <article class="stat-card"><p class="lbl">W drodze</p><p class="val">${zl(L.obiecane)}</p><p class="sub">obiecane · potencjał lejka ${zl(potencjal)}</p></article>
    </div>
    ${price ? `<p class="zb-progress-label">Cena w bieżącym scenariuszu: <strong>${formatZl(price, 0)}</strong> na płacącego${perPayer ? ` → po odliczeniu budżetu wspólnego ok. <strong>${formatZl(price - perPayer, 0)}</strong>` : ""}.</p>` : ""}
    <div class="zb-toolbar">
      <button type="button" class="btn btn-gold" data-zb="new-dt">+ Datek</button>
      <button type="button" class="btn" data-zb="new-dar">+ Darczyńca</button>
      <button type="button" class="btn" data-zb="new-os">+ Osoba</button>
    </div>

    <h3>Lejek darczyńców</h3>
    <p class="muted">Lista osób i firm, do których podchodzimy z prośbą o wsparcie. Przeciągać nie trzeba — etap zmienia się w edycji, a „wpłacił” ustawia się sam po dopisaniu datku, który wpłynął.</p>
    <div class="zb-board">${ETAPY.map((e) => {
      const list = dar.filter((d) => (d.Etap || "do kontaktu") === e);
      return `<div class="zb-col"><div class="zb-col-head">${escapeHtml(e)} <span>${list.length}</span></div>${list.map((d) => `<button type="button" class="zb-dcard" data-dar="${escapeHtml(d.ID)}">
        <strong>${escapeHtml(d.Nazwa)}</strong>
        <span class="muted small">${escapeHtml([d.Typ, d.Prowadzi ? "prowadzi " + d.Prowadzi : ""].filter(Boolean).join(" · "))}</span>
        ${amount(d["Potencjał"]) ? `<span class="small">potencjał ${zl(amount(d["Potencjał"]))}</span>` : ""}
        ${sumBy(d.ID) ? `<span class="small ok-txt">wpłacił ${zl(sumBy(d.ID))}</span>` : ""}
        ${d["Następny krok"] ? `<span class="small">→ ${escapeHtml(d["Następny krok"])}${d.Termin ? ` (${escapeHtml(plDate(d.Termin))})` : ""}</span>` : ""}
      </button>`).join("")}</div>`;
    }).join("")}</div>

    <h3>Kto ile ma na wyjazd</h3>
    <p class="muted">Udział z tacy (rozliczone wydarzenia) i od darczyńców (datki imienne i grupowe, które wpłynęły). Budżet wspólny nie jest tu przypisany osobom — obniża cenę wszystkim.</p>
    <div class="table-scroll"><table class="sheet-table zb-table">
      <thead><tr><th>Osoba</th><th>Jedzie</th><th class="num">Wystąpienia</th><th class="num">Z tacy</th><th class="num">Od darczyńców</th><th class="num">Razem</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.o["Imię i nazwisko"])}${r.o["ID uczestnika"] ? ` <span class="muted small">${escapeHtml(r.o["ID uczestnika"])}</span>` : ""}</td><td>${yes(r.o["Jedzie do Seulu"]) ? "✓" : "—"}</td><td class="num">${r.wyst}</td><td class="num">${zl(r.taca)}</td><td class="num">${zl(r.dar)}</td><td class="num"><strong>${zl(r.razem)}</strong></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Brak osób.</td></tr>`}
      ${rows.length ? `<tr class="sum"><td>Razem na osoby</td><td></td><td></td><td class="num">${zl(rows.reduce((s, r) => s + r.taca, 0))}</td><td class="num">${zl(rows.reduce((s, r) => s + r.dar, 0))}</td><td class="num">${zl(rows.reduce((s, r) => s + r.razem, 0))}</td></tr>` : ""}</tbody>
    </table></div>

    <h3>Datki</h3>
    <div class="table-scroll"><table class="sheet-table zb-table">
      <thead><tr><th>Data</th><th>Darczyńca</th><th class="num">Kwota</th><th>Status</th><th>Przeznaczenie</th><th></th></tr></thead>
      <tbody>${datki.map((d) => `<tr><td>${escapeHtml(plDate(d.Data))}</td><td>${escapeHtml(d["Darczyńca"] || "anonimowo")}</td><td class="num">${zl(amount(d.Kwota))}</td><td>${escapeHtml(d.Status)}</td><td class="small">${d["Przeznaczenie"] === "budzet" ? "budżet wspólny" : escapeHtml(idsOf(d.Odbiorcy).map(osobaName).join(", "))}</td><td><button type="button" class="btn-link" data-dt="${escapeHtml(d.ID)}">edytuj</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Brak datków.</td></tr>`}</tbody>
    </table></div>`;
}

export function renderAll() { renderSpiew(); renderZbiorka(); zbListeners.forEach((f) => { try { f(); } catch (e) { console.warn(e); } }); }

/* ---------- zdarzenia ---------- */
function bind(root) {
  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-zb],[data-ev],[data-settle],[data-ics],[data-os],[data-par],[data-parev],[data-mon],[data-newday],[data-dar],[data-dt]");
    if (!t) return;
    const find = (tab, id) => (st.tabs[tab] || []).find((r) => r.ID === id);
    const d = t.dataset;
    if (d.zb === "login") { await askCred(true); await load(); return renderAll(); }
    if (d.zb === "new-ev") return editWydarzenie();
    if (d.zb === "new-os") return editOsoba();
    if (d.zb === "new-par") return editParafia();
    if (d.zb === "import") return importParafie();
    if (d.zb === "more-par") { st.parLimit += 100; return renderParList(); }
    if (d.zb === "new-dar") return editDarczynca();
    if (d.zb === "new-dt") return editDatek();
    if (d.zb === "ics-all") return downloadIcs((st.tabs.Wydarzenia || []).filter((w) => w.Status !== "odwołane" && isoDate(w.Data)), "sdm2027-spiew.ics");
    if (d.ev) return editWydarzenie(find("Wydarzenia", d.ev));
    if (d.settle) return settle(find("Wydarzenia", d.settle));
    if (d.ics) { const w = find("Wydarzenia", d.ics); return downloadIcs([w], `sdm2027-${isoDate(w.Data)}.ics`); }
    if (d.os) return editOsoba(find("Osoby", d.os));
    if (d.par) { if (pmap) pmap.closePopup(); return editParafia(findParafia(d.par)); }
    if (d.parev) { if (pmap) pmap.closePopup(); const p = findParafia(d.parev); return editWydarzenie({}, { Parafia: p.Nazwa, "Miejscowość": p["Miejscowość"], Diecezja: p.Diecezja || "warszawska" }); }
    if (d.dar) return editDarczynca(find("Darczyńcy", d.dar));
    if (d.dt) return editDatek(find("Datki", d.dt));
    if (d.mon) {
      const [y, m] = st.month.split("-").map(Number);
      const nd = new Date(y, m - 1 + Number(d.mon), 1);
      st.month = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}`;
      return renderSpiew();
    }
    if (d.newday && e.target === t || (d.newday && e.target.classList.contains("zb-dn"))) return editWydarzenie({}, { Data: d.newday });
  });
}

/** Wywołuje app.js po każdym przeliczeniu kosztu (do „obniża cenę o …”). */
export function setCostInfo(cost) { st.cost = cost; if (st.loaded && document.querySelector("#zbiorka:not([hidden])")) renderZbiorka(); }

let started = false;
export async function initZbiorka(url) {
  appUrl = String(url || "").trim();
  if (!started) {
    started = true;
    ["#spiew-app", "#zbiorka-app", "#spiew-par"].forEach((s) => { const el = $(s); if (el) bind(el); });
  }
  if (!st.base.length) {
    try {
      const j = await (await fetch("./data/parafie.json", { cache: "no-cache" })).json();
      st.base = j.parafie || []; st.baseMeta = j.meta || {}; parCache = null;
    } catch (_) { st.base = []; }
  }
  await load();
  renderAll();
}
