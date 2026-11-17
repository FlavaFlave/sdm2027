/**
 * Strona dla jadących (pielgrzym.html).
 * Plan: ten sam data/data.json co strona organizatorów + opcje zatwierdzone w arkuszu,
 * pobierane ze skryptu organizatorów (?action=plan) — strona nie zna adresu arkusza z kosztami.
 * Bez kosztów, kierowców, decyzji i danych osobowych.
 */
import { $, escapeHtml } from "./util.js";
import { groupDecisions, defaultChoices, normalizeChoices, activeEffects, applyDays } from "./cost.js";
import { setDetailState, openDay } from "./details.js";
import { tileHtml, bestPhoto } from "./tiles.js";
import { icon } from "./icons.js";

const START = new Date("2027-08-01T00:00:00+02:00");

/* ——— Najważniejsze ——— */
const TOP = [
  ["passport", "Paszport zawsze przy sobie", "W Japonii turysta musi mieć przy sobie oryginał paszportu — za brak grozi grzywna. Kopia w telefonie, druga u rodziców."],
  ["pair", "Nigdy sam", "Zawsze w parach albo trójkach. Na każdy dzień jest punkt zbiórki i godzina kontrolna. Zgubiłeś się? Zostań tam, gdzie ostatnio widziałeś grupę, i dzwoń do opiekuna."],
  ["sos", "Numery alarmowe", "Japonia: 110 policja, 119 karetka/straż. Korea: 112 policja, 119 karetka/straż, 1330 infolinia z tłumaczem. Wszystko na karcie awaryjnej niżej."],
  ["sun", "Upał jest groźny", "Sierpień to 30–35°C i duża wilgotność. Pij wodę i elektrolity, noś czapkę, odpoczywaj w cieniu. Zawroty, nudności, splątanie — od razu mów opiekunowi."],
  ["quake", "Trzęsienie ziemi", "Chroń głowę, schowaj się pod stół, z dala od okien, nie wybiegaj w trakcie i nie używaj windy. Nad morzem po silnym wstrząsie — od razu pieszo na wzniesienie. Zainstaluj aplikację Safety tips."],
  ["crowd", "Tłum na ŚDM", "Znaj wyjścia i punkt zbiórki. Gdy robi się ciasno — wychodź na otwartą przestrzeń. W ścisku ręce skrzyżowane na klatce piersiowej."],
  ["nomeat", "Zero wędlin w bagażu", "Nie wolno wwozić mięsa ani wędlin — kabanosów też. W Korei kara do 10 mln wonów (ok. 30 tys. zł), bo w Polsce jest ASF."],
  ["med", "Leki z zaświadczeniem", "Leki stałe w oryginalnych opakowaniach, z zaświadczeniem po angielsku. Nie zabieraj leków z pseudoefedryną (część leków na katar) ani z kodeiną — w Japonii są zakazane."],
  ["noalc", "Alkohol i papierosy — nie", "W Japonii od 20 lat, w Korei od 19. Na naszej pielgrzymce niepełnoletni — całkowity zakaz. Narkotyki i „CBD” to więzienie."],
  ["camera", "Zdjęcia z szacunkiem", "Ludzi, zwłaszcza dzieci, fotografuj tylko za zgodą. W kościołach ukrytych chrześcijan nie fotografuje się wnętrz. W Hiroszimie i Nagasaki — cisza i powaga."],
  ["shoes", "Japońskie dobre maniery", "Buty zdejmujemy przy progu i tatami. Mówimy cicho, w transporcie telefon wyciszony. Śmieci zabieramy ze sobą. Napiwków się nie daje."],
  ["map", "Korea: inne aplikacje", "Google Maps nie prowadzi w Korei — zainstaluj Naver Map albo KakaoMap i tłumacza Papago. Nie noś symbolu japońskiej flagi wschodzącego słońca."],
  ["knife", "Scyzoryk zostaw w domu", "W Japonii noszenie noża z ostrzem dłuższym niż 6 cm jest przestępstwem. Najprościej nie brać żadnego."],
];

