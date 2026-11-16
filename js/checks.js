/**
 * Kontrola zależności czasowych: czas pracy kierowców, przerwy między zmianami, kilometry,
 * zapas przed lotem/promem i okna na posiłki.
 * Dane: dni[].kierowcy, dni[].bufory, dni[].posilki w data/data.json (arkusz ich nie ma — dokładane z JSON-a).
 * Normy japońskie od 2024 r. (改善基準告示): praca do 13 h (max 15 h), przerwa min. 9 h (zalecane 11 h),
 * ok. 670 km dziennie na kierowcę, drugi kierowca powyżej ok. 500 km.
 */
import { $, escapeHtml, toMin, fmtH } from "./util.js";

export const RULES = {
  dutyWarn: 13 * 60,
  dutyMax: 15 * 60,
  restMin: 9 * 60,
  restGood: 11 * 60,
  kmPerDriver: 670,
  kmSecondDriver: 500,
  mealMin: 30,
};

const MEAL_OK_WITHOUT_TIME = ["samolot", "prom", "pakiet"];
const MEAL_NAMES = { sniadanie: "Śniadanie", obiad: "Obiad", kolacja: "Kolacja" };

function duty(k) {
  const s = toMin(k.start), e = toMin(k.koniec);
  if (s == null || e == null) return null;
  return { s, e: e <= s ? e + 1440 : e }; // koniec po północy
}

export function validateDays(days) {
  const byDay = {};
  const all = [];
  const add = (day, level, text) => {
    const item = { data: day.data, data_pl: day.data_pl, level, text };
    (byDay[day.data] = byDay[day.data] || []).push(item);
    all.push(item);
  };
  const sorted = [...days].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  let prev = null; // { day, k, d }
  sorted.forEach((day) => {
    const k = day.kierowcy;
    if (k) {
      const d = duty(k);
      if (d) {
        const len = d.e - d.s;
        const jp = (k.kraj || "jp") === "jp";
        if (jp && len > RULES.dutyMax) add(day, "bad", `Praca kierowcy ${fmtH(len)} (${k.start}–${k.koniec}) — powyżej 15 h.`);
        else if (jp && len > RULES.dutyWarn) add(day, "warn", `Praca kierowcy ${fmtH(len)} (${k.start}–${k.koniec}) — powyżej 13 h (dozwolone do 15 h tylko kilka razy w tygodniu).`);
        const n = Number(k.kierowcow) || 1;
        const km = Number(k.km) || 0;
        if (jp && km > RULES.kmPerDriver * n) add(day, "bad", `${km} km przy ${n} kierowcy — limit ok. ${RULES.kmPerDriver} km na kierowcę.`);
        else if (jp && n < 2 && km > RULES.kmSecondDriver) add(day, "warn", `${km} km przy jednym kierowcy — powyżej ok. 500 km zwykle wymagany drugi.`);
        if (prev && prev.k.zaloga && prev.k.zaloga === k.zaloga) {
          const gapDays = Math.round((Date.parse(day.data) - Date.parse(prev.day.data)) / 864e5);
          const rest = gapDays * 1440 + d.s - prev.d.e;
          if (rest < RULES.restMin) {
            const exc = Number(k.kierowcow) >= 2 && Number(prev.k.kierowcow) >= 2
              ? " Wyjątek „2 kierowców w pojeździe” pozwala skrócić przerwę do 5 h tylko przy spełnieniu warunków — potwierdzić u przewoźnika albo dać inną załogę."
              : "";
            add(day, "bad", `Przerwa kierowców ${fmtH(rest)} po ${prev.day.data_pl} (koniec ${prev.k.koniec}, start ${k.start}) — minimum 9 h.${exc}`);
          } else if (rest < RULES.restGood) {
            add(day, "warn", `Przerwa kierowców ${fmtH(rest)} — legalnie (≥ 9 h), ale poniżej zalecanych 11 h.`);
          }
        }
        if (k.uwaga) add(day, "info", k.uwaga);
        prev = { day, k, d };
      }
    }
    (day.bufory || []).forEach((b) => {
      const a = toMin(b.przyjazd), o = toMin(b.odjazd);
      if (a == null || o == null) return;
      const gap = o - a;
      const need = (Number(b.min_h) || 0) * 60;
      if (gap < need) add(day, "bad", `${b.co}: przyjazd ${b.przyjazd}, odjazd ${b.odjazd} — zapas ${fmtH(gap)}, potrzeba ${fmtH(need)}.`);
      else if (gap < need + 30) add(day, "warn", `${b.co}: zapas ${fmtH(gap)} — mało marginesu na korki.`);
    });
    const P = day.posilki;
    if (P) {
      Object.entries(MEAL_NAMES).forEach(([key, name]) => {
        const m = P[key];
        if (!m) { add(day, "warn", `${name}: brak planu posiłku.`); return; }
        if (MEAL_OK_WITHOUT_TIME.includes(m.jak)) return;
        if (m.jak !== "bento" && (Number(m.min) || 0) < RULES.mealMin) add(day, "warn", `${name} (${m.gdzie}): tylko ${m.min || 0} min — zamówić bento albo wydłużyć postój.`);
      });
    } else if (day.kraj && !/Polska/i.test(day.kraj)) {
      add(day, "warn", "Brak planu posiłków na ten dzień.");
    }
  });
  const count = (lvl) => all.filter((x) => x.level === lvl).length;
  return { byDay, all, bad: count("bad"), warn: count("warn") };
}

