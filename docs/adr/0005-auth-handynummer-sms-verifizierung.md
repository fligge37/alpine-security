# ADR 0005: Authentifizierung über Handynummer mit SMS-Verifizierung

## Kontext

Klassisches E-Mail/Passwort passt nicht gut zum Zweck der App: Die Handynummer _ist_ der eigentliche Wert (Erreichbarkeit im Ernstfall), nicht eine abstrakte Account-Identität. Eine unverifizierte oder falsch eingegebene Nummer würde das Sicherheitsversprechen der App aushebeln, ohne dass jemand es merkt. Gleichzeitig soll die Nummer nicht bei jeder Tour erneut eingegeben werden müssen – das erhöht Reibung und Tippfehler-Risiko genau an der Stelle, die am wichtigsten ist.

## Entscheidung

- `user`-Konten sind **persistent** und über `phone_number` (unique) identifiziert – kein E-Mail/Passwort.
- Die Nummer wird **einmalig per SMS-OTP verifiziert** (Code per SMS, Nutzer bestätigt ihn bei der Registrierung).
- Nach erfolgreicher Verifizierung erfolgt der Login sessionbasiert (Gerät bleibt eingeloggt); ein erneuter OTP-Versand ist nur nötig bei neuem Gerät, abgelaufener Session oder Nummernänderung.
- `rescue_org_member` (Bergwacht-Accounts) ist davon nicht betroffen und bleibt vorerst bei E-Mail/Passwort – dort ist die Handynummer nicht der Zweck des Accounts, sondern professioneller Dashboard-Zugriff.

## Abgewogene Alternativen

- **E-Mail/Passwort für `user`**: verworfen – zusätzlicher Reibungspunkt (Passwort merken/zurücksetzen), ohne dass eine E-Mail-Adresse dem eigentlichen Zweck (Erreichbarkeit) etwas hinzufügt.
- **Unverifizierte Nummer (reines Vertrauen)**: verworfen wegen des Risikos, dass eine falsche oder erfundene Nummer im Ernstfall unbemerkt ins Leere läuft.
- **Nummer bei jeder Tour neu eingeben, kein Konto**: verworfen – erhöht die Fehleranfälligkeit bei genau der Eingabe, auf die sich im Ernstfall alles verlässt, und erzeugt unnötige Reibung bei wiederkehrender Nutzung.

## Konsequenzen

- Ein **SMS-Provider** (z. B. Twilio) wird für den OTP-Versand benötigt. Das ist kein Widerspruch zu ADR 0003 (dort wurde ein Benachrichtigungsprovider für die _Bergwacht-Alarmierung_ verworfen) – hier geht es um einen anderen Zweck, die einmalige Verifizierung der Nutzer-Nummer. Betriebskosten/Komplexität eines SMS-Providers sind damit trotzdem wieder Teil des Systems, nur an anderer Stelle.
- `user` benötigt zusätzlich zu den bisherigen Feldern: `phone_number` (unique), `phone_verified_at`, sowie eine Session-/Token-Verwaltung für den Folge-Login ohne erneute Eingabe.
- Rate-Limiting/Missbrauchsschutz für den OTP-Versand (z. B. gegen SMS-Bombing) ist notwendig, aber nicht Teil des ersten Entwurfs – als Hinweis für die Implementierung festgehalten.

## Offene Fragen (nächste Iteration)

- Welcher SMS-Provider konkret (Twilio, Vonage, …)?
- Session-Mechanismus: JWT, serverseitige Session oder Refresh-Token-Rotation?
- Rate-Limiting-Strategie für den OTP-Versand
