# Security Audit Report - Kleinanzeigen Anzeigen Duplizieren (ÜBERARBEITET)

**Projekt:** eBay Kleinanzeigen - Anzeige duplizieren / Smart neu einstellen
**Version:** 3.1.3
**Ursprüngliches Audit:** 2026-02-07 (Claude Code / Sonnet 4.5)
**Experten-Review:** 2026-02-07
**Audit-Standard:** ISO 27001:2022, ISO 27002:2022, OWASP Top 10, CWE Top 25

---

## Vorwort zum Experten-Review

Das ursprüngliche Security-Audit wurde von Claude Code (Sonnet 4.5) durchgeführt und hat ISO 27001/27002-Checklisten mechanisch auf ein **~360-Zeilen Tampermonkey-UserScript** eines Einzelentwicklers angewendet. Viele der 18 ursprünglichen Findings ignorieren den tatsächlichen Bedrohungskontext:

**Kritische Kontextfaktoren, die das Original-Audit übersieht:**

1. **Ausführungskontext:** Das Script läuft im Browser des Nutzers, auf der Seite von kleinanzeigen.de, mit `@grant none` – es hat exakt die gleichen Rechte wie die Seite selbst.
2. **Angriffsfläche:** Es gibt keinen externen Angreifer, der mit dem Script interagiert. Der einzige "Input" kommt aus dem DOM der Seite, die vom Server generiert wird.
3. **Single-Developer Hobby-Projekt:** ISO 27001-Organisationskontrollen (Asset-Inventar, Business Continuity, Supplier Assessment) sind für ein Unternehmen konzipiert, nicht für ein Open-Source-UserScript.
4. **Zero Dependencies:** Das Projekt hat null npm-Dependencies – Supply-Chain-Risiken aus dem Dependency-Graph existieren nicht.

**Ergebnis des Reviews:** Von 18 ursprünglichen Findings sind **4 tatsächlich relevant und umsetzbar**, **3 sind sinnvolle Verbesserungen (Low)**, und **11 sind entweder False Positives, nicht anwendbar oder technisch nicht umsetzbar** im UserScript-Kontext.

---

## Revidierte Executive Summary

| Kategorie | Original-Audit | Nach Review | Anmerkung |
|-----------|---------------|-------------|-----------|
| Critical | 2 | 0 | Beide technisch nicht umsetzbar in Tampermonkey |
| High | 4 | 0 | 2× False Positive, 2× auf Low herabgestuft |
| Medium | 7 | 2 | Nur Input-Validierung und Session-Handling relevant |
| Low | 5 | 3 | 3 sinnvolle, leicht umsetzbare Verbesserungen |
| Informational | 0 | 6 | Herabgestufte Findings (kein Handlungsbedarf) |
| Nicht anwendbar | 0 | 7 | ISO-Org-Kontrollen, GDPR, SBOM etc. |
| **Gesamt** | **18** | **18** | Davon **5 umsetzbar**, Rest dokumentiert |

---

## Findings by Severity (Revidiert)

---

### ~~CRITICAL~~ Findings → Herabgestuft

#### CRIT-001: ~~Fehlende Subresource Integrity (SRI)~~ → NICHT UMSETZBAR
**Original-Severity:** Critical → **Revidiert: Informational (NICHT UMSETZBAR)**
**CWE:** CWE-494

**Experten-Bewertung:**

Das Finding klingt ernst, ist aber im Tampermonkey-Kontext **technisch nicht umsetzbar**:

- **Tampermonkey unterstützt kein `@updateHash`** – das ist keine gültige Direktive im UserScript-Standard. Der Vorschlag im Original-Audit ist fiktiv.
- Das Update-Verfahren wird vollständig von **Tampermonkey kontrolliert**, nicht vom Script. Tampermonkey vergleicht `@version`-Nummern und lädt über HTTPS.
- **HTTPS schützt gegen MITM** – GitHub liefert über TLS aus.
- Bei einem kompromittierten Repository hilft SRI nicht, weil der Hash in derselben Datei stehen müsste, die kompromittiert wurde (Zirkelschluss).
- Tampermonkey zeigt dem Nutzer den neuen Code vor der Installation und fragt nach Bestätigung.

**Reale Mitigation:** GitHub-Account mit 2FA absichern (ist eine organisatorische Maßnahme, keine Code-Änderung).

**Status: 🔒 NICHT BEHEBBAR** – Liegt außerhalb der Kontrolle des Scripts. Tampermonkey müsste als Plattform SRI implementieren.

---

