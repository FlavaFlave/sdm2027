# Zapis ze strony do arkusza (checklista, zatwierdzanie decyzji, odczyt kwot)

Jeden skrypt `Zapis.gs` daje stronie trzy rzeczy:

- strona **czyta** arkusz (koszty, raty, wpłaty zbiorcze, checklista, decyzje) — arkusz **nie musi być publiczny**,
- przy zadaniach z checklisty można **przypisać osobę, odznaczyć „zrobione” i dopisać komentarz**,
- w zakładce Decyzje przycisk **„Zatwierdź jako obowiązujący plan”** zapisuje wybory w kolumnie „Wybrana” i dopisuje wiersz do karty „Historia decyzji”.

Skrypt podpinasz do arkusza **„ŚDM 2027 – dane strony organizatorów”** (koszty, raty, wpłaty zbiorcze). **Nie** do arkusza z danymi osobowymi.

## Kroki (ok. 5 minut)

1. Otwórz arkusz. Menu **Rozszerzenia → Apps Script**.
2. Usuń przykładową treść pliku `Kod.gs` i wklej całość `Zapis.gs`. Zapisz (`Ctrl+S`).
3. Po lewej **⚙ Ustawienia projektu → Właściwości skryptu → Dodaj właściwość**:
   - Właściwość: `KOD_ORGANIZATOROW`
   - Wartość: dowolne hasło, które podasz organizatorom (np. 8 znaków). Bez niego nikt nie zapisze zmian.
4. **Wdróż → Nowe wdrożenie →** koło zębate → **Aplikacja internetowa**:
   - **Wykonuj jako:** *Ja* (właściciel arkusza)
   - **Kto ma dostęp:** *Każdy*
   - **Wdróż**, potem **Autoryzuj dostęp** i zgódź się na dostęp do arkuszy.
5. Skopiuj **adres aplikacji internetowej** (kończy się na `/exec`).
6. W pliku `data/data.json` w sekcji `meta` wklej go w pole `"zapisAppUrl": ""` i wgraj plik na GitHuba.
7. Na stronie, przy pierwszym zapisie, każdy organizator wpisuje swoje imię i kod z kroku 3. Strona je zapamięta w tej przeglądarce.

## Dlaczego „Wykonuj jako: Ja” i kod

Strona jest na GitHub Pages, czyli poza Google. Gdyby skrypt działał „jako użytkownik”, przeglądarka musiałaby przekazać logowanie Google do innej domeny, a to zwykle jest blokowane. Dlatego skrypt działa z uprawnieniami właściciela, a zapis chroni kod organizatorów. Czytać może każdy, kto zna adres — w tym arkuszu nie ma danych osobowych.

## Po zmianie skryptu

Każda zmiana w `Zapis.gs` wymaga **Wdróż → Zarządzaj wdrożeniami → edytuj → Wersja: nowa**. Adres zostaje ten sam.
