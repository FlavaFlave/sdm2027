# ŚDM 2027 — strona organizatorów / organizers’ site

Strona referencyjna dla organizatorów pielgrzymki Japonia + Korea (plan v3, etap 6), opublikowana na GitHub Pages z `noindex`. Wersja dla rodziców powstanie później.

A reference site (published on GitHub Pages, `noindex`) for the organizers of the Japan + Korea pilgrimage (plan v3, stage 5). A parents’ version will come later.

**Publiczna część nie zawiera danych osobowych uczestników.** Imiona, nazwiska, telefony, e-maile, paszporty i wpłaty imienne są wyłącznie w prywatnym arkuszu Google i w panelu Apps Script — nie w tym folderze, nie w `data.json` i nie na GitHub Pages.

**The public site contains no participant personal data.** Names, contact details, passports and named payments live only in a private Google Sheet and its Apps Script panel — not in this folder, not in `data.json`, and not on GitHub Pages.

---

## Jak otworzyć / How to open

Z katalogu `sdm-site`:

```bash
python3 -m http.server 8765
```

Potem: <http://127.0.0.1:8765/>

Nie otwieraj `index.html` przez `file://` — przeglądarka zablokuje `data/data.json` i moduły ES (`js/*.js`). Potrzebny jest dowolny serwer statyczny (powyższe polecenie albo podgląd VS Code / GitHub Pages).

Do not open `index.html` via `file://`. Use a static server; ES modules and `fetch("./data/data.json")` need http(s).

Link z hashem zapisuje scenariusz, np. `#tab=decyzje&petla=E1&nagasaki=tani`. Można go wysłać innemu organizatorowi.

---

## Architektura / Architecture

```
sdm-site/
  index.html          # struktura zakładek i znaczniki (id zostawiamy w spokoju)
  css/style.css       # cały wygląd: kolory, typografia, siatki, mobile
  js/
    app.js            # start, zakładki, karty dni, decyzje, logistyka
    cost.js           # silnik kosztu i decyzji, raty, hash scenariusza
    maps.js           # Leaflet / Esri World Street Map (etykiety angielskie)
    budget.js         # zakładka Budżet i wpłaty (zbiorcze + przycisk do panelu)
    checklist.js      # zakładka Checklista
    checks.js         # kontrola harmonogramu: kierowcy, przerwy, km, zapasy, posiłki
    util.js           # formatowanie, CSV, DOM
  data/data.json      # dane i model (klucze niezmienne); privatePanelUrl może być pusty
  apps-script/
    Panel.gs          # do wklejenia w prywatnym arkuszu (Apps Script)
    panel.html        # wygląd prywatnego panelu
    INSTRUKCJA.md     # wdrożenie prywatnego panelu wpłat
    Checklista.gs      # opcjonalny zapis checklisty (publiczny arkusz)
    checklista.html
    INSTRUKCJA-checklista.md
  .nojekyll           # GitHub Pages serwuje pliki bez Jekylla
  .gitignore
  README.md
```

Wszystkie ścieżki w HTML i JS są **względne** (`./css/style.css`, `./js/app.js`, `./data/data.json`), więc repozytorium działa na GitHub Pages bez zmian (zarówno w korzeniu `username.github.io`, jak i w projekcie `username.github.io/sdm-site/`).

All asset paths are **relative**, so the folder works on GitHub Pages as-is (user site or project site).

### Zakładki / Tabs

| `id` / `data-tab` | Zawartość / Content |
|---|---|
| `przeglad` | Mapa całości, oś czasu |
| `japonia` | Mapa i karty dni Japonii |
| `korea` | Mapa i karty dni Korei |
| `decyzje` | Menu decyzji, koszt na osobę i grupę, wykres, porównanie scenariuszy |
| `budzet` | Pełny budżet, raty (udziały Artura), zbiorczy status wpłat, przycisk do prywatnego panelu |
| `checklista` | Zgody i dokumenty, status, osoba, termin, liczby zbiorcze |
| `logistyka` | Kierowcy, bagaż, prom, noclegi, uwagi z decyzji |