#### CRIT-002: ~~Code-Signing~~ → NICHT UMSETZBAR
**Original-Severity:** Critical → **Revidiert: Informational (NICHT UMSETZBAR)**
**CWE:** CWE-347

**Experten-Bewertung:**

- **Tampermonkey hat kein Code-Signing-Verfahren für UserScripts.** Es gibt schlicht keine Infrastruktur dafür.
- GPG-Signaturen neben dem Script wären nur manuell verifizierbar – kein Nutzer wird das tun.
- Der UserScript-Ökosystem-Standard (Greasy Fork, OpenUserJS) bietet ebenfalls kein Signing.

**Status: 🔒 NICHT BEHEBBAR** – Kein Mechanismus in der gesamten UserScript-Plattform vorhanden.

---

### ~~HIGH~~ Findings → Herabgestuft / False Positive

#### HIGH-001: ~~Unzureichende CSRF-Token Validierung~~ → False Positive
**Original-Severity:** High → **Revidiert: Informational (FALSE POSITIVE)**
**CWE:** CWE-352

**Experten-Bewertung:**

Das Finding misversteht die Rolle des Scripts:

- Das Script **liest** den CSRF-Token aus dem Meta-Tag der Seite und **sendet ihn zurück** an denselben Server. Das Script ist nicht für CSRF-Schutz verantwortlich – **das ist die Aufgabe des Servers**.
- Client-seitige Format-Validierung eines Tokens ist **Security Theater**: Wenn der Server einen ungültigen Token liefert, wird der Server ihn selbst ablehnen.
- Ein leerer String `''` geht übrigens NICHT durch – `if (!token)` fängt auch leere Strings ab, da `!''` = `true` in JavaScript.
- Die vorgeschlagene Regex `/^[A-Za-z0-9_-]{32,}$/` ist gefährlich: Wenn Kleinanzeigen ihr Token-Format ändert (z.B. auf Base64 mit `=` oder `+`), bricht das Script.

**Status: ✅ KEIN HANDLUNGSBEDARF** – Die aktuelle Implementierung ist korrekt für den Anwendungsfall.

---

#### HIGH-002: ~~Fehlende Input-Validierung für Anzeigen-ID~~ → Low
**Original-Severity:** High → **Revidiert: Low (UMSETZBAR)**
**CWE:** CWE-20

**Experten-Bewertung:**

Die adId kommt aus einem **von kleinanzeigen.de serverseitig gesetzten Hidden-Input-Feld** (`#postad-id`). Es gibt keinen externen Angreifer, der diesen Wert kontrolliert. Trotzdem ist eine einfache numerische Validierung als **Defense-in-Depth** sinnvoll – sie kostet 3 Zeilen Code und schadet nicht.

**Angemessener Fix (statt der überengineerten Version im Original):**
```javascript
async function deleteAd(adId) {
    if (!adId || !/^\d{1,20}$/.test(adId)) {
        throw new Error('Ungültige Anzeigen-ID');
    }
    // ... rest bleibt gleich
}
```

**Status: ✅ UMSETZBAR** – Einfacher 3-Zeilen-Fix als Defense-in-Depth. Severity ist aber Low, nicht High.

---

#### HIGH-003: ~~Hardcodierte API-Endpunkte~~ → False Positive
**Original-Severity:** High → **Revidiert: FALSE POSITIVE**
**CWE:** CWE-798 (falsch angewendet)

**Experten-Bewertung:**

- **CWE-798 betrifft hardcodierte CREDENTIALS (Passwörter, API-Keys)**, nicht URLs. Der CWE-Verweis ist falsch.
- Ein UserScript, das auf kleinanzeigen.de läuft, **SOLL** die API-URL hardcodiert haben – das ist der einzige Endpunkt, mit dem es kommunizieren darf.
- DNS-Spoofing ist ein Netzwerk-Angriff, den kein Client-Side-Script verhindern kann.
- Eine "Whitelist" für einen einzelnen hardcodierten HTTPS-Endpunkt ist redundant.

**Status: ✅ KEIN HANDLUNGSBEDARF** – Das Finding basiert auf einer falschen CWE-Zuordnung.

---

#### HIGH-004: ~~Error-Handling mit Informationsleckage~~ → Informational
**Original-Severity:** High → **Revidiert: Informational**
**CWE:** CWE-209

**Experten-Bewertung:**

