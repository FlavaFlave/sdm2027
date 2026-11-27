# Zapis ze strony do arkusza (checklista, zatwierdzanie decyzji, odczyt kwot)

Jeden skrypt `Zapis.gs` daje stronie trzy rzeczy:

- strona **czyta** arkusz (koszty, raty, wpłaty zbiorcze, checklista, decyzje) — arkusz **nie musi być publiczny**,
- przy zadaniach z checklisty można **przypisać osobę, odznaczyć „zrobione” i dopisać komentarz**,
- w zakładce Decyzje przycisk **„Zatwierdź jako obowiązujący plan”** zapisuje wybory w kolumnie „Wybrana” i dopisuje wiersz do karty „Historia decyzji”,
- zakładki **„Śpiew i parafie”** i **„Zbiórka”** zapisują osoby, wydarzenia, rozliczenia tacy, parafie, darczyńców i datki — w **osobnym, prywatnym arkuszu** „ŚDM 2027 — Zbiórka (dane osobowe, NIE udostępniać)”. Skrypt sam go zakłada przy pierwszym otwarciu tych zakładek (na Twoim Dysku, bez udostępniania). Strona jadących widzi z niego tylko daty, parafie i notatki (`?action=kalendarz`).

Skrypt podpinasz do arkusza **„ŚDM 2027 – dane strony organizatorów”** (koszty, raty, wpłaty zbiorcze). **Nie** do arkusza z danymi osobowymi.

## Kroki (ok. 5 minut)

1. Otwórz arkusz. Menu **Rozszerzenia → Apps Script**.
2. Usuń przykładową treść pliku `Kod.gs` i wklej całość `Zapis.gs`. Zapisz (`Ctrl+S`).
3. Po lewej **⚙ Ustawienia projektu → Właściwości skryptu → Dodaj właściwość**:
   - Właściwość: `KOD_ORGANIZATOROW`
   - Wartość: dowolne hasło, które podasz organizatorom (np. 8 znaków). Bez niego nikt nie zapisze zmian.
   - (opcjonalnie) Właściwość `KOD_SKARBNIKA` — drugie hasło dla młodych, którzy rozliczają niedziele: pozwala tylko dopisywać osoby i rozliczać wydarzenia. Nie widać z nim kosztów, decyzji ani darczyńców.
4. **Wdróż → Nowe wdrożenie →** koło zębate → **Aplikacja internetowa**:
   - **Wykonuj jako:** *Ja* (właściciel arkusza)
   - **Kto ma dostęp:** *Każdy*
   - **Wdróż**, potem **Autoryzuj dostęp** i zgódź się na dostęp do arkuszy.
5. Skopiuj **adres aplikacji internetowej** (kończy się na `/exec`).
6. Wklej adres w dwóch miejscach i wgraj pliki na GitHuba:
   - w pliku danych organizatorów (`data/org-….json`), sekcja `meta`, pole `"zapisAppUrl"`,
   - w `data/data.json`, sekcja `meta`, pole `"planAppUrl"` — strona jadących pyta skrypt tylko o zatwierdzone opcje (`?action=plan`).
7. Na stronie, przy pierwszym zapisie, każdy organizator wpisuje swoje imię i kod z kroku 3. Strona je zapamięta w tej przeglądarce.

## Dlaczego „Wykonuj jako: Ja” i kod

Strona jest na GitHub Pages, czyli poza Google. Gdyby skrypt działał „jako użytkownik”, przeglądarka musiałaby przekazać logowanie Google do innej domeny, a to zwykle jest blokowane. Dlatego skrypt działa z uprawnieniami właściciela, a zapis chroni kod organizatorów. Bez kodu skrypt zwraca tylko listę zatwierdzonych opcji (dla strony jadących). Cały arkusz (koszty, raty, checklista) — tylko z kodem. Po podłączeniu skryptu możesz wyłączyć udostępnianie arkusza „każdy z linkiem”.

## Po zmianie skryptu

Każda zmiana w `Zapis.gs` wymaga **Wdróż → Zarządzaj wdrożeniami → edytuj → Wersja: nowa**. Adres zostaje ten sam.

Po wersji z 26.11.2026 (zbiórka) przy pierwszym otwarciu zakładki Śpiew Google poprosi o ponowną autoryzację — skrypt zakłada nowy arkusz, więc potrzebuje zgody na tworzenie plików.