Hasło URL: `#tab=budzet` albo `#tab=checklista&petla=E4`. Nie zmieniaj wartości `data-tab` ani `id` paneli.

---

## Gdzie jest wygląd / Where styles live

**Jedyny arkusz stylów: `css/style.css`.**

- Paleta i czcionki: blok `:root` na górze pliku (`--navy`, `--gold`, `--paper`, `--font-serif`, `--font-sans`…).
- Nagłówek, zakładki, karty dni, mapy, tabelki: dalsza część pliku.
- Budżet i checklista: sekcja „etap 3” na dole.
- Mobile: `@media (max-width: 900px)` i `560px`.

HTML w `index.html` odpowiada za kolejność bloków i teksty stałe (hero, śródtytuły). Nie wkładaj tu dużych reguł CSS — trzymaj je w `css/style.css`.

Libraries loaded from a CDN (leave them unless you self-host): Cormorant Garamond + Lato, Leaflet, Chart.js.

---

## Przepływ danych z arkusza / Data flow from the Sheet

1. Przy starcie `js/app.js` próbuje wczytać opublikowany CSV arkusza Google  
   [ŚDM 2027 – dane strony organizatorów](https://docs.google.com/spreadsheets/d/1ZSGVRJc9BMXGkoJjPAwyjnynXTRn42LsPZhB-l0MGvs/edit)  
   (karty: Dni, Miejsca, Transport, Noclegi, Decyzje, Koszty, **Wpłaty**, **Checklista**).
2. Jeśli arkusz nie jest opublikowany do sieci (domyślny stan — **nie publikować strony ani arkusza bez decyzji organizatorów**), używany jest `data/data.json`.
3. Model kosztów i warianty trasy są w JSON-ie; stawki z karty Koszty i reguły z karty Decyzje nadpisują je po publikacji CSV.
4. **Wpłaty na stronie publicznej:** wyłącznie zbiorczo `Liczba wpłaconych` i `Suma wpłynęła` na każdą ratę. Puste komórki = „do uzupełnienia”, nie zero. Żadnych nazwisk w tym arkuszu.
5. **Checklista:** status, osoba odpowiedzialna (rola), termin; kolumna „Zebrane” tylko jako liczba (np. ile paszportów).
6. Kwoty rat = *aktualna cena scenariusza* × udziały Artura (20 / 20 / 20 / 25 / 15%). Ostatnia rata domyka grosze. Rata z wpisaną kolumną **„Kwota zamrożona (zł/os.)”** (już wysłana rodzicom) się nie zmienia — różnica rozkłada się na raty niezamrożone.
7. **Ustawienia:** karta w publicznym arkuszu z polem `privatePanelUrl` (adres web appa). Puste pole = przycisk w zakładce Budżet jest nieaktywny. Ten sam klucz jest w `data/data.json` (`meta.privatePanelUrl`) jako zapas, gdy CSV nie jest jeszcze opublikowany.

---

## Dane osobowe i prywatny panel / Personal data

**Zasada:** dane osobowe (nazwiska, daty urodzenia, telefony, e-maile, paszporty, uwagi zdrowotne, wpłaty imienne i darczyńców) są **tylko** w prywatnym arkuszu Google „ŚDM 2027 – dane osobowe (PRYWATNE)” i w web appie Apps Script do niego podpiętym. Nie wolno ich wgrywać do tego repozytorium, do `data/data.json`, na GitHub Pages ani wysyłać innym AI do recenzji wyglądu.

**Rule:** personal data lives **only** in the private Google Sheet and its Apps Script web app. Do not put it in this repo, in `data/data.json`, on GitHub Pages, or in a zip you give another AI for a visual review.

Wpłata jest albo **imienna** (za konkretnego uczestnika, po `id`), albo **ogólna** (darczyńca / sponsor, bez przypisania do osoby). W prywatnym panelu widać listę uczestników, braki dokumentów, saldo każdej osoby, obie grupy wpłat i formularz dodania wpłaty.

Publiczny hosting (GitHub Pages) jest z zasady otwarty. Dlatego panel nie czyta nazwisk z plików strony — otwiera się jako aplikacja Google i pokazuje dane wyłącznie osobie, której udostępniono prywatny arkusz. Osoba bez dostępu widzi komunikat o braku uprawnień. Osoby dopisujące wpłaty potrzebują roli **Edytor**; do samego podglądu wystarczy **Czytelnik**.

Wdrożenie skryptu (w polskim interfejsie Google, ok. 8 kroków): [`apps-script/INSTRUKCJA.md`](apps-script/INSTRUKCJA.md). Krótko: w prywatnym arkuszu **Rozszerzenia → Apps Script**, wkleić `Panel.gs` i `panel.html`, potem **Wdróż → Nowe wdrożenie → Aplikacja internetowa**, z opcjami *Wykonuj jako: Użytkownik uzyskujący dostęp do aplikacji internetowej* oraz *Kto ma dostęp: Wszyscy użytkownicy posiadający konto Google*. Skopiowany URL wkleić w karcie Ustawienia (`privatePanelUrl`). Prywatnego arkusza **nie publikować** w internecie i **nie udostępniać** „każdemu, kto ma link”.

---

## Jak edytować wygląd inną AI / How to edit visuals with another AI

Cel jest taki, żeby inny model (Claude, ChatGPT, Gemini, Cursor…) mógł poprawić wygląd, **nie rozjeżdżając danych i mechanizmu**.

**Wariant A — wklej dwa pliki (najprostszy do zmian wizualnych)**

1. Wklej do czatu `css/style.css` oraz `index.html`.
2. Napisz, co zmienić (kolory, typografia, układ zakładek, karty, mobile).
3. Poproś, żeby **nie zmieniał** atrybutów `id`, `data-tab`, `data-id` ani nazw klas, z których korzysta JS (`.tab`, `.panel`, `#cost-value`, `#decision-list`, `#budget-stats`, `#check-list-board`, `.cost-board`, `.day-card`, `.map`…). Może **dodać** nowe klasy.
4. Wgraj zwrócone pliki z powrotem do `css/style.css` i `index.html`.
5. Odśwież lokalny serwer.

**Wariant B — wrzuć zip**

1. Weź `sdm-site.zip`.
2. Wgraj go do narzędzia, które przyjmuje projekt (Claude Projects, Gemini, Cursor).
3. Wklej prompt z rozdziału „Prompt do oceny przez inne AI” albo: *„Popraw tylko wygląd. Nie zmieniaj kluczy w data/data.json ani id w HTML. Nie dopisuj danych osobowych. Nie potrzebujesz i nie dostaniesz prywatnego arkusza.”*

**Wariant C — repozytorium**

Sklonuj folder, otwórz w Cursorze / VS Code i wskaż `css/style.css` + `index.html`. Strona jest statyczna, bez procesu budowania.

Jeśli AI ma ruszać mechanizm decyzji albo kosztów, musi dostać także `js/cost.js`, `js/app.js` i `data/data.json` — i nadal nie może zmieniać kluczy.

---

## Zasady / Rules (nie łamać)

1. **Nie zmieniaj kluczy danych** w `data/data.json` ani w arkuszu: `id` decyzji (`petla`, `noc_2`, `nagasaki`…), `id` pozycji kosztu (`loty_qatar`, `nocleg_nagasaki`…), `id` rat (`I`–`V`), `id` pozycji checklisty, pola `udzial`, `zmiany`, `efekt`, `miejsca`.
2. **Nie zmieniaj** `id` elementów HTML ani `data-tab` / `data-id` — skrypty i hasło URL są do nich przywiązane. Wolno dodawać opakowania i klasy.
3. **Żadnych danych osobowych uczestników w plikach strony** (nazwiska, maile, numery paszportów, kwoty imienne, dane medyczne). Wpłaty i dokumenty na stronie publicznej tylko zbiorczo. Inne AI recenzujące wygląd **nie dostają** dostępu do prywatnego arkusza ani do panelu z danymi.
4. **Nie publikuj** strony ani arkusza publicznie, dopóki organizatorzy tego nie zdecydują (`noindex` już jest w HTML).
5. Ścieżki zostaw względne. Nie wstawiaj `/css/style.css` od korzenia domeny.
6. Kwoty na stronie muszą się sumować do pokazanej ceny; raty muszą złożyć się do 100%.

---

## Prompt do oceny przez inne AI

Poniższy tekst można skopiować w całości i wkleić do innego modelu razem z `index.html` + `css/style.css` (a jeśli ma ocenić mechanizm: także `js/app.js`, `js/cost.js`, `js/budget.js`, `js/checklist.js` i fragment `data/data.json`). To jest gotowy brief, nie trzeba go przepisywać.

```
Jesteś recenzentem UX i dyrektorem artystycznym. Masz statyczną stronę organizatorów pielgrzymki ŚDM 2027 (Japonia + Korea, 90 osób, 1–21.08.2027). Strona jest po polsku, tylko dla organizatorów, jeszcze niepublikowana, bez danych osobowych uczestników.

Twoje zadanie:
1. Oceń UX i wygląd: hierarchię, typografię, paletę, siatkę, czytelność na mobile, czy zakładki i karty są jasne dla kogoś, kto wchodzi pierwszy raz.
2. Oceń mechanizm decyzji i kosztów (jeśli dostałeś też pliki JS i data.json): czy zmiana decyzji w menu wiarygodnie przelicza cenę na osobę i na grupę (90), deltę wobec bazy, raty, mapę i karty dni; czy kosztorys sumuje się do pokazanej kwoty; czy to jest zrozumiałe.
3. Wskaż braki: czego organizatorom jeszcze brakuje na stronie, w budżecie, we wpłatach (tylko zbiorczych), w checkliście dokumentów albo w komunikacji decyzji.
4. Zaproponuj nowy układ (layout) — konkretny, do wdrożenia: struktura zakładek albo jednej przewijanej strony, siatka, hierarchia „najpierw decyzja / cena / terminy”, zachowanie na telefonie. Możesz oddać to jako opis + szkic w HTML/CSS albo jako poprawione index.html i css/style.css.

Twarde reguły:
- Nie zmieniaj atrybutów id, data-tab, data-id ani kluczy w data.json (id decyzji, pozycji kosztu, rat, checklisty, pól zmiany kosztów).
- Możesz dodawać klasy CSS i opakowania HTML.
- Nie wymyślaj i nie wstawiaj nazwisk, maili, kwot imiennych ani numerów dokumentów. Nie proś o dostęp do prywatnego arkusza z danymi osobowymi — go nie dostaniesz.
- Nie publikuj strony. Nie każ od razu wdrażać zmian, których nie da się zrobić samym CSS/HTML.
- Ścieżki assetów mają zostać względne (./css/style.css, ./js/app.js, ./data/data.json).
- Język interfejsu: polski. Komentarz do propozycji możesz napisać po polsku lub po angielsku.

Zwróć: (a) krótką recenzję (UX, wizualia, mechanizm, braki), (b) propozycję nowego układu, (c) opcjonalnie poprawione pliki wyglądu.
```

---

## GitHub Pages

Folder jest gotowy do wrzucenia na GitHub Pages bez budowania:

```bash
git init
git add .
git commit -m "ŚDM 2027 — strona organizatorów, etap 5"
# potem remote i gh-pages albo Settings → Pages → Deploy from branch (root)
```

Plik `.nojekyll` każe Pages serwować pliki tak, jak leżą. `js/` to ES modules (`type="module"` w `index.html`); Pages obsługuje je normalnie przez HTTPS.

**Nadal nie publikuj**, dopóki organizatorzy nie zdecydują o adresie i o tym, czy arkusz ma być CSV do odczytu.

---

## Źródła danych (skrót)

- Plan v3 (Fable, 15.11.2026) i wcześniejsze wersje Claude.
- Kosztorys Artura 22.09.2026: loty 4 900 zł, udziały rat 20/20/20/25/15%, miesiące XI 2026–VII 2027, rezerwa 6%.
- Model etapu 2: pozycje sumujące się do 16 169,87 zł/os. w wariancie bazowym (z rezerwą).
- Checklista: terminy z planu v3 (30.11, 15.12, 31.01 itd.), paszporty do II 2028, zgody (ok. 29 niepełnoletnich wg wieku z listy, bez dat urodzenia — do weryfikacji), K-ETA, luki w polisie (terror, rezygnacja), KBO 15.05 / LOC 31.05.2027, faks do Akity 018-868-4728.

Arkusz: <https://docs.google.com/spreadsheets/d/1ZSGVRJc9BMXGkoJjPAwyjnynXTRn42LsPZhB-l0MGvs/edit>

---

## Etap 6 (16.11.2026) — co się zmieniło

**Model kosztów (`js/cost.js`, `data.json → model`)**
- Liczba osób nie jest już stała: suwak uczestników (90 = pułap, `model.osoby`), miejsca bezpłatne (cena liczona na płacącego), liczba niepełnoletnich, kto pokrywa bilety po rezygnacjach (`model.loty_rezygnacje`: 69 grupowych z klauzulą 15% + 21 imiennych).
- Pozycje „grupa” (autokary, kadra) dzielą się przez liczbę płacących, pozycje „os” mnożą przez liczbę uczestników.
- Flota osobno dla Japonii i Korei (`model.flota`): najtańszy zestaw pojazdów, który mieści ludzi, kadrę i walizki. Japonia: duży 49 miejsc / średni ok. 27. Korea: 45인승 (ok. 44 pasażerów) / mały bus. Pozycje autokarów skalują się współczynnikiem floty.
- Rezerwa liczy się tylko od pozycji nieopłaconych i walutowych (`model.bez_rezerwy`: bilety Qatar, polisa, materiały, karimaty, bagaż). Baza spadła z ok. 16 170 do ok. 15 900 zł.
- Moduł Fuji: `model.fuji_na_osobe` = 1 500 zł [szacunek] zamiast 1 000.
- Decyzje wykluczające się (`disabledGroups`): „lepszy sen” wyłącza nocleg 2.08, A1+ wyłącza stawkę Seulu.
- Decyzja „Skład” → „Bagaż”: limit walizki / ciężarówka bagażowa / trzeci autokar tylko w Japonii.
- Dźwignie kosztu bez wycinania programu (nowe decyzje): hotele zachód, posiłki, przewodnik, eSIM, przewoźnik zachód, Nagasaki tramwaj (oznaczony: dotyka DECYZJI „autokary”), Seul parafie. Przycisk „Pokaż wariant oszczędny” (`meta.preset_oszczedny`).

**Harmonogram (`js/checks.js`, `data.json → dni[]`)**
- `kierowcy` (start, koniec, km, kierowców, załoga), `bufory` (zapas przed lotem/promem), `posilki` (śniadanie/obiad/kolacja: gdzie, jak, od, min).
- Walidator: praca kierowcy > 13 h / > 15 h, przerwa < 9 h / < 11 h (ta sama załoga), km na kierowcę, zapas przed odlotem, okna na posiłki. Wynik: zakładka Przegląd, Logistyka i każda karta dnia.
- 4.08: lot do Seulu jest krótki — Haneda ok. 17:30 (ok. 2 h przed 20:05), wyjazd z Kitakami 7:45.

**Kafelki (`dni[].kafelek`)**
- 7.08 czuwanie: ilustracja namiotów w nocy (SVG, bez zdjęcia).
- 8.08 Msza z papieżem Leonem XIV i 9.08 spotkanie z Kiko Argüello: miejsce na zdjęcie. Wklej `kafelek.zdjecie_url` i `kafelek.zdjecie_zrodlo` — zdjęcie, do którego macie prawa.

**Arkusz:** gdy arkusz zostanie opublikowany jako CSV, pola, których w nim nie ma (kierowcy, posiłki, bufory, kafelki, nowe decyzje), są dokładane z `data.json`. W karcie Wpłaty można dodać kolumnę „Kwota zamrożona (zł/os.)”.

---

## Etap 7 (16.11.2026) — co się zmieniło

- **Arkusz** kosztów, rat, wpłat zbiorczych i checklisty: kopia w folderze Jakuba na Dysku (`meta.spreadsheet_folder`), ID w `js/util.js` (`SHEET_ID`). **Podział ról:** teksty (program dni, opisy miejsc, decyzji) są w `data.json`; liczby i stany (kwoty kosztów, raty, wpłaty, checklista, „Wybrana” przy decyzjach) — w arkuszu.
- **Zapis ze strony** (`apps-script/Zapis.gs`, instrukcja `INSTRUKCJA-zapis.md`): odczyt arkusza bez publicznego udostępniania, checklista (osoba, zrobione, komentarze z podpisem), „Zatwierdź jako obowiązujący plan” (kolumna Wybrana + karta Historia decyzji). Adres w `meta.zapisAppUrl`. Bez niego zapis checklisty działa tylko w tej przeglądarce.
- **Mapy**: kafelki bez napisów lokalnym pismem, etykiety miast po angielsku, zakładka Japonia/Korea przybliża do kraju, mapa nie zasłania menu.
- **Decyzje** opisane dla osoby, która nie zna Japonii i Korei: o co decydujemy, co trzeba wiedzieć, tabela możliwości z różnicą ceny, od czego zależy, na co wpływa, rekomendacja i dlaczego (`decyzje[].tlo` i pozostałe pola).
- **Przyciski wariantów** nazwane według tego, co robią; pasek „ile zmian względem planu bazowego”.
- **Dni klikalne** (oś czasu w Przeglądzie i karty dni): okno z sensem dnia, programem, posiłkami, kontrolą harmonogramu i opisem każdego miejsca (`miejsca[].szczegoly`: co, historia, dlaczego, robimy, praktyczne; `dni[].sens`). Link do dnia: `#tab=przeglad&dzien=2027-08-14`.
- Teksty bez skrótów roboczych (E1–E4 → warianty 1–4, „Fable”, „v3”, KBO/LOC rozwinięte), wyjaśniony odcinek autostrady obok Fukushimy.
- Liczby z arkusza czytane poprawnie także w formacie „4,900.00”.

---

## Etap 9 (17.11.2026) — strona dla jadących

- **`pielgrzym.html`** — strona dla uczestników (bez kosztów, decyzji, kierowców i danych osobowych): najważniejsze zasady, plan dzień po dniu z opisami miejsc, kompendium „jak się zachować” (rozwijane działy, wyszukiwarka, filtr Japonia/Korea), lista „przed wyjazdem” (zapis w telefonie), karta awaryjna do druku, słowniczek JP/KR. Działa offline (`sw.js`, `manifest.webmanifest`).
- **Ten sam plan co strona organizatorów:** czyta `data/data.json` i opcje zatwierdzone w arkuszu (kolumna „Wybrana” w karcie Decyzje). Gdy nic nie jest zatwierdzone, pokazuje plan bazowy z dopiskiem „plan wstępny”.
- **Kompendium:** `data/kompendium.json` (171 pozycji, z linkami do źródeł). Dopisek `?org=1` w adresie pokazuje punkty oznaczone do sprawdzenia.
- **Strona organizatorów** startuje teraz od obowiązującego (zatwierdzonego) planu; przycisk „Pokaż obowiązujący plan”. Poprawione: noc w Mito/Utsunomiyi zmienia też początek dnia 3.08; wariant 4 wyklucza „lepszy sen”; raty nie bywają ujemne.
- Wspólne moduły: `js/tiles.js` (kafelki dni i dobór zdjęcia), `js/details.js` (okno dnia; tryb publiczny bez uwag organizacyjnych), `js/icons.js` (ikony).

---

## Etap 10 (17.11.2026) — rozdzielenie stron

- **Adres główny (`index.html`) to strona dla jadących.** `pielgrzym.html` przekierowuje na nią.
- **Strona organizatorów** ma osobny, niepodawany publicznie adres (nazwę pliku znają organizatorzy). Nie linkuje do niej żadna strona.
- **Dane rozdzielone:** `data/data.json` — tylko plan, miejsca i warianty trasy (bez kosztów, decyzji, uwag organizacyjnych i adresów arkuszy). Koszty, decyzje, raty, checklista, logistyka, uwagi do dni i ID arkuszy są w osobnym pliku danych organizatorów w `data/`.
- **Strona jadących nie zna arkusza.** Zatwierdzony plan pobiera ze skryptu `Zapis.gs` (`?action=plan`, tylko ID wybranych opcji); adres w `data.json → meta.planAppUrl`.
- `Zapis.gs`: odczyt całego arkusza (`?action=tabele`) tylko z kodem organizatorów.
- To jest ukrycie, nie zabezpieczenie: repozytorium jest publiczne. Prawdziwe logowanie — Cloudflare Access (zob. rozmowa z 17.11.2026).

---

## Etap 12 (26.11.2026) — ścieżki A/B i przylot do Seulu 5.08

- Decyzja „Pierwsze dni w Japonii” (id `petla`) ma teraz dwie opcje: **A** (Akita, Nikkō, Yamanakako) i **B** (Ōkago, Sendai, Fuji dla chętnych). Stare E1–E4 i decyzja o noclegu 2.08 zniknęły (stare linki z E1–E4 przełączają się na A/B).
- Nowe decyzje: **Przylot do Seulu** (`przylot`: 5.08 wieczorem / 6.08 rano) i **Kto nie wchodzi na Fuji** (`nie_fuji`: B1/B2/B3, tylko w ścieżce B przy Fuji).
- Fuji przeniesione z 17–18.08 na 4–5.08 i działa tylko w ścieżce B.
- Korea: 6.08 rano Seosomun i Myeongdong (jeśli rejestracja pozwoli), 9.08 Jeoldusan i Saenamteo, 11.08 Msza w Jwadong (Busan).
- Nowe miejsca: Yamanakako (siostry salezjanki), Ōkago, Saenamteo, Jwadong.
- Kwoty w arkuszu (karta Koszty) mają pierwszeństwo przed `data/…json` — po wgraniu trzeba je przepisać w arkuszu (lista w rozmowie z 26.11.2026).

---

## Etap 13 (26.11.2026) — Śpiew i parafie · Zbiórka

- Dwie nowe zakładki na stronie organizatorów: **Śpiew i parafie** (kalendarz miesięczny, wydarzenia, rozliczenie tacy z listą obecnych, lista śpiewających, parafie z rankingiem i importem Excela od Groka, eksport do Google Calendar i .ics) oraz **Zbiórka** (liczniki, lejek darczyńców, datki dla osoby / grupy / budżetu wspólnego, saldo na osobę, obniżka ceny z budżetu wspólnego).
- Dane osobowe nie trafiają do repozytorium: z podłączonym `Zapis.gs` leżą w osobnym prywatnym arkuszu „ŚDM 2027 — Zbiórka”, bez skryptu — tylko w przeglądarce (tryb próbny).
- Strona jadących: sekcja **Gdzie śpiewamy** (tylko daty, parafie, notatki; pojawia się, gdy są przyszłe wydarzenia i podłączony skrypt).
- Zlecenie dla Groka: `apps-script/GROK-parafie.md`.

---

## Etap 14 (27.11.2026) — lista 402 parafii i mapa

- `data/parafie.json` — 215 parafii archidiecezji warszawskiej i 187 warszawsko-praskiej z Excela od Groka (dane publiczne z baz diecezji i RCN GUGiK 2025). Nasze statusy rozmów, kontakty, uwagi i wspólnoty neokatechumenalne trzymamy w prywatnym arkuszu (karta Parafie, ID parafii = `A-…` / `P-…`).
- **Ranking wspólny** (porównywalny między diecezjami): bez punktów za liczbę wiernych, +3 za wspólnoty neokatechumenalne. Ranking Groka zostaje jako „w diecezji”.
- **Potencjał zbiórki** [szacunek, 0–100]: 60% z liczby niedzielnych Mszy, 40% z ceny m² w okolicy. Rozliczenie wydarzenia ma pole „Osób na Mszy”, żeby sprawdzić wskaźnik na prawdziwych wynikach.
- Mapa parafii w zakładce Śpiew i parafie: kolor = status, liczba = ranking, wielkość = potencjał, złota obwódka = mamy termin; filtry i przyciski Zaplanuj / Szczegóły / Nawiguj.
- Nowa wersja Excela od Groka: `python3 narzedzia/parafie_json.py plik.xlsx data/parafie.json` (ID parafii się nie zmieniają, więc nasze statusy zostają).

---

## Etap 15 (27.11.2026) — Akita 13:30, noclegi grupowe, kościoły i biskupi

- Ścieżka A: 3.08 Iwaki → Akita prosto (sanktuarium przyjmuje Msze pielgrzymek tylko o 9:30, 10:00, 13:00, 13:30 — wybrana 13:30), 4.08 Akita → Matsushima → Nikkō.
- Kosztorys zakłada, że tanie noclegi się udadzą: Isahaya NIYE (Nagasaki), Shin-Osaka Youth Hostel, hotel biznesowy w Hiroszimie, ośrodki/hotele grupowe na wschodzie (nowa decyzja „Noclegi na wschodzie”). Hotele zostają jako opcje zapasowe w Decyzjach. Usunięte: Hiyoshi, Nagatsuka, Centrum Katolickie w Nagasaki.
- `data/kontakty.json` (z Excelów Groka): 69 kościołów, 32 noclegi grupowe, 12 biskupów. Nowa zakładka „Kościoły i noclegi” ze statusami rozmów (karta „Kontakty” w prywatnym arkuszu) i warstwy ✝/🛏 na mapach organizatorów.
- Nowa wersja Excela: `python3 narzedzia/kontakty_json.py koscioly.xlsx noclegi.xlsx data/kontakty.json`.

## Etap 16 (27.11.2026) — ścieżki A/B/C, przewodnicy, cel ceny

- Decyzja „Pierwsze dni”: A (Akita), B (Japonia bez Akity), C (bez Akity, lot Narita–Incheon 3.08 i dwa dni więcej w Seulu: Gyeongbokgung/Gwanghwamun, Bukchon, Gahoedong, Myeongdong, Jeoldusan, Saenamteo, powitanie Papieża).
- Przewodnicy: domyślnie dwóch przez całą Japonię (kadra 37 280 zł na grupę) [szacunek].
- Cel ceny `meta.cel_cena` (14 000 zł) w nagłówku i w Decyzjach, z listą zmian, które obniżają cenę (kliknięcie przełącza opcję).
- „Plan bazowy” → „plan wyjściowy” (= opcje domyślne). Zapisany w przeglądarce podgląd z poprzedniej wersji planu jest ignorowany.
- Zakładka Japonia: między dniami w Japonii karta „Pobyt w Korei”.