/* ——— Przed wyjazdem ——— */
const PRZED = [
  ["doc", "Dokumenty", [
    "Paszport ważny co najmniej do 21.02.2028",
    "Zdjęcie paszportu w telefonie i kopia u rodziców",
    "Numer polisy i telefon do assistance ubezpieczyciela",
    "Zgoda rodziców (osoby niepełnoletnie) — oddana opiekunowi",
    "Visit Japan Web wypełnione przed przylotem (kod QR w telefonie)",
    "Korea: K-ETA albo e-Arrival Card — zgodnie z informacją od organizatorów",
    "Identyfikator ŚDM (wydają organizatorzy)",
  ]],
  ["phone", "Telefon i aplikacje", [
    "Safety tips (JNTO) — alerty w Japonii",
    "Emergency Ready App — alerty w Korei",
    "Naver Map albo KakaoMap (Korea)",
    "Papago albo Tłumacz Google z pobranym japońskim i koreańskim offline",
    "Mapy Google Japonii pobrane offline",
    "Grupa komunikatora od opiekuna",
    "eSIM / internet sprawdzony przed wylotem",
  ]],
  ["med", "Zdrowie", [
    "Leki stałe na cały wyjazd + zaświadczenie lekarskie po angielsku",
    "Apteczka: przeciwbólowe (bez kodeiny), na biegunkę, elektrolity, plastry na otarcia",
    "Leki na chorobę lokomocyjną (autokar, prom)",
    "Repelent na komary i krem z wysokim filtrem",
    "Karta alergii po japońsku i koreańsku (jeśli masz alergię pokarmową)",
  ]],
  ["bag", "Pakowanie", [
    "Walizka zgodna z regulaminem bagażu (planowane: jedna do 65 cm i 20 kg)",
    "Mały plecak na każdy dzień",
    "Lekkie, przewiewne ubrania, szybkoschnące",
    "Strój do kościoła: zakryte ramiona i kolana",
    "Rozchodzone wygodne buty + klapki; buty łatwe do zdejmowania",
    "Czyste skarpetki bez dziur (w Japonii często zdejmuje się buty)",
    "Czapka, okulary przeciwsłoneczne, peleryna albo parasolka",
    "Butelka na wodę wielokrotnego użytku",
    "Mały ręcznik do rąk i woreczek na śmieci",
    "Przejściówka do gniazdek w Japonii (typ A); w Korei niepotrzebna",
    "Powerbank — tylko w bagażu podręcznym w samolocie",
  ]],
  ["crowd", "Na ŚDM i czuwanie", [
    "Śpiwór i karimata",
    "Latarka czołowa",
    "Zatyczki do uszu i opaska na oczy",
    "Mała poduszka, kubek, sztućce",
    "Chłodzący ręcznik i zapas wody",
  ]],
  ["nomeat", "Nie pakuj", [
    "Wędlin, kabanosów, konserw mięsnych",
    "Scyzoryka i noży",
    "Leków z pseudoefedryną lub kodeiną",
    "Produktów z konopi / „CBD”",
    "Świeżych owoców i nasion",
  ]],
];

