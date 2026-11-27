"""Excel Groka → data/parafie.json (publiczne dane z baz diecezji + RCN). Uruchamiać przy każdej nowej wersji pliku."""
import openpyxl, re, json, sys
SRC = sys.argv[1]; OUT = sys.argv[2]
wb = openpyxl.load_workbook(SRC)
TITLES = {"ksiądz", "ks.", "ojciec", "o.", "kanonik", "prałat", "dr", "hab.", "prof.", "akw", "bp", "abp", "mgr", "kan.", "płk", "ppłk.", "ppłk", "płk."}
def first_names(ws, col):
    """Imiona z arkusza archidiecezji (tam kolejność to Imię Nazwisko) — do rozpoznania odwróconej kolejności w drugim arkuszu."""
    out = set()
    for r in ws.iter_rows(min_row=2, values_only=True):
        toks = [t for t in str(r[col] or "").split() if t.lower().strip(",") not in TITLES]
        if toks: out.add(toks[0])
    return out
def norm_proboszcz(v, names):
    v = str(v or "").strip()
    if not v or v.lower().startswith("brak"): return ""
    adm = " (adm.)" if "(adm.)" in v else ""
    v = v.replace("(adm.)", "").strip()
    toks = v.split()
    pre = []
    while toks and toks[0].lower().strip(",") in TITLES: pre.append(toks.pop(0))
    order = [t for t in toks if not (t.isupper() and len(t) <= 5)]  # bez skrótów zakonów (SAC, CSMA, OP)
    zak = [t for t in toks if t.isupper() and len(t) <= 5]
    if len(order) >= 2 and order[0] not in names and order[1] in names:   # „Kowalski Jan Maria” → „Jan Maria Kowalski”
        order = order[1:] + order[:1]
    pre = [{"ksiądz": "ks.", "ks.": "ks.", "ojciec": "o.", "o.": "o."}.get(t.lower(), t) for t in pre]
    return " ".join(pre + order + zak) + adm
