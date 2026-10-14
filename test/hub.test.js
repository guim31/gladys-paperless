// -----------------------------------------------------------------------------
// The hub against the fake Paperless-ngx, both API generations: states, scene
// events (new document, tagged document, failed processing), what survives a
// restart, connection status and transport, configuration changes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import { MAX_EVENTS_PER_CYCLE, TRIGGERS, startOfDay } from '../src/hub.js';
import {
  FakePaperless,
  URL_1,
  createAll,
  createClock,
  createWorld,
  defaultConfig,
  deviceId,
  featureId,
  seededServer,
} from './helpers/world.js';

const K = FEATURE_KEYS;
const state = (w, key) => w.fake.lastState(featureId(w.gladys, key));
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

for (const generation of [3, 2]) {
  test(`publishes the figures of Paperless-ngx ${generation}.x`, async (t) => {
    const clock = createClock();
    const server = seededServer(clock, { generation });
    server.addTask({ status: 'started' });
    const w = await world(t, { clock, server });

    assert.equal(state(w, K.ONLINE), 1);
    assert.equal(state(w, K.DOCUMENTS), 3);
    assert.equal(state(w, K.INBOX), 3, 'every new document gets the inbox tag');
    assert.equal(state(w, K.ADDED_TODAY), 3);
    assert.equal(state(w, K.TASKS_RUNNING), 1);
    assert.equal(state(w, K.TASKS_FAILED), 1);
    assert.equal(state(w, K.CORRESPONDENTS), 2);
    assert.equal(state(w, K.DOCUMENT_TYPES), 2);
    assert.equal(state(w, K.TAGS), 3);
    assert.equal(state(w, K.STORAGE_FREE), 25.52);
    assert.equal(state(w, K.VERSION), server.version);
    assert.equal(state(w, K.UPDATE), undefined, 'the server does not know its latest release');
    assert.deepEqual(w.fake.connectionStatus, { connected: true });
    assert.deepEqual(w.fake.transports.at(-1), {
      device_external_id: deviceId(w.gladys),
      transport: 'local',
    });
  });

  test(`announces a new document, its tags and a failed processing (${generation}.x)`, async (t) => {
    const clock = createClock();
    const server = seededServer(clock, { generation });
    const w = await world(t, { clock, server });
    assert.deepEqual(w.fake.sceneEvents, [], 'what exists at the first reading is not announced');

    clock.advance(60_000);
    const id = server.addDocument({
      title: 'Facture EDF novembre',
      correspondent: 1,
      documentType: 1,
      tags: [2],
    });
    server.failConsumption('scan-0042.pdf');
    await w.hub.pollNow();

    const data = {
      title: 'Facture EDF novembre',
      correspondent: 'EDF',
      document_type: 'Facture',
      tags: 'Inbox, Urgent',
      document_id: id,
      url: `${URL_1}/documents/${id}/details`,
    };
    assert.deepEqual(events(w, TRIGGERS.DOCUMENT_ADDED), [{ key: TRIGGERS.DOCUMENT_ADDED, data }]);
    assert.deepEqual(
      events(w, TRIGGERS.DOCUMENT_TAGGED).map((event) => event.data),
      [
        { ...data, tag: 'Inbox' },
        { ...data, tag: 'Urgent' },
      ],
    );
    assert.deepEqual(events(w, TRIGGERS.PROCESSING_FAILED), [
      {
        key: TRIGGERS.PROCESSING_FAILED,
        data: {
          file_name: 'scan-0042.pdf',
          error:
            'scan-0042.pdf: Error occurred while consuming document scan-0042.pdf: InputFileError:',
        },
      },
    ]);
    assert.equal(state(w, K.TASKS_FAILED), 2);

    // Nothing twice.
    await w.hub.pollNow();
    assert.equal(w.fake.sceneEvents.length, 4);
  });
}