- Die Fehlermeldungen erscheinen **im eigenen Browser des Nutzers**. Es gibt keinen "Angreifer", der sie sieht.
- CWE-209 betrifft Server-Anwendungen, die Stack-Traces an Remote-Clients senden. Ein UserScript, das `error.message` im eigenen Browser anzeigt, ist ein **völlig anderer Kontext**.
- Console-Logging für Debugging ist **erwünscht** – es hilft dem Nutzer und dem Entwickler bei der Fehlersuche.

Einziger valider Punkt: Die Fehlermeldungen könnten etwas nutzerfreundlicher sein (UX, nicht Security).

**Status: ✅ OPTIONAL** – Nutzerfreundlichere Meldungen sind ein UX-Thema, kein Security-Thema.

---

### MEDIUM Findings (Revidiert)

#### MED-001: ~~Content Security Policy~~ → NICHT ANWENDBAR
**Original-Severity:** Medium → **Revidiert: NICHT ANWENDBAR**

**Experten-Bewertung:**

- **Ein UserScript kann keine CSP für die Host-Seite setzen.** CSP wird vom Server via HTTP-Header kontrolliert.
- Ein CSP-Meta-Tag im Script würde von der server-seitigen CSP überschrieben oder ignoriert.
- Nonce-basierte CSS-Injection ist sinnlos, weil das Script die CSP nicht definiert.
- Das injizierte CSS enthält ausschließlich **statische Strings** ohne User-Input – es gibt kein XSS-Risiko.

**Status: 🔒 NICHT BEHEBBAR** – Liegt außerhalb der Kontrolle des Scripts.

---

#### MED-002: ~~Ungeschützte DOM-Manipulation~~ → Informational
**Original-Severity:** Medium → **Revidiert: Informational (MINIMAL)**

**Experten-Bewertung:**

- `spinner.innerHTML = '<div></div>'` ist ein **statischer String ohne jeglichen User-Input**. Kein XSS-Risiko.
- `notification.textContent = message` ist bereits sicher – `textContent` escaped automatisch.
- Das Finding widerspricht sich selbst: Es erkennt an, dass `textContent` sicher ist, bewertet es aber trotzdem als Medium.

**Optionaler Code-Hygiene-Fix (kein Security-Impact):**
```javascript
// Statt innerHTML für den Spinner:
const innerDiv = document.createElement('div');
spinner.appendChild(innerDiv);
```

**Status: ✅ OPTIONAL** – Rein kosmetische Code-Verbesserung. Kein reales Sicherheitsrisiko.

---

#### MED-003: ~~Rate-Limiting~~ → Low
**Original-Severity:** Medium → **Revidiert: Low (OPTIONAL)**

**Experten-Bewertung:**

- Das Script macht **genau 1 API-Call pro Button-Klick** (Löschen). Es gibt keinen Loop oder Batch-Modus.
- Server-seitiges Rate-Limiting ist die **Verantwortung von kleinanzeigen.de**, nicht des Client-Scripts.
- Ein versehentliches Doppelklicken ist durch den Loading-Spinner und die Confirm-Dialoge bereits verhindert.

**Sinnvoller Minimalfix (Button-Disabling statt RateLimiter-Klasse):**
```javascript
dupButton.onclick = (e) => {
    e.preventDefault();
    dupButton.disabled = true;
    duplicateAd();
};
```

**Status: ✅ OPTIONAL** – Button-Disabling ist die angemessene Maßnahme, nicht eine RateLimiter-Klasse.

---

#### MED-004: ~~Security-Event Logging~~ → NICHT ANWENDBAR
**Original-Severity:** Medium → **Revidiert: NICHT ANWENDBAR**

**Experten-Bewertung:**

- Ein `SecurityLogger` mit Correlation-IDs, JSON-Persistierung in localStorage und Export-Funktion für ein 360-Zeilen-UserScript ist **absurdes Overengineering**.
- `console.log/warn/error` IST das richtige Logging-Instrument für ein UserScript.
- "Compliance-Probleme" – mit welcher Compliance? Es gibt keine regulatorische Anforderung an UserScript-Logging.
- localStorage-Logging würde ironischerweise ein **neues Privacy-Problem** schaffen (Nutzerdaten persistent speichern).

**Status: 🔒 NICHT SINNVOLL** – Aktuelles Logging ist angemessen für den Kontext.

---

#### MED-005: ~~SBOM und Dependency-Management~~ → NICHT ANWENDBAR
**Original-Severity:** Medium → **Revidiert: NICHT ANWENDBAR**

**Experten-Bewertung:**

