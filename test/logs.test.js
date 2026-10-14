// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the API token, nor anything of the config
// that is secret.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN, createClock, createWorld, defaultConfig, seededServer } from './helpers/world.js';

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const clock = createClock();
  const server = options.server ?? seededServer(clock);
  const w = await createWorld({ clock, server, ...options });
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('Connected to Paperless-ngx 3.3.1')),
    'the start is logged',
  );
  logs.clear();

  for (let i = 0; i < 5; i += 1) {
    w.server.addDocument({ title: `Scan ${i}`, correspondent: 1, tags: [2] });
    w.server.failConsumption(`broken-${i}.pdf`);
    w.server.storage.available -= 1e9;
    w.clock.advance(15 * 60_000); // the storage and the names are read again too
    await w.hub.pollNow();
    await w.fake.widgetGet('inbox', { settings: {}, language: 'en' });
  }
  assert.ok(w.fake.sceneEvents.length >= 15, 'scene events were fired');
  assert.deepEqual(logs.texts(), []);
});

test('Paperless-ngx down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();

  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollNow();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');

  logs.clear();
  w.server.online = true;
  await w.hub.pollNow();
  await w.hub.pollNow();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again after 5 min/);
});

test('a refused token is logged once, and never written', async (t) => {
  const logs = captureLogs(t, 'debug');
  const secret = 'f00dfeedc0ffee0123456789abcdef0123456789';
  const w = await world(t, { config: defaultConfig({ token: secret }) });
  for (let i = 0; i < 5; i += 1) {
    await w.hub.pollNow();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.ok(!logs.texts().join('\n').includes(secret), 'never the token');
});

test('no secret of the configuration in the logs, even at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  w.server.addDocument({ title: 'Payslip', correspondent: 1 });
  await w.hub.pollNow();
  await w.fake.action('test_connection', {});
  w.server.online = false;
  await w.hub.pollNow();
  await w.hub.pollNow();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\]/);
  assert.ok(!text.includes(TOKEN), 'never the token');
  assert.ok(!text.includes('Payslip'), 'never a document title');
});

test('a redirect is logged without its query string', async (t) => {
  const logs = captureLogs(t);
  const clock = createClock();
  const server = seededServer(clock);
  server.handle = async () => ({
    status: 302,
    headers: { location: 'https://sso.example/login?token=abc123' },
    body: '',
  });
  await world(t, { clock, server });
  const text = logs.texts().join('\n');
  assert.match(text, /Redirected to https:\/\/sso\.example\/login/);
  assert.ok(!text.includes('abc123'));
});

test('a failing update check is logged once, not at every reading', async (t) => {
  const logs = captureLogs(t);
  const clock = createClock();
  const server = seededServer(clock);
  const route = server.route.bind(server);
  server.route = (path, query) =>
    path === 'remote_version/' ? { status: 502, headers: {}, body: '' } : route(path, query);
  const w = await world(t, { clock, server });
  logs.clear();
  for (let i = 0; i < 4; i += 1) {
    w.clock.advance(7 * 3600_000);
    await w.hub.pollNow();
  }
  assert.deepEqual(logs.texts(), []);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.server.addDocument({});
    await w.hub.pollNow();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused/);
});