/* ——— Zwroty ——— */
const PHR = [
  ["Dzień dobry", "こんにちは", "konnichiwa", "안녕하세요", "annyeonghaseyo"],
  ["Dziękuję", "ありがとうございます", "arigatō gozaimasu", "감사합니다", "gamsahamnida"],
  ["Przepraszam / halo, proszę pana(i)", "すみません", "sumimasen", "죄송합니다 / 저기요", "joesonghamnida / jeogiyo"],
  ["Tak / Nie", "はい / いいえ", "hai / iie", "네 / 아니요", "ne / aniyo"],
  ["Smacznego (przed jedzeniem)", "いただきます", "itadakimasu", "잘 먹겠습니다", "jal meokgesseumnida"],
  ["Pyszne!", "おいしい", "oishii", "맛있어요", "masisseoyo"],
  ["Gdzie jest toaleta?", "トイレはどこですか", "toire wa doko desu ka", "화장실 어디예요?", "hwajangsil eodiyeyo?"],
  ["Mówi pan(i) po angielsku?", "英語を話せますか", "eigo o hanasemasu ka", "영어 할 수 있어요?", "yeongeo hal su isseoyo?"],
  ["Wszystko w porządku", "大丈夫です", "daijōbu desu", "괜찮아요", "gwaenchanayo"],
  ["Pomocy!", "助けて", "tasukete", "도와주세요", "dowajuseyo"],
  ["Zgubiłem / zgubiłam się", "道に迷いました", "michi ni mayoimashita", "길을 잃었어요", "gireul ireosseoyo"],
  ["Kościół katolicki", "カトリック教会", "katorikku kyōkai", "성당", "seongdang"],
  ["Do widzenia", "さようなら", "sayōnara", "안녕히 계세요", "annyeonghi gyeseyo"],
];

/* ——— Karta awaryjna ——— */
function renderEmergency() {
  $("#em-card").innerHTML = `
    <div class="em-col">
      <h3>Japonia</h3>
      <p><b>110</b> policja · <b>119</b> karetka, straż · <b>118</b> straż przybrzeżna</p>
      <p><b>050-3816-2787</b> Japan Visitor Hotline (24/7, po angielsku)</p>
      <p class="em-jp">助けてください — Proszę o pomoc</p>
    </div>
    <div class="em-col">
      <h3>Korea</h3>
      <p><b>112</b> policja · <b>119</b> karetka, straż</p>
      <p><b>1330</b> infolinia turystyczna z tłumaczem (24/7)</p>
      <p>Dzwoniąc powiedz: „English please” / „Interpreter please”.</p>
    </div>
    <div class="em-col em-fill">
      <h3>Moje dane</h3>
      <p>Imię i nazwisko: <span class="line"></span></p>
      <p>Opiekun / telefon: <span class="line"></span></p>
      <p>Lider grupy / telefon: <span class="line"></span></p>
      <p>Nocleg dziś (adres w lokalnym języku): <span class="line"></span><span class="line"></span></p>
      <p>Alergie, leki, grupa krwi: <span class="line"></span></p>
      <p>Polisa nr / assistance: <span class="line"></span></p>
    </div>
    <div class="em-col">
      <h3>Gdy się zgubisz</h3>
      <p>1. Zostań tam, gdzie ostatnio widziałeś grupę, albo idź do punktu zbiórki dnia.</p>
      <p>2. Dzwoń do opiekuna. Nie idź z nikim nieznajomym.</p>
      <p>3. W Japonii idź do kōban — małego posterunku policji przy stacji.</p>
      <p>Ambasady RP: Tokio i Seul — kontakty na gov.pl; zarejestruj się w systemie „Odyseusz”.</p>
    </div>`;
  $("#btn-print").onclick = () => { document.body.classList.add("print-card"); window.print(); setTimeout(() => document.body.classList.remove("print-card"), 500); };
}

/* ——— Kompendium ——— */
const TYP_LABEL = { rob: ["rob", "✓", "Rób"], nie: ["nie", "✕", "Nie rób"], wiedz: ["wiedz", "i", "Warto wiedzieć"] };
const KRAJ_LABEL = { jp: "Japonia", kr: "Korea", oba: "oba kraje" };
let komp = null;
const kstate = { q: "", kraj: "all", wazne: false, open: new Set() };
const showVerify = /[?&]org=1/.test(location.search);

