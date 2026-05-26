# DatasynxOpenCRM — Enterprise Plan v1.0
**Brand:** Datasynx · **CLI:** `dxcrm` · **npm:** `datasynx-opencrm`
**Version:** Enterprise 1.0 · **Basis:** plan.md v4 (vollständig implementiert) · **Datum:** 2026-05-26

> **Phase 1–5 ABGESCHLOSSEN** ✅ — 566 Tests · Build sauber · Auf `main` gemergt
> Dieser Plan ersetzt und erweitert plan.md v4 für den Enterprise-Pfad.

---

## Die erweiterte strategische Wette

> **Nicht ein besseres CRM. Eine Infrastruktur, die alle CRMs obsolet macht.**

Phase 1–5 hat bewiesen: Ein Solo-Entwickler kann 7 Tage täglich ohne HubSpot auskommen.
Enterprise-Plan zielt auf das andere Ende: Ein 500-Personen-Sales-Team verlässt Salesforce.

Die Wette bleibt dieselbe — aber der Scope expandiert:
- **Von:** Local-first Markdown-CRM für Entwickler
- **Zu:** Universal CRM Replacement Infrastructure mit nativen Konnektoren zu allen 10 führenden CRMs, Google Workspace, und Microsoft 365

---

## Was bereits implementiert ist (Dominos 1–5) ✅

| Domino | Status | Kern-Deliverable |
|---|---|---|
| 1 — Core Loop | ✅ | 9 MCP-Tools, 9 Framework-Adapter, Gmail-Sync, LanceDB |
| 2 — Flywheel | ✅ | Daemon, Transcript-Watch, Agent-Spawn, HubSpot/CSV Import |
| 3 — Team-Schicht | ✅ | VM-Deployment, Session-Ownership, Audit-Trail |
| 4 — Enterprise-Basis | ✅ | RBAC, GDPR-Erasure, Microsoft-Sync, Salesforce/Pipedrive Import |
| 5 — Migration | ✅ | update_customer_facts MCP, Pipedrive-API, LLM-Feldmapping |

**Kritische offene Lücken aus Final-Plan.md (Basis für Domino 6+):**
- RBAC-Enforcement nicht in MCP-Tool-Handlern verdrahtet (Critical)
- GDPR löscht LanceDB-Vektoren nicht (Critical)
- Microsoft-Sync: Kalender-Events + Teams-Transkripte fehlen
- On-Query-Sync-Trigger fehlt in `get_customer_context()`
- Keine Field-Level-Encryption
- Keine SSO/SAML-Integration
- Keine Custom Pipeline Stages
- Kein Webhook-Receiver-Framework

---

## Die neue Domino-Sequenz (Enterprise-Erweiterung)

```
DOMINO 6: Die universelle Sync-Schicht (Monate 7–9)
"Ein Team synct Gmail, Outlook, Teams-Transkripte und Google Meet — automatisch."
→ Entsperrt: vollständige Kommunikationshistorie ohne manuelle Eingabe

DOMINO 7: Die 10-CRM-Import-Suite (Monate 8–11)
"Ein Enterprise-Kunde migriert von Salesforce, HubSpot, Dynamics, Zoho mit einem Befehl."
→ Entsperrt: Enterprise-Sales-Gespräche bei Fortune-500-Unternehmen

DOMINO 8: Die Enterprise-Sicherheitsschicht (Monate 10–13)
"DatasynxOpenCRM besteht jeden Enterprise-Security-Review: SSO, Encryption, RLS."
→ Entsperrt: Procurement-Freigabe bei sicherheitskritischen Unternehmen

DOMINO 9: Die Intelligence-Schicht (Monate 11–15)
"AI-powered Meeting-Summaries, Deal-Health-Scoring, Pipeline-Forecasting."
→ Entsperrt: der Mehrwert, den kein Cloud-CRM bei €0 bietet

DOMINO 10: Die Plattform (Monate 14–18)
"Andere Unternehmen bauen auf DatasynxOpenCRM-Infrastruktur. Plugin-Ökosystem."
→ Entsperrt: Platform-ARR, Ecosystem-Moat, Marktführerschaft
```

---

## DOMINO 6 — Die universelle Sync-Schicht

### 6.1 Google Workspace — Vollständige Integration

**Bereits implementiert:** Gmail-Sync (E-Mail-Header + Snippet), Google-Calendar-Sync

**Fehlend und zu implementieren:**

#### 6.1.1 Gmail — Vollständige E-Mail-Bodies + Push-Watch

```typescript
// src/sync/gmail-full-sync.ts

// Vollständige Nachricht (nicht nur Header/Snippet)
// GET /gmail/v1/users/me/messages/{id}?format=full
// Body: raw MIME → base64url-dekodiert → geparst

// Batch-Fetch (100 Nachrichten pro HTTP-Request)
// POST https://www.googleapis.com/batch/gmail/v1
// multipart/mixed boundary — jede Teilanfrage kostet separate Quota-Units

// Push-Watch (Echtzeit statt Polling)
// POST /gmail/v1/users/me/watch
// {topicName: "projects/{project}/topics/{topic}", labelIds: ["INBOX"]}
// Läuft ab nach 7 Tagen → muss vor Ablauf erneuert werden
// Wacht über Cloud Pub/Sub → Webhook-Endpunkt → /history?startHistoryId={id}
```

**Technische Fallstricke:**
- `format=raw` → base64url-kodiertes RFC-2822 — `Buffer.from(raw, 'base64url').toString()`
- `resultSizeEstimate` ist Schätzwert, nicht exakt — immer paginieren
- Watch-Ablauf ist lautlos: keine Fehlermeldung, Nachrichten werden einfach verpasst
- Quota: 6.000 Units/User/Minute; `messages.get` = 5 Units → max 1.200 Nachrichten/Min

**Benötigte OAuth-Scopes:**
- `https://www.googleapis.com/auth/gmail.readonly` (bevorzugt)
- `https://www.googleapis.com/auth/gmail.metadata` (nur Header — für Metadaten-Sync)

**CLI:**
```bash
dxcrm sync <slug> --provider gmail --full-body   # komplette Bodies
dxcrm sync <slug> --provider gmail --watch       # Push statt Polling
```

---

#### 6.1.2 Google Calendar — Meeting-Intelligence

```typescript
// src/sync/google-calendar-sync.ts

// Alle Events mit Teilnehmern
// GET /calendar/v3/calendars/primary/events
// ?q=acme.com&singleEvents=true&maxResults=2500&pageToken={token}

// Inkrementeller Sync (syncToken)
// Erste Vollsynchronisation → letztes Response enthält syncToken
// Folgeaufruf: GET /calendars/primary/events?syncToken={token}
// Bei 410 Gone (Token abgelaufen) → Vollsync wiederholen

// Meeting-Link-Extraktion aus conferenceData
// event.conferenceData.entryPoints[0].uri → Google Meet Link
// event.conferenceData.conferenceId → für Transkript-Lookup
```

**Benötigte OAuth-Scopes:**
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

**Integration in CRM:**
- Jedes Calendar-Event mit Kunden-Domain → automatischer `interactions.md`-Eintrag
- Typ: `Meeting`, Teilnehmer aus `attendees[]`, Dauer berechnet
- `conferenceData.conferenceId` als `sourceRef: google-meet://conference/{id}`

---

#### 6.1.3 Google Meet — Transkripte und Aufzeichnungen

**API:** `https://meet.googleapis.com/v2/` (Meet REST API v2, GA seit 2024)

