# ADR 0004: Kein automatischer "überfällig"-Status

## Kontext

ADR 0001 sah einen automatisch berechneten "überfällig"-Status vor (Zeit seit letztem Ping bzw. überschrittene geplante Rückkehrzeit). Bei der Verfeinerung des Datenmodells zeigt sich: Inaktivität (kein neuer Ping, kein Netz, GPS aus) ist kein verlässliches Signal für eine Notlage. Camping am Gipfel, ein Funkloch oder eine bewusste Pause sind normale, harmlose Gründe für eine Pause im Ping-Strom. Ein automatisch gesetzter "überfällig"-Status würde ein irreführendes Signal erzeugen, obwohl laut ADR 0003 ohnehin niemand aktiv benachrichtigt wird – das Risiko einer falschen Dringlichkeitseinschätzung bliebe trotzdem bestehen, sobald jemand das Dashboard öffnet.

## Entscheidung

- `tour` kennt nur zwei Zustände: `aktiv` und `beendet`.
- `beendet` wird ausschließlich durch eine explizite Aktion der nutzenden Person gesetzt ("bin angekommen"), nie durch Zeitablauf oder Inaktivität.
- Es gibt keinen serverseitig berechneten "überfällig"-Status und keinen Hintergrundjob, der Touren danach durchsucht.
- Im tatsächlichen Vermisstenfall läuft die Meldung wie gewohnt über offizielle Kanäle (Notruf); die Bergwacht nutzt das Dashboard danach, um den letzten bekannten `location_ping` einer Person nachzuschlagen (ADR 0003) – unabhängig davon, wie lange die Tour schon läuft oder wann der letzte Ping einging.

## Konsequenzen

- Einfacheres Datenmodell und Backend: kein Scheduler/Cron für eine Überfällig-Berechnung, kein zusätzlicher Tour-Status.
- "Zeit seit letztem Ping" bleibt als reine Anzeige-Information für die Bergwacht relevant (z. B. "letzter Ping vor 4h"), ist aber kein Status und kein Trigger – nur Kontext bei einer aktiven Suche.
- Nutzer, die vergessen, ihre Tour zu beenden, hinterlassen eine dauerhaft aktive Tour ohne weitere Konsequenz. Das ist bewusst akzeptiert, kein zu behebender Fehlerfall.