function renderKomp() {
  if (!komp) return;
  const q = kstate.q.trim().toLowerCase();
  const html = komp.sekcje.map((s) => {
    const items = s.pozycje.filter((it) =>
      (kstate.kraj === "all" || it.kraj === kstate.kraj || it.kraj === "oba") &&
      (!kstate.wazne || it.waga >= 3) &&
      (!q || it.tekst.toLowerCase().includes(q)));
    if (!items.length) return "";
    const open = q || kstate.open.has(s.id);
    const groups = ["rob", "nie", "wiedz"].map((t) => {
      const list = items.filter((i) => i.typ === t);
      if (!list.length) return "";
      const [cls, mark, label] = TYP_LABEL[t];
      return `<h4 class="t ${cls}">${mark} ${label}</h4><ul class="komp-items">${list.map((i) => `
        <li class="w${i.waga}"><span class="kr k-${i.kraj}">${KRAJ_LABEL[i.kraj]}</span><span class="tx">${escapeHtml(i.tekst)}${i.zrodlo ? ` <a href="${escapeHtml(i.zrodlo)}" target="_blank" rel="noopener" class="src-link">źródło</a>` : ""}${showVerify && i.sprawdzic ? ` <em class="ver">do sprawdzenia</em>` : ""}</span></li>`).join("")}</ul>`;
    }).join("");
    return `<details class="komp-sec" data-id="${s.id}" ${open ? "open" : ""}>
      <summary><span class="ico">${icon(s.ikona)}</span><span class="ttl">${escapeHtml(s.tytul)}</span><span class="cnt">${items.length}</span></summary>
      <div class="komp-body">${groups}</div></details>`;
  }).join("");
  $("#komp-list").innerHTML = html || `<p class="muted">Nic nie znaleziono. Spróbuj innego słowa.</p>`;
}

function bindKomp() {
  $("#komp-q").addEventListener("input", (e) => { kstate.q = e.target.value; renderKomp(); });
  $("#komp-wazne").addEventListener("change", (e) => { kstate.wazne = e.target.checked; renderKomp(); });
  document.querySelectorAll(".komp-chips .chip-btn").forEach((b) => b.addEventListener("click", () => {
    kstate.kraj = b.dataset.kraj;
    document.querySelectorAll(".komp-chips .chip-btn").forEach((x) => x.classList.toggle("is-on", x === b));
    renderKomp();
  }));
  $("#komp-list").addEventListener("toggle", (e) => {
    const d = e.target.closest("details");
    if (!d) return;
    if (d.open) kstate.open.add(d.dataset.id); else kstate.open.delete(d.dataset.id);
  }, true);
}

/* ——— Przed wyjazdem ——— */
const PKEY = "sdm2027-pielgrzym-przed";
function renderPrzed() {
  let done = {};
  try { done = JSON.parse(localStorage.getItem(PKEY) || "{}"); } catch (_) {}
  let total = 0, ticked = 0;
  $("#przed-grid").innerHTML = PRZED.map(([ic, title, items], gi) => `
    <article class="przed-card"><h3><span class="ico">${icon(ic)}</span>${escapeHtml(title)}</h3>
    <ul>${items.map((t, i) => { const id = `${gi}-${i}`; total++; if (done[id]) ticked++;
      return `<li><label><input type="checkbox" data-id="${id}" ${done[id] ? "checked" : ""} /> <span>${escapeHtml(t)}</span></label></li>`; }).join("")}</ul></article>`).join("");
  $("#przed-progress").textContent = `Gotowe: ${ticked} z ${total}.`;
  $("#przed-grid").onchange = (e) => {
    const id = e.target.dataset.id; if (!id) return;
    done[id] = e.target.checked;
    try { localStorage.setItem(PKEY, JSON.stringify(done)); } catch (_) {}
    renderPrzed();
  };
}

/* ——— Plan ——— */
/** Zatwierdzone opcje z skryptu organizatorów (?action=plan) — bez dostępu do arkusza z kosztami. */
async function approvedFromApp(url) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "action=plan", { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    return j && j.ok && j.wybrane ? j.wybrane : null;
  } catch (_) { return null; }
}