```typescript
// src/sync/google-meet-sync.ts

// Conference-Records nach Space filtern
// GET /v2/conferenceRecords?filter=space.name="spaces/{spaceId}"&pageSize=100

// Transkript-Liste für ein Meeting
// GET /v2/conferenceRecords/{recordId}/transcripts

// Einzelne Transkript-Einträge (Utterances)
// GET /v2/conferenceRecords/{recordId}/transcripts/{transcriptId}/entries
// ?pageSize=100&pageToken={token}
// Entry-Format: {entryId, participantSession, startTime, endTime, text}

// Aufzeichnung → Drive-Datei
// GET /v2/conferenceRecords/{recordId}/recordings
// recording.driveDestination.file → Drive File ID → Drive API für Download
```

**Benötigte OAuth-Scopes (restricted — benötigt Google OAuth-Verification):**
- `https://www.googleapis.com/auth/meetings.space.readonly`

**Kritische Einschränkungen:**
- Nur für Google Workspace Business Standard / Plus / Enterprise → Basic-Plan-User erhalten KEINE Transkripte über API
- Scopes sind als "sensitiv/eingeschränkt" klassifiziert → OAuth-App-Verification dauert Wochen
- Transkripte verfügbar erst NACH Meeting-Ende (kein Echtzeit-Zugriff)

**Pipeline:** `conferenceId` → Transkript-Entries → LLM-Summary → `interactions.md`-Eintrag

---

#### 6.1.4 Google Drive — Attachments und Proposals

```typescript
// src/sync/google-drive-sync.ts

// Dateien eines Kunden suchen
// GET /drive/v3/files
// ?q='contact@acme.com' in owners and mimeType != 'application/vnd.google-apps.folder'
// &fields=files(id,name,mimeType,modifiedTime,size,webViewLink)
// &pageSize=100&pageToken={token}

// Rate Limits: 10 req/s per user
// Scope: drive.metadata.readonly (bevorzugt für Metadaten-Only)
```

---

### 6.2 Microsoft 365 — Vollständige Integration

**Bereits implementiert:** Outlook-E-Mail-Sync (Basis-Header via Graph)

**Fehlend und zu implementieren:**

#### 6.2.1 Microsoft Graph — Outlook-E-Mails (Vollständig)

```typescript
// src/sync/microsoft-mail-sync.ts

// Alle Nachrichten mit Delta-Sync
// GET /v1.0/me/mailFolders/inbox/messages/delta
// ?$select=subject,from,toRecipients,receivedDateTime,body,conversationId
// &$top=50

// Pagination: folge @odata.nextLink (mehr Seiten) bis @odata.deltaLink erscheint
// Speichere deltaLink für nächste inkrementelle Sync-Session
// Bei nächstem Lauf: GET {deltaLink} direkt — KEINE Parameter anhängen

// Batch (max 20 Sub-Requests pro Batch)
// POST /v1.0/$batch
// {requests: [{id:"1", method:"GET", url:"/me/messages/{id1}"}, ...]}

// Domain-Filter
// GET /me/messages?$filter=contains(from/emailAddress/address,'acme.com')&$top=50
// HINWEIS: $filter und $search können NICHT kombiniert werden
```

**Benötigte OAuth-Scopes:**
- `Mail.Read` (delegated) — einzelner User
- `Mail.Read` (application) — alle User in Organisation (Admin-Consent erforderlich)

**Throttling:**
- HTTP 429 mit `Retry-After`-Header (Sekunden) — IMMER einhalten
- Weitere Requests während Backoff verlängern die Penalty-Window
- Ab 30.09.2025: Per-App/Per-User-Throttle auf 50% des Tenant-Gesamtlimits reduziert
- **Microsoft Graph Data Connect** für Bulk-Extraktion (bypasst API-Throttling → Azure-Pipeline)

---

#### 6.2.2 Microsoft Graph — Outlook-Kalender

```typescript
// src/sync/microsoft-calendar-sync.ts

// CalendarView: wiederkehrende Events werden als Einzelinstanzen expandiert
// GET /me/calendarView
// ?startDateTime=2024-01-01T00:00:00Z&endDateTime=2027-01-01T00:00:00Z
// &$select=id,subject,start,end,attendees,onlineMeeting,body,location
// &$top=50

// Delta-Sync
// GET /me/calendarView/delta?startDateTime=...&endDateTime=...
// Folge nextLink-Seiten → deltaLink erscheint am Ende
// WICHTIG: startDateTime/endDateTime sind im deltaLink enkodiert —
//          bei inkrementellem Sync NICHT nochmals anhängen

// Teams-Meeting-Link im Event
// event.onlineMeeting.joinUrl → enthält meetingId für Transkript-Lookup
// event.onlineMeetingProvider == "teamsForBusiness"
```

**Benötigte OAuth-Scopes:**
- `Calendars.ReadBasic` (bevorzugt: nur Zeit, Betreff, Ort)
- `Calendars.Read` (vollständig inkl. Body)

---

#### 6.2.3 Microsoft Teams — Transkripte und Aufzeichnungen

```typescript
// src/sync/microsoft-teams-sync.ts

// Transkriptliste für ein Meeting
// GET /v1.0/users/{userId}/onlineMeetings/{meetingId}/transcripts

// MeetingId aus Calendar-Event extrahieren
// GET /me/onlineMeetings?$filter=JoinWebUrl eq '{joinUrl}'
// → gibt onlineMeeting-Objekt mit korrekter encoded ID zurück

// Transkript-Content herunterladen
// GET /v1.0/users/{userId}/onlineMeetings/{meetingId}/transcripts/{transcriptId}/content
// Format: text/vtt (Standard) oder application/vnd.openxmlformats... (DOCX)
// $format=text/vtt für VTT-Parsing

// Aufzeichnungen
// GET /users/{userId}/onlineMeetings/{meetingId}/recordings

// Alle Transkripte einer Organisation (Admin)
// GET /users/{userId}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{userId}')
```

**Benötigte Berechtigungen (Application, Admin-Consent):**
- `OnlineMeetingTranscript.Read.All`
- `OnlineMeetingRecording.Read.All`

**Kritisches Setup (PowerShell):**
```powershell
New-CsApplicationAccessPolicy -Identity DxcrmPolicy -AppIds "<app-id>"
Grant-CsApplicationAccessPolicy -PolicyName DxcrmPolicy -Identity "<user-object-id>"
```

**Kritische Einschränkungen:**
- Bekanntes Microsoft-Bug (Oktober 2025): Transkripte nach dem 13.10.2025 fehlen in einigen Tenants
- Meetings expire nach 60 Tagen → Transkripte danach nicht mehr abrufbar
- `joinUrl` allein reicht nicht für meetingId → immer über `$filter=JoinWebUrl` auflösen
- Tenant-Admin muss `AllowTranscription: $true` in CsTeamsMeetingPolicy setzen

---

#### 6.2.4 Sync-Integration in dxcrm

```bash
# CLI nach Implementierung
dxcrm sync <slug> --provider microsoft --full          # E-Mail + Kalender + Teams
dxcrm sync <slug> --provider microsoft --transcripts   # nur Teams-Transkripte
dxcrm sync --provider google --watch                   # Gmail Push + Calendar syncToken
dxcrm sync --provider google --meet                    # Meet-Transkripte + Recordings
```

**MCP-Server-Integration:**
- `get_customer_context()` On-Query-Sync-Trigger implementieren (seit Phase 1 offen)
- Neue interne Funktion: `ensureFreshSync(slug, maxAgeMinutes=15)`

---

## DOMINO 7 — Die 10-CRM-Import-Suite

### Technische Spezifikation pro CRM

#### 7.1 Salesforce — Vollständige API-Referenz