test('a document without correspondent, type or tags is announced with empty values', async (t) => {
  const clock = createClock();
  const server = new FakePaperless({ now: clock.now });
  server.tags = []; // no inbox tag either
  const w = await world(t, { clock, server });
  const id = server.addDocument({});
  await w.hub.pollNow();
  assert.deepEqual(w.fake.sceneEvents, [
    {
      key: TRIGGERS.DOCUMENT_ADDED,
      data: {
        title: `scan-${id}`,
        correspondent: null,
        document_type: null,
        tags: '',
        document_id: id,
        url: `${URL_1}/documents/${id}/details`,
      },
    },
  ]);
  assert.equal(state(w, K.INBOX), 0, 'no inbox tag: nothing in the inbox');
});

test('the names are read once, then from the cache', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  const nameReads = () => server.requests.filter((r) => r.path.endsWith('/correspondents/')).length;
  server.addDocument({ title: 'A', correspondent: 1 });
  await w.hub.pollNow();
  server.addDocument({ title: 'B', correspondent: 1 });
  await w.hub.pollNow();
  assert.equal(nameReads(), 1);
  // A renamed correspondent is seen once the cache expires.
  server.correspondents[0].name = 'EDF Particuliers';
  clock.advance(61 * 60_000);
  server.addDocument({ title: 'C', correspondent: 1 });
  await w.hub.pollNow();
  assert.equal(events(w, TRIGGERS.DOCUMENT_ADDED).at(-1).data.correspondent, 'EDF Particuliers');
});

test('names unreadable: the documents are announced at the next reading', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  server.addDocument({ title: 'Facture', correspondent: 1 });
  const route = server.route.bind(server);
  server.route = (path, query) =>
    path === 'correspondents/' ? { status: 500, headers: {}, body: '' } : route(path, query);
  await w.hub.pollNow();
  assert.equal(events(w, TRIGGERS.DOCUMENT_ADDED).length, 0);
  server.route = route;
  await w.hub.pollNow();
  assert.equal(events(w, TRIGGERS.DOCUMENT_ADDED).length, 1);
  assert.equal(events(w, TRIGGERS.DOCUMENT_ADDED)[0].data.correspondent, 'EDF');
});

test('a restart announces what was added meanwhile, and nothing already announced', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const first = await createWorld({ clock, server });
  server.addDocument({ title: 'Before the stop' });
  await first.hub.pollNow();
  assert.equal(events(first, TRIGGERS.DOCUMENT_ADDED).length, 1);
  await first.app.stop();

  clock.advance(30 * 60_000);
  server.addDocument({ title: 'While stopped' });
  server.failConsumption('while-stopped.pdf');
  const second = await world(t, { clock, server, dataDir: first.dataDir });
  assert.deepEqual(
    events(second, TRIGGERS.DOCUMENT_ADDED).map((event) => event.data.title),
    ['While stopped'],
  );
  assert.deepEqual(
    events(second, TRIGGERS.PROCESSING_FAILED).map((event) => event.data.file_name),
    ['while-stopped.pdf'],
  );
});

test('after a long stop, only the last day is announced', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const first = await createWorld({ clock, server });
  await first.app.stop();
  server.addDocument({ title: 'Two days ago' });
  clock.advance(48 * 3600_000);
  server.addDocument({ title: 'Today' });
  const second = await world(t, { clock, server, dataDir: first.dataDir });
  assert.deepEqual(
    events(second, TRIGGERS.DOCUMENT_ADDED).map((event) => event.data.title),
    ['Today'],
  );
});

test('a bulk import starts the scenes for the newest documents only', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  for (let i = 1; i <= 30; i += 1) {
    server.addDocument({ title: `Import ${i}` });
  }
  await w.hub.pollNow();
  const titles = events(w, TRIGGERS.DOCUMENT_ADDED).map((event) => event.data.title);
  assert.equal(titles.length, MAX_EVENTS_PER_CYCLE);
  assert.equal(titles.at(-1), 'Import 30');
  await w.hub.pollNow();
  assert.equal(events(w, TRIGGERS.DOCUMENT_ADDED).length, MAX_EVENTS_PER_CYCLE, 'not later either');
});

test('a dismissed failure lowers the count and is never announced again', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  const task = server.failConsumption('again.pdf');
  await w.hub.pollNow();
  assert.equal(state(w, K.TASKS_FAILED), 2);
  server.acknowledge(task);
  await w.hub.pollNow();
  assert.equal(state(w, K.TASKS_FAILED), 1);
  assert.equal(events(w, TRIGGERS.PROCESSING_FAILED).length, 1);
});

