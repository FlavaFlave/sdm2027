# Wdrożenie zapisu checklisty (opcjonalne)

Strona publiczna działa bez tego skryptu: pokazuje checklistę i link **Edytuj w arkuszu**. Ten web app jest tylko wygodą — żeby zaznaczyć „zrobione”, osobę i komentarz bez otwierania siatki arkusza.

To jest **inny** skrypt niż prywatny panel danych osobowych. Wpinasz go do **publicznego** arkusza „ŚDM 2027 – dane strony organizatorów”, nie do arkusza z nazwiskami.

1. Otwórz publiczny arkusz. Menu **Rozszerzenia → Apps Script**.
2. Jeśli w tym pliku jest już inny skrypt, użyj **Projekt → Nowy projekt** albo osobnego pliku, żeby nie nadpisać nic innego. Wklej `Checklista.gs`.
3. **+ → HTML**, nazwa dokładnie `checklista`. Wklej `checklista.html`. Zapisz (`Ctrl+S`).
4. **Wdróż → Nowe wdrożenie →** koło zębate → **Aplikacja internetowa**.
   - **Wykonuj jako:** *Użytkownik uzyskujący dostęp do aplikacji internetowej*
   - **Kto ma dostęp:** *Wszyscy użytkownicy posiadający konto Google*
   - **Wdróż** i w razie potrzeby **Autoryzuj dostęp**.
5. Skopiuj URL aplikacji. W publicznym arkuszu, karta **Ustawienia**, dodaj wiersz o kluczu `checklistAppUrl` i wklej ten adres (albo wpisz go w `data/data.json` jako `meta.checklistAppUrl`).
6. Udostępnij publiczny arkusz organizatorom jako **Edytor**, jeśli mają zaznaczać zadania. Osoba bez uprawnień zapisu zobaczy tylko podgląd.

Bez tych kroków nic się nie psuje — checklista na stronie zostaje w trybie tylko do odczytu.