**Bulk Discovery (Async CSV — empfohlen für >10.000 Records):**
```
POST /services/data/v61.0/jobs/query
{
  "operation": "query",
  "query": "SELECT Id,Name,BillingCity,Phone,Website,Industry,AnnualRevenue FROM Account",
  "contentType": "CSV",
  "lineEnding": "LF"
}

→ Poll: GET /services/data/v61.0/jobs/query/{jobId}
→ Warte auf: state == "JobComplete"
→ Download: GET /services/data/v61.0/jobs/query/{jobId}/results?maxRecords=50000
→ Pagination: Sforce-Locator Header (string) — "null" (Literal-String!) = letzte Seite
```

**SOQL REST (Synchron, für <10.000 Records):**
```
GET /services/data/v61.0/query?q=SELECT+Id,Name+FROM+Account
→ Response: {records[], totalSize, done, nextRecordsUrl}
→ Folge nextRecordsUrl bis done: true
→ Max 2.000 Records pro Seite
```

**Per-Record Historie (Account ID = 001xxx):**
```
# Activity History (virtual relationship — einzige Weise für alle Aktivitäten)
SELECT Id, (SELECT Id, Subject, CreatedDate, ActivityType FROM ActivityHistories)
FROM Account WHERE Id = '001xxxx'

# Tasks (flach, WhatId-Filter)
SELECT Id, Subject, Status, ActivityDate, Description FROM Task WHERE WhatId = '001xxxx'

# Events
SELECT Id, Subject, StartDateTime, EndDateTime FROM Event WHERE WhatId = '001xxxx'

# EmailMessages (separates Objekt — häufig übersehen!)
SELECT Id, Subject, FromAddress, ToAddress, MessageDate, TextBody
FROM EmailMessage WHERE RelatedToId = '001xxxx'

# Notes
SELECT Id, Title, Body FROM Note WHERE ParentId = '001xxxx'
```

**Rate Limits:**
- Tägliches API-Call-Budget: 100.000 Base + 1.000 pro Enterprise-Seat + 5.000 pro Unlimited-Seat
- Concurrent Long-Running Requests (>20s): 25 (Production), 5 (Dev Edition)
- Bulk API v2 Concurrent Jobs: 100 offen pro Org
- Dev Edition: 15.000 Calls/24h, 5 Concurrent Requests

**Kritische Fallstricke:**
- `Sforce-Locator: "null"` ist ein Literal-String, nicht null — als String parsen!
- Bulk API v2 unterstützt KEINE Relationship-Subqueries — JOINs als flache Queries
- `ActivityHistories` ist read-only und virtual — kein standalone SOQL möglich
- `EmailMessage` ist vom Aktivitäts-Pool getrennt — explizit abfragen
- Governor Limits kaskadieren: ein REST-Upsert kann 100 SOQL-Limits in einer Transaktion verbrauchen

**CLI:**
```bash
dxcrm import --from salesforce --mode api \
  --token $SFDC_TOKEN \
  --url https://myco.salesforce.com \
  --bulk           # Bulk API v2 für >10k Records
  --include-emails # EmailMessage-Objekte inkl.
```

---

#### 7.2 HubSpot — Vollständige API-Referenz

**Bulk Discovery (Search API — bis 10.000 Records):**
```
POST /crm/v3/objects/companies/search
{
  "limit": 200,
  "after": "{cursor}",
  "properties": ["name","domain","industry","createdate","hs_lead_status"],
  "sorts": [{"propertyName": "createdate", "direction": "ASCENDING"}]
}
→ paging.next.after als nächsten cursor
→ Kein after in Response = letzte Seite
→ HARTES Limit: 10.000 Records pro Search-Query — bei mehr Records nach createdate-Range segmentieren
```

**Bulk Discovery (Scroll API — ohne 10k-Limit):**
```
GET /crm/v3/objects/contacts?limit=100&after={cursor}
GET /crm/v3/objects/companies?limit=100&after={cursor}
→ paging.next.after folgen bis absent
→ Kein Filter möglich, aber kein 10k-Cap
```

**Async Export (Vollexport):**
```
POST /crm/v3/exports/export/async
{
  "exportType": "VIEW",
  "format": "CSV",
  "exportName": "All Contacts",
  "objectProperties": ["email","firstname","lastname","company"],
  "objectType": "CONTACT"
}
→ Poll: GET /crm/v3/exports/export/async/{exportId}
→ status: "COMPLETE" → result.fileUrl herunterladen
```

**Per-Record Historie (v4 Associations — bevorzugt):**
```
GET /crm/v4/objects/contacts/{id}/associations/emails
GET /crm/v4/objects/contacts/{id}/associations/calls
GET /crm/v4/objects/contacts/{id}/associations/meetings
GET /crm/v4/objects/contacts/{id}/associations/notes
GET /crm/v4/objects/contacts/{id}/associations/tasks
GET /crm/v4/objects/contacts/{id}/associations/deals

→ IDs holen, dann Batch-Read:
POST /crm/v3/objects/emails/batch/read
{"inputs": [{"id": "email_id"}], "properties": ["hs_email_subject","hs_email_text"]}
```

**Rate Limits:**
- Search API: 4 Requests/Sekunde (account-wide, nicht pro Endpoint!)
- General: 150 req/10s (Professional), 190 req/10s (Enterprise)
- Daily: 500.000 (Professional), 1.000.000 (Enterprise)
- Batch-Endpoints: 1 API-Call unabhängig von Batch-Größe

**Kritische Fallstricke:**
- Search-API 10k-Limit ist hart — kein Signal, bis Cursor einfach verschwindet
- Search-Rate-Limit (4 req/s) ist account-wide — Contacts + Companies-Suche teilen dasselbe Budget
- v3 Associations werden deprecated — direkt v4 verwenden
- Export API unterstützt kein arbiträres Filtern — nur VIEW-Exports oder Full-Object-Dumps

---

#### 7.3 Microsoft Dynamics 365 / Dataverse

**Bulk Discovery (OData):**
```
GET https://{org}.api.crm.dynamics.com/api/data/v9.2/accounts
  ?$select=name,accountid,emailaddress1,telephone1,industrycode,revenue
  &$filter=statecode eq 0
  &$orderby=createdon desc
  &$top=5000
  Prefer: odata.maxpagesize=5000
→ @odata.nextLink folgen (opaker Token — nie manuell rekonstruieren)
→ Kein @odata.nextLink in Response = letzte Seite
```

**FetchXML für komplexe Abfragen:**
```xml
GET /api/data/v9.2/accounts?fetchXml=
<fetch count="1000" page="1" paging-cookie="{encoded-cookie}">
  <entity name="account">
    <attribute name="name"/>
    <attribute name="emailaddress1"/>
    <link-entity name="opportunity" from="parentaccountid" to="accountid">
      <attribute name="name"/>
      <attribute name="estimatedvalue"/>
    </link-entity>
  </entity>
</fetch>
```

**Per-Record Historie:**
```
GET /api/data/v9.2/accounts({accountId})/Account_ActivityPointers
GET /api/data/v9.2/accounts({accountId})/Account_Emails
GET /api/data/v9.2/accounts({accountId})/Account_Tasks
GET /api/data/v9.2/accounts({accountId})/Account_Appointments
GET /api/data/v9.2/accounts({accountId})/Account_PhoneCalls

# Oder generisch via ActivityPointer
GET /api/data/v9.2/activitypointers
  ?$filter=_regardingobjectid_value eq {accountId}
  &$select=subject,createdon,activitytypecode
```

**Rate Limits (5-Minuten-Sliding-Window):**
- Max 6.000 API-Requests pro 5-Min-Fenster (pro User/App-Identität)
- Max 20 Minuten kombinierte Execution-Time pro 5-Min-Fenster
- Max 52 Concurrent Requests
- HTTP 429 mit Retry-After bei Überschreitung