test('documents added today are counted from local midnight', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  assert.equal(state(w, K.ADDED_TODAY), 3);
  clock.time = startOfDay(clock.time).getTime() + 24 * 3600_000 + 60_000; // just after midnight
  await w.hub.pollNow();
  assert.equal(state(w, K.ADDED_TODAY), 0);
  server.addDocument({ title: 'Morning scan' });
  await w.hub.pollNow();
  assert.equal(state(w, K.ADDED_TODAY), 1);
});

test('an update is published when the server knows a newer release', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  server.remoteVersion = 'v3.4.0';
  const w = await world(t, { clock, server });
  assert.equal(state(w, K.UPDATE), 1);
  const report = (await w.fake.action('test_connection', {})).data.message;
  assert.match(report.en, /Version 3\.4\.0 is available/);

  server.version = '3.4.0';
  clock.advance(7 * 3600_000);
  await w.hub.pollNow();
  assert.equal(state(w, K.UPDATE), 0);
  assert.equal(state(w, K.VERSION), '3.4.0');
});

test('the update check can be turned off: GitHub is never asked', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  server.remoteVersion = 'v3.4.0';
  const w = await world(t, { clock, server, config: defaultConfig({ check_updates: false }) });
  assert.equal(state(w, K.UPDATE), undefined);
  assert.equal(server.requests.filter((r) => r.path.endsWith('/remote_version/')).length, 0);
});

test('a token without administrator rights: everything but the storage', async (t) => {
  const clock = createClock();
  const server = seededServer(clock, { admin: false });
  const w = await world(t, { clock, server });
  assert.equal(state(w, K.DOCUMENTS), 3);
  assert.equal(state(w, K.STORAGE_FREE), undefined);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  clock.advance(60 * 60_000);
  await w.hub.pollNow();
  assert.equal(
    server.requests.filter((r) => r.path.endsWith('/status/')).length,
    1,
    'a refused status is not asked again',
  );
  const report = (await w.fake.action('test_connection', {})).data.message;
  assert.match(report.fr, /n'est pas celui d'un administrateur/);
});

test('the storage is read every 10 minutes, not at every reading', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  const reads = () => server.requests.filter((r) => r.path.endsWith('/status/')).length;
  for (let i = 0; i < 5; i += 1) {
    clock.advance(60_000);
    await w.hub.pollNow();
  }
  assert.equal(reads(), 1);
  server.storage.available = 10e9;
  clock.advance(6 * 60_000);
  await w.hub.pollNow();
  assert.equal(reads(), 2);
  assert.equal(state(w, K.STORAGE_FREE), 10);
});

test('a refused token: connection status, nothing else published', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server, config: defaultConfig({ token: 'wrong' }) });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /API token refused/);
  assert.equal(state(w, K.ONLINE), undefined, 'Paperless-ngx answers: not offline');
  assert.equal(state(w, K.DOCUMENTS), undefined);
});

test('Paperless-ngx down: offline after the retry, back with the next reading', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  await createAll(w);
  server.online = false;
  await w.hub.pollNow();
  assert.equal(state(w, K.ONLINE), 1, 'one failure may be a blip');
  await w.hub.pollNow();
  assert.equal(state(w, K.ONLINE), 0);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys),
    transport: 'unreachable',
  });
  assert.match(w.fake.connectionStatus.message.fr, /ne répond pas/);

  server.online = true;
  await w.hub.pollNow();
  assert.equal(state(w, K.ONLINE), 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys),
    transport: 'local',
  });
});

test('connection status before any address, without token, with a bad address', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match(empty.fake.connectionStatus.message.en, /Enter the address/);
  assert.deepEqual(empty.fake.discoveredDevices, []);

  const noToken = await world(t, { config: { url: URL_1 } });
  assert.match(noToken.fake.connectionStatus.message.en, /API Auth Token/);
  assert.equal(noToken.fake.discoveredDevices.length, 1, 'the device is proposed already');

  const bad = await world(t, { config: { url: 'ftp://192.0.2.10', token: 'x' } });
  assert.match(bad.fake.connectionStatus.message.en, /Address not understood/);
});

