# Systemdesign: Alpine Sicherheits-App (Arbeitstitel)

## 0. Rahmenbedingungen (aus dem Gespräch)

- Live-Tracking während der Tour, Intervall ca. alle 2–3 Minuten (kein Echtzeit-Sekundentakt nötig)
- Langfristiges Projekt, Qualität vor Tempo, kein MVP-Zeitdruck
- Noch kein bestätigter Pilotpartner (Bergwacht-Kontakt vorhanden, aber nicht angefragt)
- Zwei Nutzergruppen: (1) Wanderer/Trailläufer (Endnutzer-App), (2) Bergwacht-Mitarbeitende (Einsicht/Dashboard)

---

## 1. High-Level Architektur

```
┌─────────────────────┐         ┌──────────────────────┐
│   Endnutzer-App      │         │  Bergwacht-Dashboard  │
│   (PWA, später       │         │  (Web, Refine-basiert)│
│    ggf. nativ)       │         └───────────┬───────────┘
└──────────┬───────────┘                     │
           │ HTTPS/REST                      │ HTTPS/REST + WebSocket
           │ (Tour-Anmeldung,                │ (Live-Ansicht aktiver
           │  Standort-Batches,               │  Touren, Suche, Kontakt)
           │  Check-in/Check-out)            │
           ▼                                  ▼
┌─────────────────────────────────────────────────────────┐
│                     Backend API                          │
│  - Auth & Rollen (Wanderer / Bergwacht-Mitarbeitende)     │
│  - Tour-/Session-Verwaltung (Start, aktiv, beendet,       │
│    überfällig)                                            │
│  - Standort-Ingestion (Batch-Empfang, Validierung)         │
│  - Alarmierungs-/Overdue-Logik                             │
│  - Benachrichtigungsdienst (Push, SMS-Fallback)            │
└──────────┬─────────────────────────┬─────────────────────┘
           │                         │
           ▼                         ▼
┌────────────────────┐   ┌─────────────────────────┐
│ PostgreSQL +        │   │ Notification Provider    │
│ PostGIS              │   │ (Push + SMS, z.B. Twilio)│
│ - Nutzer/Touren      │   └─────────────────────────┘
│ - Standort-Historie  │
│ - Regionen/Zuständig-│
│   keiten Bergwacht   │
└────────────────────┘
```

**Kernentitäten:**

- `user` (Wanderer, mit Kontaktdaten, Notfallkontakt optional)
- `rescue_org_member` (verifizierte Bergwacht-Accounts, an eine Region gebunden)
- `tour` (geplante Route/Gebiet, Startzeit, geplante Rückkehrzeit, Status: geplant/aktiv/beendet/überfällig)
- `location_ping` (Zeitstempel, Koordinaten, Genauigkeit, zugehörige Tour)
- `region` (geografisches Zuständigkeitsgebiet einer Bergwacht-Organisation, als Polygon in PostGIS)

---

## 2. Die schwierigen Teile

Das sind die Stellen, an denen ich aufpassen würde, weil sie entweder technisch riskant oder für die Sicherheit des Nutzers entscheidend sind:

1. **Konnektivität im alpinen Gelände (der risikoreichste Teil)**
   Funklöcher sind in den Bergen der Normalfall, nicht die Ausnahme. Ein "Live-Tracking", das bei fehlendem Netz einfach nichts überträgt, kann eine trügerische Sicherheit erzeugen. Das ist der Kern der App – dazu unten der Vergleich zweier Ansätze.

2. **Akkulaufzeit**
   Stundenlanges GPS + periodische Netzübertragung ist ein Sicherheitsgerät, dessen Akku nicht leer sein darf, wenn er gebraucht wird. Die Intervall-Wahl (2–3 Min.) hilft, aber Hintergrund-GPS ist auf iOS/Android unterschiedlich restriktiv gehandhabt.

3. **Geografisches Matching bei einem echten Notruf**
   Wenn ein Alarm eingeht ("Lichtsignal am Berg X"), muss die Bergwacht schnell sehen können: Welche registrierten Touren sind in diesem Gebiet, zu dieser Zeit, aktiv oder kürzlich beendet? Das ist eine räumlich-zeitliche Abfrage (PostGIS `ST_DWithin` + Zeitfenster), die gut performen und einfach bedienbar sein muss – unter Stress, nicht am Schreibtisch.

4. **Vertrauen & Zugriffskontrolle auf Bergwacht-Seite**
   Wer darf Bergwacht-Accounts anlegen? Regionale Zuständigkeit muss technisch durchgesetzt werden (Bergwacht Region A sieht nicht automatisch Wanderer in Region B) – sonst ist das ein Datenschutzproblem, nicht nur ein Detail.

5. **Rechtliche/kommunikative Einordnung**
   Die App darf nie als Ersatz für den Notruf wirken. Das betrifft UX-Texte, Onboarding und auch technische Grenzen (z.B. kein automatischer "Sturz erkannt"-Alarm ohne sehr hohe Zuverlässigkeit – Fehlalarme würden das Vertrauen der Bergwacht in das System zerstören).

6. **Datensparsamkeit/Löschung**
   Standortverlauf sollte nach Tourende automatisch nach kurzer Frist gelöscht werden (DSGVO), aber die Bergwacht braucht ihn ggf. noch etwas länger im Ernstfall. Das ist ein Zielkonflikt, der bewusst im Datenmodell gelöst werden muss (z.B. gestaffelte Löschfristen).

