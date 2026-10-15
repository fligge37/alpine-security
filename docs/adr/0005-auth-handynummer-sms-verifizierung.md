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
- Rate-Limiting/Missbrauchsschutz für den OTP-Versand (z. B. gegen SMS-Bombing) ist notwendig, aber nicht Teil des ersten Entwurfs – als Hinweis für die Implementierung festgehalten. **Update 2026-10-15:** umgesetzt, siehe unten.

## Offene Fragen (nächste Iteration)

- Welcher SMS-Provider konkret (Twilio, Vonage, …)? SMS-Versand ist weiterhin ein Log-Stub (`apps/api/src/routes/auth.ts`), bewusst noch nicht entschieden/investiert.
- Session-Mechanismus: JWT, serverseitige Session oder Refresh-Token-Rotation?

## Update 2026-10-15: Rate-Limiting für den OTP-Versand

Umgesetzt, unabhängig von der noch offenen Provider-Wahl – schützt schon den bestehenden Log-Stub-Endpoint vor Missbrauch (ungebremstes Füllen der `otp_code`-Tabelle) und ist damit kein Nachzügler, sobald ein echter (kostenpflichtiger) SMS-Versand dazukommt:

- `apps/api/src/otpRateLimit.ts`: zwei unabhängige Zeitfenster-Zähler für `POST /auth/request-otp` – max. 3 Anfragen pro Telefonnummer und max. 5 Anfragen pro IP, je innerhalb von 10 Minuten. Eine Anfrage zählt für beide Grenzwerte, auch wenn bereits einer von beiden greift (sonst ließe sich der IP-Grenzwert umgehen, indem man nach einer geblockten Nummer einfach mit der nächsten Nummer von derselben IP weiterprobiert). Bei Überschreitung antwortet der Endpoint mit `429` statt einen Code zu erzeugen/zu speichern.
- In-Memory statt Redis/DB: passt zum Deployment aus [ADR 0009](0009-deployment-vps-docker-compose.md) (ein einzelner API-Prozess auf einem VPS). Müsste bei mehreren API-Instanzen durch einen gemeinsamen Store ersetzt werden.
- `trustProxy: true` in `apps/api/src/app.ts` ergänzt – ohne das hätte `request.ip` hinter Caddy immer die Proxy-IP geliefert, nicht die echte Client-IP, was den Pro-IP-Grenzwert wirkungslos gemacht hätte.
- Tests in `apps/api/tests/auth.test.ts`; dafür simuliert `randomIp()` in `tests/helpers.ts` pro Test-Fixture eine eigene Client-IP (sonst hätten die vielen `registerUser`-Aufrufe pro Testdatei versehentlich den IP-Grenzwert ausgelöst).