test('an HTML page or a login portal at the address is reported as such', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  server.html = true;
  const w = await world(t, { clock, server });
  assert.match(w.fake.connectionStatus.message.en, /no Paperless-ngx API/);
  server.html = false;
  server.handle = async () => ({
    status: 302,
    headers: { location: 'https://auth.example/login?rd=secret' },
    body: '',
  });
  await w.hub.pollNow();
  assert.match(w.fake.connectionStatus.message.en, /redirects/);
});

test('adding the device in Gladys sends every state again', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  const before = w.fake.states.length;
  await createAll(w);
  assert.ok(w.fake.states.length >= before + 11, 'every known state is sent again');
  assert.ok(w.fake.widgetRefreshes.includes('inbox'));
});

test('only the changes are published, and every value again after 12 h', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  const count = () => w.fake.states.length;
  const before = count();
  clock.advance(60_000);
  await w.hub.pollNow();
  assert.equal(count(), before, 'nothing changed, nothing sent');
  server.addDocument({ title: 'New' });
  await w.hub.pollNow();
  assert.equal(count(), before + 3, 'documents, inbox, added today');
  // The SDK's heartbeat works on the real clock: the test checks the option.
  const calls = [];
  const original = w.gladys.publishChangedStates.bind(w.gladys);
  w.gladys.publishChangedStates = (states, options) => {
    calls.push(options);
    return original(states, options);
  };
  await w.hub.pollNow();
  assert.deepEqual(calls, [{ heartbeat: 12 * 3600_000 }]);
});

test('a new address or token starts over, without announcing the other instance', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  const other = seededServer(clock, { generation: 2 });
  other.addDocument({ title: 'Already there' });
  w.server.handle = other.handle.bind(other);
  await w.fake.configUpdated(defaultConfig({ url: 'https://paperless.example' }));
  assert.equal(w.fake.sceneEvents.length, 0);
  assert.equal(state(w, K.DOCUMENTS), 4);
  assert.equal(state(w, K.VERSION), '2.20.6');
  const [device] = w.fake.discoveredDevices;
  assert.deepEqual(device.params, [{ name: 'PAPERLESS_URL', value: 'https://paperless.example' }]);
  assert.equal(device.external_id, deviceId(w.gladys), 'same device: the history stays');
});

test('the feature names follow the configured language', async (t) => {
  const w = await world(t, { config: defaultConfig({ language: 'fr' }) });
  const names = w.fake.discoveredDevices[0].features.map((feature) => feature.name);
  assert.ok(names.includes('Documents dans la boîte de réception'));
  assert.ok(names.includes('Tâches en échec'));
});

test('a reconnection of Gladys sends everything again', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.ok(w.fake.states.length >= before + 11);
});

test('the scan request publishes the device again', async (t) => {
  const w = await world(t);
  w.fake.discoveredDevices.length = 0;
  await w.fake.scanRequest();
  assert.equal(w.fake.discoveredDevices.length, 1);
});

test('a new configuration during a reading reads the new instance at once', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  const original = server.handle.bind(server);
  const other = seededServer(clock, { generation: 2 });
  other.addDocument({ title: 'Other instance' });
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  let stuck = false;
  // One fake network: the old address answers late when `stuck`, the new one at once.
  server.handle = async (url, options) => {
    if (url.startsWith('https://paperless.example')) {
      return other.handle(url, options);
    }
    if (stuck) {
      await slow;
    }
    return original(url, options);
  };
  const w = await world(t, { clock, server });
  stuck = true;
  const reading = w.hub.pollNow();
  await w.fake.configUpdated(defaultConfig({ url: 'https://paperless.example' }));
  assert.equal(state(w, K.DOCUMENTS), 4, 'the new instance was read');
  release();
  await reading;
  assert.equal(state(w, K.DOCUMENTS), 4, 'the old reading changed nothing');
  assert.equal(state(w, K.VERSION), '2.20.6');
});