- Das Projekt hat **null Dependencies** (`"devDependencies": {}, "dependencies": {}`).
- Eine SBOM für ein Zero-Dependency-Projekt dokumentiert: nichts.
- Tampermonkey ist keine Code-Dependency, sondern eine **Laufzeitumgebung** (wie der Browser selbst).

**Status: 🔒 NICHT RELEVANT** – Keine Dependencies = kein Supply-Chain-Risiko aus Dependencies.

---

#### MED-006: ~~Security Headers Validierung~~ → Informational
**Original-Severity:** Medium → **Revidiert: Informational**

**Experten-Bewertung:**

- **X-Frame-Options und HSTS werden vom Browser automatisch durchgesetzt** – ein Script muss das nicht prüfen.
- Content-Type-Validierung der API-Response ist der einzige halbwegs sinnvolle Punkt. Da aber `response.json()` bei falschem Content-Type ohnehin einen Fehler wirft, ist es redundant.

**Status: ✅ KEIN HANDLUNGSBEDARF** – Der Browser enforced Security-Headers automatisch.

---

#### MED-007: Session-Management → Low (UMSETZBAR)
**Original-Severity:** Medium → **Revidiert: Low (UMSETZBAR)**

**Experten-Bewertung:**

Dies ist tatsächlich ein **sinnvoller UX-Verbesserungsvorschlag** (nicht primär Security). Wenn die Session abgelaufen ist, bekommt der Nutzer aktuell eine generische Fehlermeldung statt eines hilfreichen Hinweises.

**Angemessener Fix:**
```javascript
if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
        throw new Error('Sitzung abgelaufen – bitte neu einloggen und Seite neu laden.');
    }
    throw new Error(`HTTP ${response.status}`);
}
```

**Status: ✅ UMSETZBAR** – Sinnvolle 3-Zeilen-Verbesserung der Nutzererfahrung.

---

### LOW Findings (Revidiert)

#### LOW-001: SECURITY.md → Low (UMSETZBAR)
**Revidiert: Low – bleibt**

Sinnvoll für jedes öffentliche GitHub-Repository. Einfach zu erstellen, schadet nicht.

**Status: ✅ UMSETZBAR** – Empfohlen als Minimaldatei (10-20 Zeilen reichen).

---

#### LOW-002: .gitignore → Low (UMSETZBAR)
**Revidiert: Low – bleibt**

Standard-Hygiene für jedes Git-Repository.

**Status: ✅ UMSETZBAR** – 5 Minuten Aufwand.

---

#### LOW-003: ~~CODE_OF_CONDUCT.md~~ → NICHT ANWENDBAR
**Original-Severity:** Low → **Revidiert: NICHT ANWENDBAR**

Ein Code of Conduct für ein Ein-Mann-Hobbyprojekt ohne Community-Contributions ist Bürokratie ohne Nutzen.

**Status: 🔒 NICHT RELEVANT** – Erst sinnvoll wenn aktive Contributors hinzukommen.

---

#### LOW-004: Browser-Extension Permissions Dokumentation → Informational
**Revidiert: Informational**

`@grant none` IST die Permissions-Dokumentation – es bedeutet "keine zusätzlichen Rechte". Ein kurzer Hinweis im README ist aber sinnvoll.

**Status: ✅ OPTIONAL** – Ein Satz im README genügt.

---

#### LOW-005: ~~Automatisierte Security-Tests~~ → NICHT ANWENDBAR
**Original-Severity:** Low → **Revidiert: NICHT ANWENDBAR**

SAST, Semgrep, CycloneDX, License-Compliance-Checks in einer GitHub-Actions-Pipeline für ein 360-Zeilen-Script mit null Dependencies? Das ist wie eine TÜV-Inspektion für ein Fahrrad.

**Status: 🔒 NICHT SINNVOLL** – Overhead übersteigt den Nutzen bei Weitem.

---

### Organisatorische Findings → NICHT ANWENDBAR

#### ORG-001 bis ORG-005: Information Security Policy, Asset-Management, Access Control, BCP, Supplier Assessment

**Revidiert: Alle NICHT ANWENDBAR**

Diese ISO 27001-Kontrollen sind für **Organisationen mit Teams, Prozessen und Compliance-Pflichten** konzipiert. Sie auf ein Ein-Personen-Hobbyprojekt anzuwenden ist methodisch falsch.

**Einzige sinnvolle Maßnahmen daraus:**
- ORG-003 (Access Control): **2FA auf dem GitHub-Account aktivieren** und Branch Protection für `main` einschalten. Das sind 5 Minuten in den GitHub-Settings.

