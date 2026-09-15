# ADR 0007: Natives Hintergrund-Tracking via Capacitor statt reinem Check-in-Modell

## Kontext

ADR 0001 hat sich bewusst für Ansatz B (Check-in-Modell: Standort wird nur bei Gelegenheit gesendet, kein Dauertracking) statt Ansatz A (kontinuierliches Hintergrund-Tracking) entschieden – primär weil zuverlässiges Hintergrund-GPS als PWA auf iOS praktisch nicht umsetzbar ist. ADR 0001 hat Ansatz A dabei explizit nicht verworfen, sondern als "logischen nächsten Schritt" benannt, sobald in eine native App investiert wird.

Der erste End-zu-Ende-Flow in `apps/web` (Login, Tour starten, Standort-Ping) setzt Ansatz B konsequent um: der Ping wird nur per manuellem Button-Tap gesendet. In der Praxis zeigt sich, dass das die App unbrauchbar macht – niemand öffnet unterwegs zuverlässig alle paar Minuten die App und drückt einen Knopf. Der Kernnutzen der App (die Bergwacht kann im Ernstfall einen aktuellen letzten bekannten Standort nachschlagen) hängt aber genau davon ab, dass Pings tatsächlich regelmäßig ankommen, ohne dass die tourende Person aktiv daran denken muss. Die Investition in einen nativen App-Bundler (Capacitor) war von Anfang an eingeplant.

## Entscheidung

- `apps/web` wird zusätzlich als native App über **Capacitor** gebaut (iOS zuerst, Android danach) – kein Parallelentwicklung einer separaten nativen Codebase, sondern derselbe Web-Code mit einem nativen Wrapper plus Background-Location-Plugin.
- In der nativen App läuft die Standorterfassung automatisch im Hintergrund in einem Intervall von ca. **2–3 Minuten** (Zielwert aus ADR 0001), sobald eine Tour aktiv ist – kein manueller Ping-Button mehr nötig.
- Der bestehende PWA-Check-in-Flow (manueller "Standort jetzt senden"-Button) **bleibt erhalten** als Fallback für Nutzer, die die App im Browser statt über die installierte native App verwenden – wie in ADR 0001 vorgeschlagen ("Ansatz B als Fallback beibehalten, Ansatz A als Komfort-Erweiterung daraufsetzen").
- iOS wird zuerst umgesetzt, weil es laut ADR 0001 die restriktivere Plattform für Hintergrundprozesse ist – die riskanteste Annahme wird damit zuerst validiert.

Das kippt ADR 0001s ursprüngliche Empfehlung, mit Ansatz B allein zu starten, nicht rückwirkend – es löst die dort selbst benannte Bedingung ein ("sobald ihr bereit seid, in eine native App zu investieren").

## Konsequenzen

- **Akkulaufzeit** wird zum aktiv zu managenden Risiko statt eines mit dem Check-in-Modell "weggelösten" Problems – ADR 0001 warnt zurecht, dass ein Sicherheitsgerät mit leerem Akku im Ernstfall das Vertrauen der Bergwacht zerstört. Intervall-Wahl und Nutzung stromsparender Location-APIs (statt permanent höchster Genauigkeit) sind Teil der Umsetzung, nicht nachträglich zu optimieren.
- **iOS verlangt die "Always"-Standortberechtigung** für Hintergrund-Tracking – das ist bei Apples App-Review ein Prüfpunkt mit hohem Rechtfertigungsdruck. Die Berechtigungsanfrage und die App-Store-Beschreibung müssen ehrlich erklären, wofür der Standort verwendet wird, und dürfen (Leitplanke "kein Ersatz für den Notruf") keine höhere Zuverlässigkeit suggerieren, als das System tatsächlich bietet.
- **Mehr Komplexität** als beim reinen Check-in-Modell: lokale Zwischenspeicherung bei fehlendem Netz, Retry/Backoff beim Senden – von ADR 0001 bereits als Nachteil von Ansatz A benannt, wird jetzt bewusst in Kauf genommen.
- Das Datenmodell (`location_ping`) ändert sich nicht – es wird weiterhin ein Einzelpunkt pro Ping gespeichert, kein durchgehender Track. Es ändert sich nur, wie und wann ein Ping entsteht.
- Zwei Client-Oberflächen mit unterschiedlicher Zuverlässigkeit koexistieren dauerhaft: die installierte native App (automatisch, im Hintergrund) und die PWA (manuell, Fallback). Die Bergwacht sieht am `location_ping`-Datensatz nicht, über welchen Weg er entstanden ist – das kann relevant werden, wenn "letzter bekannter Standort vor X Minuten" unterschiedlich einzuordnen ist, je nachdem ob automatisch oder manuell gesendet wurde.

## Offene Fragen (vor Umsetzung zu klären)

- Welches Capacitor-Background-Geolocation-Plugin (z. B. `@capacitor-community/background-geolocation`), inkl. Lizenz-/Kosten-Prüfung und Funktionsumfang unter iOS-Beschränkungen
- Wann wird die "Always"-Berechtigung angefragt (bei Tour-Start vs. beim ersten App-Start) und mit welchem Erklärtext gegenüber Nutzer und App-Review
- Batching-/Retry-Strategie bei fehlendem Netz: wie lange werden ungesendete Pings lokal vorgehalten, wie viele Wiederholversuche
- Android-Pendant (Foreground Service, "Standortzugriff immer zulassen"-Berechtigung, Akku-Optimierungs-Ausnahmen je Hersteller)
- App-Store-/Play-Store-Distribution (Entwicklerkonten, Review-Prozess, Versionierung) ist noch nicht aufgesetzt
- Soll am `location_ping`-Datensatz künftig erkennbar sein, ob er automatisch (native App) oder manuell (PWA-Fallback) gesendet wurde?