**Kritische Fallstricke:**
- `Prefer: odata.maxpagesize=5000` auf JEDER Request in der Pagination-Kette senden (nicht nur erste)
- FetchXML `paging-cookie` muss XML-escaped sein — viele Libraries scheitern hier
- 5-Min-Sliding-Window resettet unterschiedlich — kann mid-Export treffen
- `@odata.nextLink` enthält `$skiptoken` — opak, nie dekodieren

---

#### 7.4 Zoho CRM

**Bulk Discovery — Empfohlen: Bulk Read API v8 (async, bis 200.000 Records pro Job):**
```
POST /crm/v8/bulk-read
{
  "query": {
    "module": {"api_name": "Accounts"},
    "fields": ["Account_Name","Email","Phone","Industry"],
    "page": 1
  }
}
→ Poll: GET /crm/v8/bulk-read/{job_id}
→ state: "COMPLETED" → result.download_url (ZIP → CSV)
→ Bis 200k Records pro Job; page++ für weitere Batches
```

**Standard GET (synchron, bis 2.000 Records):**
```
GET /crm/v6/Accounts?page=1&per_page=200
→ info.more_records: true/false
→ info.page inkrementieren
→ Absolutes Maximum: 2.000 Records via Standard-GET
```

**COQL (SQL-ähnlich):**
```
POST /crm/v6/coql
{"select_query": "SELECT Account_Name, Email FROM Accounts LIMIT 200 OFFSET 0"}
→ Max 2.000 Records, max 25 WHERE-Criteria
→ COQL-Cap: 10.000 Records pro Query-Set
```

**Per-Record Historie:**
```
GET /crm/v6/Accounts/{id}/Notes
GET /crm/v6/Accounts/{id}/Activities
GET /crm/v6/Accounts/{id}/Deals
GET /crm/v6/Accounts/{id}/Emails
```

**Rate Limits:**
- Standard: 150–200 req/min (je nach Edition)
- Daily: 25.000 (Professional), 500.000 (Enterprise)
- Bulk: Max 10 concurrent Jobs; 1 Job pro Modul gleichzeitig

**Kritische Fallstricke:**
- Bulk Read v8 (nicht v6) für 200k-Records-Limit
- Job-Result-URLs verfallen — sofort nach Completion herunterladen
- Zoho OAuth-Tokens laufen nach 1h ab — proaktiv refreshen in Bulk-Pipelines
- Field API-Namen ≠ Display-Namen: `GET /crm/v6/settings/fields?module=Accounts` für Mapping

---

#### 7.5 Pipedrive

**Bulk Discovery (Cursor-basiert — bevorzugt für Konsistenz):**
```
GET /v1/organizations/collection?limit=500&cursor={cursor}
GET /v1/persons/collection?limit=500&cursor={cursor}
→ additional_data.next_cursor null = letzte Seite
→ Max 500 pro Request
```

**Legacy Offset (funktioniert noch):**
```
GET /v1/organizations?limit=500&start=0
→ additional_data.pagination.more_items_in_collection: true/false
→ Nächster start: + limit
→ WARNUNG: more_items_in_collection kann true sein, obwohl nächste Seite leer ist
```

**Per-Record Historie (Organisation):**
```
GET /v1/organizations/{id}/activities?limit=500&start=0
GET /v1/organizations/{id}/deals?limit=500&start=0
GET /v1/organizations/{id}/notes?limit=500&start=0
GET /v1/organizations/{id}/files?limit=500&start=0

# Vollständiger Changelog (empfohlen — alle Event-Types)
GET /v1/organizations/{id}/updates
→ Types: activity, note, file, change, deal, follower, mailMessage,
         mailMessageWithAttachment, invoice, activityFile, document
```

**Rate Limits:**
- Daily Token Budget: 30.000 Basis-Tokens × plan_multiplier × seat_count
- Burst: rolling 2-Sekunden-Fenster — zu viele parallele Requests → HTTP 429 → 403

**Kritische Fallstricke:**
- Cursor-Endpoints (collection) für aktive Imports — Legacy-Offset kann Records überspringen
- Activities per Org ≠ Activities über Org (verwende `updates` für vollständige Historie)
- 2-Sekunden-Burst-Fenster ist strikt — keine parallelen Bulk-Requests

---

#### 7.6 Monday.com

**Bulk Discovery (GraphQL — einzige Option):**
```graphql
query {
  boards(ids: [123456789]) {
    items_page(limit: 500, cursor: null) {
      cursor
      items {
        id
        name
        column_values { id value text }
      }
    }
  }
}

# Folgeseite (cursor aus vorheriger Response):
query {
  next_items_page(limit: 500, cursor: "CURSOR") {
    cursor
    items { id name column_values { id value text } }
  }
}
# cursor: null = letzte Seite
# Cursors expire nach 60 Minuten — Pipeline darf nicht pausieren!
```

**Per-Record Historie:**
```graphql
query {
  items(ids: [item_id]) {
    activity_logs(limit: 100) {
      id event data created_at
    }
  }
}
```

**Rate Limits:**
- ~5.000 Complexity Points/Minute (nicht Raw-Requests)
- `items_page` innerhalb `boards` = sehr hohe Complexity (~2.000+ für 500 Items)
- `next_items_page` direkt (außerhalb boards) = deutlich geringere Complexity

**Kritische Fallstricke:**
- Complexity berechnet sich auf maximale mögliche Objekte (nicht actual returns)
- Cursor-Ablauf nach 60 Min ist hard — pausierte Pipelines schlagen fehl
- `column_values[n].value` ist JSON-encoded als String — doppelt parsen
- API-Version-Header erforderlich: `X-API-Version: 2024-01`

---

#### 7.7 Freshsales (Freshworks CRM)

**Bulk Discovery (View-basiert — einzige Methode):**
```
# 1. View-IDs ermitteln
GET https://{subdomain}.myfreshworks.com/crm/sales/api/contacts/filters

# 2. Records aus View abrufen
GET /crm/sales/api/contacts/view/{view_id}?page=1&per_page=100&sort=id&sort_type=asc
GET /crm/sales/api/sales_accounts/view/{view_id}?page=1&per_page=100
→ Inkrementiere page bis data-Array leer
→ Max per_page: 100 (stille Kappung — kein Error)
```

**Filter-basiert (ohne gespeicherte View):**
```
POST /crm/sales/api/contacts/filter?page=1&per_page=100
{"filter_rule": [{"attribute":"country","operator":"is_in","value":["Germany"]}]}
```

**Per-Record Historie:**
```
GET /crm/sales/api/contacts/{id}/activities?limit=100&page=1
GET /crm/sales/api/contacts/{id}/appointments
GET /crm/sales/api/sales_activities?contact_id={id}
```

**Rate Limits:** 1.000 req/h (Standard), plan-abhängig skalierbar

**Kritische Fallstricke:**
- View-ID ist instanz-spezifisch — immer zuerst `/filters` aufrufen
- Alte Domain `{domain}.freshsales.io` → neue `{domain}.myfreshworks.com/crm/sales/api/`
- Custom Activity Types via `sales_activities` (nicht `activities`) abrufen

---

#### 7.8 Zendesk Sell

**Bulk Discovery (Cursor-basiert):**
```
GET https://api.getbase.com/v2/contacts?page[size]=100&page[after]={cursor}
GET /v2/organizations?page[size]=100&page[after]={cursor}
→ meta.links.next_page = nächste Cursor-URL (opaque)
→ Kein next_page = letzte Seite
→ BASE-URL: api.getbase.com (nicht zendesk.com!)
```

**Sync API (inkrementell, Growth-Plan+):**
```
POST /v2/sync                     → Session starten
GET  /v2/sync?until={ack_key}     → nächsten Batch holen
DELETE /v2/sync?until={ack_key}   → Batch bestätigen (PFLICHT vor nächstem GET)
→ items[].data = Resource, items[].meta.event_type = created|updated|deleted
```

