# Wdrożenie prywatnego panelu organizatorów

Panel pokazuje nazwiska i wpłaty imienne **tylko** osobom, którym udostępniono prywatny arkusz „ŚDM 2027 – dane osobowe (PRYWATNE)”. Dane osobowe nie mogą trafić na stronę publiczną, do GitHub Pages ani do ZIP-a dla innych AI.

## Osiem kroków

1. Otwórz prywatny arkusz [ŚDM 2027 – dane osobowe (PRYWATNE)](https://docs.google.com/spreadsheets/d/1WSchAIbuUpfZtqEY6Xd8Mvj_-Ap8-ckFXx0AgttHpKo/edit). To jest inny plik niż publiczny arkusz z trasą i kosztami.

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
