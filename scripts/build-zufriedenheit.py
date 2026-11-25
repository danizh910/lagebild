"""Aggregate the Stadt Zürich Bevölkerungsbefragung (OGD, ab 2019) per Stadtquartier.

Usage: python -I scripts/build-zufriedenheit.py <BEV473OD4732.csv> src/data/zh-zufriedenheit.json
Answers are text labels ("Note 5", "Eher sicher"); areas are keyed by Quartier name ("Kreis 1" = whole Kreis 1).
Source: https://data.stadt-zuerich.ch/dataset/prd_stez_bevoelkerungsbefragungen_seit2019_od4732
Grades 1-6 -> weighted mean (pgewicht). Recent = 2023+2025, earlier = 2019+2021 (for the trend).
"""
import csv, json, re, sys
from collections import defaultdict

GRADES = {  # variable -> label (scale 1..6)
    "A2002aa01": "Lebensqualität",
    "A3012aa01": "Wohnumgebung",
    "A3016aa01": "Nachbarschaft",
    "A3016ai01": "Ruhe im Quartier",
    "A3016ae01": "Grünraum",
    "A3016af01": "Sauberkeit",
    "A3016ah01": "Öffentliche Sicherheit",
    "A3016ag01": "Verkehrssicherheit",
    "A3016ad01": "Freizeit im Quartier",
    "A5005aa01": "ÖV",
}
SAFE = "A4001aa01"  # 1-4 unsafe..safe, 5/6 = never out at night (excluded)
RECENT, EARLIER = {"2023", "2025"}, {"2019", "2021"}

SAFE_MAP = {"Sehr unsicher": 0.0, "Eher unsicher": 0.0, "Eher sicher": 1.0, "Sehr sicher": 1.0}

def grade(x):
    m = re.match(r"Note ([1-6])", x or "")
    return int(m.group(1)) if m else None

acc = defaultdict(lambda: [0.0, 0.0, 0])  # key -> [sum w*x, sum w, n]

def add(key, x, w):
    a = acc[key]; a[0] += x * w; a[1] += w; a[2] += 1

for r in csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")):
    period = "recent" if r["Jahr"] in RECENT else "earlier" if r["Jahr"] in EARLIER else None
    q = r["A1BVSQuar03"].strip()
    if not period or not q or q == "Keine Angabe":
        continue
    w = float(r["pgewicht"] or 0) or 1.0
    for v in GRADES:
        g = grade(r.get(v))
        if g:
            for area in (q, "stadt"):
                add((area, period, v), g, w)
    x = SAFE_MAP.get(r.get(SAFE, ""))
    if x is not None:
        for area in (q, "stadt"):
            add((area, period, SAFE), x, w)

def val(area, period, v):
    s, w, n = acc.get((area, period, v), (0, 0, 0))
    return (round(s / w, 2), n) if n >= 30 else (None, n)  # too few answers -> no value

areas = sorted({k[0] for k in acc})
out = {"source": "Stadt Zürich, Bevölkerungsbefragung (OGD) 2019–2025", "labels": {**GRADES, SAFE: "Nachts sicher im Quartier (Anteil)"}, "areas": {}}
for a in areas:
    entry = {}
    for v in [*GRADES, SAFE]:
        recent, n = val(a, "recent", v)
        earlier, _ = val(a, "earlier", v)
        entry[v] = {"wert": recent, "n": n, "trend": round(recent - earlier, 2) if recent is not None and earlier is not None else None}
    out["areas"][a] = entry
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