**Per-Record Historie:**
```
GET /v2/activities?contact_id={id}&page[size]=100
GET /v2/activities?lead_id={id}
GET /v2/activities?deal_id={id}
```

**Rate Limits:** 36.000 req/h (10 req/Token/Sekunde)

**Kritische Fallstricke:**
- Base-URL ist `api.getbase.com` (Zendesk kaufte Base CRM, Legacy-Domain blieb)
- Sync-API: DELETE nicht aufrufen = selber Batch wird wiederholt
- `X-PW-TOTAL` ist Schätzwert, nicht exakt

---

#### 7.9 SugarCRM

**Bulk Discovery (Offset-basiert):**
```
GET https://{instance}/rest/v11_1/Accounts
  ?max_num=1000&offset=0
  &fields=id,name,billing_address_street,email1
  &order_by=date_modified:DESC
→ next_offset in Response (Integer)
→ next_offset == -1 = letzte Seite (Literal-Integer -1!)
→ Max max_num: 1.000 (stille Kappung)
```

**Bulk-Endpunkt (mehrere Module in einem HTTP-Call):**
```
POST /rest/v11_1/bulk
{
  "requests": [
    {"method": "GET", "url": "/rest/v11_1/Accounts?max_num=100&offset=0"},
    {"method": "GET", "url": "/rest/v11_1/Contacts?max_num=100&offset=0"},
    {"method": "GET", "url": "/rest/v11_1/Leads?max_num=100&offset=0"}
  ]
}
→ Array von Response-Objekten pro Sub-Request
```

**Per-Record Historie (Relationship-Endpunkte):**
```
GET /rest/v11_1/Accounts/{id}/link/calls?max_num=100&offset=0
GET /rest/v11_1/Accounts/{id}/link/meetings?max_num=100&offset=0
GET /rest/v11_1/Accounts/{id}/link/notes?max_num=100&offset=0
GET /rest/v11_1/Accounts/{id}/link/emails?max_num=100&offset=0
GET /rest/v11_1/Accounts/{id}/link/tasks?max_num=100&offset=0
GET /rest/v11_1/Accounts/{id}/link/opportunities?max_num=100&offset=0
```

**Rate Limits:** Keine veröffentlichten Limits (SugarCloud: undokumentierte Soft-Limits)

**Kritische Fallstricke:**
- Relationship-Name (link/{name}) muss interner Link-Name sein — via `GET /rest/v11_1/metadata?type_filter=module_defs` verifizieren
- API-Version-Nummern springen (v11_1, v11_5, v11_18...) — deployete Version prüfen via `GET /rest/v11_1/`

---

#### 7.10 Copper CRM

**Bulk Discovery (Search-basiert — ALLE Endpunkte sind POST):**
```
POST https://api.copper.com/developer_api/v1/people/search
Headers: X-PW-AccessToken: {token}
         X-PW-Application: developer_api
         X-PW-UserEmail: {email}        ← alle drei Header PFLICHT
Body: {"page_size": 200, "page_number": 1, "sort_by": "name"}

POST /v1/companies/search
{"page_size": 200, "page_number": 1}
→ Inkrementiere page_number bis data[].length < page_size
→ HARD-LIMIT: 100.000 Records total — bei mehr nach date_modified segmentieren
```

**Per-Record Historie:**
```
POST /v1/activities/search
{
  "parent": {"type": "company", "id": 12345},
  "page_size": 200,
  "page_number": 1
}
# type: "person", "company", "opportunity"
```

**Rate Limits:** ~600 req/min (community-reported, nicht offiziell)

**Kritische Fallstricke:**
- Alle Fetches sind POST /search — es gibt keine GET-List-Endpoints
- Alle drei Header gleichzeitig erforderlich — ein fehlender → 401
- `X-PW-TOTAL` ist Schätzwert — nie als Abbruchbedingung nutzen
- Copper ist mit Google Workspace gekoppelt — Kontakte werden von Gmail automatisch angereichert

---

### 7.11 Unified Import Architecture

```typescript
// src/sync/import-engine.ts

interface CrmConnector {
  name: string;
  discover(opts: ConnectorOpts): AsyncGenerator<RawAccount>;
  fetchHistory(id: string, opts: ConnectorOpts): AsyncGenerator<RawActivity>;
  mapToCustomer(raw: RawAccount): CustomerInput;
  mapToInteraction(raw: RawActivity): InteractionInput;
}

interface ImportResult {
  customersCreated: number;
  customersUpdated: number;
  interactionsImported: number;
  errors: ImportError[];
  skipped: number;       // via sourceRef-Idempotenz
  duration: number;
}
```

**Idempotenz-Garantie (alle Konnektoren):**
- sourceRef-Format: `{crm}://account/{id}` und `{crm}://activity/{id}`
- Vor jedem Import: sourceRef-Set aus `interactions.md` laden → O(1) Lookup
- Re-Import überschreibt nicht — nur neue Records werden angelegt

**CLI nach Implementierung:**
```bash
dxcrm import --from salesforce --mode api --token $SF_TOKEN --url $SF_URL --bulk
dxcrm import --from hubspot --mode api --token $HUB_TOKEN
dxcrm import --from dynamics --mode api --token $DYN_TOKEN --url $DYN_URL
dxcrm import --from zoho --mode api --token $ZOHO_TOKEN --bulk-v8
dxcrm import --from pipedrive --mode api --token $PD_TOKEN --url $PD_URL
dxcrm import --from monday --mode api --token $MON_TOKEN --board-id $BOARD_ID
dxcrm import --from freshsales --mode api --token $FS_TOKEN --subdomain $FS_SUB
dxcrm import --from zendesk-sell --mode api --token $ZD_TOKEN
dxcrm import --from sugarcrm --mode api --token $SC_TOKEN --url $SC_URL
dxcrm import --from copper --mode api --token $CU_TOKEN --email $CU_EMAIL

# Alle CRMs — Discovery-Mode (nur Kunden, keine Historie)
dxcrm import --from {crm} --mode api --discovery-only

# Dry-Run (zeigt was importiert werden würde)
dxcrm import --from salesforce --mode api --dry-run --limit 100
```

---

## DOMINO 8 — Enterprise-Sicherheitsschicht

### 8.1 RBAC-Enforcement (Kritische Lücke beheben)

**Aktuell:** RBAC-System existiert in `src/core/rbac.ts`, aber kein MCP-Tool-Handler ruft `assertCanWrite()` auf.

**Fix — MCP-Middleware-Pattern:**
```typescript
// src/mcp/middleware/rbac-middleware.ts
export function withRbac(requiredRole: RbacRole, handler: ToolHandler): ToolHandler {
  return async (input, dataDir) => {
    const actor = process.env.DXCRM_ACTOR ?? "anonymous";
    assertCanWrite(dataDir, actor, requiredRole);   // wirft bei Fehler
    return handler(input, dataDir);
  };
}

// Anwendung in log-interaction.ts, update-deal.ts, update-customer-facts.ts:
server.registerTool("log_interaction", schema, withRbac("rep", handleLogInteraction));
server.registerTool("update_customer_facts", schema, withRbac("admin", handleUpdateCustomerFacts));
```

### 8.2 GDPR-Vollständigkeit (Kritische Lücke)

**Aktuell:** `gdpr.ts` löscht `customers/<slug>/` via `fs.rmSync`, aber öffnet LanceDB nicht.

**Fix:**
```typescript
// src/commands/gdpr.ts — ergänzen
import { getLanceDb } from "../core/lancedb.js";

async function eraseVectors(slug: string, dataDir: string) {
  const db = await getLanceDb(dataDir);
  const tableName = `docs_${slug}`;
  const tableNames = await db.tableNames();
  if (tableNames.includes(tableName)) {
    await db.dropTable(tableName);
  }
}
```

