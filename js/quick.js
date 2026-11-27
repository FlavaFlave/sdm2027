/**
 * Szybki wybór: ścieżka A/B/C, kilka prostych podopcji, co waży w cenie i jak zejść do celu.
 * Renderuje się w każdym kontenerze [data-quick] (Przegląd i Decyzje).
 */
import { escapeHtml, formatZl } from "./util.js";

const PATHS = [
  { id: "A", name: "A — z Akitą", sub: "Iwaki → Akita → Matsushima → Nikkō → Yamanaka → Seul 5.08",
    kill: "Odpada, jeśli siostry nie zgodzą się na Mszę grupową 3.08 albo nie będzie 90 łóżek w Akita Training Center." },
  { id: "B", name: "B — bez Akity, Japonia", sub: "Iwaki → Matsushima → Tozanso pod Fuji → Yamanaka → Seul 5.08",
    kill: "Odpada, jeśli YMCA Tozanso nie da 90 miejsc na 4/5.08." },
  { id: "C", name: "C — do Korei już 3.08", sub: "Narita (1 noc) → Incheon 3.08 → 2 dni w Seulu przed ŚDM",
    kill: "Odpada, jeśli lot Narita–Incheon 3.08 dla ok. 90 osób kosztuje wyraźnie więcej niż Haneda–Gimpo." },
];

const SUBS = [
  { g: "przylot", label: "Lot do Seulu", when: (c) => c.petla !== "C" },
  { g: "noclegi_wschod", label: "Noclegi 2–4.08", when: (c) => c.petla !== "C" },
  { g: "fuji", label: "Wejście na Fuji", when: (c) => c.petla === "B" },
  { g: "nagasaki", label: "Nagasaki 12–17.08" },
  { g: "hotele_zachod", label: "Hiroszima i Osaka" },
  { g: "seul_stawka", label: "Noclegi w Korei poza pakietem" },
  { g: "kadra_lok", label: "Przewodnicy w Japonii" },
];

const short = (o) => o.krotko || String(o.opcja || o.opcja_id).split(" — ")[0].split(" (")[0].slice(0, 38);
const zl = (v) => formatZl(v, 0);
const sign = (d) => (d > 0 ? "+" : "−") + Math.abs(Math.round(d)).toLocaleString("pl-PL") + " zł";

let wired = false;
let cur = null;

