# Paperless-ngx

Verfolge deinen Dokumentenserver [Paperless-ngx](https://docs.paperless-ngx.com)
aus Gladys, über dein lokales Netzwerk: wie viele Dokumente im Posteingang
warten, was heute gescannt wurde, ob ein Scan fehlgeschlagen ist — und starte
eine Szene, wenn ein neues Dokument ankommt, zum Beispiel „eine Rechnung der
Stadtwerke ist gerade eingegangen“.

Die Integration **liest** nur und erstellt, ändert oder löscht nie ein
Dokument, einen Tag oder eine Aufgabe in Paperless-ngx.

> **Mit echten Paperless-ngx-Servern getestet, noch nicht in einem echten
> Gladys: Rückmeldungen willkommen.** Die Integration wurde mit den
> offiziellen Docker-Images von Paperless-ngx 3.3.1 und 2.20.6 sowie mit dem
> falschen Gladys des Integrations-SDK entwickelt und getestet. Wenn etwas
> nicht wie beschrieben funktioniert, sag es bitte im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-paperless/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- **Paperless-ngx 2.x oder 3.x**, von Gladys aus erreichbar (getestet: 2.20.6
  und 3.3.1).
- Ein **API-Token** eines Paperless-ngx-Benutzers. Klicke in Paperless-ngx
  auf deinen Namen (oben rechts) → **Mein Profil** →
  **API-Authentifizierungstoken**: Erstelle es, falls es keines gibt, und
  kopiere es.

Die Integration sieht, was dieser Benutzer sieht: die Dokumente, die ihm
gehören oder mit ihm geteilt sind, seine Aufgaben und die ohne Besitzer.
Verwende das Token des Benutzers, dessen Dokumente du verfolgen willst; das
Token eines **Administrators** zeigt zusätzlich den freien Speicher, den
Paperless-ngx nur Administratoren zeigt.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Adresse von Paperless-ngx** ein (zum
   Beispiel `http://192.168.1.2:8000`, die Adresse, mit der du Paperless-ngx
   öffnest) und das **API-Token**.
3. Speichere und klicke auf **Verbindung testen**: Die Meldung unter der
   Schaltfläche nennt die Version, die Anzahl der Dokumente und der Aufgaben.
4. Öffne den Tab **Entdecken**: Dort ist das Gerät **Paperless-ngx**. Klicke
   auf **Hinzufügen**, wähle einen Raum und speichere.

Optionen:

- **Selbstsignierte Zertifikate akzeptieren**: für eine `https://`-Adresse
  mit deinem eigenen Zertifikat (ein Reverse-Proxy bei dir zu Hause). Sonst
  deaktiviert lassen.
- **Aktualisierungsintervall**: wie oft Paperless-ngx gelesen wird, von 30
  Sekunden bis 5 Minuten (standardmäßig 1 Minute).
- **Nach Updates von Paperless-ngx suchen**: Alle 6 Stunden fragt
  Paperless-ngx GitHub nach seiner neuesten Version (standardmäßig aktiv).
  Deaktiviere es, und die Frage wird nie gestellt.
- **Sprache der Funktionsnamen**: Englisch, Französisch, Deutsch oder
  Spanisch. Die Namen werden beim Hinzufügen des Geräts vergeben
  (standardmäßig Französisch).

## Das Gerät Paperless-ngx

| Funktion                     | Was es ist                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Online                       | 1, wenn Paperless-ngx antwortet, 0 nach zwei fehlgeschlagenen Abfragen in Folge   |
| Dokumente insgesamt          | Alle Dokumente, die der Benutzer sehen darf                                       |
| Dokumente im Posteingang     | Dokumente mit einem Posteingangs-Tag: noch einzusortieren                         |
| Heute hinzugefügte Dokumente | Seit Mitternacht hinzugefügte Dokumente (Zeitzone von Gladys)                     |
| Laufende Aufgaben            | Wartende oder laufende Aufgaben: Scans in Verarbeitung, geplante Aufträge         |
| Fehlgeschlagene Aufgaben     | Fehlgeschlagene Aufgaben, die in Paperless-ngx nicht verworfen wurden             |
| Korrespondenten              | Anzahl der Korrespondenten                                                        |
| Dokumenttypen                | Anzahl der Dokumenttypen                                                          |
| Tags                         | Anzahl der Tags                                                                   |
| Freier Speicher              | Freier Platz im Speicher von Paperless-ngx, in GB (nur mit Administrator-Token)   |
| Update verfügbar             | 1, wenn eine neuere Version von Paperless-ngx erschienen ist (nichts ohne GitHub) |
| Version                      | Die Version von Paperless-ngx, als Text                                           |

Jede Zahl behält ihren Verlauf in Gladys und kann eine Szene steuern („wenn
_Dokumente im Posteingang_ über 10 steigt…“).

## Dashboard

Das Widget **Paperless-ngx-Posteingang** zeigt drei Kacheln — einzusortierende
Dokumente, heute hinzugefügte, fehlgeschlagene Aufgaben — und die neuesten
Dokumente im Posteingang mit Korrespondent und Typ (3, 5 oder 8, je nach
Widget-Einstellungen). Mit einer `https://`-Adresse verlinkt jedes Dokument
auf Paperless-ngx, und eine Schaltfläche **Paperless öffnen** öffnet es;
Gladys zeigt nur `https://`-Links.

## Szenen

### Auslöser

- **Neues Dokument in Paperless-ngx**: Ein Dokument wurde hinzugefügt (Scan,
  E-Mail, Upload). Filter: **Korrespondent** und **Dokumenttyp**, genau wie
  in Paperless-ngx geschrieben (mit Großbuchstaben); leer gelassen, passt
  jedes Dokument. Die folgenden Aktionen können
  `{{triggerEvent.data.title}}`, `correspondent`, `document_type`, `tags`
  (durch Kommas getrennt), `document_id` und `url` (der Link zum Dokument in
  Paperless-ngx) lesen.
- **Neues Dokument mit einem Tag**: dasselbe, einmal pro Tag des neuen
  Dokuments. Filter: der **Tag** (Pflicht) und optional der
  **Korrespondent**. Dieselben Variablen, dazu `tag`. Paperless-ngx gibt
  jedem neuen Dokument seine Posteingangs-Tags: Eine Szene auf dem Tag
  „Inbox“ startet bei jedem neuen Dokument.
- **Verarbeitung eines Dokuments fehlgeschlagen**: Paperless-ngx konnte eine
  Datei nicht verarbeiten (unlesbarer Scan, Duplikat…) oder eine seiner
  Aufgaben ist fehlgeschlagen. Variablen: `file_name` und `error`.

Neue Dokumente werden erkannt, indem ihre Nummer mit der zuletzt gesehenen
verglichen wird; fehlgeschlagene Aufgaben ebenfalls an ihrer Nummer. Höchstens
10 Ereignisse pro Auslöser und pro Abfrage (ein Massenimport startet keine
Szene hundertmal), und nichts, was älter als 24 Stunden ist. Was beim
allerersten Start der Integration schon existiert, wird nicht gemeldet; nach
einem Neustart werden die in der Zwischenzeit hinzugefügten Dokumente
gemeldet.

### Aktionen

Die Integration hat keine Szenen-Aktion, denn sie liest nur. Die Schaltfläche
**Verbindung testen** in der Konfiguration liest Paperless-ngx sofort und
zeigt einen Bericht.

### Szenen-Ideen

- **„Rechnung der Stadtwerke erhalten“**: Auslöser _Neues Dokument in
  Paperless-ngx_, Korrespondent `Stadtwerke`, Dokumenttyp `Rechnung` →
  Nachricht senden „Neue Rechnung: {{triggerEvent.data.title}}“.
- **„Dringende Post“**: Auslöser _Neues Dokument mit einem Tag_, Tag
  `Dringend` → das Licht im Flur auf Orange schalten.
- **„Der Scanner hat sich verschluckt“**: Auslöser _Verarbeitung eines
  Dokuments fehlgeschlagen_ → Nachricht senden „Paperless konnte
  {{triggerEvent.data.file_name}} nicht verarbeiten“.
- **„Erinnerung zum Einsortieren“**: jeden Samstag um 10:00 Uhr, nur
  fortfahren, wenn _Dokumente im Posteingang_ über 0 liegt → Nachricht
  senden.

## An Paperless-ngx gesendete Anfragen

Bei jeder Abfrage (standardmäßig jede Minute): die Statistiken, die Anzahl
der heute hinzugefügten Dokumente, die neuesten Dokumente der letzten 24
Stunden (höchstens 25, ohne Inhalt), die laufenden und die fehlgeschlagenen
Aufgaben — fünf leichte GET-Anfragen (sechs mit Paperless-ngx 2.x). Alle 10
Minuten der Systemstatus (Speicher), alle 6 Stunden die neueste Version. Die
Namen der Korrespondenten, Typen und Tags werden nur für neue Dokumente
gelesen und eine Stunde behalten. Paperless-ngx setzt kein
Anfragekontingent; auf einem kleinen NAS wähle ein längeres Intervall.

## Fehlerbehebung

- **„API-Token abgelehnt“**: Kopiere das Token erneut aus Mein Profil; ein
  neu erstelltes Token ersetzt das alte. Ein deaktivierter Benutzer wird
  ebenfalls abgelehnt.
- **„Paperless-ngx antwortet nicht“**: Prüfe Adresse und Port von dem
  Rechner aus, auf dem Gladys läuft (`curl http://192.168.1.2:8000/api/`).
- **„Die Adresse leitet um“**: Gib direkt die `https://`-Adresse ein. Ein
  Anmeldeportal (Authelia, Authentik…) vor Paperless-ngx muss `/api/` mit
  dem Token durchlassen.
- **„Zertifikat abgelehnt“**: Aktiviere _Selbstsignierte Zertifikate
  akzeptieren_.
- **„Keine Paperless-ngx-API unter dieser Adresse“**: Die Adresse antwortet,
  aber nicht mit Paperless-ngx (ein fehlender Unterpfad, ein anderer Dienst
  auf dem Port).
- **Freier Speicher bleibt leer**: Das Token gehört keinem Administrator.
- **0 Dokumente, obwohl Paperless-ngx viele hat**: Der Benutzer des Tokens
  darf sie nicht sehen (Dokumente eines anderen Besitzers): Verwende ein
  anderes Token oder teile sie.
- **Update verfügbar bleibt leer**: Paperless-ngx konnte GitHub nicht fragen
  (kein Internetzugang auf dem Server) oder die Prüfung ist deaktiviert.
- Mehr Details: Setze `LOG_LEVEL=debug` für den Container, die Protokolle
  zeigen dann jede Abfrage. Das Token wird nie in die Protokolle geschrieben.

## Grenzen

- Eine Paperless-ngx-Instanz pro Installation der Integration.
- Nur lesen: kein Hochladen, kein Taggen, kein Verwerfen fehlgeschlagener
  Aufgaben aus Gladys.
- Die Filter der Auslöser vergleichen exakte Namen: `EDF` passt nicht zu
  `edf`.
- Ein Dokument wird einmal gemeldet, wenn es zum ersten Mal gesehen wird;
  ein später von Hand hinzugefügter Tag löst _Neues Dokument mit einem Tag_
  nicht aus.
- Paperless-ngx 1.x wird nicht unterstützt.
- Nicht mit dem Projekt Paperless-ngx verbunden.
