# Paperless-ngx

Follow your [Paperless-ngx](https://docs.paperless-ngx.com) document server
from Gladys, over your local network: how many documents wait in the inbox,
what was scanned today, whether a scan failed — and start a scene when a new
document arrives, for example "an EDF invoice just came in".

The integration only **reads**: it never creates, changes or deletes a
document, a tag or a task in Paperless-ngx.

> **Tested against real Paperless-ngx servers, not yet in a real Gladys:
> feedback welcome.** The integration was developed and tested against the
> official Docker images of Paperless-ngx 3.3.1 and 2.20.6, and against the
> fake Gladys of the integration SDK. If something does not work as
> described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-paperless/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- **Paperless-ngx 2.x or 3.x**, reachable from Gladys (tested: 2.20.6 and
  3.3.1).
- An **API token** of a Paperless-ngx user. In Paperless-ngx, click your name
  (top right) → **My Profile** → **API Auth Token**: create it if there is
  none, then copy it.

The integration sees what this user sees: the documents they own or that are
shared with them, their tasks and the unowned ones. Use the token of the user
whose documents you want to follow; an **administrator's** token also gives
the free storage, which Paperless-ngx shows to administrators only.

## Set up

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Paperless-ngx address** (for example
   `http://192.168.1.2:8000`, the address you open Paperless-ngx with) and
   the **API token**.
3. Save, then click **Test the connection**: the message under the button
   gives the version, the number of documents and of tasks.
4. Open the **Discover** tab: the **Paperless-ngx** device is there. Click
   **Add**, pick a room, save.

Options:

- **Accept self-signed certificates**: for an `https://` address served with
  your own certificate (a reverse proxy at home). Leave it off otherwise.
- **Refresh interval**: how often Paperless-ngx is read, from 30 seconds to 5
  minutes (1 minute by default).
- **Check for Paperless-ngx updates**: every 6 hours, Paperless-ngx asks
  GitHub for its latest release (on by default). Untick it and that question
  is never asked.
- **Language of the feature names**: English, French, German or Spanish. The
  names are given when the device is added (French by default).

## The Paperless-ngx device

| Feature               | What it is                                                                         |
| --------------------- | ---------------------------------------------------------------------------------- |
| Online                | 1 when Paperless-ngx answers, 0 after two failed readings in a row                 |
| Total documents       | Every document the user may see                                                    |
| Documents in inbox    | Documents carrying an inbox tag: still to be sorted                                |
| Documents added today | Documents added since midnight (Gladys' time zone)                                 |
| Tasks in progress     | Tasks waiting or running: scans being processed, scheduled jobs                    |
| Failed tasks          | Failed tasks not dismissed in Paperless-ngx (File Tasks → Failed → Dismiss)        |
| Correspondents        | Number of correspondents                                                           |
| Document types        | Number of document types                                                           |
| Tags                  | Number of tags                                                                     |
| Free storage          | Free space on the Paperless-ngx storage, in GB (administrator token only)          |
| Update available      | 1 when a newer Paperless-ngx release is out (nothing when GitHub is not reachable) |
| Version               | The Paperless-ngx version, as text                                                 |

Every number keeps its history in Gladys and can drive a scene ("when
_Documents in inbox_ goes above 10…").

## Dashboard

The **Paperless-ngx inbox** widget shows three tiles — documents to sort,
added today, failed tasks — and the latest documents of the inbox with their
correspondent and type (3, 5 or 8, from the widget settings). With an
`https://` address, each document links to Paperless-ngx, and an **Open
Paperless** button opens it; Gladys shows `https://` links only.

## Scenes

### Triggers

- **New document in Paperless-ngx**: a document was added (scan, email,
  upload). Filters: **Correspondent** and **Document type**, written exactly
  as in Paperless-ngx (capitals included); left empty, any document matches.
  The following actions can read `{{triggerEvent.data.title}}`,
  `correspondent`, `document_type`, `tags` (comma-separated),
  `document_id` and `url` (the link to the document in Paperless-ngx).
- **New document with a tag**: the same, once per tag of the new document.
  Filter: the **Tag** (required), and optionally the **Correspondent**. The
  variables are the same, plus `tag`. Paperless-ngx gives every new document
  its inbox tags: a scene on the "Inbox" tag starts for every new document.
- **Document processing failed**: Paperless-ngx could not process a file
  (unreadable scan, duplicate…) or one of its tasks failed. Variables:
  `file_name` and `error`.

The new documents are found by comparing their numbers with the last one
seen; the failed tasks by their number too. At most 10 events per trigger
and per reading (a bulk import does not start a scene a hundred times), and
nothing older than 24 hours. What already exists when the integration starts
for the first time is not announced; after a restart, the documents added
meanwhile are.

### Actions

The integration has no scene action: it only reads. The **Test the
connection** button of the Configuration screen reads Paperless-ngx at once
and shows a report.

### Scene ideas

- **"EDF invoice received"**: trigger _New document in Paperless-ngx_,
  Correspondent `EDF`, Document type `Invoice` → send a message "New EDF
  invoice: {{triggerEvent.data.title}}".
- **"Urgent mail"**: trigger _New document with a tag_, Tag `Urgent` → turn
  the hallway light orange.
- **"The scanner jammed"**: trigger _Document processing failed_ → send a
  message "Paperless could not process {{triggerEvent.data.file_name}}".
- **"Sorting reminder"**: every Saturday at 10:00, only continue if
  _Documents in inbox_ is above 0 → send a message.

## Requests sent to Paperless-ngx

At each reading (every minute by default): the statistics, the count of the
documents added today, the newest documents of the last 24 hours (25 at
most, without their content), the tasks in progress and the failed ones —
five light GET requests (six on Paperless-ngx 2.x). Every 10 minutes, the
system status (storage), and every 6 hours the latest release. The names of
correspondents, types and tags are read only for new documents and kept one
hour. Paperless-ngx sets no request quota; on a small NAS, pick a longer
refresh interval.

## Troubleshooting

- **"API token refused"**: copy the token again from My Profile; a token
  created again replaces the old one. A disabled user is refused too.
- **"Paperless-ngx does not answer"**: check the address and the port from
  the machine running Gladys (`curl http://192.168.1.2:8000/api/`).
- **"The address redirects"**: enter the `https://` address directly. A
  login portal (Authelia, Authentik…) in front of Paperless-ngx must let
  `/api/` through with the token.
- **"Certificate refused"**: tick _Accept self-signed certificates_.
- **"No Paperless-ngx API at this address"**: the address answers, but not
  with Paperless-ngx (a sub-path missing, another service on the port).
- **Free storage stays empty**: the token is not an administrator's.
- **0 documents while Paperless-ngx has many**: the token's user may not see
  them (documents owned by someone else): use another token, or share them.
- **Update available stays empty**: Paperless-ngx could not ask GitHub (no
  internet access on the server) or the check is turned off.
- More details: set `LOG_LEVEL=debug` on the container, the logs then show
  each reading. The token is never written in the logs.

## Limits

- One Paperless-ngx instance per installation of the integration.
- Read only: no upload, no tagging, no dismissing of failed tasks from Gladys.
- The trigger filters compare exact names: `EDF` does not match `edf`.
- A document is announced once, when it is first seen; a tag added later by
  hand does not start _New document with a tag_.
- Paperless-ngx 1.x is not supported.
- Not affiliated with the Paperless-ngx project.