### 8.3 SSO / SAML 2.0

**Library:** `passport-saml` (`node-saml/passport-saml`)

```typescript
// src/auth/saml.ts

// Multi-IdP-Architektur (ein SAML-Config pro Tenant)
interface SamlTenantConfig {
  tenantId: string;
  entryPoint: string;         // IdP SSO URL
  cert: string;               // IdP X.509 Cert (für Signatur-Validierung)
  issuer: string;             // SP Entity ID
  wantAuthnResponseSigned: boolean;
  wantAssertionsSigned: boolean;
}

// Dynamische Strategie-Instantiierung (nicht statisch registrieren)
app.get('/auth/saml/:tenantId/login', (req, res) => {
  const config = loadSamlConfig(req.params.tenantId);
  const strategy = new SamlStrategy(config, verifyCallback);
  strategy.authenticate(req, res);    // redirect to IdP
});

app.post('/auth/saml/:tenantId/callback', (req, res) => {
  // SAMLResponse empfangen, validieren, Session anlegen
});
```

**Sicherheits-Anforderungen (nicht verhandelbar):**
- `Audience`-Restriction auf SP Entity ID validieren
- `InResponseTo`-Matching (verhindert Replay-Angriffe)
- `wantAuthnResponseSigned: true` + `wantAssertionsSigned: true`
- `acceptedClockSkewMs: 5000` für Clock-Drift-Toleranz
- Assertion-Encryption wo möglich

**Alternative für schnellere Implementierung:** WorkOS oder Auth0 Organizations — handelt Multi-Tenant-SAML ohne eigene Implementierung

**CLI:**
```bash
dxcrm server start --saml-config /path/to/saml-configs.json
dxcrm rbac saml-map --tenant myco --role-claim "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"
```

### 8.4 Field-Level Encryption

**Für Felder, die verschlüsselt gespeichert werden müssen:**
- E-Mail-Bodies (DSGVO-Pflicht in manchen Interpretationen)
- Telefonnummern
- OAuth-Tokens / API-Schlüssel

```typescript
// src/core/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";  // authentifizierte Verschlüsselung

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);                                  // 96-bit IV für GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
  });
}

export function decrypt(encrypted: string, key: Buffer): string {
  const { iv, ciphertext, authTag } = JSON.parse(encrypted);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

**KMS-Integration:** AWS KMS / GCP Cloud KMS / Azure Key Vault für Key Encryption Keys

### 8.5 Webhook-Receiver-Framework

```typescript
// src/webhooks/receiver.ts

// Pattern: sofort 200 antworten, dann asynchron verarbeiten
app.post('/webhooks/:provider',
  rawBodyMiddleware,            // roher Body für HMAC-Verifizierung
  verifySignature,              // HMAC-SHA256 pro Provider
  rejectStaleTimestamps,        // >5 Min alte Requests ablehnen
  async (req, res) => {
    res.sendStatus(200);        // SOFORT antworten (vor Verarbeitung)
    await queue.add('webhook-event', {
      provider: req.params.provider,
      body: req.body,
      receivedAt: new Date().toISOString(),
    }, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  }
);

// Idempotenz: dedup per (provider, event_id) — Redis TTL 48h
```

**Signature-Verifizierung pro Provider:**
| Provider | Header | Algorithmus |
|---|---|---|
| HubSpot | `X-HubSpot-Signature-v3` | HMAC-SHA256(secret + timestamp + body) |
| Salesforce | OAuth 1.0a-Style | Platform-Event-Verification |
| Pipedrive | `X-Pipedrive-Signature` | HMAC-SHA256(webhook_secret, body) |

**Unterstützte Webhook-Events nach Implementierung:**
```bash
dxcrm webhooks register --provider hubspot --events contact.creation,contact.propertyChange
dxcrm webhooks list
dxcrm webhooks test --provider hubspot
```

### 8.6 Custom Pipeline Stages pro Team

```typescript
// src/core/pipeline-definitions.ts

interface PipelineStage {
  id: string;       // stable UUID — nie nach Position
  name: string;
  probability: number;
  position: number;
  color: string;    // hex
}

interface PipelineDefinition {
  id: string;
  name: string;
  stages: PipelineStage[];
  teamId?: string;  // undefined = org-weiter Default
}

// Gespeichert in .agentic/pipelines.json
// Deals referenzieren stage.id — Reihenfolgenänderung bricht keine Historic-Daten
```

**CLI:**
```bash
dxcrm pipeline create "Enterprise Sales" --stages "Prospecting,Discovery,Proposal,Negotiation,Won,Lost"
dxcrm pipeline list
dxcrm pipeline set-default "Enterprise Sales"
```

---

## DOMINO 9 — Die Intelligence-Schicht

### 9.1 AI-Powered Meeting-Summaries

**Pipeline-Architektur:**
```
Meeting endet
    ↓
Webhook / API-Poll (Meet API oder Teams Graph API)
    ↓
Transkript herunterladen (wenn vorhanden) ODER Audio-Aufzeichnung
    ↓
Wenn Audio: Whisper v3 (local: faster-whisper für DSGVO-Compliance)
  - lokal: faster-whisper (CTranslate2, 4× schneller als original, CPU-tauglich)
  - oder: POST /v1/audio/transcriptions (OpenAI API, 25MB-Limit, €0.006/Min)
  - Chunking für >25MB: ffmpeg -i input.mp4 -f segment -segment_time 600 chunk_%03d.mp4
    ↓
Speaker-Diarisierung (optional): pyannote.audio (wer hat was gesagt?)
    ↓
LLM-Zusammenfassung (Claude claude-sonnet-4-6):
  System: "Du bist CRM-Assistent. Extrahiere: summary, action_items[],
           key_decisions[], follow_up[{assignee, task, due_date}]"
    ↓
Strukturierte Summary in interactions.md
    ↓
Auto-Verknüpfung mit CRM-Kunden via Teilnehmer-Email-Lookup
```

**MCP-Tool:**
```
summarize_meeting({ slug, transcriptPath })
→ { summary, actionItems, keyDecisions, followUp }
```

**CLI:**
```bash
dxcrm summarize <slug> --transcript /path/to/meeting.vtt
dxcrm summarize <slug> --audio /path/to/recording.mp4   # Whisper
dxcrm summarize <slug> --meet-id xyz-abc-def            # Google Meet API
dxcrm summarize <slug> --teams-meeting-id {id}          # Teams Graph API
```

**Kritische Einschränkungen:**
- Google Meet Transcripts nur für Workspace Business Standard/Plus/Enterprise
- Teams Transcripts: Tenant-Policy `AllowTranscription: $true` erforderlich
- Whisper local: keine Speaker-Identifikation (Diarisierung ist separates Modell)

### 9.2 Deal-Health-Scoring

```typescript
// src/core/deal-health.ts

interface DealHealthSignals {
  lastActivityAgeDays: number;     // Frische der Interaktionen
  emailResponseRate: number;       // Antwort-Rate des Prospects (0–1)
  stageVelocityVsAvg: number;      // relative Geschwindigkeit vs. Average (-1 bis +1)
  daysToCloseDate: number;         // Urgenz
  stakeholdersEngaged: number;     // Anzahl unterschiedliche Kontakte
}

// Score 0–100 (30: At Risk 🔴, 30–70: Normal 🟡, 70+: Healthy 🟢)
export function computeDealHealth(signals: DealHealthSignals): number {
  const score =
    signals.lastActivityAgeDays * -0.3 +
    signals.emailResponseRate * 25 +
    signals.stageVelocityVsAvg * 20 +
    (signals.daysToCloseDate > 0 ? 15 : -10) +
    Math.min(signals.stakeholdersEngaged * 5, 15);
  return Math.max(0, Math.min(100, 50 + score));
}
```

**MCP-Tool:**
```
get_deal_health({ slug })
→ { score, signals, trend, recommendation }
```

### 9.3 Pipeline-Forecasting + Funnel-Analyse

**Kern-Queries (SQLite/DuckDB über pipeline.md-Snapshots):**

```sql
-- Gewichtete Pipeline für 30/60/90 Tage
SELECT
  deal_name,
  stage,
  value * probability / 100.0 AS weighted_value,
  close_date
FROM pipeline_snapshots
WHERE close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
ORDER BY close_date;

-- Win-Rate pro Stage
SELECT
  from_stage,
  to_stage,
  COUNT(*) AS transitions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE to_stage = 'Won') / COUNT(*), 1) AS win_rate_pct