export function mealsHtml(day) {
  const P = day.posilki;
  if (!P) return "";
  const icon = { hotel: "hotel", bento: "bento", restauracja: "restauracja", samolot: "samolot", prom: "prom", pakiet: "pakiet ŚDM" };
  const cells = Object.entries(MEAL_NAMES).map(([key, name]) => {
    const m = P[key];
    if (!m) return `<li class="is-missing"><b>${name}</b> brak</li>`;
    const t = [m.od, m.min ? `${m.min} min` : ""].filter(Boolean).join(" · ");
    return `<li class="meal-${escapeHtml(m.jak || "")}"><b>${name}</b> ${escapeHtml(m.gdzie || "")}${t ? ` <span>${escapeHtml(t)}</span>` : ""} <em>${escapeHtml(icon[m.jak] || m.jak || "")}</em></li>`;
  }).join("");
  return `<ul class="meals">${cells}</ul>`;
}

export function dayChecksHtml(items) {
  const k = (items || []).filter((x) => x.level !== "info" || true);
  if (!k.length) return "";
  return `<ul class="day-checks">${k.map((x) => `<li class="is-${x.level}">${escapeHtml(x.text)}</li>`).join("")}</ul>`;
}

export function renderFlags(checks) {
  const targets = ["#flags-box", "#flags-box-log"];
  const list = checks.all.filter((x) => x.level !== "info");
  const html = `<h3>Kontrola harmonogramu <span class="flag-count is-bad">${checks.bad} krytyczne</span> <span class="flag-count is-warn">${checks.warn} do uwagi</span></h3>
    <p class="muted">Liczone automatycznie z godzin pracy kierowców, kilometrów, zapasów przed lotem/promem i okien na posiłki w danych dni. Normy japońskie z 2024 r.; dla Korei sprawdzane są tylko zapasy i posiłki.</p>
    ${list.length ? `<ul class="flag-list">${list.map((x) => `<li class="is-${x.level}"><b>${escapeHtml((x.data_pl || "").replace(".2027", ""))}</b> ${escapeHtml(x.text)}</li>`).join("")}</ul>` : `<p>Brak problemów.</p>`}`;
  targets.forEach((sel) => { const el = $(sel); if (el) el.innerHTML = html; });
}
