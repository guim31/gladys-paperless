# Paperless-ngx for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
follows [Paperless-ngx](https://docs.paperless-ngx.com), the self-hosted
document manager (scan, OCR, filing), through its REST API, over the local
network. No cloud, no account. **Read only**: it never changes a document.

> **Tested against real Paperless-ngx servers, not yet in a real Gladys:
> feedback welcome.** The integration was run against the official Docker
> images of Paperless-ngx 3.3.1 and 2.20.6, through the fake Gladys of the
> integration SDK. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-paperless/issues).

## Features

- **One device "Paperless-ngx"**: online, total documents, **documents in the
  inbox** (carrying an inbox tag), documents added today, tasks in progress,
  **failed tasks** (not dismissed in Paperless-ngx), correspondents, document
  types, tags, free storage (administrator token), update available, version.
- **Dashboard widget** "Paperless-ngx inbox": documents to sort, added today,
  failed tasks, and the latest inbox documents with their correspondent and
  type (links to Paperless-ngx for an `https://` address).
- **Scene triggers**: _New document in Paperless-ngx_ (filters: correspondent,
  document type; variables: title, correspondent, type, tags, number, link),
  _New document with a tag_ (one event per tag, filter on the tag), _Document
  processing failed_ (file name, error).
- A **Test the connection** button in the Configuration screen, a connection
  status that names the problem (token refused, certificate, redirect…), and
  a **transport badge** (local or unreachable).
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets and scene triggers).
- **Paperless-ngx 2.x or 3.x** reachable from Gladys (tested: 2.20.6, 3.3.1).
- An **API token** (Paperless-ngx → My Profile → API Auth Token). The
  integration sees what the token's user sees; an administrator's token adds
  the free storage.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-paperless`
   (or install **Paperless-ngx** from the catalog once it is listed).
2. In **Configuration**, enter the address of Paperless-ngx
   (`http://192.168.1.2:8000`, `https://paperless.example`…) and the API
   token. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every request is a `GET` with `Authorization: Token …`. Each refresh
  interval (30 s to 5 min, 1 min by default): `/api/statistics/` (counts,
  inbox), `/api/documents/` twice (count of today's documents; the newest of
  the last 24 hours, `fields=` limited, without content), `/api/tasks/` twice
  (pending and started; failed and not acknowledged). `/api/status/` every 10
  minutes (storage, administrators only: a `403` is remembered),
  `/api/remote_version/` every 6 hours (Paperless-ngx asks GitHub; `0.0.0`
  means unknown, nothing is published). Names of correspondents, types and
  tags: `?id__in=` for the new documents only, cached one hour.
- Two API generations, told apart by the `X-Api-Version` header: 3.x
  (version 10: paginated tasks, lower-case statuses, `input_data` /
  `result_data`) and 2.x (version 9: a plain task list, `FAILURE`, `STARTED`,
  `task_file_name`, `result`). A 3.x server refuses the 2.x status values and
  the reverse: the filters follow the generation.
- New documents: the highest document id seen is kept in
  `/data/paperless-state.json`; a document with a higher id fires the
  triggers (10 per reading at most, nothing older than 24 hours). Failed tasks
  are remembered by id (200 at most). The very first reading only sets the
  baseline; after a restart, what was added meanwhile is announced.
- The device is published with `should_poll: false`: the container reads on
  its own timer (Gladys does not poll external devices reliably,
  GladysAssistant/Gladys#3198), the scene events fire even when the device was
  not added, and the core's `onPoll` only reads when the timer has not for
  half an interval. Only the changed values are sent (the SDK's
  `publishChangedStates`), every value again after 12 hours, when the device
  is added and when Gladys reconnects.
- "Offline" after two failed readings in a row (the second 15 s after the
  first). A refused token is a configuration problem, shown in the connection
  status, not "offline".
- HTTP(S) runs on `node:http` / `node:https` (a self-signed certificate is
  accepted only when the option is ticked). The token stays in the Gladys
  configuration; it is never logged, nor are document titles.

## Checked on real servers, and what was not

The official images `paperlessngx/paperless-ngx:latest` (3.3.1) and `:2.20.6`
ran in Docker in the development session, with Redis, and were filled through
their API (tags, correspondents, document types, PDF uploads, a broken PDF).
Their answers are recorded in `test/fixtures/paperless/real-*` (anonymized),
and `test/fake-paperless.test.js` keeps the fake server of the tests in the
same shape. `npm run test:real` drives the integration against a real server
(`PAPERLESS_TEST_URL`, `PAPERLESS_TEST_TOKEN`; skipped otherwise):

- checked on both versions: statistics, documents added today, new documents
  and their names, the three triggers with their variables, failed and
  running tasks, storage, version, a restart announcing what was added
  meanwhile; on 3.3.1, a non-administrator token (`/api/status/` refused, the
  documents of another owner invisible);
- not checked: an update actually available (the session could not reach
  GitHub: the servers answered `0.0.0`), Paperless-ngx behind a reverse proxy
  or a login portal, a sub-path (`PAPERLESS_FORCE_SCRIPT_NAME`), and
  everything on the Gladys side (device, widget and scene cards in a real
  Gladys).

## Limitations

- One Paperless-ngx instance per Gladys.
- Read only: no upload, no tagging, no dismissing of failed tasks.
- Trigger filters compare exact names (Gladys scene filters are equality
  only).
- A tag added by hand after the document was seen does not fire _New document
  with a tag_.
- Paperless-ngx 1.x is not supported.
- Names ending in `.local` do not resolve inside the integration container:
  use IP addresses or names your DNS resolves.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
PAPERLESS_TEST_URL=http://localhost:8000 PAPERLESS_TEST_TOKEN=… npm run test:real
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Paperless-ngx (`test/helpers/fakePaperless.js`) answering in
the shape of both API generations. See [`CLAUDE.md`](CLAUDE.md) for the project
rules.

## Credits

- [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) (GPL-3.0):
  its API documentation and the behaviour of its official Docker images; the
  translations of its interface gave the words of the feature names. No code
  was copied.
- Home Assistant's
  [`paperless_ngx`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/paperless_ngx)
  integration (Apache-2.0): the choice of sensors and its test fixtures
  (`test/fixtures/paperless/home-assistant/`).
- [pypaperless](https://github.com/tb1337/paperless-api) by tb1337 (MIT): the
  API models and its test data (`test/fixtures/paperless/pypaperless/`).
- The architecture and the conformity tests follow
  [gladys-pihole](https://github.com/guim31/gladys-pihole),
  [gladys-subsonic](https://github.com/guim31/gladys-subsonic) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the
Paperless-ngx project.

## License

Apache-2.0
