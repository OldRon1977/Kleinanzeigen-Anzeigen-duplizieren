---
inclusion: always
---

# Projekt-Index: Kleinanzeigen Duplizieren

## Übersicht

Tampermonkey Userscript zum Duplizieren und Smart-Neu-Einstellen von Kleinanzeigen-Inseraten. Vanilla JavaScript, keine Dependencies.

## Pflicht-Lektüre vor Änderungen

| Bereich | Datei | Lesen wenn... |
|---|---|---|
| Übersicht | README.md | Einstieg ins Projekt |
| Installation | INSTALL.md | Setup oder Deployment geändert wird |
| Security | SECURITY.md | Sicherheitsrelevante Änderungen |
| Testing | TESTING_GUIDE.md | Tests geschrieben oder geändert werden |
| Testergebnisse | TEST_RESULTS.md | Nach Testläufen zum Vergleich |
| Code Review | FINAL_CODE_REVIEW.md | Vor größeren Refactorings |
| Verbesserungen | IMPROVEMENTS.md | Neue Features geplant werden |

## Projektstruktur

```
Kleinanzeigen-Anzeigen-duplizieren/
├── kleinanzeigen-duplizieren.user.js   # Haupt-Userscript (Tampermonkey)
├── helper.user.js                      # Helper-Funktionen
├── tests/                              # Unit + Integration Tests
├── README.md                           # Projektübersicht
├── INSTALL.md                          # Installationsanleitung
├── SECURITY.md                         # Sicherheitshinweise
├── TESTING_GUIDE.md                    # Test-Anleitung
└── IMPROVEMENTS.md                     # Geplante Verbesserungen
```

## Build & Test

```bash
npm run lint                    # Syntax Check
npm run test                    # Unit + Integration Tests
npm run validate                # Lint + Tests
```