**Status: 🔒 NICHT ANWENDBAR** – Falsche Zielgruppe für diese Kontrollen.

---

### Compliance-Findings → NICHT ANWENDBAR

#### COMP-001: ~~GDPR Datenschutzerklärung~~ → NICHT ANWENDBAR

**Experten-Bewertung:**

- Das Script **speichert keine Daten**. Keine Cookies, kein localStorage, keine Tracking-Pixel.
- Es liest eine Anzeigen-ID aus dem DOM und sendet sie an **denselben Server** (kleinanzeigen.de), von dem sie kam.
- Das ist wie zu sagen, der "Zurück"-Button im Browser brauche eine Datenschutzerklärung.
- Der CSRF-Token ist ein **Session-Mechanismus der Website**, nicht des Scripts.
- Die DSGVO richtet sich an **Verantwortliche der Datenverarbeitung** – das Script verarbeitet keine personenbezogenen Daten eigenständig.

**Status: 🔒 NICHT ANWENDBAR** – Kein Datenverarbeitungsvorgang i.S.d. DSGVO.

#### COMP-002: Cookie/Storage Dokumentation → NICHT ANWENDBAR

Das Script nutzt weder localStorage noch sessionStorage noch Cookies.

**Status: 🔒 NICHT ANWENDBAR**

---

## Positive Findings (bestätigt)

Die positiven Findings aus dem Original-Audit sind **zutreffend und korrekt**:

| Finding | Bewertung |
|---------|-----------|
| ✅ Explizites Timeout-Handling mit AbortController | Professionell implementiert |
| ✅ Exponential Backoff | Best-Practice-Pattern korrekt umgesetzt |
| ✅ Kein `eval()` oder `Function()` | Wichtig für Security |
| ✅ HTTPS für alle API-Calls | Korrekt hardcodiert |
| ✅ 54 Unit-/Integration-Tests | Gute Testabdeckung |
| ✅ IIFE-Pattern mit `'use strict'` | Kein globaler Namespace-Pollution |
| ✅ `@grant none` | Minimale Berechtigungen |
| ✅ Confirm-Dialog vor destruktiver Aktion | Guter UX-Schutz |

---

## Zusammenfassung: Was tatsächlich umgesetzt werden sollte

### Empfohlene Maßnahmen (priorisiert)

| # | Maßnahme | Aufwand | Typ |
|---|----------|---------|-----|
| 1 | **AdId-Validierung** (`/^\d{1,20}$/`) in `deleteAd()` | 3 Zeilen | Defense-in-Depth |
| 2 | **Session-Erkennung** (401/403 → hilfreiche Meldung) | 3 Zeilen | UX + Robustheit |
| 3 | **Button-Disabling** nach Klick (verhindert Doppelklick) | 2 Zeilen | UX + Schutz |
| 4 | **.gitignore** erstellen | 5 Min | Repo-Hygiene |
| 5 | **SECURITY.md** (Minimal, 15 Zeilen) | 10 Min | Community-Standard |

### Optionale Maßnahmen (Nice-to-Have)

| # | Maßnahme | Aufwand | Typ |
|---|----------|---------|-----|
| 6 | `innerHTML = '<div></div>'` durch `createElement` ersetzen | 2 Zeilen | Code-Hygiene |
| 7 | Hinweis zu `@grant none` im README | 1 Satz | Dokumentation |
| 8 | 2FA + Branch Protection auf GitHub | 5 Min | Account-Sicherheit |

### NICHT umsetzen (Overengineering)

| Maßnahme | Grund |
|----------|-------|
| SRI / Code-Signing | Tampermonkey bietet keinen Mechanismus |
| CSRF-Token Format-Validierung | Security Theater, Server validiert selbst |
| API-Whitelist | Redundant bei einem hardcodierten HTTPS-Endpunkt |
| SecurityLogger-Klasse mit JSON/localStorage | Overengineering, schafft neue Privacy-Probleme |
| RateLimiter-Klasse | 1 API-Call pro Nutzeraktion, Button-Disabling reicht |
| SBOM | Zero Dependencies |
| CSP im Script | Technisch nicht möglich für UserScripts |
| Business Continuity Plan | Falsche Zielgruppe |
| Supplier Assessment für Tampermonkey | Falsche Zielgruppe |
| GDPR-Datenschutzerklärung | Keine eigenständige Datenverarbeitung |
| Asset-Inventar | Ein-Mann-Projekt, keine Organisation |
| Code of Conduct | Kein Team, keine Community |
| CI/CD Security-Pipeline | Kosten-Nutzen bei 360 Zeilen / 0 Deps inakzeptabel |

