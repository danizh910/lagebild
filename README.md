# Lagebild – Standort-Briefing für Immobilien

Gib eine Schweizer Adresse ein: Sieben Agenten (Umwelt & Lärm, Mobilität, Familie & Alltag, Nachtleben, Investor & Entwicklung, Risiko, Wohnqualität) bewerten den Standort, ein Moderator fasst zusammen. Jeder Datenpunkt trägt Quelle und Abrufdatum. Bewusst **keine** Preisbewertung in CHF.

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
| `ANTHROPIC_API_KEY` | nein | KI-Begründungen der Agenten und des Moderators |

## Datenquellen und Lizenzen
- geo.admin.ch / swisstopo, BAFU (Lärm, Luft, Aquaprotect, Oberflächenabfluss), ARE (ÖV-Güteklassen, Bauzonen), BFS (Gebäude- und Wohnungsregister), BAG (Radon), BFE (sonnendach.ch), BAK (ISOS), BAV (Haltestellen), BAZL (Fluglärm): Open Government Data, Quellenangabe Pflicht.
- OpenStreetMap über Overpass API: © OpenStreetMap-Mitwirkende, ODbL.

## Stand (Etappe 1)
Fertig: Adresse → Datensammlung → 7 Agenten → Moderator → teilbarer Report mit Karte, Gebäudedaten, Quellen-Tabelle, PDF-Druck, 3-Wochen-Cache.
Offen: Baugesuche Kanton ZH + Kreis-Vergleich (Etappe 3), Clerk-Login und „Meine Analysen“ (Etappe 4), Luftbild-Vergleich und Stau-Faktor (Etappe 5), Limit für anonyme Analysen sobald KI aktiv ist.
