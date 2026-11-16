/**
 * Zakładka „Budżet i wpłaty”.
 * Kwoty rat liczą się od aktualnego scenariusza (ten sam silnik co Decyzje).
 * Status wpłat na stronie publicznej jest wyłącznie zbiorczy: liczba, suma, brakująca kwota, procent.
 * Nazwiska i wpłaty imienne są w prywatnym panelu (meta.privatePanelUrl).
 */
import { $, escapeHtml, formatZl, num, N_GROUP, FUJI_PER } from "./util.js";
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
        legend: { position: "right", labels: { font: { family: "Source Sans 3", size: 12 } } },
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

function renderPrivatePanelCard(data) {
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


const PUBLIC_SHEET = "https://docs.google.com/spreadsheets/d/1pPyeqUDNG9FYh20ugTrgIyqD6E6Mq5GiAqUtoEahHVE/edit";
const PRIVATE_SHEET = "https://docs.google.com/spreadsheets/d/1WSchAIbuUpfZtqEY6Xd8Mvj_-Ap8-ckFXx0AgttHpKo/edit";

function renderBudgetSheetLinks(data) {
  const el = $("#budget-sheet-links");
  if (!el) return;
  const pub = (data && data.meta && data.meta.spreadsheet_url) || PUBLIC_SHEET;
  const priv = (data && data.meta && data.meta.private_sheet_url) || PRIVATE_SHEET;
  el.innerHTML = `
    <a class="sheet-link-card" href="${escapeHtml(pub)}" target="_blank" rel="noopener">
      <h3>Arkusz publiczny — koszty, raty, zbiorcze wpłaty</h3>
      <p>Tu organizatorzy wpisują stawki, harmonogram rat i sumy zbiorcze. Gdy arkusz jest opublikowany jako CSV, strona pobiera stąd te liczby (inaczej korzysta z kopii w data.json). Bez nazwisk uczestników.</p>
      <span class="btn btn-gold">Otwórz arkusz kosztów</span>
    </a>
    <a class="sheet-link-card is-private" href="${escapeHtml(priv)}" target="_blank" rel="noopener">
      <h3>Arkusz prywatny — wpłaty imienne i uczestnicy</h3>
      <p>Tu wpisuje się, kto ile wpłacił (wpłata imienna albo ogólna od darczyńcy) oraz dane uczestników. Arkusz otworzy się tylko osobom, którym go udostępniono. Publiczna strona nie pobiera stąd nazwisk ani kwot imiennych — te widać w panelu organizatorów.</p>
      <span class="btn">Otwórz prywatny arkusz wpłat</span>
    </a>`;
}

export function renderBudget(data, cost) {
  renderPrivatePanelCard(data);
  renderBudgetSheetLinks(data);
  const W = data.wplaty || {};
  const raty = splitInstalments(cost.total, W.raty || []);
  const platnicy = W.platnicy || N_GROUP;

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
        <p class="lbl">Cena na osobę</p>
        <p class="val">${formatZl(cost.total)}</p>
        <p class="sub">aktualny scenariusz · program główny</p>
      </article>
      <article class="stat-card">
        <p class="lbl">Na grupę (${platnicy} os.)</p>
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
    note.innerHTML = escapeHtml(W.uwaga_status || "Status wpłat do uzupełnienia przez organizatorów w karcie Wpłaty arkusza. Tylko liczby zbiorcze, bez nazwisk.");
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
        <td class="num">${r.udzial}%</td>
        <td class="num">${formatZl(r.kwotaOs)}<div class="src">grupa: ${formatZl(r.kwotaGrupa)}</div></td>
        <td>${escapeHtml(status)}${has ? `<span class="bar" aria-hidden="true"><i style="width:${pctRow}%"></i></span>` : ""}</td>
      </tr>`;
    }).join("");
    inst.innerHTML = `<thead><tr><th>Rata</th><th>Termin</th><th>Udział</th><th>Kwota / os. i grupa</th><th>Wpłynęło (zbiorczo)</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Razem</td><td></td><td class="num">100%</td><td class="num">${formatZl(cost.total)} / ${formatZl(cost.group)}</td><td>${anyStatus ? formatZl(sumaWplynela) : "do uzupełnienia"}</td></tr></tfoot>`;
  }

  const instNote = $("#instalment-note");
  if (instNote) {
    instNote.innerHTML = `${escapeHtml(W.zrodlo || "")} ${escapeHtml(W.uwaga_platnicy || "")}`;
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
    table.innerHTML = `<thead><tr><th>Pozycja i źródło / założenie</th><th>Grupa</th><th>Zł / os.</th><th>Zł / ${N_GROUP} os.</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td>Koszty bezpośrednie</td><td></td><td class="num">${formatZl(cost.direct)}</td><td class="num">${formatZl(cost.direct * N_GROUP)}</td></tr>
        <tr><td>Rezerwa ${cost.reservePct}%</td><td>Rezerwa</td><td class="num">${formatZl(cost.reserve)}</td><td class="num">${formatZl(cost.reserve * N_GROUP)}</td></tr>
        <tr><td>Razem program główny</td><td></td><td class="num">${formatZl(cost.total)}</td><td class="num">${formatZl(cost.group)}</td></tr>
        ${cost.fujiN ? `<tr><td>Moduł Fuji (${cost.fujiN} os.)</td><td></td><td class="num">+ ${formatZl(FUJI_PER, 0)} / wchodzący</td><td class="num">${formatZl(cost.fujiAdd)}</td></tr>` : ""}
      </tfoot>`;
  }
  renderBudgetChart(cost);
}