NAMES = set()
_ws = wb["Archidiecezja Warszawska"]; _H = [c.value for c in _ws[1]]
if "Proboszcz" in _H: NAMES = first_names(_ws, _H.index("Proboszcz"))
NAMES |= {"Jan", "Józef", "Stanisław", "Andrzej", "Krzysztof", "Piotr", "Tomasz", "Marek", "Paweł", "Adam", "Jerzy", "Wojciech", "Zbigniew", "Ryszard", "Tadeusz", "Henryk", "Kazimierz", "Marcin", "Michał", "Jacek", "Grzegorz", "Dariusz", "Mirosław", "Witold", "Bogusław", "Zdzisław", "Leszek", "Sławomir", "Jarosław", "Robert", "Rafał", "Łukasz", "Mariusz", "Waldemar", "Wiesław", "Zenon", "Edward", "Emil", "Przemysław", "Maciej", "Fabian", "Arkadiusz", "Dominik", "Kamil", "Sylwester", "Roman", "Janusz", "Lech", "Bartosz", "Damian", "Daniel", "Jakub", "Karol", "Mateusz", "Radosław", "Szymon", "Artur", "Bogdan", "Eugeniusz", "Franciszek", "Ireneusz", "Krystian", "Lucjan", "Ludwik", "Norbert", "Sebastian", "Wacław", "Władysław", "Zygmunt", "Antoni", "Czesław", "Dawid", "Wiktor", "Konrad", "Hubert", "Ignacy", "Patryk", "Seweryn", "Stefan", "Mieczysław", "Wit", "Bronisław", "Bernard", "Cezary", "Marian", "Leon", "Feliks", "Zbysław", "Gerard"}
out = []
for t, code, dname in [("Archidiecezja Warszawska", "A", "warszawska"), ("Diecezja Warszawsko-Praska", "P", "warszawsko-praska")]:
    ws = wb[t]; H = [c.value for c in ws[1]]; I = {h: i for i, h in enumerate(H)}
    for row in ws.iter_rows(min_row=2):
        v = [c.value for c in row]
        g = lambda k: v[I[k]] if k in I else None
        link = row[0].hyperlink.target if row[0].hyperlink else ""
        slug = re.sub(r"/+$", "", link).split("/")[-1] if link else re.sub(r"\W+", "-", str(g("Nazwa parafii")).lower())
        name = str(g("Nazwa parafii")).strip()
        # Miejscowość: „Warszawa. Św. X” albo „WARSZAWA (Grochów), Parafia X”
        if code == "A":
            m = re.match(r"^([^.]+)\.\s*(.+)$", name); miej, naz = (m.group(1).strip(), m.group(2).strip()) if m else ("", name)
        else:
            m = re.match(r"^([^,]+),\s*(.+)$", name); miej, naz = (m.group(1).strip().title(), m.group(2).strip()) if m else ("", name)
            naz = re.sub(r"^[Pp]arafia\s+", "", naz)
        msze = str(g("Msze niedzielne") or "")
        msze_n = 0 if msze.lower().startswith("brak") else len(re.findall(r"\b\d{1,2}[:.]\d{2}\b", re.sub(r"\([^)]*\)", "", msze)))
        pod = str(g("Podstawa rankingu") or "")
        parts = re.findall(r"([^+−\-]*?)\(([+−\-])(\d)\)", pod)
        raw_wsp = 1 + sum((int(n) if s == "+" else -int(n)) for lab, s, n in parts if "wiernych" not in lab)
        bonus_w = sum(int(n) for lab, s, n in parts if "wiernych" in lab)
        zam = str(g("Zamożność okolicy") or "")
        mz = re.match(r"\s*([\d\s ]+)\s*zł/m²\s*[–-]\s*(\w+)\s+(.*?)\s*\((.*)\)\s*$", zam)
        cena = int(re.sub(r"\D", "", mz.group(1))) if mz else None
        wier = g("Liczba wiernych")
        brak = lambda x: "" if x is None or str(x).strip().lower().startswith("brak") else str(x).strip()
        out.append({
            "id": f"{code}-{slug}", "nazwa": naz, "miejscowosc": miej, "dekanat": str(g("Dekanat") or ""), "diecezja": dname,
            "adres": str(g("Miasto / adres") or ""), "lat": g("Szerokość (lat)"), "lng": g("Długość (lon)"),
            "odl_km": g("Odległość od par. św. Zygmunta (km)"), "msze": brak(msze), "msze_n": msze_n,
            "wierni": wier if isinstance(wier, (int, float)) else None, "zakon": str(g("Klasztor / zamknięta / pustostan") or "") == "tak",
            "rank_diec": g("Ranking punktowy (1-10)"), "rank_wsp": max(1, min(10, raw_wsp)), "bonus_wierni": bonus_w, "podstawa": pod,
            "proboszcz": norm_proboszcz(g("Proboszcz"), NAMES),
            "tel": brak(g("Telefon kontaktowy")), "email": brak(g("E-mail")), "www": brak(g("WWW parafii")), "baza": link,
            "cena_m2": cena, "cena_poziom": mz.group(2) if mz else "", "cena_obszar": mz.group(3) if mz else "", "cena_zrodlo": mz.group(4) if mz else "",
        })
# Potencjał zbiórki [szacunek]: 60% frekwencja (liczba Mszy, do 10) + 40% zamożność (cena m² w skali min–max całej listy)
ceny = [p["cena_m2"] for p in out if p["cena_m2"]]
lo, hi = min(ceny), max(ceny)
for p in out:
    f = min(p["msze_n"], 10) / 10
    z = (p["cena_m2"] - lo) / (hi - lo) if p["cena_m2"] else 0.3
    p["potencjal"] = round(60 * f + 40 * z)
meta = {"zrodlo": "Grok, z baz diecezji archwwa.pl i diecezja.waw.pl oraz RCN GUGiK 2025 (ceny m²); stan 26–27.11.2026",
        "ranking_wspolny": "1 + Msze niedzielne (0–6) + Warszawa (+1) + własna strona/FB (+1) − zakonna/specjalna (−1); bez punktów za liczbę wiernych, bo archidiecezja warszawska ich nie podaje",
        "potencjal": f"[szacunek] 0–100: 60% z liczby niedzielnych Mszy (do 10), 40% z ceny m² w okolicy ({lo}–{hi} zł/m²)",
        "liczba": len(out)}
json.dump({"meta": meta, "parafie": out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
import collections
print(len(out), "ids unique", len({p["id"] for p in out}) == len(out))
print(collections.Counter(p["rank_wsp"] for p in out))
top = sorted(out, key=lambda p: (-p["rank_wsp"], -p["potencjal"]))[:40]
print("top40 A/P", sum(p["id"][0] == "A" for p in top), sum(p["id"][0] == "P" for p in top))
for p in top[:6]: print(p["rank_wsp"], p["potencjal"], p["miejscowosc"], p["nazwa"], p["cena_m2"])
print("miej empty", [p["nazwa"] for p in out if not p["miejscowosc"]][:5])