FROM deal_stage_transitions
WHERE transitioned_at > NOW() - INTERVAL '90 days'
GROUP BY from_stage, to_stage;

-- Stage-Velocity (Durchschnittliche Tage pro Stage)
SELECT to_stage, AVG(days_in_stage) AS avg_days
FROM stage_velocity_view
GROUP BY to_stage ORDER BY avg_days;
```

**MCP-Tool:**
```
get_pipeline_forecast({ timeframeDays: 90 })
→ { weightedTotal, dealsCount, byStage, byWeek, winRateByStage }
```

### 9.4 E-Mail-Threading + Deduplication

**RFC-basierter Threading-Algorithmus (JWZ):**

```typescript
// src/core/email-threader.ts

interface EmailThread {
  threadId: string;             // root Message-ID oder provider threadId
  messages: EmailMessage[];     // geordnet nach Date
  participants: Set<string>;
  subjectNormalized: string;    // Re:/Fwd: entfernt, lowercase, trimmed
}

// Normalisierung: "Re: Re: FWD: Angebot Q3" → "angebot q3"
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd?|aw|wg):\s*/gi, "")
    .trim()
    .toLowerCase();
}

// Threading via In-Reply-To / References Header
// References-Liste: älteste Ancestor-IDs zuerst — letzter = direkter Parent
// Fallback: gleicher normalizedSubject + überlappende Teilnehmer
```

**Deduplication-Logik:**
1. Primary Key: `Message-ID` Header (global eindeutig per RFC 2822)
2. Fallback-Hash: `SHA-256(From + Date + Subject + body.slice(0, 100))`
3. Cross-Provider: Gmail `threadId` und Outlook `conversationId` → interner `threadId`

### 9.5 Cross-Customer Intelligence (Enterprise-Only)

**Architektur für privacy-konforme Muster-Erkennung:**
```
Alle Tenants → Bronze (raw events, pseudonymisiert)
             → Silver (normalisiert, k-Anonymität ≥ 5)
             → Gold (aggregierte Muster, kein PII)
```

**Use-Cases:**
- Branchen-Benchmarks: "Ø Deal-Cycle für SaaS-Unternehmen mit 10–50 Mitarbeitern: 45 Tage"
- Best-Practice-Erkennung: welche E-Mail-Templates haben höchste Reply-Rate
- Churn-Prediction: Training auf anonymisierten Stage-Transition-Mustern

**Datenschutz-Garantien:**
- PII wird bei Bronze→Silver-Transition pseudonymisiert
- Aggregation auf k ≥ 5 (min. 5 Kunden pro Bucket)
- Tenant-übergreifende Abfragen geben niemals Firmennamen oder Kontaktnamen zurück

---

## DOMINO 10 — Die Plattform

### 10.1 Plugin-System

```typescript
// src/plugins/plugin-api.ts

interface DxcrmPlugin {
  name: string;
  version: string;
  mcpTools?: McpToolDefinition[];
  cliCommands?: CommandDefinition[];
  syncProviders?: SyncProvider[];
  importConnectors?: CrmConnector[];
  hooks?: {
    afterLogInteraction?: (slug: string, entry: Interaction) => Promise<void>;
    afterCreateCustomer?: (customer: Customer) => Promise<void>;
    beforeExport?: (slug: string) => Promise<void>;
  };
}

// Plugin-Registry
// dxcrm plugin install @mycompany/dxcrm-slack-plugin
// dxcrm plugin list
// dxcrm plugin remove @mycompany/dxcrm-slack-plugin
```

**Plugin-Beispiele:**
- `@dxcrm/plugin-slack` — Kunden-Notifications via Slack
- `@dxcrm/plugin-stripe` — Deal-Value synchron mit Stripe-Subscriptions
- `@dxcrm/plugin-notion` — Notion-Seiten als Customer-Kontext
- `@dxcrm/plugin-linear` — Linear-Issues als Follow-Up-Tasks

### 10.2 Multi-Tenant SaaS (Optional Enterprise-Offering)

```
dxcrm-cloud.com
  ├── Tenant: myco.dxcrm-cloud.com
  │   ├── MCP: https://myco.dxcrm-cloud.com/mcp
  │   ├── Data: isolated PostgreSQL schema + S3 bucket
  │   └── Auth: SSO via SAML / Google Workspace / Entra ID
  ├── Tenant: acme.dxcrm-cloud.com
  └── ...