---

## User Stories zur Umsetzung

### Epic: Security-Härtung v3.2.0

Alle umsetzbaren Findings als User Stories für Claude Code. Geschätzter Gesamtaufwand: **~30–45 Minuten**.

---

### US-SEC-001: Input-Validierung für Anzeigen-IDs
**Priorität:** Empfohlen
**Bezug:** HIGH-002 (revidiert auf Low)
**Aufwand:** ~5 Minuten

**Als** Nutzer des UserScripts
**möchte ich** dass die Anzeigen-ID vor dem API-Call validiert wird
**damit** nur gültige IDs an die API gesendet werden (Defense-in-Depth).

**Acceptance Criteria:**
- [ ] `deleteAd()` validiert `adId` mit Regex `/^\d{1,20}$/` vor dem fetch-Call
- [ ] Bei ungültiger ID wird ein sprechender Error geworfen
- [ ] Bestehende Tests laufen weiter durch (keine Breaking Changes)
- [ ] Ein neuer Unit-Test prüft die Validierung

**Technische Umsetzung:**
```javascript
// In deleteAd(), vor dem fetch-Call einfügen:
async function deleteAd(adId) {
    if (!adId || !/^\d{1,20}$/.test(adId)) {
        throw new Error('Ungültige Anzeigen-ID');
    }
    // ... restlicher Code bleibt unverändert
}
```

**Hinweis:** Keine encodeURIComponent nötig – die Regex stellt sicher, dass nur Ziffern durchkommen.

---

### US-SEC-002: Session-Timeout-Erkennung
**Priorität:** Empfohlen
**Bezug:** MED-007 (revidiert auf Low)
**Aufwand:** ~5 Minuten

**Als** Nutzer des UserScripts
**möchte ich** eine hilfreiche Meldung sehen wenn meine Session abgelaufen ist
**damit** ich weiß, dass ich mich neu einloggen muss (statt einer generischen Fehlermeldung).

**Acceptance Criteria:**
- [ ] HTTP 401 und 403 Responses werden als Session-Ablauf erkannt
- [ ] Nutzer erhält die Meldung: "Sitzung abgelaufen – bitte neu einloggen und Seite neu laden."
- [ ] Andere HTTP-Fehler werden weiterhin generisch behandelt
- [ ] Logger warnt bei Session-Ablauf

**Technische Umsetzung:**
```javascript
// In deleteAd(), den bestehenden !response.ok Block ersetzen:
if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
        logger.warn('Session abgelaufen', { status: response.status });
        throw new Error('Sitzung abgelaufen – bitte neu einloggen und Seite neu laden.');
    }
    logger.error('Anzeige-Löschung fehlgeschlagen', { status: response.status });
    throw new Error(`HTTP ${response.status}`);
}
```

---

### US-SEC-003: Button-Disabling nach Klick (Doppelklick-Schutz)
**Priorität:** Empfohlen
**Bezug:** MED-003 (revidiert auf Low)
**Aufwand:** ~5 Minuten

**Als** Nutzer des UserScripts
**möchte ich** dass die Buttons nach dem Klick deaktiviert werden
**damit** ich nicht versehentlich doppelt dupliziere oder lösche.

**Acceptance Criteria:**
- [ ] Beide Buttons (`ka-duplicate-btn`, `ka-smart-btn`) werden nach Klick `disabled = true` gesetzt
- [ ] Visueller Hinweis: Disabled-Buttons haben reduzierte Opacity (CSS)
- [ ] Bei Fehler werden Buttons wieder aktiviert (im catch-Block)
- [ ] Loading-Spinner bleibt wie bisher

**Technische Umsetzung (Code-Änderungen):**

1. **CSS ergänzen** in `ensureStyles()`:
```css
.ka-duplicate-btn:disabled, .ka-smart-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
```

2. **onclick-Handler anpassen** in `createButtons()`:
```javascript
dupButton.onclick = (e) => {
    e.preventDefault();
    dupButton.disabled = true;
    smartButton.disabled = true;
    duplicateAd();
};

// Analog für smartButton
smartButton.onclick = (e) => {
    e.preventDefault();
    if (confirm('Original-Anzeige wird gelöscht und als neue Anzeige eingestellt.\n\nAlle Bilder bleiben erhalten.\n\nFortfahren?')) {
        dupButton.disabled = true;
        smartButton.disabled = true;
        smartRepublish();
    }
};
```

