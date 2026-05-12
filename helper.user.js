// ==UserScript==
// @name          eBay Kleinanzeigen - neu einstellen helper
// @namespace     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @description   Hilfsskript fuer Smart Neu-Einstellen direkt aus "Meine Anzeigen", inkl. Batch-Modus
// @icon          https://www.kleinanzeigen.de/favicon.ico
// @copyright     2026
// @license       MIT
// @version       1.3.0
// @author        panzli (Original), OldRon1977 (Anpassungen)
// @match         https://www.kleinanzeigen.de/m-meine-anzeigen.html*
// @match         https://kleinanzeigen.de/m-meine-anzeigen.html*
// @match         https://*.kleinanzeigen.de/m-meine-anzeigen.html*
// @homepage      https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren
// @updateURL     https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js
// @downloadURL   https://github.com/OldRon1977/Kleinanzeigen-Anzeigen-duplizieren/raw/main/helper.user.js
// @run-at        document-idle
// @grant         none
// ==/UserScript==

(function () {
    'use strict';

    // === KONSTANTEN ===
    // Default Anzeigenlaufzeit auf Kleinanzeigen = 60 Tage. Eine Anzeige gilt
    // als "älter als 7 Tage", wenn das Enddatum höchstens (60 - 7) = 53 Tage
    // in der Zukunft liegt.
    const MIN_DAYS_TO_END = 53;

    // Jitter-Delay zwischen zwei Smart-Republish-Vorgaengen: 7 +- 2 Minuten.
    const DELAY_BASE_MS = 7 * 60 * 1000;
    const DELAY_JITTER_MS = 2 * 60 * 1000;

    // Maximaler Wartepuffer auf das Result-Signal aus dem Worker-Tab.
    const RESULT_WAIT_TIMEOUT_MS = 90 * 1000;

    // localStorage-Schlüssel
    const LS_RESULT_PREFIX = 'ka-batch-result-';

    const MARKER = 'data-ka-smart-helper';
    const TRIGGER_BTN_ID = 'ka-batch-trigger';
    const OVERLAY_ID = 'ka-batch-overlay';

    // === LOGGING ===
    const log = (msg, data) => console.log('[KA-Helper] ' + msg, data || '');
    const warn = (msg, data) => console.warn('[KA-Helper] ' + msg, data || '');

    // === EINZEL-BUTTON PRO ANZEIGE (bestehende Funktion) ===
    function addControlButtons() {
        const elements = document.querySelectorAll('a[href*="/p-anzeige-bearbeiten.html?adId="]');
        elements.forEach(function (element) {
            if (element.hasAttribute(MARKER)) return;
            element.setAttribute(MARKER, 'true');

            const match = element.getAttribute('href').match(/adId=([^&]*)/);
            if (!match || !match[1]) return;
            const adId = match[1];

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '\uD83D\uDD04 Smart neu einstellen';
            btn.title = 'Löscht Original und erstellt neue Anzeige';
            btn.style.cssText = 'margin-left:8px;padding:4px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;font-size:12px;vertical-align:middle;display:inline-flex;align-items:center;';

            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openSmartRepublish(adId, btn);
            };

            element.after(btn);
        });
    }

    function openSmartRepublish(adId, button) {
        window.open(
            'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#smartRepublish',
            '_blank'
        );
        button.style.color = 'red';
        button.textContent = '\u2705 Geöffnet';
    }

    // === GLOBALER BATCH-TRIGGER-BUTTON ===
    function addBatchTriggerButton() {
        if (document.getElementById(TRIGGER_BTN_ID)) return;

        const list = document.querySelector('#my-manageitems-adlist');
        if (!list) return;

        const btn = document.createElement('button');
        btn.id = TRIGGER_BTN_ID;
        btn.type = 'button';
        btn.textContent = '\u23F0 Alle alten neu einstellen';
        btn.title = 'Stellt alle Anzeigen älter als 7 Tage nacheinander mit Zeitabstand neu ein';
        btn.style.cssText = [
            'margin: 0 0 12px 0',
            'padding: 8px 16px',
            'cursor: pointer',
            'border: 1px solid #007bff',
            'border-radius: 6px',
            'background: #007bff',
            'color: #fff',
            'font-size: 13px',
            'font-weight: 600'
        ].join(';');

        btn.onclick = function () {
            startBatchFlow();
        };

        list.parentElement.insertBefore(btn, list);
    }

    // === KARTEN AUSWÄHLEN ===
    function parseEndDate(dateStr) {
        const m = (dateStr || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (!m) return null;
        const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
        return isNaN(d.getTime()) ? null : d;
    }

    function daysUntil(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayMs = 24 * 60 * 60 * 1000;
        return Math.round((date.getTime() - today.getTime()) / dayMs);
    }

    function collectCandidates() {
        const cards = document.querySelectorAll('li[data-testid="ad-card"][data-adid]');
        const matches = [];
        const skipped = [];

        cards.forEach(function (card) {
            const adId = card.getAttribute('data-adid');
            const titleEl = card.querySelector('h3 a');
            const title = titleEl ? titleEl.textContent.trim() : '(ohne Titel)';
            const endEl = card.querySelector('.managead-listitem-enddate');
            const endText = endEl ? endEl.textContent.trim() : '';
            const endDate = parseEndDate(endText);

            if (!adId || !endDate) {
                skipped.push({ adId: adId, title: title, reason: 'kein Datum' });
                return;
            }

            const days = daysUntil(endDate);
            if (days <= MIN_DAYS_TO_END) {
                matches.push({ adId: adId, title: title, endText: endText, daysLeft: days });
            }
        });

        return { matches: matches, skipped: skipped };
    }

    // === OVERLAY ===
    function ensureOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = [
            'position: fixed',
            'top: 20px',
            'right: 20px',
            'width: 360px',
            'max-height: 70vh',
            'overflow-y: auto',
            'background: #fff',
            'border: 1px solid #d0d0d0',
            'border-radius: 8px',
            'box-shadow: 0 6px 24px rgba(0,0,0,0.18)',
            'z-index: 100000',
            'font-family: system-ui, sans-serif',
            'font-size: 13px',
            'color: #222'
        ].join(';');
        document.body.appendChild(overlay);
        return overlay;
    }

    function closeOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.remove();
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderConfirm(matches, skipped, onStart) {
        const overlay = ensureOverlay();
        const totalMs = matches.length * (DELAY_BASE_MS);
        const minutes = Math.round(totalMs / 60000);

        overlay.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;display:flex;justify-content:space-between;align-items:center;';
        const title = document.createElement('span');
        title.textContent = 'Batch Smart Neu-Einstellen';
        header.appendChild(title);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '\u2715';
        closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;color:#888;';
        closeBtn.onclick = closeOverlay;
        header.appendChild(closeBtn);
        overlay.appendChild(header);

        const summary = document.createElement('div');
        summary.style.cssText = 'padding:10px 14px;border-bottom:1px solid #eee;';
        if (matches.length === 0) {
            summary.textContent = 'Keine Anzeigen älter als 7 Tage gefunden.';
            overlay.appendChild(summary);
            return;
        }
        const line1 = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = matches.length;
        line1.appendChild(strong);
        line1.appendChild(document.createTextNode(' Anzeige(n) werden bearbeitet.'));
        summary.appendChild(line1);
        const line2 = document.createElement('div');
        line2.style.cssText = 'color:#666;margin-top:4px;';
        line2.textContent = 'Geschätzte Laufzeit: ca. ' + minutes + ' Minuten (7 ± 2 min Pause pro Anzeige).';
        summary.appendChild(line2);
        overlay.appendChild(summary);

        const list = document.createElement('ol');
        list.style.cssText = 'margin:0;padding:8px 14px 8px 32px;max-height:240px;overflow-y:auto;';
        matches.forEach(function (m) {
            const li = document.createElement('li');
            li.style.cssText = 'margin:4px 0;line-height:1.3;';
            const t = document.createElement('div');
            t.style.cssText = 'font-weight:500;';
            t.textContent = m.title;
            const meta = document.createElement('div');
            meta.style.cssText = 'color:#666;font-size:12px;';
            meta.textContent = 'ID ' + m.adId + ' \u00B7 endet ' + m.endText + ' (' + m.daysLeft + ' Tage)';
            li.appendChild(t);
            li.appendChild(meta);
            list.appendChild(li);
        });
        overlay.appendChild(list);

        if (skipped.length > 0) {
            const sk = document.createElement('div');
            sk.style.cssText = 'padding:8px 14px;color:#888;font-size:12px;border-top:1px solid #eee;';
            sk.textContent = skipped.length + ' Karte(n) ohne Datum übersprungen.';
            overlay.appendChild(sk);
        }

        const actions = document.createElement('div');
        actions.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Abbrechen';
        cancel.style.cssText = 'padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;';
        cancel.onclick = closeOverlay;
        const start = document.createElement('button');
        start.type = 'button';
        start.textContent = 'Start';
        start.style.cssText = 'padding:6px 14px;border:1px solid #007bff;border-radius:4px;background:#007bff;color:#fff;cursor:pointer;font-weight:600;';
        start.onclick = function () {
            onStart(matches);
        };
        actions.appendChild(cancel);
        actions.appendChild(start);
        overlay.appendChild(actions);
    }

    function renderProgress(state, onStop) {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;';
        header.textContent = 'Batch läuft \u2026';
        overlay.appendChild(header);

        const status = document.createElement('div');
        status.style.cssText = 'padding:10px 14px;line-height:1.4;';
        const idx = state.processed.length + state.failed.length;
        const total = state.queue.length + idx;

        const main = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = idx + ' / ' + total;
        main.appendChild(strong);
        main.appendChild(document.createTextNode(' Anzeigen verarbeitet.'));
        status.appendChild(main);

        const cur = document.createElement('div');
        cur.style.cssText = 'color:#666;margin-top:4px;';
        cur.textContent = 'Aktuell: ' + (state.currentLabel || '\u2013');
        status.appendChild(cur);

        if (state.nextEtaText) {
            const eta = document.createElement('div');
            eta.style.cssText = 'color:#666;margin-top:4px;';
            eta.textContent = 'Nächste in: ' + state.nextEtaText;
            status.appendChild(eta);
        }

        const ok = document.createElement('div');
        ok.style.cssText = 'color:#27ae60;margin-top:6px;';
        ok.textContent = 'OK: ' + state.processed.length;
        status.appendChild(ok);

        const fail = document.createElement('div');
        fail.style.cssText = 'color:#e74c3c;';
        fail.textContent = 'Fehler: ' + state.failed.length;
        status.appendChild(fail);

        overlay.appendChild(status);

        const actions = document.createElement('div');
        actions.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.textContent = 'Stop';
        stop.style.cssText = 'padding:6px 14px;border:1px solid #e74c3c;border-radius:4px;background:#fff;color:#e74c3c;cursor:pointer;font-weight:600;';
        stop.onclick = onStop;
        actions.appendChild(stop);
        overlay.appendChild(actions);
    }

    function renderDone(state) {
        const overlay = ensureOverlay();
        overlay.innerHTML = '';

        const header = document.createElement('div');
        header.style.cssText = 'padding:12px 14px;border-bottom:1px solid #eee;font-weight:600;';
        header.textContent = state.aborted ? 'Batch abgebrochen' : 'Batch abgeschlossen';
        overlay.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding:10px 14px;line-height:1.5;';

        const okLine = document.createElement('div');
        okLine.appendChild(document.createTextNode('OK: '));
        const okStrong = document.createElement('strong');
        okStrong.textContent = state.processed.length;
        okLine.appendChild(okStrong);
        body.appendChild(okLine);

        const failLine = document.createElement('div');
        failLine.appendChild(document.createTextNode('Fehler: '));
        const failStrong = document.createElement('strong');
        failStrong.textContent = state.failed.length;
        failLine.appendChild(failStrong);
        body.appendChild(failLine);

        if (state.failed.length > 0) {
            const ul = document.createElement('ul');
            ul.style.cssText = 'margin:6px 0 0 18px;color:#e74c3c;font-size:12px;';
            state.failed.forEach(function (f) {
                const li = document.createElement('li');
                li.textContent = f.adId + ': ' + (f.error || 'unbekannter Fehler');
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        overlay.appendChild(body);

        const actions = document.createElement('div');
        actions.style.cssText = 'padding:10px 14px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Schließen';
        close.style.cssText = 'padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;';
        close.onclick = closeOverlay;
        actions.appendChild(close);
        overlay.appendChild(actions);
    }

    // === ORCHESTRATOR ===
    let stopRequested = false;

    function startBatchFlow() {
        const result = collectCandidates();
        log('Kandidaten:', { matches: result.matches.length, skipped: result.skipped.length });
        renderConfirm(result.matches, result.skipped, function (matches) {
            stopRequested = false;
            runBatch(matches);
        });
    }

    function jitterDelay() {
        const offset = (Math.random() * 2 - 1) * DELAY_JITTER_MS;
        return Math.max(60 * 1000, Math.round(DELAY_BASE_MS + offset));
    }

    function processOne(item) {
        return new Promise(function (resolve) {
            const adId = item.adId;
            const lsKey = LS_RESULT_PREFIX + adId;
            try { localStorage.removeItem(lsKey); } catch (e) {}

            log('Öffne Tab für adId ' + adId);
            const tabRef = window.open(
                'https://www.kleinanzeigen.de/p-anzeige-bearbeiten.html?adId=' + adId + '#smartRepublish',
                '_blank'
            );
            if (!tabRef) {
                resolve({ ok: false, error: 'Popup blockiert' });
                return;
            }

            const cleanup = function () {
                window.removeEventListener('storage', onStorage);
                clearTimeout(timeoutId);
                clearInterval(pollId);
                try { tabRef.close(); } catch (e) {}
                try { localStorage.removeItem(lsKey); } catch (e) {}
            };

            const finish = function (payload) {
                cleanup();
                resolve(payload);
            };

            const handleValue = function (raw) {
                if (!raw) return false;
                if (raw === 'ok') {
                    finish({ ok: true });
                    return true;
                }
                if (raw.indexOf('error:') === 0) {
                    finish({ ok: false, error: raw.slice(6) || 'Worker meldet Fehler' });
                    return true;
                }
                return false;
            };

            const onStorage = function (e) {
                if (e.key !== lsKey) return;
                handleValue(e.newValue);
            };
            window.addEventListener('storage', onStorage);

            const pollId = setInterval(function () {
                try {
                    const v = localStorage.getItem(lsKey);
                    if (v) handleValue(v);
                } catch (err) {}
            }, 1000);

            const timeoutId = setTimeout(function () {
                finish({ ok: false, error: 'Timeout: kein Result vom Worker-Tab' });
            }, RESULT_WAIT_TIMEOUT_MS);
        });
    }

    function waitMs(ms, onTick) {
        return new Promise(function (resolve) {
            const start = Date.now();
            const tick = setInterval(function () {
                const remaining = Math.max(0, ms - (Date.now() - start));
                if (onTick) onTick(remaining);
                if (remaining <= 0) {
                    clearInterval(tick);
                    resolve();
                }
            }, 1000);
        });
    }

    function formatRemaining(ms) {
        const sec = Math.round(ms / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    async function runBatch(matches) {
        const state = {
            queue: matches.slice(),
            processed: [],
            failed: [],
            currentLabel: '',
            nextEtaText: '',
            aborted: false
        };

        const onStop = function () {
            stopRequested = true;
            state.aborted = true;
            log('Stop angefordert');
        };

        renderProgress(state, onStop);

        while (state.queue.length > 0) {
            if (stopRequested) break;
            const item = state.queue.shift();
            state.currentLabel = item.title + ' (ID ' + item.adId + ')';
            state.nextEtaText = '';
            renderProgress(state, onStop);

            const res = await processOne(item);
            if (res.ok) {
                state.processed.push({ adId: item.adId });
                log('OK adId ' + item.adId);
            } else {
                state.failed.push({ adId: item.adId, error: res.error });
                warn('Fehler adId ' + item.adId, res.error);
            }
            renderProgress(state, onStop);

            if (state.queue.length > 0 && !stopRequested) {
                const wait = jitterDelay();
                log('Warte ' + Math.round(wait / 1000) + 's vor nächster Anzeige');
                await waitMs(wait, function (remaining) {
                    state.nextEtaText = formatRemaining(remaining);
                    renderProgress(state, onStop);
                });
            }
        }

        log('Batch fertig', { ok: state.processed.length, fail: state.failed.length, aborted: state.aborted });
        renderDone(state);
    }

    // === INIT ===
    function tick() {
        addControlButtons();
        addBatchTriggerButton();
    }

    setTimeout(tick, 1500);

    let debounceTimer;
    const observer = new MutationObserver(function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tick, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();