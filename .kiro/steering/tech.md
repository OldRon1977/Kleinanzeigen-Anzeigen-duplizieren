---
inclusion: always
---

# Tech: Kleinanzeigen-Anzeigen-duplizieren

## Stack

- Sprache: Vanilla JavaScript (keine Dependencies)
- Plattform: Tampermonkey (Userscript)
- Hauptscript: `@grant none`
- Helper: `@grant GM_openInTab` (zuverlaessiges Tab-Schliessen im Batch-Modus)

## Build

```bash
npm run build                   # Synchronisiert @version-Header aus package.json
npm run lint                    # Syntax-Check via node -c
npm run validate                # build + lint
```

Tests existieren nicht. Vorherige Test-Suite hat lokale Mocks gegen lokale Mocks
geprueft, ohne den Userscript-Code zu importieren, und wurde 2026-05 entfernt.
Neue Tests muessten echte Helper aus den Userscripts ziehen (Build-Bundling).