```

**Tenant-Isolation:** PostgreSQL Row-Level Security (RLS)
```sql
-- Jede Tabelle hat tenant_id
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
-- SET LOCAL app.current_tenant = '{tenantId}' in jeder DB-Session
```

**Pricing-Modell (Vorschlag):**
| Tier | Preis | Limits |
|---|---|---|
| Self-Hosted | Kostenlos | Unbegrenzt, eigene Infrastruktur |
| Cloud Starter | €29/Monat | 5 User, 500 Kunden |
| Cloud Team | €99/Monat | 25 User, 5.000 Kunden |
| Cloud Enterprise | €499/Monat | Unbegrenzt, SSO, SAML, SLA |

---

## API-Referenz: Pagination Quick Reference

| CRM | Bulk-Endpoint | Pagination-Typ | Max/Seite | Termination |
|---|---|---|---|---|
| Salesforce REST | `GET /services/data/v61.0/query` | `nextRecordsUrl` | 2.000 | `done: true` |
| Salesforce Bulk v2 | `GET /jobs/query/{id}/results` | `Sforce-Locator` Header | konfig. | Header = `"null"` |
| HubSpot | `POST /crm/v3/objects/companies/search` | `paging.next.after` | 200 | kein `after` |
| HubSpot | `GET /crm/v3/objects/contacts` | `paging.next.after` | 100 | kein `after` |
| Dynamics 365 | `GET /api/data/v9.2/accounts` | `@odata.nextLink` | 5.000 | kein `nextLink` |
| Zoho Bulk v8 | `POST /crm/v8/bulk-read` | Job-`page` | 200.000 | `more_records: false` |
| Zoho Standard | `GET /crm/v6/Accounts` | `page` Integer | 200 | `more_records: false` |
| Pipedrive | `GET /v1/organizations/collection` | `next_cursor` | 500 | cursor absent |
| Monday.com | GraphQL `next_items_page` | `cursor` | 500 | `cursor: null` |
| Freshsales | `GET /api/contacts/view/{id}?page=N` | `page` Integer | 100 | leeres Array |
| Zendesk Sell | `GET /v2/contacts?page[after]={c}` | Cursor in `meta.links` | 100 | kein `next_page` |
| SugarCRM | `GET /rest/v11_1/Accounts?offset=N` | `offset` Integer | 1.000 | `next_offset: -1` |
| Copper | `POST /v1/people/search` | `page_number` Integer | 200 | leeres Array |

---

## API-Referenz: Google + Microsoft OAuth-Scopes

| API | Scope | Access |
|---|---|---|
| Gmail (read) | `gmail.readonly` | Alle E-Mails lesen |
| Gmail (metadata) | `gmail.metadata` | Nur Header |
| Google Calendar | `calendar.readonly` | Alle Kalender-Events |
| Google Meet | `meetings.space.readonly` | Post-Meeting-Artefakte (restricted!) |
| Google Drive | `drive.metadata.readonly` | Datei-Metadaten |
| Graph Mail | `Mail.Read` | Outlook-E-Mails (delegated) |
| Graph Calendar | `Calendars.ReadBasic` | Zeit/Betreff/Ort |
| Teams Transcripts | `OnlineMeetingTranscript.Read.All` | Alle Transkripte (Admin-Consent!) |
| Teams Recordings | `OnlineMeetingRecording.Read.All` | Alle Aufzeichnungen (Admin-Consent!) |

---

## Sprint-Plan Enterprise

### Sprint E1 — Kritische Lücken + Microsoft-360 (3 Wochen)
- [ ] RBAC-Enforcement in alle MCP-Tool-Handler verdrahten
- [ ] GDPR: LanceDB-Vektoren bei Erasure löschen
- [ ] On-Query-Sync-Trigger in `get_customer_context()`
- [ ] Microsoft Calendar-Sync (Graph API calendarView + delta)
- [ ] Microsoft Teams Transkript-Sync (Graph API transcripts)
- [ ] Google Meet Transkript-Sync (Meet REST API v2)
- [ ] Gmail Push-Watch (Cloud Pub/Sub → Webhook)

### Sprint E2 — HubSpot + Salesforce Vollimport (3 Wochen)
- [ ] Salesforce Bulk API v2 Connector (async CSV-Export)
- [ ] Salesforce ActivityHistory + EmailMessage Import
- [ ] HubSpot v4 Associations-basierter vollständiger Historia-Import
- [ ] HubSpot Async Export API Integration
- [ ] Rate-Limit-Manager mit exponential Backoff (alle Konnektoren)

### Sprint E3 — Restliche 8 CRM-Konnektoren (4 Wochen)
- [ ] Microsoft Dynamics 365 / Dataverse Connector
- [ ] Zoho CRM Connector (Bulk Read v8)
- [ ] Monday.com GraphQL Connector
- [ ] Freshsales Connector
- [ ] Zendesk Sell Connector (inkl. Sync API)
- [ ] SugarCRM Connector
- [ ] Copper CRM Connector
- [ ] Unified Import Engine (CrmConnector Interface)

### Sprint E4 — Enterprise-Security (3 Wochen)
- [ ] SSO/SAML 2.0 (passport-saml, Multi-IdP)
- [ ] Field-Level-Encryption (AES-256-GCM für sensitive Felder)
- [ ] Webhook-Receiver-Framework (HMAC-Verifikation, BullMQ-Queue)
- [ ] PostgreSQL RLS für Multi-Tenant (falls Cloud-Offering)
- [ ] Custom Pipeline Stages per Team

### Sprint E5 — Intelligence-Schicht (4 Wochen)
- [ ] AI-Meeting-Summaries (Whisper local + LLM-Zusammenfassung)
- [ ] Deal-Health-Scoring (composite signal model)
- [ ] Pipeline-Forecasting MCP-Tool
- [ ] E-Mail-Threading + Deduplication
- [ ] `summarize_meeting` MCP-Tool

### Sprint E6 — Plattform (6 Wochen)
- [ ] Plugin-System (Plugin-API, Registry, Hooks)
- [ ] 3 First-Party Plugins (Slack, Stripe, Linear)
- [ ] Multi-Tenant-Cloud-Architektur (RLS, S3-Isolation)
- [ ] Billing-Integration (Stripe Subscriptions)
- [ ] Cross-Customer Intelligence (Medallion Architecture, k-Anonymität)

---

## Erweiterte Kill-Conditions

| Kill | Bedingung | Wahrscheinlichkeit | Hedge |
|---|---|---|---|
| KILL 1 | MCP-Standard wird fragmentiert | Nahezu null | REST-Fallback bereits implementiert |
| KILL 2 | LanceDB Scale (>100k Kunden) | Niedrig (benchmarken bei 10k) | Markdown ist Source of Truth — DB austauschbar |
| KILL 3 | Gut finanzierter Local-First-MCP-Konkurrent | Mittel in 18 Monaten | Open Source Community-Moat + Plugin-Ökosystem |
| KILL 4 | Google/Microsoft schließen Transcript-APIs | Niedrig | Whisper local als Fallback; Audio-Recording ist Ersatz |
| KILL 5 | GDPR-Audit deckt Lücke auf (LanceDB nicht gelöscht) | Aktuell — Sprint E1 beheben | Bis Fix: GDPR-Erasure manuell via `dxcrm gdpr erase --force-lancedb` |
| KILL 6 | Enterprise-Security-Review scheitert wegen fehlender SSO | Mittel — Sprint E4 | WorkOS als Fallback-SSO-Provider |

---

## Erweitertes Ersetzungsvertrauen

| Aktuelles CRM | Phase 1–5 | +Domino 6 | +Domino 7 | +Domino 8 | +Domino 9 | +Domino 10 |
|---|---|---|---|---|---|---|
| Notion/Spreadsheet | **99%** | 99% | 99% | 99% | 99% | 99% |
| HubSpot Free/Starter | **90%** | 96% | 99% | 99% | 99% | 99% |
| Pipedrive Essentials | **80%** | 90% | 97% | 99% | 99% | 99% |
| HubSpot Professional | 30% | 65% | 88% | 94% | 97% | 99% |
| Zoho Professional | 30% | 60% | 85% | 90% | 94% | 97% |
| Salesforce Enterprise | 5% | 25% | 55% | 75% | 85% | **92%** |
| Microsoft Dynamics | 5% | 30% | 60% | 78% | 88% | **93%** |

---

## Wettbewerbspositionierung (Erweitert)

```
                    LOCAL-FIRST / SELF-HOSTED
                              ▲
               DatasynxOpenCRM ● (Enterprise)
                              │
    CLOUD ────────────────────┼──────────────────── FILE SYSTEM
    (SaaS)                    │                     (Owned data)
    Salesforce ●      Twenty ●│
    HubSpot ●         Attio ●─┤
    Dynamics ●                │
                        DatasynxOpenCRM ● (Solo/Team)
                              ▼
                         AGENT-NATIVE
```

| | Salesforce | HubSpot | Dynamics | **dxcrm Enterprise** |
|---|---|---|---|---|
| **Local-first** | ✗ | ✗ | ✗ | **✓** |
| **npm install** | ✗ | ✗ | ✗ | **✓** |
| **MCP-native** | Bolt-on | Erstes großes MCP | ✗ | **✓ von Tag 1** |
| **10-CRM-Import** | Eigenes | Eigenes | Eigenes | **✓ alle 10** |
| **Teams-Transkripte** | Extra-Kosten | Nein | Teilweise | **✓ nativ** |
| **Meet-Transkripte** | Nein | Nein | Nein | **✓ nativ** |
| **GDPR-Moat** | Cloud, komplex | Cloud, komplex | Cloud | **✓ Daten verlassen Gerät nie** |
| **Kosten** | $300+/User/Mo | $90+/User/Mo | $65+/User/Mo | **$0 (self-hosted)** |
| **Plugin-Ecosystem** | App Exchange | App Marketplace | AppSource | **✓ npm-Ökosystem** |

---

*DatasynxOpenCRM Enterprise v1.0 — Kein CRM-Ersatz. Eine CRM-Ersetzungsinfrastruktur.*
*Basierend auf plan.md v4 (vollständig implementiert, 566 Tests grün).*
*Ziel: Ein 500-Personen-Sales-Team verlässt Salesforce mit einem Befehl.*
