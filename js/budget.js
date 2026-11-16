/**
 * Zakładka „Budżet i wpłaty”.
 * Kwoty rat liczą się od aktualnego scenariusza (ten sam silnik co Decyzje).
 * Status wpłat na stronie publicznej jest wyłącznie zbiorczy: liczba, suma, brakująca kwota, procent.
 * Nazwiska i wpłaty imienne są w prywatnym panelu (meta.privatePanelUrl).
 */
import { $, escapeHtml, formatZl, num, todayISO } from "./util.js";
import { splitInstalments } from "./cost.js";

const CHART_COLORS = ["#1f4e79", "#8b2a32", "#c6a15b", "#1e4d5e", "#7c1e2e", "#2c6e49", "#9a5b12", "#4a3f6b", "#3d5a40", "#6b4f31", "#101929"];
let budgetChart;

function groupForChart(cost) {
  const acc = {};
  cost.lines.forEach((l) => {
    if (Math.abs(l.perOs) < 0.005) return;
    acc[l.grupa] = (acc[l.grupa] || 0) + l.perOs;
  });
  if (cost.reserve) acc["Rezerwa"] = (acc["Rezerwa"] || 0) + cost.reserve;
  return Object.entries(acc).sort((a, b) => b[1] - a[1]);
}

function renderBudgetChart(cost) {
  const canvas = $("#budget-chart");
  if (!canvas || typeof Chart === "undefined") return;
  const rows = groupForChart(cost);
  if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
  budgetChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: rows.map((r) => r[0]),
      datasets: [{
        data: rows.map((r) => Math.round(r[1] * 100) / 100),
        backgroundColor: CHART_COLORS.slice(0, rows.length),
        borderColor: "#fff",
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { position: "right", labels: { font: { family: "Lato", size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${formatZl(ctx.parsed)}` } },
      },
    },
  });
}

export function resizeBudgetChart() {
  if (budgetChart) budgetChart.resize();
}


function privatePanelUrl(data) {
  const fromMeta = data && data.meta && String(data.meta.privatePanelUrl || "").trim();
  const fromRoot = data && String(data.privatePanelUrl || "").trim();
  return fromMeta || fromRoot || "";
}

function renderParticipantsTab(data) {
  const card = $("#ucz-panel-card");
  if (card) {
    const url = privatePanelUrl(data);
    const priv = (data && data.meta && data.meta.private_sheet_url) || PRIVATE_SHEET;
    card.innerHTML = `<h3>Lista jadących — panel prywatny</h3>
      ${url ? `<p>Otwiera się w nowej karcie po zalogowaniu na konto Google z dostępem do prywatnego arkusza.</p><a class="btn btn-gold" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Otwórz listę jadących</a>`
            : `<p>Panel nie jest jeszcze wdrożony w prywatnym arkuszu. Po wdrożeniu (apps-script/INSTRUKCJA.md) wpisz jego adres w <code>data.json → meta.privatePanelUrl</code>.</p>`}
      <a class="btn" href="${escapeHtml((data.meta && data.meta.lista_url) || priv)}" target="_blank" rel="noopener">Otwórz listę Seul 27 (edycja)</a>
      <a class="btn" href="${escapeHtml(priv)}" target="_blank" rel="noopener">Otwórz prywatny arkusz wpłat</a>`;
  }
  const snap = $("#ucz-snapshot");
  const s = data && data.meta && data.meta.lista_snapshot;
  if (snap && s) {
    snap.innerHTML = `<h3>Stan listy z ${escapeHtml(s.data)} (tylko liczby)</h3>
      <div class="people-summary">
        <span>zapisanych: <strong>${s.zapisanych}</strong></span>
        <span>lista główna: <strong>${s.glowna}</strong> (z numerem ${s.z_numerem}, rezygnacje ${s.rezygnacje})</span>
        <span>bez numeru (rezerwowa / do potwierdzenia): <strong>${s.bez_numeru}</strong></span>
        <span>niepełnoletni na liście głównej: <strong>${s.niepelnoletni_glowna}</strong>, bez podanego wieku: ${s.bez_wieku_glowna}</span>
      </div>
      <p class="muted">Główna lista ${s.glowna} + ${s.bez_numeru} bez numeru = ${s.glowna + s.bez_numeru} osób przy pułapie 90. Aktualne liczby są w panelu prywatnym.</p>`;
  }
}

function renderPrivatePanelCard(data) {
  renderParticipantsTab(data);
  const el = $("#private-panel-card");
  if (!el) return;
  const url = privatePanelUrl(data);
  if (url) {
    el.innerHTML = `
      <h3>Dane uczestników i wpłaty imienne</h3>
      <p>Panel tylko dla organizatorów. Otwiera się po zalogowaniu na konto Google, któremu udostępniono prywatny arkusz — nazwiska i kwoty imienne nie są zapisane na tej stronie.</p>
      <a class="btn btn-gold" id="btn-private-panel" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Otwórz panel organizatorów</a>`;
  } else {
    el.innerHTML = `
      <h3>Dane uczestników i wpłaty imienne (tylko organizatorzy)</h3>
      <p>Adres panelu pojawi się tutaj po wdrożeniu skryptu w prywatnym arkuszu (zob. <code>apps-script/INSTRUKCJA.md</code>). Wpisz URL w karcie Ustawienia publicznego arkusza, pole <code>privatePanelUrl</code>, albo w <code>data/data.json</code>.</p>
      <button type="button" class="btn" id="btn-private-panel" disabled aria-disabled="true">Panel jeszcze niepodłączony</button>`;
  }
}


const PUBLIC_SHEET = "https://docs.google.com/spreadsheets/d/1ZSGVRJc9BMXGkoJjPAwyjnynXTRn42LsPZhB-l0MGvs/edit";
const PRIVATE_SHEET = "https://docs.google.com/spreadsheets/d/1yTlwsYqsuSs5nvESWlcCOPF_yIC-4dyoUllngWTmjuo/edit";

function renderBudgetSheetLinks(data) {
  const el = $("#budget-sheet-links");
  if (!el) return;
  const pub = (data && data.meta && data.meta.spreadsheet_url) || PUBLIC_SHEET;
  const priv = (data && data.meta && data.meta.private_sheet_url) || PRIVATE_SHEET;
  const live = !!(data && data.meta && data.meta.sheetLive);
  const status = live
    ? `<span class="save-mode is-live">Strona czyta arkusz</span> Kwoty, raty i sumy wpłat poniżej pochodzą z arkusza (${escapeHtml(data.meta.source || "")}). Po zmianie w arkuszu wystarczy odświeżyć stronę.`
    : `<span class="save-mode is-local">Strona nie czyta jeszcze arkusza</span> Liczby poniżej są z kopii w pliku data.json. Żeby strona pobierała kwoty z arkusza, wybierz jedno: (1) podłącz skrypt zapisu — arkusz zostaje prywatny (apps-script/INSTRUKCJA-zapis.md), albo (2) w arkuszu kliknij Udostępnij → „Każda osoba mająca link” → Przeglądający (w tym arkuszu nie ma danych osobowych).`;
  el.innerHTML = `
    <div class="sheet-status">${status}</div>
    <a class="sheet-link-card" href="${escapeHtml(pub)}" target="_blank" rel="noopener">
      <h3>Tu wpisujesz kwoty: arkusz kosztów, rat i wpłat zbiorczych</h3>
      <p>Karta <strong>Koszty</strong> — stawki pozycji budżetu (kolumna Kwota). Karta <strong>Wpłaty</strong> — dla każdej raty: liczba osób, które wpłaciły, suma, która wpłynęła, i „Kwota zamrożona (zł/os.)” po wysłaniu raty rodzicom. Karta <strong>Decyzje</strong> — kolumna „Wybrana”. Bez nazwisk uczestników.</p>
      <span class="btn btn-gold">Otwórz arkusz kosztów i wpłat</span>
    </a>
    <a class="sheet-link-card is-private" href="${escapeHtml(priv)}" target="_blank" rel="noopener">
      <h3>Arkusz prywatny — wpłaty imienne i dane uczestników</h3>
      <p>Kto ile wpłacił (imiennie albo od darczyńcy) i dane uczestników. Otwiera się tylko osobom, którym go udostępniono. Strona nie pobiera z niego nazwisk ani kwot imiennych.</p>
      <span class="btn">Otwórz prywatny arkusz wpłat</span>
    </a>`;
}

export function renderBudget(data, cost) {
  renderPrivatePanelCard(data);
  renderBudgetSheetLinks(data);
  const W = data.wplaty || {};
  const raty = splitInstalments(cost.total, W.raty || [], cost.payers);
  const platnicy = cost.payers;

  // Status zbiorczy — puste komórki oznaczają „do uzupełnienia”, nie zero.
  let anyStatus = false;
  let sumaWplynela = 0;
  let liczbaWiadoma = 0;
  raty.forEach((r) => {
    const s = num(r.suma_wplynela);
    const n = num(r.liczba_wplaconych);
    if (s != null) { anyStatus = true; sumaWplynela += s; }
    if (n != null) { anyStatus = true; liczbaWiadoma += n; }
  });
  const naleznosc = cost.group;
  const brakuje = anyStatus ? Math.max(0, naleznosc - sumaWplynela) : null;
  const pct = anyStatus && naleznosc ? (sumaWplynela / naleznosc) * 100 : null;

  const stats = $("#budget-stats");
  if (stats) {
    stats.innerHTML = `
      <article class="stat-card is-navy">
        <p class="lbl">${cost.gratis ? "Cena na płacącego" : "Cena na osobę"}</p>
        <p class="val">${formatZl(cost.total)}</p>
        <p class="sub">aktualny scenariusz · program główny</p>
      </article>
      <article class="stat-card">
        <p class="lbl">Na grupę (${cost.n} os., ${platnicy} płacących)</p>
        <p class="val">${formatZl(cost.group)}</p>
        <p class="sub">${cost.fujiN ? "bez modułu Fuji (+ " + formatZl(cost.fujiAdd, 0) + ")" : "bez dopłat spoza programu"}</p>
      </article>
      <article class="stat-card ${anyStatus ? "" : "is-empty"}">
        <p class="lbl">Wpłynęło (zbiorczo)</p>
        <p class="val">${anyStatus ? formatZl(sumaWplynela) : "do uzupełnienia"}</p>
        <p class="sub">${anyStatus ? (pct != null ? pct.toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + "% zebrane" : "") : "brak potwierdzonej sumy"}</p>
      </article>
      <article class="stat-card ${anyStatus ? "" : "is-empty"}">
        <p class="lbl">Brakuje</p>
        <p class="val">${anyStatus ? formatZl(brakuje) : "do uzupełnienia"}</p>
        <p class="sub">należność grupy − suma wpłat</p>
      </article>`;
  }

  const note = $("#budget-status-note");
  if (note) {
    note.hidden = false;
    const today = todayISO();
    const late = raty.filter((r) => !r.zamrozona && r.termin && r.termin <= today);
    const soon = raty.filter((r) => !r.zamrozona && r.termin && r.termin > today && (Date.parse(r.termin) - Date.parse(today)) / 864e5 <= 30);
    const extra = [];
    if (late.length) extra.push(`Po terminie, a kwota nie jest zamrożona: ${late.map((r) => r.rata).join(", ")}. Wpisz kwotę wysłaną rodzicom w kolumnie „Kwota zamrożona (zł/os.)”.`);
    if (soon.length) extra.push(`Termin w ciągu 30 dni: ${soon.map((r) => `${r.rata} (${r.termin})`).join(", ")}. Zanim wyślesz kwotę rodzicom, zamroź ją — inaczej zmieni się przy każdej zmianie scenariusza.`);
    note.innerHTML = escapeHtml(W.uwaga_status || "Status wpłat do uzupełnienia przez organizatorów w karcie Wpłaty arkusza. Tylko liczby zbiorcze, bez nazwisk.")
      + (extra.length ? `<br><strong>${extra.map(escapeHtml).join("<br>")}</strong>` : "");
  }

  const inst = $("#instalment-table");
  if (inst) {
    const body = raty.map((r) => {
      const nPaid = num(r.liczba_wplaconych);
      const sum = num(r.suma_wplynela);
      const has = nPaid != null || sum != null;
      const pctRow = has && r.kwotaGrupa ? Math.min(100, ((sum || 0) / r.kwotaGrupa) * 100) : 0;
      const status = has
        ? `${nPaid != null ? nPaid + " os." : "—"}${sum != null ? " · " + formatZl(sum) : ""}`
        : "do uzupełnienia";
      return `<tr>
        <td><strong>${escapeHtml(r.rata)}</strong><div class="src">${escapeHtml(r.przeznaczenie || "")}</div></td>
        <td>${escapeHtml(r.termin_zrodlo || "")}<div class="src">termin roboczy ${escapeHtml(r.termin || "")}</div></td>
        <td class="num">${r.zamrozona ? `${r.udzialEfektywny.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%<div class="src">zamrożona</div>` : `${r.udzial}%`}</td>
        <td class="num">${formatZl(r.kwotaOs)}${r.zamrozona ? " 🔒" : ""}<div class="src">grupa: ${formatZl(r.kwotaGrupa)}</div></td>
        <td>${escapeHtml(status)}${has ? `<span class="bar" aria-hidden="true"><i style="width:${pctRow}%"></i></span>` : ""}</td>
      </tr>`;
    }).join("");
    inst.innerHTML = `<thead><tr><th>Rata</th><th>Termin</th><th>Udział</th><th>Kwota / os. i grupa</th><th>Wpłynęło (zbiorczo)</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Razem</td><td></td><td class="num">100%</td><td class="num">${formatZl(cost.total)} / ${formatZl(cost.group)}</td><td>${anyStatus ? formatZl(sumaWplynela) : "do uzupełnienia"}</td></tr></tfoot>`;
  }

  const instNote = $("#instalment-note");
  if (instNote) {
    instNote.innerHTML = `${escapeHtml(W.zrodlo || "")} ${escapeHtml(W.uwaga_platnicy || "")} ${escapeHtml(W.uwaga_zamrozenie || "")}`;
  }

  const acc = $("#account-card");
  if (acc && W.konto) {
    acc.innerHTML = `<h3>Konto do wpłat</h3>
      <dl>
        <dt>Odbiorca</dt><dd>${escapeHtml(W.konto.nazwa)}</dd>
        <dt>Numer rachunku</dt><dd class="iban">${escapeHtml(W.konto.iban)}</dd>
        <dt>Tytuł przelewu</dt><dd>${escapeHtml(W.konto.tytul)}</dd>
      </dl>
      <p class="muted" style="margin:10px 0 0">${escapeHtml(W.konto.uwaga || "")}</p>`;
  }

  const table = $("#budget-full-table");
  if (table) {
    const body = cost.lines.map((l) => `<tr>
      <td>${escapeHtml(l.pozycja)}<div class="src">${escapeHtml(l.zrodlo || "")}${l.status ? " · " + escapeHtml(l.status) : ""}</div></td>
      <td>${escapeHtml(l.grupa)}</td>
      <td class="num">${formatZl(l.perOs)}</td>
      <td class="num">${formatZl(l.group)}</td>
    </tr>`).join("");
    table.innerHTML = `<thead><tr><th>Pozycja i źródło / założenie</th><th>Grupa</th><th>Zł / płacącego</th><th>Zł / grupa (${cost.n} os.)</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td>Koszty bezpośrednie</td><td></td><td class="num">${formatZl(cost.direct)}</td><td class="num">${formatZl(cost.direct * cost.payers)}</td></tr>
        <tr><td>Rezerwa ${cost.reservePct}% (od pozycji nieopłaconych i walutowych)</td><td>Rezerwa</td><td class="num">${formatZl(cost.reserve)}</td><td class="num">${formatZl(cost.reserve * cost.payers)}</td></tr>
        <tr><td>Razem program główny</td><td></td><td class="num">${formatZl(cost.total)}</td><td class="num">${formatZl(cost.group)}</td></tr>
        ${cost.fujiN ? `<tr><td>Moduł Fuji (${cost.fujiN} os.)</td><td></td><td class="num">+ ${formatZl(cost.fujiPer, 0)} / wchodzący</td><td class="num">${formatZl(cost.fujiAdd)}</td></tr>` : ""}
      </tfoot>`;
  }
  renderBudgetChart(cost);
}