3. **Buttons bei Fehler re-aktivieren** – in `duplicateAd()` und `smartRepublish()` im catch-Block:
```javascript
} catch (error) {
    logger.error('Fehler beim Duplizieren', error);
    showNotification('❌ Fehler: ' + error.message, 'error');
    showLoadingSpinner(false);
    // Buttons re-aktivieren
    document.querySelectorAll('.ka-duplicate-btn, .ka-smart-btn').forEach(btn => btn.disabled = false);
}
```

**Hinweis:** Die `smartButton`-Referenz muss im Scope der `dupButton.onclick`-Closure erreichbar sein. Beide werden im selben `createButtons()`-Scope erstellt, das funktioniert.

---

### US-SEC-004: .gitignore erstellen
**Priorität:** Empfohlen
**Bezug:** LOW-002
**Aufwand:** ~5 Minuten

**Als** Entwickler
**möchte ich** eine .gitignore im Repository
**damit** keine lokalen Konfigurationsdateien oder IDE-Artefakte versehentlich committed werden.

**Acceptance Criteria:**
- [ ] `.gitignore` im Repository-Root erstellt
- [ ] Abdeckung: node_modules, .env, IDE-Dateien, OS-Artefakte, Logs
- [ ] Bereits commitete Dateien sind nicht betroffen (nur neue)

**Datei-Inhalt:**
```gitignore
# Dependencies
node_modules/
package-lock.json

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbbs.db

# Logs
*.log
npm-debug.log*

# Temporary
tmp/
temp/
*.tmp
```

---

### US-SEC-005: SECURITY.md erstellen
**Priorität:** Empfohlen
**Bezug:** LOW-001
**Aufwand:** ~10 Minuten

**Als** externer Entwickler oder Security-Researcher
**möchte ich** wissen wie ich eine Sicherheitslücke melden kann
**damit** Schwachstellen verantwortungsvoll behandelt werden.

**Acceptance Criteria:**
- [ ] `SECURITY.md` im Repository-Root erstellt
- [ ] Supported Versions dokumentiert
- [ ] Meldungsweg beschrieben (GitHub Issues oder E-Mail)
- [ ] Kompakt gehalten (max. 30 Zeilen)

**Datei-Inhalt:**
```markdown
# Security Policy

## Unterstützte Versionen

| Version | Unterstützt |
| ------- | ----------- |
| 3.1.x   | ✅           |
| < 3.0   | ❌           |

## Schwachstelle melden

Wenn du eine Sicherheitslücke findest:

1. **Erstelle ein [GitHub Issue](https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/issues)** mit dem Label "security"
2. Beschreibe das Problem und wie es reproduziert werden kann
3. Bitte veröffentliche keine Details bevor ein Fix verfügbar ist

Antwortzeit: Innerhalb von 7 Tagen.

## Hinweis

Dieses Script läuft lokal im Browser mit `@grant none` (keine erweiterten Berechtigungen).
Es speichert keine Daten und kommuniziert nur mit kleinanzeigen.de über HTTPS.
```

---

### US-SEC-006: innerHTML durch createElement ersetzen (Optional)
**Priorität:** Optional (Nice-to-Have)
**Bezug:** MED-002 (revidiert auf Informational)
**Aufwand:** ~2 Minuten

**Als** Entwickler
**möchte ich** `innerHTML` durch DOM-API ersetzen
**damit** der Code konsistent sichere DOM-Methoden verwendet (Code-Hygiene, kein reales Sicherheitsrisiko).

**Acceptance Criteria:**
- [ ] `spinner.innerHTML = '<div></div>'` durch `createElement` + `appendChild` ersetzt
- [ ] Visuell identisches Ergebnis
- [ ] Bestehende Tests laufen weiter

**Technische Umsetzung:**
```javascript
// In showLoadingSpinner(), statt:
//   spinner.innerHTML = '<div></div>';
// Neu:
const spinnerInner = document.createElement('div');
spinner.appendChild(spinnerInner);
```

---

### US-SEC-007: Permissions-Hinweis im README (Optional)
**Priorität:** Optional (Nice-to-Have)
**Bezug:** LOW-004 (revidiert auf Informational)
**Aufwand:** ~2 Minuten

**Als** Nutzer
**möchte ich** im README sehen welche Berechtigungen das Script hat
**damit** ich informiert entscheiden kann ob ich es installiere.

**Acceptance Criteria:**
- [ ] Ein kurzer Absatz im README unter "Technische Details" ergänzt