---

## 3. Der risikoreichste Teil im Detail: Standorterfassung bei unzuverlässiger Konnektivität

Die ganze App steht oder fällt damit, ob "letzte bekannte Position" tatsächlich verlässlich ist, wenn eine Bergwacht sie braucht. Zwei grundsätzlich unterschiedliche Ansätze:

### Ansatz A – Kontinuierliches Tracking mit Offline-Puffer

Die App sammelt GPS-Punkte lokal (native Background-Location-API) im gewählten Intervall, speichert sie lokal (SQLite/IndexedDB) und sendet sie in Batches, sobald wieder Netz da ist (mit Retry/Backoff). Das Dashboard zeigt "letzte Position vor X Minuten" mit einem Alters-Indikator.

**Vorteile**

- Funktioniert im Grunde unabhängig davon, wie lückenhaft das Netz ist – Daten gehen nicht verloren, sie kommen nur verzögert an
- Liefert einen tatsächlichen Bewegungspfad, nicht nur Einzelpunkte – wichtig für die Suche ("er ist zuletzt hier lang gegangen")
- Entspricht dem, was Nutzer sich unter "Live-Tracking" vorstellen

**Nachteile**

- Dauerhafte Hintergrund-Standorterfassung ist auf iOS als PWA praktisch nicht zuverlässig umsetzbar (iOS killt Hintergrundprozesse von Web-Apps aggressiv) – das spricht mittelfristig für eine native App oder zumindest einen nativen Wrapper (z.B. Capacitor), was den Aufwand erhöht
- Höherer Akkuverbrauch
- Mehr Komplexität (Sync-Logik, Konfliktbehandlung, Speicherverwaltung auf dem Gerät)
- Bei Akku-leer oder App-Kill vor dem nächsten Sync können Daten ganz fehlen – und das im schlimmsten Moment

### Ansatz B – Check-in-basiertes Modell (periodische Bestätigung statt Dauertracking)

Bei Tour-Start hinterlegt der Nutzer geplante Route/Gebiet und erwartete Rückkehrzeit. Statt eines kontinuierlichen Tracks sendet die App nur dann einen Standort, wenn ohnehin Netz verfügbar ist (opportunistisch, z.B. bei jedem App-Wechsel in den Vordergrund, oder zu wenigen festen Checkpoints). Bleibt eine erwartete Rückmeldung aus oder wird die Rückkehrzeit deutlich überschritten, markiert das System die Tour als "überfällig" und die Bergwacht sieht: letzter bekannter Punkt + geplante Route + Zeit seit letztem Lebenszeichen.

**Vorteile**

- Technisch deutlich robuster umsetzbar, auch als PWA – kein Kampf gegen OS-Hintergrundbeschränkungen nötig
- Spürbar geringerer Akkuverbrauch
- Weniger invasiv (kein Dauertracking) – einfacher zu kommunizieren und datenschutzfreundlicher, was auch die Akzeptanz bei einer Bergwacht als Pilotpartner erhöhen dürfte
- Entspricht etablierter Bergsicherheits-Praxis ("Tourenplan hinterlegen, Rückkehrzeit melden") – Nutzer verstehen das Konzept sofort

**Nachteile**

- Kein durchgehender Bewegungspfad – wenn zwischen zwei Checkpoints etwas passiert, ist nur der letzte Punkt bekannt, nicht der genaue Ort des Vorfalls
- Verlässt sich stärker auf Netz-Gelegenheiten statt auf ein festes Intervall
- Fühlt sich für Nutzer evtl. weniger nach "Sicherheitsnetz" an als ein sichtbarer Live-Track

### Empfehlung

Für den Start würde ich zu **Ansatz B** raten – nicht weil er "besser" ist, sondern weil er als PWA realistisch zuverlässig umsetzbar ist und die Kernaussage der App (jemand weiß, wo ich ungefähr bin, falls etwas passiert) bereits erfüllt, ohne dass ihr gegen native Plattform-Beschränkungen ankämpfen müsst. Das passt auch zu "Qualität vor Tempo" – lieber ein einfacheres Modell, das zuverlässig funktioniert, als ein ambitioniertes Live-Tracking, das in der Praxis Lücken hat und im Ernstfall Vertrauen kostet.

Ansatz A wäre der logische nächste Schritt, sobald ihr (a) eine validierte Nutzerbasis habt und (b) bereit seid, in eine native App zu investieren – dann ließe sich Ansatz B als Fallback beibehalten (funktioniert immer) und Ansatz A als Komfort-Erweiterung (genauerer Track, wenn Netz vorhanden ist) daraufsetzen.

---

## 4. Offene Fragen für die nächste Iteration

- Wie soll die Regionszuordnung der Bergwacht-Organisationen technisch abgebildet werden (Polygone, Landkreise, Vereinsgebiete)?
- Soll es eine Eskalationsstufe geben, bevor eine Tour "überfällig" markiert wird (z.B. Push "Alles ok?" mit Countdown)?
- Wie wird ein Bergwacht-Account verifiziert (manuell durch euch, durch die Organisation selbst, über eine bestehende Mitgliederliste)?
