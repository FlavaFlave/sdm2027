"""Excele Groka (kościoły + biskupi, noclegi grupowe) → data/kontakty.json. Dane publiczne instytucji."""
import openpyxl, json, re, sys, hashlib
KOS, NOC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
def brak(v):
    s = "" if v is None else str(v).strip()
    return "" if not s or s.lower().startswith("brak") else s
def num(v):
    try: return float(v)
    except Exception: return None
def hid(prefix, *parts): return prefix + "-" + hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()[:8]
def path(v):
    s = str(v or "").lower()
    return "A" if s.startswith("a") else "B" if s.startswith("b") else "obie"

wb = openpyxl.load_workbook(KOS)
koscioly = {}
for t, kraj in [("Kościoły — Japonia", "Japonia"), ("Kościoły — Korea", "Korea")]:
    ws = wb[t]; H = [c.value for c in ws[1]]
    for r in ws.iter_rows(min_row=2, values_only=True):
        g = dict(zip(H, r))
        name = brak(g.get("Kościół (EN / JP)") or g.get("Kościół (EN / KR)"))
        if not name: continue
        cid = hid("K", name, g.get("Adres"))
        stop = {"dzien": str(g.get("Dzień") or ""), "sciezka": path(g.get("Ścieżka (A/B/obie)")), "punkt": str(g.get("Punkt trasy") or ""),
                "rola": "nocleg" if "nocleg" in str(g.get("Rola (nocleg = wieczorna Msza / zwiedzanie)") or "") else "zwiedzanie", "odl": num(g.get("Odległość od punktu (km)"))}
        if cid in koscioly:
            koscioly[cid]["przystanki"].append(stop); continue
        koscioly[cid] = {"id": cid, "kraj": kraj, "nazwa": name, "adres": brak(g.get("Adres")), "lat": num(g.get("Szerokość")), "lng": num(g.get("Długość")),
            "diecezja": brak(g.get("Diecezja")), "proboszcz": brak(g.get("Proboszcz")), "tel": brak(g.get("Telefon")), "email": brak(g.get("E-mail / formularz kontaktowy")),
            "www": brak(g.get("WWW")), "msze": brak(g.get("Godziny Mszy niedzielnych i powszednich")), "pojemnosc": brak(g.get("Pojemność kościoła")),
            "sala": brak(g.get("Czy jest sala parafialna")), "angielski": brak(g.get("Kontakt po angielsku możliwy")), "zrodlo": brak(g.get("Źródło")).split("\n")[0],
            "przystanki": [stop]}
ws = wb["Biskupi"]; H = [c.value for c in ws[1]]
biskupi = []
for r in ws.iter_rows(min_row=2, values_only=True):
    g = dict(zip(H, r))
    if not g.get("Diecezja (PL / EN / JP lub KR)"): continue
    biskupi.append({"id": hid("B", g["Diecezja (PL / EN / JP lub KR)"]), "diecezja": g["Diecezja (PL / EN / JP lub KR)"], "biskup": brak(g.get("Biskup (tytuł, imię, nazwisko)")),
        "od": brak(g.get("Od kiedy")), "pomocniczy": brak(g.get("Biskup pomocniczy (jeśli jest)")), "kanclerz": brak(g.get("Kanclerz kurii / sekretarz")),
        "adres": brak(g.get("Adres kurii")), "tel": brak(g.get("Telefon")), "email": brak(g.get("E-mail")), "www": brak(g.get("WWW")),
        "jezyk": brak(g.get("Język kontaktu")), "uwagi": brak(g.get("Uwagi")), "zrodlo": brak(g.get("Źródło z datą sprawdzenia")).split("\n")[0]})
wb = openpyxl.load_workbook(NOC)
noclegi = []
for t, kraj in [("Noclegi — Japonia", "Japonia"), ("Noclegi — Korea", "Korea")]:
    ws = wb[t]; H = [c.value for c in ws[1]]
    for r in ws.iter_rows(min_row=2, values_only=True):
        g = dict(zip(H, r))
        name = brak(g.get("Nazwa obiektu (EN / JP lub KR)"))
        cat = str(g.get("Status / Kategoria") or "")
        if not name or cat.startswith("Obecna opcja") or "ZAMKNI" in name.upper(): continue
        noclegi.append({"id": hid("N", name, g.get("Adres")), "kraj": kraj, "noce": str(g.get("Noce / Daty") or ""), "sciezka": path(g.get("Ścieżka (A/B/obie)")),
            "punkt": str(g.get("Punkt noclegowy") or ""), "kategoria": cat, "nazwa": name, "adres": brak(g.get("Adres")), "lat": num(g.get("Szerokość")), "lng": num(g.get("Długość")),
            "odl": num(g.get("Odległość od punktu (km)")), "pojemnosc": brak(g.get("Pojemność (osób / pokoi)")), "miesci90": brak(g.get("Zmieści 90 osób na raz")),
            "cena": brak(g.get("Orientacyjna cena / os. / noc")), "parking": brak(g.get("Parking dla 2 autokarów")), "jedzenie": brak(g.get("Wyżywienie / stołówka")),
            "tel": brak(g.get("Telefon")), "email": brak(g.get("E-mail / formularz")), "www": brak(g.get("WWW")), "angielski": brak(g.get("Kontakt po angielsku")),
            "uwagi": brak(g.get("Uwagi (Obon, rezerwacja, warunki)")), "zrodlo": brak(g.get("Źródło")).split("\n")[0]})
# obiekty wybrane w planie (27.11.2026)
WYBRANE = ["Isahaya", "Shin-Osaka Youth Hostel", "Central Park Training Center", "Hotel Iroha", "YMCA Tozanso", "Matsushima Nature Retreat", "Taishikan"]
for n in noclegi:
    n["w_planie"] = any(w.lower() in n["nazwa"].lower() for w in WYBRANE)
meta = {"zrodlo": "Grok, XI 2026: katalogi diecezji (cbcj.catholic.jp, cbck.or.kr), strony obiektów; biskupów sprawdził Claude 27.11.2026 (Hiroszima i Osaka — rezygnacje wg Groka, niepotwierdzone)",
        "liczba": {"koscioly": len(koscioly), "noclegi": len(noclegi), "biskupi": len(biskupi)}}
json.dump({"meta": meta, "koscioly": list(koscioly.values()), "noclegi": noclegi, "biskupi": biskupi}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(meta["liczba"], sum(n["w_planie"] for n in noclegi))