**Text:**
```markdown
### Berechtigungen
Das Script verwendet `@grant none` – es hat keine erweiterten Tampermonkey-Berechtigungen
und kann nur im Kontext der aktuellen Kleinanzeigen-Seite agieren. Es speichert keine Daten
und kommuniziert ausschließlich mit kleinanzeigen.de über HTTPS.
```

---

### US-SEC-008: 2FA und Branch Protection auf GitHub (Optional)
**Priorität:** Optional (Nice-to-Have)
**Bezug:** ORG-003 (einziger sinnvoller Punkt aus den Org-Findings)
**Aufwand:** ~5 Minuten

**Als** Repository-Owner
**möchte ich** meinen GitHub-Account und den main-Branch absichern
**damit** nur ich Code in das Repository pushen kann.

**Acceptance Criteria:**
- [ ] 2FA auf dem GitHub-Account aktiviert (falls noch nicht aktiv)
- [ ] Branch Protection Rule für `main`: Require pull request reviews ODER direct push nur für Owner
- [ ] Keine Code-Änderung nötig – rein in GitHub-Settings

**Schritte:**
1. GitHub → Settings → Password and Authentication → Enable 2FA
2. Repository → Settings → Branches → Add rule für `main`
3. Aktivieren: "Restrict who can push to matching branches"

---

### Übersicht: Umsetzungsreihenfolge

| Phase | User Story | Typ | Aufwand |
|-------|-----------|-----|---------|
| **Sprint 1** | US-SEC-001: AdId-Validierung | Code | 5 Min |
| **Sprint 1** | US-SEC-002: Session-Erkennung | Code | 5 Min |
| **Sprint 1** | US-SEC-003: Button-Disabling | Code + CSS | 5 Min |
| **Sprint 1** | US-SEC-004: .gitignore | Datei | 5 Min |
| **Sprint 1** | US-SEC-005: SECURITY.md | Datei | 10 Min |
| Sprint 2 (optional) | US-SEC-006: innerHTML ersetzen | Code | 2 Min |
| Sprint 2 (optional) | US-SEC-007: README-Hinweis | Doku | 2 Min |
| Sprint 2 (optional) | US-SEC-008: GitHub 2FA + Branch Protection | Settings | 5 Min |
| | | **Gesamt Sprint 1:** | **~30 Min** |
| | | **Gesamt inkl. Optional:** | **~40 Min** |

**Version nach Umsetzung:** 3.2.0 (Minor-Bump, da keine Breaking Changes)

---

## Methodenkritik am Original-Audit

| Problem | Erklärung |
|---------|-----------|
| **Fehlende Kontextanalyse** | ISO 27001/27002 auf ein UserScript anzuwenden ohne Scope-Anpassung ist methodisch falsch |
| **Falsche CWE-Zuordnungen** | CWE-798 (hardcoded credentials) auf hardcodierte URLs anzuwenden ist ein Kategorienfehler |
| **Verwechslung von Server- und Client-Kontext** | CSP, Security Headers, Information Leakage – alles Server-Themen, auf ein Client-Script angewendet |
| **Severity-Inflation** | "Critical" für Findings, die technisch nicht umsetzbar sind, entwertet das Rating-System |
| **Theoretische vs. praktische Risiken** | DNS-Spoofing, Supply-Chain-Attacks auf Zero-Dep-Projects – theoretisch möglich, praktisch irrelevant |
| **Fehlende User-Stories-Prüfung** | Die vorgeschlagenen Implementierungen (SecurityLogger, RateLimiter, CSP-Nonces) sind teilweise komplexer als das gesamte Script |

---

## Fazit

Das Kleinanzeigen-UserScript v3.1.3 ist **für seinen Anwendungsfall angemessen sicher**. Die wenigen sinnvollen Verbesserungen (AdId-Validierung, Session-Erkennung, .gitignore, SECURITY.md) haben einen Gesamtaufwand von ca. **30 Minuten** und erhöhen die Robustheit, ohne das Script aufzublähen.

Das Original-Audit hat den Fehler gemacht, Enterprise-Security-Standards ungeprüft auf ein Hobby-UserScript zu übertragen. Ein gutes Security-Audit muss immer den **Bedrohungskontext**, die **Angriffsfläche** und die **Verhältnismäßigkeit** der Maßnahmen berücksichtigen.

**Gesamtbewertung: Das Script ist produktionsreif.** Die empfohlenen 5 Maßnahmen sind sinnvolle Härtungen, aber keine Blocker.

---

**Review abgeschlossen:** 2026-02-07
**Nächstes Review:** Bei Major-Release oder signifikanten Architekturänderungen
