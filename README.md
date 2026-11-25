# Lagebild – Standort-Briefing für Immobilien

Gib eine Schweizer Adresse ein: Acht Agenten (Umwelt & Lärm, Mobilität, Familie & Alltag, Nachtleben, Investor & Entwicklung, Risiko, Wohnqualität, Quartier & Stimmung) bewerten den Standort, ein Moderator fasst zusammen. Jeder Datenpunkt trägt Quelle und Abrufdatum. Bewusst **keine** Preisbewertung in CHF.

- Scores sind regelbasiert (reproduzierbar, `src/lib/agents.ts`). Claude schreibt nur die Begründungen, wenn `ANTHROPIC_API_KEY` gesetzt ist.
- Daten: `src/lib/sources.ts`. Speicherung: Neon (`DATABASE_URL`), eine Tabelle `analyses`, wird automatisch angelegt.
- PDF: Browser-Druck mit Druck-Styles.

## Lokal
```
npm install
npm run dev
npx tsx scripts/collect-check.mts "Langstrasse 4 Zürich"   # Live-Check der Datenquellen
npx tsx src/lib/agents.ts                                    # Check der Score-Regeln
```

## Umgebungsvariablen
| Variable | Pflicht | Wofür |
|---|---|---|
| `DATABASE_URL` | ja | Neon Postgres |
| `GEMINI_API_KEY` | nein | KI-Begründungen über Google Gemini |
| `GEMINI_MODEL` | nein | Gemini-Modell, Standard `gemini-flash-latest` |
| `ANTHROPIC_API_KEY` | nein | KI-Begründungen über Claude (hat Vorrang vor Gemini) |
| `CRON_SECRET` | ja (Prod) | Schützt den täglichen Baugesuch-Import `/api/cron/baugesuche` (Vercel Cron, 05:00 UTC) |
| `ADMIN_PASSWORD` | nein | Passwort für `/admin` (API-Logs, letzte Analysen); ohne ist `/admin` gesperrt |

## Datenquellen und Lizenzen
- geo.admin.ch / swisstopo, BAFU (Lärm, Luft, Aquaprotect, Oberflächenabfluss), ARE (ÖV-Güteklassen, Bauzonen), BFS (Gebäude- und Wohnungsregister), BAG (Radon), BFE (sonnendach.ch), BAK (ISOS), BAV (Haltestellen), BAZL (Fluglärm): Open Government Data, Quellenangabe Pflicht.
- OpenStreetMap über Overpass API (zuerst overpass.osm.ch): © OpenStreetMap-Mitwirkende, ODbL.
- Kanton Zürich: Baugesuche (OGD, Statistisches Amt, Quelle Amtsblatt), täglich importiert und per geo.admin geokodiert. Erstbefüllung: `python -I scripts/gpkg-centroids.py <gpkg> <json>` und `npx tsx --env-file=.env.local scripts/seed-baugesuche.mts <csv> <json>`. Kategorien: `src/lib/baugesuche.ts`, nach Änderungen `scripts/recategorize-baugesuche.mts`.
- Stadt Zürich: Statistische Quartiere (WFS) und Bevölkerungsbefragung 2019–2025 (OGD). Aggregiert mit `python -I scripts/build-zufriedenheit.py <csv> src/data/zh-zufriedenheit.json`.

## Stand (Etappe 1)
Fertig: Adresse → Datensammlung → 7 Agenten → Moderator → teilbarer Report mit Karte, Gebäudedaten, Quellen-Tabelle, PDF-Druck, 3-Wochen-Cache.
Fertig (Etappe 3): Baugesuche Kanton ZH, Quartier-Zufriedenheit Stadt Zürich.
Offen: Kreis-Durchschnitt für Lärm/Luft, Clerk-Login und „Meine Analysen“ (Etappe 4), Luftbild-Vergleich und Stau-Faktor (Etappe 5), Limit für anonyme Analysen sobald KI aktiv ist.
