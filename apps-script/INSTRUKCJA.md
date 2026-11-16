# Wdrożenie prywatnego panelu organizatorów

Panel pokazuje nazwiska i wpłaty imienne **tylko** osobom, którym udostępniono prywatny arkusz „ŚDM 2027 – dane osobowe (PRYWATNE)”. Dane osobowe nie mogą trafić na stronę publiczną, do GitHub Pages ani do ZIP-a dla innych AI.

## Osiem kroków

1. Otwórz prywatny arkusz [ŚDM 2027 – dane osobowe (PRYWATNE)](https://docs.google.com/spreadsheets/d/1yTlwsYqsuSs5nvESWlcCOPF_yIC-4dyoUllngWTmjuo/edit). To jest inny plik niż publiczny arkusz z trasą i kosztami.

2. W menu wybierz **Rozszerzenia → Apps Script**. Otworzy się edytor z plikiem `Code.gs`. Skasuj przykładową treść (`function myFunction() { … }`).

3. Wklej całą zawartość pliku `Panel.gs` z tego folderu. Możesz zmienić nazwę pliku na `Panel` (menu z trzema kropkami przy nazwie pliku → **Zmień nazwę**). Zapisz ikoną dyskietki albo `Ctrl+S`.

4. Po lewej, obok **Pliki**, kliknij **+** → **HTML**. Jako nazwę podaj dokładnie `panel` (bez końcówki `.html`). Wklej całą zawartość pliku `panel.html`. Zapisz.

5. W prawym górnym rogu kliknij **Wdróż → Nowe wdrożenie**. Przy „Wybierz typ” kliknij ikonę koła zębatego → **Aplikacja internetowa**. Ustaw:
   - **Opis:** `Panel organizatorów ŚDM 2027`
   - **Wykonuj jako:** *Użytkownik uzyskujący dostęp do aplikacji internetowej*
   - **Kto ma dostęp:** *Wszyscy użytkownicy posiadający konto Google*
   
   Kliknij **Wdróż**.

6. Przy pierwszym wdrożeniu Google poprosi o zgodę. Kliknij **Autoryzuj dostęp** → wybierz swoje konto → **Zaawansowane** → **Przejdź do … (niebezpieczne)** (projekt jest nieweryfikowany, to normalne) → **Zezwól**.

7. Skopiuj **adres URL aplikacji internetowej**. Wklej go w publicznym arkuszu, na karcie **Ustawienia**, w wierszu `privatePanelUrl`. (Możesz też wpisać ten sam adres w `data/data.json`, pole `meta.privatePanelUrl` — na wypadek, gdy arkusz nie jest jeszcze opublikowany jako CSV.) Po odświeżeniu strony organizatorów w zakładce **Budżet i wpłaty** pojawi się aktywny przycisk.

8. Udostępnij **prywatny** arkusz wyłącznie organizatorom: przycisk **Udostępnij** → wpisz ich adresy Gmail. Rola **Edytor**, jeśli mają dopisywać wpłaty; **Czytelnik**, jeśli wystarczy podgląd. **Nie zaznaczaj** „Każdy, kto ma link”. **Nie publikuj** tego arkusza w internecie (**Plik → Udostępnij → Opublikuj w internecie**). Osoba bez udostępnienia zobaczy w panelu komunikat o braku dostępu, nawet gdy zna adres web appa.

## Późniejsze zmiany w skrypcie

**Wdróż → Zarządzaj wdrożeniami →** ikona ołówka → **Wersja: Nowa wersja → Wdróż**. Adres URL zostaje ten sam.

Przed wpisywaniem prawdziwych danych usuń wiersze oznaczone **PRZYKŁAD – usuń** na kartach Uczestnicy i Wpłaty.

## Lista jadących (16.11.2026)

Źródłem listy jest arkusz **„Lista Seul 27”** (https://docs.google.com/spreadsheets/d/1SEGl2NcbZMEkPQN7qO5v2knHl6xCdRRdZCIlYKK3stg/edit), pierwsza karta. Listę edytuje się tylko tam. Panel ją czyta i łączy z kartą Wpłaty prywatnego arkusza.

1. Udostępnij „Lista Seul 27” tym samym organizatorom co prywatny arkusz (edycja albo podgląd).
2. Wklej na nowo `Panel.gs` i `panel.html` w Apps Script **prywatnego arkusza** i wdróż **nową wersję** (Wdróż → Zarządzaj wdrożeniami → edytuj → Wersja: nowa). Przy autoryzacji zgódź się na dostęp do arkuszy.
3. Otwórz panel jako edytor listy. Za pierwszym razem panel sam:
   - nazwie kolumnę z uwagami („nieletnia”, „zgłosiła rezygnację”) nagłówkiem `uwagi`,
   - dopisze na końcu brakujące kolumny: id, lista, płeć, data urodzenia, opiekun, bilet, paszport ważny do, K-ETA, Visit Japan Web, ubezpieczenie, zgody, regulamin podpisany, zgoda rodziców, uwagi zdrowotne/dieta,
   - nada każdej osobie stałe `id` (U001…). Tego id używaj w karcie Wpłaty przy wpłatach imiennych.
   Istniejących kolumn i danych nie zmienia.
4. Lista główna / rezerwowa / rezygnacja: jeśli kolumna `lista` jest pusta, panel liczy ją sam — z numerem = główna, bez numeru = rezerwowa, „rezygn” w uwagach = rezygnacja. Wpisanie wartości w kolumnie `lista` ma pierwszeństwo.
5. Terminy, po których brak zmienia się z „do zrobienia” na „po terminie”, i harmonogram rat są na początku `Panel.gs` (`TERMINY`, `RATY`). ID arkuszy: `ARKUSZ_ID` (prywatny) i `LISTA_ID` (lista) — albo właściwości skryptu o tych nazwach.

Plik `Uczestnicy_do_importu.xlsx` z czatu nie jest już potrzebny — usuń go.