export function renderQuick(ctx) {
  cur = ctx;
  const { groups, choices, baseChoices, cost, total, off, target, people, peopleDefault } = ctx;
  const G = Object.fromEntries(groups.map((g) => [g.id, g]));
  const gap = cost.total - target;

  // 1) Ścieżki z bieżącymi podopcjami.
  const pathCards = PATHS.map((p) => {
    const t = total({ ...choices, petla: p.id });
    const on = choices.petla === p.id;
    const g2 = t - target;
    return `<button type="button" class="q-path${on ? " is-on" : ""}" data-q-g="petla" data-q-o="${p.id}" aria-pressed="${on}">
      <span class="q-path-name">${escapeHtml(p.name)}</span>
      <span class="q-path-price">${zl(t)}</span>
      <span class="q-path-gap ${g2 > 0 ? "is-up" : "is-ok"}">${g2 > 0 ? "ponad cel o " + zl(g2) : "w celu, zapas " + zl(-g2)}</span>
      <span class="q-path-sub">${escapeHtml(p.sub)}</span>
      <span class="q-path-kill"><b>Kryterium:</b> ${escapeHtml(p.kill)}</span>
    </button>`;
  }).join("");

  // 2) Proste podopcje z różnicą ceny.
  const subs = SUBS.filter((s) => G[s.g] && !off[s.g] && (!s.when || s.when(choices))).map((s) => {
    const g = G[s.g];
    const btns = g.opcje.map((o) => {
      const on = choices[s.g] === o.opcja_id;
      const d = on ? 0 : total({ ...choices, [s.g]: o.opcja_id }) - cost.total;
      const def = baseChoices[s.g] === o.opcja_id;
      return `<button type="button" class="q-opt${on ? " is-on" : ""}" data-q-g="${escapeHtml(s.g)}" data-q-o="${escapeHtml(o.opcja_id)}" aria-pressed="${on}">
        ${escapeHtml(short(o))}${def ? ' <span class="q-def" title="opcja planu wyjściowego">●</span>' : ""}
        <small>${on ? "wybrane" : Math.abs(d) < 5 ? "bez zmiany ceny" : sign(d)}</small></button>`;
    }).join("");
    return `<div class="q-sub"><span class="q-sub-label">${escapeHtml(s.label)}</span><div class="q-opts">${btns}</div></div>`;
  }).join("");

  // 3) Odstępstwa od planu wyjściowego — tu widać, skąd bierze się cena ponad cel.
  const devs = groups.filter((g) => !off[g.id] && g.id !== "petla" && choices[g.id] !== baseChoices[g.id]).map((g) => {
    const o = g.opcje.find((x) => x.opcja_id === choices[g.id]);
    const d = cost.total - total({ ...choices, [g.id]: baseChoices[g.id] });
    return { g, o, d };
  }).sort((a, b) => b.d - a.d);
  const pDevs = [];
  if (people.n !== peopleDefault.n) pDevs.push(`${people.n} osób zamiast ${peopleDefault.n}`);
  if (people.gratis) pDevs.push(`${people.gratis} os. gratis (ich koszt dzielą płacący)`);
  const devHtml = devs.length || pDevs.length
    ? `<ul class="q-devs">${devs.map(({ g, o, d }) => `<li><span>${escapeHtml(g.nazwa)}: <b>${escapeHtml(o ? short(o) : choices[g.id])}</b></span>
        <span class="${d > 0 ? "diff-up" : "diff-down"}">${Math.abs(d) < 5 ? "0 zł" : sign(d)}</span>
        <button type="button" class="btn-link" data-q-g="${escapeHtml(g.id)}" data-q-o="${escapeHtml(baseChoices[g.id])}">przywróć</button></li>`).join("")}
        ${pDevs.map((t) => `<li><span>Osoby: <b>${escapeHtml(t)}</b></span><span></span><button type="button" class="btn-link" data-q-people="reset">przywróć</button></li>`).join("")}</ul>
       <button type="button" class="btn btn-gold" data-q-reset="1">Wróć do planu wyjściowego (zostaw ścieżkę ${escapeHtml(choices.petla)})</button>`
    : `<p class="small muted">Brak. Oglądasz plan wyjściowy dla ścieżki ${escapeHtml(choices.petla)}.</p>`;

  // 4) Co waży w cenie: największe pozycje na płacącego + które różnią się między ścieżkami.
  const perPath = Object.fromEntries(PATHS.map((p) => [p.id, ctx.lines({ ...choices, petla: p.id })]));
  const lines = cost.lines.filter((l) => l.perOs > 1).sort((a, b) => b.perOs - a.perOs);
  const top = lines.slice(0, 9);
  const max = top.length ? top[0].perOs : 1;
  const tag = (l) => /fakt|oferta|kupione|potwierdz/i.test(l.status || "") ? "fakt" : "szacunek";
  const drivers = top.map((l) => {
    const vals = PATHS.map((p) => (perPath[p.id][l.id] || 0));
    const varies = Math.max(...vals) - Math.min(...vals) > 20;
    return `<li><span class="q-bar-label">${escapeHtml(l.pozycja)} <em class="q-tag q-tag-${tag(l)}">${tag(l)}</em>${varies ? ` <em class="q-tag q-tag-var" title="A / B / C">A ${Math.round(vals[0])} · B ${Math.round(vals[1])} · C ${Math.round(vals[2])}</em>` : ""}</span>
      <span class="q-bar"><i style="width:${Math.max(3, (l.perOs / max) * 100).toFixed(1)}%"></i></span><span class="q-bar-val">${zl(l.perOs)}</span></li>`;
  }).join("");
  const restSum = lines.slice(9).reduce((a, l) => a + l.perOs, 0);

  // 5) Oszczędności: tańsze opcje, których nie wybrano (od największej).
  const tips = [];
  groups.forEach((g) => {
    if (off[g.id] || ["petla", "sen", "przylot"].includes(g.id)) return;
    let best = null;
    g.opcje.forEach((o) => {
      if (o.opcja_id === choices[g.id]) return;
      const d = total({ ...choices, [g.id]: o.opcja_id }) - cost.total;
      if (d < -20 && (!best || d < best.d)) best = { g, o, d };
    });
    if (best) tips.push(best);
  });
  tips.sort((a, b) => a.d - b.d);
  const tipHtml = tips.length ? `<ol class="q-tips">${tips.slice(0, 6).map((t) => `<li><button type="button" class="btn-link" data-q-g="${escapeHtml(t.g.id)}" data-q-o="${escapeHtml(t.o.opcja_id)}">${escapeHtml(t.g.nazwa)}: ${escapeHtml(String(t.o.opcja || "").split(" (")[0])}</button> <strong class="diff-down">${sign(t.d)}</strong>${t.o.minusy ? `<br><span class="small muted">Koszt: ${escapeHtml(String(t.o.minusy).slice(0, 140))}</span>` : ""}</li>`).join("")}</ol>`
    : `<p class="small muted">Wszystkie podopcje są już na najtańszym wariancie.</p>`;

  const html = `
    <div class="q-head">
      <div><p class="kicker">Szybki wybór</p><h3>Którą drogą jedziemy i ile to kosztuje</h3></div>
      <div class="q-now ${gap > 0 ? "is-up" : "is-ok"}"><span>teraz</span><b>${zl(cost.total)}</b><span>${gap > 0 ? "ponad cel " + zl(target) + " o " + zl(gap) : "cel " + zl(target) + ", zapas " + zl(-gap)}</span></div>
    </div>
    <div class="q-paths">${pathCards}</div>
    <div class="q-grid">
      <div class="q-col"><h4>Podopcje <span class="small muted">(● = plan wyjściowy)</span></h4>${subs}</div>
      <div class="q-col">
        <h4>Co podnosi cenę ponad plan wyjściowy</h4>${devHtml}
        <h4>Jak jeszcze oszczędzić</h4>${tipHtml}
      </div>
    </div>
    <details class="q-drivers" open><summary>Co waży w cenie — ścieżka ${escapeHtml(choices.petla)}, zł na płacącego</summary>
      <ul class="q-bars">${drivers}</ul>
      <p class="small muted">Pozostałe pozycje razem: ${zl(restSum)} · rezerwa ${cost.reservePct}%: ${zl(cost.reserve)}. Szare etykiety A · B · C pokazują pozycje, które różnią się między ścieżkami. „fakt” = oferta lub kupione, „szacunek” = do potwierdzenia.</p>
    </details>`;
  document.querySelectorAll("[data-quick]").forEach((el) => { el.innerHTML = html; });

  if (!wired) {
    wired = true;
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-q-g],[data-q-reset],[data-q-people]");
      if (!b || !b.closest("[data-quick]")) return;
      if (b.dataset.qReset) cur.onReset();
      else if (b.dataset.qPeople) cur.onPeopleReset();
      else cur.onPick(b.dataset.qG, b.dataset.qO);
    });
  }
}