function renderDays(days, places) {
  const pick = (d) => bestPhoto(d, places);
  $("#pg-days").innerHTML = days.map((d) => {
    const t = tileHtml(d, pick(d) || null);
    const kraj = /Korea/.test(d.kraj || "") ? "kr" : /Japonia/.test(d.kraj || "") ? "jp" : "pl";
    return `<button type="button" class="pg-day ${kraj}" data-day="${escapeHtml(d.data)}">
      <span class="${t.cls}" ${t.style}>${t.inner}<span class="date-badge"><b>${escapeHtml((d.data_pl || "").replace(".2027", ""))}</b><span>${escapeHtml(d.dzien || "")}</span></span></span>
      <span class="pg-day-body">${t.title ? `<span class="tile-kicker">${escapeHtml(t.title)}</span>` : ""}
        <strong>${escapeHtml(d.miejsce || "")}</strong>
        ${d.sens ? `<span class="sens">${escapeHtml(d.sens)}</span>` : ""}
        <span class="more">Czytaj więcej →</span></span></button>`;
  }).join("");
  $("#pg-days").onclick = (e) => { const b = e.target.closest("[data-day]"); if (b) openDay(b.dataset.day); };
}

function renderCount(approved) {
  const days = Math.ceil((START - new Date()) / 864e5);
  $("#pg-count").innerHTML = days > 0 ? `<b>${days}</b> ${days === 1 ? "dzień" : "dni"} do wylotu` : (days > -21 ? "Jesteśmy w drodze — z Bogiem!" : "");
  $("#pg-version").textContent = approved
    ? "Plan zatwierdzony przez organizatorów."
    : "Plan wstępny — szczegóły mogą się jeszcze zmienić.";
}

async function main() {
  const [data, kompData] = await Promise.all([
    fetch("data/data.json").then((r) => r.json()),
    fetch("data/kompendium.json").then((r) => r.json()),
  ]);
  const approved = await approvedFromApp((data.meta || {}).planAppUrl);
  const groups = groupDecisions(data.decyzje || []);
  let choices = defaultChoices(groups);
  let hasApproved = false;
  if (approved) Object.entries(approved).forEach(([k, v]) => {
    if (groups.some((g) => g.id === k && g.opcje.some((o) => o.opcja_id === v))) { choices[k] = v; hasApproved = true; }
  });
  choices = normalizeChoices(choices);
  const { days } = applyDays(data.dni, data.warianty || {}, activeEffects(groups, choices));
  const placeById = (d) => bestPhoto(d, data.miejsca);
  setDetailState({ days, places: data.miejsca, checks: null, publicView: true, tile: (d) => tileHtml(d, placeById(d) || null) });

  renderCount(hasApproved);
  $("#top-grid").innerHTML = TOP.map(([ic, h, p]) => `<article class="top-card"><span class="ico">${icon(ic)}</span><h3>${escapeHtml(h)}</h3><p>${escapeHtml(p)}</p></article>`).join("");
  renderDays(days, data.miejsca);
  komp = kompData;
  $("#komp-src").textContent = `${kompData.zrodlo} Stan na ${kompData.stan}.`;
  bindKomp(); renderKomp();
  renderPrzed();
  renderEmergency();
  $("#phr-grid").innerHTML = `<table class="phr"><thead><tr><th>Po polsku</th><th>Po japońsku</th><th>Po koreańsku</th></tr></thead><tbody>${
    PHR.map(([pl, jp, jpr, kr, krr]) => `<tr><td>${escapeHtml(pl)}</td><td><span class="nat">${jp}</span><span class="rom">${escapeHtml(jpr)}</span></td><td><span class="nat">${kr}</span><span class="rom">${escapeHtml(krr)}</span></td></tr>`).join("")}</tbody></table>`;

  const hd = new URLSearchParams(location.hash.slice(1)).get("dzien");
  if (hd) openDay(hd);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(() => {
      $("#pg-offline").textContent = "Strona działa też bez internetu — po pierwszym otwarciu zapisuje się w telefonie. Możesz dodać ją do ekranu głównego.";
    }).catch(() => {});
  }
}

main();
