// -----------------------------------------------------------------------------
// The reading timer of the container. Gladys 5.2.x does not poll external
// devices reliably (GladysAssistant/Gladys#3198), and never polls a device
// published with should_poll: false: the states must refresh through the
// hub's own timer, with no onPoll at all. The core's onPoll stays a fallback
// that does not double the readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import {
  createAll,
  createClock,
  createWorld,
  defaultConfig,
  featureId,
  seededServer,
} from './helpers/world.js';

/** Let the timer callback and the fake server settle. */
const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

async function timedWorld(t, config = defaultConfig({ poll_interval: '60' })) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock();
  const server = seededServer(clock);
  const w = await createWorld({ clock, server, config, timers: true });
  t.after(() => w.app.stop());
  const reads = () => server.requests.filter((r) => r.path.endsWith('/statistics/')).length;
  return { ...w, server, clock, reads };
}

test('the internal timer refreshes the states without any onPoll from Gladys', async (t) => {
  const w = await timedWorld(t);
  const polled = t.mock.method(w.hub, 'pollDevice');
  await createAll(w);

  const device = w.fake.discoveredDevices[0];
  assert.equal(device.should_poll, false, 'Gladys is not asked to poll');
  assert.equal(device.poll_frequency, undefined);
  const before = w.reads();

  for (const title of ['A', 'B', 'C']) {
    w.server.addDocument({ title });
    w.clock.advance(60_000);
    t.mock.timers.tick(60_000);
    await settle();
  }
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.DOCUMENTS)), 6);
  assert.equal(w.reads() - before, 3, 'one reading per interval');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('the interval of the configuration is honored', async (t) => {
  const w = await timedWorld(t, defaultConfig({ poll_interval: '300' }));
  const before = w.reads();
  t.mock.timers.tick(299_000);
  await settle();
  assert.equal(w.reads(), before);
  t.mock.timers.tick(1_000);
  await settle();
  assert.equal(w.reads(), before + 1);
});

test('a failed reading is tried again after 15 s, then at the interval', async (t) => {
  const w = await timedWorld(t);
  w.server.online = false;
  t.mock.timers.tick(60_000);
  await settle();
  const failed = w.server.requests.length;
  t.mock.timers.tick(15_000);
  await settle();
  assert.equal(w.server.requests.length, failed + 1, 'the retry');
  assert.equal(w.fake.lastState(featureId(w.gladys, FEATURE_KEYS.ONLINE)), 0);
});

test("the core's onPoll reads only when the timer has not read for half an interval", async (t) => {
  const w = await timedWorld(t);
  const device = w.fake.discoveredDevices[0];
  const before = w.reads();
  w.clock.advance(10_000);
  assert.deepEqual(await w.fake.poll(device), { success: true });
  assert.equal(w.reads(), before, 'just read by the timer: skipped');
  w.clock.advance(30_000);
  await w.fake.poll(device);
  assert.equal(w.reads(), before + 1, 'the timer stalled: the core takes over');
});

test('the timer stops with the integration', async (t) => {
  const w = await timedWorld(t);
  await w.app.stop();
  const before = w.server.requests.length;
  t.mock.timers.tick(10 * 60_000);
  await settle();
  assert.equal(w.server.requests.length, before);
});
