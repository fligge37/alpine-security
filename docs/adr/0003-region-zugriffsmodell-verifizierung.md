# ADR 0003: Regionszuordnung, Bergwacht-Zugriffsmodell und Account-Verifizierung

Beantwortet die drei offenen Fragen aus [ADR 0001](0001-systemdesign-und-check-in-modell.md).

## 1. Regionszuordnung

**Entscheidung:** Für den Start eine einzige, grob zugeschnittene Region – Landkreis Oberallgäu. Keine Polygon-Digitalisierung, keine Mehrregionen-Logik im MVP.

Die `region`-Entität aus ADR 0001 bleibt trotzdem als eigenständiges Datenmodell bestehen (nicht hart auf "Oberallgäu" im Code verdrahten), damit spätere Regionen oder eine Umstellung auf echte PostGIS-Polygone ohne Migration der Kernlogik möglich sind. Für eine einzelne Region ist die Zuordnung ohnehin trivial (jede Tour/jeder Nutzer gehört zur einzigen vorhandenen Region) – die eigentliche räumliche Filterung wird erst mit einer zweiten Region relevant.

## 2. Bergwacht-Zugriffsmodell: Pull statt Push

**Entscheidung:** Das System alarmiert die Bergwacht nicht automatisch, wenn eine Tour "überfällig" wird. Stattdessen ist das Dashboard ein **Nachschlage-/Suchwerkzeug**, das bei einem externen Anlass genutzt wird:

- "Person X wurde vermisst gemeldet – war sie bei Alpine Security eingeloggt, gibt es Standortdaten?"
- "Leuchtzeichen am Rubihorn gesichtet – ist dort laut Alpine Security jemand unterwegs, können wir Kontakt aufnehmen?"

Das heißt konkret: Die Bergwacht sucht aktiv (nach Name, Zeitraum, Ort/Gebiet), das System drängt sich nicht auf. Der "überfällig"-Status einer Tour bleibt als berechnetes Attribut bestehen und wird bei einer Suche angezeigt (z. B. "seit 3h ohne Rückmeldung"), löst aber selbst keine Benachrichtigung aus.

**Konsequenz für den Tech-Stack:** Der in ADR 0001 skizzierte "Benachrichtigungsdienst (Push, SMS-Fallback)" für die *Bergwacht-Alarmierung* entfällt vorerst ersatzlos – kein Twilio/Push-Provider für diesen Zweck im MVP nötig. Push-Erinnerungen an den *Nutzer* selbst (z. B. "Bald überfällig – alles ok?") sind davon unberührt und bleiben eine separate, spätere Entscheidung.

Diese Entscheidung unterstreicht die "kein Ersatz für den Notruf"-Leitplanke zusätzlich auf technischer Ebene: Das System initiiert nichts selbstständig, es beantwortet nur Anfragen von Bergwacht-Mitarbeitenden, die bereits über einen anderen Kanal (Notruf, Sichtung) aktiv geworden sind.

**Offen für später:** Ob und ab wann eine proaktive Eskalationsstufe (z. B. Push an Nutzer vor "überfällig") sinnvoll ist, bleibt bewusst offen und wird nicht vorgezogen.

## 3. Verifizierung von Bergwacht-Accounts

**Entscheidung:** Manuell, durch den Betreiber selbst (kein automatisierter Prozess, kein Abgleich mit einer Mitgliederliste im MVP). Es braucht dafür keine eigene Admin-Oberfläche – die Freischaltung kann direkt auf Datenbankebene erfolgen, solange es nur eine Region/einen Verifizierer gibt.

## Konsequenzen

- Deutlich reduzierter Scope für den ersten Wurf: keine Benachrichtigungs-Provider-Integration, keine Mehrregionen-/Polygon-Logik, keine Admin-Oberfläche für Account-Freischaltung.
- Alles drei ist bewusst als vorläufig markiert und an genau eine Bedingung geknüpft: Region wird relevant, sobald ein zweiter Bergwacht-Bereich dazukommt; Verifizierung wird relevant, sobald das Volumen manuelle Freischaltung durch eine Einzelperson übersteigt. Beides sollte dann als eigenes ADR revidiert werden, nicht stillschweigend im Code.
