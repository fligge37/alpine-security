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

- Ablauf/Gültigkeit des Links (z. B. nur während laufender Tour, X Stunden nach Tourende, manuell widerrufbar?)
- Granularität der Ansicht: kompletter Tourverlauf oder nur letzter bekannter Standort (analog zur Bergwacht-Ansicht)?
- Ein Link pro Tour oder mehrere, einzeln widerrufbare Links für unterschiedliche Personen?
- Schutz gegen Erraten/Bruteforcing der Link-ID (ausreichende Entropie, kein sequentielles Format)
- UX-Formulierung für Mitlesende, damit kein falsches "Live-Tracking/Alarmsystem"-Verständnis entsteht
