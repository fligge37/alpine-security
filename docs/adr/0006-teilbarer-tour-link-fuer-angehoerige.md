# ADR 0006: Teilbarer Tour-Link für Angehörige

## Kontext

Bisher gibt es zwei Zugriffswege auf Standortdaten: der Nutzer selbst (eigene Tour) und die Bergwacht im Ernstfall (Pull-Zugriff nach ADR 0003, ausgelöst durch einen externen Anlass wie eine Vermisstenmeldung). Angehörige oder Freunde, die sich einfach nur informieren möchten, ob jemand gut unterwegs ist, haben aktuell keinen Weg dazu außer direktem Kontakt (Anruf/Nachricht) mit der tourenden Person selbst – was gerade in funkarmen Gebieten oft nicht funktioniert. Dieser Alltagsnutzen fehlt Alpine Security bisher und soll die App auch für Personen interessant machen, die selbst nicht Bergwacht sind, aber ein berechtigtes Interesse am Verbleib eines Angehörigen haben.

## Entscheidung

- Nutzer können zu einer Tour einen Link generieren und teilen.
- Wer den Link besitzt, darf den Tourverlauf/letzten bekannten Standort einsehen – **Linkbesitz ist der Autorisierungsnachweis**, kein separates Konto/Login für Mitlesende nötig.
- Das ist ein dritter, eigenständiger Zugriffsweg neben Nutzer-Login (eigene Tour) und Bergwacht-Pull (ADR 0003): **Nutzer-initiiertes Teilen**, ausgelöst durch aktive Freigabe der tourenden Person selbst – nicht durch einen externen Anlass wie bei der Bergwacht.

## Verhältnis zu bestehenden Leitplanken

- **Kein Ersatz für den Notruf:** Gilt für die UX von Mitlesenden genauso wie für die App selbst. Ein Link zeigt nur den letzten bekannten Standort im Rahmen des Check-in-Modells (ADR 0001), kein Live-Tracking, kein Alarmsystem. Formulierungen, die "Live-Verfolgung" oder Sicherheit suggerieren, wären irreführend und könnten bei Funklöchern (keine neuen Pings) ein falsches Sicherheitsgefühl bei Angehörigen erzeugen.
- **Datensparsamkeit/DSGVO:** Ein Link ist faktisch ein Bearer-Token – wer ihn erhält (auch ungewollt weitergeleitet), sieht Standortdaten ohne weitere Prüfung. Ablauf, Widerrufbarkeit und Sichtbarkeitsdauer sind deshalb keine Implementierungsdetails, sondern Teil der Entscheidung und müssen vor der Umsetzung geklärt werden, nicht danach nachgezogen werden.

## Offene Fragen (vor Umsetzung zu klären)

- ~~Ablauf/Gültigkeit des Links~~ **Entschieden:** Link ist gültig, solange die Tour `aktiv` ist, plus 24 Stunden nach Tourende (`ended_at + 24h`). Danach liefert der Endpoint 404, unabhängig davon ob der Link noch bekannt ist. Das deckt den Hauptfall ab ("ist die Person sicher angekommen?"), ohne Standortdaten unbegrenzt über einen reinen Bearer-Token abrufbar zu halten (Datensparsamkeit). Der Wert ist bewusst kein Implementierungsdetail, sondern kann bei Bedarf als eigenes ADR-Update angepasst werden.
- ~~Granularität der Ansicht~~ **Entschieden:** kompletter Tourverlauf (alle Pings), nicht nur letzter Standort – im Unterschied zur Bergwacht-Ansicht (ADR 0003), da Angehörige hier explizit vom Nutzer autorisiert wurden und ein Bewegungsbild für die Einschätzung "ist alles im normalen Rahmen" hilfreicher ist als ein einzelner Punkt.
- ~~Ein Link pro Tour oder mehrere~~ **Entschieden:** ein Link pro Tour (MVP). Erzeugen rotiert den bestehenden Token (alter Link wird dadurch sofort ungültig), Widerrufen setzt ihn auf `null`. Mehrere parallele, einzeln widerrufbare Links pro Empfänger sind eine mögliche spätere Erweiterung, aber kein MVP-Scope.
- **Entschieden:** Schutz gegen Erraten/Bruteforcing – Token sind 24 zufällige Bytes (`crypto.randomBytes`, Base64url-kodiert, ~192 Bit Entropie), kein sequentielles Format, als eigene `share_token`-Spalte mit `UNIQUE`-Constraint auf `tour`.
- **Entschieden:** UX-Formulierung für Mitlesende – die öffentliche Ansicht zeigt durchgängig den Hinweis "Kein Live-Tracking, kein Ersatz für den Notruf – nur die von der Person gesendeten Standort-Pings", analog zum bestehenden Banner in der Wanderer-App.

## Umsetzung

Implementiert: `tour.share_token` (Flyway `V4__tour_share_link.sql`, Drizzle-Schema), Endpoints `POST /tours/:id/share` (erzeugen/rotieren, nur Tour-Owner), `DELETE /tours/:id/share` (widerrufen, nur Tour-Owner), `GET /share/:token` (öffentlich, kein Login – Linkbesitz ist der Autorisierungsnachweis) in `apps/api/src/routes/share.ts`. `apps/web` bekommt Teilen-Steuerung in `TourScreen` sowie eine öffentliche `ShareScreen` unter `/share/:token` (eigene MapLibre-Kartenansicht `ShareMap.tsx`, ohne Login erreichbar).
